"""Дэд бүтэц — нөөцлөлт бүтэн эсэх, схемийн автомат шинэчлэл.

Эдгээр тест өөрсдийн түр engine/файл дээр ажиллана: conftest-ийн DB-д хүрэхгүй.
"""
import os
import sqlite3
import subprocess
import sys
from datetime import date
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.db import Base
from app.main import backup_db
from app.schema import migrate_schema


# ---------- Нөөцлөлт ----------
def test_backup_includes_wal_data(tmp_path):
    """WAL-д сууж буй дата нөөцөд ОРСОН байх ёстой.

    Бодит нөхцөл: jiguur.db 4КБ, харин jiguur.db-wal 770КБ. Хуучин shutil.copy2
    зөвхөн үндсэн файлыг хуулдаг тул нөөц хоосон бүрхүүл болдог байв.
    """
    src = str(tmp_path / "jiguur.db")
    bdir = str(tmp_path / "backups")
    conn = sqlite3.connect(src, isolation_level=None)   # autocommit
    assert conn.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
    conn.execute("CREATE TABLE nooc (id INTEGER PRIMARY KEY, ner TEXT)")
    conn.executemany("INSERT INTO nooc (ner) VALUES (?)",
                     [("Хэв",), ("Тулаас",), ("Труба",)])
    # checkpoint ХИЙХГҮЙ, холболтоо ч хаахгүй — дата -wal файлд сууж байна
    assert os.path.getsize(src + "-wal") > 0

    backup_db(src=src, bdir=bdir)

    newest = sorted(f for f in os.listdir(bdir) if f.endswith(".db"))[-1]
    with sqlite3.connect(os.path.join(bdir, newest)) as fresh:
        assert fresh.execute("SELECT COUNT(*) FROM nooc").fetchone()[0] == 3
    conn.close()


def test_backup_keeps_last_14(tmp_path):
    """Эргэлт: сүүлийн 14 нөөц үлдэж, хуучин нь устана."""
    src = str(tmp_path / "jiguur.db")
    bdir = tmp_path / "backups"
    bdir.mkdir()
    sqlite3.connect(src).execute("CREATE TABLE t (id INTEGER)")
    for i in range(20):
        (bdir / f"jiguur-20260101-{i:04d}.db").write_bytes(b"")

    backup_db(src=src, bdir=str(bdir))

    left = sorted(f.name for f in bdir.glob("*.db"))
    assert len(left) == 14
    assert "jiguur-20260101-0000.db" not in left      # хамгийн хуучин нь устсан
    assert "jiguur-20260101-0019.db" in left          # хамгийн шинэ нь үлдсэн


def test_import_with_temp_db_leaves_real_backups_untouched(tmp_path):
    """Түр DATABASE_URL-тэй импортлоход БОДИТ backups/ хавтас огт өөрчлөгдөхгүй.

    Регресс: pytest бүр conftest-ээр app.main-ийг импортлох үед тестийн түр DB
    system/backend/backups/ руу нөөцлөгдөж, 14-ийн эргэлтээр жинхэнэ хуучин
    нөөцүүдийг нэг нэгээр нь идэж байв. Нөөц DB файлынхаа ХАЖУУД очих ёстой.
    """
    backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    real_bdir = os.path.join(backend, "backups")

    def snapshot():
        if not os.path.isdir(real_bdir):
            return {}
        return {f: os.stat(os.path.join(real_bdir, f)).st_mtime_ns
                for f in os.listdir(real_bdir)}

    src = str(tmp_path / "temp.db")
    sqlite3.connect(src).execute("CREATE TABLE t (id INTEGER)")   # хоосон биш
    env = {**os.environ, "DATABASE_URL": "sqlite:///" + src}
    env.pop("JIGUUR_BACKUP_DIR", None)   # default замын логикийг шалгаж байна

    before = snapshot()
    r = subprocess.run([sys.executable, "-c", "import app.main"],
                       cwd=backend, env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert snapshot() == before                       # бодит хавтас хэвээрээ
    assert len(list((tmp_path / "backups").glob("jiguur-*.db"))) == 1


def test_backup_dir_env_override(tmp_path, monkeypatch):
    """JIGUUR_BACKUP_DIR заасан бол нөөц тийшээ очно — default-ыг дарна."""
    src = str(tmp_path / "jiguur.db")
    sqlite3.connect(src).execute("CREATE TABLE t (id INTEGER)")
    target = tmp_path / "elsewhere"
    monkeypatch.setenv("JIGUUR_BACKUP_DIR", str(target))

    backup_db(src=src)

    assert len(list(target.glob("jiguur-*.db"))) == 1
    assert not (tmp_path / "backups").exists()


# ---------- Схемийн шинэчлэл ----------
def _cols(engine, table):
    with engine.connect() as c:
        return {r[1] for r in c.exec_driver_sql(f'PRAGMA table_info("{table}")')}


def test_schema_migrate_adds_missing_columns(tmp_path):
    """Хүснэгт байгаа ч багана дутуу бол ALTER-оор нөхнө; хоёр дахь удаа юу ч хийхгүй."""
    engine = create_engine("sqlite:///" + str(tmp_path / "old.db"))
    with engine.begin() as c:
        c.exec_driver_sql("CREATE TABLE settings (key VARCHAR(50) PRIMARY KEY)")

    added = migrate_schema(engine)

    want = set(Base.metadata.tables["settings"].columns.keys())   # моделиос авна
    assert _cols(engine, "settings") == want
    assert added == ["settings.value"]
    # байхгүй ХҮСНЭГТ энэ модулийн ажил биш — create_all үүсгэнэ
    assert _cols(engine, "contracts") == set()
    # idempotent
    assert migrate_schema(engine) == []
    assert _cols(engine, "settings") == want
    engine.dispose()


def test_schema_migrate_renders_scalar_defaults(tmp_path):
    """Тогтмол default-тай багана нэмэхэд ХУУЧИН мөрүүд default-аараа дүүрнэ.

    Үе 2-ын `penalty_booked FLOAT 0` шууд үүнээс хамаарна: хуучин нэхэмжлэлүүд
    NULL биш 0 болж унах ёстой.
    """
    engine = create_engine("sqlite:///" + str(tmp_path / "old.db"))
    with engine.begin() as c:
        c.exec_driver_sql("CREATE TABLE contracts (id INTEGER PRIMARY KEY, no VARCHAR(30), "
                          "client_id INTEGER, type VARCHAR(10), start_date DATE)")
        c.exec_driver_sql("INSERT INTO contracts (id, no, client_id, type, start_date) "
                          "VALUES (1, '25/01', 1, 'rent', '2026-01-01')")

    migrate_schema(engine)

    with engine.connect() as c:
        row = c.exec_driver_sql(
            "SELECT penalty_percent, cycle_days, note, end_date, created_at "
            "FROM contracts WHERE id = 1").fetchone()
    # Float default. `penalty_percent`-ийн анхны утга 0.5 → 0 болов (алданги нь
    # ХӨШҮҮРЭГ — R25/H2), тул шалгаж буй зүйл нь утга биш ДҮРЭМ: DEFAULT
    # рендерлэгдсэн ⇒ хуучин мөр NULL БИШ, тодорхой тоо болж унана.
    assert row[0] is not None and row[0] == 0.0
    assert row[1] == 30           # Integer default
    assert row[2] == ""           # Text default
    assert row[3] is None         # nullable, default-гүй
    assert row[4] is None         # datetime.utcnow — SQL руу буудаггүй, INSERT дээр бөглөгдөнө
    engine.dispose()


def test_backfill_movement_line_rates(tmp_path):
    """Хуучин мөрүүдэд ПАДАНГИЙН тариф тамгалагдана.

    Түрээсийн олголт → гэрээний daily_rate (330), худалдааных → unit_price
    (58,000). Буцаалт NULL хэвээр (буцаалт тариф авч явдаггүй). Дахин
    ажиллуулахад аль хэдийн бичигдсэн тарифыг ДАРЖ БИЧИХГҮЙ.
    """
    engine = create_engine("sqlite:///" + str(tmp_path / "old.db"))
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as s:
        s.add_all([models.Grade(id=1, code="А", name="А", sort=1),
                   models.Material(id=1, name="Хэв хашмал 6012", category="Хэв",
                                   base_rate=330, repair_fee=15000),
                   models.Client(id=1, name="БЛҮҮМ")])
        s.flush()
        for cid, no, typ in ((1, "24/03", "rent"), (2, "26/06", "sale")):
            s.add(models.Contract(id=cid, no=no, client_id=1, type=typ,
                                  start_date=date(2026, 3, 20)))
            s.add(models.ContractItem(contract_id=cid, material_id=1, grade_id=1,
                                      daily_rate=330, unit_price=58000))
            s.add(models.Movement(id=cid, contract_id=cid, type="ISSUE",
                                  date=date(2026, 3, 20), status="done"))
            s.flush()
            s.add(models.MovementLine(movement_id=cid, material_id=1, grade_id=1, qty=100))
        # буцаалт — тарифгүй үлдэх ёстой
        s.add(models.Movement(id=3, contract_id=1, type="RETURN",
                              date=date(2026, 3, 21), status="done"))
        s.flush()
        s.add(models.MovementLine(movement_id=3, material_id=1, grade_id=1, qty=30))
        s.commit()

    migrate_schema(engine)

    def rates():
        with engine.connect() as c:
            return {r[0]: r[1] for r in c.exec_driver_sql(
                "SELECT id, rate FROM movement_lines ORDER BY id")}

    assert rates() == {1: 330.0, 2: 58000.0, 3: None}
    # idempotent — гараар засварласан тариф хэвээр үлдэнэ
    with engine.begin() as c:
        c.exec_driver_sql("UPDATE movement_lines SET rate = 400 WHERE id = 1")
    migrate_schema(engine)
    assert rates() == {1: 400.0, 2: 58000.0, 3: None}
    engine.dispose()


def test_schema_migrate_skips_non_sqlite():
    """Postgres дээр юу ч хийхгүй — тэнд схемийг гараар шинэчилнэ."""
    fake = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
    assert migrate_schema(fake) == []


def test_backfill_penalty_charges_rescues_legacy_bookings(tmp_path):
    """Үе M2: ХУУЧИН автомат нэхэлтүүд явдал болж, дахин бодолтод амьд үлдэнэ.

    Алданги урьд нь төлбөр бүртгэх агшинд ӨӨРӨӨ номжиж байсан тул хуучин
    DB-д `penalty_booked_until` тавигдсан нэхэмжлэлүүд байгаа ч ямар ч
    `PenaltyCharge` явдал байхгүй. Rebuild одоо ЯВДЛААР replay хийдэг тул
    нөхөхгүй бол эхний засварын үед тэдгээр нэхэлт ЧИМЭЭГҮЙ УСТАНА.

    Гэрээ × огноо бүрд НЭГ явдал; дахин ажиллуулахад давхардахгүй.
    """
    engine = create_engine("sqlite:///" + str(tmp_path / "old.db"))
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as s:
        s.add_all([models.Client(id=1, name="Идэр Зам"),
                   models.Contract(id=1, no="26/07", client_id=1, type="rent",
                                   start_date=date(2026, 3, 20), penalty_percent=0.5)])
        s.flush()
        # хоёр нэхэмжлэл нэг өдрөөр номжсон + нэг нь өөр өдрөөр
        for iid, no, booked, until in ((1, "R-26/07-1", 100.0, date(2026, 5, 21)),
                                       (2, "R-26/07-2", 216_750.0, date(2026, 5, 21)),
                                       (3, "R-26/07-3", 352_837.5, date(2026, 6, 25))):
            s.add(models.Invoice(id=iid, contract_id=1, no=no,
                                 cycle_start=date(2026, 3, 20), cycle_end=date(2026, 4, 19),
                                 due_date=date(2026, 4, 19), total=1000, paid=0,
                                 penalty_booked=booked, penalty_booked_until=until))
        # нэхэгдээгүй нэхэмжлэл явдал ҮҮСГЭХГҮЙ
        s.add(models.Invoice(id=4, contract_id=1, no="R-26/07-4",
                             cycle_start=date(2026, 6, 20), cycle_end=date(2026, 7, 20),
                             due_date=date(2026, 7, 20), total=1000, paid=0))
        s.commit()

    migrate_schema(engine)

    def charges():
        with engine.connect() as c:
            return [tuple(r) for r in c.exec_driver_sql(
                "SELECT contract_id, client_id, as_of, amount, user_name "
                "FROM penalty_charges ORDER BY as_of")]

    assert charges() == [
        (1, 1, "2026-05-21", 216_850.0, "(хуучин системээс)"),   # хоёр мөр НИЙЛЖ нэг явдал
        (1, 1, "2026-06-25", 352_837.5, "(хуучин системээс)"),
    ]
    # idempotent — дахин ажиллуулахад давхардахгүй
    migrate_schema(engine)
    assert len(charges()) == 2
    engine.dispose()


def test_penalty_charge_void_columns_are_added_by_the_migrator(tmp_path):
    """Алдангийн нэхэлтийн ХҮЧИНГҮЙ багана нь ALTER-ээр өөрөө нөхөгдөнө.

    Бусад гурван цуцлагддаг хүснэгттэй (төлбөр, хөдөлгөөн, акт, тариф) ЯГ
    ижил гурвал: `voided_at` (nullable), `void_reason`, `voided_by` (DEFAULT
    ''). Хуучин мөр NULL болж унахгүй — DEFAULT нь SQL руу буудаг.
    """
    path = str(tmp_path / "old.db")
    engine = create_engine("sqlite:///" + path)
    Base.metadata.create_all(engine)
    # Багануудыг «хуучин схем» болгож ХАСНА (SQLite 3.35+ DROP COLUMN)
    with engine.begin() as c:
        for col in ("voided_at", "void_reason", "voided_by"):
            c.exec_driver_sql(f'ALTER TABLE penalty_charges DROP COLUMN "{col}"')
        c.exec_driver_sql(
            "INSERT INTO penalty_charges (id, contract_id, client_id, as_of, amount,"
            " user_name, created_at) VALUES (1, 1, 1, '2026-05-21', 49500,"
            " 'Санхүүч', '2026-05-21 00:00:00')")

    added = migrate_schema(engine)
    assert {"penalty_charges.voided_at", "penalty_charges.void_reason",
            "penalty_charges.voided_by"} <= set(added)

    with engine.connect() as c:
        row = c.exec_driver_sql(
            "SELECT voided_at, void_reason, voided_by FROM penalty_charges"
        ).fetchone()
    assert row == (None, "", ""), "хуучин нэхэлт хүчинтэй хэвээр унах ёстой"
    engine.dispose()

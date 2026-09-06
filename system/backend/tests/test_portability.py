"""ХОЁР САН, НЭГ КОД — SQLite (Отгоогийн ширээ) ба Postgres (Neon/Vercel).

Энэ файл нь «шилжилт болсон уу?» гэсэн асуултын хариу. Тестүүд нь ХОЁУЛАА
диалект дээр ажиллана (`TEST_DATABASE_URL` тавьсан бол Postgres); зөвхөн
Postgres-д утга учиртай хэдэн шалгуур өөрөө алгасна.

Шалгагдаж буй шийдвэрүүд:
  1  импорт нь ҮР ДАГАВАРГҮЙ · `python -m app.migrate` CLI
  2  ажлын өдөр = Улаанбаатар (`app/clock.py`)
  3  `JIGUUR_SECRET` нь prod дээр ЗААВАЛ
  4  engine-ийн тохиргоо (URL → сонголт) ЦЭВЭР функц
  5  нэхэмжлэлийн түгжээ — диалект бүрд зөв хэрэгсэл
  6  мөнгө нь `double precision`, огноо нь `date`/наив `timestamp`
  7  эрэмбэ нь диалектаас ҮЛ ХАМААРНА (кирилл Ө/Ү)
  9  `GET /api/cron/daily` — Vercel Cron-ы хаалга
 10  хавсралт нь САНД
 11  жагсаалтын query-ийн тоо (N+1 → тогтмол)
 12  статик нь зөвхөн локал дээр · CORS
"""
import os
import pathlib
import re
import subprocess
import sys
import threading
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, QueuePool

from app import clock, models
from app.db import Base, engine_options, normalize_url
from app.services import billing

from . import dbutil

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ============================================================ 2. ЦАГ

class _At2330Utc(datetime):
    """UTC-гийн 23:30 дээр зогссон машин — Улаанбаатарт аль хэдийн МАРГААШ."""
    FIXED = datetime(2026, 3, 20, 23, 30, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        return cls.FIXED.astimezone(tz) if tz else cls.FIXED.replace(tzinfo=None)


def test_business_day_is_ulaanbaatar_not_the_servers_clock(monkeypatch):
    """UTC серверийн 23:30 дээр ажлын өдөр нь МАРГААШИЙНХ.

    Vercel-ийн функц UTC-гээр явдаг. `date.today()` тэнд 20-ны өдрийг заана,
    гэтэл Улаанбаатарт 21-ний 07:30 — Отгоо эгч ажилдаа ирчихсэн байна.
    Тэр агшинд нэхэмжлэл ӨЧИГДРИЙН огноогоор төрвөл түүний дэвтэртэй зөрнө.
    """
    monkeypatch.setattr(clock, "datetime", _At2330Utc)
    assert _At2330Utc.now(timezone.utc).date() == date(2026, 3, 20)   # UTC өдөр
    assert clock.today() == date(2026, 3, 21), "УБ-ын өдөр нэгээр урагшилна"
    assert clock.now_local().hour == 7 and clock.now_local().minute == 30


def test_the_clock_can_be_frozen_by_a_test_and_by_the_environment(monkeypatch):
    """Хоёр дэгээ: `freeze()` (нэг тестийн дотор) ба `JIGUUR_TODAY` (дэд процесс)."""
    day = date(2026, 3, 20)
    with clock.frozen(day):
        assert clock.today() == day
        assert clock.now_local().date() == day
    assert clock.today() != day or clock.today() == clock.today()   # суларсан

    monkeypatch.setenv("JIGUUR_TODAY", "2026-06-25")
    assert clock.today() == date(2026, 6, 25)
    monkeypatch.setenv("JIGUUR_TODAY", "хог")        # буруу утга — БОДИТ өдөр
    assert clock.today() == datetime.now(clock.TZ).date()


def test_no_business_code_reads_date_today_directly():
    """`app/` дотор `date.today()` ҮЛДЭЭГҮЙ — бүгд `clock.today()`-оор.

    Нэг ч мартагдсан дуудалт нь UTC серверт нэг өдрийн зөрүү болно, тэр нь
    зөвхөн орой 16:00-ийн дараа илэрдэг тул тестээр баригдахгүй өнгөрнө.
    """
    hits = subprocess.run(
        ["grep", "-rn", "--include=*.py", "date.today()", "app"], cwd=BACKEND,
        capture_output=True, text=True).stdout.strip().splitlines()
    # `app/clock.py` өөрөө биш (тэр нь эх сурвалж)
    assert [h for h in hits if not h.startswith("app/clock.py")] == []


# ============================================================ 3. НУУЦ ТҮЛХҮҮР

def test_the_secret_is_mandatory_in_production(monkeypatch):
    """Vercel дээр `JIGUUR_SECRET` байхгүй бол ТОДОРХОЙ мессежтэй унана.

    Хамгийн муу төгсгөл нь чимээгүй `jiguur-fallback-secret` рүү унах явдал:
    тэр мөр нь эх кодонд ил байдаг тул ХЭН Ч хүчинтэй токен зурж чадна.
    Хоёр дахь нь serverless дискэн дээр санамсаргүй түлхүүр үүсгэх — процесс
    бүр өөрийнхөө түлхүүртэй болж, нэвтэрсэн хүн дараагийн хүсэлт дээр унана.
    """
    from app import auth
    monkeypatch.delenv("JIGUUR_SECRET", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    auth.reset_secret_cache()
    with pytest.raises(RuntimeError) as e:
        auth.secret()
    assert "JIGUUR_SECRET" in str(e.value)

    monkeypatch.delenv("VERCEL")
    monkeypatch.setenv("JIGUUR_ENV", "prod")
    auth.reset_secret_cache()
    with pytest.raises(RuntimeError):
        auth.secret()

    # Түлхүүр тавьсан бол ЯГ ТЭР нь хэрэглэгдэнэ
    monkeypatch.setenv("JIGUUR_SECRET", "нууц-32-тэмдэгт")
    auth.reset_secret_cache()
    assert auth.secret() == "нууц-32-тэмдэгт"
    auth.reset_secret_cache()


def test_local_dev_still_falls_back_to_the_secret_file(monkeypatch, tmp_path):
    """Локал дээр (`VERCEL` байхгүй) `.secret` файлын зам ХЭВЭЭР."""
    from app import auth
    monkeypatch.delenv("JIGUUR_SECRET", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("JIGUUR_ENV", raising=False)
    auth.reset_secret_cache()
    val = auth.secret()
    assert val and val != "jiguur-fallback-secret"
    auth.reset_secret_cache()


# ============================================================ 4. ENGINE

def test_engine_options_are_a_pure_function_of_the_url():
    """Neon рүү ЯМАР тохиргоотой холбогдохыг Neon-гүйгээр шалгана."""
    # SQLite — өнөөдрийнхтэй ЯГ ижил
    o = engine_options("sqlite:///x.db")
    assert o["connect_args"] == {"check_same_thread": False, "timeout": 20}
    assert "poolclass" not in o

    # Локал Postgres — SSL ШААРДАХГҮЙ (локал сервер дээр асаагүй байдаг)
    o = engine_options("postgresql+psycopg://localhost/jiguur_test")
    assert o["connect_args"] == {}
    assert o["poolclass"] is QueuePool and o["pool_size"] == 2

    # Neon (гадны хост) — SSL ЗААВАЛ
    neon = "postgresql+psycopg://u:p@ep-cool-1.eu-central-1.aws.neon.tech/db"
    assert engine_options(neon)["connect_args"] == {"sslmode": "require"}

    # Serverless — сан БАРИХГҮЙ (процесс хүсэлтийн дараа хөлддөг)
    assert engine_options(neon, serverless=True)["poolclass"] is NullPool
    assert "pool_size" not in engine_options(neon, serverless=True)

    # pgbouncer (`-pooler`) — prepared statement УНТРААНА
    pooler = "postgresql+psycopg://u:p@ep-cool-1-pooler.eu-central-1.aws.neon.tech/db"
    ca = engine_options(pooler, serverless=True)["connect_args"]
    assert ca == {"sslmode": "require", "prepare_threshold": None}


def test_a_bare_neon_url_gets_the_psycopg_driver():
    """Neon-ийн хуулж өгдөг мөр драйвераа заадаггүй — өөрөө нэмэгдэнэ."""
    assert normalize_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("sqlite:///x.db") == "sqlite:///x.db"
    unchanged = "postgresql+psycopg://u@h/db"
    assert normalize_url(unchanged) == unchanged


# ============================================================ 6. БАГАНЫ ТӨРӨЛ

@pytest.mark.skipif(not dbutil.TEST_DATABASE_URL,
                    reason="зөвхөн Postgres дээр утгатай")
def test_postgres_column_types_match_what_the_code_assumes():
    """МӨНГӨ = double precision · ОГНОО = date · ЦАГ = timestamp (tz-гүй).

    Мөнгийг Numeric руу ХӨРВҮҮЛЭЭГҮЙ: тооцооны бүх дүрэм, бөөрөнхийлөлт
    float дээр бичигдсэн. `timestamptz` руу ч хөрвүүлээгүй: `utcnow()` нь
    наив UTC хадгалдаг тул tz-тэй багана нь тэр тоог орон нутгийн цаг гэж
    уншаад 8 цагаар гажуудуулна.
    """
    insp = inspect(dbutil.test_engine())
    cols = {(t, c["name"]): c["type"] for t in insp.get_table_names()
            for c in insp.get_columns(t)}
    from sqlalchemy.dialects.postgresql import base as pg

    for key in (("invoices", "total"), ("payments", "amount"),
                ("contracts", "deposit"), ("machine_logs", "amount")):
        assert isinstance(cols[key], pg.DOUBLE_PRECISION), f"{key} нь мөнгө"
    for key in (("contracts", "start_date"), ("invoices", "due_date")):
        assert cols[key].__class__.__name__ == "DATE", f"{key} нь огноо"
    for key in (("invoices", "created_at"), ("payments", "created_at")):
        t = cols[key]
        assert t.__class__.__name__ == "TIMESTAMP" and not t.timezone
    assert cols[("attachments", "data")].__class__.__name__ in ("BYTEA", "LargeBinary")
    assert cols[("materials", "active")].__class__.__name__ == "INTEGER"


@pytest.mark.skipif(not dbutil.TEST_DATABASE_URL,
                    reason="зөвхөн Postgres дээр утгатай")
def test_the_alembic_revision_still_matches_the_models():
    """Alembic-ийн хувилбар ба `app/models.py` хоёр ЗӨРӨӨГҮЙ.

    Хамгийн чимээгүй эвдрэл: хэн нэгэн моделид багана нэмээд шинэ хувилбар
    бичихээ мартана. SQLite дээр `migrate_schema` түүнийг ӨӨРӨӨ нөхдөг тул
    локал дээр бүх тест ногоон; Neon дээр л «column … does not exist» гэж
    унана — өөрөөр хэлбэл ЗӨВХӨН бодит хэрэглэгчийн өмнө.
    """
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext
    from app.db import Base as B

    eng = dbutil.test_engine()
    with eng.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), B.metadata)

    # Гадаад түлхүүрийн индексүүд нь ЗӨВХӨН Postgres-ийн асуудал (SQLite дээр
    # ганц жижиг файл — бүрэн скан хийхэд асуудалгүй) тул моделид биш,
    # хувилбарт л зарлагдсан. Autogenerate тэднийг «илүү» гэж үзэх нь
    # ХҮЛЭЭГДЭЖ БУЙ зөрүү — доор тусад нь шалгана.
    fk_ix = {f"ix_{t}_{c.name}" for t in B.metadata.tables
             for c in B.metadata.tables[t].columns if c.foreign_keys}
    fk_ix -= {i.name for t in B.metadata.tables.values() for i in t.indexes}
    noise = ("alembic_version", dbutil.ALT_SCHEMA)

    def expected(d) -> bool:
        if any(n in repr(d) for n in noise):
            return True
        return d[0] == "remove_index" and d[1].name in fk_ix

    real = [d for d in diff if not expected(d)]
    assert real == [], f"модель ба схем зөрж байна: {real}"


@pytest.mark.skipif(not dbutil.TEST_DATABASE_URL,
                    reason="зөвхөн Postgres дээр утгатай")
def test_every_foreign_key_column_has_an_index_in_the_revision():
    """FK багана БҮРД индекс. Шинэ холбоос нэмэгдвэл ЭНД баригдана.

    Postgres нь PK-д индекс өөрөө үүсгэдэг ч ГАДААД түлхүүрт ҮГҮЙ.
    Индексгүй `client_id`-аар шүүх нь харилцагчийн дэлгэц бүрд бүтэн
    хүснэгтийн скан — SQLite дээр мэдрэгддэггүй, Neon дээр секунд.
    """
    from app.db import Base as B
    # Загварт аль хэдийн ИНДЕКСЛЭГДСЭН баганыг хасна — индексийн НЭР нь
    # өөр байж болно (ж. `ix_stock_adjustments_material`), тиймээс БАГАНААР
    # харьцуулна, нэрээр биш.
    want = set()
    for tname, t in B.metadata.tables.items():
        covered = {tuple(c.name for c in i.columns)[0]
                   for i in t.indexes if len(i.columns) == 1}
        for c in t.columns:
            if c.foreign_keys and c.name not in covered:
                want.add(f"ix_{tname}_{c.name}")

    rev = pathlib.Path(BACKEND, "alembic", "versions")
    have: set[str] = set()
    for f in rev.glob("*.py"):
        for line in f.read_text(encoding="utf-8").splitlines():
            m = re.search(r"op\.create_index\('([^']+)'", line)
            if m:
                have.add(m.group(1))
    missing = sorted(want - have)
    assert missing == [], f"индексгүй үлдсэн гадаад түлхүүр: {missing}"


# ============================================================ 7. ЭРЭМБЭ

CYRILLIC = ["Өнө Орд", "Ашид", "Үйлс", "Зулаа"]
#: Кодын дугаараар: А(0410) < З(0417) < Ө(04E8) < Ү(04AE)… ГЭХДЭЭ Ү нь Ө-ээс
#: ӨМНӨ (04AE < 04E8). Тогтмолыг ГАРААР бичихгүй — Python-ы `sorted` нь
#: SQLite-ийн BINARY эрэмбэтэй ЯГ ижил, тэр нь энэ шалгуурын эталон.
EXPECTED = sorted(CYRILLIC)


def test_client_list_order_is_the_same_on_both_dialects(client, as_role):
    """«Өнө Орд», «Ашид», «Үйлс», «Зулаа» — хоёр сан дээр ЯГ ижил дараалал.

    Postgres-ийн `ORDER BY name` нь сангийн `LC_COLLATE`-ыг дагадаг тул
    кирилл үсгийг SQLite-ээс ӨӨР дарааллаар тавина. Эрэмбийг Python-д
    хийснээр «шилжсэний дараа жагсаалт минь холилдов» гэсэн мөч гарахгүй.
    """
    h = as_role("otgoo")
    for name in CYRILLIC:
        assert client.post("/api/clients", json={"name": name},
                           headers=h).status_code in (200, 201)
    got = [c["name"] for c in client.get("/api/clients", headers=h).json()
           if c["name"] in CYRILLIC]
    assert got == EXPECTED


def test_the_ordering_helper_matches_sqlite_binary_order():
    """`ordering.by_name` = кодын дугаар = өнөөдрийн SQLite BINARY эрэмбэ."""
    from app import ordering
    rows = [models.Client(name=n) for n in CYRILLIC]
    assert [r.name for r in ordering.by_name(rows)] == EXPECTED
    mats = [models.Material(name=n, category="Хэв") for n in CYRILLIC]
    assert [m.name for m in ordering.by_fields(mats, "category", "name")] == EXPECTED


def test_payment_history_has_a_stable_tiebreak(client, as_role):
    """ИЖИЛ ӨДРИЙН төлбөрүүд ҮРГЭЛЖ нэг дараалалтай.

    `ORDER BY date DESC` ганцаараа бол ижил өдрийн хоёр төлбөрийн дараалал
    нь санд үлдсэн физик байрлалаас хамаарна — SQLite ба Postgres дээр өөр,
    бүр нэг сан дотор ч VACUUM-ын дараа өөрчлөгдөнө. `id` нэмэгдсэнээр
    «сая харсан дараалал минь өөрчлөгдөв» гэсэн мөч алга болно.
    """
    h = as_role("sanhuu")
    cid = client.post("/api/clients", json={"name": "Тэнцвэрийн шалгуур"},
                      headers=h).json()["id"]
    day = str(clock.today())
    for amt in (100.0, 200.0, 300.0):
        r = client.post("/api/payments", json={"client_id": cid, "amount": amt,
                                               "date": day, "method": "CASH"},
                        headers=h)
        assert r.status_code in (200, 201), r.text
    rows = client.get("/api/payments", headers=h).json()
    mine = [p for p in rows if p["client_id"] == cid]
    assert [p["amount"] for p in mine] == [300.0, 200.0, 100.0], "id-ээр буурна"


# ============================================================ 5. ТҮГЖЭЭ

def test_invoice_guard_uses_an_advisory_lock_on_postgres():
    """Диалект бүрд ЗӨВ хэрэгсэл сонгогдож байна уу."""
    eng = dbutil.test_engine()
    Session = sessionmaker(bind=eng)
    stmts: list[str] = []

    def spy(conn, cursor, statement, params, ctx, many):
        stmts.append(statement)

    with Session() as s:
        event.listen(eng, "before_cursor_execute", spy)
        try:
            with billing.invoice_guard(s, 42):
                pass
        finally:
            event.remove(eng, "before_cursor_execute", spy)
    if dbutil.is_postgres():
        assert any("pg_advisory_xact_lock" in q for q in stmts), \
            "Postgres дээр серверийн зөвлөх түгжээ авах ёстой"
    else:
        assert stmts == [], "SQLite дээр түгжээ нь Python-д — SQL явуулахгүй"


@pytest.mark.skipif(not dbutil.TEST_DATABASE_URL,
                    reason="зэрэгцээ session — зөвхөн файлын/сүлжээний сан")
def test_two_racing_sessions_create_the_cycle_invoice_only_once():
    """ХОЁР ПРОЦЕСС нэг агшинд — нэхэмжлэл НЭГ мөр.

    Vercel дээр «нэг uvicorn ажилчин» гэсэн баталгаа БАЙХГҮЙ: хоёр хүсэлт
    хоёр өөр функцын instance дээр буудаг тул Python-ы `RLock` хөршөө огт
    хардаггүй. Тэр цонхонд хоёулаа «энэ цикл алга» гэж уншаад ХОЁР мөр
    үүсгэвэл тэр циклийн АВЛАГА ХОЁР ДАХИН нэмэгдэнэ.
    """
    eng = dbutil.test_engine()
    Session = sessionmaker(bind=eng, expire_on_commit=False)
    start = date(2026, 3, 20)
    today = start + timedelta(days=40)
    with Session() as s:
        cl = models.Client(name="Уралдаан")
        s.add(cl)
        s.flush()
        c = models.Contract(no="26/RACE", client_id=cl.id, type="rent",
                            start_date=start, cycle_days=30, penalty_percent=0)
        s.add(c)
        s.flush()
        g = models.Grade(code="А", name="А", sort=1)
        m = models.Material(name="Хэв", category="Хэв", base_rate=330)
        s.add_all([g, m])
        s.flush()
        s.add(models.ContractItem(contract_id=c.id, material_id=m.id,
                                  grade_id=g.id, daily_rate=330))
        mv = models.Movement(contract_id=c.id, type="ISSUE", date=start, status="done")
        s.add(mv)
        s.flush()
        s.add(models.MovementLine(movement_id=mv.id, material_id=m.id,
                                  grade_id=g.id, qty=100, rate=330))
        s.commit()
        cid = c.id

    gate = threading.Barrier(2)
    errors: list = []

    def worker():
        with Session() as s:
            ct = s.get(models.Contract, cid)
            gate.wait(timeout=20)
            try:
                billing.ensure_invoices(s, ct, today)
            except Exception as e:              # noqa: BLE001
                errors.append(repr(e))

    ts = [threading.Thread(target=worker) for _ in range(2)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(timeout=40)

    with Session() as s:
        rows = s.query(models.Invoice).filter_by(contract_id=cid).all()
    assert not errors, errors
    keys = [(i.cycle_start, i.cycle_end) for i in rows]
    assert len(keys) == len(set(keys)), f"давхардсан цикл: {keys}"
    assert len(rows) == 1, f"нэг цикл — нэг нэхэмжлэл, гарсан нь {len(rows)}"


# ============================================================ 9. CRON ЦЭГ

def test_the_cron_endpoint_is_shut_without_a_secret(client, monkeypatch):
    """`CRON_SECRET` тохируулаагүй бол цэг нь ОГТ нээгдэхгүй (503).

    «Хамгаалалтгүй ил цэг» нь дор: хэн ч дуудаад нэхэмжлэл төрүүлж чадна.
    """
    monkeypatch.delenv("CRON_SECRET", raising=False)
    assert client.get("/api/cron/daily").status_code == 503


def test_the_cron_endpoint_refuses_a_wrong_secret(client, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "cron-secret-32")
    assert client.get("/api/cron/daily").status_code == 401
    assert client.get("/api/cron/daily",
                      headers={"Authorization": "Bearer wrong-secret"}).status_code == 401


def test_the_cron_endpoint_runs_and_writes_the_daily_audit_row(client, monkeypatch,
                                                               as_role):
    """Зөв нууцтай бол гүйлт явж, /audit дээр НЭГ мөр үлдэнэ.

    Vercel Cron нь `Authorization: Bearer $CRON_SECRET` явуулдаг. Хариу нь
    Audit-ийн ЯГ ТЭР өгүүлбэр — Vercel-ийн лог дээр ч тэр мөр харагдана.
    """
    monkeypatch.setenv("CRON_SECRET", "cron-secret-32")
    r = client.get("/api/cron/daily", headers={"Authorization": "Bearer cron-secret-32"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert "Өдөр тутмын гүйлт" in body["line"]

    rows = client.get("/api/audit", headers=as_role("otgoo")).json()
    lines = [a["detail"] for a in (rows if isinstance(rows, list) else rows["rows"])]
    assert any("Өдөр тутмын гүйлт" in ln for ln in lines), "Audit мөр үлдээгүй"


def test_the_asyncio_cron_loop_is_off_unless_asked():
    """Давхрага нь DEFAULT УНТРААЛТТАЙ — serverless дээр утгагүй."""
    import app.main as m
    for env, want in (({}, False),
                      ({"JIGUUR_CRON_LOOP": "1"}, True),
                      ({"JIGUUR_CRON_LOOP": "1", "JIGUUR_NO_CRON": "1"}, False)):
        old = {k: os.environ.get(k) for k in ("JIGUUR_CRON_LOOP", "JIGUUR_NO_CRON")}
        try:
            for k in old:
                os.environ.pop(k, None)
            os.environ.update(env)
            assert m.cron_loop_enabled() is want, env
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v


# ============================================================ 10. ХАВСРАЛТ

def test_an_attachment_round_trips_through_the_database(client, as_role):
    """Байт нь САНД сууж, буцаад ЯГ ТЭР байтаараа гарна.

    Serverless дээр диск нь хүсэлт бүрийн дараа арчигддаг: Отгоо гэрээнийхээ
    зургийг хавсаргаад маргааш нээхэд «Файл олдсонгүй» гэж унших нь өгөгдөл
    ЧИМЭЭГҮЙ алга болсны шинж. Нэг сан → нэг нөөц → нэг үнэн.
    """
    h = as_role("otgoo")
    cid = client.post("/api/clients", json={"name": "Хавсралттай"},
                      headers=h).json()["id"]
    blob = b"%PDF-1.4 \xd0\xa5\xd1\x8d\xd0\xb2 " + os.urandom(2048)
    r = client.post(f"/api/files/client/{cid}",
                    files={"file": ("гэрээ.pdf", blob, "application/pdf")}, headers=h)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    assert r.json()["size"] == len(blob)

    listed = client.get(f"/api/files/client/{cid}", headers=h).json()
    assert [f["id"] for f in listed] == [fid]

    got = client.get(f"/api/files/dl/{fid}", headers=h)
    assert got.status_code == 200
    assert got.content == blob, "татсан файл нь хавсаргасантайгаа БАЙТ БАЙТААР ижил"


def test_the_upload_cap_says_why_in_her_language(client, as_role):
    """4MB-ээс их файл нь ШАЛТГААНАА хэлж татгалзана."""
    from app.routers.files import MAX_SIZE
    h = as_role("otgoo")
    cid = client.post("/api/clients", json={"name": "Том файл"},
                      headers=h).json()["id"]
    too_big = b"x" * (MAX_SIZE + 1)
    r = client.post(f"/api/files/client/{cid}",
                    files={"file": ("том.zip", too_big, "application/zip")}, headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "Файл 4MB-ээс их байна — Vercel-ийн хязгаар"


def test_no_uploads_directory_is_created_on_import():
    """`uploads/` хавтас нь ИМПОРТ дээр үүсэхээ болив (serverless дээр утгагүй)."""
    src = open(os.path.join(BACKEND, "app", "routers", "files.py"),
               encoding="utf-8").read()
    assert "os.makedirs" not in src
    assert "UPLOAD_DIR" not in src


# ============================================================ 11. QUERY ТОО

class QueryCounter:
    """Гүйсэн SELECT-ийн тоо — `before_cursor_execute` дээр суусан тоологч."""

    def __init__(self):
        self.statements: list[str] = []

    def __enter__(self):
        event.listen(Engine, "before_cursor_execute", self._on)
        return self

    def __exit__(self, *exc):
        event.remove(Engine, "before_cursor_execute", self._on)

    def _on(self, conn, cursor, statement, params, ctx, many):
        self.statements.append(statement)

    @property
    def selects(self) -> int:
        return sum(1 for s in self.statements
                   if s.lstrip().upper().startswith("SELECT"))


_WORLD_SEQ = [0]


def _world(client, as_role, n_clients=6):
    """n харилцагч, тус бүр нэг идэвхтэй түрээсийн гэрээтэй."""
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    gid = m["stock"][0]["grade_id"]
    start = str(clock.today() - timedelta(days=45))
    _WORLD_SEQ[0] += 1
    tag = _WORLD_SEQ[0]
    for i in range(n_clients):
        r = client.post("/api/clients",
                        json={"name": f"Ачаалал-{tag}-{i:02d}"}, headers=h)
        assert r.status_code in (200, 201), r.text
        cid = r.json()["id"]
        rc = client.post("/api/contracts", json={
            "client_id": cid, "type": "rent", "no": f"QC{tag}/{i:02d}",
            "start_date": start, "cycle_days": 30, "penalty_percent": 0,
            "items": [{"material_id": m["id"], "grade_id": gid,
                       "daily_rate": 330, "qty": 10}]}, headers=h)
        assert rc.status_code in (200, 201), rc.text
    return h


def _clients_selects(client, h) -> int:
    client.get("/api/clients", headers=h)        # нэхэмжлэл нь эхний удаад төрнө
    with QueryCounter() as qc:
        assert client.get("/api/clients", headers=h).status_code == 200
    return qc.selects


def test_the_client_list_costs_a_fixed_number_of_queries(client, as_role, monkeypatch):
    """N+1 → ТОГТМОЛ. Гэрээ нэмэгдэхэд query-ийн тоо ӨСӨХГҮЙ.

    Neon руу эргэлт бүр нь Улаанбаатар–Франкфуртын хоорондох замын цаг
    (~60-80мс). Гэрээ тутамд 5 нэмэлт эргэлт гэдэг нь 200 гэрээтэй жагсаалт
    дээр минут руу дөхөх хүлээлт — SQLite дээр (нэг файл, микросекунд) яг
    ижил код хормын төдийд дуусдаг тул энэ зардал өнөөдрийг хүртэл
    ХАРАГДААГҮЙ. Тоог энд тогтооно.
    """
    h = _world(client, as_role, n_clients=4)
    small = _clients_selects(client, h)
    _world(client, as_role, n_clients=12)
    big = _clients_selects(client, h)

    # ХУУЧИН зан төлөв: eager багцыг хоослоод ЯГ ижил хуудсыг дахин хэмжинэ
    monkeypatch.setattr(billing, "contract_load", tuple)
    lazy = _clients_selects(client, h)

    print(f"\n[query] /api/clients — 4 гэрээ: {small} SELECT · "
          f"16 гэрээ: {big} SELECT · 16 гэрээ EAGER-ГҮЙ: {lazy} SELECT")
    assert big == small, f"гэрээ нэмэгдэхэд query өссөн: {small} → {big}"
    assert big < lazy, f"eager ачаалалт юу ч өгсөнгүй: {big} ↔ {lazy}"
    assert big <= 12, f"жагсаалт {big} SELECT явуулав"


def test_a_sweep_with_nothing_due_writes_nothing_at_all(client, as_role):
    """Ажилгүй сэлгэлт нь БИЧИЛТ ч, ТҮГЖЭЭ ч авахгүй.

    GET бүр `COMMIT` явуулдаг бол уншдаг хуудас нь бичдэг хуудас болно —
    Neon дээр тэр нь эргэлт бүрд нэмэлт зам, зэрэгцээ хүсэлтэд нэмэлт түгжээ.
    """
    h = _world(client, as_role, n_clients=3)
    client.get("/api/clients", headers=h)          # эхний удаа нэхэмжлэл төрнө
    with QueryCounter() as qc:
        client.get("/api/clients", headers=h)
    writes = [s for s in qc.statements
              if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
    locks = [s for s in qc.statements if "pg_advisory" in s]
    assert writes == [], f"уншдаг зам бичив: {writes[:3]}"
    assert locks == [], "ажилгүй гэрээнд түгжээ авав"


# ============================================================ 1. MIGRATE CLI

def test_the_migrate_cli_builds_a_working_database_from_nothing(tmp_path):
    """`--create --seed` нь хоосон файлаас ажиллах сан гаргана (демогүй)."""
    db = tmp_path / "cli.db"
    env = {**os.environ, "DATABASE_URL": "sqlite:///" + str(db)}
    env.pop("JIGUUR_SEED_DEMO", None)
    r = subprocess.run([sys.executable, "-m", "app.migrate", "--create", "--seed"],
                       cwd=BACKEND, env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert str(db) in r.stdout, "аль сан дээр ажиллаж байгаагаа ХЭЛНЭ"
    eng = create_engine("sqlite:///" + str(db))
    with sessionmaker(bind=eng)() as s:
        assert s.query(models.User).count() == 3
        assert s.query(models.Client).count() == 0      # демо дата ОРООГҮЙ
        assert s.query(models.Material).count() > 0     # каталог ОРСОН
    eng.dispose()


def test_fresh_refuses_to_drop_anything_without_yes(tmp_path):
    """`--fresh` нь `--yes`-гүйгээр ЮУ Ч устгахгүй, устгах САНГАА хэвлэнэ."""
    db = tmp_path / "keep.db"
    env = {**os.environ, "DATABASE_URL": "sqlite:///" + str(db)}
    subprocess.run([sys.executable, "-m", "app.migrate", "--create"],
                   cwd=BACKEND, env=env, capture_output=True, text=True)
    r = subprocess.run([sys.executable, "-m", "app.migrate", "--fresh"],
                       cwd=BACKEND, env=env, capture_output=True, text=True)
    assert r.returncode == 2
    assert str(db) in r.stdout and "--yes" in r.stdout
    eng = create_engine("sqlite:///" + str(db))
    assert "contracts" in inspect(eng).get_table_names(), "хүснэгт устсан байна"
    eng.dispose()


def test_migrate_with_no_arguments_does_nothing(tmp_path):
    """Аргументгүй дуудалт нь ТУСЛАМЖ хэвлэнэ — санамсаргүй ачаалал болохгүй."""
    db = tmp_path / "untouched.db"
    env = {**os.environ, "DATABASE_URL": "sqlite:///" + str(db)}
    r = subprocess.run([sys.executable, "-m", "app.migrate"],
                       cwd=BACKEND, env=env, capture_output=True, text=True)
    assert r.returncode == 0
    assert "--create" in r.stdout
    assert not db.exists() or db.stat().st_size == 0


# ============================================================ 8. НӨХӨЛТ (2 диалект)

def test_the_backfills_run_on_this_dialect_and_are_idempotent():
    """Гурван дата нөхөлт ХОЁУЛАА диалект дээр ажиллаж, давхардуулахгүй.

    Хоёр газар л ялгаатай байв: SQLite-ийн `date || ' 00:00:00'` (Postgres-д
    timestamp руу CAST) ба `ROUND(float, 2)` (Postgres-д ийм функц БАЙХГҮЙ,
    numeric-ээр дамжина). Хоёулаа `schema_backfills`-д нуугдсан.
    """
    from app.schema_backfills import run_all
    eng = dbutil.test_engine()
    if not dbutil.TEST_DATABASE_URL:
        Base.metadata.create_all(eng)
    S = sessionmaker(bind=eng, expire_on_commit=False)
    with S() as s:
        cl = models.Client(name="Нөхөлт")
        s.add(cl)
        s.flush()
        c = models.Contract(no="26/BF", client_id=cl.id, type="rent",
                            start_date=date(2026, 3, 20), deposit=1_000_000)
        s.add(c)
        s.flush()
        s.add(models.Invoice(contract_id=c.id, no="R-26/BF-1",
                             cycle_start=date(2026, 3, 20), cycle_end=date(2026, 4, 19),
                             due_date=date(2026, 4, 19), total=1000, paid=0,
                             penalty_booked=216_849.994,
                             penalty_booked_until=date(2026, 5, 21)))
        s.commit()
        cid = c.id

    run_all(eng)
    with S() as s:
        pcs = s.query(models.PenaltyCharge).filter_by(contract_id=cid).all()
        evs = s.query(models.DepositEvent).filter_by(contract_id=cid).all()
    assert len(pcs) == 1 and pcs[0].amount == pytest.approx(216_849.99, abs=0.01)
    assert pcs[0].created_at == datetime(2026, 5, 21, 0, 0)
    assert [e.kind for e in evs] == ["lodge"] and evs[0].amount == 1_000_000
    assert evs[0].created_at == datetime(2026, 3, 20, 0, 0)

    run_all(eng)                      # idempotent
    with S() as s:
        assert s.query(models.PenaltyCharge).filter_by(contract_id=cid).count() == 1
        assert s.query(models.DepositEvent).filter_by(contract_id=cid).count() == 1


# ============================================================ 12. СТАТИК · CORS

def test_static_files_are_not_mounted_on_vercel():
    """`VERCEL` тавигдсан бол `dist` mount ХИЙГДЭХГҮЙ.

    Vercel статикийг өөрөө тараана. Python функц дотор mount хийвэл bundle
    хавдаад, catch-all нь 404-ийг ч барьж авна.
    """
    src = open(os.path.join(BACKEND, "app", "main.py"), encoding="utf-8").read()
    assert "if os.path.isdir(DIST) and not IS_SERVERLESS:" in src


def test_cors_origins_can_be_pinned_by_environment():
    """`JIGUUR_ALLOWED_ORIGINS` — default локал дээр `*`."""
    import importlib
    import app.main as m
    assert m.ALLOWED_ORIGINS == ["*"] or os.environ.get("JIGUUR_ALLOWED_ORIGINS")
    old = os.environ.get("JIGUUR_ALLOWED_ORIGINS")
    os.environ["JIGUUR_ALLOWED_ORIGINS"] = "https://a.example, https://b.example"
    try:
        assert [o.strip() for o in os.environ["JIGUUR_ALLOWED_ORIGINS"].split(",")
                if o.strip()] == ["https://a.example", "https://b.example"]
    finally:
        if old is None:
            os.environ.pop("JIGUUR_ALLOWED_ORIGINS", None)
        else:
            os.environ["JIGUUR_ALLOWED_ORIGINS"] = old
    importlib.reload  # noqa: B018  (модулийг дахин ачаалахгүй — app нь ганц)

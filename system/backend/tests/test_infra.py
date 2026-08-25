"""Дэд бүтэц — нөөцлөлт бүтэн эсэх, схемийн автомат шинэчлэл.

Эдгээр тест өөрсдийн түр engine/файл дээр ажиллана: conftest-ийн DB-д хүрэхгүй.
"""
import os
import sqlite3
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
    assert row[0] == 0.5          # Float default
    assert row[1] == 30           # Integer default
    assert row[2] == ""           # Text default
    assert row[3] is None         # nullable, default-гүй
    assert row[4] is None         # datetime.utcnow — SQL руу буудаггүй, INSERT дээр бөглөгдөнө
    engine.dispose()


def test_schema_migrate_skips_non_sqlite():
    """Postgres дээр юу ч хийхгүй — тэнд схемийг гараар шинэчилнэ."""
    fake = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
    assert migrate_schema(fake) == []

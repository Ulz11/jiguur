"""Тестийн суурь — тест бүрт цэвэр DB + seed + 3 ролийн login."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# app.main импортлогдохоос ӨМНӨ түр DB зааж өгнө (бодит jiguur.db-д хүрэхгүй).
# ⚠ Импорт өөрөө одоо DB-д хүрэхээ БОЛЬСОН (main.py), гэхдээ `app.db.engine`
# нь модулийн түвшинд үүсдэг тул зам нь зөв байх ёстой хэвээр.
_IMPORT_DB = os.path.join(tempfile.gettempdir(), "jiguur_import.db")
os.environ.setdefault("DATABASE_URL", "sqlite:///" + _IMPORT_DB)
# Импортын үеийн авто-нөөцлөлт ч бас түр хавтаст явна (14-өөр өөрөө эргэлдэнэ)
os.environ.setdefault("JIGUUR_BACKUP_DIR",
                      os.path.join(tempfile.gettempdir(), "jiguur_test_backups"))
# Өдөр тутмын нэхэмжлэлийн давхрага (services/cron.py) тестэд ОГТ асахгүй:
# `TestClient(app)` нь lifespan-ыг ажиллуулдаг тул үгүй бол тест бүр өөрийн
# гэсэн фонд даалгавар үлдээж, суут детерминистик байхаа болино.
os.environ.setdefault("JIGUUR_NO_CRON", "1")
# Тестүүд ДЕМО дата (нөөц, харилцагч, гэрээ) дээр тулгуурладаг тул `seed()`
# бүрэн ажиллана. Бодит/шинэ сан дээр энэ туг тавигдахгүй — тэнд seed нь
# зөвхөн хэрэглэгч, каталог, тохиргоо бичнэ (`app/seed.py`).
os.environ.setdefault("JIGUUR_SEED_DEMO", "1")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
from app.seed import seed

from . import dbutil


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "sqlite_only: зөвхөн SQLite-ийн механик (PRAGMA, ALTER, файлын нөөц) — "
        "Postgres дээр алгасна")


def pytest_collection_modifyitems(config, items):
    """Postgres горимд SQLite-ийн механикийн тестүүдийг алгасна."""
    if not dbutil.TEST_DATABASE_URL:
        return
    skip = pytest.mark.skip(reason="зөвхөн SQLite (TEST_DATABASE_URL тавигдсан)")
    for item in items:
        if "sqlite_only" in item.keywords:
            item.add_marker(skip)


@pytest.fixture()
def client():
    """Тест бүрт цэвэр сан, бүрэн seed, TestClient."""
    path = None
    if dbutil.TEST_DATABASE_URL:
        engine = dbutil.test_engine()
    else:
        path = dbutil.temp_sqlite_path()
        engine = dbutil.test_engine(path)
        Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, expire_on_commit=False)
    with TestSession() as s:
        seed(s)

    def override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    dbutil.dispose(engine)
    if path:
        try:
            os.unlink(path)
        except OSError:
            pass


@pytest.fixture()
def as_role(client):
    """as_role('otgoo') -> Authorization header."""
    def _login(username: str):
        r = client.post("/api/auth/login", json={"username": username, "password": "1234"})
        assert r.status_code == 200, r.text
        return {"Authorization": "Bearer " + r.json()["token"]}
    return _login

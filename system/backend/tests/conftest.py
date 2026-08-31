"""Тестийн суурь — тест бүрт цэвэр DB + seed + 3 ролийн login."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# app.main импортлогдохоос ӨМНӨ түр DB зааж өгнө (бодит jiguur.db-д хүрэхгүй)
_IMPORT_DB = os.path.join(tempfile.gettempdir(), "jiguur_import.db")
os.environ.setdefault("DATABASE_URL", "sqlite:///" + _IMPORT_DB)
# Импортын үеийн авто-нөөцлөлт ч бас түр хавтаст явна (14-өөр өөрөө эргэлдэнэ)
os.environ.setdefault("JIGUUR_BACKUP_DIR",
                      os.path.join(tempfile.gettempdir(), "jiguur_test_backups"))
# Өдөр тутмын нэхэмжлэлийн давхрага (services/cron.py) тестэд ОГТ асахгүй:
# `TestClient(app)` нь lifespan-ыг ажиллуулдаг тул үгүй бол тест бүр өөрийн
# гэсэн фонд даалгавар үлдээж, суут детерминистик байхаа болино.
os.environ.setdefault("JIGUUR_NO_CRON", "1")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
from app.seed import seed


@pytest.fixture()
def client():
    """Тест бүрт шинэ SQLite файл, бүрэн seed, TestClient."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine("sqlite:///" + path, connect_args={"check_same_thread": False})
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
    engine.dispose()
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

"""СЕССИ — гулсдаг хугацаа, «би хэн бэ», нэвтрэлт/гаралтын мөр.

Отгоо эгч 09:00-д нэвтэрч, 21:00-д тайлангаа хэвлэдэг. 12 цагийн токен нь
ажлын өдрөөс БОГИНО тул тэр ажлынхаа дундуур «Нэвтрэлт хүчингүй» гэсэн
цонх иддэг байв — хагас бөглөсөн маягт нь алга болно. Ажиллаж байгаа хүн
хэзээ ч дундуураа гарах ёсгүй; ажиллаагүй сесси нь өөрөө унтарна.
"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import auth as A


def _token(age_seconds: int, uid: int = 1, role: str = "manager",
           name: str = "Ч.Отгонцэцэг") -> str:
    """`age_seconds` секундын өмнө зурагдсан токен (гарын үсэг нь ЖИНХЭНЭ)."""
    payload = {"uid": uid, "role": role, "name": name,
               "exp": int(time.time()) + A.TOKEN_TTL - age_seconds}
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    return raw + "." + A._sign(raw.encode())


def _h(token: str) -> dict:
    return {"Authorization": "Bearer " + token}


# ---------- Гулсдаг хугацаа ----------

def test_a_fresh_token_is_not_rotated(client):
    """Дөнгөж зурсан токен дээр шинийг зурахгүй — дэлгэц үүнийг байн байн дуудна."""
    r = client.post("/api/auth/refresh", headers=_h(_token(60)))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["refreshed"] is False and d["token"] is None
    assert d["token_expires_at"]


def test_a_token_older_than_an_hour_gets_a_fresh_twelve_hours(client):
    r = client.post("/api/auth/refresh", headers=_h(_token(2 * 60 * 60)))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["refreshed"] is True and d["token"]
    # Шинэ токен АЖИЛЛАНА ба хугацаа нь урагшилсан
    me = client.get("/api/auth/me", headers=_h(d["token"]))
    assert me.status_code == 200 and me.json()["username"] == "otgoo"
    assert me.json()["token_expires_at"] == d["token_expires_at"]
    assert d["token_expires_at"] > client.get(
        "/api/auth/me", headers=_h(_token(2 * 60 * 60))).json()["token_expires_at"]


def test_the_refresh_line_is_exactly_one_hour(client):
    """Хил нь ЯГ 1 цаг — түүнээс залуу нь хэвээр, ахимаг нь шинэчлэгдэнэ."""
    just_under = client.post("/api/auth/refresh",
                             headers=_h(_token(A.REFRESH_AFTER - 30))).json()
    just_over = client.post("/api/auth/refresh",
                            headers=_h(_token(A.REFRESH_AFTER + 30))).json()
    assert just_under["refreshed"] is False
    assert just_over["refreshed"] is True


def test_an_expired_or_missing_token_cannot_refresh_itself(client):
    """Хугацаа дууссаныг сунгаж болохгүй — эс бөгөөс сесси МӨНХ болно."""
    assert client.post("/api/auth/refresh",
                       headers=_h(_token(A.TOKEN_TTL + 60))).status_code == 401
    assert client.post("/api/auth/refresh").status_code == 401
    assert client.post("/api/auth/refresh",
                       headers=_h("buruu.garyn-usegtei")).status_code == 401


# ---------- «Би хэн бэ» ----------

def test_me_says_when_the_password_is_still_the_factory_one(client, as_role):
    """Гурвуулаа «1234»-тэй сууж байвал /audit-ийн «Хэн» багана утгагүй."""
    h = as_role("otgoo")
    me = client.get("/api/auth/me", headers=h).json()
    assert me["must_change_password"] is True
    assert me["token_expires_at"] and me["role"] == "manager"

    assert client.post("/api/auth/change-password", headers=h, json={
        "old_password": "1234", "new_password": "shine-nuuts"}).status_code == 200
    r = client.post("/api/auth/login",
                    json={"username": "otgoo", "password": "shine-nuuts"})
    assert r.status_code == 200, r.text
    assert r.json()["must_change_password"] is False
    assert r.json()["expires_at"]
    h2 = {"Authorization": "Bearer " + r.json()["token"]}
    assert client.get("/api/auth/me", headers=h2).json()["must_change_password"] is False


def test_rotate_token_hands_back_a_working_token(client, as_role):
    """`auth.rotate_token` — нууц үг солих зам (core.py) үүнийг дуудаж болно."""
    from app.db import get_db
    from app.main import app as fastapi_app
    from app import models

    as_role("otgoo")                       # DB-г бэлдэнэ
    db = next(fastapi_app.dependency_overrides[get_db]())
    try:
        user = db.query(models.User).filter_by(username="otgoo").first()
        token = A.rotate_token(user)
    finally:
        db.close()
    assert client.get("/api/auth/me", headers=_h(token)).json()["username"] == "otgoo"


# ---------- Нэвтрэв / Гарав ----------

def test_login_and_logout_both_leave_a_row_in_the_audit(client, as_role):
    """«Энэ өдөр систем дээр хэн байсан бэ» гэдгийн хариу.

    Урьд нь бүртгэл нь зөвхөн ӨӨРЧЛӨЛТӨӨС эхэлдэг байсан: хэн орж гарсныг
    мэдэх арга байхгүй.
    """
    h = as_role("sanhuu")
    assert client.post("/api/auth/logout", headers=h).json() == {"ok": True}
    rows = client.get("/api/audit?entity=session&limit=100",
                      headers=as_role("otgoo")).json()["rows"]
    kinds = {r["action"] for r in rows}
    assert {"login", "logout"} <= kinds
    login = next(r for r in rows if r["action"] == "login" and r["user_name"] == "Санхүүч")
    assert "Нэвтрэв" in login["detail"] and "санхүү" in login["detail"]
    logout = next(r for r in rows if r["action"] == "logout")
    assert "Гарав" in logout["detail"]
    assert all((r["user_name"] or "").strip() for r in rows)


def test_a_failed_login_leaves_no_row(client):
    """Буруу нууц үг нь СЕССИ биш — бүртгэлийг дүүргэх шалтгаангүй."""
    assert client.post("/api/auth/login",
                       json={"username": "otgoo", "password": "буруу"}).status_code == 401
    h = {"Authorization": "Bearer " + client.post(
        "/api/auth/login", json={"username": "otgoo", "password": "1234"}
    ).json()["token"]}
    rows = client.get("/api/audit?entity=session&limit=100", headers=h).json()["rows"]
    assert len(rows) == 1 and rows[0]["action"] == "login"


def test_logout_needs_a_session_of_its_own(client):
    assert client.post("/api/auth/logout").status_code == 401

"""МЭДЭГДЭЛ ХОГ БОЛДОГГҮЙ, АМЛАЛТ ХААГДДАГ.

Дашбоардын мэдэгдэл нь амьд тооцоолол: нөхцөл нь арилтал мөр нь өдөр бүр
дахин гарна. Отгоо эгч харилцагчтайгаа ярьж «10-нд төлнө» гэж тохирсон бол
тэр мөр долоо хоног ХОГ болно — хог болсон жагсаалт уншигдахаа больдог тул
хажууд нь зогсох ЧУХАЛ мөр ч хамт алдагдана.

Хоёр хаалга:
  · «Мэдлээ — N хоногийн дараа сануул» (`notification_states`) — нуулт нь
    ХҮНИЙХ: нярав нэгийг хойшлуулсан нь захирлын дэлгэцийг хөндөхгүй;
  · амлалтыг ХААХ («биелүүлсэн» / «зөрчсөн») — хаагдсан амлалт нь «Амлалт
    зөрчсөн» тоолуур, улаан мэдэгдэл хоёроос ХОЁУЛАНГААС нь гарна.
"""
from contextlib import contextmanager
from datetime import date, timedelta

from app import models


def iso(days_ago: int = 0) -> str:
    return str(date.today() - timedelta(days=days_ago))


@contextmanager
def session():
    from app.db import get_db
    from app.main import app
    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    try:
        yield db
    finally:
        gen.close()


def dash(client, h) -> dict:
    r = client.get("/api/dashboard", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def kinds(payload: dict) -> list[str]:
    return [n["kind"] for n in payload["notifications"]]


def an_overdue_invoice(client, h) -> dict:
    """Хэтэрсэн нэхэмжлэлийн мэдэгдэлтэй нэг гэрээ."""
    m = next(x for x in client.get("/api/materials", headers=h).json()
             if x["name"] == "Хэв хашмал 6012")
    grade = next(s for s in m["stock"] if s["grade"] == "А")
    cl = client.post("/api/clients", headers=h,
                     json={"name": "Мэдэгдлийн тест ХХК"}).json()
    c = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(70),
        "items": [{"material_id": m["id"], "grade_id": grade["grade_id"],
                   "qty": 200, "daily_rate": 330}]}).json()
    mv = next(x for x in client.get(f"/api/contracts/{c['id']}", headers=h)
              .json()["movements"] if x["status"] == "pending")
    r = client.post("/api/auth/login", json={"username": "darga", "password": "1234"})
    client.post(f"/api/movements/{mv['id']}/confirm",
                headers={"Authorization": "Bearer " + r.json()["token"]})
    note = next(n for n in dash(client, h)["notifications"]
                if n["kind"] == "overdue" and n["contract_id"] == c["id"])
    return {"client": cl, "contract": c, "note": note}


# ---------- 1. Нуулт ----------

def test_a_snoozed_row_leaves_the_board_and_says_how_many_are_hidden(client, as_role):
    h = as_role("otgoo")
    target = an_overdue_invoice(client, h)
    inv_id = target["note"]["invoice_id"]
    assert dash(client, h)["snoozed_count"] == 0

    r = client.post("/api/notifications/snooze", headers=h,
                    json={"kind": "overdue", "entity_id": inv_id, "days": 5})
    assert r.status_code == 200, r.text
    assert r.json()["snooze_until"] == str(date.today() + timedelta(days=5))

    d = dash(client, h)
    assert not any(n.get("invoice_id") == inv_id for n in d["notifications"])
    assert d["snoozed_count"] == 1
    # …харин ӨӨР хэтэрсэн нэхэмжлэлүүд ХЭВЭЭР — нэг мөр нуугдсан, төрөл нь биш
    assert "overdue" in kinds(d)


def test_hiding_is_personal_not_global(client, as_role):
    """Нярав нэг мөрийг хойшлуулсан нь захирлын дэлгэцийг хөндөхгүй."""
    h = as_role("otgoo")
    inv_id = an_overdue_invoice(client, h)["note"]["invoice_id"]
    client.post("/api/notifications/snooze", headers=h,
                json={"kind": "overdue", "entity_id": inv_id, "days": 3})

    other = dash(client, as_role("sanhuu"))
    assert any(n.get("invoice_id") == inv_id for n in other["notifications"])
    assert other["snoozed_count"] == 0


def test_unsnoozing_brings_the_row_straight_back(client, as_role):
    h = as_role("otgoo")
    inv_id = an_overdue_invoice(client, h)["note"]["invoice_id"]
    client.post("/api/notifications/snooze", headers=h,
                json={"kind": "overdue", "entity_id": inv_id, "days": 30})
    assert not any(n.get("invoice_id") == inv_id
                   for n in dash(client, h)["notifications"])

    r = client.request("DELETE", "/api/notifications/snooze", headers=h,
                       json={"kind": "overdue", "entity_id": inv_id})
    assert r.status_code == 200 and r.json()["removed"] == 1
    d = dash(client, h)
    assert any(n.get("invoice_id") == inv_id for n in d["notifications"])
    assert d["snoozed_count"] == 0
    # хоёр дахь удаа — идемпотент, алдаа биш
    assert client.request("DELETE", "/api/notifications/snooze", headers=h,
                          json={"kind": "overdue",
                                "entity_id": inv_id}).json()["removed"] == 0


def test_a_snooze_without_an_id_hides_the_whole_kind(client, as_role):
    """Зогсонги бартер, зээлийн сануулга нь мөрөндөө id-гүй — төрлөөрөө нуугдана."""
    h = as_role("otgoo")
    an_overdue_invoice(client, h)
    assert "overdue" in kinds(dash(client, h))

    client.post("/api/notifications/snooze", headers=h,
                json={"kind": "overdue", "days": 2})
    d = dash(client, h)
    assert "overdue" not in kinds(d)
    assert d["snoozed_count"] > 0


def test_the_row_comes_back_by_itself_when_the_day_arrives(client, as_role):
    """Нуулт нь УСТГАЛ БИШ — заасан өдөр мөр өөрөө буцаж гарна."""
    h = as_role("otgoo")
    inv_id = an_overdue_invoice(client, h)["note"]["invoice_id"]
    client.post("/api/notifications/snooze", headers=h,
                json={"kind": "overdue", "entity_id": inv_id, "days": 2})
    with session() as db:
        st = db.query(models.NotificationState).filter_by(entity_id=inv_id).one()
        st.snooze_until = date.today()          # өнөөдөр — «хүртэл» дууслаа
        db.commit()

    d = dash(client, h)
    assert any(n.get("invoice_id") == inv_id for n in d["notifications"])
    assert d["snoozed_count"] == 0


def test_a_nonsense_snooze_is_refused_in_her_own_words(client, as_role):
    h = as_role("otgoo")
    bad = client.post("/api/notifications/snooze", headers=h,
                      json={"kind": "юу ч биш", "days": 2})
    assert bad.status_code == 400
    assert bad.json()["detail"] == "Мэдэгдлийн төрөл буруу"
    assert client.post("/api/notifications/snooze", headers=h,
                       json={"kind": "overdue", "days": 0}).status_code == 400
    assert client.post("/api/notifications/snooze", headers=h,
                       json={"kind": "overdue", "days": 999}).status_code == 400


def test_snoozing_twice_moves_the_date_instead_of_piling_up_rows(client, as_role):
    h = as_role("otgoo")
    inv_id = an_overdue_invoice(client, h)["note"]["invoice_id"]
    for days in (2, 9):
        client.post("/api/notifications/snooze", headers=h,
                    json={"kind": "overdue", "entity_id": inv_id, "days": days})
    with session() as db:
        rows = db.query(models.NotificationState).filter_by(entity_id=inv_id).all()
    assert len(rows) == 1
    assert rows[0].snooze_until == date.today() + timedelta(days=9)


# ---------- 2. Амлалт хаагдана ----------

def _promise(client, h, client_id: int, days_ago: int = 4) -> dict:
    r = client.post(f"/api/clients/{client_id}/notes", headers=h, json={
        "date": iso(days_ago + 2), "kind": "call", "note": "Утсаар ярив",
        "promise_date": iso(days_ago), "promise_amount": 1_500_000})
    assert r.status_code == 200, r.text
    return r.json()


def test_a_kept_promise_stops_being_a_broken_one(client, as_role):
    h = as_role("sanhuu")
    w = an_overdue_invoice(client, as_role("otgoo"))
    n = _promise(client, h, w["client"]["id"])

    col = client.get("/api/collections", headers=h).json()
    row = next(r for r in col["rows"] if r["client_id"] == w["client"]["id"])
    assert row["promise_late"] is True
    assert row["promise_id"] == n["id"] and row["promise_status"] == "open"
    assert col["promises_late"] == 1
    assert "promise_late" in kinds(dash(client, as_role("otgoo")))

    r = client.patch(f"/api/collections/notes/{n['id']}", headers=h,
                     json={"status": "kept"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "kept"

    col2 = client.get("/api/collections", headers=h).json()
    row2 = next(r for r in col2["rows"] if r["client_id"] == w["client"]["id"])
    assert row2["promise_late"] is False and row2["promise_id"] is None
    assert col2["promises_late"] == 0
    assert "promise_late" not in kinds(dash(client, as_role("otgoo")))


def test_closing_a_promise_as_broken_also_takes_it_off_the_counter(client, as_role):
    h = as_role("sanhuu")
    w = an_overdue_invoice(client, as_role("otgoo"))
    n = _promise(client, h, w["client"]["id"])
    assert client.patch(f"/api/collections/notes/{n['id']}", headers=h,
                        json={"status": "broken"}).status_code == 200
    col = client.get("/api/collections", headers=h).json()
    assert col["promises_late"] == 0, "хаагдсан амлалт дахин тоологдохгүй"


def test_the_promise_gate_is_guarded_and_speaks_mongolian(client, as_role):
    h = as_role("sanhuu")
    w = an_overdue_invoice(client, as_role("otgoo"))
    n = _promise(client, h, w["client"]["id"])

    assert client.patch(f"/api/collections/notes/{n['id']}",
                        headers=as_role("darga"),
                        json={"status": "kept"}).status_code == 403
    bad = client.patch(f"/api/collections/notes/{n['id']}", headers=h,
                       json={"status": "хаав"})
    assert bad.status_code == 400 and bad.json()["detail"] == "Буруу төлөв"
    assert client.patch("/api/collections/notes/999999", headers=h,
                        json={"status": "kept"}).status_code == 404

    client.patch(f"/api/collections/notes/{n['id']}", headers=h,
                 json={"status": "kept"})
    row = client.get("/api/audit?entity=collection_note",
                     headers=as_role("otgoo")).json()["rows"][0]
    assert row["action"] == "update"
    assert "амлалтын төлөв: нээлттэй → амлалтаа биелүүлсэн" in row["detail"]


def test_the_old_notes_gate_still_closes_promises(client, as_role):
    """`PATCH /api/notes/{id}` нь ХУУЧИН хаалга — эвдрэхгүй."""
    h = as_role("sanhuu")
    w = an_overdue_invoice(client, as_role("otgoo"))
    n = _promise(client, h, w["client"]["id"])
    assert client.patch(f"/api/notes/{n['id']}", headers=h,
                        json={"status": "broken"}).json()["status"] == "broken"

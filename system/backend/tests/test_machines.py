"""Механизм (Автокран) — TDD. Бодит хэв маяг: өдрөөр (бүтэн/хагас), орлого
бэлэн/данс/бартер, дотоод ажил, зарлага (түлш, сэлбэг, жолооч) → машин бүрийн ашиг."""
from datetime import date, timedelta


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def test_machine_pnl_from_jobs_and_expenses(client, as_role):
    h = as_role("otgoo")
    m = client.post("/api/machines", headers=h, json={"name": "Тест кран 25т"}).json()
    assert m["name"] == "Тест кран 25т"
    # бүтэн өдөр 1.2 сая (данс) + хагас өдөр 600к (бэлэн) + дотоод ажил 300к
    for job in [
        {"date": iso(3), "entry": "job", "label": "Бүтэн өдөр", "client": "Түмэн Хийц",
         "amount": 1_200_000, "method": "BANK"},
        {"date": iso(2), "entry": "job", "label": "Хагас өдөр", "client": "Бат Бүтээц",
         "amount": 600_000, "method": "CASH"},
        {"date": iso(1), "entry": "job", "label": "Дотоод ажил", "client": "Жигүүр Зам",
         "amount": 300_000, "method": "INTERNAL"},
    ]:
        r = client.post(f"/api/machines/{m['id']}/logs", headers=h, json=job)
        assert r.status_code == 200, r.text
    # зарлага: түлш 200к
    r = client.post(f"/api/machines/{m['id']}/logs", headers=h, json={
        "date": iso(1), "entry": "expense", "label": "Түлш", "amount": 200_000})
    assert r.status_code == 200
    lst = client.get("/api/machines", headers=h).json()
    row = next(x for x in lst["machines"] if x["id"] == m["id"])
    assert row["income"] == 2_100_000
    assert row["expense"] == 200_000
    assert row["net"] == 1_900_000


def test_machine_log_validation(client, as_role):
    h = as_role("otgoo")
    m = client.post("/api/machines", headers=h, json={"name": "Тест кран Б"}).json()
    bad = client.post(f"/api/machines/{m['id']}/logs", headers=h, json={
        "date": iso(0), "entry": "job", "label": "Бүтэн өдөр", "amount": -100})
    assert bad.status_code == 400


def test_factory_can_log_but_not_create_machine(client, as_role):
    hd = as_role("darga")
    machines = client.get("/api/machines", headers=hd).json()["machines"]
    assert machines, "seed-д кран байх ёстой"
    r = client.post(f"/api/machines/{machines[0]['id']}/logs", headers=hd, json={
        "date": iso(0), "entry": "expense", "label": "Түлш", "amount": 150_000})
    assert r.status_code == 200
    assert client.post("/api/machines", headers=hd, json={"name": "X"}).status_code == 403

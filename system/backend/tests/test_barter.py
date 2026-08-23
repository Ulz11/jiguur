"""Бартер модуль — TDD. Бизнес дүрэм: бартераар орж ирсэн хөрөнгө бүртгэгдэж,
дараа нь зарагдахад ОРЖ ИРСЭН ҮНЭ ↔ ЗАРСАН ҮНИЙН зөрүү = хэрэгжсэн ашиг/алдагдал
тайланд харагдана (жишээ: машин 250 сая-гаар орж ирээд 240 саяд зарагдвал −10 сая)."""
from datetime import date, timedelta


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def test_barter_payment_creates_asset(client, as_role):
    """Бартер төлбөр бүртгэмэгц хөрөнгө автоматаар Бартер модульд орно."""
    h = as_role("sanhuu")
    r = client.post("/api/payments", headers=h, json={
        "client_id": 1, "date": iso(0), "amount": 5_000_000,
        "method": "BARTER", "barter_desc": "Автомашин 1234УБА"})
    assert r.status_code == 200
    lst = client.get("/api/barter", headers=h)
    assert lst.status_code == 200
    a = next(x for x in lst.json()["assets"] if x["name"] == "Автомашин 1234УБА")
    assert a["value_in"] == 5_000_000
    assert a["status"] == "held"
    assert a["client_id"] == 1


def test_sell_records_realized_loss(client, as_role):
    """Бодит кейс: машин 250 саяар орж ирээд 240 саяд зарагдвал −10 сая
    хэрэгжсэн алдагдал тайланд харагдана."""
    h = as_role("otgoo")
    before = client.get("/api/barter", headers=h).json()["summary"]["realized"]
    a = client.post("/api/barter", headers=h, json={
        "type": "Машин", "name": "Land Cruiser 2 дахь", "detail": "0315УНҮ",
        "date_in": iso(60), "value_in": 250_000_000, "asking_price": 250_000_000}).json()
    r = client.post(f"/api/barter/{a['id']}/sell", headers=h, json={
        "date": iso(0), "amount": 240_000_000, "sold_to": "Хувь хүн"})
    assert r.status_code == 200
    sold = r.json()
    assert sold["status"] == "sold"
    assert sold["gain"] == -10_000_000
    after = client.get("/api/barter", headers=h).json()["summary"]["realized"]
    assert after - before == -10_000_000


def test_cannot_sell_twice(client, as_role):
    h = as_role("otgoo")
    a = client.post("/api/barter", headers=h, json={
        "type": "Машин", "name": "Чиргүүл", "date_in": iso(10), "value_in": 55_000_000}).json()
    client.post(f"/api/barter/{a['id']}/sell", headers=h,
                json={"date": iso(0), "amount": 50_000_000})
    again = client.post(f"/api/barter/{a['id']}/sell", headers=h,
                        json={"date": iso(0), "amount": 60_000_000})
    assert again.status_code == 400


def test_material_asset_goes_to_stock(client, as_role):
    """Бартераар орж ирсэн тулаас агуулахын нөөцөд нэмэгдэнэ."""
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Тулаас В2")
    st = next(s for s in m["stock"] if s["grade"] == "шинэ")
    before = st["on_hand"]
    a = client.post("/api/barter", headers=h, json={
        "type": "Материал", "name": "Тулаас В2 · 500ш", "date_in": iso(5),
        "value_in": 27_500_000}).json()
    r = client.post(f"/api/barter/{a['id']}/to-stock", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"], "qty": 500})
    assert r.status_code == 200
    assert r.json()["status"] == "stocked"
    mats2 = client.get("/api/materials", headers=h).json()
    after = next(s for s in next(x for x in mats2 if x["id"] == m["id"])["stock"]
                 if s["grade_id"] == st["grade_id"])["on_hand"]
    assert after == before + 500
    # нөөцөд орсныг дахин зарж болохгүй
    bad = client.post(f"/api/barter/{a['id']}/sell", headers=h,
                      json={"date": iso(0), "amount": 1_000_000})
    assert bad.status_code == 400


def test_factory_cannot_sell_403(client, as_role):
    h = as_role("otgoo")
    a = client.post("/api/barter", headers=h, json={
        "type": "Байр", "name": "Орон сууц 53.15м²", "date_in": iso(3),
        "value_in": 75_000_000}).json()
    r = client.post(f"/api/barter/{a['id']}/sell", headers=as_role("darga"),
                    json={"date": iso(0), "amount": 80_000_000})
    assert r.status_code == 403

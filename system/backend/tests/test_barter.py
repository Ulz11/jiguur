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


# ---------- Орж ирсэн үнэ · огноо · бүртгэл ----------

def _asset(client, h, **kw) -> dict:
    body = {"type": "Машин", "name": "Ноён Приус", "date_in": iso(20),
            "value_in": 12_000_000, **kw}
    r = client.post("/api/barter", headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_value_in_zero_is_refused_on_add_and_on_edit(client, as_role):
    """Орж ирсэн үнэ нь ХЭРЭГЖСЭН АШГИЙН суурь.

    0 байвал зарсан үнэ БҮХЭЛДЭЭ «ашиг» болж тайланд орно — тэр нь тоо биш,
    ХУДАЛ. Хоёр хаалга (нэмэх, засах) хоёулаа хаалттай байх ёстой: нэг нь
    нээлттэй байхад хүн нэмээд дараа нь 0 болгож засна.
    """
    h = as_role("sanhuu")
    bad = client.post("/api/barter", headers=h, json={
        "type": "Машин", "name": "Үнэгүй", "date_in": iso(1), "value_in": 0})
    assert bad.status_code == 400
    assert "0-ээс их" in bad.json()["detail"]
    assert client.post("/api/barter", headers=h, json={
        "type": "Машин", "name": "Сөрөг", "date_in": iso(1),
        "value_in": -5}).status_code == 400

    a = _asset(client, h)
    r = client.put(f"/api/barter/{a['id']}", headers=h, json={
        "type": "Машин", "name": "Ноён Приус", "value_in": 0})
    assert r.status_code == 400 and "0-ээс их" in r.json()["detail"]
    # Хөрөнгө нь ХЭВЭЭР — татгалзал нь мөрийг эвдээгүй
    got = next(x for x in client.get("/api/barter", headers=h).json()["assets"]
               if x["id"] == a["id"])
    assert got["value_in"] == 12_000_000


def test_edit_saves_date_in_instead_of_silently_dropping_it(client, as_role):
    """Дэлгэц «Орж ирсэн огноо» нүд санал болгодог — сервер түүнийг БИЧНЭ.

    Урьд нь `EditIn`-д талбар нь байхгүй тул огноо чимээгүй хаягддаг байв:
    хүн зассан, «Хадгаллаа» гэсэн мэдэгдэл гарсан, буцаж ирэхэд хуучин огноо.
    """
    h = as_role("sanhuu")
    a = _asset(client, h)
    r = client.put(f"/api/barter/{a['id']}", headers=h, json={
        "type": "Машин", "name": "Ноён Приус", "date_in": iso(45),
        "value_in": 12_000_000})
    assert r.status_code == 200, r.text
    assert r.json()["date_in"] == iso(45)
    # Огноо өгөөгүй засвар нь хуучин огноог ХЭВЭЭР үлдээнэ
    r2 = client.put(f"/api/barter/{a['id']}", headers=h, json={
        "type": "Машин", "name": "Ноён Приус 2", "value_in": 12_000_000})
    assert r2.json()["date_in"] == iso(45)


def _barter_trail(client, h, aid: int) -> list[dict]:
    rows = client.get("/api/audit?entity=barter&limit=200", headers=h).json()["rows"]
    return [r for r in rows if r["entity_id"] == aid]


def test_every_barter_write_leaves_its_own_audit_row(client, as_role):
    """Үүсгэв · заслаа · зарав — гурвуулаа /audit дээр мөртэй."""
    h = as_role("otgoo")
    a = _asset(client, h, name="Аудит Крузер", value_in=30_000_000)
    client.put(f"/api/barter/{a['id']}", headers=h, json={
        "type": "Машин", "name": "Аудит Крузер", "value_in": 28_000_000})
    client.post(f"/api/barter/{a['id']}/sell", headers=h, json={
        "date": iso(0), "amount": 26_000_000, "sold_to": "Дорж"})
    trail = _barter_trail(client, h, a["id"])
    assert {r["action"] for r in trail} == {"create", "update", "sell"}
    upd = next(r for r in trail if r["action"] == "update")
    # Талбарын нэр МОНГОЛООР — «value_in» гэсэн үг Отгоо эгчид хоосон нүд
    assert "орж ирсэн үнэ" in upd["detail"]
    sold = next(r for r in trail if r["action"] == "sell")
    assert "Дорж" in sold["detail"] and "зөрүү" in sold["detail"]
    assert all((r["user_name"] or "").strip() for r in trail)


def test_to_stock_leaves_an_audit_row_and_a_warehouse_line(client, as_role):
    """Нөөц рүү орох зам НЭГ: агуулахын залруулгын дэвтэрт ч мөр үлдэнэ."""
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Тулаас В2")
    st = next(s for s in m["stock"] if s["grade"] == "шинэ")
    a = _asset(client, h, type="Материал", name="Тулаас В2 · 100ш",
               value_in=5_500_000)
    r = client.post(f"/api/barter/{a['id']}/to-stock", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"], "qty": 100})
    assert r.status_code == 200 and r.json()["status"] == "stocked"
    trail = _barter_trail(client, h, a["id"])
    to_stock = next(r for r in trail if r["action"] == "to_stock")
    assert "Тулаас В2" in to_stock["detail"] and "100" in to_stock["detail"]
    after = next(s for s in next(x for x in client.get("/api/materials", headers=h).json()
                                 if x["id"] == m["id"])["stock"]
                 if s["grade_id"] == st["grade_id"])["on_hand"]
    assert after == st["on_hand"] + 100


def test_to_stock_follows_the_screen_finance_yes_factory_no(client, as_role):
    """Дэлгэц «Нөөцөд оруулах»-ыг САНХҮҮД харуулдаг — сервер ч түүнийг хүлээнэ.

    Урьд нь сервер менежер + ҮЙЛДВЭРИЙН ДАРГА гэж хаадаг байв: санхүүч
    өөрт нь харагдаж байгаа товчоо дараад 403 иддэг, харин дарга нь тэр
    товчийг огт олохгүй. Гарын авлагаар бартер нь САНХҮҮГИЙНХ.
    """
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Тулаас В2")
    st = next(s for s in m["stock"] if s["grade"] == "шинэ")
    body = {"material_id": m["id"], "grade_id": st["grade_id"], "qty": 5}

    a1 = _asset(client, h, type="Материал", name="Санхүүгийн тулаас", value_in=100_000)
    assert client.post(f"/api/barter/{a1['id']}/to-stock",
                       headers=as_role("sanhuu"), json=body).status_code == 200

    a2 = _asset(client, h, type="Материал", name="Даргын тулаас", value_in=100_000)
    r = client.post(f"/api/barter/{a2['id']}/to-stock", headers=as_role("darga"), json=body)
    assert r.status_code == 403
    assert "санхүү" in r.json()["detail"]


def test_voiding_a_barter_payment_writes_the_barter_row_too(client, as_role):
    """Төлбөр цуцлахад хөрөнгө нь ХҮЧИНГҮЙ болно — тэр нь БАРТЕРЫН явдал."""
    h = as_role("otgoo")
    p = client.post("/api/payments", headers=h, json={
        "client_id": 1, "date": iso(0), "amount": 3_000_000,
        "method": "BARTER", "barter_desc": "Цуцлагдах чиргүүл"}).json()
    aid = next(x for x in client.get("/api/barter", headers=h).json()["assets"]
               if x["payment_id"] == p["id"])["id"]
    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "буруу бүртгэсэн"}).status_code == 200
    trail = _barter_trail(client, h, aid)
    void = next(r for r in trail if r["action"] == "void")
    assert "ХҮЧИНГҮЙ" in void["detail"] and "буруу бүртгэсэн" in void["detail"]
    assert next(x for x in client.get("/api/barter", headers=h).json()["assets"]
                if x["id"] == aid)["status"] == "voided"

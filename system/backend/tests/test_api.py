"""API-ийн аюулгүйн тор (characterization suite).

Одоогийн зөв зан төлөвийг түгжинэ — ямар нэг өөрчлөлт эдгээрийг улаан болговол
тэр нь санамсаргүй эвдрэл гэсэн үг. Шинэ feature бүр эхлээд ЭНД унадаг тестээ
авч байж кодлогдоно (TESTING.md-г үз).
"""
from datetime import date, timedelta


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def make_contract(client, as_role, days_ago=40, qty=100, deposit=0):
    """Туслах: шинэ харилцагч + гэрээ үүсгээд (client_id, contract_id, mat, grade) буцаана."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": f"Т{days_ago}-{qty} ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    r = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(days_ago),
        "penalty_percent": 0.5, "deposit": deposit,
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": qty, "daily_rate": 330}]})
    assert r.status_code == 200, r.text
    return cl["id"], r.json()["id"], m, st


# ---------- Auth ба эрх ----------

def test_login_ok(client):
    r = client.post("/api/auth/login", json={"username": "otgoo", "password": "1234"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "manager"


def test_login_wrong_password_401(client):
    r = client.post("/api/auth/login", json={"username": "otgoo", "password": "буруу"})
    assert r.status_code == 401


def test_no_token_401(client):
    assert client.get("/api/dashboard").status_code == 401


def test_factory_cannot_manage_grades_403(client, as_role):
    r = client.post("/api/grades", json={"code": "X", "name": "X"}, headers=as_role("darga"))
    assert r.status_code == 403


def test_finance_cannot_create_contract_403(client, as_role):
    r = client.post("/api/contracts", headers=as_role("sanhuu"), json={
        "client_id": 1, "type": "rent", "start_date": iso(0), "items": []})
    assert r.status_code == 403


# ---------- Гэрээ, ачилт, нөөц ----------

def test_contract_creates_pending_shipment_stock_untouched(client, as_role):
    h = as_role("otgoo")
    mats0 = client.get("/api/materials", headers=h).json()
    m0 = next(x for x in mats0 if x["name"] == "Хэв хашмал 6012")
    before = next(s for s in m0["stock"] if s["grade"] == "А")["on_hand"]
    _, cid, m, st = make_contract(client, as_role, days_ago=1, qty=200)
    # ачилт pending — нөөц ХӨДЛӨӨГҮЙ байх ёстой
    mats1 = client.get("/api/materials", headers=h).json()
    after = next(s for s in next(x for x in mats1 if x["id"] == m["id"])["stock"] if s["grade"] == "А")["on_hand"]
    assert after == before
    dash = client.get("/api/dashboard", headers=as_role("darga")).json()
    assert any(p["contract_id"] == cid for p in dash["pending_shipments"])


def test_confirm_shipment_moves_stock(client, as_role):
    h = as_role("darga")
    _, cid, m, st = make_contract(client, as_role, days_ago=1, qty=200)
    dash = client.get("/api/dashboard", headers=h).json()
    mv = next(p for p in dash["pending_shipments"] if p["contract_id"] == cid)
    before = client.get("/api/materials", headers=h).json()
    b = next(s for s in next(x for x in before if x["id"] == m["id"])["stock"] if s["grade"] == "А")
    assert client.post(f"/api/movements/{mv['id']}/confirm", headers=h).status_code == 200
    after = client.get("/api/materials", headers=h).json()
    a = next(s for s in next(x for x in after if x["id"] == m["id"])["stock"] if s["grade"] == "А")
    assert a["on_hand"] == b["on_hand"] - 200
    assert a["on_rent"] == b["on_rent"] + 200


def test_contract_insufficient_stock_400(client, as_role):
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Хэтрүүлэгч ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    r = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(0),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": st["on_hand"] + 999999, "daily_rate": 330}]})
    assert r.status_code == 400
    assert "хүрэлцэхгүй" in r.json()["detail"]


def test_auto_numbering_never_collides(client, as_role):
    """Регресс: автомат дугаарлалт байгаа дугаартай мөргөлддөг байсан."""
    _, c1, *_ = make_contract(client, as_role, days_ago=2, qty=10)
    _, c2, *_ = make_contract(client, as_role, days_ago=3, qty=10)
    h = as_role("otgoo")
    all_no = [c["no"] for c in client.get("/api/contracts", headers=h).json()]
    assert len(all_no) == len(set(all_no))


def test_return_more_than_out_400(client, as_role):
    _, cid, m, st = make_contract(client, as_role, days_ago=5, qty=50)
    h = as_role("darga")
    dash = client.get("/api/dashboard", headers=h).json()
    mv = next(p for p in dash["pending_shipments"] if p["contract_id"] == cid)
    client.post(f"/api/movements/{mv['id']}/confirm", headers=h)
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 999}]})
    assert r.status_code == 400


def test_return_with_regrade_repair_writeoff_charges(client, as_role):
    _, cid, m, st = make_contract(client, as_role, days_ago=5, qty=100)
    h = as_role("darga")
    dash = client.get("/api/dashboard", headers=h).json()
    mv = next(p for p in dash["pending_shipments"] if p["contract_id"] == cid)
    client.post(f"/api/movements/{mv['id']}/confirm", headers=h)
    grades = client.get("/api/grades", headers=h).json()
    gB = next(g["id"] for g in grades if g["code"] == "В")
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40,
                   "return_grade_id": gB, "repair_qty": 10, "writeoff_qty": 5}]})
    assert r.status_code == 200
    det = client.get(f"/api/contracts/{cid}", headers=h).json()
    ret = next(x for x in det["movements"] if x["type"] == "RETURN")
    ln = ret["lines"][0]
    assert ln["repair_fee"] == 10 * 15000          # засварын фикс (каталогоос)
    assert ln["writeoff_fee"] == 5 * 69500         # А зэрэглэлийн НБҮнэ
    assert det["items"][0]["qty"] == 60            # 100 - 40
    # UI-ийн live тооцоонд: мөр бүр засварын фикс + актын НБҮнэ-тэй ирнэ
    assert det["items"][0]["repair_fee"] == 15000
    assert det["items"][0]["writeoff_price"] == 69500


def test_close_with_goods_out_400(client, as_role):
    _, cid, *_ = make_contract(client, as_role, days_ago=5, qty=30)
    h = as_role("darga")
    dash = client.get("/api/dashboard", headers=h).json()
    mv = next(p for p in dash["pending_shipments"] if p["contract_id"] == cid)
    client.post(f"/api/movements/{mv['id']}/confirm", headers=h)
    r = client.post(f"/api/contracts/{cid}/close", headers=as_role("otgoo"))
    assert r.status_code == 400


# ---------- Төлбөр ----------

def test_payment_validation(client, as_role):
    h = as_role("sanhuu")
    bad = client.post("/api/payments", headers=h, json={
        "client_id": 1, "date": iso(0), "amount": -5, "method": "CASH"})
    assert bad.status_code == 400
    no_desc = client.post("/api/payments", headers=h, json={
        "client_id": 1, "date": iso(0), "amount": 100, "method": "BARTER", "barter_desc": ""})
    assert no_desc.status_code == 400


def test_payment_allocates_oldest_first(client, as_role):
    h = as_role("sanhuu")
    # Seed дэх Алтан Гадас (id 1) хэтэрсэн нэхэмжлэлтэй
    prof = client.get("/api/clients/1", headers=h).json()
    open_invs = sorted([i for i in prof["invoices"] if i["outstanding"] > 0],
                       key=lambda i: i["due_date"])
    assert open_invs, "seed-д нээлттэй нэхэмжлэл байх ёстой"
    oldest = open_invs[0]
    r = client.post("/api/payments", headers=h, json={
        "client_id": 1, "date": iso(0), "amount": 1000, "method": "CASH"})
    assert r.status_code == 200 and r.json()["allocated"] == 1000
    prof2 = client.get("/api/clients/1", headers=h).json()
    updated = next(i for i in prof2["invoices"] if i["id"] == oldest["id"])
    assert updated["paid"] == oldest["paid"] + 1000


# ---------- PDF ----------

def test_invoice_and_act_pdf(client, as_role):
    h = as_role("sanhuu")
    det = client.get("/api/contracts/1", headers=h).json()
    inv = det["invoices"][0]
    p1 = client.get(f"/api/invoices/{inv['id']}/pdf", headers=h)
    p2 = client.get("/api/contracts/1/act-pdf", headers=h)
    assert p1.status_code == 200 and p1.content[:4] == b"%PDF"
    assert p2.status_code == 200 and p2.content[:4] == b"%PDF"


# ---------- Дашбоард ----------

def test_dashboard_scope_sums(client, as_role):
    h = as_role("otgoo")
    all_ = client.get("/api/dashboard?scope=all", headers=h).json()["kpi"]
    rent = client.get("/api/dashboard?scope=rent", headers=h).json()["kpi"]
    sale = client.get("/api/dashboard?scope=sale", headers=h).json()["kpi"]
    assert abs((rent["receivable"] + sale["receivable"]) - all_["receivable"]) <= 2
    assert rent["active_contracts"] + sale["active_contracts"] == all_["active_contracts"]


# ---------- Агуулах ----------

def test_stock_adjust_and_repair_done(client, as_role):
    h = as_role("darga")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Труба 2м")
    st = m["stock"][0]
    r = client.post("/api/stock/adjust", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"], "on_hand": 777})
    assert r.status_code == 200
    mats2 = client.get("/api/materials", headers=h).json()
    st2 = next(s for s in next(x for x in mats2 if x["id"] == m["id"])["stock"]
               if s["grade_id"] == st["grade_id"])
    assert st2["on_hand"] == 777
    # засварт байгаагаас ихийг гаргаж болохгүй
    bad = client.post("/api/stock/repair-done", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"], "qty": 99999})
    assert bad.status_code == 400

"""API-ийн аюулгүйн тор (characterization suite).

Одоогийн зөв зан төлөвийг түгжинэ — ямар нэг өөрчлөлт эдгээрийг улаан болговол
тэр нь санамсаргүй эвдрэл гэсэн үг. Шинэ feature бүр эхлээд ЭНД унадаг тестээ
авч байж кодлогдоно (TESTING.md-г үз).
"""
import contextlib
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


def _confirm_pending(client, as_role, cid):
    """Тухайн гэрээний хүлээгдэж буй бүх ачилтыг баталгаажуулна."""
    h = as_role("darga")
    dash = client.get("/api/dashboard", headers=h).json()
    for p in dash["pending_shipments"]:
        if p["contract_id"] == cid:
            assert client.post(f"/api/movements/{p['id']}/confirm", headers=h).status_code == 200


def test_add_movement_stamps_and_accepts_rate(client, as_role):
    """Нэмэлт олголт өөрийн тарифтай бүртгэгдэнэ; тариф заагаагүй мөр гэрээний
    тарифаар ТАМГАЛАГДАНА — тул хожим гэрээний тариф өөрчлөгдөхөд хөдлөхгүй."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)   # тариф 330
    _confirm_pending(client, as_role, cid)

    # 1) тарифтай нэмэлт олголт — 500₮
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(10), "note": "Нэмэлт олголт",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 50, "rate": 500}]})
    assert r.status_code == 200, r.text
    # 2) тарифгүй нэмэлт олголт — гэрээний 330-аар тамгалагдана
    r2 = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 30}]})
    assert r2.status_code == 200, r2.text
    _confirm_pending(client, as_role, cid)

    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert d["day_amount"] == 130 * 330 + 50 * 500        # 42,900 + 25,000
    assert d["day_amount"] == 67_900

    # гэрээний тарифыг ТААРАХГҮЙ old_rate-аар солиход тамгалагдсан мөрүүд хэвээр
    assert client.patch(f"/api/contracts/{cid}/items", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"],
        "daily_rate": 700, "old_rate": 999}).status_code == 200
    d2 = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert d2["day_amount"] == 67_900


def test_contract_detail_groups_items_by_rate(client, as_role):
    """Материалын хүснэгт ПАДАНГААР задарна: нэг материал өөр тарифтай хоёр мөр."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)   # тариф 330
    _confirm_pending(client, as_role, cid)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(10), "note": "Нэмэлт олголт",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 50, "rate": 300}]})
    _confirm_pending(client, as_role, cid)

    rows = client.get(f"/api/contracts/{cid}", headers=h).json()["items"]
    assert len(rows) == 2
    by_rate = {r["daily_rate"]: r for r in rows}
    assert set(by_rate) == {330, 300}
    assert by_rate[330]["qty"] == 100 and by_rate[330]["day_amount"] == 33_000
    assert by_rate[300]["qty"] == 50 and by_rate[300]["day_amount"] == 15_000
    # UI-ийн талбарууд ХЭВЭЭР (ContractDetail.tsx өөрчлөлтгүй уншина)
    assert {"material_id", "material", "grade_id", "grade", "qty", "daily_rate",
            "unit_price", "day_amount", "repair_fee", "writeoff_price"} <= set(rows[0])
    assert rows[0]["material"] == m["name"] and rows[0]["grade"] == "А"
    assert rows[0]["repair_fee"] == 15000 and rows[0]["writeoff_price"] == 69500


# ---------- Хөдөлгөөн засах (X5) ----------

def _movements(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()["movements"]


def test_movement_line_edit_free_when_uninvoiced(client, as_role):
    """Нэхэмжлэгдээгүй циклийн хөдөлгөөнийг ЧӨЛӨӨТЭЙ засна — дахин бодолт хэрэггүй.

    100ш → 120ш: агуулахын нөөц (on_rent) шууд дагана, өдрийн тооцоо шинэчлэгдэнэ.
    Буцаалтын мөр засагдахад засварын дүн каталогоос ДАХИН бодогдоно.
    """
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    _confirm_pending(client, as_role, cid)
    before = next(s for s in next(x for x in client.get("/api/materials", headers=h).json()
                                  if x["id"] == m["id"])["stock"] if s["grade"] == "А")
    assert before["on_rent"] >= 100

    issue = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    r = client.patch(f"/api/movement-lines/{issue['lines'][0]['id']}", headers=h,
                     json={"qty": 120})
    assert r.status_code == 200, r.text
    assert "rebuild_required" not in r.json()

    after = next(s for s in next(x for x in client.get("/api/materials", headers=h).json()
                                 if x["id"] == m["id"])["stock"] if s["grade"] == "А")
    assert after["on_rent"] == before["on_rent"] + 20
    assert after["on_hand"] == before["on_hand"] - 20
    det = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert det["day_amount"] == 120 * 330
    assert det["invoices"] == []

    # буцаалтын мөр: 40ш буцав, 10 нь засварт → 150,000₮
    grades = client.get("/api/grades", headers=h).json()
    gB = next(g["id"] for g in grades if g["code"] == "В")
    bB = next(s for s in next(x for x in client.get("/api/materials", headers=h).json()
                              if x["id"] == m["id"])["stock"] if s["grade"] == "В")
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40,
                   "return_grade_id": gB, "repair_qty": 10}]}).status_code == 200
    ret = next(x for x in _movements(client, h, cid) if x["type"] == "RETURN")
    assert ret["lines"][0]["repair_fee"] == 10 * 15000

    r2 = client.patch(f"/api/movement-lines/{ret['lines'][0]['id']}", headers=h,
                      json={"qty": 30})
    assert r2.status_code == 200, r2.text
    det2 = client.get(f"/api/contracts/{cid}", headers=h).json()
    ret2 = next(x for x in det2["movements"] if x["type"] == "RETURN")
    assert ret2["lines"][0]["qty"] == 30
    assert ret2["lines"][0]["repair_fee"] == 10 * 15000     # каталогоос дахин бодогдов
    assert det2["items"][0]["qty"] == 90                    # 120 − 30
    # нөөц ЯГ УРВУУГААР буцаж дахин тусгагдав (30 = 20 бүтэн + 10 засварт)
    mat = next(x for x in client.get("/api/materials", headers=h).json() if x["id"] == m["id"])
    sA = next(s for s in mat["stock"] if s["grade"] == "А")
    sB = next(s for s in mat["stock"] if s["grade"] == "В")
    assert sA["on_rent"] == before["on_rent"] + 20 - 30
    assert sB["in_repair"] == bB["in_repair"] + 10
    assert sB["on_hand"] == bB["on_hand"] + 20


def test_movement_edit_into_invoiced_cycle_dry_run_then_confirm(client, as_role):
    """Нэхэмжлэгдсэн циклийн тоог засахад ЭХЛЭЭД зөрүүг харуулна (юу ч хадгалахгүй),
    зөвхөн баталгаажуулсны дараа нэхэмжлэл дахин бодогдоно.

    100ш → 90ш: 990,000₮ → 891,000₮. Төлсөн мөнгө шинэ нэхэмжлэлдээ дагаж очно."""
    h = as_role("otgoo")
    hf = as_role("sanhuu")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    client_id = client.get(f"/api/contracts/{cid}", headers=h).json()["client_id"]
    inv = _invoices(client, h, cid)[0]
    assert inv["total"] == 990_000
    assert client.post("/api/payments", headers=hf, json={
        "client_id": client_id, "contract_id": cid, "date": iso(0),
        "amount": 990_000, "method": "BANK"}).status_code == 200
    assert _invoices(client, h, cid)[0]["paid"] == 990_000

    issue = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    lid = issue["lines"][0]["id"]

    dry = client.patch(f"/api/movement-lines/{lid}", headers=h, json={"qty": 90})
    assert dry.status_code == 200, dry.text
    assert dry.json()["rebuild_required"] is True
    d = dry.json()["diffs"]
    assert len(d) == 1 and d[0]["old_total"] == 990_000 and d[0]["new_total"] == 891_000
    # ХУУРАЙ ажиллагаа — DB хөндөгдөөгүй
    assert _invoices(client, h, cid)[0]["total"] == 990_000
    assert client.get(f"/api/contracts/{cid}", headers=h).json()["day_amount"] == 100 * 330

    ok = client.patch(f"/api/movement-lines/{lid}", headers=h,
                      json={"qty": 90, "confirm": True})
    assert ok.status_code == 200, ok.text
    assert ok.json()["rebuilt"]["created"] == 1 and ok.json()["rebuilt"]["deleted"] == 1
    inv2 = _invoices(client, h, cid)[0]
    assert inv2["total"] == 891_000
    assert inv2["paid"] == 891_000            # төлбөр дагав
    with db_session() as db:
        from app import models
        assert db.query(models.PaymentAllocation).count() >= 1


def test_movement_date_edit_rejects_negative_timeline(client, as_role):
    """Огноог урагшлуулбал буцаалт нь олголтоос ӨМНӨ болж үлдэгдэл сөрөг болно —
    ийм засварыг систем хүлээж авахгүй (нягт → цэвэрхэн)."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=20, qty=100)
    _confirm_pending(client, as_role, cid)
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(10),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40}]
    }).status_code == 200

    issue = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    r = client.patch(f"/api/movements/{issue['id']}", headers=h, json={"date": iso(5)})
    assert r.status_code == 400
    assert "он цагийн дараалал" in r.json()["detail"]
    again = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    assert again["date"] == issue["date"]          # огноо хөндөгдөөгүй


def test_contract_start_date_gated(client, as_role):
    """Гэрээний эхлэх огноо: нэхэмжлэлтэй бол баталгаажуулалт шаардана,
    нэхэмжлэлгүй бол шууд солигдоно."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    assert _invoices(client, h, cid)[0]["total"] == 990_000

    dry = client.patch(f"/api/contracts/{cid}", headers=h,
                       json={"start_date": iso(45)})
    assert dry.status_code == 200, dry.text
    assert dry.json()["rebuild_required"] is True
    assert any(x["new_total"] == 825_000 for x in dry.json()["diffs"])   # 100×330×25
    assert client.get(f"/api/contracts/{cid}", headers=h).json()["start_date"] == iso(40)

    ok = client.patch(f"/api/contracts/{cid}", headers=h,
                      json={"start_date": iso(45), "confirm": True})
    assert ok.status_code == 200, ok.text
    assert ok.json()["rebuilt"]["created"] >= 1
    det = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert det["start_date"] == iso(45)
    assert sorted(i["total"] for i in det["invoices"])[0] == 825_000

    # нэхэмжлэлгүй гэрээнд шууд
    _, cid2, *_ = make_contract(client, as_role, days_ago=5, qty=10)
    free = client.patch(f"/api/contracts/{cid2}", headers=h, json={"start_date": iso(8)})
    assert free.status_code == 200 and "rebuild_required" not in free.json()
    assert client.get(f"/api/contracts/{cid2}", headers=h).json()["start_date"] == iso(8)


def test_audit_entities_movement_invoice(client, as_role):
    """Хөдөлгөөний засвар ба дахин бодолт БҮГД аудитад үлдэнэ."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    _invoices(client, h, cid)
    issue = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    assert client.patch(f"/api/movement-lines/{issue['lines'][0]['id']}", headers=h,
                        json={"qty": 90, "confirm": True}).status_code == 200

    mvs = client.get("/api/audit?entity=movement", headers=h).json()
    invs = client.get("/api/audit?entity=invoice", headers=h).json()
    assert any(r["action"] == "update" for r in mvs)
    assert any(r["action"] == "rebuild" for r in invs)


# ---------- Төлбөр ----------

def test_payment_validation(client, as_role):
    h = as_role("sanhuu")
    bad = client.post("/api/payments", headers=h, json={
        "client_id": 1, "date": iso(0), "amount": -5, "method": "CASH"})
    assert bad.status_code == 400
    no_desc = client.post("/api/payments", headers=h, json={
        "client_id": 1, "date": iso(0), "amount": 100, "method": "BARTER", "barter_desc": ""})
    assert no_desc.status_code == 400


def _invoices(client, h, cid):
    """Гэрээний нэхэмжлэлүүд, due_date-аар эрэмбэлэгдсэн (GET нь ensure_invoices-ыг хөдөлгөнө)."""
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    return sorted(d["invoices"], key=lambda i: i["due_date"])


@contextlib.contextmanager
def db_session():
    """Тестийн DB session — хуваарилалтын мөрүүдийг шууд шалгахад."""
    from app.db import get_db
    from app.main import app
    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    try:
        yield db
    finally:
        gen.close()


def test_payment_endpoint_books_before_allocating(client, as_role):
    """Төлбөр бүртгэх агшинд алданги ЭХЛЭЭД бүртгэгдэнэ: 10 хоног хэтэрсэн
    990,000₮-ийн нэхэмжлэлийг бүтэн төлөхөд 49,500₮ алданги ҮЛДЭНЭ
    (хуучин амьд томьёогоор бол төлөнгүүт 0 болж УСТАХ байсан)."""
    h = as_role("sanhuu")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    inv = _invoices(client, h, cid)[0]
    assert inv["total"] == 990_000 and inv["outstanding"] == 990_000

    r = client.post("/api/payments", headers=h, json={
        "client_id": client.get(f"/api/contracts/{cid}", headers=h).json()["client_id"],
        "contract_id": cid, "date": iso(0), "amount": 990_000, "method": "BANK"})
    assert r.status_code == 200, r.text
    assert r.json()["allocated"] == 990_000

    after = _invoices(client, h, cid)[0]
    assert after["outstanding"] == 0
    assert after["penalty"] == 49_500          # 990,000 × 0.005 × 10 хоног
    assert after["penalty_due"] == 49_500      # бүртгэгдсэн — хуваарилж болно
    assert after["status"] == "penalty"


def test_manual_allocation_directed(client, as_role):
    """Гараар чиглүүлсэн хуваарилалт: ШИНЭ нэхэмжлэл рүү заавал явуулахад
    хуучин нь нээлттэй байсан ч тэр нэхэмжлэл хаагдана; үлдсэн 10,000₮
    автоматаар ХУУЧИН нэхэмжлэл рүү орно."""
    h = as_role("sanhuu")
    _, cid, m, st = make_contract(client, as_role, days_ago=70, qty=100)
    _confirm_pending(client, as_role, cid)
    client_id = client.get(f"/api/contracts/{cid}", headers=h).json()["client_id"]
    old, new = _invoices(client, h, cid)
    assert old["total"] == 990_000 and new["total"] == 990_000

    r = client.post("/api/payments", headers=h, json={
        "client_id": client_id, "contract_id": cid, "date": iso(0),
        "amount": 1_000_000, "method": "BANK",
        "allocations": [{"invoice_id": new["id"], "amount": 990_000}]})
    assert r.status_code == 200, r.text
    assert r.json()["allocated"] == 1_000_000

    old2, new2 = _invoices(client, h, cid)
    assert new2["outstanding"] == 0 and new2["paid"] == 990_000
    assert old2["paid"] == 10_000                    # үлдсэн нь автоматаар хуучин руу
    assert old2["outstanding"] == 980_000
    with db_session() as db:
        from app import models
        rows = db.query(models.PaymentAllocation).filter_by(payment_id=r.json()["id"]).all()
        directed = [a for a in rows if a.invoice_id == new2["id"]]
        assert [a.manual for a in directed] == [1]
        assert [a.manual for a in rows if a.invoice_id == old2["id"]] == [0]


def test_manual_allocation_validation(client, as_role):
    """Гараар хуваарилалт нягт байх ёстой: өөр харилцагчийн нэхэмжлэл,
    төлбөрөөс их нийлбэр, өртэй дүнгээс их хуваарилалт — бүгд 400."""
    h = as_role("sanhuu")
    _, cid, *_ = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    client_id = client.get(f"/api/contracts/{cid}", headers=h).json()["client_id"]
    inv = _invoices(client, h, cid)[0]
    # өөр харилцагчийн гэрээ
    _, other_cid, *_ = make_contract(client, as_role, days_ago=41, qty=100)
    _confirm_pending(client, as_role, other_cid)
    other_inv = _invoices(client, h, other_cid)[0]

    foreign = client.post("/api/payments", headers=h, json={
        "client_id": client_id, "date": iso(0), "amount": 100_000, "method": "CASH",
        "allocations": [{"invoice_id": other_inv["id"], "amount": 100_000}]})
    assert foreign.status_code == 400
    assert "харилцагч" in foreign.json()["detail"]

    over_sum = client.post("/api/payments", headers=h, json={
        "client_id": client_id, "date": iso(0), "amount": 100_000, "method": "CASH",
        "allocations": [{"invoice_id": inv["id"], "amount": 150_000}]})
    assert over_sum.status_code == 400

    over_due = client.post("/api/payments", headers=h, json={
        "client_id": client_id, "date": iso(0), "amount": 5_000_000, "method": "CASH",
        "allocations": [{"invoice_id": inv["id"], "amount": 2_000_000}]})
    assert over_due.status_code == 400
    # 400 буусан хүсэлт төлбөр ҮЛДЭЭХГҮЙ
    assert client.get(f"/api/payments?client_id={client_id}", headers=h).json() == []


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


def test_sale_invoice_pdf(client, as_role):
    """ХУДАЛДААНЫ нэхэмжлэлийн PDF. SALE-ийн detail_json нь ХАВТГАЙ жагсаалт
    (`[{material_id,...}]`) тул `detail.get(...)`-ыг isinstance шалгахаас ӨМНӨ
    дуудвал `AttributeError: 'list' object has no attribute 'get'` шидэж, route
    500 болно. Гэрээ 5 (26/06) нь худалдаа — түүний нэхэмжлэлийн PDF 200 + %PDF
    буцаах ёстой."""
    h = as_role("sanhuu")
    det = client.get("/api/contracts/5", headers=h).json()
    assert det["type"] == "sale", "гэрээ 5 худалдаа байх ёстой"
    inv = det["invoices"][0]
    r = client.get(f"/api/invoices/{inv['id']}/pdf", headers=h)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"


def test_invoice_appendix_pdf(client, as_role):
    """Нэхэмжлэлийн түрээсийн хавсралт — зурвас бүрээр задарсан хуудас."""
    h = as_role("sanhuu")
    det = client.get("/api/contracts/1", headers=h).json()
    inv = det["invoices"][0]
    r = client.get(f"/api/invoices/{inv['id']}/appendix-pdf", headers=h)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"


def test_cycle_appendix_pdf(client, as_role):
    """Явагдаж буй циклийн хавсралт — гэрээ 1 (24/03) нээлттэй, 155 хоногтой
    тул сүүлийн цикл нь дуусаагүй байна."""
    h = as_role("sanhuu")
    assert client.get("/api/contracts/1", headers=h).json()["cycle"], "амьд цикл байх ёстой"
    r = client.get("/api/contracts/1/cycle-appendix-pdf", headers=h)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"


def test_appendix_pdf_rejects_an_invoice_without_a_cycle(client, as_role):
    """Худалдааны нэхэмжлэлд түрээсийн цонх байхгүй (cycle_end == cycle_start)."""
    h = as_role("sanhuu")
    det = client.get("/api/contracts/5", headers=h).json()
    assert det["type"] == "sale"
    inv = det["invoices"][0]
    assert client.get(f"/api/invoices/{inv['id']}/appendix-pdf", headers=h).status_code == 400
    assert client.get("/api/contracts/5/cycle-appendix-pdf", headers=h).status_code == 400


def test_appendix_pdf_filename_has_no_slash(client, as_role):
    """Гэрээний дугаар `24/03` тул нэхэмжлэл нь `R-24/03-1` — түүхий `/`
    Content-Disposition-д орвол хөтөч файлын нэрийг таслана."""
    h = as_role("sanhuu")
    det = client.get("/api/contracts/1", headers=h).json()
    inv = det["invoices"][0]
    assert "/" in inv["no"], "seed-ийн гэрээний дугаар ташуу зураастай байх ёстой"
    r = client.get(f"/api/invoices/{inv['id']}/appendix-pdf", headers=h)
    assert r.status_code == 200
    assert "/" not in r.headers["content-disposition"]


def test_invoice_pdf_filename_has_no_slash(client, as_role):
    """Хуучин нэхэмжлэлийн PDF зам ч ижил алдаатай байсан — `_safe()` засна."""
    h = as_role("sanhuu")
    det = client.get("/api/contracts/1", headers=h).json()
    inv = det["invoices"][0]
    assert "/" in inv["no"]
    r = client.get(f"/api/invoices/{inv['id']}/pdf", headers=h)
    assert r.status_code == 200
    assert "/" not in r.headers["content-disposition"]


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

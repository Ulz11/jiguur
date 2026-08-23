"""Шинэ 8 боломж — TDD.

1) Барьцааны мөчлөг  2) Бартерын зогсонги хугацаа  3) Материалын ашигт байдал
4) Мөнгөний урсгалын прогноз  5) Авлага цуглуулах  6) Утсаар тооллого
7) Гэрээний PDF  8) Audit log
"""
from datetime import date, timedelta


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def mk_contract(client, as_role, qty=100, deposit=0, days_ago=40):
    """Гэрээ үүсгээд ачилтыг баталгаажуулна."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": f"Ф-{days_ago}-{qty}-{deposit} ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    c = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(days_ago),
        "penalty_percent": 0.5, "deposit": deposit,
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": qty, "daily_rate": 330}]}).json()
    hd = as_role("darga")
    dash = client.get("/api/dashboard", headers=hd).json()
    mv = next(p for p in dash["pending_shipments"] if p["contract_id"] == c["id"])
    client.post(f"/api/movements/{mv['id']}/confirm", headers=hd)
    return cl, c, m, st


# ============ 1. Барьцааны мөчлөг ============

def test_deposit_settle_apply_and_return(client, as_role):
    """Барьцаа 10 сая: 6 саяг авлагад суутгаж, 4 саяг буцаана.
    (400ш × 330₮ × 30 хоног × 2 цикл ≈ 7.9 сая өртэй тул 6 сая бүрэн суутгагдана.)"""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=400, deposit=10_000_000, days_ago=70)
    before = client.get(f"/api/clients/{cl['id']}", headers=h).json()["receivable"]
    assert before > 6_000_000, "тестийн урьдчилсан нөхцөл: өр суутгах дүнгээс их байх ёстой"
    r = client.post(f"/api/contracts/{c['id']}/settle-deposit", headers=h, json={
        "date": iso(0), "apply_amount": 6_000_000, "return_amount": 4_000_000})
    assert r.status_code == 200, r.text
    d = client.get(f"/api/contracts/{c['id']}", headers=h).json()
    assert d["deposit_status"] == "settled"
    assert d["deposit_applied"] == 6_000_000 and d["deposit_returned"] == 4_000_000
    after = client.get(f"/api/clients/{cl['id']}", headers=h).json()["receivable"]
    assert before - after == 6_000_000, "суутгасан дүнгээр авлага буурах ёстой"


def test_deposit_apply_over_debt_becomes_credit(client, as_role):
    """Барьцаа өрөөс их бол ҮҮССЭН нэхэмжлэлүүд бүрэн хаагдана.
    Дуусаагүй циклийн хуримтлал нэхэмжлэл болоогүй тул кредит нь түүнд суухгүй —
    цикл хаагдахад автоматаар суусна."""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=9_000_000, days_ago=70)
    prof = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    invoiced = sum(i["outstanding"] for i in prof["invoices"])
    assert 0 < invoiced < 9_000_000
    client.post(f"/api/contracts/{c['id']}/settle-deposit", headers=h, json={
        "date": iso(0), "apply_amount": 9_000_000, "return_amount": 0})
    prof2 = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    assert sum(i["outstanding"] for i in prof2["invoices"]) == 0, "нэхэмжлэлүүд бүрэн хаагдана"
    det = client.get(f"/api/contracts/{c['id']}", headers=h).json()
    assert prof2["receivable"] == round(det["cycle"]["accrued"]), \
        "үлдсэн нь зөвхөн хуримтлагдаж буй дүн"


def test_deposit_cannot_exceed(client, as_role):
    h = as_role("otgoo")
    _, c, *_ = mk_contract(client, as_role, qty=20, deposit=1_000_000, days_ago=35)
    bad = client.post(f"/api/contracts/{c['id']}/settle-deposit", headers=h, json={
        "date": iso(0), "apply_amount": 900_000, "return_amount": 500_000})
    assert bad.status_code == 400
    ok = client.post(f"/api/contracts/{c['id']}/settle-deposit", headers=h, json={
        "date": iso(0), "apply_amount": 0, "return_amount": 1_000_000})
    assert ok.status_code == 200
    again = client.post(f"/api/contracts/{c['id']}/settle-deposit", headers=h, json={
        "date": iso(0), "apply_amount": 0, "return_amount": 1})
    assert again.status_code == 400, "давхар тооцоо хийж болохгүй"


# ============ 2. Бартерын зогсонги хугацаа ============

def test_barter_aging_and_stale_alert(client, as_role):
    h = as_role("otgoo")
    fresh = client.post("/api/barter", headers=h, json={
        "type": "Машин", "name": "Шинэ бартер", "date_in": iso(10),
        "value_in": 20_000_000, "asking_price": 24_000_000}).json()
    old = client.post("/api/barter", headers=h, json={
        "type": "Байр", "name": "Хуучин бартер", "date_in": iso(400),
        "value_in": 100_000_000, "asking_price": 100_000_000}).json()
    d = client.get("/api/barter", headers=h).json()
    f = next(a for a in d["assets"] if a["id"] == fresh["id"])
    o = next(a for a in d["assets"] if a["id"] == old["id"])
    assert f["days_held"] == 10 and o["days_held"] == 400
    assert f["stale"] is False and o["stale"] is True
    assert d["summary"]["stale_count"] >= 1
    assert d["summary"]["stale_value"] >= 100_000_000
    # дашбоард дээр зогсонги хөрөнгийн мэдэгдэл гарна
    notes = client.get("/api/dashboard", headers=h).json()["notifications"]
    assert any(n["kind"] == "barter_stale" for n in notes)


# ============ 3. Материалын ашигт байдал ============

def test_material_yield_report(client, as_role):
    h = as_role("otgoo")
    mk_contract(client, as_role, qty=200, days_ago=90)
    r = client.get("/api/reports/materials?months=6", headers=h)
    assert r.status_code == 200
    rows = r.json()["rows"]
    m = next(x for x in rows if x["material"] == "Хэв хашмал 6012")
    assert m["revenue"] > 0
    assert m["asset_value"] > 0
    assert m["utilization"] > 0
    assert m["yield_percent"] == round(m["revenue"] / m["asset_value"] * 100, 1)
    assert rows == sorted(rows, key=lambda x: -x["yield_percent"])


# ============ 4. Мөнгөний урсгалын прогноз ============

def test_cash_forecast_buckets(client, as_role):
    h = as_role("sanhuu")
    r = client.get("/api/reports/forecast", headers=h)
    assert r.status_code == 200
    f = r.json()
    assert [b["label"] for b in f["buckets"]] == ["0–30 хоног", "31–60 хоног", "61–90 хоног"]
    for b in f["buckets"]:
        assert b["net"] == b["inflow"] - b["outflow"]
    assert f["buckets"][2]["cumulative"] == sum(b["net"] for b in f["buckets"])
    assert f["overdue_inflow"] >= 0        # хугацаа хэтэрсэн — огноогүй тул тусад нь
    assert f["legacy_inflow"] >= 0         # хуучин үлдэгдэл ч мөн адил
    assert f["monthly_loan_due"] > 0       # seed-д зээл бий


def test_forecast_projects_recurring_cycles(client, as_role):
    """Идэвхтэй түрээсийн гэрээ 30 хоног тутам дахин нэхэмжлэгдэх нь
    2, 3 дахь сарын прогнозод тусах ёстой."""
    mk_contract(client, as_role, qty=300, days_ago=5)
    f = client.get("/api/reports/forecast", headers=as_role("sanhuu")).json()
    assert f["buckets"][1]["inflow"] > 0, "31–60 хоногт цикл хаагдах орлого харагдана"
    assert f["buckets"][2]["inflow"] > 0, "61–90 хоногт мөн адил"


def test_forecast_excludes_opening_balance(db_session_free_client=None):
    """РЕГРЕСС: хуучин үлдэгдэл (OB-) прогнозын 30 хоногт орж ирэхгүй —
    эс бөгөөс эхний сар хэдэн тэрбумаар хэт өөдрөг харагдана."""
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db import Base
    from app import models
    from app.services import migration as M, analytics as A

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    cl = models.Client(name="Хуучин өртэй")
    db.add(cl)
    db.commit()
    M.create_opening_balance(db, cl, 500_000_000, date.today())
    f = A.cash_forecast(db, date.today())
    assert f["buckets"][0]["inflow"] == 0, "OB үлдэгдэл 30 хоногийн прогнозд орохгүй"
    assert f["legacy_inflow"] == 500_000_000
    db.close()


# ============ 5. Авлага цуглуулах ============

def test_collections_worklist_and_promise(client, as_role):
    h = as_role("sanhuu")
    wl = client.get("/api/collections", headers=h)
    assert wl.status_code == 200
    rows = wl.json()["rows"]
    assert rows and rows == sorted(rows, key=lambda r: -r["overdue"])
    cid = rows[0]["client_id"]
    n = client.post(f"/api/clients/{cid}/notes", headers=h, json={
        "date": iso(0), "kind": "call", "note": "Маргааш төлнө гэв",
        "promise_date": iso(-3), "promise_amount": 5_000_000})
    assert n.status_code == 200
    wl2 = client.get("/api/collections", headers=h).json()["rows"]
    row = next(r for r in wl2 if r["client_id"] == cid)
    assert row["last_contact"] == iso(0)
    assert row["promise_amount"] == 5_000_000
    prof = client.get(f"/api/clients/{cid}", headers=h).json()
    assert len(prof["notes"]) == 1
    # амлалт биелүүлээгүй гэж тэмдэглэх
    nid = prof["notes"][0]["id"]
    assert client.patch(f"/api/notes/{nid}", headers=h, json={"status": "broken"}).status_code == 200


def test_factory_cannot_see_collections(client, as_role):
    assert client.get("/api/collections", headers=as_role("darga")).status_code == 403


# ============ 6. Утсаар тооллого ============

def test_stocktake_bulk(client, as_role):
    h = as_role("darga")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Тулаас В2")
    s = m["stock"][0]
    r = client.post("/api/stock/stocktake", headers=h, json={
        "date": iso(0), "note": "Сарын тооллого",
        "lines": [{"material_id": m["id"], "grade_id": s["grade_id"], "counted": s["on_hand"] - 12}]})
    assert r.status_code == 200
    assert r.json()["adjusted"] == 1
    assert r.json()["diff_total"] == -12
    mats2 = client.get("/api/materials", headers=h).json()
    s2 = next(x for x in next(y for y in mats2 if y["id"] == m["id"])["stock"] if x["grade_id"] == s["grade_id"])
    assert s2["on_hand"] == s["on_hand"] - 12


# ============ 7. Гэрээний PDF ============

def test_contract_pdf(client, as_role):
    h = as_role("otgoo")
    r = client.get("/api/contracts/1/pdf", headers=h)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"


# ============ 8. Audit log ============

def test_audit_records_changes(client, as_role):
    h = as_role("otgoo")
    client.patch("/api/contracts/1", headers=h, json={"penalty_percent": 0.7})
    rows = client.get("/api/audit?limit=50", headers=h)
    assert rows.status_code == 200
    logs = rows.json()
    top = logs[0]
    assert top["entity"] == "contract" and top["action"] == "update"
    assert "0.7" in top["detail"]
    assert top["user_name"]


def test_audit_manager_only(client, as_role):
    assert client.get("/api/audit", headers=as_role("sanhuu")).status_code == 403

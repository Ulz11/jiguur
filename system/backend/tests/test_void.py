"""ХҮЧИНГҮЙ БОЛГОХ (void) — засварын зам, устгалгүйгээр.

Отгоо эгч эхний долоо хоногтоо буруу дүн бичих нь БАТАЛГААТАЙ. Систем түүнийг
мөнхөд үлдээвэл тэр Excel рүү буцна (Чадварын харьцуулалт §3 H1 — №1 буцаагч).

Зарчим: **устгахгүй, ХҮЧИНГҮЙ болгоно.** Мөр нь хоёулаа харагдана, ХҮЧИНГҮЙ
тэмдэгтэй, шалтгаантай, хэн хэзээ цуцалсан нь audit-д үлдэнэ. Тооцоо нь
цуцлагдсан бичилтийг ОГТ хараагүй мэт ажиллана.
"""
from datetime import date, timedelta

from tests.test_api import iso, make_contract, _confirm_pending, _movements


def _invoices(client, h, cid):
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    return sorted(d["invoices"], key=lambda i: i["due_date"])


def _payments(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()["payments"]


def _no_penalty(client, as_role, cid):
    """Алдангийг унтраана — void-ийн тооцоог алдангийн чимээгүй өсөлт бүрхэхгүй."""
    h = as_role("otgoo")
    r = client.patch(f"/api/contracts/{cid}", headers=h, json={"penalty_percent": 0})
    assert r.status_code == 200, r.text


def _setup(client, as_role, days_ago=40, qty=100, penalty=False):
    """Гэрээ + баталгаажсан ачилт → нэхэмжлэлтэй, төлбөр хүлээж буй байдал."""
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    if not penalty:
        _no_penalty(client, as_role, cid)
    return cl_id, cid, m, st


def _pay(client, h, client_id, cid, amount, method="BANK", **extra):
    r = client.post("/api/payments", headers=h, json={
        "client_id": client_id, "contract_id": cid, "date": iso(0),
        "amount": amount, "method": method, **extra})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- 1. Хуваарилалт суларч, нэхэмжлэл дахин нээгдэнэ ----------

def test_void_releases_allocations_and_reopens_invoice(client, as_role):
    """990,000₮ бүтэн төлөөд цуцлахад нэхэмжлэл ЯГ хэвэндээ эргэж очно.

    Төлбөрийн мөр УСТАХГҮЙ — жагсаалтад ХҮЧИНГҮЙ тэмдэгтэй, шалтгаантай үлдэнэ.
    """
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    inv = _invoices(client, h, cid)[0]
    assert inv["total"] == 990_000

    p = _pay(client, h, cl_id, cid, 990_000)
    assert _invoices(client, h, cid)[0]["outstanding"] == 0

    r = client.post(f"/api/payments/{p['id']}/void", headers=h,
                    json={"reason": "Дүнг буруу бичсэн"})
    assert r.status_code == 200, r.text

    after = _invoices(client, h, cid)[0]
    assert after["paid"] == 0
    assert after["outstanding"] == 990_000
    assert after["status"] in ("open", "overdue")

    rows = _payments(client, h, cid)
    assert len(rows) == 1                      # УСТААГҮЙ — харагдсаар байна
    assert rows[0]["voided"] is True
    assert rows[0]["void_reason"] == "Дүнг буруу бичсэн"
    assert rows[0]["voided_at"]
    assert rows[0]["voided_by"]                # хэн цуцалсан нь мөрөн дээрээ


def test_void_writes_audit_entry(client, as_role):
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _pay(client, h, cl_id, cid, 500_000)
    client.post(f"/api/payments/{p['id']}/void", headers=h, json={"reason": "Давхар бичив"})

    trail = client.get("/api/audit?entity=payment", headers=as_role("otgoo")).json()
    assert any(a["action"] == "void" and a["entity_id"] == p["id"]
               and "Давхар бичив" in a["detail"] for a in trail)


def test_void_requires_reason(client, as_role):
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _pay(client, h, cl_id, cid, 100_000)
    r = client.post(f"/api/payments/{p['id']}/void", headers=h, json={"reason": "   "})
    assert r.status_code == 400
    assert "шалтгаан" in r.json()["detail"].lower()


def test_double_void_409(client, as_role):
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _pay(client, h, cl_id, cid, 100_000)
    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "алдаа"}).status_code == 200
    again = client.post(f"/api/payments/{p['id']}/void", headers=h,
                        json={"reason": "дахиад"})
    assert again.status_code == 409
    assert "хүчингүй" in again.json()["detail"].lower()


def test_factory_cannot_void_403(client, as_role):
    hf = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _pay(client, hf, cl_id, cid, 100_000)
    r = client.post(f"/api/payments/{p['id']}/void", headers=as_role("darga"),
                    json={"reason": "алдаа"})
    assert r.status_code == 403
    assert "эрх" in r.json()["detail"]


# ---------- 2. Алданги: төлөгдсөн нь суларна, БҮРТГЭГДСЭН нь үлдэнэ ----------

def test_void_releases_penalty_paid_but_booking_stays(client, as_role):
    """Монотон загвар: цуцлалт нь БҮРТГЭГДСЭН алдангийг устгахгүй.

    Алданги төлбөр бүртгэх агшинд хөлдсөн — тэр агшин бодит болсон.
    Цуцлалт нь зөвхөн ТӨЛӨГДСӨН гэсэн тэмдгийг сулруулна.
    """
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role, days_ago=40, penalty=True)
    p = _pay(client, h, cl_id, cid, 1_039_500)     # 990,000 + 49,500 алданги
    after_pay = _invoices(client, h, cid)[0]
    assert after_pay["penalty_due"] == 0           # алданги бүрэн төлөгдсөн

    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "буруу"}).status_code == 200

    inv = _invoices(client, h, cid)[0]
    assert inv["outstanding"] == 990_000
    assert inv["penalty_due"] == 49_500            # бүртгэгдсэн нь ХЭВЭЭР


# ---------- 3. Үлдсэн кредит цэвэрхэн дахин хуваарилагдана ----------

def test_void_reapplies_remaining_client_credit(client, as_role):
    """Хоёр нэхэмжлэл, хоёр төлбөр. Эхнийхийг цуцлахад ХОЁРДУГААР төлбөрийн
    хуваарилагдаагүй үлдэгдэл сулласан нэхэмжлэл рүү өөрөө очно."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role, days_ago=70)
    old, new = _invoices(client, h, cid)
    assert old["total"] == 990_000 and new["total"] == 990_000

    a = _pay(client, h, cl_id, cid, 990_000)          # хуучныг хаана
    b = _pay(client, h, cl_id, cid, 1_500_000)        # шинийг хаагаад 510,000 үлдэнэ
    assert b["unallocated"] == 510_000

    assert client.post(f"/api/payments/{a['id']}/void", headers=h,
                       json={"reason": "давхар бичив"}).status_code == 200

    old2, new2 = _invoices(client, h, cid)
    assert new2["paid"] == 990_000                    # хоёрдугаарх хөндөгдөөгүй
    assert old2["paid"] == 510_000                    # үлдсэн кредит өөрөө очив
    assert old2["outstanding"] == 480_000


def test_voided_payment_is_not_a_credit_source(client, as_role):
    """Цуцлагдсан төлбөрийн мөнгө «урьдчилсан төлбөр» болж үлдэхгүй —
    шинэ нэхэмжлэл төрөхөд түүнээс хэзээ ч хасагдахгүй."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role, days_ago=40)
    p = _pay(client, h, cl_id, cid, 3_000_000)        # хэт их — 2,010,000 кредит
    assert p["unallocated"] == 2_010_000
    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "нөгөө харилцагчийнх байсан"}).status_code == 200

    inv = _invoices(client, h, cid)[0]
    assert inv["paid"] == 0 and inv["outstanding"] == 990_000


# ---------- 4. Дахин бодолтын replay цуцлагдсаныг АЛГАСНА ----------

def test_voided_payment_skipped_by_rebuild_replay(client, as_role):
    """Цуцалсны дараа тооцоо дахин бодогдоход мөнгө нь БУЦАЖ ИРЭХГҮЙ.

    Rebuild нь харилцагчийн бүх төлбөрийг дахин тоглуулдаг — цуцлагдсан нь
    тэр жагсаалтад орвол засвар хийх бүрд алдаа дахин амилна.
    """
    h = as_role("sanhuu")
    ho = as_role("otgoo")
    cl_id, cid, m, st = _setup(client, as_role, days_ago=40)
    p = _pay(client, h, cl_id, cid, 990_000)
    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "алдаа"}).status_code == 200

    issue = next(x for x in _movements(client, ho, cid) if x["type"] == "ISSUE")
    lid = issue["lines"][0]["id"]
    ok = client.patch(f"/api/movement-lines/{lid}", headers=ho,
                      json={"qty": 90, "confirm": True})
    assert ok.status_code == 200, ok.text
    assert ok.json()["rebuilt"]["created"] == 1

    inv = _invoices(client, ho, cid)[0]
    assert inv["total"] == 891_000
    assert inv["paid"] == 0                    # цуцлагдсан мөнгө дахин наалдаагүй
    assert inv["outstanding"] == 891_000


# ---------- 5. Тайлан, дашбоардын нийлбэрээс хасагдана ----------

def test_voided_payment_excluded_from_revenue_and_cashflow(client, as_role):
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role, days_ago=40)

    before = client.get("/api/dashboard", headers=h).json()["revenue"]
    base_rent = sum(before["rent"])
    cash_before = sum(client.get("/api/reports", headers=h).json()["series"]["cash_in"])

    p = _pay(client, h, cl_id, cid, 990_000)
    mid = client.get("/api/dashboard", headers=h).json()["revenue"]
    assert sum(mid["rent"]) == base_rent + 990_000

    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "алдаа"}).status_code == 200

    after = client.get("/api/dashboard", headers=h).json()["revenue"]
    assert sum(after["rent"]) == base_rent
    cash_after = sum(client.get("/api/reports", headers=h).json()["series"]["cash_in"])
    assert cash_after == cash_before


def test_voided_penalty_allocation_leaves_pnl(client, as_role):
    """Алдангийн орлого КАССЫН зарчмаар бодогддог — цуцалсан мөнгө орлого биш."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role, days_ago=40, penalty=True)
    base = client.get("/api/reports", headers=h).json()["pnl"]["penalty_income"]
    p = _pay(client, h, cl_id, cid, 1_039_500)
    assert client.get("/api/reports", headers=h).json()["pnl"]["penalty_income"] == base + 49_500

    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "алдаа"}).status_code == 200
    assert client.get("/api/reports", headers=h).json()["pnl"]["penalty_income"] == base


# ---------- 6. Бартер — хөрөнгийн гинж ----------

def _barter_pay(client, h, cl_id, cid, amount=2_000_000, desc="Автомашин 9957УКК"):
    return _pay(client, h, cl_id, cid, amount, method="BARTER", barter_desc=desc)


def test_void_barter_payment_cascades_to_held_asset(client, as_role):
    """Бартер төлбөр цуцлахад автоматаар үүссэн хөрөнгө нь ч ХҮЧИНГҮЙ болно —
    эс бөгөөс байхгүй машин Бартерын жагсаалтад мөнхөд үлдэнэ."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _barter_pay(client, h, cl_id, cid)

    assets = client.get("/api/barter", headers=h).json()
    mine = next(a for a in assets["assets"] if a["payment_id"] == p["id"])
    assert mine["status"] == "held"
    held_value = assets["summary"]["held_value"]

    assert client.post(f"/api/payments/{p['id']}/void", headers=h,
                       json={"reason": "машин ирээгүй"}).status_code == 200

    after = client.get("/api/barter", headers=h).json()
    mine2 = next(a for a in after["assets"] if a["payment_id"] == p["id"])
    assert mine2["status"] == "voided"                      # мөр нь ХАРАГДСААР
    assert after["summary"]["held_value"] == held_value - 2_000_000
    assert after["summary"]["held_count"] == assets["summary"]["held_count"] - 1


def test_void_barter_payment_blocked_when_asset_sold_409(client, as_role):
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _barter_pay(client, h, cl_id, cid)
    aid = next(a for a in client.get("/api/barter", headers=h).json()["assets"]
               if a["payment_id"] == p["id"])["id"]
    assert client.post(f"/api/barter/{aid}/sell", headers=h,
                       json={"date": iso(0), "amount": 1_800_000}).status_code == 200

    r = client.post(f"/api/payments/{p['id']}/void", headers=h, json={"reason": "алдаа"})
    assert r.status_code == 409
    assert r.json()["detail"] == ("Бартерын хөрөнгө зарагдсан/нөөцөд орсон тул "
                                  "цуцлах боломжгүй")
    # Цуцлагдаагүй тул хуваарилалт нь ХЭВЭЭР
    assert _payments(client, h, cid)[0]["voided"] is False


def test_void_barter_payment_blocked_when_asset_stocked_409(client, as_role):
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _barter_pay(client, h, cl_id, cid, desc="Хэв 200ш")
    aid = next(a for a in client.get("/api/barter", headers=h).json()["assets"]
               if a["payment_id"] == p["id"])["id"]
    assert client.post(f"/api/barter/{aid}/to-stock", headers=as_role("otgoo"),
                       json={"material_id": m["id"], "grade_id": st["grade_id"],
                             "qty": 200}).status_code == 200

    r = client.post(f"/api/payments/{p['id']}/void", headers=h, json={"reason": "алдаа"})
    assert r.status_code == 409


def test_voided_barter_asset_cannot_be_sold(client, as_role):
    """Хүчингүй болсон хөрөнгө ямар ч үйлдэл хүлээж авахгүй."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = _setup(client, as_role)
    p = _barter_pay(client, h, cl_id, cid)
    aid = next(a for a in client.get("/api/barter", headers=h).json()["assets"]
               if a["payment_id"] == p["id"])["id"]
    client.post(f"/api/payments/{p['id']}/void", headers=h, json={"reason": "алдаа"})
    assert client.post(f"/api/barter/{aid}/sell", headers=h,
                       json={"date": iso(0), "amount": 1}).status_code == 400


# ==================== ХӨДӨЛГӨӨН ХҮЧИНГҮЙ БОЛГОХ ====================
#
# «Буруу гэрээнд олгосон падан ХЭЗЭЭ Ч ЗОГСОХГҮЙ түрээс тооцно» (H1). Хөдөлгөөн
# устгагддаггүй тул засварын ганц зам нь цуцлалт: нөөцийн толин тусгалыг яг
# буцааж, тооцоог дахин бодуулж, мөрийг нь ХҮЧИНГҮЙ тэмдэгтэй үлдээнэ.


def _stock_of(client, h, material_id, grade_id):
    m = next(x for x in client.get("/api/materials", headers=h).json()
             if x["id"] == material_id)
    return next(s for s in m["stock"] if s["grade_id"] == grade_id)


def _pending_ids(client, as_role, cid):
    dash = client.get("/api/dashboard", headers=as_role("darga")).json()
    return [p["id"] for p in dash["pending_shipments"] if p["contract_id"] == cid]


def test_void_pending_movement_leaves_factory_queue(client, as_role):
    """Хүлээгдэж буй ачилт тооцоо ч, нөөц ч хөдөлгөөгүй — цуцлахад зүгээр л
    үйлдвэрийн жагсаалтаас гарна, түүхэндээ ХҮЧИНГҮЙ болж үлдэнэ."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    before = _stock_of(client, h, m["id"], st["grade_id"])
    [mid] = _pending_ids(client, as_role, cid)

    r = client.post(f"/api/movements/{mid}/void", headers=h,
                    json={"reason": "Буруу гэрээнд бичив"})
    assert r.status_code == 200, r.text

    assert _pending_ids(client, as_role, cid) == []
    mvs = _movements(client, h, cid)
    row = next(x for x in mvs if x["id"] == mid)
    assert row["voided"] is True and row["void_reason"] == "Буруу гэрээнд бичив"
    after = _stock_of(client, h, m["id"], st["grade_id"])
    assert after["on_hand"] == before["on_hand"] and after["on_rent"] == before["on_rent"]


def test_void_pending_movement_cannot_be_confirmed(client, as_role):
    """Цуцлагдсан ачилтыг дарга дараа нь баталгаажуулж чадахгүй."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    [mid] = _pending_ids(client, as_role, cid)
    client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "алдаа"})
    r = client.post(f"/api/movements/{mid}/confirm", headers=as_role("darga"))
    assert r.status_code == 409


def test_void_done_issue_unapplies_stock_and_stops_accrual(client, as_role):
    """Баталгаажсан олголтыг цуцлахад бараа агуулахдаа буцаж ирнэ, тооцоо зогсоно."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    before = _stock_of(client, h, m["id"], st["grade_id"])
    _confirm_pending(client, as_role, cid)
    mid = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")["id"]
    live = _stock_of(client, h, m["id"], st["grade_id"])
    assert live["on_hand"] == before["on_hand"] - 100
    assert live["on_rent"] == before["on_rent"] + 100

    r = client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "буруу гэрээ"})
    assert r.status_code == 200, r.text

    back = _stock_of(client, h, m["id"], st["grade_id"])
    assert back["on_hand"] == before["on_hand"]
    assert back["on_rent"] == before["on_rent"]
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert d["qty_out"] == 0
    assert d["day_amount"] == 0                     # хуримтлал ЗОГССОН
    assert next(x for x in d["movements"] if x["id"] == mid)["voided"] is True


def test_void_done_issue_blocked_when_return_consumed_from_it_409(client, as_role):
    """Дараагийн буцаалт энэ падангаас хассан бол цуцлалт ТАТГАЛЗАНА —
    эс бөгөөс буцаалт нь эх үүсвэргүй үлдэж, үлдэгдэл сөрөг болно."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    _confirm_pending(client, as_role, cid)
    mid = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")["id"]
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40}]
    }).status_code == 200

    r = client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "алдаа"})
    assert r.status_code == 409
    assert r.json()["detail"] == ("Дараагийн буцаалт энэ падангаас хасагдсан — "
                                  "эхлээд түүнийг цуцална уу")
    assert next(x for x in _movements(client, h, cid)
                if x["id"] == mid)["voided"] is False


def test_void_done_return_sends_goods_back_out(client, as_role):
    """Буцаалт цуцлахад бараа дахин ТҮРЭЭСЭНД гарна — толин тусгал нь яг урвуу."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    _confirm_pending(client, as_role, cid)
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40}]
    }).status_code == 200
    mid = next(x for x in _movements(client, h, cid) if x["type"] == "RETURN")["id"]
    mid_stock = _stock_of(client, h, m["id"], st["grade_id"])
    assert client.get(f"/api/contracts/{cid}", headers=h).json()["qty_out"] == 60

    assert client.post(f"/api/movements/{mid}/void", headers=h,
                       json={"reason": "буцаалт ирээгүй"}).status_code == 200

    after = _stock_of(client, h, m["id"], st["grade_id"])
    assert after["on_hand"] == mid_stock["on_hand"] - 40
    assert after["on_rent"] == mid_stock["on_rent"] + 40
    assert client.get(f"/api/contracts/{cid}", headers=h).json()["qty_out"] == 100


def test_void_done_return_blocked_when_goods_reissued_409(client, as_role):
    """Буцаж ирсэн бараа дахин олгогдсон бол цуцлалт ТАТГАЛЗАНА:
    агуулахаас хасах юм үлдээгүй, тоо сөрөг болно."""
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 5012")
    ga = next(s for s in m["stock"] if s["grade"] == "А")
    grades = client.get("/api/grades", headers=h).json()
    g_new = next(g for g in grades if g["code"] == "шинэ")

    cl = client.post("/api/clients", json={"name": "Буцаалт ХХК"}, headers=h).json()
    r = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(10),
        "penalty_percent": 0, "items": [{"material_id": m["id"],
                                         "grade_id": ga["grade_id"], "qty": 100,
                                         "daily_rate": 330}]})
    cid = r.json()["id"]
    _confirm_pending(client, as_role, cid)
    # 40ш «шинэ» зэрэглэлээр буцаж ирнэ → тэр зэрэглэлийн нөөц 0-ээс 40 болно
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": ga["grade_id"], "qty": 40,
                   "return_grade_id": g_new["id"]}]}).status_code == 200
    assert _stock_of(client, h, m["id"], g_new["id"])["on_hand"] == 40

    # тэр 40ш ДАХИН олгогдоно — агуулахад юу ч үлдэхгүй
    cl2 = client.post("/api/clients", json={"name": "Дараагийн ХХК"}, headers=h).json()
    r2 = client.post("/api/contracts", headers=h, json={
        "client_id": cl2["id"], "type": "rent", "start_date": iso(3),
        "penalty_percent": 0, "items": [{"material_id": m["id"],
                                         "grade_id": g_new["id"], "qty": 40,
                                         "daily_rate": 330}]})
    _confirm_pending(client, as_role, r2.json()["id"])
    assert _stock_of(client, h, m["id"], g_new["id"])["on_hand"] == 0

    mid = next(x for x in _movements(client, h, cid) if x["type"] == "RETURN")["id"]
    bad = client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "алдаа"})
    assert bad.status_code == 409
    assert "дахин олгогдсон" in bad.json()["detail"]
    assert _stock_of(client, h, m["id"], g_new["id"])["on_hand"] == 0   # хөндөгдөөгүй


def test_void_movement_previews_then_rebuilds_when_invoiced(client, as_role):
    """Нэхэмжлэгдсэн цонхонд буй хөдөлгөөнийг цуцлахад эхлээд ЗӨРҮҮГ харуулна
    (RebuildModal), баталгаажуулсан үед л тооцоо дахин бодогдоно."""
    h = as_role("otgoo")
    cl_id, cid, m, st = _setup(client, as_role, days_ago=40, qty=100)
    inv = _invoices(client, h, cid)[0]
    assert inv["total"] == 990_000
    mid = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")["id"]

    dry = client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "буруу гэрээ"})
    assert dry.status_code == 200, dry.text
    assert dry.json()["rebuild_required"] is True
    diffs = dry.json()["diffs"]
    assert len(diffs) == 1 and diffs[0]["old_total"] == 990_000 and diffs[0]["new_total"] == 0
    # ХУУРАЙ: DB хөндөгдөөгүй
    assert _invoices(client, h, cid)[0]["total"] == 990_000
    assert next(x for x in _movements(client, h, cid) if x["id"] == mid)["voided"] is False

    ok = client.post(f"/api/movements/{mid}/void", headers=h,
                     json={"reason": "буруу гэрээ", "confirm": True})
    assert ok.status_code == 200, ok.text
    assert ok.json()["rebuilt"]["deleted"] == 1 and ok.json()["rebuilt"]["created"] == 0
    assert _invoices(client, h, cid) == []
    assert next(x for x in _movements(client, h, cid) if x["id"] == mid)["voided"] is True


def test_void_movement_manager_only_403(client, as_role):
    hf = as_role("sanhuu")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    [mid] = _pending_ids(client, as_role, cid)
    assert client.post(f"/api/movements/{mid}/void", headers=hf,
                       json={"reason": "алдаа"}).status_code == 403
    assert client.post(f"/api/movements/{mid}/void", headers=as_role("darga"),
                       json={"reason": "алдаа"}).status_code == 403


def test_double_void_movement_409(client, as_role):
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    [mid] = _pending_ids(client, as_role, cid)
    assert client.post(f"/api/movements/{mid}/void", headers=h,
                       json={"reason": "алдаа"}).status_code == 200
    assert client.post(f"/api/movements/{mid}/void", headers=h,
                       json={"reason": "дахиад"}).status_code == 409


def test_void_movement_requires_reason(client, as_role):
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    [mid] = _pending_ids(client, as_role, cid)
    assert client.post(f"/api/movements/{mid}/void", headers=h,
                       json={"reason": " "}).status_code == 400


def test_voided_movement_leaves_ledger_totals_but_stays_visible(client, as_role):
    """Дэвтэрт мөр нь ХАРАГДАНА (`counted: false`), гэхдээ үлдэгдэлд ОРОХГҮЙ —
    хүлээгдэж буй ачилттай яг ижил журам."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    _confirm_pending(client, as_role, cid)
    mid = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")["id"]
    client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "алдаа"})

    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    sec = next(g for g in d["material_lines"] if g["material_id"] == m["id"])
    assert sec["held"] == 0
    row = next(ln for ln in sec["lines"] if ln["movement_id"] == mid)
    assert row["counted"] is False                 # тооцоонд ороогүй
    assert row["voided"] is True                   # харагдсаар, тэмдэгтэйгээ


def test_void_movement_writes_audit(client, as_role):
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    [mid] = _pending_ids(client, as_role, cid)
    client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "давхар бичив"})
    trail = client.get("/api/audit?entity=movement", headers=h).json()
    assert any(a["action"] == "void" and a["entity_id"] == mid
               and "давхар бичив" in a["detail"] for a in trail)


# ============ БУЦААЛТЫН ДЭЛГЭРЭНГҮЙН ХЯНАЛТТАЙ ЗАСВАР ============
#
# H1-ийн гурав дахь хэсэг: «буцаалтын зэрэглэл/засвар/актын хуваарь мөнхийн».
# Дарга талбай дээр «энэ 40ш В зэрэглэл» гэж шийдээд бичдэг — маргааш нь
# засварт орох нь 5ш байсныг олж мэднэ. Устгах зам байхгүй тул ЗАСАХ зам
# байх ёстой: тоо нь хянагдаж, дүн нь каталогоос дахин бодогдож, нөөц нь яг
# толиндоо буцаж, нэхэмжлэгдсэн бол дахин бодолтын хаалгаар дамжина.


def _return_line(client, h, cid):
    mv = next(x for x in _movements(client, h, cid) if x["type"] == "RETURN")
    return mv, mv["lines"][0]


def _make_return(client, as_role, days_ago=10, qty=100, ret=40, **line):
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(max(days_ago - 5, 0)),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": ret, **line}]})
    assert r.status_code == 200, r.text
    return cl_id, cid, m, st


def test_return_grade_is_patchable_and_remirrors_stock(client, as_role):
    """Буцаж ирсэн ЗЭРЭГЛЭЛ засагдана — нөөц хуучин зэрэглэлээс хасагдаж,
    шинэ рүү нэмэгдэнэ (толин тусгал яг урвуугаараа дахин тавигдана)."""
    h = as_role("otgoo")
    grades = client.get("/api/grades", headers=h).json()
    g_b = next(g for g in grades if g["code"] == "В")
    cl_id, cid, m, st = _make_return(client, as_role)
    mv, ln = _return_line(client, h, cid)
    a_before = _stock_of(client, h, m["id"], st["grade_id"])
    b_before = _stock_of(client, h, m["id"], g_b["id"])

    r = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                     json={"return_grade_id": g_b["id"]})
    assert r.status_code == 200, r.text

    a_after = _stock_of(client, h, m["id"], st["grade_id"])
    b_after = _stock_of(client, h, m["id"], g_b["id"])
    assert a_after["on_hand"] == a_before["on_hand"] - 40
    assert b_after["on_hand"] == b_before["on_hand"] + 40
    assert a_after["on_rent"] == a_before["on_rent"]        # гадаа тоо хэвээр
    _, ln2 = _return_line(client, h, cid)
    assert ln2["return_grade"] == "В"


def test_repair_and_writeoff_qty_patch_recomputes_fees_and_stock(client, as_role):
    """Засвар/актын ТОО засагдахад ДҮН нь каталогоос ДАХИН бодогдоно —
    үүсгэх үеийнхтэй яг ижил томьёогоор (гараар бичсэн дүн гэж байхгүй)."""
    h = as_role("otgoo")
    cl_id, cid, m, st = _make_return(client, as_role)
    mv, ln = _return_line(client, h, cid)
    assert ln["repair_fee"] == 0 and ln["writeoff_fee"] == 0
    before = _stock_of(client, h, m["id"], st["grade_id"])
    nb = next(p for p in m["prices"] if p["grade_id"] == st["grade_id"])["nb_price"]

    r = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                     json={"repair_qty": 5, "writeoff_qty": 3})
    assert r.status_code == 200, r.text

    _, ln2 = _return_line(client, h, cid)
    assert ln2["repair_qty"] == 5 and ln2["writeoff_qty"] == 3
    assert ln2["repair_fee"] == 5 * m["repair_fee"]
    assert ln2["writeoff_fee"] == 3 * nb

    after = _stock_of(client, h, m["id"], st["grade_id"])
    assert after["on_hand"] == before["on_hand"] - 8       # 5 засварт, 3 актад
    assert after["in_repair"] == before["in_repair"] + 5
    assert after["written_off"] == before["written_off"] + 3


def test_repair_plus_writeoff_cannot_exceed_qty(client, as_role):
    h = as_role("otgoo")
    cl_id, cid, m, st = _make_return(client, as_role, ret=40)
    mv, ln = _return_line(client, h, cid)
    bad = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                       json={"repair_qty": 30, "writeoff_qty": 20})
    assert bad.status_code == 400
    assert bad.json()["detail"] == "Засвар + акт нь буцаалтын тооноос их байна"
    # мөр хөндөгдөөгүй
    _, ln2 = _return_line(client, h, cid)
    assert ln2["repair_qty"] == 0 and ln2["writeoff_qty"] == 0


def test_negative_repair_qty_rejected(client, as_role):
    h = as_role("otgoo")
    cl_id, cid, m, st = _make_return(client, as_role)
    mv, ln = _return_line(client, h, cid)
    assert client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                        json={"repair_qty": -1}).status_code == 400


def test_return_detail_fields_rejected_on_issue_line(client, as_role):
    """Олголтын мөрөнд буцаалтын дэлгэрэнгүй гэж байхгүй."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    _confirm_pending(client, as_role, cid)
    issue = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    r = client.patch(f"/api/movement-lines/{issue['lines'][0]['id']}", headers=h,
                     json={"repair_qty": 5})
    assert r.status_code == 400
    assert "буцаалт" in r.json()["detail"].lower()


# ---------- падан-pin ----------

def test_issue_line_pin_is_patchable_and_moves_attribution(client, as_role):
    """Отгоо «энэ буцаалт ХОЁРДУГААР падангаас» гэж заана — хамаарал шилжинэ.

    Сервер тал уг чадвартай байсан ч UI-гаас илгээгддэггүй байв (H5).
    """
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=20, qty=100)
    _confirm_pending(client, as_role, cid)
    # хоёр дахь падан — ижил материал, ижил зэрэглэл, өөр өдөр
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(15),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 50}]
    }).status_code == 200
    _confirm_pending(client, as_role, cid)
    issues = sorted((x for x in _movements(client, h, cid) if x["type"] == "ISSUE"),
                    key=lambda x: x["date"])
    lot1, lot2 = issues[0]["lines"][0]["id"], issues[1]["lines"][0]["id"]
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 30}]
    }).status_code == 200
    mv, ln = _return_line(client, h, cid)

    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    sec = next(g for g in d["material_lines"] if g["material_id"] == m["id"])
    row = next(x for x in sec["lines"] if x["id"] == ln["id"])
    assert [s["issue_line_id"] for s in row["sources"]] == [lot1]      # FIFO

    r = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                     json={"issue_line_id": lot2})
    assert r.status_code == 200, r.text

    d2 = client.get(f"/api/contracts/{cid}", headers=h).json()
    sec2 = next(g for g in d2["material_lines"] if g["material_id"] == m["id"])
    row2 = next(x for x in sec2["lines"] if x["id"] == ln["id"])
    assert [s["issue_line_id"] for s in row2["sources"]] == [lot2]
    assert row2["sources"][0]["pinned"] is True


def test_pin_must_reference_open_issue_line_of_same_contract(client, as_role):
    """Пин нь ӨӨР гэрээ / өөр материал / хожуу огноо руу заавал 400."""
    h = as_role("otgoo")
    cl_id, cid, m, st = _make_return(client, as_role, days_ago=20)
    mv, ln = _return_line(client, h, cid)

    # 1) өөр ГЭРЭЭНИЙ падан
    _, cid2, m2, st2 = make_contract(client, as_role, days_ago=20, qty=50)
    _confirm_pending(client, as_role, cid2)
    other = next(x for x in _movements(client, h, cid2)
                 if x["type"] == "ISSUE")["lines"][0]["id"]
    bad = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                       json={"issue_line_id": other})
    assert bad.status_code == 400
    assert "гэрээ" in bad.json()["detail"].lower()

    # 2) огт байхгүй мөр
    assert client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                        json={"issue_line_id": 999999}).status_code == 400

    # 3) БУЦААЛТЫН мөр рүү заасан (падан биш)
    assert client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                        json={"issue_line_id": ln["id"]}).status_code == 400


def test_pin_to_later_issue_rejected(client, as_role):
    """Буцаалтын өдрөөс ХОЙШ гарсан падангаас хасах боломжгүй."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=20, qty=100)
    _confirm_pending(client, as_role, cid)
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(15),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 30}]
    }).status_code == 200
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 50}]
    }).status_code == 200
    _confirm_pending(client, as_role, cid)
    late = next(x for x in _movements(client, h, cid)
                if x["type"] == "ISSUE" and x["date"] == iso(5))["lines"][0]["id"]
    mv, ln = _return_line(client, h, cid)
    bad = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                       json={"issue_line_id": late})
    assert bad.status_code == 400
    assert "хойш" in bad.json()["detail"].lower()


# ---------- нэхэмжлэгдсэн бол дахин бодолтын хаалга ----------

def test_return_detail_patch_gated_when_invoiced(client, as_role):
    """Актын дүн нэхэмжлэлийн `charge_amount`-д ордог тул нэхэмжлэгдсэн
    цонхонд засахад ЭХЛЭЭД зөрүү харагдана, `confirm` дээр л бодогдоно."""
    h = as_role("otgoo")
    cl_id, cid, m, st = _make_return(client, as_role, days_ago=40, ret=40)
    inv = _invoices(client, h, cid)[0]
    base = inv["total"]
    mv, ln = _return_line(client, h, cid)
    nb = next(p for p in m["prices"] if p["grade_id"] == st["grade_id"])["nb_price"]

    dry = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                       json={"writeoff_qty": 3})
    assert dry.status_code == 200, dry.text
    assert dry.json()["rebuild_required"] is True
    d = dry.json()["diffs"]
    assert len(d) == 1 and d[0]["old_total"] == base
    assert d[0]["new_total"] == base + 3 * nb
    assert _invoices(client, h, cid)[0]["total"] == base          # ХУУРАЙ

    ok = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                      json={"writeoff_qty": 3, "confirm": True})
    assert ok.status_code == 200, ok.text
    assert _invoices(client, h, cid)[0]["total"] == base + 3 * nb


def test_return_detail_patch_is_manager_only(client, as_role):
    hf = as_role("sanhuu")
    cl_id, cid, m, st = _make_return(client, as_role)
    mv, ln = _return_line(client, as_role("otgoo"), cid)
    assert client.patch(f"/api/movement-lines/{ln['id']}", headers=hf,
                        json={"repair_qty": 2}).status_code == 403


def test_return_detail_patch_audits(client, as_role):
    h = as_role("otgoo")
    cl_id, cid, m, st = _make_return(client, as_role)
    mv, ln = _return_line(client, h, cid)
    client.patch(f"/api/movement-lines/{ln['id']}", headers=h, json={"repair_qty": 4})
    trail = client.get("/api/audit?entity=movement", headers=h).json()
    assert any(a["action"] == "update" and a["entity_id"] == mv["id"]
               and "repair_qty" in a["detail"] for a in trail)

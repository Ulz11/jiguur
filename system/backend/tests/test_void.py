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

"""M6 / H6 — тарифын өөрчлөлтийн API: хэзээнээс, хаалга, хүчингүй болголт.

Отгоо эгчийн семантик: ШИНЭ ТАРИФ ДАРААГИЙН ЦИКЛЭЭС. Тэр огноогоор ирсэн
өөрчлөлт нэхэмжлэгдсэн юуг ч хөндөхгүй тул чөлөөтэй бичигдэнэ; өнгөрсөн рүү
хүрсэн нь ЯГ ТЭР дахин бодолтын хаалгаар (RebuildModal) — эхлээд зөрүү,
дараа нь баталгаажуулалт.

СУУРЬ КЕЙС: 40 хоногийн өмнөх гэрээ, 100ш × 330₮. Эхний цикл дууссан →
100 × 330 × 30 = 990,000₮ нэхэмжлэгдсэн. 450₮ болбол 1,350,000₮.
"""
from datetime import date, timedelta

from tests.test_api import iso, make_contract, _confirm_pending


def _detail(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()


def _invoices(client, h, cid):
    return sorted(_detail(client, h, cid)["invoices"], key=lambda i: i["due_date"])


def _setup(client, as_role, days_ago=40, qty=100):
    """Гэрээ + баталгаажсан ачилт + нэхэмжлэгдсэн эхний цикл."""
    _, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    h = as_role("otgoo")
    client.patch(f"/api/contracts/{cid}", headers=h, json={"penalty_percent": 0})
    client.get(f"/api/contracts/{cid}", headers=h)      # ensure_invoices
    return cid, m, st


def _chg(client, h, cid, m, st, **body):
    return client.post(f"/api/contracts/{cid}/rate-change", headers=h,
                       json={"material_id": m["id"], "grade_id": st["grade_id"], **body})


# ---------- 1. Хэзээнээс: цонхны хил ----------

def test_detail_exposes_the_three_boundary_dates(client, as_role):
    """UI-ийн гурван сонголт нь СЕРВЕРИЙН хилээс гарна — таамаг биш."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    d = _detail(client, h, cid)
    b = d["cycle_bounds"]
    start = date.fromisoformat(d["start_date"])
    assert b["contract_start"] == str(start)
    assert b["current_start"] == str(start + timedelta(days=30))
    assert b["next_start"] == str(start + timedelta(days=60))


def test_effective_from_must_be_a_cycle_boundary(client, as_role):
    """Циклийн дунд орсон огноо нь цонхыг ХАГАЛНА — 400, монголоор."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    r = _chg(client, h, cid, m, st, new_rate=450, effective_from=iso(9))
    assert r.status_code == 400
    assert "цикл" in r.json()["detail"].lower()


def test_default_effective_from_is_the_next_cycle(client, as_role):
    """Огноо заагаагүй бол ДАРААГИЙН цикл — түүний анхны утга."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    r = _chg(client, h, cid, m, st, new_rate=450, note="Дахин тохиров")
    assert r.status_code == 200, r.text
    start = date.fromisoformat(_detail(client, h, cid)["start_date"])
    assert r.json()["effective_from"] == str(start + timedelta(days=60))
    assert r.json().get("rebuild_required") is None


# ---------- 2. Дараагийн/энэ циклээс — нэхэмжилсэн түүх ХӨДӨЛӨХГҮЙ ----------

def test_current_cycle_change_moves_the_future_only(client, as_role):
    """Явагдаж буй циклээс тохирсон тариф — нэхэмжлэл БАЙТ ТОГТМОЛ.

    Эхний цикл 990,000₮ хэвээр; өдрийн дүн нь 33,000 → 45,000 болно.
    """
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    assert _invoices(client, h, cid)[0]["total"] == 990_000
    assert _detail(client, h, cid)["day_amount"] == 33_000

    cur = _detail(client, h, cid)["cycle_bounds"]["current_start"]
    r = _chg(client, h, cid, m, st, new_rate=450, effective_from=cur, old_rate=330)
    assert r.status_code == 200, r.text
    assert r.json().get("rebuild_required") is None      # хаалга нээгдээгүй

    d = _detail(client, h, cid)
    assert _invoices(client, h, cid)[0]["total"] == 990_000    # ГАРЫН ҮСЭГТЭЙ нь хэвээр
    assert d["day_amount"] == 45_000                           # ирээдүй нь шинэ тарифаар
    assert d["items"][0]["daily_rate"] == 450                  # хүснэгт хүчинтэйгээ харуулна


def test_next_cycle_change_leaves_today_alone_too(client, as_role):
    """Дараагийн циклээс тохирсон нь ӨНӨӨДРИЙГ Ч хөндөхгүй — хойшоо хүлээнэ."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    nxt = _detail(client, h, cid)["cycle_bounds"]["next_start"]
    r = _chg(client, h, cid, m, st, new_rate=450, effective_from=nxt)
    assert r.status_code == 200, r.text
    d = _detail(client, h, cid)
    assert d["day_amount"] == 33_000
    assert _invoices(client, h, cid)[0]["total"] == 990_000


# ---------- 3. Түүх рүү хүрвэл ЯГ ТЭР хаалга ----------

def test_history_change_asks_first_then_rebuilds(client, as_role):
    """«Бүх түүхэнд» нь нэхэмжлэгдсэн циклийг дахин бичнэ — эхлээд зөрүү."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    start = _detail(client, h, cid)["cycle_bounds"]["contract_start"]

    r = _chg(client, h, cid, m, st, new_rate=450, effective_from=start)
    assert r.status_code == 200, r.text
    assert r.json()["rebuild_required"] is True
    assert r.json()["diffs"][0]["old_total"] == 990_000
    assert r.json()["diffs"][0]["new_total"] == 1_350_000
    # ХУУРАЙ ажиллагаа — DB-д мөр ч, дүн ч үлдээгүй
    assert _invoices(client, h, cid)[0]["total"] == 990_000
    assert _detail(client, h, cid)["rate_changes"] == []

    r = _chg(client, h, cid, m, st, new_rate=450, effective_from=start, confirm=True)
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["total"] == 1_350_000
    assert len(_detail(client, h, cid)["rate_changes"]) == 1


def test_rate_change_is_audited_even_without_a_rebuild(client, as_role):
    """Дахин бодолт хийгээгүй ч ЯВДАЛ нь audit-д үлдэнэ."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    nxt = _detail(client, h, cid)["cycle_bounds"]["next_start"]
    _chg(client, h, cid, m, st, new_rate=450, effective_from=nxt, note="Утсаар тохиров")
    rows = client.get("/api/audit", headers=h).json()
    assert any(a["entity"] == "rate_change" and "450" in a["detail"] for a in rows)


# ---------- 4. Хүрээ (old_rate) — нэг ҮЕ л хөдөлнө ----------

def test_old_rate_scope_hits_one_generation_only(client, as_role):
    """330₮ ба 300₮-ийн хоёр падан: 330 → 450 болгоход 300 нь ХЭВЭЭР."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(5), "note": "Нэмэлт",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 50, "rate": 300}]})
    _confirm_pending(client, as_role, cid)
    assert _detail(client, h, cid)["day_amount"] == 100 * 330 + 50 * 300

    cur = _detail(client, h, cid)["cycle_bounds"]["current_start"]
    r = _chg(client, h, cid, m, st, new_rate=450, old_rate=330, effective_from=cur)
    assert r.status_code == 200, r.text

    d = _detail(client, h, cid)
    assert d["day_amount"] == 100 * 450 + 50 * 300
    by_rate = {x["daily_rate"]: x for x in d["items"]}
    assert set(by_rate) == {450, 300}
    assert by_rate[450]["qty"] == 100 and by_rate[300]["qty"] == 50


# ---------- 5. ХҮЧИНГҮЙ болгох — тэр ч хаалгатай ----------

def test_void_rate_change_restores_history_through_the_gate(client, as_role):
    """Хүчингүй болгосон өөрчлөлт нь нэхэмжлэлийг БУЦААНА (H1-ийн журам)."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    start = _detail(client, h, cid)["cycle_bounds"]["contract_start"]
    r = _chg(client, h, cid, m, st, new_rate=450, effective_from=start, confirm=True)
    rid = r.json()["id"]
    assert _invoices(client, h, cid)[0]["total"] == 1_350_000

    r = client.post(f"/api/rate-changes/{rid}/void", headers=h, json={"reason": "Андуурсан"})
    assert r.status_code == 200, r.text
    assert r.json()["rebuild_required"] is True
    assert r.json()["diffs"][0]["new_total"] == 990_000
    assert _invoices(client, h, cid)[0]["total"] == 1_350_000     # хуурай

    r = client.post(f"/api/rate-changes/{rid}/void", headers=h,
                    json={"reason": "Андуурсан", "confirm": True})
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["total"] == 990_000
    rc = _detail(client, h, cid)["rate_changes"][0]
    assert rc["voided"] is True and rc["void_reason"] == "Андуурсан"


def test_void_needs_a_reason_and_never_twice(client, as_role):
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    nxt = _detail(client, h, cid)["cycle_bounds"]["next_start"]
    rid = _chg(client, h, cid, m, st, new_rate=450, effective_from=nxt).json()["id"]

    assert client.post(f"/api/rate-changes/{rid}/void", headers=h,
                       json={"reason": "  "}).status_code == 400
    assert client.post(f"/api/rate-changes/{rid}/void", headers=h,
                       json={"reason": "болив"}).status_code == 200
    assert client.post(f"/api/rate-changes/{rid}/void", headers=h,
                       json={"reason": "дахин"}).status_code == 409


# ---------- 6. Эрх ба валидаци ----------

def test_only_manager_may_change_the_tariff(client, as_role):
    cid, m, st = _setup(client, as_role)
    for role in ("sanhuu", "darga"):
        assert _chg(client, as_role(role), cid, m, st, new_rate=450).status_code == 403


def test_negative_rate_rejected(client, as_role):
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    r = _chg(client, h, cid, m, st, new_rate=-1)
    assert r.status_code == 400


def test_rate_change_rejected_on_sale_contract(client, as_role):
    """Худалдаанд цикл байхгүй — «дараагийн циклээс» гэдэг утгагүй."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Худалдаа тариф ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "sale", "start_date": iso(10),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 10, "unit_price": 58_000}]}).json()["id"]
    r = _chg(client, h, cid, m, st, new_rate=60_000)
    assert r.status_code == 400
    assert "түрээс" in r.json()["detail"].lower()


# ---------- 7. Хуучин зам — ЧИМЭЭГҮЙ ДАРЖ БИЧИХ НЬ ҮХЛЭЭ ----------

def test_legacy_items_patch_now_goes_through_the_gate(client, as_role):
    """`PATCH /items` нь бүх түүхэнд үйлчлэх ӨӨРЧЛӨЛТ болж, хаалгатай болов.

    Урьд нь энэ зам падангийн тарифыг чимээгүй дарж бичээд дахин бодолт
    хийдэггүй байв — нэхэмжлэгдсэн циклүүд хуучин дүнтэйгээ үлдэж, хожим
    огт хамаагүй засварын үед үсэрдэг байсан (H6).
    """
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    r = client.patch(f"/api/contracts/{cid}/items", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"], "daily_rate": 450})
    assert r.status_code == 200, r.text
    assert r.json()["rebuild_required"] is True
    assert _invoices(client, h, cid)[0]["total"] == 990_000      # хуурай

    r = client.patch(f"/api/contracts/{cid}/items", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"],
        "daily_rate": 450, "confirm": True})
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["total"] == 1_350_000
    # Явдал болж бичигдсэн — гэрээний эхлэлээс хүчинтэй
    rc = _detail(client, h, cid)["rate_changes"][0]
    assert rc["new_rate"] == 450
    assert rc["effective_from"] == _detail(client, h, cid)["start_date"]


def test_legacy_items_patch_leaves_the_lot_rate_stamped(client, as_role):
    """Падангийн ТӨРӨЛХИЙН тариф хэвээр — өөрчлөлт нь ДЭЭР нь тавигдана.

    Иймд «хүчингүй болгох» нь тарифыг бүрэн буцаана: дарж бичсэн бол
    буцах газар үлдэхгүй байв.
    """
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    client.patch(f"/api/contracts/{cid}/items", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"],
        "daily_rate": 450, "confirm": True})
    d = _detail(client, h, cid)
    assert d["items"][0]["daily_rate"] == 450        # хүчинтэй тариф
    assert d["items"][0]["orig_rate"] == 330         # падангийн төрөлхийн

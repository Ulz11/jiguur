"""АЛДАНГИ = ХӨШҮҮРЭГ, автомат төлбөр БИШ (Чадварын харьцуулалт R25 / H2).

Отгоо эгч 20 жилийн Excel-дээ алданги ГАНЦ УДАА ч тооцоогүй. Хуудас бүр дээр
«гэрээний 4.2-т зааснаар алданга тооцно» гэж ЗАРЛАГДСАН боловч ямар ч
хуудсанд нэг ч төгрөгийн алданги нэхэгдээгүй: тэр бол утсаар ярихад
хэрэглэдэг ХӨШҮҮРЭГ.

Систем нь урьд нь төлбөр бүртгэх агшинд алдангийг чимээгүй номжиж байсан —
өршөөсөн харилцагчийнх нь мөнгийг бүртгэхэд үлдэгдэл нь ӨСДӨГ байв. Тэр
үүнийг «машин өр зохиож байна» гэж уншина.

Энэ файл шинэ бодлогыг барина:
  1) төлбөр ЮУ Ч номжихгүй;
  2) нэхэх нь ЗӨВХӨН `POST /api/contracts/{id}/book-penalty` — ил үйлдэл;
  3) нэхэгдсэн алданги нь урьдын адил төлөгдөнө;
  4) нэхэгдээгүй тооцоолол нь ХАРАГДАНА (хөшүүрэг нь хүчтэй болно) ч
     төлбөр түүнийг хааж ЧАДАХГҮЙ.
"""
from tests.test_api import iso, make_contract, _confirm_pending


def _invoices(client, h, cid):
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    return sorted(d["invoices"], key=lambda i: i["due_date"])


def _detail(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()


def _overdue(client, as_role, days_ago=40, qty=100):
    """40 хоногийн өмнөх гэрээ → 10 хоног хэтэрсэн 990,000₮-ийн нэхэмжлэл."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    inv = _invoices(client, h, cid)[0]
    assert inv["total"] == 990_000 and inv["outstanding"] == 990_000
    return h, cl_id, cid


# ---------- 1. Төлбөр ЮУ Ч номжихгүй ----------

def test_payment_books_no_penalty(client, as_role):
    """Төлбөр бүртгэхэд алданги НЭХЭГДЭХГҮЙ — энэ бол эргэлтийн цэг.

    Хуучин зан: 990,000₮-ийг бүтэн төлөхөд 49,500₮ алданги НЭХЭГДЭЖ,
    нэхэмжлэл «Алданги үлдсэн» төлөвт үлдэнэ — Отгоогийн нүдэнд мөнгө
    хүлээж авмагц өр нь дахин үүссэн хэрэг.
    Шинэ зан: 990,000₮ төлөхөд нэхэмжлэл ЦЭВЭР хаагдана; алданги нь
    зөвхөн ТООЦООЛОЛ хэвээр, нэхэгдээгүй.
    """
    h, cl_id, cid = _overdue(client, as_role)

    r = client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 990_000, "method": "BANK"})
    assert r.status_code == 200, r.text
    assert r.json()["allocated"] == 990_000

    after = _invoices(client, h, cid)[0]
    assert after["outstanding"] == 0
    assert after["penalty_due"] == 0, "төлбөр алданги НЭХЭЖ БОЛОХГҮЙ"
    assert after["penalty_unbooked"] == 0, "үндсэн дүн хаагдсан → тооцоолол ч зогсоно"
    assert after["status"] == "paid", "цэвэр хаагдана — «Алданги үлдсэн» гэж үлдэхгүй"


def test_partial_payment_leaves_penalty_uncharged(client, as_role):
    """Хэсэгчилсэн төлбөр ч алданги нэхэхгүй — тооцоолол нь ХАРАГДСААР үлдэнэ."""
    h, cl_id, cid = _overdue(client, as_role)
    client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 500_000, "method": "BANK"})

    inv = _invoices(client, h, cid)[0]
    assert inv["outstanding"] == 490_000
    assert inv["penalty_due"] == 0
    # 490,000 × 0.5% × 10 хоног = 24,500₮ — тооцоолол, НЭХЭГДЭЭГҮЙ
    assert inv["penalty_unbooked"] == 24_500
    assert inv["penalty"] == 24_500


def test_deposit_settle_books_no_penalty(client, as_role):
    """Барьцааны тооцоо ч алданги нэхэхгүй — тэр бол мөнгө хөдөлгөх үйлдэл."""
    h = as_role("otgoo")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100, deposit=5_000_000)
    _confirm_pending(client, as_role, cid)
    r = client.post(f"/api/contracts/{cid}/settle-deposit", headers=h, json={
        "date": iso(0), "apply_amount": 500_000, "return_amount": 0})
    assert r.status_code == 200, r.text
    inv = _invoices(client, h, cid)[0]
    assert inv["penalty_due"] == 0, "барьцааны суутгал алданги НЭХЭЖ БОЛОХГҮЙ"


# ---------- 2. Ил нэхэлт ----------

def test_book_penalty_endpoint_charges_and_audits(client, as_role):
    """«Алданги нэхэх» → нэхэгдэнэ, нэхэмжлэл бүрээр задарна, audit-д үлдэнэ."""
    h, cl_id, cid = _overdue(client, as_role)
    before = _invoices(client, h, cid)[0]
    assert before["penalty_unbooked"] == 49_500 and before["penalty_due"] == 0

    r = client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(0)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 49_500
    assert len(body["rows"]) == 1
    row = body["rows"][0]
    assert row["amount"] == 49_500 and row["days"] == 10
    assert row["no"] == before["no"]

    after = _invoices(client, h, cid)[0]
    assert after["penalty_due"] == 49_500, "НЭХЭГДСЭН — одоо төлөгдөнө"
    assert after["penalty_unbooked"] == 0, "нэхсэн өдрөөс хойш шинэ тооцоолол алга"
    assert after["penalty"] == 49_500

    logs = client.get("/api/audit", headers=as_role("otgoo")).json()
    rows = logs["rows"] if isinstance(logs, dict) else logs
    assert any(a["action"] == "book_penalty" and a["entity_id"] == cid for a in rows), \
        "нэхэлт audit-д үлдэх ёстой"


def test_book_penalty_is_monotonic(client, as_role):
    """Хоёр дахь удаа тэр өдрөөрөө нэхэхэд ЮУ Ч нэмэгдэхгүй; хожим нэхэхэд
    зөвхөн ШИНЭ хоногууд нэмэгдэнэ (өмнөхөө дахин тоолохгүй)."""
    h, cl_id, cid = _overdue(client, as_role)
    first = client.post(f"/api/contracts/{cid}/book-penalty", headers=h,
                        json={"as_of": iso(5)}).json()
    assert first["total"] == 990_000 * 0.005 * 5   # 24,750₮ (5 хоног)

    again = client.post(f"/api/contracts/{cid}/book-penalty", headers=h,
                        json={"as_of": iso(5)}).json()
    assert again["total"] == 0, "тэр өдрөөрөө дахин нэхэхэд юу ч нэмэгдэхгүй"

    later = client.post(f"/api/contracts/{cid}/book-penalty", headers=h,
                        json={"as_of": iso(0)}).json()
    assert later["total"] == 990_000 * 0.005 * 5   # зөвхөн сүүлийн 5 хоног
    assert _invoices(client, h, cid)[0]["penalty_due"] == 49_500


def test_book_penalty_defaults_to_today(client, as_role):
    """`as_of` дамжуулаагүй бол ӨНӨӨДӨР."""
    h, cl_id, cid = _overdue(client, as_role)
    r = client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={})
    assert r.status_code == 200, r.text
    assert r.json()["as_of"] == iso(0)
    assert r.json()["total"] == 49_500


def test_book_penalty_zero_percent_is_400(client, as_role):
    """Алдангийн хувь 0 бол нэхэлт ТАТГАЛЗАНА.

    Чимээгүй 0 буцаах нь «машин үйлдлийг минь тоосонгүй» гэж уншигдана —
    юу хийх ёстойг нь (хувийг эхлээд тохируулах) хэлж татгалзана.
    """
    h, cl_id, cid = _overdue(client, as_role)
    assert client.patch(f"/api/contracts/{cid}", headers=as_role("otgoo"),
                        json={"penalty_percent": 0}).status_code == 200
    r = client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(0)})
    assert r.status_code == 400
    assert "алдангийн хувь" in r.json()["detail"]


def test_book_penalty_factory_403(client, as_role):
    """Үйлдвэрийн дарга материал тоолдог — алданги нэхэх нь мөнгөний шийдвэр."""
    h, cl_id, cid = _overdue(client, as_role)
    r = client.post(f"/api/contracts/{cid}/book-penalty", headers=as_role("darga"),
                    json={"as_of": iso(0)})
    assert r.status_code == 403


def test_book_penalty_not_yet_overdue_is_zero(client, as_role):
    """Хугацаа хэтрээгүй нэхэмжлэлд нэхэлт 0 — гэхдээ 400 биш (хувь нь зэвсэглэсэн)."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    _confirm_pending(client, as_role, cid)
    r = client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(0)})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 0 and r.json()["rows"] == []


# ---------- 3. Нэхэгдсэн алданги нь урьдын адил төлөгдөнө ----------

def test_allocation_still_pays_booked_penalty(client, as_role):
    """Нэхсэний ДАРАА алданги нь үндсэн дүнгийн араас хаагдана — хуучин зам хэвээр."""
    h, cl_id, cid = _overdue(client, as_role)
    client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(0)})

    r = client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 1_039_500, "method": "BANK"})
    assert r.json()["allocated"] == 1_039_500

    inv = _invoices(client, h, cid)[0]
    assert inv["outstanding"] == 0 and inv["penalty_due"] == 0
    assert inv["status"] == "paid"
    parts = [a["part"] for p in _detail(client, h, cid)["payments"] for a in p["allocations"]]
    assert "penalty" in parts, "алдангийн хуваарилалт хэвээр ажиллана"


def test_unbooked_penalty_is_not_payable(client, as_role):
    """НЭХЭГДЭЭГҮЙ тооцоолол руу мөнгө орохгүй — илүү нь КРЕДИТ болно."""
    h, cl_id, cid = _overdue(client, as_role)
    r = client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 1_039_500, "method": "BANK"})
    assert r.json()["allocated"] == 990_000, "зөвхөн үндсэн дүн хаагдана"
    assert r.json()["unallocated"] == 49_500, "үлдсэн нь алданги биш — кредит"


# ---------- 4. Харагдац: хоёр нүүр тусдаа ----------

def test_contract_detail_splits_booked_and_uncharged(client, as_role):
    """Гэрээний толгой дээр НЭХЭГДСЭН ба НЭХЭГДЭЭГҮЙ нь ТУСДАА тоо."""
    h, cl_id, cid = _overdue(client, as_role)
    d = _detail(client, h, cid)
    assert d["penalty_booked"] == 0 and d["penalty_unbooked"] == 49_500

    client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(5)})
    d2 = _detail(client, h, cid)
    assert d2["penalty_booked"] == 24_750          # нэхсэн 5 хоног
    assert d2["penalty_unbooked"] == 24_750        # нэхээгүй сүүлийн 5 хоног
    assert d2["penalty"] == 49_500                 # нийлбэр нь хэвээр


def test_dashboard_kpi_splits_penalty(client, as_role):
    """Дашбоардын алдангийн тэмдэг НЭХЭГДСЭНийг хэлнэ."""
    h, cl_id, cid = _overdue(client, as_role)
    k = client.get("/api/dashboard", headers=h).json()["kpi"]
    assert k["penalty_booked"] == 0
    assert k["penalty_unbooked"] >= 49_500
    client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(0)})
    k2 = client.get("/api/dashboard", headers=h).json()["kpi"]
    assert k2["penalty_booked"] == 49_500


def test_client_and_collections_split_penalty(client, as_role):
    """Харилцагчийн мөр ба авлагын жагсаалт ч хоёр нүүрийг тусад нь дуудна."""
    h, cl_id, cid = _overdue(client, as_role)
    client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(0)})
    row = client.get(f"/api/clients/{cl_id}", headers=h).json()
    assert row["penalty_booked"] == 49_500 and row["penalty_unbooked"] == 0

    col = next(r for r in client.get("/api/collections", headers=h).json()["rows"]
               if r["client_id"] == cl_id)
    assert col["penalty_booked"] == 49_500
    assert col["penalty_unbooked"] == 0


def test_factory_reads_the_penalty_split_too(client, as_role):
    """Алдангийн ХОЁР НҮҮР даргад ч ирнэ — тэр асуухад хариулна.

    ⚠ Урьд нь эсрэгээрээ («шинэ талбарууд ч даргын хариунд ОРОХГҮЙ»). Эзний
    шийдвэрээр хана унав; НЭХЭХ эрх нь хэвээр хаалттай (fin — `book-penalty`).
    Хоёр нүүр нь даргын дэлгэц дээр ч НИЙЛЭХГҮЙ: «нэхэгдсэн» нь өр, «тооцоо»
    нь хөшүүрэг (H2) — тэдгээр нь тусдаа талбар хэвээр ирнэ.
    """
    h, cl_id, cid = _overdue(client, as_role)
    client.post(f"/api/contracts/{cid}/book-penalty", headers=h, json={"as_of": iso(0)})
    d = client.get(f"/api/contracts/{cid}", headers=as_role("darga")).json()
    assert d["penalty_booked"] == 49_500 and d["penalty_unbooked"] == 0
    assert d["penalty_booked"] + d["penalty_unbooked"] == d["penalty"]


# ---------- 5. Анхны утга нь тохиргооноос ----------

def test_penalty_default_setting_ships_zero(client, as_role):
    """`penalty_default` = 0 — wizard-ын анхны утга эндээс урсана."""
    s = client.get("/api/settings", headers=as_role("otgoo")).json()
    assert s["penalty_default"] == "0"


def test_contract_created_without_percent_has_no_penalty(client, as_role):
    """Хувь дамжуулаагүй гэрээ АЛДАНГИГҮЙ төрнө (өмнө нь 0.5 байв)."""
    h = as_role("otgoo")
    cl = client.get("/api/clients", headers=h).json()[0]
    m = client.get("/api/materials", headers=h).json()[0]
    st = m["stock"][0]
    c = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(-40),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 10, "daily_rate": 330}]})
    assert c.status_code == 200, c.text
    assert client.get(f"/api/contracts/{c.json()['id']}",
                      headers=h).json()["penalty_percent"] == 0

"""ХАРИЛЦАГЧИЙН ДАНСАН ДЭЭРХ, ТҮРЭЭС БИШ БИЧИЛТҮҮД (H11 / P1-16).

Отгоо эгчийн хуудсууд дээр харилцагчийн дансанд ТҮРЭЭС БИШ зүйл олон удаа
шингэдэг — гэвч систем тэдгээрийг барих байргүй тул тэр хос Excel-д үлдэж,
сар бүрийн хаалтыг чирдэг:

  · `Бутан-Өнөорд!C23` «2025 онд Бутангууд ХХК-д бэлэн мөнгө зээлсэн нийт
    дүн» G23 = **164,492,000₮** — ОЛГОСОН ЗЭЭЛ (`Loan` нь ӨГЛӨГ, эсрэг тал);
  · `Бутан-Өнөорд!C28` «Бутангууд констракшн ххк-ын ажилчдын цалинд»
    G28 = **2,800,000₮** — түүний өмнөөс төлсөн ЦАЛИН;
  · `АшидДонж-11!L30` «Авто кран түрээс» P30 = **10,000,000₮/сар» —
    WB3!F14 «=65472000+10000000» гэж САРЫН НҮД дотор явдаг (`MachineLog` нь
    нэхэмжлэлд ордоггүй);
  · Самбарын мөр 24: **139,648,000₮** — Бутангууд ↔ Өнө Ордын хоорондын
    тооцоо. Хуудсыг ӨНӨ ОРДЫН талаас Жигүүр Замын өөрийн захирлууд гарын
    үсэг зурсан тул энэ нь ХОЁР ТАЛТ шилжүүлэг БИШ, Бутангуудын данс дээрх
    ХОЛБООТОЙ ТАЛЫН ДЕБИТ.

`ClientEntry` нь эдгээрийг АВЛАГЫН ХУУЧИН ЗАМААР л материалчилна (H9 —
«нэг факт, нэг тоо»): эерэг дүн → дансны гэрээн дээр нэхэмжлэл, сөрөг дүн →
төлбөр. Хоёр дахь балансын эх сурвалж ҮҮСГЭХГҮЙ.
"""
from datetime import date, timedelta

from tests.test_features import iso, mk_contract


def _post(client, h, cl_id, **kw):
    body = {"date": iso(0), "amount": 0, "kind": "advance", "label": "",
            "note": "", "ref": "", **kw}
    return client.post(f"/api/clients/{cl_id}/entries", headers=h, json=body)


def _entries(client, h, cl_id):
    r = client.get(f"/api/clients/{cl_id}/entries", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _receivable(client, h, cl_id) -> float:
    return client.get(f"/api/clients/{cl_id}", headers=h).json()["receivable"]


def _four_surfaces(client, h, cl_id) -> dict:
    lst = next(r for r in client.get("/api/clients", headers=h).json() if r["id"] == cl_id)
    prof = client.get(f"/api/clients/{cl_id}", headers=h).json()
    dash = client.get("/api/dashboard", headers=h).json()
    sched = next((r for r in dash["payment_schedule"] if r["client_id"] == cl_id), None)
    col = next((r for r in client.get("/api/collections", headers=h).json()["rows"]
                if r["client_id"] == cl_id), None)
    return {"list": lst["receivable"], "profile": prof["receivable"],
            "schedule": sched["receivable"] if sched else None,
            "collections": col["balance"] if col else None}


# ---------- 1. ОЛГОСОН ЗЭЭЛ — Бутангуудын 164,492,000₮ ----------

def test_a_cash_loan_to_the_client_lands_on_his_account_as_an_invoice(client, as_role):
    h = as_role("otgoo")
    cl, _c, *_ = mk_contract(client, as_role, qty=20, deposit=0, days_ago=35)
    before = _receivable(client, h, cl["id"])

    r = _post(client, h, cl["id"], amount=164_492_000, kind="advance",
              label="2025 онд бэлэн мөнгө зээлсэн", ref="Бутан-Өнөорд!G23")
    assert r.status_code == 200, r.text
    e = r.json()["entry"]
    assert e["amount"] == 164_492_000 and e["kind"] == "advance"
    assert e["invoice_no"] == f"A-{cl['id']}-1"

    after = _receivable(client, h, cl["id"])
    assert after - before == 164_492_000, "авлага ЯГ бичилтийн дүнгээр өснө"

    # Нэхэмжлэл нь ХАРИЛЦАГЧИЙН ДАНС (`OB-{id}`) гэрээн дээр суусан
    prof = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    inv = next(i for i in prof["invoices"] if i["no"] == f"A-{cl['id']}-1")
    assert inv["contract_no"] == f"OB-{cl['id']}"
    assert inv["total"] == 164_492_000 and inv["outstanding"] == 164_492_000


def test_the_account_contract_is_reused_not_duplicated(client, as_role):
    """Хоёр бичилт → НЭГ данс, дугаарлалт нь үргэлжилнэ."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Дансны тест ХХК"}, headers=h).json()
    _post(client, h, cl["id"], amount=2_800_000, kind="service", label="Ажилчдын цалинд")
    _post(client, h, cl["id"], amount=10_000_000, kind="service", label="Авто кран түрээс")
    prof = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    assert [c["no"] for c in prof["contracts"]] == [f"OB-{cl['id']}"]
    assert sorted(i["no"] for i in prof["invoices"]) == [f"A-{cl['id']}-1", f"A-{cl['id']}-2"]
    assert prof["receivable"] == 12_800_000


def test_numbering_never_collides_after_a_void(client, as_role):
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Дугаарын тест ХХК"}, headers=h).json()
    ids = [_post(client, h, cl["id"], amount=1_000 * (i + 1), kind="adjustment",
                 label=f"мөр {i + 1}").json()["entry"] for i in range(3)]
    assert [e["invoice_no"] for e in ids] == [f"A-{cl['id']}-{n}" for n in (1, 2, 3)]
    client.post(f"/api/client-entries/{ids[1]['id']}/void", headers=h,
                json={"reason": "давхар бичив"})
    nxt = _post(client, h, cl["id"], amount=5_000, kind="adjustment", label="дараагийнх")
    assert nxt.json()["entry"]["invoice_no"] == f"A-{cl['id']}-4", \
        "цуцлагдсан дугаар ДАХИН ашиглагдахгүй"


# ---------- 2. КРЕДИТ — сөрөг дүн нь ТӨЛБӨР болно ----------

def test_a_credit_entry_becomes_a_payment_and_closes_the_oldest_invoice(client, as_role):
    h = as_role("otgoo")
    cl, _c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    before = _receivable(client, h, cl["id"])

    r = _post(client, h, cl["id"], amount=-500_000, kind="adjustment",
              label="Тооцооны залруулга", ref="акт №7")
    assert r.status_code == 200, r.text
    e = r.json()["entry"]
    assert e["payment_id"] and not e["invoice_no"]
    assert before - _receivable(client, h, cl["id"]) == 500_000

    pays = client.get(f"/api/payments?client_id={cl['id']}", headers=h).json()
    p = next(p for p in pays if p["id"] == e["payment_id"])
    assert p["method"] == "CREDIT" and p["amount"] == 500_000
    assert p["note"] == "Тооцооны залруулга"


# ---------- 3. НЭГ ТОО, ДӨРВӨН ДЭЛГЭЦ (H9b) ----------

def test_the_receivable_moves_identically_on_every_surface(client, as_role):
    h = as_role("otgoo")
    cl, _c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    before = _four_surfaces(client, h, cl["id"])
    assert len(set(before.values())) == 1, f"эхлэхдээ зөрлөө: {before}"

    _post(client, h, cl["id"], amount=139_648_000, kind="transfer",
          label="Өнө Орд ХХК-д өгөх төлбөрийн тооцоо", ref="WB3!R24")
    after = _four_surfaces(client, h, cl["id"])
    assert len(set(after.values())) == 1, f"бичилтийн дараа зөрлөө: {after}"
    assert after["list"] - before["list"] == 139_648_000


# ---------- 4. ЦУЦЛАЛТ — ТЭГШ ХЭМТЭЙ ----------

def test_voiding_a_debit_entry_voids_its_invoice_and_gives_the_receivable_back(client, as_role):
    h = as_role("otgoo")
    cl, _c, *_ = mk_contract(client, as_role, qty=20, deposit=0, days_ago=35)
    before = _receivable(client, h, cl["id"])
    e = _post(client, h, cl["id"], amount=2_800_000, kind="service",
              label="Ажилчдын цалинд").json()["entry"]
    assert _receivable(client, h, cl["id"]) - before == 2_800_000

    r = client.post(f"/api/client-entries/{e['id']}/void", headers=h,
                    json={"reason": "хоёр удаа бичив"})
    assert r.status_code == 200, r.text
    assert _receivable(client, h, cl["id"]) == before, "авлага ЯГ буцаж ирнэ"

    prof = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    inv = next(i for i in prof["invoices"] if i["no"] == e["invoice_no"])
    assert inv["voided"], "нэхэмжлэл УСТАХГҮЙ — ХҮЧИНГҮЙ тэмдэгтэй үлдэнэ"
    rows = _entries(client, h, cl["id"])
    assert next(x for x in rows if x["id"] == e["id"])["voided"]


def test_voiding_a_credit_entry_voids_its_payment(client, as_role):
    h = as_role("otgoo")
    cl, _c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    before = _receivable(client, h, cl["id"])
    e = _post(client, h, cl["id"], amount=-500_000, kind="adjustment",
              label="Залруулга").json()["entry"]
    client.post(f"/api/client-entries/{e['id']}/void", headers=h, json={"reason": "буруу"})
    assert _receivable(client, h, cl["id"]) == before
    pays = client.get(f"/api/payments?client_id={cl['id']}", headers=h).json()
    assert next(p for p in pays if p["id"] == e["payment_id"])["voided"]


def test_a_paid_entry_invoice_releases_its_allocation_when_voided(client, as_role):
    """Бичилтийн нэхэмжлэлд төлбөр суусан бол цуцлалт нь мөнгийг СУЛЛАНА."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Суллах тест ХХК"}, headers=h).json()
    e = _post(client, h, cl["id"], amount=1_000_000, kind="advance",
              label="Олгосон зээл").json()["entry"]
    client.post("/api/payments", headers=h, json={
        "client_id": cl["id"], "date": iso(0), "amount": 400_000, "method": "CASH"})
    assert _receivable(client, h, cl["id"]) == 600_000
    client.post(f"/api/client-entries/{e['id']}/void", headers=h, json={"reason": "буруу"})
    # Нэхэмжлэл алга болсон тул 400,000₮ нь ХУВААРИЛАГДААГҮЙ кредит болж үлдэнэ
    assert _receivable(client, h, cl["id"]) == 0


def test_void_needs_a_reason_and_never_repeats(client, as_role):
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Шалтгааны тест ХХК"}, headers=h).json()
    e = _post(client, h, cl["id"], amount=1_000, kind="adjustment", label="мөр").json()["entry"]
    assert client.post(f"/api/client-entries/{e['id']}/void", headers=h,
                       json={"reason": " "}).status_code == 400
    assert client.post(f"/api/client-entries/{e['id']}/void", headers=h,
                       json={"reason": "зөв"}).status_code == 200
    assert client.post(f"/api/client-entries/{e['id']}/void", headers=h,
                       json={"reason": "дахин"}).status_code == 409


# ---------- 5. ВАЛИДАЦИ ----------

def test_the_label_is_required_because_a_number_alone_answers_nothing(client, as_role):
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Шошгын тест ХХК"}, headers=h).json()
    r = _post(client, h, cl["id"], amount=1_000_000, kind="advance", label="   ")
    assert r.status_code == 400
    assert "шошго" in r.json()["detail"].lower() or "нэр" in r.json()["detail"].lower()


def test_zero_is_not_an_entry(client, as_role):
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Тэгийн тест ХХК"}, headers=h).json()
    assert _post(client, h, cl["id"], amount=0, kind="advance", label="хоосон").status_code == 400


def test_an_unknown_kind_is_refused(client, as_role):
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Төрлийн тест ХХК"}, headers=h).json()
    assert _post(client, h, cl["id"], amount=100, kind="хачин",
                 label="мөр").status_code == 400


def test_entries_are_manager_and_finance_only(client, as_role):
    hd, ho, hf = as_role("darga"), as_role("otgoo"), as_role("sanhuu")
    cl = client.post("/api/clients", json={"name": "Ролийн тест ХХК"}, headers=ho).json()
    e = _post(client, ho, cl["id"], amount=1_000, kind="adjustment", label="мөр").json()["entry"]
    assert client.get(f"/api/clients/{cl['id']}/entries", headers=hd).status_code == 403
    assert _post(client, hd, cl["id"], amount=1_000, kind="adjustment",
                 label="мөр").status_code == 403
    assert client.post(f"/api/client-entries/{e['id']}/void", headers=hd,
                       json={"reason": "х"}).status_code == 403
    assert _post(client, hf, cl["id"], amount=2_000, kind="service",
                 label="санхүүч бичив").status_code == 200


# ---------- 6. БАРИМТ ----------

def test_the_pdf_of_an_entry_invoice_names_the_kind_and_the_label(client, as_role):
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Баримтын тест ХХК"}, headers=h).json()
    e = _post(client, h, cl["id"], amount=164_492_000, kind="advance",
              label="2025 онд бэлэн мөнгө зээлсэн", ref="Бутан-Өнөорд!G23").json()["entry"]
    prof = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    inv = next(i for i in prof["invoices"] if i["no"] == e["invoice_no"])
    r = client.get(f"/api/invoices/{inv['id']}/pdf", headers=h)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    assert len(r.content) > 1000


# ---------- 7. ДАХИН БОДОЛТ ЭНД ХҮРЭХГҮЙ ----------

def test_a_rebuild_of_the_rent_contract_never_touches_the_entry_invoice(client, as_role):
    """Бичилт нь OB данс дээр сууна — `rebuild` тэнд ХЭЗЭЭ Ч хүрдэггүй."""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    e = _post(client, h, cl["id"], amount=10_000_000, kind="service",
              label="Авто кран түрээс", ref="АшидДонж-11!P30").json()["entry"]
    before = _receivable(client, h, cl["id"])
    r = client.patch(f"/api/contracts/{c['id']}", headers=h,
                     json={"start_date": iso(45), "confirm": True})
    assert r.status_code == 200, r.text
    prof = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    inv = next(i for i in prof["invoices"] if i["no"] == e["invoice_no"])
    assert inv["total"] == 10_000_000 and not inv["voided"]
    assert _receivable(client, h, cl["id"]) >= before - 1, "бичилт дахин бодолтод амьд үлдэнэ"

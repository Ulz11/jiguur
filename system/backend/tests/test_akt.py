"""ЧӨЛӨӨТ АКТ БИЧИЛТ — гарын үсэгтэй хэлэлцээрийн мөр (R12 / түр R15 / H4).

Отгоо эгчийн АКТ бол зөвхөн эвдрэлийн хөлс биш: тээвэр, цэвэрлэгээ, кран
дуудлага нэг циклд эвхэгддэг (=1730000+350000+1163500+1206500), БАС хөнгөлөлт
байдаг («нийт актнаас 15% хасч тооцлоо» ×0.85). Систем нь өнөөдөр зөвхөн
хөдөлгөөнөөс гарсан засвар/актын хөлсийг боддог — «акт» гэдэг үгийн НӨГӨӨ ХАГАСТ
нүд алга байв.

Энэ файл нь тэр нүдийг шалгана: ±дүн, заавал тэмдэглэлтэй, циклд эвхэгдэж
нэхэмжлэл болдог, нэхэмжлэгдсэн цонхонд хүрвэл дахин бодолтын хаалгаар ордог,
устдаггүй — ХҮЧИНГҮЙ болдог.
"""
import json
from datetime import date, timedelta

from app import models
from app.services import billing

from tests.test_billing import db, setup_contract, mv          # noqa: F401
from tests.test_api import iso, make_contract, _confirm_pending


# ---------- 1. Хөдөлгүүр: акт нь ӨӨРИЙН МӨР болж циклд эвхэгдэнэ ----------

def test_akt_entry_folds_into_charges_as_its_own_line(db):
    """1,163,500₮ кран дуудлага — циклийн төлбөрт өөрийн нэрээрээ орно.

    Хөдөлгөөнөөс гарсан «Засвар»/«Акт» мөрөөс ЯЛГАГДАНА: шошго нь тэмдэглэлээ
    авч явна («Акт: Кран дуудлага») — Отгоо цаасан дээрээс «юуны төлөө» гэдгийг
    уншина.
    """
    c, m, ga, gb = setup_contract(db)                       # 2026-03-20, 30 хоног
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 25),
                           amount=1_163_500, note="Кран дуудлага"))
    db.commit()
    db.refresh(c)

    total, items = billing.charges_in(c, date(2026, 3, 20), date(2026, 4, 19))
    assert total == 1_163_500
    assert items == [{"date": "2026-03-25", "desc": "Акт: Кран дуудлага",
                      "amount": 1_163_500}]


def test_akt_in_open_cycle_materialises_invoice_with_vat(db):
    """Циклийн нэхэмжлэл нь түрээс + акт болж, НӨАТ нь ХОЁУЛАНГ нь барина.

    100ш × 330₮ × 30 хоног = 990,000₮ түрээс; акт 1,163,500₮;
    НӨАТ 10% = (990,000 + 1,163,500) × 0.1 = 215,350₮; нийт 2,368,850₮.
    """
    c, m, ga, gb = setup_contract(db)
    c.vat_percent = 10
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 25),
                           amount=1_163_500, note="Кран дуудлага"))
    db.commit()
    db.refresh(c)

    sp = billing.derivable_invoice_specs(c, date(2026, 4, 25))[0]
    assert sp["rent_amount"] == 990_000
    assert sp["charge_amount"] == 1_163_500
    assert sp["vat_amount"] == 215_350
    assert sp["total"] == 2_368_850
    # Нэхэмжлэлийн PDF нь ЯГ эндээс мөрөө уншина (`detail_json` → charges)
    charges = json.loads(sp["detail_json"])["charges"]
    assert charges == [{"date": "2026-03-25", "desc": "Акт: Кран дуудлага",
                        "amount": 1_163_500}]


def test_akt_only_cycle_materialises_an_invoice(db):
    """Түрээс 0 боловч акт бий — цикл нэхэмжлэл БОЛНО.

    Хоосон циклийг алгасдаг дүрэм (`rent == 0 and charge == 0`) актыг
    төлбөр гэж хараагүй бол гарын үсэгтэй акт нэхэмжлэлгүй үлдэнэ.
    """
    c, m, ga, gb = setup_contract(db)                       # хөдөлгөөн ОГТ БАЙХГҮЙ
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 25),
                           amount=1_730_000, note="Тээвэр"))
    db.commit()
    db.refresh(c)

    specs = billing.derivable_invoice_specs(c, date(2026, 4, 25))
    assert len(specs) == 1
    assert specs[0]["rent_amount"] == 0
    assert specs[0]["charge_amount"] == 1_730_000
    assert specs[0]["total"] == 1_730_000


def test_akt_discount_reduces_the_cycle_total(db):
    """«Нийт актнаас 15% хасч тооцлоо» — сөрөг мөр нь циклийн дүнг БУУРУУЛНА.

    990,000₮ түрээс дээр −148,500₮ (15%) хөнгөлөлт → 841,500₮.
    """
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 25),
                           amount=-148_500, note="Гэрээний дагуу 15% хөнгөлөв"))
    db.commit()
    db.refresh(c)

    sp = billing.derivable_invoice_specs(c, date(2026, 4, 25))[0]
    assert sp["charge_amount"] == -148_500
    assert sp["total"] == 841_500


def test_voided_akt_leaves_the_engine_completely(db):
    """ХҮЧИНГҮЙ бичилт нь тооцоонд ч, баримтын мөрөнд ч ОРОХГҮЙ."""
    from datetime import datetime

    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    a = models.AktEntry(contract_id=c.id, date=date(2026, 3, 25),
                        amount=500_000, note="Цэвэрлэгээ",
                        voided_at=datetime(2026, 4, 1), void_reason="давхар бичсэн")
    db.add(a)
    db.commit()
    db.refresh(c)

    total, items = billing.charges_in(c, date(2026, 3, 20), date(2026, 4, 19))
    assert total == 0
    assert items == []
    assert billing.derivable_invoice_specs(c, date(2026, 4, 25))[0]["total"] == 990_000


def test_akt_lands_in_the_calendar_month_window(db):
    """Календарь горимд (R5/H3) мөр нь САРЫН цонхондоо унана — тусгай кодгүй.

    Гэрээ 1.31-нд эхэлбэл хоёр дахь цонх нь [2.28, 3.31) болж хумигдана;
    3.15-ны акт нь ГУРАВ дахь цонхонд [3.31…) БИШ, хоёр дахьд нь унана.
    """
    c, m, ga, gb = setup_contract(db, start=date(2026, 1, 31))
    c.cycle_mode = "month"
    db.commit()
    db.refresh(c)

    assert billing.cycle_of(c, date(2026, 1, 31)) == (date(2026, 1, 31), date(2026, 2, 28))
    assert billing.cycle_of(c, date(2026, 3, 15)) == (date(2026, 2, 28), date(2026, 3, 31))
    assert billing.cycle_of(c, date(2026, 3, 31)) == (date(2026, 3, 31), date(2026, 4, 30))
    assert billing.cycle_of(c, date(2026, 1, 30)) is None      # эхлэлээс өмнө


# ---------- 2. API: бичих, засах, хүчингүй болгох ----------

def _setup(client, as_role, days_ago=40, qty=100, invoiced=True):
    """Гэрээ + баталгаажсан ачилт. `invoiced` бол дууссан циклүүд нь аль хэдийн
    нэхэмжлэгдсэн (хуудсаа нээсэн Отгоогийн бодит байдал)."""
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    # Алдангийг унтраана — актын тооцоог алдангийн өсөлт бүрхэхгүй
    h = as_role("otgoo")
    client.patch(f"/api/contracts/{cid}", headers=h, json={"penalty_percent": 0})
    if invoiced:
        client.get(f"/api/contracts/{cid}", headers=h)      # ensure_invoices
    return cl_id, cid


def _detail(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()


def _invoices(client, h, cid):
    return sorted(_detail(client, h, cid)["invoices"], key=lambda i: i["due_date"])


def _akt(client, h, cid, **body):
    return client.post(f"/api/contracts/{cid}/akt", headers=h, json=body)


def test_akt_requires_a_note(client, as_role):
    """Тэмдэглэлгүй акт бол тайлагдахгүй мөнгө — 400."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    r = _akt(client, h, cid, date=iso(5), amount=100_000, note="   ")
    assert r.status_code == 400
    assert "тэмдэглэл" in r.json()["detail"].lower()


def test_akt_in_uninvoiced_cycle_is_free_and_lands_in_its_window(client, as_role):
    """Явагдаж буй циклийн акт — дахин бодолт хэрэггүй, шууд бичигдэнэ.

    Мөр нь ХААШАА буусныг өөрөө хэлнэ: буусан циклийн цонх мөрөндөө бичигдэнэ.
    """
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)                       # эхлэл 40 хоногийн өмнө
    r = _akt(client, h, cid, date=iso(5), amount=1_206_500, note="Тээвэр")
    assert r.status_code == 200, r.text
    assert not r.json().get("rebuild_required")

    rows = _detail(client, h, cid)["akt_entries"]
    assert len(rows) == 1
    assert rows[0]["amount"] == 1_206_500
    assert rows[0]["note"] == "Тээвэр"
    assert rows[0]["voided"] is False
    # 2 дахь цикл [эхлэл+30, эхлэл+60) — 5 хоногийн өмнөх огноо тэнд унана
    assert rows[0]["cycle_start"] <= iso(5) < rows[0]["cycle_end"]


def test_akt_in_a_completed_but_unbilled_cycle_needs_no_rebuild(client, as_role):
    """Цикл дууссан ч нэхэмжлэл хараахан төрөөгүй бол — дахин бодох юм алга.

    Актыг чөлөөтэй бичээд, нэхэмжлэл нь ТӨРӨХДӨӨ түүнийг агуулж гарч ирнэ:
    990,000₮ түрээс + 1,163,500₮ акт = 2,153,500₮.
    """
    h = as_role("otgoo")
    _, cid = _setup(client, as_role, invoiced=False)
    r = _akt(client, h, cid, date=iso(35), amount=1_163_500, note="Кран дуудлага")
    assert r.status_code == 200, r.text
    assert not r.json().get("rebuild_required")

    inv = _invoices(client, h, cid)[0]                     # энд ШИНЭЭР төрнө
    assert inv["rent_amount"] == 990_000
    assert inv["charge_amount"] == 1_163_500
    assert inv["total"] == 2_153_500


def test_akt_in_invoiced_window_asks_first_then_rebuilds(client, as_role):
    """Нэхэмжилсэн циклийн акт — эхлээд ЗӨРҮҮ, дараа нь баталгаажуулалт.

    990,000₮ нэхэмжлэл бүрэн төлөгдсөн байхад 200,000₮-ийн акт нэмэгдэхэд:
    нийт 1,190,000₮ болж, төлбөр дахин тоглогдоод 200,000₮ үлдэгдэл гарна.
    """
    h = as_role("otgoo")
    cl_id, cid = _setup(client, as_role)
    inv = _invoices(client, h, cid)[0]
    assert inv["total"] == 990_000

    r = client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 990_000, "method": "BANK"})
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["outstanding"] == 0

    body = {"date": iso(35), "amount": 200_000, "note": "Цэвэрлэгээ"}
    r = _akt(client, h, cid, **body)
    assert r.status_code == 200, r.text
    prev = r.json()
    assert prev["rebuild_required"] is True
    assert len(prev["diffs"]) == 1
    assert prev["diffs"][0]["old_total"] == 990_000
    assert prev["diffs"][0]["new_total"] == 1_190_000
    # ⚠ ХУУРАЙ ажиллагаа — DB-д юу ч үлдээгүй
    assert _detail(client, h, cid)["akt_entries"] == []

    r = _akt(client, h, cid, confirm=True, **body)
    assert r.status_code == 200, r.text
    after = _invoices(client, h, cid)[0]
    assert after["total"] == 1_190_000
    assert after["paid"] == 990_000                        # төлбөр дахин тоглогдов
    assert after["outstanding"] == 200_000


def test_akt_discount_cannot_drive_a_cycle_negative(client, as_role):
    """Хэт их хөнгөлөлт — циклийн нийт дүн сөрөг болно гэж 400-аар зогсооно."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    r = _akt(client, h, cid, date=iso(35), amount=-2_000_000,
             note="15% хөнгөлөлт", confirm=True)
    assert r.status_code == 400
    assert r.json()["detail"] == billing.AKT_NEGATIVE_ERR
    assert _detail(client, h, cid)["akt_entries"] == []


def test_akt_discount_within_the_cycle_is_allowed(client, as_role):
    """990,000₮-ийн циклээс 148,500₮ (15%) хасахад — зөвшөөрөгдөнө."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    r = _akt(client, h, cid, date=iso(35), amount=-148_500,
             note="Нийт актнаас 15% хасч тооцов", confirm=True)
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["total"] == 841_500


def test_akt_rejected_on_sale_contract(client, as_role):
    """Худалдааны гэрээнд цикл байхгүй — бичсэн акт нэхэмжлэлгүй үлдэх тул 400."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Худалдаа ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    r = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "sale", "start_date": iso(10),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 10, "unit_price": 58_000}]})
    assert r.status_code == 200, r.text
    r = _akt(client, h, r.json()["id"], date=iso(5), amount=50_000, note="Тээвэр")
    assert r.status_code == 400
    assert "түрээс" in r.json()["detail"].lower()


# ---------- 3. Засах ба ХҮЧИНГҮЙ болгох ----------

def _booked_akt(client, h, cid, amount=200_000, note="Цэвэрлэгээ"):
    """Нэхэмжлэгдсэн циклд баталгаажсан акт — засвар/цуцлалтын эхлэл цэг."""
    r = _akt(client, h, cid, date=iso(35), amount=amount, note=note, confirm=True)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_patch_akt_amount_asks_first_then_rebuilds(client, as_role):
    """Хэлэлцээр дахин тохирогдоно — дүн засахад ЯГ тэр хаалгаар."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    aid = _booked_akt(client, h, cid)
    assert _invoices(client, h, cid)[0]["total"] == 1_190_000

    r = client.patch(f"/api/akt/{aid}", headers=h, json={"amount": 500_000})
    assert r.status_code == 200, r.text
    assert r.json()["rebuild_required"] is True
    assert r.json()["diffs"][0]["new_total"] == 1_490_000
    assert _invoices(client, h, cid)[0]["total"] == 1_190_000     # хуурай — хөдлөөгүй

    r = client.patch(f"/api/akt/{aid}", headers=h,
                     json={"amount": 500_000, "confirm": True})
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["total"] == 1_490_000
    assert _detail(client, h, cid)["akt_entries"][0]["amount"] == 500_000


def test_patch_akt_note_alone_is_still_gated(client, as_role):
    """Зөвхөн тэмдэглэл засахад ч хаалга нээгдэнэ — цаас нь өөрчлөгдөнө."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    aid = _booked_akt(client, h, cid)

    r = client.patch(f"/api/akt/{aid}", headers=h, json={"note": "Кран дуудлага"})
    assert r.json()["rebuild_required"] is True
    r = client.patch(f"/api/akt/{aid}", headers=h,
                     json={"note": "Кран дуудлага", "confirm": True})
    assert r.status_code == 200, r.text
    assert _detail(client, h, cid)["akt_entries"][0]["note"] == "Кран дуудлага"


def test_patch_akt_rejects_an_empty_note(client, as_role):
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    aid = _booked_akt(client, h, cid)
    r = client.patch(f"/api/akt/{aid}", headers=h, json={"note": "  ", "confirm": True})
    assert r.status_code == 400


def test_void_akt_restores_the_invoice_and_keeps_the_row(client, as_role):
    """Цуцлалт бол УСТГАЛ БИШ: мөр ХҮЧИНГҮЙ тэмдэгтэйгээ үлдэж, тооцоо буцна."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    aid = _booked_akt(client, h, cid)
    assert _invoices(client, h, cid)[0]["total"] == 1_190_000

    body = {"reason": "давхар бичсэн"}
    r = client.post(f"/api/akt/{aid}/void", headers=h, json=body)
    assert r.status_code == 200, r.text
    assert r.json()["rebuild_required"] is True
    assert r.json()["diffs"][0]["new_total"] == 990_000

    r = client.post(f"/api/akt/{aid}/void", headers=h, json={**body, "confirm": True})
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["total"] == 990_000

    rows = _detail(client, h, cid)["akt_entries"]
    assert len(rows) == 1                                  # УСТААГҮЙ
    assert rows[0]["voided"] is True
    assert rows[0]["void_reason"] == "давхар бичсэн"
    assert rows[0]["voided_by"]
    assert rows[0]["voided_at"]

    # Хоёр дахь удаа — 409
    assert client.post(f"/api/akt/{aid}/void", headers=h,
                       json={**body, "confirm": True}).status_code == 409


def test_void_akt_blocked_when_it_would_leave_the_cycle_negative(client, as_role):
    """Хөнгөлөлтийг барьж байсан нэмэгдэл гарвал цикл сөрөг болно — 400.

    990,000₮ түрээс + 2,000,000₮ акт дээр −2,500,000₮ хөнгөлөлт бичигдсэн бол
    (нийт 490,000₮) нэмэгдлийг цуцлах нь үлдэгдлийг −1,510,000₮ болгоно.
    """
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    aid = _booked_akt(client, h, cid, amount=2_000_000, note="Кран дуудлага")
    r = _akt(client, h, cid, date=iso(35), amount=-2_500_000,
             note="Тохиролцсоны дагуу хасав", confirm=True)
    assert r.status_code == 200, r.text
    assert _invoices(client, h, cid)[0]["total"] == 490_000

    r = client.post(f"/api/akt/{aid}/void", headers=h,
                    json={"reason": "буруу", "confirm": True})
    assert r.status_code == 400
    assert r.json()["detail"] == billing.AKT_NEGATIVE_ERR
    assert _invoices(client, h, cid)[0]["total"] == 490_000     # хөдлөөгүй


def test_void_akt_requires_a_reason(client, as_role):
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    aid = _booked_akt(client, h, cid)
    assert client.post(f"/api/akt/{aid}/void", headers=h,
                       json={"reason": " "}).status_code == 400


def test_akt_actions_are_audited(client, as_role):
    """Бичих, засах, цуцлах гурвуулаа audit-д мөрөө үлдээнэ."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    aid = _booked_akt(client, h, cid)
    client.patch(f"/api/akt/{aid}", headers=h, json={"amount": 300_000, "confirm": True})
    client.post(f"/api/akt/{aid}/void", headers=h,
                json={"reason": "буруу", "confirm": True})

    rows = client.get("/api/audit", headers=h).json()
    acts = {(r["action"], r["entity"]) for r in rows}
    assert ("create", "akt") in acts
    assert ("update", "akt") in acts
    assert ("void", "akt") in acts


# ---------- 4. Эрх ба МӨНГӨНИЙ ХАНА ----------

def test_finance_can_write_akt_but_factory_cannot(client, as_role):
    """Акт бол МӨНГӨ — санхүүчийнх, үйлдвэрийн даргынх БИШ."""
    _, cid = _setup(client, as_role)
    r = _akt(client, as_role("sanhuu"), cid, date=iso(5), amount=100_000, note="Тээвэр")
    assert r.status_code == 200, r.text
    r = _akt(client, as_role("darga"), cid, date=iso(5), amount=100_000, note="Тээвэр")
    assert r.status_code == 403


def test_factory_reads_the_akt_money_but_may_not_write_it(client, as_role):
    """Дарга актын бичилтийг УНШИНА — бичихгүй (эрх ба харагдац тусдаа).

    ⚠ Урьд нь энэ тест эсрэгийг барьдаг байв: «даргын хариунд актын бүлэг ч,
    дүн ч ОГТ БАЙХГҮЙ». Эзний шийдвэрээр (2026-09) хана унав — тэр «энэ
    гэрээнд ямар акт бичигдэв» гэж асуухад хариулах ёстой. Бичих эрх нь
    дээрх `test_finance_can_write_akt_but_factory_cannot`-д ХЭВЭЭР хаалттай.
    """
    from tests.test_money_tidy import numbers

    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    r = _akt(client, h, cid, date=iso(5), amount=1_234_567, note="Кран дуудлага")
    assert r.status_code == 200, r.text
    assert 1_234_567 in numbers(_detail(client, h, cid))       # менежерт БАЙНА

    payload = _detail(client, as_role("darga"), cid)
    assert "akt_entries" in payload, "даргад актын бүлэг ирсэнгүй"
    assert 1_234_567 in numbers(payload), "даргад актын дүн ирсэнгүй"
    assert [(a["date"], a["amount"], a["note"]) for a in payload["akt_entries"]] \
        == [(a["date"], a["amount"], a["note"]) for a in _detail(client, h, cid)["akt_entries"]]


# ---------- 5. БАРИМТ: хавсралт, нэхэмжлэл, акт-PDF ----------

def test_appendix_prints_the_akt_row_and_never_a_voided_one(db):
    """Хавсралтын Дэд дүн нь нэхэмжлэлтэйгээ тулгагдана — акт нь мөр болж гарна.

    ХҮЧИНГҮЙ бичилт хаана ч хэвлэгдэхгүй.
    """
    from datetime import datetime
    from app.services import pdfappendix

    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 25),
                           amount=1_206_500, note="Тээвэр"))
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 26),
                           amount=500_000, note="Цэвэрлэгээ",
                           voided_at=datetime(2026, 4, 1), void_reason="давхар"))
    db.commit()
    db.refresh(c)

    ap = pdfappendix.build_appendix(c, {ga.id: "А", gb.id: "В"},
                                    {m.id: "Хэв хашмал 6012"},
                                    date(2026, 3, 20), date(2026, 4, 19))
    notes = [r.note for r in ap.rows if r.note]
    assert "Акт: Тээвэр (2026-03-25)" in notes
    assert not any("Цэвэрлэгээ" in n for n in notes)
    assert ap.subtotal == 990_000 + 1_206_500


def test_act_pdf_rows_list_live_akt_entries_only(db):
    """Тооцоо нийлсэн актад бичилтүүд ӨӨРСДИЙН тэмдэглэлээрээ гарна.

    Гарын үсэг зурах цаасан дээр «юуны төлөө» гэдэг нь байх ёстой; хүчингүй
    болсон мөр нь ХЭЗЭЭ Ч гарахгүй.
    """
    from datetime import datetime
    from app.services import pdfgen

    c, m, ga, gb = setup_contract(db)
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 25),
                           amount=1_730_000, note="Тээвэр"))
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 28),
                           amount=-259_500, note="Нийт актнаас 15% хасав"))
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 3, 29),
                           amount=400_000, note="Цэвэрлэгээ",
                           voided_at=datetime(2026, 4, 1), void_reason="давхар"))
    db.commit()
    db.refresh(c)

    rows = pdfgen.akt_doc_rows(c)
    assert [r["note"] for r in rows] == ["Тээвэр", "Нийт актнаас 15% хасав"]
    assert [r["amount"] for r in rows] == [1_730_000, -259_500]
    assert rows[0]["date"] == "2026-03-25"

    # «НИЙТ АКТ» — Отгоо эгчийн ӨӨРИЙНХ нь дүрмийн СУУРЬ тоо («нийт актнаас
    # 15% хасч тооцлоо»). Урьд нь цаасан дээр мөр бүр тус тусдаа хэвлэгдээд,
    # нийлбэр нь ХААНА Ч байхгүй байв. Хүчингүй мөр Σ-д ОРОХГҮЙ.
    assert pdfgen.akt_doc_total(rows) == 1_470_500
    assert pdfgen.akt_doc_total([]) == 0


def test_act_pdf_draws_the_akt_total_line(client, as_role):
    """Тооцоо нийлсэн акт нь «Нийт акт» мөртэйгээ зурагдана (нэмэгдэл + хөнгөлөлт).

    Отгоо эгч «нийт актнаас 15% хасч тооцлоо» гэж бичдэг — тэр СУУРЬ тоо
    цаасан дээр байх ёстой. PDF-ээс текст задлах сан төсөлд байхгүй тул
    нийлбэрийг цэвэр функцээр (`akt_doc_total`), зурагдсаныг %PDF-ээр шалгана.
    """
    from app.services import pdfgen

    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    assert _akt(client, h, cid, date=iso(35), amount=1_730_000,
                note="Тээвэр", confirm=True).status_code == 200
    assert _akt(client, h, cid, date=iso(34), amount=-259_500,
                note="Нийт актнаас 15% хасав", confirm=True).status_code == 200

    # Цаасан дээр гарах мөрүүд = хүчинтэй актын бичилтүүд (`akt_doc_rows`-ийн
    # хэлбэр). Тэдгээрийн Σ нь ЯГ энэ тоо байх ёстой.
    rows = [{"date": a["date"], "note": a["note"], "amount": a["amount"]}
            for a in _detail(client, h, cid)["akt_entries"] if not a["voided"]]
    assert len(rows) == 2
    assert pdfgen.akt_doc_total(rows) == 1_470_500

    r = client.get(f"/api/contracts/{cid}/act-pdf", headers=h)
    assert r.status_code == 200, r.text[:200]
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000


def test_documents_render_with_an_akt_present(client, as_role):
    """Гурван баримт бүгд актын мөртэйгээ зурагдана (%PDF)."""
    h = as_role("otgoo")
    _, cid = _setup(client, as_role)
    assert _akt(client, h, cid, date=iso(35), amount=350_000,
                note="Цэвэрлэгээ", confirm=True).status_code == 200

    inv = _invoices(client, h, cid)[0]
    for path in (f"/api/invoices/{inv['id']}/pdf",
                 f"/api/invoices/{inv['id']}/appendix-pdf",
                 f"/api/contracts/{cid}/act-pdf"):
        r = client.get(path, headers=h)
        assert r.status_code == 200, (path, r.text[:200])
        assert r.content[:4] == b"%PDF", path
        assert len(r.content) > 1000, path

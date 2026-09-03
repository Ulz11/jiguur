"""H7-ийн ГУРАВ ДАХЬ ГАРЦ — «Худалдаа болгох» (SALE).

Отгоо эгчийн бодит явдал: ажил дуусахад харилцагч хэвээ буцааж ачихын оронд
ӨӨРТӨӨ АВЧ ҮЛДДЭГ. Тэр агшинд гурван зүйл ЗЭРЭГ болох ёстой:
  (а) тэр тооны түрээс ТЭР ӨДРӨӨС зогсоно,
  (б) бараа паркаас ГАРНА (буцаж ирээгүй тул `on_hand` руу ч, `written_off`
      руу ч орохгүй — худалдааны гэрээний ISSUE-тэй яг ижил),
  (в) ХУДАЛДАХ ҮНЭЭР нэхэгдэнэ — актын НБҮнээр БИШ.

Загварын шийдвэр: SALE бол RETURN-ийн дэд тоо БИШ, бие даасан ТӨРӨЛ.
Бүтцээрээ WRITEOFF-тэй ах дүү (гадаа байхдаа паркаас гарна) ч ҮНИЙН СУУРЬ
нь өөр (`sale_price`) бөгөөс УТГА нь өөр («Худалдаа» ≠ «Акт»).

ХЭМЖИГДЭХҮҮН (Хэв хашмал 6012 · А зэрэглэл): тариф 330₮/хоног,
НБҮнэ 69,500₮, ХУДАЛДАХ үнэ 58,000₮ — хоёр үнэ ЗӨРНӨ, тиймээс аль нь
хэрэглэгдсэнийг тоо нь өөрөө хэлнэ.
"""
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")  # in-memory

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app import models
from app.services import billing

from tests.test_billing import setup_contract, mv


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def _priced(db, m, ga, nb=69_500, sale=58_000):
    """Каталогийн ХОЁР шатлалт үнэ (R32): акт нь НБҮнээр, худалдаа нь худалдах үнээр."""
    db.add(models.MaterialGradePrice(material_id=m.id, grade_id=ga.id,
                                     nb_price=nb, sale_price=sale))
    db.commit()


# ---------- 1. Тоолуур ЗОГСОНО ----------

def test_sale_stops_the_meter_for_the_sold_qty_from_its_date(db):
    """Худалдсан тоо нь худалдсан ӨДРӨӨС хойш түрээс төлөхөө болино.

    Энэ нь ТУСГАЙ КОДГҮЙГЭЭР гарах ёстой: SALE нь ISSUE биш тул падангаас
    хасагдана (`_lots` → `_allocate`), тэгээд `_lot_segments` өөрөө таслана.

    100ш 3.20-нд гарч, 40ш 4.05-нд ХУДАЛДАГДВАЛ [3.20, 4.19) цикл:
      100 × 330 × 16 хоног (3.20→4.05) = 528,000
    +  60 × 330 × 14 хоног (4.05→4.19) = 277,200
    = 805,200₮ — худалдаагүй бол 990,000₮ байх байсан.
    ЗӨРҮҮ = 40 × 330 × 14 = 184,800₮ ЯГ.
    """
    c, m, ga, gb = setup_contract(db)
    _priced(db, m, ga)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    mv(db, c, "SALE", date(2026, 4, 5), [dict(material_id=m.id, grade_id=ga.id, qty=40,
                                              sale_fee=40 * 58_000)])
    total, _ = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))
    assert total == pytest.approx(100 * 330 * 16 + 60 * 330 * 14)
    assert total == pytest.approx(805_200)
    assert 990_000 - total == pytest.approx(40 * 330 * 14)


def test_sale_qty_never_accrues_again_in_the_next_cycle(db):
    """Дараагийн циклд 60ш л үлдэнэ — худалдсан 40ш эргэж ирэхгүй."""
    c, m, ga, gb = setup_contract(db)
    _priced(db, m, ga)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    mv(db, c, "SALE", date(2026, 4, 5), [dict(material_id=m.id, grade_id=ga.id, qty=40,
                                              sale_fee=40 * 58_000)])
    total, _ = billing.accrue_rent(c, date(2026, 4, 19), date(2026, 5, 19))
    assert total == pytest.approx(60 * 330 * 30)


# ---------- 2. Мөнгө нь ХУДАЛДАХ ҮНЭЭР, өөрийн циклдээ ----------

def test_sale_charge_is_qty_times_sale_price_in_the_cycle_of_its_date(db):
    """qty × sale_price нь ОГНОО НЬ УНАСАН циклийн нэхэмжлэлд орно.

    Шошго нь «Худалдаа» — «Акт» БИШ: акт бол эвдэрсэн барааны нөхөн үнэ,
    худалдаа бол зарсан барааны үнэ. Хоёулаа `charge_amount` руу нийлдэг ч
    ялгагдахгүй бол тайлан дээр буруу халаас руу орно.
    """
    c, m, ga, gb = setup_contract(db)
    _priced(db, m, ga)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    mv(db, c, "SALE", date(2026, 4, 5), [dict(material_id=m.id, grade_id=ga.id, qty=40,
                                              sale_fee=40 * 58_000)])
    total, items = billing.charges_in(c, date(2026, 3, 20), date(2026, 4, 19))
    assert total == pytest.approx(40 * 58_000)          # 2,320,000 — НБҮнэ (69,500) БИШ
    assert [i["desc"] for i in items] == ["Худалдаа"]
    # Дараагийн циклд ДАХИН нэхэгдэхгүй
    assert billing.charges_in(c, date(2026, 4, 19), date(2026, 5, 19))[0] == 0


def test_sale_lands_on_the_invoice_of_its_own_cycle(db):
    """Нэхэмжлэл: түрээс ба худалдааны дүн НЭГ цаасан дээр, тус тусдаа."""
    c, m, ga, gb = setup_contract(db)
    _priced(db, m, ga)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    mv(db, c, "SALE", date(2026, 4, 5), [dict(material_id=m.id, grade_id=ga.id, qty=40,
                                              sale_fee=40 * 58_000)])
    billing.ensure_invoices(db, c, date(2026, 4, 25))
    db.refresh(c)
    inv = next(i for i in c.invoices if i.cycle_start == date(2026, 3, 20))
    assert inv.rent_amount == pytest.approx(805_200)
    assert inv.charge_amount == pytest.approx(2_320_000)
    assert inv.total == pytest.approx(805_200 + 2_320_000)


# ---------- 3. Нөөц: ПАРКААС ГАРНА, ямар ч хувиарь түүнийг АВАХГҮЙ ----------

def test_sale_leaves_on_rent_and_no_bucket_gains_it(db):
    """Худалдсан бараа `on_rent`-оос гарна — `on_hand` ч, `written_off` ч БИШ.

    Энэ бол худалдааны гэрээний ISSUE-ийн ЯГ тэр урьдчилсан жишиг: зарагдсан
    бараа хувиарьтай үлдэхгүй, паркаас ГАРНА. Иймд «Нийт эзэмшил» буурна —
    зөв, учир нь парк үнэхээр багассан.
    """
    c, m, ga, gb = setup_contract(db)
    _priced(db, m, ga)
    i = mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    billing.apply_movement_stock(db, i)
    st = db.query(models.Stock).filter_by(material_id=m.id, grade_id=ga.id).first()
    db.refresh(st)
    assert (st.on_hand, st.on_rent, st.in_repair, st.written_off) == (4900, 100, 0, 0)

    s = mv(db, c, "SALE", date(2026, 4, 5), [dict(material_id=m.id, grade_id=ga.id, qty=40,
                                                  sale_fee=40 * 58_000)])
    billing.apply_movement_stock(db, s)
    db.refresh(st)
    assert st.on_rent == 60                       # 40 нь гадаа байхаа больсон
    assert st.on_hand == 4900                     # агуулахад БУЦААГҮЙ
    assert st.in_repair == 0 and st.written_off == 0   # акталсан ч БИШ
    assert st.on_hand + st.on_rent + st.in_repair == 4960   # 5000 − 40 зарагдсан


def test_sold_lot_is_consumed_so_a_later_return_cannot_double_count(db):
    """Худалдсаны дараа ҮЛДСЭНЭЭС илүүг буцаах боломжгүй — падан хаагдсан.

    `qty_on` бол буцаалтын валидацийн ганц эх сурвалж; SALE нь падангаас
    хасагддаг тул тэр тоо аяндаа 60 болно. Хэрэв SALE паданг хаадаггүй бол
    100ш буцаагдаад, 40ш нь ХОЁР УДАА (зарагдсан + буцсан) тоологдох байв.
    """
    c, m, ga, gb = setup_contract(db)
    _priced(db, m, ga)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    mv(db, c, "SALE", date(2026, 4, 5), [dict(material_id=m.id, grade_id=ga.id, qty=40,
                                              sale_fee=40 * 58_000)])
    assert billing.qty_on(c, m.id, ga.id, date(2026, 4, 6)) == 60
    lot = billing._lots(c)[0]
    assert lot["left"] == 60
    # Үлдсэн 60-ыг буцаавал падан бүрэн хаагдана, түрээс ч зогсоно
    mv(db, c, "RETURN", date(2026, 4, 10), [dict(material_id=m.id, grade_id=ga.id, qty=60)])
    assert billing.qty_on(c, m.id, ga.id, date(2026, 4, 11)) == 0
    assert billing._lots(c)[0]["left"] == 0
    total, _ = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))
    # 100×16 (3.20→4.05) + 60×5 (4.05→4.10) + 0 — худалдсан 40 дахин тоологдохгүй
    assert total == pytest.approx((100 * 16 + 60 * 5) * 330)


# ---------- 4. ОРЛОГЫН ХАЛААС — түрээс биш, ХУДАЛДАА ----------

def _pnl_setup(db):
    """Түрээсийн гэрээ: 10 сая түрээс + 1 сая засвар + 2.32 сая ХУДАЛДАА."""
    from app.services import reports as R          # noqa: F401 — эх сурвалж нэг

    cl = models.Client(name="Худалдаа ХХК")
    db.add(cl)
    db.flush()
    c = models.Contract(no="r1", client_id=cl.id, type="rent",
                        start_date=date(2026, 6, 10), penalty_percent=0)
    db.add(c)
    db.flush()
    db.add(models.Invoice(
        contract_id=c.id, no="R-r1-1", cycle_start=date(2026, 6, 10),
        cycle_end=date(2026, 7, 10), due_date=date(2026, 7, 10),
        rent_amount=10_000_000, charge_amount=3_320_000,
        total=13_320_000,
        detail_json=json.dumps({"lines": [], "charges": [
            {"date": "2026-06-20", "desc": "Засвар", "amount": 1_000_000},
            {"date": "2026-06-25", "desc": "Худалдаа", "amount": 2_320_000},
        ]})))
    db.commit()
    return c


def test_sale_line_is_not_rental_income(db):
    """«Худалдаа» мөр нь ТҮРЭЭСИЙН орлогод ОРОХГҮЙ (Фаза А-гийн дотоод кран).

    Нэхэмжлэлийн `charge_amount` дотор яваа болохоор урьд нь бүхэлдээ
    түрээсийн орлого болж тоологдох байсан — зарсан хэвний үнэ «түрээсийн
    орлого» гэж уншигдах нь тайлангийн ХУДАЛ.
    """
    from app.services import reports as R
    _pnl_setup(db)
    p = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))
    assert p["rent_income"] == 11_000_000          # 10 сая түрээс + 1 сая засвар
    assert p["sale_income"] == 2_320_000           # худалдааны халаас руу шилжив
    assert p["total_income"] == 13_320_000         # нийт нь ХЭВЭЭР — алга болоогүй


def test_sale_line_is_surfaced_in_the_detail_not_folded(db):
    """Задаргаа нь дүнгээ БҮТНЭЭР өгнө — хоёр түвшин зөрөх боломжгүй."""
    from app.services import reports as R
    _pnl_setup(db)
    d = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))["detail"]
    p = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))
    # (а) түрээсийн задаргаа — худалдаа нь ЭНД байхгүй
    assert (d["rent_net"] + d["charge"]["repair"] + d["charge"]["writeoff"]
            + d["charge"]["akt"] + d["charge"]["other"]) == p["rent_income"]
    assert d["rent_net"] == 10_000_000
    assert sum(r["total"] for r in d["rent_invoices"]) == p["rent_income"]
    assert d["rent_invoices"][0]["sale"] == 2_320_000     # мөрөндөө нэрлэгдэнэ
    assert d["rent_invoices"][0]["charge"] == 1_000_000   # засвар л үлдэнэ
    # (б) худалдааны задаргаа — мөр нь ЭНД гарна, чимээгүй нийлүүлээгүй
    assert d["sale_charge"] == 2_320_000
    assert len(d["sale_charges"]) == 1
    assert d["sale_charges"][0]["contract_no"] == "r1"
    assert (sum(r["amount"] for r in d["sale_invoices"])
            + d["sale_charge"]) == p["sale_income"]
    # (в) «Задаргаагүй» халаас руу чимээгүй унаагүй
    assert d["charge"]["other"] == 0
    assert all(r["desc"] != "Худалдаа" for r in d["charge"]["rows"])


# ---------- 5. API — бүртгэх зам, хаалт, роль, цуцлалт ----------
#
# Эндээс доош `client` fixture (conftest) — бүрэн seed-тэй, ЖИНХЭНЭ каталогийн
# үнэтэй DB. Хэв хашмал 6012 · А: НБҮнэ 69,500₮ · ХУДАЛДАХ 58,000₮.

from tests.test_api import iso, make_contract, _confirm_pending      # noqa: E402

SALE_PRICE = 58_000
NB_PRICE = 69_500


def _sale_setup(client, as_role, qty=100, days_ago=40):
    _, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    h = as_role("otgoo")
    client.patch(f"/api/contracts/{cid}", headers=h, json={"penalty_percent": 0})
    return cid, m, st


def _sell(client, h, cid, m, st, qty, day=None, **extra):
    return client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "SALE", "date": day or iso(0), "note": "Худалдаа болгов",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": qty, **extra}]})


def _movements(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()["movements"]


def test_api_records_a_sale_at_the_sale_price(client, as_role):
    """Бүртгэх зам: дүн нь ХУДАЛДАХ үнээр — серверийн каталогоос, гараар БИШ."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role)
    r = _sell(client, h, cid, m, st, 40)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "done"            # ISSUE л хүлээгддэг

    mv = next(x for x in _movements(client, h, cid) if x["type"] == "SALE")
    assert mv["lines"][0]["sale_fee"] == 40 * SALE_PRICE
    assert mv["lines"][0]["sale_fee"] != 40 * NB_PRICE     # актын үнэ БИШ


def test_api_refuses_selling_more_than_is_out(client, as_role):
    """Түрээсэнд байгаагаас илүүг зарах боломжгүй — үлдэгдэл сөрөг болно."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100)
    r = _sell(client, h, cid, m, st, 140)
    assert r.status_code == 400
    assert "түрээсэнд" in r.json()["detail"].lower()


def test_sale_movement_on_a_sale_contract_is_refused(client, as_role):
    """Худалдааны гэрээн дээр «худалдаа болгох» нь УТГАГҮЙ — татгалзана.

    ДҮРЭМ: SALE бол ТҮРЭЭСИЙН гэрээний гарц. Худалдааны гэрээнд ачилт нь
    өөрөө худалдаа бөгөөс мөр бүр өөрийн нэхэмжлэлтэй (`S-…`); тэнд SALE
    бичих нь нэг барааг ХОЁР УДАА (олголтоор ба худалдаагаар) нэхэх байсан.
    """
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Худалдааны ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "sale", "start_date": iso(5),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 10, "unit_price": SALE_PRICE}]}).json()["id"]
    _confirm_pending(client, as_role, cid)
    r = _sell(client, h, cid, m, st, 5)
    assert r.status_code == 400
    assert "түрээсийн" in r.json()["detail"].lower()


def test_unknown_movement_type_is_still_refused(client, as_role):
    """Цагаан жагсаалт нээгдээгүй — зөвхөн НЭГ төрөл нэмэгдэв."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role)
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "GIFT", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 1}]})
    assert r.status_code == 400


# ---------- 6. Хаалтын wizard — ГУРАВ ДАХЬ ГАРЦ ----------

def test_close_preview_offers_the_sale_price_beside_the_book_price(client, as_role):
    """(a) алхмын мөр ГУРВАН гарцын ХОЁР ҮНИЙГ хамт хэлнэ (R13 + R32).

    Отгоо «дутагдуулбал 6,950,000 / худалдвал 5,800,000» гэдгийг ХАРАЛГҮЙГЭЭР
    шийдэж болохгүй — түүний арга нь үржвэрээ дахин бодох.
    """
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100)
    p = client.get(f"/api/contracts/{cid}/close-preview", headers=h).json()
    row = p["outstanding"][0]
    assert row["qty"] == 100
    assert row["nb_price"] == NB_PRICE and row["writeoff_amount"] == 100 * NB_PRICE
    assert row["sale_price"] == SALE_PRICE and row["sale_amount"] == 100 * SALE_PRICE


def test_a_sale_resolves_the_lot_and_unlocks_the_close(client, as_role):
    """Худалдаа бол ШИЙДВЭР: мөр гадаа үлдэгдлээс гарч, «Цааш» нээгдэнэ."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100)
    assert client.get(f"/api/contracts/{cid}/close-preview",
                      headers=h).json()["can_close"] is False
    assert _sell(client, h, cid, m, st, 100).status_code == 200

    p = client.get(f"/api/contracts/{cid}/close-preview", headers=h).json()
    assert p["outstanding"] == []
    assert p["can_close"] is True
    r = client.post(f"/api/contracts/{cid}/close", headers=h, json={"close_date": iso(0)})
    assert r.status_code == 200, r.text


def test_final_invoice_carries_the_sale_amount(client, as_role):
    """Хаалтын эцсийн тасархай нэхэмжлэлд худалдааны дүн ОРНО."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100, days_ago=40)
    client.get(f"/api/contracts/{cid}", headers=h)        # ensure_invoices
    assert _sell(client, h, cid, m, st, 100).status_code == 200
    p = client.get(f"/api/contracts/{cid}/close-preview", headers=h).json()
    fi = p["final_invoices"][0]
    # [today−10, today+1) → 100ш × 330 × 10 хоног + 100 × 58,000
    assert fi["rent_amount"] == 330_000
    assert fi["charge_amount"] == 100 * SALE_PRICE
    assert fi["total"] == 330_000 + 100 * SALE_PRICE


# ---------- 7. ДАРГА бичнэ, дүнг нь ч УНШИНА — хаалт нь хэвээр хаалттай ----

def test_factory_records_the_sale_and_can_read_its_amount(client, as_role):
    """Дарга бодит явдлыг бүртгээд, «хэдийн худалдав» гэдэгт хариулж чадна.

    ⚠ Урьд нь энэ тест «худалдааны ДҮН түүний токен руу явахгүй» гэдгийг
    барьдаг байв (58000 гэсэн тоо JSON-д хаана ч байхгүй). Эзний шийдвэрээр
    (2026-09) хана унав — эмх цэгц нь дэлгэц дээр, датанд биш.
    ГЭХДЭЭ хаалтын тооцоо нь ҮЙЛДЭЛ тул 403 ХЭВЭЭР.
    """
    hf = as_role("darga")
    cid, m, st = _sale_setup(client, as_role, qty=100)
    assert _sell(client, hf, cid, m, st, 40).status_code == 200

    d = client.get(f"/api/contracts/{cid}", headers=hf).json()
    mv = next(x for x in d["movements"] if x["type"] == "SALE")
    assert mv["lines"][0]["qty"] == 40                  # ТОО нь түүний ажил
    assert mv["lines"][0]["sale_fee"] == 40 * SALE_PRICE   # ДҮН нь ч ирнэ
    blob = json.dumps(d, ensure_ascii=False)
    assert str(SALE_PRICE) in blob and str(40 * SALE_PRICE) in blob
    # Гэрээний мөрөнд каталогийн худалдах үнэ ч ирнэ
    assert all("sale_price" in it for it in d["items"])
    # Хаалтын тооцоо бол ҮЙЛДЭЛ — даргад хаалттай ХЭВЭЭР
    assert client.get(f"/api/contracts/{cid}/close-preview", headers=hf).status_code == 403


# ---------- 8. ЦУЦЛАЛТ — H1-ийн тэгш хэм ----------

def test_void_restores_on_rent_and_reopens_the_lot(client, as_role):
    """Цуцлалт нь нөөцийг БУЦААЖ, паданг ДАХИН НЭЭНЭ (устгал биш)."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100)

    def stock():
        mats = client.get("/api/materials", headers=h).json()
        return next(s for s in next(x for x in mats if x["id"] == m["id"])["stock"]
                    if s["grade"] == "А")

    before = stock()
    assert _sell(client, h, cid, m, st, 40).status_code == 200
    after = stock()
    assert after["on_rent"] == before["on_rent"] - 40
    assert after["on_hand"] == before["on_hand"]        # агуулах хөндөгдөөгүй

    mid = next(x for x in _movements(client, h, cid) if x["type"] == "SALE")["id"]
    r = client.post(f"/api/movements/{mid}/void", headers=h,
                    json={"reason": "буруу бичив"})
    assert r.status_code == 200, r.text
    assert r.json()["voided"] is True
    back = stock()
    assert (back["on_rent"], back["on_hand"]) == (before["on_rent"], before["on_hand"])
    # Падан дахин нээгдэв — 100ш бүхэлдээ буцаагдаж чадна
    p = client.get(f"/api/contracts/{cid}/close-preview", headers=h).json()
    assert p["outstanding"][0]["qty"] == 100


def test_voiding_the_issue_that_fed_a_sale_is_refused_in_mongolian(client, as_role):
    """Худалдаа хассан паданг цуцлах гэвэл ТАТГАЛЗАНА — эхлээд худалдаагаа."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100)
    assert _sell(client, h, cid, m, st, 40).status_code == 200
    issue = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    r = client.post(f"/api/movements/{issue['id']}/void", headers=h,
                    json={"reason": "буруу гэрээнд олгов"})
    assert r.status_code == 409
    assert "падангаас" in r.json()["detail"]


def test_sale_inside_an_invoiced_window_goes_through_the_rebuild_gate(client, as_role):
    """Нэхэмжлэгдсэн цонхонд цуцлах нь эхлээд ЗӨРҮҮГ харуулна (preview→confirm)."""
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100, days_ago=40)
    client.get(f"/api/contracts/{cid}", headers=h)               # ensure_invoices
    # Эхний цикл дотор (35 хоногийн өмнө) худалдав — тэр цонх аль хэдийн цаас
    assert _sell(client, h, cid, m, st, 40, day=iso(35)).status_code == 200
    mid = next(x for x in _movements(client, h, cid) if x["type"] == "SALE")["id"]

    dry = client.post(f"/api/movements/{mid}/void", headers=h, json={"reason": "алдаа"})
    assert dry.status_code == 200, dry.text
    assert dry.json()["rebuild_required"] is True
    assert dry.json()["diffs"]
    assert not next(x for x in _movements(client, h, cid) if x["type"] == "SALE")["voided"]

    wet = client.post(f"/api/movements/{mid}/void", headers=h,
                      json={"reason": "алдаа", "confirm": True})
    assert wet.status_code == 200, wet.text
    assert next(x for x in _movements(client, h, cid) if x["type"] == "SALE")["voided"]


def test_rebuild_after_a_sale_is_stable(client, as_role):
    """Дахин бодолт ДАВТАГДАНА: хоёр дахь удаа тоо нь ХӨДӨЛӨХГҮЙ.

    Эхний rebuild нь ЖИНХЭНЭ өөрчлөлт хийнэ (нэхэмжлэл нь худалдааны өмнө
    төрсөн тул худалдааны дүн ороогүй байсан). Тогтвортой байдал гэдэг нь
    ХОЁР ДАХЬ удаагаас эхэлнэ — тэр л «машин түүхийг санамсаргүй дахин
    бичихгүй» гэсэн амлалт (H6).
    """
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100, days_ago=40)
    client.get(f"/api/contracts/{cid}", headers=h)
    assert _sell(client, h, cid, m, st, 40, day=iso(35)).status_code == 200

    def totals():
        d = client.get(f"/api/contracts/{cid}", headers=h).json()
        return sorted((i["no"], i["total"]) for i in d["invoices"])

    def touch(day):
        mid = next(x for x in _movements(client, h, cid) if x["type"] == "SALE")["id"]
        r = client.patch(f"/api/movements/{mid}", headers=h,
                         json={"date": day, "confirm": True})
        assert r.status_code == 200, r.text

    touch(iso(35))                                     # 1-р rebuild — дүн ТОГТНО
    settled = totals()
    # [t−40, t−10) цикл: 100×330×5 + 60×330×25 = 660,000 түрээс + 40×58,000 худалдаа
    assert settled == [("R-" + client.get(f"/api/contracts/{cid}",
                                          headers=h).json()["no"] + "-1",
                        660_000 + 40 * SALE_PRICE)]
    touch(iso(35))                                     # 2, 3-р rebuild — ХӨДӨЛӨХГҮЙ
    touch(iso(35))
    assert totals() == settled


# ---------- 9. БАРИМТУУД ----------

def test_pdfs_render_with_a_sale_line(client, as_role):
    """Нэхэмжлэл, хавсралт, акт гурвуулаа ХЭВЛЭГДЭНЭ — худалдааны мөртэйгээ.

    Хаалтын жинхэнэ дараалал: явагдаж буй циклд худалдаад, хаахад тэр цонх
    эцсийн ТАСАРХАЙ нэхэмжлэл болно — худалдааны мөр цаасан дээр гарна.
    """
    h = as_role("otgoo")
    cid, m, st = _sale_setup(client, as_role, qty=100, days_ago=40)
    client.get(f"/api/contracts/{cid}", headers=h)
    assert _sell(client, h, cid, m, st, 40).status_code == 200
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 60}]
    }).status_code == 200
    assert client.post(f"/api/contracts/{cid}/close", headers=h,
                       json={"close_date": iso(0)}).status_code == 200
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    inv = next(i for i in d["invoices"] if i["charge_amount"] > 0)
    assert inv["charge_amount"] == 40 * SALE_PRICE
    assert any(ch["desc"] == "Худалдаа" for ch in inv["detail"]["charges"])
    for path in (f"/api/invoices/{inv['id']}/pdf",
                 f"/api/invoices/{inv['id']}/appendix-pdf",
                 f"/api/contracts/{cid}/act-pdf"):
        r = client.get(path, headers=h)
        assert r.status_code == 200, path
        assert r.content[:4] == b"%PDF", path


def test_client_ledger_names_the_sale(client, as_role):
    """Харилцагчийн он цагийн хэлхээ шинэ төрлийг НЭРЛЭНЭ (KeyError биш)."""
    h = as_role("otgoo")
    clid, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    assert _sell(client, h, cid, m, st, 40).status_code == 200
    tl = client.get(f"/api/clients/{clid}", headers=h).json()["timeline"]
    row = next(t for t in tl if t["kind"] == "sale")
    assert row["title"].startswith("Худалдаа")
    assert f"{40 * SALE_PRICE:,.0f}₮" in row["sub"]

"""Нэхэмжлэл ДАХИН БОДОХ (rebuild) — хөдөлгөөн/огноо засварын дараа мөнгө дагана.

Зарчим (Отгоогийн Numbers дэвтрийн зан төлөв):
- Нэхэмжлэлийн дугаар нь ЦИКЛЭЭС гарна (байрлалаас биш) — дахин бодоход тогтвортой.
- Дахин бодолт: гаргаж болох (derivable) нэхэмжлэлүүдийг устгаж дахин үүсгэнэ,
  дараа нь харилцагчийн БҮХ төлбөрийг огноогоор нь replay хийнэ.
- Хуучин системээс шилжсэн (OB-) нэхэмжлэлд ХЭЗЭЭ Ч хүрэхгүй — тэр нь гараар хийгдсэн.
"""
import os
import sys
import tempfile
import threading
import time
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

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


# ---------- дугаарлалт циклээс гарна ----------

def test_deterministic_cycle_numbering(db):
    """Эхний цикл ХООСОН (бараа хоёрдугаар циклд гарсан) бол эхний нэхэмжлэл
    "-1" биш, "-2" дугаартай байна — дугаар нь байрлалаас БИШ циклээс гарна.

    Гэрээ 3.20-нд эхэлсэн, 30 хоногийн цикл. Бараа 4.25-нд гарсан:
      цикл 1 [3.20, 4.19) — хоосон, нэхэмжлэлгүй
      цикл 2 [4.19, 5.19) — эхний нэхэмжлэл → R-24/03-2
    """
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 4, 25), [dict(material_id=m.id, grade_id=ga.id, qty=100)])

    created = billing.ensure_invoices(db, c, date(2026, 6, 25))

    assert [i.no for i in created] == ["R-24/03-2", "R-24/03-3"]
    assert created[0].cycle_start == date(2026, 4, 19)
    assert created[0].cycle_end == date(2026, 5, 19)


# ---------- туслахууд ----------

def _two_cycles(db, qty=100):
    """3.20-нд qty ширхэг гарсан гэрээ; 5.25 гэхэд 2 нэхэмжлэл (тус бүр 990,000₮)."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=qty)])
    billing.ensure_invoices(db, c, date(2026, 5, 25))
    db.refresh(c)
    return c, m, ga, gb


def _snapshot(db, c):
    """Гэрээний бүх мөнгөн байдал — дахин бодолтын өмнө/дараа зэрэгцүүлэхэд."""
    db.expire_all()
    invs = sorted(c.invoices, key=lambda i: (i.cycle_start, i.no))
    return {
        "cycles": [(i.cycle_start, i.cycle_end) for i in invs],
        "nos": [i.no for i in invs],
        "totals": [round(i.total, 4) for i in invs],
        "paid": [round(i.paid, 4) for i in invs],
        "penalty_booked": [round(i.penalty_booked or 0, 4) for i in invs],
        "penalty_paid": [round(i.penalty_paid or 0, 4) for i in invs],
        "alloc_sum": round(sum(a.amount for a in db.query(models.PaymentAllocation).all()), 4),
        "alloc_parts": sorted((a.part, round(a.amount, 4))
                              for a in db.query(models.PaymentAllocation).all()),
    }


# ---------- ТУЛГУУР: юу ч засаагүй дахин бодолт нь ӨӨРЧЛӨЛТГҮЙ ----------

def test_rebuild_noop_is_identity(db):
    """Юу ч засалгүй дахин бодоход БҮХ ЗҮЙЛ ЯГ ХЭВЭЭР үлдэнэ.

    2 нэхэмжлэл (тус бүр 990,000₮) · 5.29-нд алданги бүртгэгдэж (198,000 + 49,500)
    1,490,000₮ төлөгдсөн. Дахин бодоход цикл, дүн, төлөлт, бүртгэгдсэн алданги,
    хуваарилалтын нийлбэр ялгаагүй байх ёстой — эс бөгөөс дахин бодолт нь
    МӨНГӨ ҮҮСГЭДЭГ/УСТГАДАГ гэсэн үг.
    """
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    pay_day = date(2026, 5, 29)
    inv1 = sorted(c.invoices, key=lambda i: i.due_date)[0]
    billing.book_penalties(db, c.client_id, pay_day)
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=pay_day,
                       amount=inv1.total + 500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)

    before = _snapshot(db, c)
    assert before["totals"] == [990_000, 990_000]
    assert before["penalty_booked"] == [198_000, 49_500]
    assert before["alloc_sum"] == 1_490_000

    res = rebuild.rebuild_contract_invoices(db, c, date(2026, 6, 1))

    assert _snapshot(db, c) == before
    assert res["created"] == 2 and res["deleted"] == 2
    assert res["warnings"] == []
    assert all(d["old_total"] == d["new_total"] and d["paid_delta"] == 0 for d in res["diffs"])


# ---------- OB (хуучин үлдэгдэл) — халдашгүй ----------

def test_rebuild_never_touches_ob(db):
    """Хуучин системээс шилжсэн OB нэхэмжлэл нь ГАРААР хийгдсэн, өгөгдлөөс
    гаргаж БОЛОХГҮЙ. Тухайн харилцагчийн жинхэнэ гэрээг дахин бодоход OB
    нэхэмжлэл ба түүнд хуваарилагдсан төлбөр ЯГ ХЭВЭЭР үлдэнэ; OB гэрээг
    өөрийг нь дахин бодохыг оролдвол шууд таслана."""
    from app.services import migration as M
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    ob = M.create_opening_balance(db, c.client, 500_000, date(2026, 3, 20))
    assert ob.no == f"OB-{c.client_id}"
    # харилцагчийн түвшинд (гэрээгүй) төлбөр — хамгийн хуучин нь OB тул тэнд очно
    p = models.Payment(client_id=c.client_id, date=date(2026, 3, 25),
                       amount=500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(ob)
    assert ob.paid == pytest.approx(500_000)
    ob_before = (ob.id, ob.no, ob.total, ob.paid, ob.cycle_start, ob.due_date,
                 ob.penalty_booked or 0)
    # Бүсэлхий + тэвш: гараар нэмсэн OB мөр ЖИНХЭНЭ гэрээн дээр, бүр гаргаж
    # болох циклийн ЯГ тэр огноотой сууж байсан ч хөндөгдөх ёсгүй.
    hand = models.Invoice(contract_id=c.id, no=f"OB-{c.client_id}",
                          cycle_start=date(2026, 3, 20), cycle_end=date(2026, 4, 19),
                          due_date=date(2026, 4, 19), rent_amount=7_000, total=7_000,
                          detail_json="{}")
    db.add(hand)
    db.commit()
    hand_id = hand.id

    rebuild.rebuild_contract_invoices(db, c, date(2026, 6, 1))

    db.expire_all()
    ob2 = db.get(models.Invoice, ob_before[0])
    assert (ob2.id, ob2.no, ob2.total, ob2.paid, ob2.cycle_start, ob2.due_date,
            ob2.penalty_booked or 0) == ob_before
    assert db.query(models.PaymentAllocation).filter_by(invoice_id=ob2.id).count() == 1
    hand2 = db.get(models.Invoice, hand_id)
    assert hand2 is not None and hand2.total == 7_000

    ob_contract = db.query(models.Contract).filter_by(no=f"OB-{c.client_id}").first()
    with pytest.raises(ValueError):
        rebuild.rebuild_contract_invoices(db, ob_contract, date(2026, 6, 1))


# ---------- гэрээний эхлэл өөрчлөгдөхөд мөнгө дагана ----------

def test_rebuild_after_start_date_change(db):
    """Гэрээ 3.20 биш 3.15-нд эхэлсэн байсныг олж мэдэв.

    Шинэ цикл [3.15, 4.14): бараа 3.20-нд гарсан тул 25 хоног л тоологдоно →
    100 × 330 × 25 = 825,000₮ (990,000 биш). Дугаар циклээс дахин гарна,
    төлбөр дахин хуваарилагдана, МӨНГӨ АЛДАГДАХГҮЙ.
    """
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 5, 20),
                       amount=990_000, method="BANK")
    db.add(p)
    db.commit()
    billing.book_penalties(db, c.client_id, p.date)
    billing.allocate_payment(db, p)

    c.start_date = date(2026, 3, 15)
    db.commit()
    res = rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))

    db.expire_all()
    invs = sorted(c.invoices, key=lambda i: i.cycle_start)
    assert [(i.cycle_start, i.cycle_end) for i in invs] == [
        (date(2026, 3, 15), date(2026, 4, 14)), (date(2026, 4, 14), date(2026, 5, 14))]
    assert [i.no for i in invs] == ["R-24/03-1", "R-24/03-2"]
    assert invs[0].total == pytest.approx(100 * 330 * 25)
    assert invs[0].total == pytest.approx(825_000)
    assert invs[1].total == pytest.approx(990_000)
    # мөнгө хадгалагдана: төлсөн 990,000₮ бүхэлдээ хуваарилагдсан хэвээр
    assert sum(a.amount for a in db.query(models.PaymentAllocation).all()) == pytest.approx(990_000)
    assert invs[0].paid == pytest.approx(825_000)
    assert res["deleted"] == 2 and res["created"] == 2
    got = {(d["cycle_start"], d["old_total"], d["new_total"]) for d in res["diffs"]}
    assert ("2026-03-15", 0.0, 825_000.0) in got        # шинээр төрсөн цикл
    assert ("2026-03-20", 990_000.0, 0.0) in got        # алга болсон цикл


# ---------- гараар чиглүүлсэн хуваарилалт циклээрээ таарна ----------

def test_rebuild_preserves_manual_allocations_by_cycle_key(db):
    """Дарга "энэ 500,000₮ нь ХОЁРДУГААР циклийнх" гэж гараар заасан бол
    эхний циклийн тоо засагдаж дахин бодогдсон ч тэр мөнгө ХОЁРДУГААР циклдээ
    үлдэнэ. Харин тэр цикл өөрөө алга болбол — анхааруулга + автомат хуваарилалт."""
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    inv2 = sorted(c.invoices, key=lambda i: i.due_date)[1]
    key2 = (inv2.cycle_start, inv2.cycle_end)
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 5, 25),
                       amount=500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p, manual=[{"invoice_id": inv2.id, "amount": 500_000}])
    db.refresh(inv2)
    assert inv2.paid == pytest.approx(500_000)

    # 1) эхний циклийн тоо засагдав (100 → 80) — гараар заасан мөнгө хэвээр
    issue = c.movements[0]
    issue.lines[0].qty = 80
    db.commit()
    res = rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))
    db.expire_all()
    assert res["warnings"] == []
    new2 = next(i for i in c.invoices if (i.cycle_start, i.cycle_end) == key2)
    assert new2.total == pytest.approx(80 * 330 * 30)
    assert new2.paid == pytest.approx(500_000)
    rows = db.query(models.PaymentAllocation).all()
    assert [(r.invoice_id, r.manual) for r in rows] == [(new2.id, 1)]

    # 2) бүх бараа 4.19-нд буцав → ХОЁРДУГААР цикл ер нь үүсэхээ болино
    mv(db, c, "RETURN", date(2026, 4, 19), [dict(material_id=m.id, grade_id=ga.id, qty=80)])
    res2 = rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))

    db.expire_all()
    assert len(c.invoices) == 1
    assert res2["warnings"] and "алга болсон" in res2["warnings"][0]
    inv1 = c.invoices[0]
    assert inv1.paid == pytest.approx(500_000)
    rows2 = db.query(models.PaymentAllocation).all()
    assert [(r.invoice_id, r.manual) for r in rows2] == [(inv1.id, 0)]


# ---------- урьдчилан харах — мөр ч үлдээхгүй ----------

def test_preview_leaves_no_trace(db):
    """Урьдчилан харах нь ЗӨВХӨН харуулна: дуудсаны дараа DB-ийн байдал
    (нэхэмжлэлийн тоо, дүн, төлөлт, хуваарилалт) ЯГ хэвээр байх ёстой."""
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 5, 20),
                       amount=990_000, method="BANK")
    db.add(p)
    db.commit()
    billing.book_penalties(db, c.client_id, p.date)
    billing.allocate_payment(db, p)
    before = _snapshot(db, c)
    n_inv = db.query(models.Invoice).count()

    def mutate():
        c.start_date = date(2026, 3, 15)

    res = rebuild.preview_rebuild(db, c, date(2026, 5, 25), mutate)

    assert any(d["new_total"] == 825_000.0 for d in res["diffs"])
    db.expire_all()
    assert c.start_date == date(2026, 3, 20)          # засвар ХАДГАЛАГДААГҮЙ
    assert db.query(models.Invoice).count() == n_inv
    assert _snapshot(db, c) == before


# ---------- АЛДАНГИЙН ИЛ НЭХЭЛТ replay-д амьд үлдэнэ ----------
#
# Алданги одоо ӨӨРӨӨ номжихоо больж, зөвхөн Отгоогийн ил шийдвэрээр нэхэгдэнэ
# (Чадварын харьцуулалт H2 / R25). Гэтэл дахин бодолт нэхэмжлэлүүдийг УСТГАЖ
# шинээр төрүүлдэг — шинэ нэхэмжлэл 0 алдангитай төрнө. Тиймээс нэхэлт бүр
# `PenaltyCharge` явдал болж үлдэж, replay нь ХӨЛДСӨН ДҮНГ нь биш ОГНООГ нь
# дахин нэхнэ: тоо ширхэг засагдвал алданги нь ч засагдана («мөнгө дагана»).

def _charge(db, c, as_of):
    """«Алданги нэхэх» товчны сервер тал — явдал үлдээж нэхнэ."""
    db.refresh(c)
    return billing.charge_contract_penalty(db, c, as_of, user_name="Отгоо")


def test_explicit_charge_survives_rebuild(db):
    """5.29-нд нэхсэн алданги дахин бодолтын дараа ЯГ ХЭВЭЭР эргэж ирнэ.

    Явдал байхгүй бол шинэ нэхэмжлэл 0 алдангитай төрж, Отгоогийн нэхсэн
    198,000₮ + 49,500₮ ЧИМЭЭГҮЙ УСТАХ байсан.
    """
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    res = _charge(db, c, date(2026, 5, 29))
    assert res["total"] == pytest.approx(247_500)
    assert [(r["days"], r["amount"]) for r in res["rows"]] == [(40, 198_000), (10, 49_500)]

    before = _snapshot(db, c)
    assert before["penalty_booked"] == [198_000, 49_500]

    rebuild.rebuild_contract_invoices(db, c, date(2026, 6, 1))

    assert _snapshot(db, c) == before, "нэхэлт replay-д алдагдав"


def test_charge_and_payment_interleave_in_date_order(db):
    """ХӨДӨЛГӨӨН ЗАСАГДАХАД алданги нь ч дагаж засагдана — гэхдээ ДАРААЛАЛ хэвээр.

    Чадварын харьцуулалтын сценар: нэхэмжлэл хэтэрсэн → 10 дахь хоногт алданги
    НЭХЭВ → 15 дахь хоногт төлбөр ирж түүнийг хэсэгчлэн хаав → дараа нь тоо
    ширхэг засагдав → дахин бодолт.

    Хугацааны шугам (гэрээ 3.20, нэхэмжлэл 1 нь 4.19-нд хэтэрсэн):
      4.29 — АЛДАНГИ НЭХЭВ: 990,000 × 0.5% × 10 = 49,500₮
      5.04 — 1,000,000₮ ирэв: 990,000₮ үндсэн + 10,000₮ НЭХЭГДСЭН алданги
      → тоо 100 → 80 болж засагдав → дахин бодолт.

    Дахин бодолтын дараа: нэхэмжлэл 792,000₮ (80×330×30), алданги 4.29-нд
    ДАХИН нэхэгдэж 792,000 × 0.5% × 10 = 39,600₮ болно (198,000₮ гэсэн хуучин
    тоо биш — тоо ширхэг буурсан бол алданги нь ч буурах ёстой).
    """
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    inv1 = sorted(c.invoices, key=lambda i: i.due_date)[0]
    assert inv1.due_date == date(2026, 4, 19) and inv1.total == pytest.approx(990_000)

    _charge(db, c, date(2026, 4, 29))
    db.refresh(inv1)
    assert inv1.penalty_booked == pytest.approx(49_500)

    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 5, 4),
                       amount=1_000_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(inv1)
    assert inv1.paid == pytest.approx(990_000)
    assert inv1.penalty_paid == pytest.approx(10_000), "нэхэгдсэн алданги хэсэгчлэн төлөгдөв"

    # ---- тоо ширхэг засагдав → дахин бодолт
    c.movements[0].lines[0].qty = 80
    db.commit()
    rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))

    db.expire_all()
    invs = sorted(c.invoices, key=lambda i: i.cycle_start)
    assert invs[0].total == pytest.approx(792_000)
    # 4.29-ний нэхэлт ДАХИН бодогдов — засагдсан үндсэн дүнгээр
    assert invs[0].penalty_booked == pytest.approx(792_000 * 0.005 * 10)
    assert invs[0].penalty_booked == pytest.approx(39_600)
    assert invs[0].penalty_booked_until == date(2026, 4, 29)
    # 5.04-ний төлбөр НЭХЭЛТИЙН ДАРАА орсон хэвээр: үндсэн 792,000 бүрэн хаагдаж,
    # үлдсэн 208,000₮-ийн 39,600₮ нь алданги руу, 168,400₮ нь дараагийн цикл рүү
    assert invs[0].paid == pytest.approx(792_000)
    assert invs[0].penalty_paid == pytest.approx(39_600)
    assert invs[1].paid == pytest.approx(1_000_000 - 792_000 - 39_600)
    assert sum(a.amount for a in db.query(models.PaymentAllocation).all()) \
        == pytest.approx(1_000_000), "мөнгө алдагдсангүй"


def test_rebuild_is_deterministic_across_repeats(db):
    """Дахин бодолтыг ХОЁР УДАА гүйлгэхэд ЯГ ижил төлөв гарна.

    Нэхэлт + төлбөр холилдсон хугацааны шугам дээр давталт бүр өөр хариу өгвөл
    Отгоо хоёр өөр тоо хараад аль нь ч итгэл хүлээхээ болино.
    """
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    _charge(db, c, date(2026, 4, 29))
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 5, 4),
                       amount=1_000_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    _charge(db, c, date(2026, 5, 20))

    rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))
    once = _snapshot(db, c)
    rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))
    assert _snapshot(db, c) == once


def test_rebuild_without_charges_leaves_penalty_at_zero(db):
    """НЭХЭЭГҮЙ бол дахин бодолт өөрөө алданги ЗОХИОХГҮЙ.

    Хуучин replay төлбөрийн огноо бүрээр номжиж байсан — засвар хийхэд
    Отгоогийн хэзээ ч нэхээгүй алданги гэнэт төрдөг байв.
    """
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 5, 20),
                       amount=500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)

    rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))

    db.expire_all()
    assert [i.penalty_booked or 0 for i in c.invoices] == [0, 0]
    assert db.query(models.PenaltyCharge).count() == 0


def test_charge_replay_only_touches_own_contract(db):
    """Нэг гэрээ дахин бодоход ӨӨР гэрээний алданги ХӨДЛӨХГҮЙ.

    Хуучин replay нь харилцагчийн БҮХ нэхэмжлэлийг төлбөрийн огноо бүрээр
    номжиж, хажуугийн гэрээний `penalty_booked_until`-ыг чимээгүй урагшлуулдаг
    байв — тэр гэрээг хэзээ ч нэхээгүй байсан ч.
    """
    from app.services import rebuild

    c, m, ga, gb = _two_cycles(db)
    other = models.Contract(no="24/09", client_id=c.client_id, type="rent",
                            start_date=date(2026, 3, 20), cycle_days=30, penalty_percent=0.5)
    db.add(other)
    db.flush()
    db.add(models.ContractItem(contract_id=other.id, material_id=m.id, grade_id=ga.id,
                               daily_rate=330))
    db.commit()
    mv(db, other, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=10)])
    billing.ensure_invoices(db, other, date(2026, 5, 25))
    db.commit()

    _charge(db, c, date(2026, 4, 29))
    rebuild.rebuild_contract_invoices(db, c, date(2026, 5, 25))

    db.expire_all()
    assert all((i.penalty_booked or 0) == 0 and i.penalty_booked_until is None
               for i in other.invoices), "хөрш гэрээний алданги хөндөгдөв"


# ---------- ДАВХАРДСАН НЭХЭМЖЛЭЛ: rebuild ↔ ensure_invoices ----------

@pytest.fixture()
def session_factory():
    """ФАЙЛ дээрх SQLite — ХОЁР холболт нэг датаг харна.

    `sqlite://` (санах ой) нь холболт бүрд ӨӨР DB өгдөг тул зэрэгцээ
    урсгалын тест тэнд утгагүй болно.
    """
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine("sqlite:///" + path, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()
    try:
        os.unlink(path)
    except OSError:
        pass


def test_rebuild_never_duplicates_an_invoice_under_a_concurrent_read(session_factory):
    """ДАХИН БОДОЛТЫН ЦОНХОНД буусан GET нэхэмжлэлийг ДАВХАРДУУЛАХГҮЙ.

    ЖИНХЭНЭ УНАЛТ (E2E, 2026-09): «нэхсэн алдангийг хүчингүй болгоход…» тест
    гэрээ дээр 198,000₮ гэж амлаад 396,000₮ үлдээв. Дэлгэцний зурган дээр ЯГ
    ИЖИЛ дугаартай (`№R-…-2`), ижил циклтэй, тус бүр 99,000₮-ийн ХОЁР мөр
    зогсож байв.

    МЕХАНИЗМ: `rebuild_contract_invoices` нь нэхэмжлэлүүдийг УСТГААД
    `commit()` хийж, дараа нь шинээр үүсгээд `commit()` хийдэг. Тэр хоёрын
    ХООРОНД гэрээ нь DB дээр нэхэмжлэлГҮЙ харагдана. FastAPI-ийн sync
    endpoint-ууд threadpool дээр ЗЭРЭГ гүйдэг тул тэр агшинд өөр урсгалын
    ямар ч GET (`/api/contracts/:id`, `/api/clients`, дашбоард…)
    `ensure_invoices`-оо дуудаж, «цикл алга» гэж уншаад ДАХИН үүсгэдэг байв —
    дараа нь rebuild өөрөө бас үүсгэнэ.

    Түгжээ нь `ensure_invoices` дээр БАЙСАН ч `rebuild` тэрийг БАРЬДАГГҮЙ
    байсан тул хамгаалалт нээлттэй байв. Энэ тест тэр цонхыг ГАРААР олж,
    яг тэнд зэрэгцээ уншилт оруулна.
    """
    from app.services import rebuild

    main = session_factory()
    c, m, g_a, _ = setup_contract(main, start=date(2026, 3, 20))
    mv(main, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=g_a.id, qty=10)])
    today = date(2026, 6, 1)
    billing.ensure_invoices(main, c, today)
    assert main.query(models.Invoice).filter_by(contract_id=c.id).count() >= 2, \
        "тест нэхэмжлэлгүй гэрээ дээр гүйж байна — давхардах юм алга"

    contract_id = c.id
    reached = threading.Event()

    def concurrent_get():
        """Дэлгэц нээхтэй ЯГ ижил зам — өөрийн session, өөрийн холболт."""
        other = session_factory()
        try:
            oc = other.get(models.Contract, contract_id)
            reached.set()
            billing.ensure_invoices(other, oc, today)
        finally:
            other.close()

    # `expire_all()` нь УСТГАСНЫ дараах `commit()`-ийн ЯГ дараа дуудагдана —
    # өөрөө тэр аюултай цонх. Зөвхөн ЭНЭ session дээр дэгээ тавина.
    threads: list[threading.Thread] = []
    real_expire = main.expire_all

    def hooked_expire():
        real_expire()
        if threads:
            return
        t = threading.Thread(target=concurrent_get, daemon=True)
        threads.append(t)
        t.start()
        reached.wait(5)
        # Түгжээгүй бол энэ хугацаанд давхардуулж амжина; түгжээтэй бол
        # тэр урсгал `ensure_invoices`-ийн үүдэнд ЗОГСОНО.
        time.sleep(0.25)

    main.expire_all = hooked_expire
    try:
        rebuild.rebuild_contract_invoices(main, c, today)
    finally:
        main.expire_all = real_expire
    for t in threads:
        t.join(10)

    main.expire_all()
    rows = (main.query(models.Invoice.no, models.Invoice.cycle_start,
                       models.Invoice.cycle_end)
            .filter(models.Invoice.contract_id == contract_id).all())
    assert len(rows) == len(set(rows)), (
        "нэхэмжлэл ДАВХАРДЛАА — тэр циклийн авлага хоёр дахин нэмэгдэнэ: "
        f"{sorted(str(r) for r in rows)}")

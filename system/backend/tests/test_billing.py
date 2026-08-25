"""Billing engine — бодит файлын тоон дээр шалгана (Блүүмийн кейс)."""
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"  # in-memory

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app import models
from app.services import billing


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def setup_contract(db, start=date(2026, 3, 20), cycle=30, penalty=0.5, ctype="rent"):
    g_a = models.Grade(code="A", name="А", sort=1)
    g_b = models.Grade(code="B", name="В", sort=2)
    m = models.Material(name="Хэв хашмал 6012", category="Хэв", base_rate=330, repair_fee=15000)
    cl = models.Client(name="БЛҮҮМ технологи")
    db.add_all([g_a, g_b, m, cl])
    db.flush()
    db.add(models.Stock(material_id=m.id, grade_id=g_a.id, on_hand=5000))
    c = models.Contract(no="24/03", client_id=cl.id, type=ctype, start_date=start,
                        cycle_days=cycle, penalty_percent=penalty)
    db.add(c)
    db.flush()
    db.add(models.ContractItem(contract_id=c.id, material_id=m.id, grade_id=g_a.id,
                               daily_rate=330, unit_price=58000))
    db.commit()
    return c, m, g_a, g_b


def mv(db, c, mtype, d, lines, status="done"):
    m = models.Movement(contract_id=c.id, type=mtype, date=d, status=status)
    db.add(m)
    db.flush()
    for ln in lines:
        db.add(models.MovementLine(movement_id=m.id, **ln))
    db.commit()
    db.refresh(c)
    return m


def test_proration_return_next_day(db):
    """Блүүмийн бодит кейс: 3.20-нд 2131ш гарч, 3.21-нд 306ш буцав.
    306ш яг 1 хоногоор (306×330=100,980₮) тооцогдоно."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=2131)])
    mv(db, c, "RETURN", date(2026, 3, 21), [dict(material_id=m.id, grade_id=ga.id, qty=306,
                                                 return_grade_id=gb.id)])
    total, lines = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))
    # 306ш × 330 × 1 хоног + 1825ш × 330 × 30 хоног
    assert total == pytest.approx(306 * 330 * 1 + 1825 * 330 * 30)
    assert total == pytest.approx(100_980 + 18_067_500)


def test_cycle_invoices_autogenerate(db):
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    today = date(2026, 5, 25)  # 66 хоног — 2 бүтэн цикл
    created = billing.ensure_invoices(db, c, today)
    assert len(created) == 2
    assert created[0].cycle_start == date(2026, 3, 20)
    assert created[0].cycle_end == date(2026, 4, 19)
    assert created[0].total == pytest.approx(100 * 330 * 30)
    assert created[1].cycle_start == date(2026, 4, 19)
    # давхар дуудахад дахин үүсгэхгүй
    db.refresh(c)
    assert billing.ensure_invoices(db, c, today) == []
    # одоогийн циклийн амьд хуримтлал
    cur = billing.current_cycle_accrual(c, today)
    assert cur["days_done"] == (today - date(2026, 5, 19)).days + 1
    assert cur["day_amount"] == pytest.approx(100 * 330)


def test_penalty(db):
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    today = date(2026, 4, 29)  # эхний цикл 4.19-нд дууссан, 10 хоног хэтэрсэн
    billing.ensure_invoices(db, c, today)
    db.refresh(c)
    inv = c.invoices[0]
    pen = billing.invoice_penalty(inv, today)
    assert pen == pytest.approx(inv.total * 0.005 * 10)
    assert billing.invoice_status(inv, today) == "overdue"


def test_repair_writeoff_charges_and_stock(db):
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    st = db.query(models.Stock).filter_by(material_id=m.id, grade_id=ga.id).first()
    mv_issue = c.movements[0]
    billing.apply_movement_stock(db, mv_issue)
    db.refresh(st)
    assert st.on_hand == 4900 and st.on_rent == 100
    # 40ш буцаж ирэв: 25 нь В болов, 10 засварт (фикс 15,000₮/ш), 5 актлав (НБҮнэ 45,000₮/ш)
    r = mv(db, c, "RETURN", date(2026, 4, 1), [dict(material_id=m.id, grade_id=ga.id, qty=40,
        return_grade_id=gb.id, repair_qty=10, repair_fee=10 * 15000,
        writeoff_qty=5, writeoff_fee=5 * 45000)])
    billing.apply_movement_stock(db, r)
    db.refresh(st)
    stb = db.query(models.Stock).filter_by(material_id=m.id, grade_id=gb.id).first()
    assert st.on_rent == 60
    assert stb.on_hand == 25 and stb.in_repair == 10 and stb.written_off == 5
    # засвар + актын дүн эхний циклийн нэхэмжлэлд орно
    billing.ensure_invoices(db, c, date(2026, 4, 25))
    db.refresh(c)
    inv = c.invoices[0]
    assert inv.charge_amount == pytest.approx(150000 + 225000)


def test_payment_allocation_oldest_first(db):
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    billing.ensure_invoices(db, c, date(2026, 6, 25))  # 3 цикл
    db.refresh(c)
    invs = sorted(c.invoices, key=lambda i: i.due_date)
    assert len(invs) == 3
    one = invs[0].total
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 6, 26),
                       amount=one + 500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(invs[0]); db.refresh(invs[1])
    assert invs[0].status == "paid"
    assert invs[1].paid == pytest.approx(500_000)
    assert billing.invoice_status(invs[1], date(2026, 6, 26)) == "overdue"  # хугацаа нь хэтэрсэн хэвээр


def test_prepaid_credit_auto_applied_to_new_invoice(db):
    """Урьдчилж төлсөн (хуваарилагдаагүй) мөнгө ДАРААГИЙН нэхэмжлэл үүсэхэд
    автоматаар хаагдана. Бодит хэрэглээ: клиент циклээс өмнө шилжүүлчихдэг."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    # 1-р цикл дуусав, нэхэмжлэл үүсэв
    billing.ensure_invoices(db, c, date(2026, 4, 25))
    db.refresh(c)
    inv1 = c.invoices[0]
    # Клиент 1-р нэхэмжлэл + 500,000₮ ИЛҮҮ төлөв → 500,000 нь кредит болно
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 4, 26),
                       amount=inv1.total + 500_000, method="BANK")
    db.add(p)
    db.commit()
    allocated = billing.allocate_payment(db, p)
    assert allocated == pytest.approx(inv1.total)          # кредит 500,000 үлдэв
    # 2-р цикл дуусаж шинэ нэхэмжлэл үүсэхэд кредит АВТОМАТААР хаагдах ёстой
    billing.ensure_invoices(db, c, date(2026, 5, 25))
    db.refresh(c)
    inv2 = sorted(c.invoices, key=lambda i: i.due_date)[1]
    assert inv2.paid == pytest.approx(500_000), \
        "Кредит шинэ нэхэмжлэлд автоматаар хуваарилагдаагүй байна"


def test_sale_invoice_from_issue(db):
    c, m, ga, gb = setup_contract(db, ctype="sale")
    mv(db, c, "ISSUE", date(2026, 6, 29), [dict(material_id=m.id, grade_id=ga.id, qty=1200)])
    created = billing.ensure_invoices(db, c, date(2026, 6, 30))
    assert len(created) == 1
    assert created[0].total == pytest.approx(1200 * 58000)


# ---------- Падан (lot) загвар — олголт бүр өөрийн тарифаа мөнхөд хадгална ----------

def test_lot_rates_bill_independently(db):
    """Отгоогийн Numbers дэвтрийн дүрэм: 3.20-нд 100ш 330₮-өөр, 4.1-нд 50ш 300₮-өөр
    гарвал ЭХНИЙ падан 330-аараа, ХОЁРДАХЬ падан 300-аараа тусад нь бодогдоно."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    mv(db, c, "ISSUE", date(2026, 4, 1),
       [dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)])

    total, lines = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))

    # 100ш × 330 × 30 хоног + 50ш × 300 × 18 хоног
    assert total == pytest.approx(100 * 330 * 30 + 50 * 300 * 18)
    assert total == pytest.approx(990_000 + 270_000)
    assert total == pytest.approx(1_260_000)
    # нэг материал+зэрэглэл ХОЁР мөр болж задарна — тариф бүрээр
    assert len(lines) == 2
    assert {ln["rate"] for ln in lines} == {330, 300}
    assert all(ln["material_id"] == m.id and ln["grade_id"] == ga.id for ln in lines)
    by_rate = {ln["rate"]: ln for ln in lines}
    assert by_rate[330]["qty_days"] == pytest.approx(100 * 30)
    assert by_rate[300]["qty_days"] == pytest.approx(50 * 18)
    assert by_rate[300]["amount"] == pytest.approx(270_000)


def test_return_fifo_consumes_oldest_lot(db):
    """Аль паданг хаасныг заагаагүй буцаалт ХАМГИЙН ХУУЧИН паданг иднэ (FIFO):
    4.5-нд 60ш буцахад 330₮-ийн падангаас хасагдана, 300₮-ийн падан бүрэн үлдэнэ."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    mv(db, c, "ISSUE", date(2026, 4, 1),
       [dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)])
    mv(db, c, "RETURN", date(2026, 4, 5),
       [dict(material_id=m.id, grade_id=ga.id, qty=60, return_grade_id=gb.id)])

    total, lines = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))

    by_rate = {ln["rate"]: ln for ln in lines}
    # хуучин падан: 100ш × 16 хоног (3.20–4.5) + 40ш × 14 хоног (4.5–4.19)
    assert by_rate[330]["qty_days"] == pytest.approx(100 * 16 + 40 * 14)
    assert by_rate[330]["amount"] == pytest.approx(2160 * 330)
    # шинэ падан хөндөгдөөгүй: 50ш × 18 хоног
    assert by_rate[300]["qty_days"] == pytest.approx(50 * 18)
    assert total == pytest.approx(2160 * 330 + 900 * 300)
    assert total == pytest.approx(712_800 + 270_000)


def test_return_pinned_to_lot(db):
    """Дарга 'энэ буцаалт ХОЁРДАХЬ паданг хааж байна' гэж заавал (issue_line_id)
    FIFO-г тойрч ЯГ тэр падангаас хасагдана — хуучин падан бүрэн үлдэнэ."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    second = mv(db, c, "ISSUE", date(2026, 4, 1),
                [dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)])
    mv(db, c, "RETURN", date(2026, 4, 5),
       [dict(material_id=m.id, grade_id=ga.id, qty=40, return_grade_id=gb.id,
             issue_line_id=second.lines[0].id)])

    total, lines = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))

    by_rate = {ln["rate"]: ln for ln in lines}
    # хуучин падан ХӨНДӨГДӨӨГҮЙ: 100ш × 30 хоног
    assert by_rate[330]["qty_days"] == pytest.approx(100 * 30)
    assert by_rate[330]["amount"] == pytest.approx(990_000)
    # заасан падан: 50ш × 4 хоног (4.1–4.5) + 10ш × 14 хоног (4.5–4.19)
    assert by_rate[300]["qty_days"] == pytest.approx(50 * 4 + 10 * 14)
    assert by_rate[300]["amount"] == pytest.approx(340 * 300)
    assert total == pytest.approx(990_000 + 102_000)
    assert total == pytest.approx(1_092_000)


def test_pending_issue_lot_not_billed(db):
    """Дарга баталгаажуулаагүй ачилт ПАДАН БОЛОХГҮЙ — тооцоонд ер нь орохгүй."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    mv(db, c, "ISSUE", date(2026, 4, 1),
       [dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)], status="pending")

    lots = billing._lots(c)
    assert len(lots) == 1
    assert lots[0]["qty"] == 100 and lots[0]["rate"] == 330

    total, lines = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))
    assert len(lines) == 1
    assert total == pytest.approx(100 * 330 * 30)
    assert total == pytest.approx(990_000)


def test_lot_rate_fallback_to_item_default(db):
    """Тариф тамгалагдаагүй (хуучин) мөр гэрээний тарифаараа бодогдоно —
    тамгалагдсан мөр өөрийнхөөрөө. Хоёул нэг өдөр гарсан ч ТУСДАА бодогдоно."""
    c, m, ga, gb = setup_contract(db)          # гэрээний тариф 330
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100),                  # тарифгүй → 330
        dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)])        # өөрийн тариф

    total, lines = billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))

    by_rate = {ln["rate"]: ln for ln in lines}
    assert set(by_rate) == {330, 300}
    assert by_rate[330]["qty_days"] == pytest.approx(100 * 30)
    assert by_rate[300]["qty_days"] == pytest.approx(50 * 30)
    assert total == pytest.approx(100 * 330 * 30 + 50 * 300 * 30)
    assert total == pytest.approx(990_000 + 450_000)
    assert total == pytest.approx(1_440_000)


def test_sale_invoice_uses_line_rate(db):
    """Худалдаанд ч мөн адил: ачилтын мөр өөрийн нэгж үнэтэй бол ТҮҮГЭЭР
    нэхэмжлэгдэнэ (гэрээний 58,000₮ биш, тохирсон 60,000₮-өөр)."""
    c, m, ga, gb = setup_contract(db, ctype="sale")     # гэрээний нэгж үнэ 58,000
    mv(db, c, "ISSUE", date(2026, 6, 29),
       [dict(material_id=m.id, grade_id=ga.id, qty=1200, rate=60000),
        dict(material_id=m.id, grade_id=gb.id, qty=100)])   # үнэгүй мөр → гэрээнийхээр

    created = billing.ensure_invoices(db, c, date(2026, 6, 30))

    assert len(created) == 1
    inv = created[0]
    assert inv.total == pytest.approx(1200 * 60000)     # gb-д гэрээний мөр алга → 0
    assert inv.total == pytest.approx(72_000_000)
    detail = json.loads(inv.detail_json)
    assert detail[0]["rate"] == 60000
    assert detail[0]["amount"] == pytest.approx(72_000_000)


# ---------- Бүртгэгдсэн (booked) алданги ----------

def _overdue_invoice(db, today=date(2026, 4, 29)):
    """3.20-нд 100ш×330₮ гарсан → 4.19-нд дуусах 990,000₮-ийн нэхэмжлэл."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    billing.ensure_invoices(db, c, today)
    db.refresh(c)
    inv = c.invoices[0]
    assert inv.total == pytest.approx(990_000) and inv.due_date == date(2026, 4, 19)
    return c, inv


def test_penalty_booking_crystallizes(db):
    """Алданги БҮРТГЭГДЭХДЭЭ хөлддөг: 4.29-нд бүртгэхэд 990,000×0.005×10 = 49,500₮.
    Дараа нь 500,000₮ төлөөд 5.9-нд дахин бүртгэхэд үлдэгдлээр нь 24,500₮ нэмэгдэж
    НИЙТ 74,000₮ болно — хуучин амьд томьёо бол 490,000×0.005×20 = 49,000₮ болж
    БУУРАХ байсан (хэсэгчилсэн төлөлт өнгөрсний алдангийг УСТГАДАГ байв)."""
    c, inv = _overdue_invoice(db)

    billing.book_penalties(db, c.client_id, date(2026, 4, 29))
    db.refresh(inv)
    assert inv.penalty_booked == pytest.approx(49_500)
    assert inv.penalty_booked_until == date(2026, 4, 29)

    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 4, 29),
                       amount=500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(inv)
    assert billing.invoice_outstanding(inv) == pytest.approx(490_000)

    billing.book_penalties(db, c.client_id, date(2026, 5, 9))
    db.refresh(inv)
    assert inv.penalty_booked == pytest.approx(49_500 + 490_000 * 0.005 * 10)
    assert inv.penalty_booked == pytest.approx(74_000)
    assert billing.invoice_penalty_due(inv) == pytest.approx(74_000)
    assert billing.invoice_penalty(inv, date(2026, 5, 9)) == pytest.approx(74_000)
    # хоёр дахь удаа тэр өдрөөрөө бүртгэхэд ЮУ Ч нэмэгдэхгүй (idempotent)
    billing.book_penalties(db, c.client_id, date(2026, 5, 9))
    db.refresh(inv)
    assert inv.penalty_booked == pytest.approx(74_000)


def test_penalty_display_booked_plus_live(db):
    """Харагдац = БҮРТГЭГДСЭН + бүртгэсэн өдрөөс хойшхи АМЬД алданги.
    4.29-нд 49,500₮ бүртгэгдсэн бол 5.4-нд 49,500 + 990,000×0.005×5 = 74,250₮."""
    c, inv = _overdue_invoice(db)
    billing.book_penalties(db, c.client_id, date(2026, 4, 29))
    db.refresh(inv)
    assert billing.invoice_penalty(inv, date(2026, 5, 4)) == pytest.approx(
        49_500 + 990_000 * 0.005 * 5)
    assert billing.invoice_penalty(inv, date(2026, 5, 4)) == pytest.approx(74_250)


def test_booked_penalty_survives_full_principal_payment(db):
    """Үндсэн төлбөрөө БҮТЭН төлсөн ч бүртгэгдсэн алданги арилахгүй —
    нэхэмжлэл 'penalty' (Алданги үлдсэн) төлөвт орно."""
    c, inv = _overdue_invoice(db)
    billing.book_penalties(db, c.client_id, date(2026, 4, 29))
    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 4, 29),
                       amount=990_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(inv)

    assert billing.invoice_outstanding(inv) == pytest.approx(0)
    assert billing.invoice_penalty_due(inv) == pytest.approx(49_500)
    assert billing.invoice_status(inv, date(2026, 4, 29)) == "penalty"
    assert inv.status == "penalty"
    # үндсэн дүн хаагдсан тул алданги ЦААШ ӨСӨХГҮЙ
    assert billing.invoice_penalty(inv, date(2026, 5, 9)) == pytest.approx(49_500)


def test_allocation_per_invoice_closure(db):
    """Хуваарилалт нэхэмжлэл БҮРИЙГ БҮТНЭЭР хаана: хуучин нэхэмжлэлийн үндсэн дүн →
    ТҮҮНИЙ алданги → дараагийн нэхэмжлэл. 5.29-нд 1-р нэхэмжлэл 40 хоног (198,000₮),
    2-р нь 10 хоног (49,500₮) хэтэрсэн. 990,000 + 198,000 + 30,000 = 1,218,000₮
    төлөхөд 1-р нэхэмжлэл алдангитайгаа бүрэн хаагдаж, 30,000₮ нь 2-р нэхэмжлэлийн
    ҮНДСЭН дүн рүү орно (алданги руу нь ОРОХГҮЙ)."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    billing.ensure_invoices(db, c, date(2026, 5, 25))
    db.refresh(c)
    inv1, inv2 = sorted(c.invoices, key=lambda i: i.due_date)
    assert (inv1.due_date, inv2.due_date) == (date(2026, 4, 19), date(2026, 5, 19))

    billing.book_penalties(db, c.client_id, date(2026, 5, 29))
    db.refresh(inv1); db.refresh(inv2)
    assert inv1.penalty_booked == pytest.approx(198_000)   # 990,000 × 0.005 × 40
    assert inv2.penalty_booked == pytest.approx(49_500)    # 990,000 × 0.005 × 10

    p = models.Payment(client_id=c.client_id, contract_id=c.id, date=date(2026, 5, 29),
                       amount=990_000 + 198_000 + 30_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(inv1); db.refresh(inv2)

    rows = sorted(p.allocations, key=lambda a: a.id)
    assert [(r.invoice_id, r.part) for r in rows] == [
        (inv1.id, "principal"), (inv1.id, "penalty"), (inv2.id, "principal")]
    assert [r.amount for r in rows] == [pytest.approx(990_000), pytest.approx(198_000),
                                        pytest.approx(30_000)]
    assert all(r.manual == 0 for r in rows)
    assert billing.invoice_status(inv1, date(2026, 5, 29)) == "paid"   # алданги нь ч хаагдсан
    assert inv2.paid == pytest.approx(30_000)
    assert inv2.penalty_paid == pytest.approx(0)


def test_ob_contract_books_zero(db):
    """Хуучин системээс шилжсэн үлдэгдэлд (OB, penalty_percent=0) алданги
    БҮРТГЭГДЭХГҮЙ — 500 сая авлага 50 хоног хэвтсэн ч 0 хэвээр."""
    from app.services import migration as M
    cl = models.Client(name="Хуучин харилцагч")
    db.add(cl)
    db.commit()
    inv = M.create_opening_balance(db, cl, 500_000_000, date(2026, 3, 20))

    billing.book_penalties(db, cl.id, date(2026, 5, 9))
    db.refresh(inv)

    assert inv.penalty_booked == pytest.approx(0)
    assert inv.penalty_booked_until is None
    assert billing.invoice_penalty(inv, date(2026, 5, 9)) == pytest.approx(0)

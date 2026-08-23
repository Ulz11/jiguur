"""Billing engine — бодит файлын тоон дээр шалгана (Блүүмийн кейс)."""
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

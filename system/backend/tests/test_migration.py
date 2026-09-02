"""Бодит дата шилжүүлэлт — TDD.

Зарчим:
- Хуучин авлага = "Үлдэгдэл шилжүүлэлт" гэрээн дээрх нэг нэхэмжлэл (due = шилжүүлсэн огноо,
  тиймээс өнгөрсний алданги дахин бодогдохгүй, одооноос хойш л бодогдоно).
- Сөрөг үлдэгдэл (илүү төлсөн) = хуваарилагдаагүй кредит төлбөр болно.
- Loader idempotent: хоёр удаа ажиллуулахад давхардуулахгүй.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app import models


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def test_opening_balance_invoice(db):
    from app.services import migration as M
    from app.services import billing

    cl = models.Client(name="Хуучин Харилцагч")
    db.add(cl)
    db.commit()
    as_of = date(2026, 8, 23)
    inv = M.create_opening_balance(db, cl, 111_658_360, as_of, deposit=5_000_000)
    assert inv.total == 111_658_360
    assert inv.due_date == as_of                       # өнгөрсний алданги дахин бодогдохгүй
    assert billing.invoice_penalty(inv, as_of) == 0
    db.refresh(cl)
    row_balance = sum(billing.invoice_outstanding(i) for c in cl.contracts for i in c.invoices)
    assert row_balance == 111_658_360
    assert cl.contracts[0].deposit == 5_000_000
    # төлбөр хийвэл яг энэ нэхэмжлэлд хуваарилагдана
    p = models.Payment(client_id=cl.id, date=as_of, amount=11_658_360, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(inv)
    assert inv.paid == 11_658_360


def test_opening_negative_balance_becomes_credit(db):
    from app.services import migration as M

    cl = models.Client(name="Илүү Төлөгч")
    db.add(cl)
    db.commit()
    M.create_opening_balance(db, cl, -4_820_388, date(2026, 8, 23))
    pays = db.query(models.Payment).filter_by(client_id=cl.id).all()
    assert len(pays) == 1
    assert pays[0].amount == 4_820_388
    assert db.query(models.Invoice).count() == 0


def test_active_contract_transfer(db):
    """Идэвхтэй гэрээ шилжүүлэхэд: бараа нь АЛЬ ХЭДИЙН түрээсэнд байгаа тул
    агуулахын үлдэгдлээс хасахгүй, on_rent-д шууд нэмэгдэнэ; тооцоо шилжсэн
    өдрөөс цааш автоматаар явна."""
    from app.services import migration as M
    from app.services import billing
    from app.seed import seed_base

    seed_base(db)
    cl = models.Client(name="Грэйт Майнинг")
    db.add(cl)
    db.commit()
    as_of = date(2026, 8, 24)
    c = M.create_active_contract(db, cl, "25/04", as_of, items=[
        {"material": "Хэв хашмал 6012", "grade": "А", "qty": 200, "daily_rate": 330},
        {"material": "Тулаас В2", "grade": "А", "qty": 4500, "daily_rate": 110},
    ])
    m6012 = db.query(models.Material).filter_by(name="Хэв хашмал 6012").first()
    gA = db.query(models.Grade).filter_by(code="А").first()
    st = db.query(models.Stock).filter_by(material_id=m6012.id, grade_id=gA.id).first()
    assert (st.on_hand or 0) == 0          # агуулах ХӨНДӨГДӨӨГҮЙ (seed_base нөөцгүй)
    assert st.on_rent == 200               # түрээсэнд гэж бүртгэгдсэн
    db.refresh(c)
    assert billing.qty_on(c, m6012.id, gA.id, as_of) == 200
    cur = billing.current_cycle_accrual(c, as_of)
    assert cur["day_amount"] == 200 * 330 + 4500 * 110   # 561,000₮/өдөр
    # idempotent: №25/04 дахин орж ирвэл алгасна
    again = M.create_active_contract(db, cl, "25/04", as_of, items=[])
    assert again is None


def test_loader_full_and_idempotent(db):
    from app.services import migration as M
    from app.seed import seed_base

    seed_base(db)
    data = {
        "as_of": "2026-08-23",
        "clients": [
            {"name": "Реал Констракшн", "balance": 50_000_000, "deposit": 3_000_000,
             "person": "Р.Реал", "phone": "9911"},
            {"name": "Кредит ХХК", "balance": -1_000_000},
        ],
        "stock": [
            {"material": "Хэв хашмал 6012", "grade": "А", "on_hand": 2790},
            {"material": "Хэв хашмал 6012", "grade": "плас", "on_hand": 1193},
        ],
        "loans": [
            {"name": "Хаан банк — шугам №1", "kind": "bank", "principal": 800_000_000,
             "monthly_rate": 1.6, "start_date": "2025-03-14"},
        ],
        "barter": [
            {"type": "Машин", "name": "Land Cruiser J300", "detail": "0314УНҮ",
             "value_in": 250_000_000, "asking_price": 250_000_000,
             "sold_amount": 240_000_000, "date_in": "2026-01-15"},
            {"type": "Байр", "name": "Арцат Өргөө 116.93м²",
             "value_in": 409_255_000, "date_in": "2026-02-01"},
        ],
    }
    r1 = M.load_data(db, data)
    assert r1["clients"] == 2 and r1["loans"] == 1 and r1["barter"] == 2
    # зэрэглэл "плас" автоматаар үүссэн байх ёстой
    assert db.query(models.Grade).filter_by(code="плас").first() is not None
    st = (db.query(models.Stock).join(models.Material)
          .filter(models.Material.name == "Хэв хашмал 6012",
                  models.Stock.grade_id == db.query(models.Grade).filter_by(code="А").first().id)
          .first())
    assert st.on_hand == 2790
    sold = db.query(models.BarterAsset).filter_by(name="Land Cruiser J300").first()
    assert sold.status == "sold" and sold.sold_amount == 240_000_000
    # ---- idempotent: дахин ачаалахад юу ч давхардахгүй ----
    r2 = M.load_data(db, data)
    assert r2["clients"] == 0 and r2["loans"] == 0 and r2["barter"] == 0
    assert db.query(models.Client).filter_by(name="Реал Констракшн").count() == 1
    assert db.query(models.BarterAsset).count() == 2


def test_migrated_contracts_never_arm_penalty(db):
    """P0-10 «алданги=0»: шилжүүлсэн гэрээ ХОЁУЛАА (OB ба идэвхтэй) алдангигүй
    төрнө. Тэр амьдралдаа алданги нэхээгүй — хөшүүрэг нь зэвсэглээгүй байж,
    зөвхөн ТЭР гараар асаана (H2)."""
    from app.services import migration as M
    from app.seed import seed_base

    seed_base(db)
    cl = models.Client(name="Алдангигүй Харилцагч")
    db.add(cl)
    db.commit()
    as_of = date(2026, 8, 24)

    M.create_opening_balance(db, cl, 10_000_000, as_of)
    M.create_active_contract(db, cl, "26/01", as_of, items=[
        {"material": "Хэв хашмал 6012", "grade": "А", "qty": 100, "daily_rate": 330},
    ])

    db.refresh(cl)
    assert len(cl.contracts) == 2
    for c in cl.contracts:
        assert c.penalty_percent == 0, f"№{c.no} алданги зэвсэглэсэн: {c.penalty_percent}"


def test_credit_client_keeps_her_deposit(db):
    """Арвинбулагийн кейс: үлдэгдэл СӨРӨГ (илүү төлсөн) БОЛОВЧ 3 сая₮ барьцаа
    байршуулсан. Кредит болгож хөрвүүлэхдээ барьцааг унагаавал бодит 3 сая₮
    чимээгүй алга болно — барьцаа балансын ГАДНА (R21), тэмдгээс хамаарахгүй."""
    from app.services import migration as M

    cl = models.Client(name="Илүү Төлсөн Барьцаатай")
    db.add(cl)
    db.commit()
    as_of = date(2026, 9, 1)
    M.create_opening_balance(db, cl, -4_820_388, as_of, deposit=3_000_000)

    db.refresh(cl)
    assert sum(c.deposit for c in cl.contracts) == 3_000_000
    pays = db.query(models.Payment).filter_by(client_id=cl.id).all()
    assert len(pays) == 1 and pays[0].amount == 4_820_388   # кредит хэвээр
    assert db.query(models.Invoice).count() == 0            # өр үүсээгүй
    for c in cl.contracts:
        assert c.penalty_percent == 0

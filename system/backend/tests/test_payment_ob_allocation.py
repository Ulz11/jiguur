"""ГЭРЭЭН дээр бүртгэсэн төлбөр ХАРИЛЦАГЧИЙН ХУУЧИН ӨРИЙГ хааж чадна.

Отгоо эгчийн толгойд НЭГ харилцагч — НЭГ өр — ХАМГИЙН ХУУЧНААС нь. Гэрээний
хуудсан дээрх «Төлбөр бүртгэх» нь `contract_id` илгээдэг тул хуваарилалт тэр
гэрээний нэхэмжлэлүүдээр хаагдаж, 382 сая₮-ийн хуучин үлдэгдэл ХӨДӨЛГӨӨНГҮЙ
үлдэж, мөнгө нь «хуваарилагдаагүй кредит» болж дараагийн ШИНЭ нэхэмжлэл рүү
үсэрдэг байв (`apply_client_credit`). Харилцагчийн хуудсан дээрх ЯГ ижил
төлбөр харин хуучнаас нь хаадаг — нэг үйлдэл, хоёр өөр хариулт.

Дүрэм: гэрээнд харьяалагдсан төлбөрийн НЭР ДЭВШИГЧ = ТЭР гэрээний амьд
нэхэмжлэл + харилцагчийн ДАНСНЫ (`OB-`) нэхэмжлэл, бүгд `due_date`-ээр
хуучнаас нь. Данс нь ГЭРЭЭ БИШ (`migration.account_contract`) — тэр нь гэрээ
бүрийн АРД зогсох нэг данс тул нэр дэвшигчээс хасагдах учиргүй. Харин ӨӨР
ЖИНХЭНЭ гэрээний нэхэмжлэл хэвээрээ ХӨНДӨГДӨХГҮЙ.
"""
import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app import models, schemas
from app.routers import payments as payments_router
from app.services import billing
from app.services import migration as M

# Блүүмийн бодит тоо: 8.11 хүртэлх дэвтрийн үлдэгдэл.
OB_AMOUNT = 382_179_050
OB_DUE = date(2026, 8, 11)
RENT_TOTAL = 5_000_000
RENT_DUE = date(2026, 9, 19)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def _client(db, name="БЛҮҮМ технологи") -> models.Client:
    cl = models.Client(name=name)
    db.add(cl)
    db.commit()
    return cl


def _contract(db, cl, no="24/03") -> models.Contract:
    """ЖИНХЭНЭ түрээсийн гэрээ (алдангигүй — энэ файл хуваарилалтыг л шалгана)."""
    c = models.Contract(no=no, client_id=cl.id, type="rent", status="active",
                        start_date=date(2026, 8, 12), cycle_days=30, penalty_percent=0)
    db.add(c)
    db.commit()
    return c


def _invoice(db, c, no, due, total) -> models.Invoice:
    """Нэхэмжлэлийг ШУУД байгуулна — тооцооны хөдөлгүүр эндээс шалгагдахгүй."""
    inv = models.Invoice(contract_id=c.id, no=no, cycle_start=due, cycle_end=due,
                         due_date=due, rent_amount=total, total=total)
    db.add(inv)
    db.commit()
    return inv


def _pay(db, cl, amount, contract=None, day=date(2026, 9, 20)) -> models.Payment:
    p = models.Payment(client_id=cl.id, contract_id=contract.id if contract else None,
                       date=day, amount=amount, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.refresh(p)
    return p


def _setup(db):
    """Хуучин үлдэгдэлтэй харилцагч + ХОЖМЫН нэхэмжлэлтэй жинхэнэ гэрээ."""
    cl = _client(db)
    ob = M.create_opening_balance(db, cl, OB_AMOUNT, date(2026, 8, 15), ob_date=OB_DUE)
    c = _contract(db, cl)
    rent = _invoice(db, c, "R-24/03-1", RENT_DUE, RENT_TOTAL)
    db.refresh(cl)
    assert ob.due_date == OB_DUE and ob.total == OB_AMOUNT, "тестийн суурь буруу"
    return cl, c, ob, rent


def _on(p: models.Payment, inv: models.Invoice) -> float:
    return sum(a.amount for a in p.allocations if a.invoice_id == inv.id)


# ---------- 1. Гэрээний төлбөр → хуучин өр ----------

def test_contract_payment_pays_the_opening_balance_first(db):
    """1.5 сая₮-ийг ГЭРЭЭН дээр бүртгэхэд бүхэлдээ ХУУЧИН үлдэгдэл рүү очно.

    Урьд нь энэ мөнгө хаана ч суудаггүй байсан: гэрээний цорын ганц нэхэмжлэл
    нь хожуу тул хуваарилалт болоод, үлдэгдэл нь кредит болж хүлээдэг байв.
    """
    cl, c, ob, rent = _setup(db)

    p = _pay(db, cl, 1_500_000, contract=c)

    assert _on(p, ob) == pytest.approx(1_500_000)
    assert _on(p, rent) == 0
    assert billing.payment_unallocated(p) == pytest.approx(0)
    db.refresh(ob)
    db.refresh(rent)
    assert ob.paid == pytest.approx(1_500_000)
    assert ob.status == "partial"
    assert rent.paid == 0, "хуучин өр байхад шинэ нэхэмжлэл рүү үсэрчээ"


def test_contract_payment_bigger_than_the_opening_balance_spills_into_the_rent_invoice(db):
    """Хуучнаас нь ХАЛИХ мөнгө гэрээнийхээ нэхэмжлэл рүү үргэлжилнэ —
    дараалал нь `due_date`, ХАЙРЦАГ нь биш."""
    cl, c, ob, rent = _setup(db)

    p = _pay(db, cl, OB_AMOUNT + 1_000_000, contract=c)

    assert _on(p, ob) == pytest.approx(OB_AMOUNT)
    assert _on(p, rent) == pytest.approx(1_000_000)
    assert billing.payment_unallocated(p) == pytest.approx(0)
    db.refresh(ob)
    assert ob.status == "paid"


def test_a_contract_payment_never_touches_another_real_contracts_invoice(db):
    """ХОЁР ЖИНХЭНЭ гэрээтэй харилцагч: A дээрх төлбөр B рүү ХЭЗЭЭ Ч орохгүй.

    B-гийн нэхэмжлэл нь ХАМГИЙН ХУУЧИН нь — «хуучнаас нь» дүрэм гэрээний
    хайрцгийг задалсан бол энэ тест улаанаар унана. Зөвхөн ДАНС (`OB-`) л
    хайрцгаас гадуур зогсоно.
    """
    cl = _client(db)
    a = _contract(db, cl, "24/03")
    b = _contract(db, cl, "24/07")
    inv_b = _invoice(db, b, "R-24/07-1", date(2026, 7, 1), 3_000_000)   # хамгийн хуучин
    inv_a = _invoice(db, a, "R-24/03-1", RENT_DUE, RENT_TOTAL)

    p = _pay(db, cl, 2_000_000, contract=a)

    assert _on(p, inv_a) == pytest.approx(2_000_000)
    assert _on(p, inv_b) == 0
    db.refresh(inv_b)
    assert inv_b.paid == 0


def test_a_client_wide_payment_still_pays_everything_oldest_first(db):
    """Харилцагчийн хуудсан дээрх төлбөр (гэрээгүй) ЯГ ХЭВЭЭР — бүх гэрээг
    хамарч, хуучнаас нь хаана."""
    cl = _client(db)
    ob = M.create_opening_balance(db, cl, 1_000_000, date(2026, 8, 15), ob_date=OB_DUE)
    b = _contract(db, cl, "24/07")
    inv_b = _invoice(db, b, "R-24/07-1", RENT_DUE, 3_000_000)
    db.refresh(cl)

    p = _pay(db, cl, 2_500_000)

    assert _on(p, ob) == pytest.approx(1_000_000)
    assert _on(p, inv_b) == pytest.approx(1_500_000)


# ---------- 2. Гараар чиглүүлсэн хуваарилалт ----------

def _body(cl, c, amount=1_500_000):
    return schemas.PaymentIn(client_id=cl.id, contract_id=c.id if c else None,
                             date=date(2026, 9, 20), amount=amount)


def test_manual_allocation_to_the_opening_invoice_is_accepted_on_a_contract(db):
    """Дарга гэрээн дээрээс хуучин үлдэгдэл рүү ГАРААР чиглүүлж чадна.

    Урьд нь «Нэхэмжлэл OB-1 сонгосон гэрээнийх биш» гэж 400 буудаг байсан —
    автомат хуваарилалт нь тэр нэхэмжлэлийг хааж байхад гар нь хаагдсан
    хэвээр байв.
    """
    cl, c, ob, rent = _setup(db)
    allocs = [{"invoice_id": ob.id, "amount": 1_500_000}]

    assert payments_router._check_allocations(db, _body(cl, c), allocs) == allocs

    p = models.Payment(client_id=cl.id, contract_id=c.id, date=date(2026, 9, 20),
                       amount=1_500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p, allocs)
    db.refresh(p)
    assert _on(p, ob) == pytest.approx(1_500_000)
    assert all(a.manual == 1 for a in p.allocations)


def test_manual_allocation_to_another_real_contract_is_still_refused(db):
    """Хайрцаг задраагүй: ӨӨР ЖИНХЭНЭ гэрээний нэхэмжлэл рүү гараар чиглүүлбэл
    хуучин мессежээрээ л таслагдана."""
    cl = _client(db)
    a = _contract(db, cl, "24/03")
    b = _contract(db, cl, "24/07")
    inv_b = _invoice(db, b, "R-24/07-1", RENT_DUE, 3_000_000)

    with pytest.raises(HTTPException) as e:
        payments_router._check_allocations(
            db, _body(cl, a), [{"invoice_id": inv_b.id, "amount": 1_000_000}])

    assert "сонгосон гэрээнийх биш" in e.value.detail


# ---------- 3. Цуцлалт ба кредит ----------

def test_voiding_a_contract_payment_returns_the_money_to_the_opening_balance(db):
    """Цуцлахад ХУУЧИН үлдэгдэл эргэж нээгдэнэ; үлдсэн кредит нь дахин ЯГ
    тийшээ (шинэ нэхэмжлэл рүү БИШ) очно — цонхны урьдчилсан харагдац ба
    бодит байдал хоёр нэг дүрмээр явна."""
    cl, c, ob, rent = _setup(db)
    p1 = _pay(db, cl, 1_500_000, contract=c)
    p2 = _pay(db, cl, 500_000, contract=c)

    released = billing.payment_release_preview(p1)
    assert [(r["no"], r["amount"]) for r in released] == [(ob.no, 1_500_000)]
    assert billing.void_payment(db, p1, "Дүнг буруу бичсэн") == released

    db.refresh(ob)
    db.refresh(rent)
    assert ob.paid == pytest.approx(500_000), "цуцлагдсан төлбөр хэвээр суусан байна"
    assert rent.paid == 0
    assert billing.payment_unallocated(p2) == pytest.approx(0)

"""Тайлан — TDD. Ашиг/алдагдлын зарчим:
Орлого (аккруэл): түрээсийн нэхэмжлэл (тухайн үед дууссан цикл) + худалдаа + механизмын ажил
Зардал: механизмын зарлага + олгосон цалин + төлсөн зээлийн хүү
± Бартерын хэрэгжсэн үр дүн = Цэвэр үр дүн."""
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


def test_pnl_controlled_numbers(db):
    """Гараар бодсон тоонууд дээр P&L яг таарах ёстой."""
    from app.services import reports as R

    cl = models.Client(name="Т")
    db.add(cl)
    db.flush()
    rent_c = models.Contract(no="r1", client_id=cl.id, type="rent",
                             start_date=date(2026, 6, 1), penalty_percent=0.5)
    sale_c = models.Contract(no="s1", client_id=cl.id, type="sale",
                             start_date=date(2026, 7, 5), penalty_percent=0)
    db.add_all([rent_c, sale_c])
    db.flush()
    # Түрээс: 7 сард дууссан цикл — 10 сая түрээс + 1 сая засвар/акт
    db.add(models.Invoice(contract_id=rent_c.id, no="R-1", cycle_start=date(2026, 6, 10),
                          cycle_end=date(2026, 7, 10), due_date=date(2026, 7, 10),
                          rent_amount=10_000_000, charge_amount=1_000_000, total=11_000_000))
    # Худалдаа: 7 сард — 5 сая
    db.add(models.Invoice(contract_id=sale_c.id, no="S-1", cycle_start=date(2026, 7, 5),
                          cycle_end=date(2026, 7, 5), due_date=date(2026, 7, 5),
                          rent_amount=5_000_000, total=5_000_000))
    # Механизм: ажил 2 сая, зарлага 0.5 сая
    m = models.Machine(name="Кран")
    db.add(m)
    db.flush()
    db.add(models.MachineLog(machine_id=m.id, date=date(2026, 7, 12), entry="job",
                             label="Бүтэн өдөр", amount=2_000_000, method="BANK"))
    db.add(models.MachineLog(machine_id=m.id, date=date(2026, 7, 14), entry="expense",
                             label="Түлш", amount=500_000))
    # Цалин: 7 сард олгосон 3 сая (base)
    run = models.SalaryRun(period="2026-07", half=1, paid=1, paid_date=date(2026, 7, 15))
    db.add(run)
    db.flush()
    e = models.Employee(name="А", type="main", monthly_salary=6_000_000)
    db.add(e)
    db.flush()
    db.add(models.SalaryItem(run_id=run.id, employee_id=e.id, base=3_000_000, net=3_000_000))
    # Зээлийн хүү: 7 сард 1.2 сая төлсөн
    loan = models.Loan(name="Банк", principal=100_000_000, monthly_rate=1.2,
                       start_date=date(2026, 1, 10))
    db.add(loan)
    db.flush()
    db.add(models.LoanPayment(loan_id=loan.id, date=date(2026, 7, 10),
                              amount=1_200_000, part="interest"))
    # Бартер: 7 сард 10 саяар орж ирснийг 8 саяд зарав → −2 сая
    db.add(models.BarterAsset(name="Машин", date_in=date(2026, 6, 1), value_in=10_000_000,
                              status="sold", sold_date=date(2026, 7, 20), sold_amount=8_000_000))
    db.commit()

    p = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))
    assert p["rent_income"] == 11_000_000
    assert p["sale_income"] == 5_000_000
    assert p["machine_income"] == 2_000_000
    assert p["machine_expense"] == 500_000
    assert p["salary_expense"] == 3_000_000
    assert p["interest_expense"] == 1_200_000
    assert p["barter_result"] == -2_000_000
    assert p["total_income"] == 18_000_000
    assert p["total_expense"] == 4_700_000
    assert p["net"] == 18_000_000 - 4_700_000 - 2_000_000
    # 6 сард түрээсийн орлого 0 (цикл 7 сард дууссан)
    p6 = R.pnl(db, date(2026, 6, 1), date(2026, 6, 30))
    assert p6["rent_income"] == 0


def test_pnl_penalty_income_cash_basis(db):
    """Алдангийн орлого КАССЫН зарчмаар: алданги хэсэгт хуваарилагдсан төлбөр
    ТӨЛӨГДСӨН сарынхаа орлогод орно. 7 сард 500,000₮ төлсөн алданги 7 сард,
    8 сард төлсөн 200,000₮ нь 7 сард ОРОХГҮЙ."""
    from app.services import reports as R

    cl = models.Client(name="Алданги төлөгч")
    db.add(cl)
    db.flush()
    c = models.Contract(no="r9", client_id=cl.id, type="rent",
                        start_date=date(2026, 6, 1), penalty_percent=0.5)
    db.add(c)
    db.flush()
    inv = models.Invoice(contract_id=c.id, no="R-9-1", cycle_start=date(2026, 6, 10),
                         cycle_end=date(2026, 7, 10), due_date=date(2026, 7, 10),
                         rent_amount=10_000_000, total=10_000_000, paid=10_000_000,
                         penalty_booked=700_000, penalty_paid=700_000)
    db.add(inv)
    db.flush()
    p7 = models.Payment(client_id=cl.id, contract_id=c.id, date=date(2026, 7, 25),
                        amount=10_500_000, method="BANK")
    p8 = models.Payment(client_id=cl.id, contract_id=c.id, date=date(2026, 8, 3),
                        amount=200_000, method="CASH")
    db.add_all([p7, p8])
    db.flush()
    db.add(models.PaymentAllocation(payment_id=p7.id, invoice_id=inv.id,
                                    amount=10_000_000, part="principal"))
    db.add(models.PaymentAllocation(payment_id=p7.id, invoice_id=inv.id,
                                    amount=500_000, part="penalty"))
    db.add(models.PaymentAllocation(payment_id=p8.id, invoice_id=inv.id,
                                    amount=200_000, part="penalty"))
    db.commit()

    p = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))
    assert p["penalty_income"] == 500_000
    assert p["rent_income"] == 10_000_000            # үндсэн хэсэг нь давхардаж орохгүй
    assert p["total_income"] == 10_500_000           # алдангийн орлого НИЙТ орлогод орно
    assert p["net"] == 10_500_000
    p8r = R.pnl(db, date(2026, 8, 1), date(2026, 8, 31))
    assert p8r["penalty_income"] == 200_000


def test_opening_balance_not_counted_as_income(db):
    """РЕГРЕСС: хуучин системээс шилжсэн үлдэгдэл (OB-) нь ТУХАЙН ҮЕИЙН ОРЛОГО БИШ.
    Эс бөгөөс тайлан хэдэн тэрбумын хуурамч ашиг харуулна."""
    from app.services import reports as R
    from app.services import migration as M

    cl = models.Client(name="Хуучин")
    db.add(cl)
    db.commit()
    as_of = date(2026, 7, 15)
    M.create_opening_balance(db, cl, 500_000_000, as_of)   # 500 сая хуучин авлага
    # мөн энэ үед бодит түрээсийн цикл дууссан
    c2 = models.Contract(no="R-1", client_id=cl.id, type="rent",
                         start_date=date(2026, 6, 1), penalty_percent=0.5)
    db.add(c2)
    db.flush()
    db.add(models.Invoice(contract_id=c2.id, no="R-1-1", cycle_start=date(2026, 6, 10),
                          cycle_end=date(2026, 7, 10), due_date=date(2026, 7, 10),
                          rent_amount=8_000_000, total=8_000_000))
    db.commit()

    p = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))
    assert p["rent_income"] == 8_000_000, "OB үлдэгдэл орлогод орох ёсгүй"
    assert p["net"] == 8_000_000


def test_reports_api_and_export(client, as_role):
    h = as_role("otgoo")
    r = client.get("/api/reports?months=6", headers=h)
    assert r.status_code == 200
    d = r.json()
    assert {"pnl", "months", "series"} <= set(d.keys())
    assert d["pnl"]["net"] == (d["pnl"]["total_income"] - d["pnl"]["total_expense"]
                               + d["pnl"]["barter_result"])
    x = client.get("/api/reports/export.xlsx", headers=h)
    assert x.status_code == 200
    assert x.content[:2] == b"PK"  # xlsx = zip


def test_receivables_export(client, as_role):
    x = client.get("/api/export/receivables.xlsx", headers=as_role("sanhuu"))
    assert x.status_code == 200 and x.content[:2] == b"PK"


def test_import_clients_xlsx(client, as_role):
    import io
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.append(["Нэр", "Регистр", "Хариуцагч", "Утас"])
    ws.append(["Импорт Тест ХХК", "1122334", "И.Тест", "9911-2233"])
    ws.append(["Түмэн Хийц ХХК", "", "", ""])  # давхардал — алгасагдана
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    r = client.post("/api/import/clients", headers=as_role("otgoo"),
                    files={"file": ("clients.xlsx", buf.read(),
                                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200
    assert r.json()["created"] == 1
    assert r.json()["skipped"] == 1

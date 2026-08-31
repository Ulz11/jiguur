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


def test_cashflow_split_by_method_controlled(db):
    """Мөнгөн урсгалын ОРСОН дүн төлбөрийн хэлбэрээр задарна: бэлэн / данс / бартер.
    Механизмын ажил ч мөн адил (INTERNAL = дотоод ажил, огт тооцогдохгүй;
    хэлбэргүй ("") хуучин бичлэг → данс). cash_in нь гурвын НИЙЛБЭР хэвээр."""
    from app.services import reports as R

    today = date(2026, 7, 15)
    d0 = date(2026, 7, 1)

    cl = models.Client(name="Хэлбэрийн тест")
    db.add(cl)
    db.flush()
    c = models.Contract(no="r7", client_id=cl.id, type="rent",
                        start_date=date(2026, 6, 1), penalty_percent=0.5)
    db.add(c)
    db.flush()
    # Харилцагчийн төлбөр: бэлэн 1.0 сая, данс 2.5 сая, бартер 0.7 сая
    db.add(models.Payment(client_id=cl.id, contract_id=c.id, date=d0,
                          amount=1_000_000, method="CASH"))
    db.add(models.Payment(client_id=cl.id, contract_id=c.id, date=d0,
                          amount=2_500_000, method="BANK"))
    db.add(models.Payment(client_id=cl.id, contract_id=c.id, date=d0,
                          amount=700_000, method="BARTER",
                          barter_desc="Автомашин 9957УКК"))
    # Механизм
    m = models.Machine(name="Экскаватор")
    db.add(m)
    db.flush()
    db.add(models.MachineLog(machine_id=m.id, date=d0, entry="job",
                             label="Хагас өдөр", amount=300_000, method="CASH"))
    db.add(models.MachineLog(machine_id=m.id, date=d0, entry="job",
                             label="Дотоод", amount=400_000, method="INTERNAL"))
    db.add(models.MachineLog(machine_id=m.id, date=d0, entry="job",
                             label="Бүтэн өдөр", amount=200_000, method=""))
    db.add(models.MachineLog(machine_id=m.id, date=d0, entry="expense",
                             label="Түлш", amount=500_000))
    db.commit()

    s = R.cashflow_series(db, today)
    i = len(s["months"]) - 1                       # энэ сар = цувралын сүүлийн нүд
    assert s["inflow_cash"][i] == 1_300_000        # 1.0 сая төлбөр + 0.3 сая механизм
    assert s["inflow_bank"][i] == 2_700_000        # 2.5 сая төлбөр + 0.2 сая ("" → данс)
    assert s["inflow_barter"][i] == 700_000
    assert s["cash_in"][i] == 4_700_000            # INTERNAL 0.4 сая ОРООГҮЙ
    assert s["cash_in"][i] == (s["inflow_cash"][i] + s["inflow_bank"][i]
                               + s["inflow_barter"][i])
    assert s["cash_out"][i] == 500_000
    for k in ("inflow_cash", "inflow_bank", "inflow_barter"):
        assert len(s[k]) == len(s["months"])


def test_pnl_detail_breakdown(db):
    """P&L-ийн ТОО БҮР задаргаатай — задаргааны нийлбэр нь дүнтэйгээ ЯГ тэнцэнэ.
    Түрээсийн орлого дотор засвар/акт/чөлөөт акт ялгарч, бартер мөр нь
    орж ирсэн ↔ зарсан бүх мөшгилтөө авч явна."""
    import json
    from app.services import reports as R

    cl = models.Client(name="Задаргаа ХХК")
    db.add(cl)
    db.flush()
    c = models.Contract(no="z1", client_id=cl.id, type="rent",
                        start_date=date(2026, 6, 1), penalty_percent=0.5)
    db.add(c)
    db.flush()
    detail = {"lines": [], "charges": [
        {"date": "2026-07-02", "desc": "Засвар", "amount": 300_000},
        {"date": "2026-07-02", "desc": "Акт", "amount": 500_000},
        {"date": "2026-07-05", "desc": "Акт: Кран дуудлага", "amount": 200_000},
    ]}
    db.add(models.Invoice(contract_id=c.id, no="R-z1-1", cycle_start=date(2026, 6, 10),
                          cycle_end=date(2026, 7, 10), due_date=date(2026, 7, 10),
                          rent_amount=10_000_000, charge_amount=1_000_000,
                          total=11_000_000, detail_json=json.dumps(detail)))
    # Худалдаа
    sc = models.Contract(no="zs1", client_id=cl.id, type="sale",
                         start_date=date(2026, 7, 5), penalty_percent=0)
    db.add(sc)
    db.flush()
    db.add(models.Invoice(contract_id=sc.id, no="S-zs1-1", cycle_start=date(2026, 7, 5),
                          cycle_end=date(2026, 7, 5), due_date=date(2026, 7, 5),
                          rent_amount=5_000_000, total=5_000_000))
    # Алданги: нэхсэн 700к (7 сард), төлөгдсөн 500к
    inv2 = models.Invoice(contract_id=c.id, no="R-z1-0", cycle_start=date(2026, 5, 10),
                          cycle_end=date(2026, 6, 10), due_date=date(2026, 6, 10),
                          rent_amount=1_000_000, total=1_000_000)
    db.add(inv2)
    db.flush()
    db.add(models.PenaltyCharge(contract_id=c.id, client_id=cl.id,
                                as_of=date(2026, 7, 20), amount=700_000, user_name="otgoo"))
    pay = models.Payment(client_id=cl.id, contract_id=c.id, date=date(2026, 7, 25),
                         amount=500_000, method="BANK")
    db.add(pay)
    db.flush()
    db.add(models.PaymentAllocation(payment_id=pay.id, invoice_id=inv2.id,
                                    amount=500_000, part="penalty"))
    # Механизм: 2 машин
    m1, m2 = models.Machine(name="Кран-1"), models.Machine(name="Кран-2")
    db.add_all([m1, m2])
    db.flush()
    db.add(models.MachineLog(machine_id=m1.id, date=date(2026, 7, 12), entry="job",
                             label="Бүтэн өдөр", amount=2_000_000, method="BANK"))
    db.add(models.MachineLog(machine_id=m1.id, date=date(2026, 7, 14), entry="expense",
                             label="Түлш", amount=500_000))
    db.add(models.MachineLog(machine_id=m2.id, date=date(2026, 7, 15), entry="job",
                             label="Хагас өдөр", amount=800_000, method="CASH"))
    # Цалин + хүү
    run = models.SalaryRun(period="2026-07", half=1, paid=1, paid_date=date(2026, 7, 15))
    db.add(run)
    db.flush()
    e = models.Employee(name="А", type="main", monthly_salary=6_000_000)
    db.add(e)
    db.flush()
    db.add(models.SalaryItem(run_id=run.id, employee_id=e.id, base=3_000_000, net=2_800_000))
    loan = models.Loan(name="Хаан банк", principal=100_000_000, monthly_rate=1.2,
                       start_date=date(2026, 1, 10))
    db.add(loan)
    db.flush()
    db.add(models.LoanPayment(loan_id=loan.id, date=date(2026, 7, 10),
                              amount=1_200_000, part="interest"))
    # Бартер: 10 саяар орж ирсэн машиныг 8 саяд зарав
    db.add(models.BarterAsset(client_id=cl.id, type="Машин", name="Приус 9957УКК",
                              date_in=date(2026, 6, 1), value_in=10_000_000,
                              status="sold", sold_date=date(2026, 7, 20),
                              sold_amount=8_000_000, sold_to="Бат"))
    db.commit()

    p = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))
    d = p["detail"]
    # Түрээсийн задаргаа: цэвэр + засвар + акт + чөлөөт акт = түрээсийн орлого
    assert d["rent_net"] == 10_000_000
    assert d["charge"]["repair"] == 300_000
    assert d["charge"]["writeoff"] == 500_000
    assert d["charge"]["akt"] == 200_000
    assert d["charge"]["other"] == 0
    assert (d["rent_net"] + d["charge"]["repair"] + d["charge"]["writeoff"]
            + d["charge"]["akt"] + d["charge"]["other"]) == p["rent_income"]
    assert len(d["charge"]["rows"]) == 3
    # Нэхэмжлэлийн мөрүүд нийлбэрээрээ дүнгээ өгнө
    assert sum(r["total"] for r in d["rent_invoices"]) == p["rent_income"]
    assert d["rent_invoices"][0]["client"] == "Задаргаа ХХК"
    assert d["rent_invoices"][0]["contract_no"] == "z1"
    assert sum(r["amount"] for r in d["sale_invoices"]) == p["sale_income"]
    # Алданги: төлөгдсөн нь орлого, нэхэгдсэн нь мэдээлэл
    assert sum(r["amount"] for r in d["penalty_paid"]) == p["penalty_income"] == 500_000
    assert d["penalty_paid"][0]["client"] == "Задаргаа ХХК"
    assert d["penalty_booked"]["total"] == 700_000
    assert d["penalty_booked"]["rows"][0]["amount"] == 700_000
    # Механизм машин бүрээр
    by_name = {r["machine"]: r for r in d["machines"]}
    assert by_name["Кран-1"]["income"] == 2_000_000
    assert by_name["Кран-1"]["expense"] == 500_000
    assert by_name["Кран-2"]["income"] == 800_000
    assert sum(r["income"] for r in d["machines"]) == p["machine_income"]
    assert sum(r["expense"] for r in d["machines"]) == p["machine_expense"]
    # Цалин, хүү
    assert sum(r["amount"] for r in d["salary"]) == p["salary_expense"]
    assert d["salary"][0]["label"].startswith("2026-07")
    assert sum(r["amount"] for r in d["interest"]) == p["interest_expense"]
    assert d["interest"][0]["loan"] == "Хаан банк"
    # Бартер: мөр бүр орж ирсэн ↔ зарсан мөшгилттэй
    b = d["barter"][0]
    assert b["name"] == "Приус 9957УКК" and b["client"] == "Задаргаа ХХК"
    assert b["value_in"] == 10_000_000 and b["sold_amount"] == 8_000_000
    assert b["diff"] == -2_000_000 and b["sold_to"] == "Бат"
    assert sum(r["diff"] for r in d["barter"]) == p["barter_result"]


def test_pnl_detail_unparsed_charge_goes_other(db):
    """Задаргаагүй (хуучин) нэхэмжлэлийн charge нь «other» халаасанд орж,
    нийлбэр нь ЯМАГТ таарна — буруу ангилалд чимээгүй орохгүй."""
    from app.services import reports as R

    cl = models.Client(name="Хуучин мөр")
    db.add(cl)
    db.flush()
    c = models.Contract(no="o1", client_id=cl.id, type="rent",
                        start_date=date(2026, 6, 1), penalty_percent=0)
    db.add(c)
    db.flush()
    db.add(models.Invoice(contract_id=c.id, no="R-o1-1", cycle_start=date(2026, 6, 10),
                          cycle_end=date(2026, 7, 10), due_date=date(2026, 7, 10),
                          rent_amount=4_000_000, charge_amount=1_000_000,
                          total=5_000_000, detail_json="[]"))
    db.commit()
    p = R.pnl(db, date(2026, 7, 1), date(2026, 7, 31))
    d = p["detail"]
    assert d["charge"]["other"] == 1_000_000
    assert (d["rent_net"] + d["charge"]["repair"] + d["charge"]["writeoff"]
            + d["charge"]["akt"] + d["charge"]["other"]) == p["rent_income"] == 5_000_000


def test_reports_api_date_range(client, as_role):
    """Огнооны завсраар татахад pnl тухайн мужаа хэлнэ; буруу огноо → 400."""
    h = as_role("otgoo")
    r = client.get("/api/reports?d_from=2026-07-01&d_to=2026-07-31", headers=h)
    assert r.status_code == 200
    p = r.json()["pnl"]
    assert p["from"] == "2026-07-01" and p["to"] == "2026-07-31"
    assert "detail" in p
    assert client.get("/api/reports?d_from=буруу&d_to=2026-07-31",
                      headers=h).status_code == 400
    assert client.get("/api/reports?d_from=2026-08-01&d_to=2026-07-01",
                      headers=h).status_code == 400
    x = client.get("/api/reports/export.xlsx?d_from=2026-07-01&d_to=2026-07-31", headers=h)
    assert x.status_code == 200 and x.content[:2] == b"PK"
    assert client.get("/api/reports/export.xlsx?d_from=2026-08-01&d_to=2026-07-01",
                      headers=h).status_code == 400


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

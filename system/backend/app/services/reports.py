"""Тайлангийн угсрагч — P&L (аккруэл) + мөнгөн урсгалын цуврал.

Зарчим:
- Түрээсийн орлого = тухайн үед ДУУССАН циклийн нэхэмжлэл (rent + засвар/акт, НӨАТ-гүй)
- Худалдааны орлого = тухайн үеийн худалдааны нэхэмжлэл
- Механизмын орлого/зарлага = ажлын log-оор
- Цалингийн зардал = тухайн үед ОЛГОСОН бодолтууд (base дүнгээр)
- Зээлийн хүү = тухайн үед төлсөн хүү
- Бартерын үр дүн = тухайн үед зарагдсан хөрөнгийн (зарсан − орж ирсэн)
"""
import calendar
from datetime import date
from sqlalchemy.orm import Session
from .. import models


def is_opening(inv: models.Invoice) -> bool:
    """Хуучин системээс шилжсэн үлдэгдэл — авлага мөн, гэхдээ ЭНЭ ҮЕИЙН ОРЛОГО БИШ."""
    return (inv.no or "").startswith("OB-") or (inv.contract.no or "").startswith("OB-")


def pnl(db: Session, d_from: date, d_to: date):
    rent_income = sale_income = 0.0
    for inv in db.query(models.Invoice).join(models.Contract).all():
        if is_opening(inv):
            continue
        base = inv.rent_amount + inv.charge_amount
        if inv.contract.type == "rent":
            # цикл [start, end) — end нь дуусах агшин тул түүгээр нь тайланд оруулна
            if d_from <= inv.cycle_end <= d_to:
                rent_income += base
        else:
            if d_from <= inv.cycle_start <= d_to:
                sale_income += base

    # Алдангийн орлого — КАССЫН зарчмаар (бодит төлөгдсөн, төлбөрийн огноогоор).
    # Түрээс/худалдаа аккруэл боловч алданги бол цуглуулсан цагтаа л орлого.
    # Хүчингүй болсон төлбөрийн хуваарилалт устдаг тул энд аяндаа ороогүй байх
    # ёстой — гэхдээ шүүлтүүрийг ИЛЭРХИЙ бичнэ: орлогын нийлбэр хэзээ ч
    # цуцлагдсан мөнгөнөөс хамаарч болохгүй.
    penalty_income = sum(
        a.amount for a in db.query(models.PaymentAllocation)
        .join(models.Payment, models.PaymentAllocation.payment_id == models.Payment.id)
        .filter(models.PaymentAllocation.part == "penalty",
                models.Payment.voided_at.is_(None),
                models.Payment.date >= d_from, models.Payment.date <= d_to).all())

    logs = db.query(models.MachineLog).filter(
        models.MachineLog.date >= d_from, models.MachineLog.date <= d_to).all()
    machine_income = sum(l.amount for l in logs if l.entry == "job")
    machine_expense = sum(l.amount for l in logs if l.entry == "expense")

    salary_expense = 0.0
    for run in db.query(models.SalaryRun).filter(models.SalaryRun.paid == 1).all():
        if run.paid_date and d_from <= run.paid_date <= d_to:
            salary_expense += sum(i.base for i in run.items)

    interest_expense = sum(p.amount for p in db.query(models.LoanPayment).filter(
        models.LoanPayment.part == "interest",
        models.LoanPayment.date >= d_from, models.LoanPayment.date <= d_to).all())

    barter_result = sum(a.sold_amount - a.value_in for a in
                        db.query(models.BarterAsset).filter(
                            models.BarterAsset.status == "sold").all()
                        if a.sold_date and d_from <= a.sold_date <= d_to)

    # Дуусаагүй циклүүдэд хуримтлагдаж буй дүн — мэдээлэл болгож (үр дүнд ОРОХГҮЙ)
    from . import billing
    accruing = 0.0
    for c in db.query(models.Contract).filter(models.Contract.status == "active").all():
        if c.no.startswith("OB-"):
            continue
        cur = billing.current_cycle_accrual(c, min(d_to, date.today()))
        if cur:
            accruing += cur["accrued"]

    total_income = rent_income + sale_income + machine_income + penalty_income
    total_expense = machine_expense + salary_expense + interest_expense
    return {"from": str(d_from), "to": str(d_to), "accruing": round(accruing),
            "rent_income": round(rent_income), "sale_income": round(sale_income),
            "machine_income": round(machine_income),
            "penalty_income": round(penalty_income),
            "machine_expense": round(machine_expense),
            "salary_expense": round(salary_expense),
            "interest_expense": round(interest_expense),
            "barter_result": round(barter_result),
            "total_income": round(total_income),
            "total_expense": round(total_expense),
            "net": round(total_income - total_expense + barter_result)}


def month_bounds(y: int, m: int):
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def cashflow_series(db: Session, today: date, n: int = 6):
    """Сүүлийн n сарын мөнгөн урсгал: орсон (харилцагчийн төлбөр + механизм)
    ба гарсан (механизмын зарлага + хүү + олгосон цалин).

    Орсон дүн нь төлбөрийн хэлбэрээр задарна: бэлэн / данс / бартер.
    Механизмын ажлын хэлбэргүй ("") хуучин бичлэг → данс; INTERNAL (дотоод
    ажил) нь урсгалд ОГТ ОРОХГҮЙ (өмнөх зан төлөв хэвээр).
    `cash_in` = гурван задаргааны нийлбэр (хуучин хэрэглэгчид эвдрэхгүй)."""
    keys = []
    y, m = today.year, today.month
    for _ in range(n):
        keys.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    keys.reverse()
    months, cin, cout = [], [], []
    f_cash, f_bank, f_barter = [], [], []
    for (y, m) in keys:
        d1, d2 = month_bounds(y, m)
        # Цуцлагдсан төлбөр мөнгөн урсгалд ОРООГҮЙ — тэр мөнгө хэзээ ч ороогүй.
        pays = db.query(models.Payment).filter(
            models.Payment.voided_at.is_(None),
            models.Payment.date >= d1, models.Payment.date <= d2).all()
        logs = db.query(models.MachineLog).filter(
            models.MachineLog.date >= d1, models.MachineLog.date <= d2).all()
        jobs = [l for l in logs if l.entry == "job" and l.method != "INTERNAL"]
        in_cash = (sum(p.amount for p in pays if p.method == "CASH")
                   + sum(l.amount for l in jobs if l.method == "CASH"))
        in_barter = (sum(p.amount for p in pays if p.method == "BARTER")
                     + sum(l.amount for l in jobs if l.method == "BARTER"))
        # Данс = BANK + аль ч ангилалд хамаарахгүй үлдсэн нь (хэлбэргүй хуучин бичлэг)
        in_bank = (sum(p.amount for p in pays if p.method not in ("CASH", "BARTER"))
                   + sum(l.amount for l in jobs if l.method not in ("CASH", "BARTER")))
        mach_out = sum(l.amount for l in logs if l.entry == "expense")
        interest = sum(p.amount for p in db.query(models.LoanPayment).filter(
            models.LoanPayment.part == "interest",
            models.LoanPayment.date >= d1, models.LoanPayment.date <= d2).all())
        sal = 0.0
        for run in db.query(models.SalaryRun).filter(models.SalaryRun.paid == 1).all():
            if run.paid_date and d1 <= run.paid_date <= d2:
                sal += sum(i.net for i in run.items)
        months.append(f"{m}-р")
        f_cash.append(round(in_cash))
        f_bank.append(round(in_bank))
        f_barter.append(round(in_barter))
        cin.append(f_cash[-1] + f_bank[-1] + f_barter[-1])
        cout.append(round(mach_out + interest + sal))
    return {"months": months, "cash_in": cin, "cash_out": cout,
            "inflow_cash": f_cash, "inflow_bank": f_bank, "inflow_barter": f_barter}

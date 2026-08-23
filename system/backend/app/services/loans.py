"""Зээл/өглөгийн тооцоо."""
import calendar
from datetime import date
from sqlalchemy.orm import Session
from .. import models


def loan_balance(loan: models.Loan) -> float:
    """Үлдэгдэл = үндсэн дүн − үндсэн төлөлтүүд (хүү үлдэгдлийг бууруулахгүй)."""
    return loan.principal - sum(p.amount for p in loan.payments if p.part == "principal")


def monthly_due(loan: models.Loan) -> float:
    return loan_balance(loan) * loan.monthly_rate / 100


def next_due_date(loan: models.Loan, today: date) -> date:
    """Сар бүр зээл эхэлсэн өдрийн дугаараар — тухайн сард байхгүй бол сүүлийн өдөр."""
    day = loan.start_date.day

    def clamp(y: int, m: int) -> date:
        return date(y, m, min(day, calendar.monthrange(y, m)[1]))

    cand = clamp(today.year, today.month)
    if cand >= today:
        return cand
    y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    return clamp(y, m)


def summary(db: Session, today: date | None = None):
    today = today or date.today()
    loans = db.query(models.Loan).filter_by(status="active").all()
    total_debt = sum(loan_balance(l) for l in loans)
    burden = sum(monthly_due(l) for l in loans)
    upcoming = sorted(
        [{"loan_id": l.id, "name": l.name, "rate": l.monthly_rate,
          "amount": round(monthly_due(l)), "due": str(next_due_date(l, today))}
         for l in loans if monthly_due(l) > 0],
        key=lambda x: x["due"])
    return {"total_debt": round(total_debt), "monthly_burden": round(burden),
            "active_count": len(loans), "upcoming": upcoming}


def interest_paid_between(db: Session, d_from: date, d_to: date) -> float:
    """[d_from, d_to] хоорондох төлсөн хүү — тайлангийн зардалд орно."""
    rows = db.query(models.LoanPayment).filter(
        models.LoanPayment.part == "interest",
        models.LoanPayment.date >= d_from,
        models.LoanPayment.date <= d_to).all()
    return sum(p.amount for p in rows)

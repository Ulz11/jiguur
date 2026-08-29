"""Зээл/өглөгийн тооцоо."""
import calendar
from datetime import date
from sqlalchemy.orm import Session
from .. import models


def topup_total(loan: models.Loan) -> float:
    """Нэмэлт олголтуудын нийлбэр — нэг гэрээн дээр дахин авсан мөнгө."""
    return sum(p.amount for p in loan.payments if p.part == "topup")


def loan_balance(loan: models.Loan) -> float:
    """Үлдэгдэл = үндсэн дүн + нэмэлт олголтууд − үндсэн төлөлтүүд.

    Хүүгийн төлөлт үлдэгдлийг бууруулахгүй; нэмэлт олголт нь эсрэгээрээ ӨСГӨНӨ.
    """
    return (loan.principal + topup_total(loan)
            - sum(p.amount for p in loan.payments if p.part == "principal"))


def monthly_due(loan: models.Loan) -> float:
    """Сарын ХҮҮ = ОДООГИЙН үлдэгдэл × хүү%. Хагас сарын пропорц тооцдоггүй тул
    нэмэлт олголт хийсэн даруйд хүү нь өссөн үлдэгдлээрээ бодогдоно."""
    return loan_balance(loan) * loan.monthly_rate / 100


def planned_due(loan: models.Loan) -> float:
    """Ойрын төлөлтөд ХАРАГДАХ дүн: гэрээгээр тохирсон сарын төлөлт байвал түүгээр,
    үгүй бол хуучин конвенцоор сарын хүүгээр."""
    return loan.monthly_payment if (loan.monthly_payment or 0) > 0 else monthly_due(loan)


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
          "amount": round(planned_due(l)), "planned": (l.monthly_payment or 0) > 0,
          "due": str(next_due_date(l, today))}
         for l in loans if planned_due(l) > 0],
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

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


def due_day(loan: models.Loan, today: date) -> date:
    """ЭНЭ САРЫН төлөх өдөр — зээл эхэлсэн өдрийн дугаараар (богино сард сүүлийн)."""
    return date(today.year, today.month,
                min(loan.start_date.day, calendar.monthrange(today.year, today.month)[1]))


def paid_this_month(loan: models.Loan, today: date) -> bool:
    """Энэ сард ҮНДСЭН эсвэл ХҮҮГИЙН төлөлт бүртгэгдсэн үү.

    Нэмэлт олголт (`topup`) нь ТӨЛӨЛТ БИШ — мөнгө ГАРСАН биш ОРСОН тул
    хоцролтыг арилгахгүй (эс бөгөөс дахин зээл авах нь «төлсөн» болно).
    """
    return any(p.part in ("interest", "principal")
               and p.date.year == today.year and p.date.month == today.month
               for p in loan.payments)


def overdue_state(loan: models.Loan, today: date) -> tuple[bool, int]:
    """«Төлөлт хоцорсон» уу, хэдэн хоног хоцорсон бэ.

    ДҮРЭМ: энэ сарын төлөх өдөр ӨНГӨРСӨН БОЛОВЧ тэр сард үндсэн/хүүгийн
    төлөлт бүртгэгдээгүй бол хоцорсон. Хаагдсан зээл, төлөх өдөр нь хараахан
    болоогүй зээл, ба тухайн сард ДӨНГӨЖ авсан зээл (эхлэх огноо нь төлөх
    өдрөөс хойш) хоцрохгүй — мөнгө сая гарт орсон байхад «хоцорсон» гэж
    улаан пилл өлгөх нь худал.
    """
    if loan.status != "active":
        return False, 0
    d = due_day(loan, today)
    if d >= today or loan.start_date >= d:
        return False, 0
    if paid_this_month(loan, today):
        return False, 0
    return True, (today - d).days


def overdue_loans(db: Session, today: date | None = None) -> list[dict]:
    """Хоцорсон зээлүүд — мэдэгдлийн давхрага (`billing.build_notifications`)
    ба дэлгэц хоёулаа ЭНЭ функцээс уншина: нэг дүрэм, нэг жагсаалт."""
    today = today or date.today()
    rows = []
    for l in db.query(models.Loan).filter_by(status="active").all():
        late, days = overdue_state(l, today)
        if late:
            rows.append({"loan_id": l.id, "name": l.name,
                         "due": str(due_day(l, today)), "days_late": days,
                         "amount": round(planned_due(l))})
    return sorted(rows, key=lambda r: -r["days_late"])


def summary(db: Session, today: date | None = None):
    today = today or date.today()
    loans = db.query(models.Loan).filter_by(status="active").all()
    total_debt = sum(loan_balance(l) for l in loans)
    burden = sum(monthly_due(l) for l in loans)
    # «Сарын зээлийн төлбөр» — гэрээгээр тохирсон төлөлт (байхгүй бол хүү).
    # Аналитик хуудас үүнийг ӨӨРӨӨ давхар бодож `monthly_loan_due` гэж
    # нэрлэдэг байсан ба Зээл хуудсын «Сарын хүү»-тэй ЗЭРЭГЦЭЖ хоёр өөр тоо
    # гардаг байв. Хоёр дэлгэц НЭГ эх сурвалжтай боллоо.
    planned = sum(planned_due(l) for l in loans)
    late = overdue_loans(db, today)
    upcoming = sorted(
        [{"loan_id": l.id, "name": l.name, "rate": l.monthly_rate,
          "amount": round(planned_due(l)), "planned": (l.monthly_payment or 0) > 0,
          "due": str(next_due_date(l, today))}
         for l in loans if planned_due(l) > 0],
        key=lambda x: x["due"])
    return {"total_debt": round(total_debt),
            # `monthly_burden` нь ХУУЧИН нэр — «Сарын хүү» (дэлгэц түүгээр
            # уншдаг тул үлдээв). `monthly_interest` нь ижил тоо, ИЛЭРХИЙ нэр.
            "monthly_burden": round(burden),
            "monthly_interest": round(burden),
            "monthly_planned": round(planned),
            "active_count": len(loans),
            "overdue_count": len(late), "overdue": late,
            "upcoming": upcoming}


def interest_paid_between(db: Session, d_from: date, d_to: date) -> float:
    """[d_from, d_to] хоорондох төлсөн хүү — тайлангийн зардалд орно."""
    rows = db.query(models.LoanPayment).filter(
        models.LoanPayment.part == "interest",
        models.LoanPayment.date >= d_from,
        models.LoanPayment.date <= d_to).all()
    return sum(p.amount for p in rows)

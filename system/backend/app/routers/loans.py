"""Зээл/өглөг — санхүүч, менежер л харна."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, auth
from ..services import loans as L

router = APIRouter(prefix="/api")
guard = auth.require_roles("manager", "finance")


# Төлөлтийн мөрийн төрлүүд. «topup» = НЭМЭЛТ ОЛГОЛТ — нэг гэрээн дээр дахин авсан
# мөнгө; төлөлт биш тул үлдэгдлийг бууруулахгүй, харин ӨСГӨНӨ.
PARTS = ("interest", "principal", "topup")
PART_ERR = "part нь interest, principal эсвэл topup байна"


class LoanIn(BaseModel):
    name: str
    kind: str = "bank"
    principal: float
    monthly_rate: float
    start_date: date
    note: str = ""
    monthly_payment: float = 0     # төлөвлөсөн сарын төлөлт (0 = тохироогүй)


class LoanPayIn(BaseModel):
    date: date
    amount: float
    part: str = "interest"   # interest | principal | topup
    note: str = ""


def ser(l: models.Loan, today: date):
    interest_paid = sum(p.amount for p in l.payments if p.part == "interest")
    principal_paid = sum(p.amount for p in l.payments if p.part == "principal")
    return {"id": l.id, "name": l.name, "kind": l.kind, "principal": l.principal,
            "monthly_rate": l.monthly_rate, "start_date": str(l.start_date),
            "status": l.status, "note": l.note,
            "balance": round(L.loan_balance(l)),
            "monthly_due": round(L.monthly_due(l)),
            "monthly_payment": l.monthly_payment or 0,
            "topup_total": round(L.topup_total(l)),
            "next_due": str(L.next_due_date(l, today)),
            "interest_paid": round(interest_paid),
            "principal_paid": round(principal_paid),
            "payments": [{"id": p.id, "date": str(p.date), "amount": p.amount,
                          "part": p.part, "note": p.note}
                         for p in sorted(l.payments, key=lambda p: p.date, reverse=True)]}


@router.get("/loans")
def list_loans(db: Session = Depends(get_db), user=Depends(guard)):
    today = date.today()
    loans = db.query(models.Loan).order_by(models.Loan.principal.desc()).all()
    return {"loans": [ser(l, today) for l in loans], "summary": L.summary(db, today)}


@router.post("/loans")
def add_loan(body: LoanIn, db: Session = Depends(get_db), user=Depends(guard)):
    if body.principal <= 0 or body.monthly_rate < 0:
        raise HTTPException(400, "Дүн болон хүү зөв байх ёстой")
    if body.monthly_payment < 0:
        raise HTTPException(400, "Сарын төлөлт сөрөг байж болохгүй")
    l = models.Loan(**body.model_dump())
    db.add(l)
    db.commit()
    return ser(l, date.today())


@router.post("/loans/{lid}/payments")
def pay_loan(lid: int, body: LoanPayIn, db: Session = Depends(get_db), user=Depends(guard)):
    l = db.get(models.Loan, lid)
    if not l:
        raise HTTPException(404, "Зээл олдсонгүй")
    if body.part not in PARTS:
        raise HTTPException(400, PART_ERR)
    if body.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    if body.part == "topup" and l.status == "closed":
        raise HTTPException(400, "Хаагдсан зээлд нэмэлт олголт бүртгэхгүй — эхлээд зээлээ сэргээнэ үү")
    if body.part == "principal" and body.amount > L.loan_balance(l) + 0.01:
        raise HTTPException(400, "Үлдэгдлээс их үндсэн төлбөр")
    db.add(models.LoanPayment(loan_id=lid, **body.model_dump()))
    db.commit()
    db.refresh(l)
    if L.loan_balance(l) <= 0.01:
        l.status = "closed"
        db.commit()
    return ser(l, date.today())


class LoanPatch(BaseModel):
    name: str | None = None
    kind: str | None = None
    monthly_rate: float | None = None
    note: str | None = None
    principal: float | None = None
    start_date: date | None = None
    status: str | None = None
    monthly_payment: float | None = None


@router.patch("/loans/{lid}")
def patch_loan(lid: int, body: LoanPatch, db: Session = Depends(get_db), user=Depends(guard)):
    """Inline засвар — суурь талбарууд (үлдэгдэл, сарын төлбөр дагаж бодогдоно)."""
    l = db.get(models.Loan, lid)
    if not l:
        raise HTTPException(404, "Зээл олдсонгүй")
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    # ---- Валидаци (мутаци хийхээс ӨМНӨ) ----
    if "principal" in data:
        principal_paid = sum(p.amount for p in l.payments if p.part == "principal")
        if data["principal"] <= 0 or data["principal"] < principal_paid - 0.01:
            raise HTTPException(400, "Үндсэн дүн төлсөн үндсэн төлбөрөөс багагүй байх ёстой")
    if "status" in data and data["status"] not in ("active", "closed"):
        raise HTTPException(400, "Төлөв active эсвэл closed байна")
    if "monthly_payment" in data and data["monthly_payment"] < 0:
        raise HTTPException(400, "Сарын төлөлт сөрөг байж болохгүй")
    for k, v in data.items():
        setattr(l, k, v)
    db.commit()
    return ser(l, date.today())


def _get_payment(db: Session, lid: int, pid: int):
    l = db.get(models.Loan, lid)
    if not l:
        raise HTTPException(404, "Зээл олдсонгүй")
    p = db.get(models.LoanPayment, pid)
    if not p or p.loan_id != lid:
        raise HTTPException(404, "Төлөлт олдсонгүй")
    return l, p


@router.patch("/loans/{lid}/payments/{pid}")
def edit_loan_payment(lid: int, pid: int, body: LoanPayIn,
                      db: Session = Depends(get_db), user=Depends(guard)):
    """Бүртгэсэн мөрийг засах (төлөлт ба нэмэлт олголт хоёуланг) — бүх талбар
    шинэ бүтэн утгаараа."""
    l, p = _get_payment(db, lid, pid)
    if body.part not in PARTS:
        raise HTTPException(400, PART_ERR)
    if body.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    was_topup = p.part == "topup"
    p.date, p.amount, p.part, p.note = body.date, body.amount, body.part, body.note
    db.flush()
    db.refresh(l)
    if L.loan_balance(l) < -0.01:
        db.rollback()
        raise HTTPException(400, "Олголтыг багасгавал үлдэгдэл сөрөг болно"
                            if was_topup else "Үлдэгдлээс их үндсэн төлбөр")
    db.commit()
    db.refresh(l)
    if L.loan_balance(l) <= 0.01:
        l.status = "closed"
        db.commit()
    return ser(l, date.today())


@router.delete("/loans/{lid}/payments/{pid}")
def delete_loan_payment(lid: int, pid: int,
                        db: Session = Depends(get_db), user=Depends(guard)):
    """Мөрийг устгах — үндсэн төлөлт уствал үлдэгдэл өснө, нэмэлт олголт уствал буурна."""
    l, p = _get_payment(db, lid, pid)
    if p.part == "topup" and L.loan_balance(l) - p.amount < -0.01:
        raise HTTPException(400, "Энэ олголтыг устгавал үлдэгдэл сөрөг болно — "
                                 "эхлээд үндсэн төлөлтүүдээ засна уу")
    db.delete(p)
    db.commit()
    db.refresh(l)
    return ser(l, date.today())


@router.post("/loans/{lid}/close")
def close_loan(lid: int, db: Session = Depends(get_db), user=Depends(guard)):
    l = db.get(models.Loan, lid)
    if not l:
        raise HTTPException(404, "Зээл олдсонгүй")
    l.status = "closed"
    db.commit()
    return {"ok": True}

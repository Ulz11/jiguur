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


class LoanIn(BaseModel):
    name: str
    kind: str = "bank"
    principal: float
    monthly_rate: float
    start_date: date
    note: str = ""


class LoanPayIn(BaseModel):
    date: date
    amount: float
    part: str = "interest"   # interest | principal
    note: str = ""


def ser(l: models.Loan, today: date):
    interest_paid = sum(p.amount for p in l.payments if p.part == "interest")
    principal_paid = sum(p.amount for p in l.payments if p.part == "principal")
    return {"id": l.id, "name": l.name, "kind": l.kind, "principal": l.principal,
            "monthly_rate": l.monthly_rate, "start_date": str(l.start_date),
            "status": l.status, "note": l.note,
            "balance": round(L.loan_balance(l)),
            "monthly_due": round(L.monthly_due(l)),
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
    l = models.Loan(**body.model_dump())
    db.add(l)
    db.commit()
    return ser(l, date.today())


@router.post("/loans/{lid}/payments")
def pay_loan(lid: int, body: LoanPayIn, db: Session = Depends(get_db), user=Depends(guard)):
    l = db.get(models.Loan, lid)
    if not l:
        raise HTTPException(404, "Зээл олдсонгүй")
    if body.part not in ("interest", "principal"):
        raise HTTPException(400, "part нь interest эсвэл principal байна")
    if body.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
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


@router.patch("/loans/{lid}")
def patch_loan(lid: int, body: LoanPatch, db: Session = Depends(get_db), user=Depends(guard)):
    """Inline засвар — зээлийн нөхцөл (хүү өөрчлөгдвөл сарын төлбөр дагаж өөрчлөгдөнө)."""
    l = db.get(models.Loan, lid)
    if not l:
        raise HTTPException(404, "Зээл олдсонгүй")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(l, k, v)
    db.commit()
    return ser(l, date.today())


@router.post("/loans/{lid}/close")
def close_loan(lid: int, db: Session = Depends(get_db), user=Depends(guard)):
    l = db.get(models.Loan, lid)
    if not l:
        raise HTTPException(404, "Зээл олдсонгүй")
    l.status = "closed"
    db.commit()
    return {"ok": True}

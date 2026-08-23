"""Төлбөр — бэлэн / данс / бартер, автомат хуваарилалт."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas, serializers, auth
from ..services import billing
from ..services import audit

router = APIRouter(prefix="/api")


@router.get("/payments")
def list_payments(client_id: int | None = None, db: Session = Depends(get_db),
                  user=Depends(auth.current_user)):
    q = db.query(models.Payment)
    if client_id:
        q = q.filter_by(client_id=client_id)
    return [serializers.payment(p) for p in q.order_by(models.Payment.date.desc()).limit(200).all()]


@router.post("/payments")
def add_payment(body: schemas.PaymentIn, db: Session = Depends(get_db),
                user=Depends(auth.require_roles("manager", "finance"))):
    if body.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    if body.method not in ("CASH", "BANK", "BARTER"):
        raise HTTPException(400, "Буруу төлбөрийн хэлбэр")
    if body.method == "BARTER" and not body.barter_desc.strip():
        raise HTTPException(400, "Бартерын тайлбар (юу орж ирсэн) заавал")
    client = db.get(models.Client, body.client_id)
    if not client:
        raise HTTPException(404, "Харилцагч олдсонгүй")
    # нэхэмжлэлүүд шинэчлэгдсэн байх ёстой
    for c in client.contracts:
        billing.ensure_invoices(db, c)
    p = models.Payment(**body.model_dump())
    db.add(p)
    db.commit()
    if p.method == "BARTER":
        # Бартераар орж ирсэн зүйл автоматаар Бартер модульд хөрөнгө болж бүртгэгдэнэ
        db.add(models.BarterAsset(client_id=p.client_id, payment_id=p.id,
                                  name=p.barter_desc, date_in=p.date,
                                  value_in=p.amount, note=p.note))
        db.commit()
    allocated = billing.allocate_payment(db, p)
    audit.log(db, user, "create", "payment", p.id,
              f"{client.name} · {p.amount:,.0f}₮ · "
              f"{ {'CASH':'бэлэн','BANK':'данс','BARTER':'бартер'}[p.method] }"
              + (f" ({p.barter_desc})" if p.barter_desc else ""))
    return {**serializers.payment(p), "allocated": allocated,
            "unallocated": round(p.amount - allocated)}

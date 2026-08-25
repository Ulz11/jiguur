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


def _check_allocations(db: Session, body: schemas.PaymentIn,
                       allocs: list[dict] | None) -> list[dict] | None:
    """Гараар чиглүүлсэн хуваарилалтыг нягтална (алданги бүртгэгдсэний ДАРАА).

    Буруу бол 400 — төлбөр огт үүсэхээс өмнө таслана.
    """
    if not allocs:
        return None
    total = 0.0
    for a in allocs:
        inv = db.get(models.Invoice, a["invoice_id"])
        if not inv:
            raise HTTPException(400, "Нэхэмжлэл олдсонгүй")
        if inv.contract.client_id != body.client_id:
            raise HTTPException(400, f"Нэхэмжлэл {inv.no} энэ харилцагчийнх биш")
        if body.contract_id and inv.contract_id != body.contract_id:
            raise HTTPException(400, f"Нэхэмжлэл {inv.no} сонгосон гэрээнийх биш")
        if a["amount"] <= 0:
            raise HTTPException(400, f"Нэхэмжлэл {inv.no}: дүн 0-ээс их байх ёстой")
        due = billing.invoice_outstanding(inv) + billing.invoice_penalty_due(inv)
        if a["amount"] > due + 0.01:
            raise HTTPException(400, f"Нэхэмжлэл {inv.no}-д {due:,.0f}₮ л төлөгдөх ёстой "
                                     f"(та {a['amount']:,.0f}₮ хуваарилав)")
        total += a["amount"]
    if total > body.amount + 0.01:
        raise HTTPException(400, f"Хуваарилсан дүн ({total:,.0f}₮) төлбөрөөс "
                                 f"({body.amount:,.0f}₮) их байна")
    return allocs


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
    # Алдангийг төлбөрийн огноогоор БҮРТГЭНЭ — хуваарилахаас ӨМНӨ, эс бөгөөс
    # хэсэгчилсэн төлөлт өнгөрсний алдангийг устгана.
    billing.book_penalties(db, body.client_id, body.date)

    data = body.model_dump()
    # `allocations` нь Payment-ийн багана БИШ — splat-аас өмнө салгаж авна
    allocs = data.pop("allocations", None)
    allocs = _check_allocations(db, body, allocs)

    p = models.Payment(**data)
    db.add(p)
    db.commit()
    if p.method == "BARTER":
        # Бартераар орж ирсэн зүйл автоматаар Бартер модульд хөрөнгө болж бүртгэгдэнэ
        db.add(models.BarterAsset(client_id=p.client_id, payment_id=p.id,
                                  name=p.barter_desc, date_in=p.date,
                                  value_in=p.amount, note=p.note))
        db.commit()
    allocated = billing.allocate_payment(db, p, allocs)
    audit.log(db, user, "create", "payment", p.id,
              f"{client.name} · {p.amount:,.0f}₮ · "
              f"{ {'CASH':'бэлэн','BANK':'данс','BARTER':'бартер'}[p.method] }"
              + (f" ({p.barter_desc})" if p.barter_desc else "")
              + (" · гараар хуваарилав" if allocs else ""))
    return {**serializers.payment(p), "allocated": allocated,
            "unallocated": round(p.amount - allocated)}

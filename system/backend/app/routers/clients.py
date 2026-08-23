"""Харилцагч + бүрэн профайл."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas, serializers, auth
from ..services import billing
from .barter import ser as barter_ser

router = APIRouter(prefix="/api")


@router.get("/clients")
def list_clients(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    today = date.today()
    for c in db.query(models.Contract).filter_by(status="active").all():
        billing.ensure_invoices(db, c, today)
    return [serializers.client_row(c, today)
            for c in db.query(models.Client).order_by(models.Client.name).all()]


@router.post("/clients")
def add_client(body: schemas.ClientIn, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager", "finance"))):
    c = models.Client(**body.model_dump())
    db.add(c)
    db.commit()
    return serializers.client_row(c, date.today())


@router.put("/clients/{cid}")
def edit_client(cid: int, body: schemas.ClientIn, db: Session = Depends(get_db),
                user=Depends(auth.require_roles("manager", "finance"))):
    c = db.get(models.Client, cid)
    if not c:
        raise HTTPException(404, "Олдсонгүй")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return serializers.client_row(c, date.today())


@router.get("/clients/{cid}")
def client_profile(cid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    """Профайл — тухайн харилцагчтай холбоотой бүх зүйл нэг дор."""
    c = db.get(models.Client, cid)
    if not c:
        raise HTTPException(404, "Харилцагч олдсонгүй")
    today = date.today()
    for ct in c.contracts:
        billing.ensure_invoices(db, ct, today)
    db.refresh(c)
    gmap = {g.id: g.code for g in db.query(models.Grade).all()}
    mmap = {m.id: m.name for m in db.query(models.Material).all()}

    contracts = [serializers.contract_row(ct, today) for ct in c.contracts]
    invoices = [serializers.invoice(i, today)
                for ct in c.contracts for i in ct.invoices]
    invoices.sort(key=lambda i: i["due_date"], reverse=True)
    payments = [serializers.payment(p) for p in
                db.query(models.Payment).filter_by(client_id=cid).order_by(models.Payment.date.desc()).all()]
    files = [serializers.attachment(a) for a in
             db.query(models.Attachment).filter_by(entity_type="client", entity_id=cid).all()]
    for ct in c.contracts:
        files += [serializers.attachment(a) for a in
                  db.query(models.Attachment).filter_by(entity_type="contract", entity_id=ct.id).all()]

    # Тойм-ийн timeline: гэрээ, хөдөлгөөн, төлбөр, нэхэмжлэл нэгтгэсэн он цагийн хэлхээ
    timeline = []
    for ct in c.contracts:
        timeline.append({"date": str(ct.start_date), "kind": "contract",
                         "title": f"Гэрээ №{ct.no} эхлэв",
                         "sub": ("Түрээс" if ct.type == "rent" else "Худалдаа") +
                                (f" · барьцаа {ct.deposit:,.0f}₮" if ct.deposit else "")})
        for mv in ct.movements:
            if mv.status != "done":
                continue
            qty = sum(l.qty for l in mv.lines)
            kind = {"ISSUE": "Ачилт", "RETURN": "Буцаалт", "WRITEOFF": "Акт"}[mv.type]
            charge = sum(l.repair_fee + l.writeoff_fee for l in mv.lines)
            sub = " · ".join(f"{mmap.get(l.material_id)} ×{l.qty:g}" for l in mv.lines[:3])
            if charge:
                sub += f" · төлбөр {charge:,.0f}₮"
            timeline.append({"date": str(mv.date), "kind": mv.type.lower(),
                             "title": f"{kind} — {qty:g}ш · №{ct.no}", "sub": sub})
    for p in payments:
        m = {"CASH": "Бэлэн", "BANK": "Данс", "BARTER": "Бартер"}[p["method"]]
        sub = m + (f" · {p['barter_desc']}" if p["barter_desc"] else "")
        timeline.append({"date": p["date"], "kind": "payment",
                         "title": f"Төлбөр — {p['amount']:,.0f}₮", "sub": sub})
    timeline.sort(key=lambda t: t["date"], reverse=True)

    barter = [barter_ser(a) for a in
              db.query(models.BarterAsset).filter_by(client_id=cid)
              .order_by(models.BarterAsset.date_in.desc()).all()]

    notes = [{"id": n.id, "date": str(n.date), "kind": n.kind, "note": n.note,
              "promise_date": str(n.promise_date) if n.promise_date else None,
              "promise_amount": n.promise_amount, "status": n.status,
              "user_name": n.user_name}
             for n in db.query(models.CollectionNote).filter_by(client_id=cid)
             .order_by(models.CollectionNote.date.desc(), models.CollectionNote.id.desc()).all()]

    row = serializers.client_row(c, today)
    return {**row, "since": str(c.created_at)[:10],
            "contracts": contracts, "invoices": invoices,
            "payments": payments, "files": files, "barter": barter, "notes": notes,
            "timeline": timeline[:50]}

"""Төлбөр — бэлэн / данс / бартер, автомат хуваарилалт, хүчингүй болгох."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas, serializers, auth
from ..services import billing
from ..services import audit

router = APIRouter(prefix="/api")

METHOD_MN = {"CASH": "бэлэн", "BANK": "данс", "BARTER": "бартер"}
BARTER_LOCKED = "Бартерын хөрөнгө зарагдсан/нөөцөд орсон тул цуцлах боломжгүй"


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
    # ⚠ АЛДАНГИ ЭНД НЭХЭГДЭХГҮЙ. Өмнө нь энэ мөр дээр `book_penalties` зогсож,
    # төлбөр бүртгэх бүрд алданги чимээгүй номжиж байсан: Отгоо өршөөсөн
    # харилцагчийнхаа мөнгийг бүртгэхэд үлдэгдэл нь ӨСДӨГ байв — «машин өр
    # зохиож байна» (Чадварын харьцуулалт H2 / R25). Алданги нь ХЭЛЭЛЦЭЭРИЙН
    # ХӨШҮҮРЭГ тул зөвхөн «Алданги нэхэх» товчоор, ил, тусдаа нэхэгдэнэ.
    # Хуваарилалт нь ӨМНӨ НЭХЭГДСЭН алдангийг хэвээр хаана.

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
              f"{client.name} · {p.amount:,.0f}₮ · {METHOD_MN[p.method]}"
              + (f" ({p.barter_desc})" if p.barter_desc else "")
              + (" · гараар хуваарилав" if allocs else ""))
    return {**serializers.payment(p), "allocated": allocated,
            "unallocated": round(p.amount - allocated)}


# ---------------- Хүчингүй болгох (void) ----------------

class VoidIn(BaseModel):
    reason: str = ""


@router.post("/payments/{pid}/void")
def void_payment(pid: int, body: VoidIn, db: Session = Depends(get_db),
                 user=Depends(auth.require_roles("manager", "finance"))):
    """Буруу бүртгэсэн төлбөрийг ХҮЧИНГҮЙ болгоно — УСТГАХГҮЙ.

    Отгоо эгч эхний долоо хоногтоо буруу дүн бичих нь баталгаатай; өнөөдрийн
    систем түүнийг МӨНХӨД үлдээдэг нь Excel рүү буцаах №1 шалтгаан
    (Чадварын харьцуулалт §3 H1). Гэвч засвар нь бүрэн бүтэн байдлыг
    сүйтгэж болохгүй: мөр нь хоёулаа үлдэж, ХҮЧИНГҮЙ тэмдэгтэй харагдана.

    Бартер: автоматаар үүссэн хөрөнгө нь ЗАРАГДААГҮЙ бол хамт хүчингүй болно
    (мөр нь Бартерын жагсаалтад «ХҮЧИНГҮЙ» төлөвтэй үлдэнэ — тэнд ч устгал
    байхгүй). Зарагдсан/нөөцөд орсон бол хожмын баримт аль хэдийн үүссэн тул
    цуцлалт ТАТГАЛЗАНА — эхлээд тэр гинжийг нь тайлах ёстой.
    """
    p = db.get(models.Payment, pid)
    if not p:
        raise HTTPException(404, "Төлбөр олдсонгүй")
    if p.voided_at is not None:
        raise HTTPException(409, "Энэ төлбөр аль хэдийн хүчингүй болсон байна")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")

    asset = None
    if p.method == "BARTER":
        asset = db.query(models.BarterAsset).filter_by(payment_id=p.id).first()
        if asset and asset.status not in ("held", "voided"):
            raise HTTPException(409, BARTER_LOCKED)

    released = billing.void_payment(db, p, reason, getattr(user, "name", "") or "")

    if asset is not None and asset.status == "held":
        asset.status = "voided"
        asset.note = (asset.note + " · " if asset.note else "") + f"Хүчингүй: {reason}"
        db.commit()

    freed = ", ".join(f"{r['no']} {r['amount']:,.0f}₮"
                      + (" (алданги)" if r["part"] == "penalty" else "")
                      for r in released) or "хуваарилалтгүй"
    audit.log(db, user, "void", "payment", p.id,
              f"{p.client.name} · {p.amount:,.0f}₮ · {METHOD_MN.get(p.method, p.method)} — "
              f"ХҮЧИНГҮЙ: {reason} · сулласан: {freed}")
    db.refresh(p)
    return {**serializers.payment(p), "released": released}

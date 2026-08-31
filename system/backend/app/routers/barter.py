"""Бартер — орж ирсэн хөрөнгө, борлуулалт, хэрэгжсэн ашиг/алдагдал."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, auth

router = APIRouter(prefix="/api")


class BarterIn(BaseModel):
    client_id: int | None = None
    type: str = "Бусад"
    name: str
    detail: str = ""
    date_in: date
    value_in: float
    asking_price: float = 0
    note: str = ""


class SellIn(BaseModel):
    date: date
    amount: float
    sold_to: str = ""
    note: str = ""


class ToStockIn(BaseModel):
    material_id: int
    grade_id: int
    qty: float


STALE_DAYS = 180   # хэдэн хоног зарагдаагүй хэвтвэл «зогсонги» гэх вэ
# Төлөв: held → sold / stocked / voided.
# `voided` нь бартер ТӨЛБӨРӨӨ цуцлахад автоматаар үүссэн хөрөнгө орох суваг —
# мөр нь устахгүй (жагсаалтад ХҮЧИНГҮЙ гэж харагдана), гэхдээ `held` ч, `sold`
# ч биш тул нийлбэр, зогсонгийн тооцоо, зарах/нөөцлөх зам бүгд түүнийг алгасна.


def ser(a: models.BarterAsset, today: date | None = None):
    today = today or date.today()
    gain = (a.sold_amount - a.value_in) if a.status == "sold" else None
    held = a.status == "held"
    days = (today - a.date_in).days
    return {"id": a.id, "client_id": a.client_id,
            "client": a.client.name if a.client else None,
            "payment_id": a.payment_id, "type": a.type, "name": a.name,
            "detail": a.detail, "date_in": str(a.date_in),
            "value_in": a.value_in, "asking_price": a.asking_price,
            "status": a.status,
            "sold_date": str(a.sold_date) if a.sold_date else None,
            "sold_amount": a.sold_amount, "sold_to": a.sold_to,
            "gain": gain, "note": a.note,
            # ---- зогсонги хугацааны мэдээлэл ----
            "days_held": days,
            "stale": bool(held and days >= STALE_DAYS),
            "age_bucket": ("0–90" if days < 90 else "91–180" if days < STALE_DAYS
                           else "181–365" if days < 365 else "365+"),
            "target_gap": round((a.asking_price or 0) - a.value_in)}


@router.get("/barter")
def list_assets(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    today = date.today()
    assets = db.query(models.BarterAsset).order_by(models.BarterAsset.date_in.desc()).all()
    rows = [ser(a, today) for a in assets]
    held = [r for r in rows if r["status"] == "held"]
    sold = [r for r in rows if r["status"] == "sold"]
    stale = [r for r in held if r["stale"]]
    buckets = {}
    for r in held:
        b = buckets.setdefault(r["age_bucket"], {"bucket": r["age_bucket"], "count": 0, "value": 0.0})
        b["count"] += 1
        b["value"] += r["value_in"]
    order = ["0–90", "91–180", "181–365", "365+"]
    aging = [buckets[k] for k in order if k in buckets]
    return {"assets": rows,
            "summary": {
                "held_count": len(held),
                "held_value": sum(r["value_in"] for r in held),
                "sold_count": len(sold),
                "sold_value": sum(r["sold_amount"] for r in sold),
                "realized": sum(r["sold_amount"] - r["value_in"] for r in sold),
                "stale_count": len(stale),
                "stale_value": round(sum(r["value_in"] for r in stale)),
                "avg_days_held": round(sum(r["days_held"] for r in held) / len(held)) if held else 0,
                "aging": aging}}


@router.post("/barter")
def add_asset(body: BarterIn, db: Session = Depends(get_db),
              user=Depends(auth.require_roles("manager", "finance"))):
    a = models.BarterAsset(**body.model_dump())
    db.add(a)
    db.commit()
    return ser(a)


class EditIn(BaseModel):
    type: str = "Бусад"
    name: str
    detail: str = ""
    value_in: float
    asking_price: float = 0
    note: str = ""


@router.put("/barter/{aid}")
def edit_asset(aid: int, body: EditIn, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager", "finance"))):
    a = db.get(models.BarterAsset, aid)
    if not a:
        raise HTTPException(404, "Олдсонгүй")
    if a.status != "held":
        raise HTTPException(400, "Зарагдсан/нөөцөд орсон хөрөнгийг засахгүй")
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    db.commit()
    return ser(a)


@router.post("/barter/{aid}/sell")
def sell_asset(aid: int, body: SellIn, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager", "finance"))):
    a = db.get(models.BarterAsset, aid)
    if not a:
        raise HTTPException(404, "Олдсонгүй")
    if a.status != "held":
        raise HTTPException(400, "Энэ хөрөнгө аль хэдийн зарагдсан эсвэл нөөцөд орсон")
    if body.amount <= 0:
        raise HTTPException(400, "Зарсан үнэ 0-ээс их байх ёстой")
    a.status = "sold"
    a.sold_date = body.date
    a.sold_amount = body.amount
    a.sold_to = body.sold_to
    if body.note:
        a.note = (a.note + " · " if a.note else "") + body.note
    db.commit()
    return ser(a)


@router.post("/barter/{aid}/to-stock")
def to_stock(aid: int, body: ToStockIn, db: Session = Depends(get_db),
             user=Depends(auth.require_roles("manager", "factory"))):
    """Материал хэлбэрийн бартерыг агуулахын нөөцөд оруулна."""
    a = db.get(models.BarterAsset, aid)
    if not a:
        raise HTTPException(404, "Олдсонгүй")
    if a.status != "held":
        raise HTTPException(400, "Энэ хөрөнгө аль хэдийн зарагдсан эсвэл нөөцөд орсон")
    if body.qty <= 0:
        raise HTTPException(400, "Тоо 0-ээс их байх ёстой")
    if not db.get(models.Material, body.material_id) or not db.get(models.Grade, body.grade_id):
        raise HTTPException(404, "Материал эсвэл зэрэглэл олдсонгүй")
    st = db.query(models.Stock).filter_by(material_id=body.material_id,
                                          grade_id=body.grade_id).first()
    if not st:
        st = models.Stock(material_id=body.material_id, grade_id=body.grade_id)
        db.add(st)
    st.on_hand += body.qty
    a.status = "stocked"
    a.note = (a.note + " · " if a.note else "") + f"Нөөцөд орсон: {body.qty:g}ш"
    db.commit()
    return ser(a)

"""Бартер — орж ирсэн хөрөнгө, борлуулалт, хэрэгжсэн ашиг/алдагдал."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import clock
from ..db import get_db
from .. import models, auth
from ..services import audit
from ..services import stock as stock_svc

router = APIRouter(prefix="/api")

# БАРТЕР НЬ САНХҮҮГИЙН ТАЛБАЙ (гарын авлага: бартерыг санхүү хөтөлнө).
# Дэлгэц дээр «Зарах», «Нөөцөд оруулах» хоёр товч ЗЭРЭГЦЭЭ зогсдог ба
# хоёулаа `canSell` (менежер + санхүү) -ээр л харагддаг. Сервер нь
# «Нөөцөд оруулах»-ыг менежер + ҮЙЛДВЭРИЙН ДАРГА гэж хаадаг байв: санхүүч
# өөрт нь ХАРАГДАЖ БАЙГАА товчоо дараад 403 иддэг, харин дарга нь товчийг
# нь огт олохгүй. Хоёр тал НЭГ жагсаалт руу хардаг болов.
money_guard = auth.require_roles("manager", "finance")

# Нөөц рүү орох ЗАМ НЭГ: `services/stock.adjust(... source="barter")`.
# Урьд нь энэ файл `Stock.on_hand`-ыг ШУУД нэмдэг байсан тул агуулахын
# түүхэнд мөр үлдэхгүй: тоо өссөн ч «хаанаас» гэдэг нь зөвхөн бартерын
# тэмдэглэл дотор л байдаг байв. Одоо залруулгын дэвтэрт мөр орж, эх
# сурвалж нь «бартер» гэж уншигдана.
STOCK_SOURCE = "barter"


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
#: Орж ирсэн үнэ нь ХЭРЭГЖСЭН АШГИЙН СУУРЬ — 0 бол зарсан үнэ бүхэлдээ
#: «ашиг» болж тайланд орно. Тэр нь тоо биш, ХУДАЛ.
VALUE_IN_ERR = "Орж ирсэн үнэ 0-ээс их байх ёстой"
# Төлөв: held → sold / stocked / voided.
# `voided` нь бартер ТӨЛБӨРӨӨ цуцлахад автоматаар үүссэн хөрөнгө орох суваг —
# мөр нь устахгүй (жагсаалтад ХҮЧИНГҮЙ гэж харагдана), гэхдээ `held` ч, `sold`
# ч биш тул нийлбэр, зогсонгийн тооцоо, зарах/нөөцлөх зам бүгд түүнийг алгасна.


def ser(a: models.BarterAsset, today: date | None = None):
    today = today or clock.today()
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


def _label(a: models.BarterAsset) -> str:
    """Аудитын мөрөнд гарах ТАНИХ нэр — «Машин · Приус 9957УКК»."""
    return f"{a.type} · {a.name}" if a.type else a.name


#: Бартерын талбарын МОНГОЛ нэр — /audit-ийн «Дэлгэрэнгүй» багана дээр.
#: (`services/audit.py` FIELDS_MN нь нөгөө агентын файл тул толио ЭНД авч
#: явлаа: түүхий `value_in`, `asking_price` гэсэн үг тэр багана руу гарах
#: ёсгүй — Отгоо эгчийн хувьд тэр нь хоосон нүд.)
FIELDS_MN = {"type": "төрөл", "name": "нэр", "detail": "дэлгэрэнгүй",
             "date_in": "орж ирсэн огноо", "value_in": "орж ирсэн үнэ",
             "asking_price": "зарах үнэ", "note": "тэмдэглэл"}


def _changes(before: dict, after: dict) -> str:
    """`audit.changes_text`-ийн бартерын хувилбар — талбарын нэр монголоор."""
    parts = [f"{FIELDS_MN.get(k, k)}: {audit.value_mn(before.get(k))} → {audit.value_mn(v)}"
             for k, v in after.items() if before.get(k) != v]
    return " · ".join(parts)


@router.get("/barter")
def list_assets(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    today = clock.today()
    assets = db.query(models.BarterAsset).order_by(
        models.BarterAsset.date_in.desc(), models.BarterAsset.id.desc()).all()
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
              user=Depends(money_guard)):
    if body.value_in <= 0:
        raise HTTPException(400, VALUE_IN_ERR)
    a = models.BarterAsset(**body.model_dump())
    db.add(a)
    db.commit()
    audit.log(db, user, "create", "barter", a.id,
              f"{_label(a)} · орж ирсэн {a.date_in} · {a.value_in:,.0f}₮")
    return ser(a)


class EditIn(BaseModel):
    type: str = "Бусад"
    name: str
    detail: str = ""
    #: ОРЖ ИРСЭН ОГНОО — дэлгэц дээр засвартай нүд байдаг ч сервер түүнийг
    #: ЧИМЭЭГҮЙ хаядаг байв: хүн огноогоо зассан, «Хадгаллаа» гэсэн, буцаж
    #: ирэхэд хуучин огноо. Одоо бичигдэнэ (ирээгүй бол хэвээр).
    date_in: date | None = None
    value_in: float
    asking_price: float = 0
    note: str = ""


@router.put("/barter/{aid}")
def edit_asset(aid: int, body: EditIn, db: Session = Depends(get_db),
               user=Depends(money_guard)):
    a = db.get(models.BarterAsset, aid)
    if not a:
        raise HTTPException(404, "Олдсонгүй")
    if a.status != "held":
        raise HTTPException(400, "Зарагдсан/нөөцөд орсон хөрөнгийг засахгүй")
    if body.value_in <= 0:
        raise HTTPException(400, VALUE_IN_ERR)
    data = {k: v for k, v in body.model_dump().items() if not (k == "date_in" and v is None)}
    before = {k: getattr(a, k) for k in data}
    for k, v in data.items():
        setattr(a, k, v)
    db.commit()
    audit.log(db, user, "update", "barter", a.id,
              f"{_label(a)} · {_changes(before, data)}")
    return ser(a)


@router.post("/barter/{aid}/sell")
def sell_asset(aid: int, body: SellIn, db: Session = Depends(get_db),
               user=Depends(money_guard)):
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
    diff = a.sold_amount - a.value_in
    audit.log(db, user, "sell", "barter", a.id,
              f"{_label(a)} · {a.sold_to or '—'} · {a.sold_amount:,.0f}₮ "
              f"(орж ирсэн {a.value_in:,.0f}₮ · зөрүү {diff:,.0f}₮)")
    return ser(a)


@router.post("/barter/{aid}/to-stock")
def to_stock(aid: int, body: ToStockIn, db: Session = Depends(get_db),
             user=Depends(money_guard)):
    """Материал хэлбэрийн бартерыг агуулахын нөөцөд оруулна."""
    a = db.get(models.BarterAsset, aid)
    if not a:
        raise HTTPException(404, "Олдсонгүй")
    if a.status != "held":
        raise HTTPException(400, "Энэ хөрөнгө аль хэдийн зарагдсан эсвэл нөөцөд орсон")
    if body.qty <= 0:
        raise HTTPException(400, "Тоо 0-ээс их байх ёстой")
    mat = db.get(models.Material, body.material_id)
    if not mat or not db.get(models.Grade, body.grade_id):
        raise HTTPException(404, "Материал эсвэл зэрэглэл олдсонгүй")
    st = stock_svc.row(db, body.material_id, body.grade_id)
    # `adjust` нь үлдэгдлийг ТОГТООДОГ тул одоогийн тоо дээр нэмж өгнө.
    stock_svc.adjust(db, mat, body.grade_id, (st.on_hand or 0) + body.qty,
                     user=user, source=STOCK_SOURCE,
                     note=f"Бартер: {_label(a)}", day=a.date_in)
    a.status = "stocked"
    a.note = (a.note + " · " if a.note else "") + f"Нөөцөд орсон: {body.qty:g}ш"
    db.commit()
    audit.log(db, user, "to_stock", "barter", a.id,
              f"{_label(a)} · {mat.name} · {body.qty:g}ш агуулахад")
    return ser(a)


# ---------------------------------------------------------------------------
# Бартер төлбөр ЦУЦЛАГДАХАД (routers/payments.py) автоматаар үүссэн хөрөнгө
# хамт хүчингүй болно. Бичилт нь БАРТЕРЫН мөр тул түүний аудитыг ЭНД бичнэ —
# нэг модуль, нэг бүртгэл: /audit дээр «Бартер» шүүлтүүр нь хөрөнгийн БҮХ
# явдлыг (үүсгэв · заслаа · зарав · нөөцөлсөн · хүчингүй) харуулна.
# ---------------------------------------------------------------------------

def void_asset(db: Session, user, asset: models.BarterAsset, reason: str) -> None:
    """Хадгалагдаагүй (`held`) хөрөнгийг хүчингүй болгож, аудитаа бичнэ."""
    if asset.status != "held":
        return
    asset.status = "voided"
    asset.note = (asset.note + " · " if asset.note else "") + f"Хүчингүй: {reason}"
    db.commit()
    audit.log(db, user, "void", "barter", asset.id,
              f"{_label(asset)} · {asset.value_in:,.0f}₮ — ХҮЧИНГҮЙ: {reason}")

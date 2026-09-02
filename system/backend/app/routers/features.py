"""Шинэ боломжууд: барьцаа, авлага цуглуулах, тооллого, аналитик, audit."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, auth, serializers
from ..services import billing, analytics, cron
from ..services import audit as audit_svc

router = APIRouter(prefix="/api")
fin = auth.require_roles("manager", "finance")


# ---------------- Барьцааны мөчлөг ----------------
class DepositSettleIn(BaseModel):
    date: date
    apply_amount: float = 0      # авлагад суутгах
    return_amount: float = 0     # харилцагчид буцаах
    note: str = ""


@router.post("/contracts/{cid}/settle-deposit")
def settle_deposit(cid: int, body: DepositSettleIn, db: Session = Depends(get_db),
                   user=Depends(fin)):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    if c.deposit <= 0:
        raise HTTPException(400, "Энэ гэрээнд барьцаа байхгүй")
    if c.deposit_status == "settled":
        raise HTTPException(400, "Барьцаа аль хэдийн тооцогдсон байна")
    total = body.apply_amount + body.return_amount
    if body.apply_amount < 0 or body.return_amount < 0:
        raise HTTPException(400, "Дүн сөрөг байж болохгүй")
    if total <= 0:
        raise HTTPException(400, "Суутгах эсвэл буцаах дүн оруулна уу")
    if total > c.deposit + 0.01:
        raise HTTPException(400, f"Барьцааны дүнгээс их байна (барьцаа {c.deposit:,.0f}₮)")

    if body.apply_amount > 0:
        p = models.Payment(client_id=c.client_id, contract_id=c.id, date=body.date,
                           amount=body.apply_amount, method="BANK",
                           note=f"Барьцаанаас суутгав (гэрээ №{c.no})")
        db.add(p)
        db.commit()
        # ⚠ АЛДАНГИ ЭНД Ч НЭХЭГДЭХГҮЙ (H2). Барьцааны тооцоо нь МӨНГӨ хөдөлгөх
        # үйлдэл — алданги нэхэх ШИЙДВЭР биш. Нэхэх нь гэрээний «Алданги нэхэх»
        # товчоор, тусдаа, ил явна.
        # Суутгал зөвхөн ҮНДСЭН өрийг хаана: "6 сая суутгав" → авлага яг 6 саяар буурна.
        billing.allocate_payment(db, p, principal_only=True)

    c.deposit_applied = body.apply_amount
    c.deposit_returned = body.return_amount
    c.deposit_settled_date = body.date
    c.deposit_status = "settled"
    db.commit()
    audit_svc.log(db, user, "settle_deposit", "contract", c.id,
                  f"барьцаа {c.deposit:,.0f}₮ — суутгасан {body.apply_amount:,.0f}₮, "
                  f"буцаасан {body.return_amount:,.0f}₮")
    return {"ok": True, "applied": body.apply_amount, "returned": body.return_amount}


# ---------------- Алданги НЭХЭХ (ил үйлдэл) ----------------
class BookPenaltyIn(BaseModel):
    as_of: date | None = None


@router.post("/contracts/{cid}/book-penalty")
def book_penalty(cid: int, body: BookPenaltyIn, db: Session = Depends(get_db),
                 user=Depends(fin)):
    """Гэрээний алдангийг ИЛ нэхнэ — системд алданги орох ГАНЦ хаалга.

    Отгоо эгч 20 жилийн Excel дээрээ алданги ганц ч удаа тооцоогүй: хуудас
    бүр дээр «гэрээний 4.2-т зааснаар алданга тооцно» гэж зарладаг ч хэзээ ч
    нэхдэггүй — тэр бол ХӨШҮҮРЭГ (R25). Систем нь урьд нь төлбөр бүртгэх
    агшинд өөрөө номжиж, өршөөсөн харилцагчийн үлдэгдлийг ӨСГӨДӨГ байв (H2).

    Одоо: тооцоолол нь ХАРАГДАНА («нэхэгдээгүй» шошготой), нэхэх нь ТҮҮНИЙ
    үйлдэл. Алдангийн хувь 0 бол нэхэлт ЯВАХГҮЙ — чимээгүй 0 буцаах нь
    «машин үйлдлийг минь тоосонгүй» гэж уншигдана, тиймээс 400-аар хэлнэ.
    """
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    if c.penalty_percent <= 0:
        raise HTTPException(400, "Энэ гэрээнд алдангийн хувь 0 — алданги нэхэгдэхгүй. "
                                 "Нэхэх бол эхлээд гэрээний алдангийн хувийг тохируулна уу.")
    as_of = body.as_of or date.today()
    if as_of < c.start_date:
        raise HTTPException(400, "Огноо гэрээний эхлэлээс өмнө байна")
    billing.ensure_invoices(db, c, as_of)
    db.refresh(c)
    res = billing.charge_contract_penalty(db, c, as_of, user_name=user.name)
    audit_svc.log(db, user, "book_penalty", "contract", c.id,
                  f"{c.client.name} · гэрээ №{c.no} · {as_of} өдрөөр "
                  f"{res['total']:,.0f}₮ алданги нэхэв ({len(res['rows'])} нэхэмжлэл)")
    return res


# ---------------- Авлага цуглуулах ----------------
class NoteIn(BaseModel):
    date: date
    kind: str = "call"
    note: str = ""
    promise_date: date | None = None
    promise_amount: float = 0


class NotePatch(BaseModel):
    status: str


def note_ser(n: models.CollectionNote):
    return {"id": n.id, "client_id": n.client_id, "date": str(n.date), "kind": n.kind,
            "note": n.note, "promise_date": str(n.promise_date) if n.promise_date else None,
            "promise_amount": n.promise_amount, "status": n.status, "user_name": n.user_name}


@router.get("/collections")
def collections(db: Session = Depends(get_db), user=Depends(fin)):
    return analytics.collections(db)


@router.post("/invoices/generate")
def generate_invoices(db: Session = Depends(get_db), user=Depends(fin)):
    """Өдөр тутмын нэхэмжлэлийг ГАРААР хөдөлгөх (H9).

    Давхрага (`services/cron.py`) өдөр бүр 06:00-д ЯГ ЭНЭ функцийг дууддаг —
    хоёр өөр «хувилбар» нэхэмжлэл байхгүй. Сервер унтарсан өдөр байсан бол
    энэ товчлуур нөхөж гүйцээнэ. Append-only тул хэдэн ч удаа дуудаж болно.
    """
    return cron.generate_all(db)


@router.post("/clients/{cid}/notes")
def add_note(cid: int, body: NoteIn, db: Session = Depends(get_db), user=Depends(fin)):
    if not db.get(models.Client, cid):
        raise HTTPException(404, "Харилцагч олдсонгүй")
    if body.kind not in ("call", "visit", "message", "other"):
        raise HTTPException(400, "Буруу төрөл")
    n = models.CollectionNote(client_id=cid, user_name=user.name, **body.model_dump())
    db.add(n)
    db.commit()
    audit_svc.log(db, user, "create", "collection_note", n.id,
                  f"харилцагч #{cid}: {audit_svc.value_mn(body.kind)} · {body.note[:80]}")
    return note_ser(n)


@router.patch("/notes/{nid}")
def patch_note(nid: int, body: NotePatch, db: Session = Depends(get_db), user=Depends(fin)):
    n = db.get(models.CollectionNote, nid)
    if not n:
        raise HTTPException(404, "Олдсонгүй")
    if body.status not in ("open", "kept", "broken"):
        raise HTTPException(400, "Буруу төлөв")
    n.status = body.status
    db.commit()
    audit_svc.log(db, user, "update", "collection_note", n.id,
                  f"төлөв → {audit_svc.value_mn(body.status)}")
    return note_ser(n)


# ---------------- Утсаар тооллого ----------------
class StocktakeLine(BaseModel):
    material_id: int
    grade_id: int
    counted: float


class StocktakeIn(BaseModel):
    date: date
    note: str = ""
    lines: list[StocktakeLine]


@router.post("/stock/stocktake")
def stocktake(body: StocktakeIn, db: Session = Depends(get_db),
              user=Depends(auth.require_roles("manager", "factory"))):
    """Олон мөрийг нэг дор тоолж залруулна (утсанд зориулсан)."""
    if not body.lines:
        raise HTTPException(400, "Мөр оруулна уу")
    adjusted = 0
    diff_total = 0.0
    details = []
    for ln in body.lines:
        if ln.counted < 0:
            raise HTTPException(400, "Тоо сөрөг байж болохгүй")
        st = db.query(models.Stock).filter_by(material_id=ln.material_id,
                                              grade_id=ln.grade_id).first()
        if not st:
            st = models.Stock(material_id=ln.material_id, grade_id=ln.grade_id, on_hand=0)
            db.add(st)
            db.flush()
        diff = ln.counted - (st.on_hand or 0)
        if abs(diff) < 0.001:
            continue
        m = db.get(models.Material, ln.material_id)
        g = db.get(models.Grade, ln.grade_id)
        details.append(f"{m.name if m else '?'} ({g.code if g else '?'}): "
                       f"{st.on_hand:g} → {ln.counted:g} ({diff:+g})")
        st.on_hand = ln.counted
        diff_total += diff
        adjusted += 1
    db.commit()
    if adjusted:
        audit_svc.log(db, user, "stocktake", "stock", None,
                      f"{body.date} · {body.note} · " + " | ".join(details))
    return {"ok": True, "adjusted": adjusted, "diff_total": round(diff_total), "details": details}


# ---------------- Аналитик ----------------
@router.get("/reports/materials")
def materials_report(months: int = 6, db: Session = Depends(get_db), user=Depends(fin)):
    return analytics.material_yield(db, months)


@router.get("/reports/forecast")
def forecast(db: Session = Depends(get_db), user=Depends(fin)):
    return analytics.cash_forecast(db)


# ---------------- Audit ----------------
@router.get("/audit")
def audit_list(limit: int = 200, entity: str = "", db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager"))):
    q = db.query(models.AuditLog)
    if entity:
        q = q.filter(models.AuditLog.entity == entity)
    rows = q.order_by(models.AuditLog.id.desc()).limit(min(limit, 500)).all()
    return [{"id": r.id, "user_name": r.user_name, "action": r.action, "entity": r.entity,
             "entity_id": r.entity_id, "detail": r.detail,
             "at": str(r.created_at)[:19]} for r in rows]

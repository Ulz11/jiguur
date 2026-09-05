"""Харилцагч + бүрэн профайл."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas, serializers, auth
from ..services import billing
from ..services import audit as audit_svc
from ..services import contacts as contacts_svc
from ..services import entries as entries_svc
from .barter import ser as barter_ser

router = APIRouter(prefix="/api")
fin = auth.require_roles("manager", "finance")


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


# ---------------- ГАРЫН ҮСЭГТНҮҮД (№72, 73) ----------------
#
# Бутангууд: Төслийн менежер Н.Батцоож 96590908 · Нярав Н.Соль 99966285 ·
# Захирал С.Лхагвасүрэн 99113579 — ГУРАВ. `Client.person`/`phone` нь тэднээс
# ЗӨВХӨН НЭГИЙГ барьдаг тул үлдсэн нь унадаг байв.
#
# ⚠ ЭНЭ МОДУЛЬД урьд нь audit ОГТ байгаагүй: харилцагч үүсгэх/засах нь
# бүртгэлгүй өнгөрдөг. Холбоо барих хүмүүс нь эндээс эхэлж бүртгэгдэнэ
# (`client` биетийн create/edit нь ХЭВЭЭР — тусад нь засварлах ажил).

class ContactIn(BaseModel):
    name: str
    role: str = ""
    phone: str = ""
    phone2: str = ""
    note: str = ""


def _client_or_404(db: Session, cid: int) -> models.Client:
    c = db.get(models.Client, cid)
    if not c:
        raise HTTPException(404, "Харилцагч олдсонгүй")
    return c


def _contact_or_404(db: Session, kid: int) -> models.ClientContact:
    c = db.get(models.ClientContact, kid)
    if not c:
        raise HTTPException(404, "Холбоо барих хүн олдсонгүй")
    return c


@router.get("/clients/{cid}/contacts")
def list_contacts(cid: int, db: Session = Depends(get_db), user=Depends(fin)):
    _client_or_404(db, cid)
    return contacts_svc.contacts_of(db, cid)


@router.post("/clients/{cid}/contacts")
def add_contact(cid: int, body: ContactIn, db: Session = Depends(get_db),
                user=Depends(fin)):
    cl = _client_or_404(db, cid)
    if not body.name.strip():
        raise HTTPException(400, "Хүний нэр заавал бичигдэнэ")
    k = models.ClientContact(client_id=cid, name=body.name.strip(),
                             role=body.role.strip(), phone=body.phone.strip(),
                             phone2=body.phone2.strip(), note=body.note, active=True)
    db.add(k)
    db.commit()
    db.refresh(k)
    audit_svc.log(db, user, "create", "client_contact", k.id,
                  f"{cl.name} · {contacts_svc.detail(k)}")
    return contacts_svc.serialize(k)


@router.put("/contacts/{kid}")
def edit_contact(kid: int, body: ContactIn, db: Session = Depends(get_db),
                 user=Depends(fin)):
    k = _contact_or_404(db, kid)
    if not body.name.strip():
        raise HTTPException(400, "Хүний нэр заавал бичигдэнэ")
    before = contacts_svc.detail(k)
    k.name = body.name.strip()
    k.role = body.role.strip()
    k.phone = body.phone.strip()
    k.phone2 = body.phone2.strip()
    k.note = body.note
    db.commit()
    db.refresh(k)
    audit_svc.log(db, user, "update", "client_contact", k.id,
                  f"{k.client.name} · {before} → {contacts_svc.detail(k)}")
    return contacts_svc.serialize(k)


@router.post("/contacts/{kid}/deactivate")
def deactivate_contact(kid: int, db: Session = Depends(get_db), user=Depends(fin)):
    """УСТГАЛ БАЙХГҮЙ: ажлаас гарсан хүн мөрөндөө үлдэж, зөвхөн залгах
    жагсаалтаас гарна («Захирал байсан Лхагвасүрэн» гэдэг нь түүх)."""
    k = _contact_or_404(db, kid)
    if not k.active:
        raise HTTPException(409, "Энэ хүн аль хэдийн идэвхгүй болсон байна")
    k.active = False
    db.commit()
    db.refresh(k)
    audit_svc.log(db, user, "deactivate", "client_contact", k.id,
                  f"{k.client.name} · {contacts_svc.detail(k)} — идэвхгүй болгов")
    return contacts_svc.serialize(k)


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
    # Хүлээгдэж буй төлбөр — идэвхтэй түрээсийн гэрээнүүдийн одоогийн циклийн
    # ТӨСӨӨЛӨЛ. Дашбоардын самбартай ЯГ нэг эх сурвалжаас (serializers.upcoming_row).
    upcoming = sorted((u for u in (serializers.upcoming_row(ct, today) for ct in c.contracts) if u),
                      key=lambda u: u["expected_date"])
    # ХҮЧИНГҮЙ болсон нэхэмжлэл ч ЭНД гарна — цуцлалт бол устгал БИШ (H1).
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
        # ХУУЧИН ҮЛДЭГДЭЛ нь гэрээ ДҮР ЭСГЭСЭН шилжүүлгийн дүн (`OB-…`).
        # «Гэрээ №OB-2 эхлэв» гэдэг нь гурван худал нэг мөрөнд: гэрээ ч биш,
        # тэр дугаартай ч биш, тэр өдөр эхэлсэн ч биш. Отгоо эгч ийм гэрээнд
        # гарын үсэг зурж байгаагүй тул хэлхээ дээр ҮНЭНЭЭ хэлнэ.
        if ct.no.startswith("OB-"):
            opening = sum(i.total for i in ct.invoices if i.voided_at is None)
            timeline.append({"date": str(ct.start_date), "kind": "contract",
                             "title": f"Хуучин үлдэгдэл бүртгэв — {opening:,.0f}₮",
                             "sub": "Хуучин системээс шилжсэн"})
        else:
            timeline.append({"date": str(ct.start_date), "kind": "contract",
                             "title": f"Гэрээ №{ct.no} эхлэв",
                             "sub": ("Түрээс" if ct.type == "rent" else "Худалдаа") +
                                    (f" · барьцаа {ct.deposit:,.0f}₮" if ct.deposit else "")})
        for mv in ct.movements:
            if mv.status != "done":
                continue
            qty = sum(l.qty for l in mv.lines)
            # Шинэ төрөл нэмэгдэхэд KeyError-оор хуудас бүхэлдээ унахгүй:
            # нэргүй төрөл нь дугаараараа л гарна.
            kind = {"ISSUE": "Ачилт", "RETURN": "Буцаалт", "WRITEOFF": "Акт",
                    "SALE": "Худалдаа болгов"}.get(mv.type, mv.type)
            charge = sum(l.repair_fee + l.writeoff_fee + l.sale_fee for l in mv.lines)
            sub = " · ".join(f"{mmap.get(l.material_id)} ×{l.qty:g}" for l in mv.lines[:3])
            if charge:
                sub += f" · төлбөр {charge:,.0f}₮"
            # Цуцлагдсан хөдөлгөөн хэлхээнээс алга болохгүй (тэр өдөр бичилт
            # хийгдсэн нь үнэн) — гэхдээ энд ХҮЧИНГҮЙ гэдгээ хэлнэ.
            if mv.voided_at is not None:
                sub += " · ХҮЧИНГҮЙ" + (f" ({mv.void_reason})" if mv.void_reason else "")
            timeline.append({"date": str(mv.date), "kind": mv.type.lower(),
                             "title": f"{kind} — {qty:g}ш · №{ct.no}", "sub": sub,
                             "voided": mv.voided_at is not None})
    for p in payments:
        m = {"CASH": "Бэлэн", "BANK": "Данс", "BARTER": "Бартер",
             "CREDIT": "Тооцоогоор хаасан"}.get(p["method"], p["method"])
        sub = m + (f" · {p['barter_desc']}" if p["barter_desc"] else "")
        # Цуцлагдсан төлбөр он цагийн хэлхээнээс АЛГА БОЛОХГҮЙ — тэр өдөр
        # бичилт хийгдсэн нь үнэн. Гэхдээ хэлхээ дээр л ХҮЧИНГҮЙ гэдгээ хэлнэ,
        # эс бөгөөс жагсаалт дээр зурагдсан мөнгө энд хэвийн байдлаар дахин
        # тоологдож харагдана.
        if p["voided"]:
            sub += " · ХҮЧИНГҮЙ" + (f" ({p['void_reason']})" if p["void_reason"] else "")
        timeline.append({"date": p["date"], "kind": "payment",
                         "title": f"Төлбөр — {p['amount']:,.0f}₮", "sub": sub,
                         "voided": p["voided"]})
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
            # ГАРЫН ҮСЭГТНҮҮД (№72, 73) — карт нь тусдаа хүсэлт хийхгүй.
            # Идэвхгүй болсон нь ч ХАРАГДАНА (устгал байхгүй).
            "contacts": contacts_svc.contacts_of(db, cid),
            "contracts": contracts, "invoices": invoices, "upcoming": upcoming,
            "payments": payments, "files": files, "barter": barter, "notes": notes,
            # ТҮРЭЭС БИШ бичилтүүд (H11 / P1-16) — олгосон зээл, ажилчдын
            # цалин, кран, харилцагч хоорондын тооцоо. Хүчингүй болсон нь ч
            # ХАРАГДАНА (H1).
            "entries": entries_svc.entries_of(db, cid),
            "timeline": timeline[:50]}

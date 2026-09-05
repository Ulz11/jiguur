"""Харилцагч + бүрэн профайл."""
import re
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas, serializers, auth
from ..services import billing
from ..services import audit as audit_svc
from ..services import contacts as contacts_svc
from ..services import entries as entries_svc
from ..services import pdfstatement
from .barter import ser as barter_ser

router = APIRouter(prefix="/api")
fin = auth.require_roles("manager", "finance")


def _safe(name: str) -> str:
    """Файлын нэрэнд оруулж болох тэмдэгт л үлдээнэ (`contracts._safe`-тэй ижил).

    Отгоогийн огноо нь зураастай (2026-03-20) тул энэ нь ихэвчлэн юу ч
    хийхгүй — гэхдээ `/` агуулсан нэр Content-Disposition-ыг эвдэнэ.
    """
    return re.sub(r"[^0-9A-Za-z._-]+", "-", name).strip("-") or "file"


@router.get("/clients")
def list_clients(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    today = date.today()
    for c in db.query(models.Contract).filter_by(status="active").all():
        billing.ensure_invoices(db, c, today)
    return [serializers.client_row(c, today)
            for c in db.query(models.Client).order_by(models.Client.name).all()]


# ---------------- ДАВХАР ХАРИЛЦАГЧ (нэг нэр — нэг мөр) ----------------
#
# Урьд нь `POST /clients` ЮУ Ч шалгадаггүй байв: «Бутангууд ХХК», «бутангууд
# ххк», «Бутангууд  ХХК» гурав нь ГУРВАН харилцагч болж бүртгэгдэнэ. Тэр
# агшнаас эхлэн авлага гурав хуваагдаж, төлбөр нь аль нэг дээр нь сууж,
# «Авлагын үлдэгдэл» гурван хуудсан дээр гурван өөр тоо болно — Отгоо эгчийг
# Excel рүү буцаадаг яг тэр мэдрэмж. Устгал нь эмчилгээ БИШ (H1): үүсэхээс
# нь өмнө зогсооно.
#
# xlsx оруулагч (`routers/reports.py`) нь ӨӨРИЙН алгасах журамтай хэвээр:
# багц оруулалт нь нэг давхардлаас болж бүхэлдээ унах ёсгүй.

NAME_REQUIRED = "Харилцагчийн нэр заавал"


def _norm(value: str) -> str:
    """Харьцуулах хэлбэр — том/жижиг үсэг, давхар зай, захын зай ялгагдахгүй."""
    return " ".join((value or "").split()).casefold()


def _duplicate(db: Session, name: str, reg: str) -> tuple[models.Client | None, str]:
    """Ижил НЭР эсвэл ижил РЕГИСТРТЭЙ харилцагч байна уу — (мөр, талбар).

    Мөрүүдийг Python талд алхана: SQL-ийн `lower()` нь давхар зайг цэвэрлэдэггүй,
    кириллийн `casefold`-ыг ч SQLite баталгаажуулдаггүй. Харилцагчийн тоо
    хэдэн зуугаар хэмжигдэх тул энэ нь бүртгэл бүрд нэг хямд гүйлт.
    """
    key = _norm(name)
    reg_key = _norm(reg)
    for c in db.query(models.Client).order_by(models.Client.id).all():
        if key and _norm(c.name) == key:
            return c, "name"
        if reg_key and _norm(c.reg) == reg_key:
            return c, "reg"
    return None, ""


def _duplicate_409(existing: models.Client, field: str) -> HTTPException:
    """409-ийн БҮТЭЦТЭЙ хариу.

    Биет нь: `{"detail": {"msg": <өгүүлбэр>, "existing_id": <id>,
    "existing_name": <нэр>, "field": "name" | "reg"}}`.

    `msg` гэсэн нэр нь САНААТАЙ: дэлгэцийн `lib/errors.ts` объект ирвэл
    түүнийг л уншиж хүнд харуулдаг тул хуучин мөр хэвээр гарна. `existing_id`
    нь «тэр харилцагч руу ор» гэсэн холбоос зурах боломжийг үлдээнэ — «аль
    хэдийн бүртгэлтэй» гэдэг нь хаана байгааг хэлэхгүй бол мухардмал хана.
    """
    what = "нэртэй" if field == "name" else "регистртэй"
    return HTTPException(status_code=409, detail={
        "msg": f"Энэ {what} харилцагч аль хэдийн бүртгэлтэй: "
               f"{existing.name} (№{existing.id})",
        "existing_id": existing.id, "existing_name": existing.name,
        "field": field})


@router.post("/clients")
def add_client(body: schemas.ClientIn, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager", "finance"))):
    """Шинэ харилцагч. ДАВХАРДВАЛ 409 (`_duplicate_409`-ийн биетийг үзнэ үү)."""
    data = body.model_dump()
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, NAME_REQUIRED)
    data["name"] = name
    data["reg"] = (data.get("reg") or "").strip()
    existing, field = _duplicate(db, name, data["reg"])
    if existing is not None:
        raise _duplicate_409(existing, field)
    c = models.Client(**data)
    db.add(c)
    db.commit()
    db.refresh(c)
    audit_svc.log(db, user, "create", "client", c.id,
                  f"{c.name}" + (f" · ТТД {c.reg}" if c.reg else ""))
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


@router.post("/clients/{cid}/contacts/{kid}/reactivate")
def reactivate_contact(cid: int, kid: int, db: Session = Depends(get_db),
                       user=Depends(fin)):
    """БУЦАЖ ИРСЭН ХҮН — `deactivate`-ийн толин тусгал.

    Хүн ажлаасаа гарч, дараа нь буцаж ирдэг; андуурч идэвхгүй болгосон ч
    байж болно. Хоёр тохиолдолд ч ШИНЭ мөр үүсгэх нь ХОЁР Н.Соль төрүүлж,
    аль нь одоогийнх болохыг мэдэх аргагүй болгоно.

    Хаяг нь ХАРИЛЦАГЧААР дамжина (`deactivate` шиг ганцаараа биш): өөр
    харилцагчийн хүнийг энэ хаягаар сэргээх боломжгүй — 404.
    """
    cl = _client_or_404(db, cid)
    k = _contact_or_404(db, kid)
    if k.client_id != cid:
        # «Өөр хүний хүн» гэдэг нь ЭНЭ хаяг дээр БАЙХГҮЙ гэсэн үг.
        raise HTTPException(404, "Холбоо барих хүн олдсонгүй")
    if k.active:
        raise HTTPException(409, "Энэ хүн идэвхтэй байна")
    k.active = True
    db.commit()
    db.refresh(k)
    audit_svc.log(db, user, "reactivate", "client_contact", k.id,
                  f"{cl.name} · {contacts_svc.detail(k)} — идэвхтэй болгов")
    return contacts_svc.serialize(k)


# ---------------- ХООСОН ХАРИЛЦАГЧИЙГ УСТГАХ ----------------
#
# H1 «устгал байхгүй» нь ТҮҮХИЙГ хамгаалдаг дүрэм: болсон явдал мөрөндөө
# үлдэнэ. ХООСОН харилцагчид түүх БАЙХГҮЙ — андуурч бичсэн нэр, хоёр дахин
# оруулсан мөр, туршилтын бичилт. Тэднийг мөнхөд үлдээх нь жагсаалтыг
# бохирдуулж, хайлтыг худал болгоно. Тиймээс хаалга нь НАРИЙН: ганц ч
# наалдсан зүйлгүй бол л онгойно.

#: Наалдсан зүйлийн үг — тоолол бүр өөрийн нэртэй («2 гэрээ, 1 төлбөр»).
_ATTACHED_MN = {"contracts": "гэрээ", "payments": "төлбөр", "entries": "бичилт",
                "notes": "тэмдэглэл", "files": "файл", "barter": "бартер хөрөнгө"}


def _attached(db: Session, cid: int) -> list[str]:
    """Харилцагчид наалдсан зүйлс — «2 гэрээ (№OB-3)», «1 төлбөр» гэх мэт.

    Хоосон жагсаалт = устгаж болно. ХҮЧИНГҮЙ болсон мөр ч ТООЛОГДОНО:
    цуцлагдсан төлбөр бол түүх, түүхтэй харилцагч бол хоосон биш.
    """
    parts: list[str] = []
    contracts = (db.query(models.Contract).filter_by(client_id=cid)
                 .order_by(models.Contract.id).all())
    if contracts:
        nos = ", ".join(f"№{c.no}" for c in contracts[:3])
        if len(contracts) > 3:
            nos += " …"
        parts.append(f"{len(contracts)} {_ATTACHED_MN['contracts']} ({nos})")
    counts = [
        ("payments", db.query(models.Payment).filter_by(client_id=cid).count()),
        ("entries", db.query(models.ClientEntry).filter_by(client_id=cid).count()),
        ("notes", db.query(models.CollectionNote).filter_by(client_id=cid).count()
         + db.query(models.Note).filter_by(entity_type="client", entity_id=cid).count()),
        ("files", db.query(models.Attachment)
         .filter_by(entity_type="client", entity_id=cid).count()),
        ("barter", db.query(models.BarterAsset).filter_by(client_id=cid).count()),
    ]
    parts += [f"{n} {_ATTACHED_MN[key]}" for key, n in counts if n]
    return parts


@router.delete("/clients/{cid}")
def delete_client(cid: int, db: Session = Depends(get_db),
                  user=Depends(auth.require_roles("manager"))):
    """ХООСОН харилцагчийг устгана. Наалдсан зүйлтэй бол 409, ЮУ наалдсаныг НЭРЛЭНЭ.

    Гарын үсэгтнүүд нь харилцагчийнхаа хамт явна: тэд өөрийн гэсэн амьдралгүй
    (`client_id`-гүй холбоо барих хүн гэж байхгүй).
    """
    c = _client_or_404(db, cid)
    blockers = _attached(db, cid)
    if blockers:
        raise HTTPException(409, f"Энэ харилцагчид {', '.join(blockers)} "
                                 f"бүртгэлтэй тул устгах боломжгүй")
    name, reg = c.name, c.reg
    kids = db.query(models.ClientContact).filter_by(client_id=cid).all()
    for k in kids:
        db.delete(k)
    db.delete(c)
    db.commit()
    audit_svc.log(db, user, "delete", "client", cid,
                  f"{name}" + (f" · ТТД {reg}" if reg else "")
                  + (f" · {len(kids)} холбоо барих хүн" if kids else "")
                  + " — устгав (наалдсан бичилтгүй)")
    return {"ok": True, "deleted_contacts": len(kids)}


# ---------------- ТООЦООНЫ ХУУЛГА (PDF) ----------------

@router.get("/clients/{cid}/statement-pdf")
def client_statement_pdf(cid: int,
                         d_from: date | None = Query(None, alias="from"),
                         d_to: date | None = Query(None, alias="to"),
                         db: Session = Depends(get_db), user=Depends(fin)):
    """ХАРИЛЦАГЧИЙН ХУУДАС — түүний Excel хуудсыг орлох баримт.

    `from` хоосон бол ХАМГИЙН ЭХНИЙ явдлаас (бүтэн түүх), `to` хоосон бол
    өнөөдөр хүртэл. Хугацаа урвуу байвал 400.

    Мөнгөний баримт тул үйлдвэрийн даргад хаалттай (`fin`) — хаалт нь
    ЭРХИЙН зураас, харагдацынх биш (UI-ЗАРЧИМ §4).
    """
    c = _client_or_404(db, cid)
    today = date.today()
    # Явагдаж буй циклийн хуримтлал ёроолын тоонд ордог тул нэхэмжлэл нь
    # ЭНЭ агшинд бэлэн байх ёстой — эс бөгөөс дуусчихсан цикл «нэхэмжлэгдээгүй»
    # мөрөнд орж, дэлгэцтэй зөрнө.
    for ct in c.contracts:
        billing.ensure_invoices(db, ct, today)
    db.refresh(c)
    d_to = d_to or today
    if d_from is None:
        d_from = pdfstatement.first_event_date(db, c) or d_to
    if d_from > d_to:
        raise HTTPException(400, "Эхлэх огноо дуусах огнооноос хойш байна")
    pdf = pdfstatement.client_statement_pdf(db, c, d_from, d_to)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="huulga-{cid}-'
                             f'{_safe(str(d_from))}-{_safe(str(d_to))}.pdf"'})


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
                             "sub": "Excel дэвтрээс шилжсэн"})
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

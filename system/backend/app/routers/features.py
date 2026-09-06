"""Шинэ боломжууд: барьцаа, авлага цуглуулах, тооллого, аналитик, audit."""
from datetime import date, datetime, timedelta, timezone
from datetime import date as _date_t   # `date` нэртэй ТАЛБАР төрлөө далдална
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import clock
from ..db import get_db
from .. import models, auth, serializers
from ..services import billing, analytics, cron
from ..services import audit as audit_svc
from ..services import deposit as deposit_svc
from ..services import entries as entries_svc
from ..services import stock as stock_svc
from . import notes as notes_router

router = APIRouter(prefix="/api")
fin = auth.require_roles("manager", "finance")


# ---------------- Барьцааны ГҮЙДЭГ ДЭВТЭР (H8 / P1-11) ----------------
#
# Зулаа-3!G30 = «=20000000-8265000+3000000+3000000+10000000» — барьцаа нь
# НЭГ НҮД биш, ТАВАН ШИЙДВЭР. Дэвтэр нь тэдгээрийг мөр мөрөөр нь барина;
# `Contract.deposit` нь тэдний нийлбэрийн КЭШ болж үлдэнэ (services/deposit.py).

class DepositEventIn(BaseModel):
    kind: str                    # lodge | topup | apply | return
    date: date
    amount: float
    note: str = ""


class VoidIn(BaseModel):
    reason: str = ""


def _contract_or_404(db: Session, cid: int) -> models.Contract:
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    return c


@router.get("/contracts/{cid}/deposit-events")
def deposit_events(cid: int, db: Session = Depends(get_db), user=Depends(fin)):
    return deposit_svc.ledger(_contract_or_404(db, cid))


@router.post("/contracts/{cid}/deposit-events")
def add_deposit_event(cid: int, body: DepositEventIn, db: Session = Depends(get_db),
                      user=Depends(fin)):
    c = _contract_or_404(db, cid)
    try:
        ev = deposit_svc.add_event(db, c, body.kind, body.date, body.amount,
                                   body.note, getattr(user, "name", "") or "")
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    audit_svc.log(db, user, "create", "deposit_event", ev.id,
                  f"{c.client.name} · гэрээ №{c.no} · "
                  f"{deposit_svc.KIND_MN[ev.kind]} {ev.amount:,.0f}₮ · "
                  f"барьцааны үлдэгдэл {c.deposit:,.0f}₮"
                  + (f" · {ev.note}" if ev.note else ""))
    return {"event": deposit_svc.serialize(ev), **deposit_svc.ledger(c)}


@router.post("/deposit-events/{eid}/void")
def void_deposit_event(eid: int, body: VoidIn, db: Session = Depends(get_db),
                       user=Depends(fin)):
    ev = db.get(models.DepositEvent, eid)
    if not ev:
        raise HTTPException(404, "Барьцааны бичилт олдсонгүй")
    if ev.voided_at is not None:
        raise HTTPException(409, "Энэ бичилт аль хэдийн хүчингүй болсон байна")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")
    c = ev.contract
    res = deposit_svc.void_event(db, ev, reason, getattr(user, "name", "") or "")
    audit_svc.log(db, user, "void", "deposit_event", ev.id,
                  f"{c.client.name} · гэрээ №{c.no} · "
                  f"{deposit_svc.KIND_MN[ev.kind]} {ev.amount:,.0f}₮ — ХҮЧИНГҮЙ: {reason} · "
                  f"барьцааны үлдэгдэл {res['balance']:,.0f}₮")
    return {"ok": True, **deposit_svc.ledger(c)}


# ---------------- Барьцааны нэг дороо тооцоо (хуучин хаалга) ----------------
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

    # ⚠ АЛДАНГИ ЭНД Ч НЭХЭГДЭХГҮЙ (H2). Барьцааны тооцоо нь МӨНГӨ хөдөлгөх
    # үйлдэл — алданги нэхэх ШИЙДВЭР биш. Нэхэх нь гэрээний «Алданги нэхэх»
    # товчоор, тусдаа, ил явна.
    #
    # Энэ хаалга нь ХЭВЭЭР: нэг дороо «суутга + буцаа» гэдэг нь түүний ЗУРШИЛ.
    # Гэвч цаана нь одоо ДЭВТЭР рүү хоёр мөр бичигдэнэ — үр дүн нь ижил, түүх
    # нь үлдэнэ (H8).
    held = c.deposit
    try:
        if body.apply_amount > 0:
            deposit_svc.add_event(db, c, "apply", body.date, body.apply_amount,
                                  body.note, getattr(user, "name", "") or "")
        if body.return_amount > 0:
            deposit_svc.add_event(db, c, "return", body.date, body.return_amount,
                                  body.note, getattr(user, "name", "") or "")
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    audit_svc.log(db, user, "settle_deposit", "contract", c.id,
                  f"барьцаа {held:,.0f}₮ — суутгасан {body.apply_amount:,.0f}₮, "
                  f"буцаасан {body.return_amount:,.0f}₮")
    return {"ok": True, "applied": body.apply_amount, "returned": body.return_amount}


# ---------------- Харилцагчийн ТҮРЭЭС БИШ бичилт (H11 / P1-16) ----------------
#
# Бутангуудын дансанд 164,492,000₮ олгосон зээл, 2,800,000₮ ажилчдын цалин;
# Ашид Донжийн сарын нүдэнд 10,000,000₮ кран; самбарын мөр 24-д Өнө Ордтой
# хийсэн 139,648,000₮-ийн тооцоо сууна. Эдгээр нь ШИНЭ үлдэгдлийн эх сурвалж
# БИШ — авлагын хуучин зам дээр (нэхэмжлэл / төлбөр) материалчлагдана.

class ClientEntryIn(BaseModel):
    date: date
    amount: float                # ТЭМДЭГТЭЙ: + өр нэмнэ, − кредит
    kind: str                    # advance | service | transfer | adjustment
    label: str
    note: str = ""
    ref: str = ""


@router.get("/clients/{cid}/entries")
def client_entries(cid: int, db: Session = Depends(get_db), user=Depends(fin)):
    if not db.get(models.Client, cid):
        raise HTTPException(404, "Харилцагч олдсонгүй")
    return entries_svc.entries_of(db, cid)


@router.post("/clients/{cid}/entries")
def add_client_entry(cid: int, body: ClientEntryIn, db: Session = Depends(get_db),
                     user=Depends(fin)):
    cl = db.get(models.Client, cid)
    if not cl:
        raise HTTPException(404, "Харилцагч олдсонгүй")
    try:
        e = entries_svc.create_entry(db, cl, body.date, body.amount, body.kind,
                                     body.label, body.note, body.ref,
                                     getattr(user, "name", "") or "")
    except ValueError as ex:
        raise HTTPException(400, str(ex)) from ex
    row = entries_svc.serialize(db, e)
    audit_svc.log(db, user, "create", "client_entry", e.id,
                  f"{cl.name} · {entries_svc.KIND_MN[e.kind]} · "
                  f"{'авлага нэмэв' if e.amount > 0 else 'кредит бичив'} "
                  f"{abs(e.amount):,.0f}₮ · {e.label}"
                  + (f" · эх сурвалж: {e.ref}" if e.ref else ""))
    return {"entry": row, "receivable": round(billing.client_receivable(cl)["total"])}


@router.post("/client-entries/{eid}/void")
def void_client_entry(eid: int, body: VoidIn, db: Session = Depends(get_db),
                      user=Depends(fin)):
    e = db.get(models.ClientEntry, eid)
    if not e:
        raise HTTPException(404, "Бичилт олдсонгүй")
    if e.voided_at is not None:
        raise HTTPException(409, "Энэ бичилт аль хэдийн хүчингүй болсон байна")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")
    cl = e.client
    entries_svc.void_entry(db, e, reason, getattr(user, "name", "") or "")
    audit_svc.log(db, user, "void", "client_entry", e.id,
                  f"{cl.name} · {entries_svc.KIND_MN.get(e.kind, e.kind)} "
                  f"{abs(e.amount):,.0f}₮ · {e.label} — ХҮЧИНГҮЙ: {reason}")
    db.refresh(cl)
    return {"ok": True, "entry": entries_svc.serialize(db, e),
            "receivable": round(billing.client_receivable(cl)["total"])}


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
    as_of = body.as_of or clock.today()
    if as_of < billing.billing_origin(c):
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
    """`PATCH /notes/{id}`-ийн ХОЁР салааны нэгдсэн бие.

    Тэр хаяг дээр урьд нь ЗӨВХӨН авлагын амлалтын төлөв суудаг байв. Захын
    тэмдэглэлийн давхарга (P1-22) ижил хаягийг нэхэх тул хоёр route бүртгэвэл
    нэг нь ЧИМЭЭГҮЙ хучигдана. `status` ирвэл ХУУЧИН зам, эс бөгөөс ШИНЭ.
    """
    status: str | None = None
    text: str | None = None
    flag: bool | None = None
    date: _date_t | None = None


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

    ⚠ Гараар дарсан гүйлт ч МӨР ҮЛДЭЭНЭ. Урьд нь энэ товч нь бүртгэлд огт
    харагддаггүй байв: «энэ нэхэмжлэл хаанаас гарав?» гэсэн асуултад cron
    гэсэн хариулт байдаг ч, хүн дарсан гүйлт нь эзэнгүй үлддэг. Мөрийн
    ӨГҮҮЛБЭР нь cron-ынхтой ЯГ ижил (`cron.run_line`) — зөвхөн ХЭН нь өөр.
    """
    res = cron.generate_all(db)
    audit_svc.log(db, user, "generate", "invoice", None, cron.run_line(res))
    return res


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
def patch_note(nid: int, body: NotePatch, db: Session = Depends(get_db),
               user=Depends(auth.current_user)):
    """Амлалтын ТӨЛӨВ (хуучин) эсвэл ЗАХЫН ТЭМДЭГЛЭЛ (шинэ) — биеэрээ салаална.

    Рольыг энд ГАРААР шалгана: хоёр салаа өөр эрхтэй (тэмдэглэлийн давхаргад
    үйлдвэрийн дарга гэрээ/хөдөлгөөн дээр бичиж чадна), тиймээс нэг
    `require_roles` хамаагүй хатуу.
    """
    if body.status is None:
        return notes_router.patch_entity_note(nid, body.text, body.flag, body.date,
                                              db, user)
    # Амлалт хаах нь АВЛАГЫН ажил. Мөр нь эзнээ НЭРЛЭНЭ (`auth.denied`).
    if getattr(user, "role", "") not in ("manager", "finance"):
        raise auth.denied("manager", "finance")
    return set_promise_status(db, nid, body.status, user)


PROMISE_STATUS = ("open", "kept", "broken")


def set_promise_status(db: Session, nid: int, status: str, user) -> dict:
    """АМЛАЛТЫГ ХААХ — «биелүүлсэн» эсвэл «зөрчсөн» (нээлттэй нь эргэж болно).

    Амлалт хаагдахгүй бол «Амлалт зөрчсөн» тоолуур ХЭЗЭЭ Ч буурахгүй: төлбөр
    нь орсон ч мөр нь нээлттэй хэвээр тоологдоод, дашбоардын улаан мэдэгдэл
    үүрд үлдэнэ. Хаагдсан амлалт нь мэдэгдэл, тоолуур хоёроос ХОЁУЛАНГААС нь
    гардаг (`dashboard.py`, `analytics.collections`).
    """
    n = db.get(models.CollectionNote, nid)
    if not n:
        raise HTTPException(404, "Олдсонгүй")
    if status not in PROMISE_STATUS:
        raise HTTPException(400, "Буруу төлөв")
    before = n.status
    n.status = status
    db.commit()
    audit_svc.log(db, user, "update", "collection_note", n.id,
                  f"{n.client.name if n.client else ''} · амлалтын төлөв: "
                  f"{audit_svc.value_mn(before)} → {audit_svc.value_mn(status)}"
                  + (f" · {n.promise_date} өдрөөр {n.promise_amount:,.0f}₮"
                     if n.promise_date else ""))
    return note_ser(n)


class NoteStatusIn(BaseModel):
    status: str


@router.patch("/collections/notes/{nid}")
def patch_collection_note(nid: int, body: NoteStatusIn, db: Session = Depends(get_db),
                          user=Depends(fin)):
    """Амлалтын төлөвийн ТОДОРХОЙ хаяг — «Авлага цуглуулах» хуудасны товч.

    `PATCH /api/notes/{id}` нь хоёр давхаргын хуваалцсан хаалга (захын
    тэмдэглэл ба амлалт биеэрээ салаалдаг); энэ хаяг нь эргэлзээгүй ганц
    утгатай тул шинэ дэлгэц үүнийг дуудна. Хуучин хаалга ХЭВЭЭР ажиллана.
    """
    return set_promise_status(db, nid, body.status, user)


# ---------------- Утсаар тооллого ----------------
class StocktakeLine(BaseModel):
    material_id: int
    grade_id: int
    counted: float
    #: ХУУДАС ХАРУУЛСАН үлдэгдэл. Тооллого нь утсан дээр цагаар үргэлжилдэг —
    #: тэр хооронд ачилт/буцаалт бүртгэгдвэл серверийн тоо өөр болно. Энэ
    #: талбаргүйгээр тооллого нь ХООРОНДОХ бүх хөдөлгөөнийг чимээгүй арчина.
    system: float


class StocktakeIn(BaseModel):
    date: date
    note: str = ""
    lines: list[StocktakeLine]


@router.post("/stock/stocktake")
def stocktake(body: StocktakeIn, db: Session = Depends(get_db),
              user=Depends(auth.require_roles("manager", "factory"))):
    """Олон мөрийг нэг дор тоолж залруулна (утсанд зориулсан).

    ГУРВАН дүрэм:
      1. **Зөрчилдвөл ЮУ Ч бичихгүй.** Мөр бүрийн `system` (хуудас харуулсан
         тоо) нь агуулахын ОДООГИЙН тоотой тулгагдана; нэг ч мөр зөрвөл бүх
         тооллого 409-өөр буцна — хагас хийгдсэн тооллого гэж байхгүй.
      2. **Мөр бүр БИЧИЛТ болно** (`stock_adjustments`, нэг багц дугаараар)
         — «144ш хаачив» гэсэн асуулт мөрөндөө хариултаа авч явна.
      3. **Бүртгэлд ҮРГЭЛЖ нэг мөр.** Зөрүүгүй тооллого нь ХИЙГДСЭН АЖИЛ:
         «зөрүүгүй» гэдэг нь хамгийн үнэтэй хариулт, тэр мөр алга болох
         ёсгүй. Мөрүүдийн зөрүү нь БҮТНЭЭРЭЭ (`audit.DETAIL_LIMIT`) бичигдэнэ.
    """
    if not body.lines:
        raise HTTPException(400, "Мөр оруулна уу")
    mats = {m.id: m for m in db.query(models.Material).all()}
    grades = {g.id: g for g in db.query(models.Grade).all()}

    # --- 1) БҮГДИЙГ шалгана (юу ч хөдөлгөхгүй) ---
    seen: set[tuple[int, int]] = set()
    for ln in body.lines:
        m, g = mats.get(ln.material_id), grades.get(ln.grade_id)
        if not m or not g:
            raise HTTPException(404, "Материал эсвэл зэрэглэл олдсонгүй")
        if (ln.material_id, ln.grade_id) in seen:
            # Хоёр мөр нэг нүд рүү заавал сүүлчийнх нь чимээгүй ялна —
            # тооллого «аль тоог нь авсан юм бэ?» гэсэн асуулт үлдээх ёсгүй.
            raise HTTPException(400, f"{m.name} ({g.code}): нэг мөр хоёр удаа орж ирлээ")
        seen.add((ln.material_id, ln.grade_id))
        if ln.counted < 0:
            raise HTTPException(400, "Тоо сөрөг байж болохгүй")
        now = stock_svc.row(db, ln.material_id, ln.grade_id).on_hand or 0.0
        if abs(now - ln.system) > stock_svc.EPS:
            raise HTTPException(409, stock_svc.conflict_message(m, ln.system, now))

    # --- 2) Бичилтүүд, нэг багцаар ---
    batch = f"{body.date}-{clock.now_local():%H%M%S}"
    adjusted = 0
    diff_total = 0.0
    details: list[str] = []
    for ln in body.lines:
        adj = stock_svc.adjust(db, mats[ln.material_id], grades[ln.grade_id],
                               ln.counted, user=user, note=body.note,
                               source="stocktake", batch=batch, day=body.date,
                               # Багц нь бүртгэлд НЭГ мөр үлдээнэ (доор) —
                               # мөр бүрд нэг нь бичигдвэл жагсаалт живнэ.
                               log_audit=False)
        if adj is None:
            continue
        details.append(stock_svc.line_text(adj, mats[ln.material_id],
                                           grades[ln.grade_id]))
        diff_total += adj.diff
        adjusted += 1

    # --- 3) Бүртгэлийн мөр — ҮРГЭЛЖ ---
    head = f"{body.date} · {len(body.lines)} мөр тоологдов"
    if body.note:
        head += f" · {body.note}"
    audit_svc.log(db, user, "stocktake", "stock", None,
                  f"{head} · " + (f"зөрүүтэй {adjusted} мөр: " + " | ".join(details)
                                  if adjusted else "зөрүүгүй"))
    return {"ok": True, "adjusted": adjusted, "diff_total": round(diff_total),
            "details": details, "batch": batch}


# ---------------- Аналитик ----------------
@router.get("/reports/materials")
def materials_report(months: int = 6, db: Session = Depends(get_db), user=Depends(fin)):
    return analytics.material_yield(db, months)


@router.get("/reports/forecast")
def forecast(db: Session = Depends(get_db), user=Depends(fin)):
    return analytics.cash_forecast(db)


# ---------------- Мэдэгдлийг түр нуух ----------------
class SnoozeIn(BaseModel):
    kind: str
    entity_id: int | None = None
    days: int = 1


@router.post("/notifications/snooze")
def snooze_notification(body: SnoozeIn, db: Session = Depends(get_db),
                        user=Depends(auth.current_user)):
    """«Мэдлээ — {N} хоногийн дараа сануул».

    Нуулт нь ХҮНИЙХ: нярав нэг мөрийг хойшлуулсан нь захирлын дэлгэцийг
    хөндөхгүй. `entity_id` байхгүй бол ТУХАЙН ТӨРЛИЙГ бүхэлд нь.
    """
    if body.kind not in billing.NOTIFY_KINDS:
        raise HTTPException(400, "Мэдэгдлийн төрөл буруу")
    if not 1 <= body.days <= 365:
        raise HTTPException(400, "Хоног 1-365 хооронд байна")
    until = clock.today() + timedelta(days=body.days)
    st = billing.snooze_row(db, user.id, body.kind, body.entity_id)
    if st is None:
        st = models.NotificationState(kind=body.kind, entity_id=body.entity_id,
                                      user_id=user.id)
        db.add(st)
    st.snooze_until = until
    st.seen_at = datetime.utcnow()
    db.commit()
    audit_svc.log(db, user, "snooze", "notification", body.entity_id,
                  f"{billing.NOTIFY_MN.get(body.kind, body.kind)} — "
                  f"{until} хүртэл нуув ({body.days} хоног)")
    return {"ok": True, "kind": st.kind, "entity_id": st.entity_id,
            "snooze_until": str(st.snooze_until)}


class UnsnoozeIn(BaseModel):
    kind: str
    entity_id: int | None = None


@router.delete("/notifications/snooze")
def unsnooze_notification(body: UnsnoozeIn, db: Session = Depends(get_db),
                          user=Depends(auth.current_user)):
    """Нуултыг НЭН ДАРУЙ буцаана — мөр дахин дашбоард дээр гарна."""
    st = billing.snooze_row(db, user.id, body.kind, body.entity_id)
    if st is None:
        return {"ok": True, "removed": 0}
    db.delete(st)
    db.commit()
    audit_svc.log(db, user, "unsnooze", "notification", body.entity_id,
                  f"{billing.NOTIFY_MN.get(body.kind, body.kind)} — нуултыг цуцлав")
    return {"ok": True, "removed": 1}


# ---------------- Audit ----------------
#: Улаанбаатар нь UTC+8, зуны цаг БАЙХГҮЙ (`services/cron.py`-ийн тайлбар) —
#: тогтмол шилжилт хангалттай, гадны tz сан шаардлагагүй.
LOCAL_TZ = timezone(timedelta(hours=8))
AUDIT_LIMIT = 500


def audit_row(r: models.AuditLog) -> dict:
    """Нэг мөр. `at` нь ХУУЧНААРАА (UTC, хуучин уншигчид эвдрэхгүй),
    `local_at` нь ОРОН НУТГИЙН цаг — дэлгэц дээр 06:00-д гүйсэн cron нь
    06:00 гэж харагдана, 22:00 гэж БИШ."""
    at = r.created_at
    return {"id": r.id, "user_name": r.user_name, "action": r.action,
            "entity": r.entity, "entity_id": r.entity_id, "detail": r.detail,
            "at": str(at)[:19],
            "local_at": (at.replace(tzinfo=timezone.utc).astimezone(LOCAL_TZ).isoformat()
                         if at else None)}


@router.get("/audit")
def audit_list(from_: _date_t | None = Query(None, alias="from"),
               to: _date_t | None = None, action: str = "", entity: str = "",
               who: str = Query("", alias="user"), q: str = "",
               limit: int = 200, offset: int = 0,
               db: Session = Depends(get_db),
               me=Depends(auth.require_roles("manager"))):
    """«Хэн, юуг, хэзээ» — ШҮҮГДЭХ бүртгэл.

    Урьд нь энэ хаалга сүүлийн 200 мөрийг л буцаадаг байв: гурав хоногийн
    өмнөх нэг өөрчлөлт хайхын тулд Отгоо эгч мөрүүдийг нүдээрээ гүйлгэх
    ёстой болдог — 500 мөрийн дараа бүртгэл нь оршин байгаа боловч
    ХҮРЭХГҮЙ болно.

    Огноо нь ОРОН НУТГИЙН өдрөөр ойлгогдоно (`from`/`to` хоёул ОРНО): DB-д
    UTC-гээр суудаг тул цонх нь 8 цагаар шилжиж тулгагдана — эс бөгөөс
    орой 20:00-д хийсэн үйлдэл «маргаашийнх» болж шүүлтээс унана.
    """
    return _audit_page(db, from_, to, action, entity, who, q, limit, offset)


def _audit_page(db: Session, from_, to, action: str, entity: str, who: str,
                q: str, limit: int, offset: int, only_name: str | None = None) -> dict:
    """Шүүлт · хуудаслалт — ХОЁР хаалганы НЭГ бие (`/audit`, `/audit/mine`).

    `only_name` нь ХАТУУ тэнцэл: «миний» хаалга нь дуудагчийнхаа мөрийг л
    мэднэ, `?user=` -аар өөр хүн рүү эргүүлэх зам байхгүй.
    """
    qs = db.query(models.AuditLog)
    if only_name is not None:
        qs = qs.filter(models.AuditLog.user_name == only_name)
    if from_:
        qs = qs.filter(models.AuditLog.created_at
                       >= datetime.combine(from_, datetime.min.time()) - timedelta(hours=8))
    if to:
        qs = qs.filter(models.AuditLog.created_at
                       < datetime.combine(to + timedelta(days=1), datetime.min.time())
                       - timedelta(hours=8))
    if action:
        qs = qs.filter(models.AuditLog.action == action)
    if entity:
        qs = qs.filter(models.AuditLog.entity == entity)
    if only_name is None and who.strip():
        qs = qs.filter(models.AuditLog.user_name.ilike(f"%{who.strip()}%"))
    if q.strip():
        needle = f"%{q.strip()}%"
        qs = qs.filter(models.AuditLog.detail.ilike(needle)
                       | models.AuditLog.user_name.ilike(needle))
    total = qs.count()
    rows = (qs.order_by(models.AuditLog.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), AUDIT_LIMIT)).all())
    return {"rows": [audit_row(r) for r in rows], "total": total}


@router.get("/audit/mine")
def audit_mine(from_: _date_t | None = Query(None, alias="from"),
               to: _date_t | None = None, action: str = "", entity: str = "",
               q: str = "", limit: int = 200, offset: int = 0,
               db: Session = Depends(get_db),
               me=Depends(auth.current_user)):
    """«МИНИЙ БҮРТГЭЛ» — өөрийн үлдээсэн мөрүүд. БҮХ рольд.

    Бүтэн бүртгэл нь эзнийх хэвээр (`/audit` — зөвхөн менежер): тэнд бусдын
    үйлдэл, мөнгөний мөрүүд бий. Гэвч «би өнөөдөр юу бүртгэсэн бэ», «тэр
    тооллого суусан уу» гэдэг нь ХЭНИЙ Ч ажилдаа хариуцлага хүлээх эрх —
    үйлдвэрийн дарга тооллого хийгээд үр дүнгээ хардаггүй байв.

    Шүүлт, хуудаслалт нь `/audit`-тай ЯГ ижил хэлбэртэй: дэлгэц нэг л
    бүрэлдэхүүнээр хоёуланг нь зурна.
    """
    return _audit_page(db, from_, to, action, entity, "", q, limit, offset,
                       only_name=(getattr(me, "name", "") or ""))

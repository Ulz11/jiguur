"""Механизм (Автокран г.м.) — өдрийн ажлын log, орлого/зарлага, машин бүрийн ашиг."""
import json
import re
from datetime import date
# Талбарын нэр нь `date` (LogPatch) — pydantic аннотацийг АНГИЙН орчинд нээдэг
# тул `date | None` нь «None | None» болж унана. contracts.py-тай ижил ялгуулагч.
from datetime import date as _date_t
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import clock
from ..db import get_db
from .. import models, auth
from ..services import audit, pdfmachine

router = APIRouter(prefix="/api")

# Log БИЧИХ — гурван рольд нээлттэй. Дарга өдрийн ажлаа өөрөө бүртгэдэг
# (Системийн зураглал: ачилт/буцаалт/агуулах/механизм нь түүний талбай) ба
# ажлын дүнг бүртгэх нь МЭДЭЭЛЭЛ ОРУУЛАХ үйлдэл.
guard = auth.require_roles("manager", "factory", "finance")

# ХУУЧИН бичилтийг засах, устгах, нэхэмжлэл гаргах — МӨНГӨНИЙ шийдвэр тул
# менежер + санхүүчийнх. Гэрээний дэлгэрэнгүй дээр татсан зураас (`seesMoney`)
# энд ч ижилхэн: дарга машины P&L-ийг хардаггүй, тэгэхээр түүнийг өөрчилдөг
# товч ч түүнд байх учиргүй. Машин ӨӨРӨӨ үүсгэх/зогсоох нь менежерийнх.
#
# ⚠ ГАНЦ ЦОНХ: log мөрийг ЗАСАХ/УСТГАХ хоёр нь `money_guard`-аас гарч
# `_own_log`-д шилжив — өнөөдөр ӨӨРӨӨ бичсэн мөрөө дарга залруулна. Ажлаа
# өөрөө бүртгэдэг хүн бичсэнээ засаж ч чаддаг байх ёстой; маргааш нь тэр мөр
# ашгийн тооцоонд орсон байна. Нэхэмжлэл нь ХЭВЭЭР мөнгөний эздийнх.
money_guard = auth.require_roles("manager", "finance")


#: Бүртгэлийн ТӨРӨЛ монголоор — аудитын мөрөнд «job» гэсэн үг гарахгүй.
ENTRY_MN = {"job": "ажил", "expense": "зарлага"}


class MachineIn(BaseModel):
    name: str
    note: str = ""


class MachinePatch(BaseModel):
    name: str | None = None
    note: str | None = None
    active: int | None = None      # 1 = идэвхтэй, 0 = зогссон


class LogIn(BaseModel):
    date: date
    entry: str                 # job | expense
    label: str = ""
    client: str = ""
    amount: float
    method: str = ""           # CASH | BANK | BARTER | INTERNAL
    note: str = ""


class LogPatch(BaseModel):
    date: _date_t | None = None
    label: str | None = None
    client: str | None = None
    amount: float | None = None
    method: str | None = None
    note: str | None = None


class InvoiceIn(BaseModel):
    client: str
    d_from: date
    d_to: date
    #: УРЬДЧИЛСАН ХАРАХ. `true` бол юу ч БИЧИГДЭХГҮЙ: ямар мөр, ямар дүн
    #: гарахыг, давхардал байвал ТҮҮНИЙГ нь `warning` мөрөөр буцаана.
    #: Дэлгэц энэ хариуг «Үүсгэх» дарахаас ӨМНӨ харуулж чадна — 409 нь
    #: хүнд «алдаа» шиг харагддаг, урьдчилсан сануулга нь ЗӨВЛӨГӨӨ.
    dry_run: bool = False


def _safe(name: str) -> str:
    """Файлын нэрэнд оруулж болох тэмдэгт л үлдээнэ (M-26/05-1 → M-26-05-1)."""
    return re.sub(r"[^0-9A-Za-z._-]+", "-", name).strip("-") or "file"


def _internal(l: models.MachineLog) -> bool:
    return l.entry == "job" and l.method == "INTERNAL"


def machine_ser(m: models.Machine):
    """Машины P&L. ДОТООД ажил ОРЛОГО БИШ.

    Нэхэмжлэл нь дотоод ажлыг хасдаг (`billable_jobs` — өөрийн агуулах руу
    нэхэмжлэл явдаггүй) байхад картын «Орлого» түүнийг нэмсээр байв: нэг
    машины ижил ажил хоёр дэлгэц дээр хоёр өөр дүнтэй харагдана. Дотоод
    ажил алга болох ёсгүй тул ӨӨРИЙН тоогоор тусад нь гарна — кран өөрийн
    барилга дээр хэдэн өдөр зогссоныг мэдэх нь ч мэдээлэл.
    """
    income = sum(l.amount for l in m.logs if l.entry == "job" and not _internal(l))
    internal = [l for l in m.logs if _internal(l)]
    expense = sum(l.amount for l in m.logs if l.entry == "expense")
    return {"id": m.id, "name": m.name, "note": m.note, "active": m.active,
            "income": round(income), "expense": round(expense),
            "internal": round(sum(l.amount for l in internal)),
            "internal_count": len(internal),
            "net": round(income - expense), "log_count": len(m.logs)}


def log_ser(l: models.MachineLog, mine_today: bool = False):
    """`mine_today` — «энэ мөрийг би өнөөдөр бичсэн» (`_own_log`-тэй нэг дүрэм).

    Дэлгэц ✎ ба ✕-г ЗУРАХААС ӨМНӨ мэдэх ёстой: үргэлж 403 болдог товч бол
    худал амлалт."""
    return {"id": l.id, "date": str(l.date), "entry": l.entry, "label": l.label,
            "client": l.client, "amount": l.amount, "method": l.method, "note": l.note,
            "mine_today": mine_today}


def invoice_ser(inv: models.MachineInvoice):
    return {"id": inv.id, "no": inv.no, "client": inv.client,
            "d_from": str(inv.d_from), "d_to": str(inv.d_to),
            "total": inv.total, "vat": inv.vat, "grand_total": inv.grand_total}


def freeze_rows(logs) -> list[dict]:
    """Баримтад ХАДГАЛАГДАХ мөрүүд — log-ийн ГЭРЭЛ ЗУРАГ (`id` нь мөшгилтөд)."""
    return [{"log_id": l.id, "date": str(l.date), "label": l.label,
             "method": l.method, "amount": l.amount, "note": l.note} for l in logs]


def frozen_rows(inv: models.MachineInvoice) -> list[dict]:
    """Хадгалсан мөрүүд. Хуучин (хөлдөөгүй) баримт → ХООСОН жагсаалт."""
    try:
        data = json.loads(inv.detail_json or "{}")
    except (ValueError, TypeError):
        return []
    rows = data.get("rows") if isinstance(data, dict) else None
    return rows if isinstance(rows, list) else []


def billable_jobs(m: models.Machine, client: str, d_from: date, d_to: date):
    """Нэхэмжлэлд ОРОХ мөрүүд — дүрэм НЭГ газар (роутер ба PDF хоёулаа эндээс).

    · зөвхөн АЖИЛ (`entry == "job"`) — зарлага харилцагчийн хэрэг биш;
    · зөвхөн ТЭР харилцагчийн мөр (`client` нь чөлөөт текст тул хоёр талаас
      нь зай хасаж жиших — Отгоо Excel-ээс хуулахдаа зай авчирдаг);
    · ДОТООД ажил (`INTERNAL`) хасагдана — өөрийн агуулах руу нэхэмжлэхгүй;
    · цонх [d_from, d_to] — ХОЁР ирмэг ОРНО (хүн «5-р сарын 1-30» гэж хэлэхдээ
      30-ыг оруулж хэлдэг).
    """
    key = client.strip()
    return sorted((l for l in m.logs
                   if l.entry == "job" and l.method != "INTERNAL"
                   and l.client.strip() == key and d_from <= l.date <= d_to),
                  key=lambda l: (l.date, l.id))


#: МЕХАНИЗМЫН НӨАТ% — тохиргооны түлхүүр. Гэрээний `vat_percent`-ээс
#: ТУСДАА: кран нь өөр гэрээгүй, өөр баримттай урсгал тул түүний НӨАТ-ыг
#: түрээсийнхтэй нэг нүднээс удирдвал нэгийг нь өөрчлөхөд нөгөө нь дуугүй
#: хөдөлнө. Анхны утга 0 (`app/seed.py`) — Жигүүр Зам НӨАТ төлөгч биш.
VAT_SETTING = "machine_vat_percent"


def _vat_percent(db: Session) -> float:
    """Механизмын НӨАТ% — тохиргооноос (`machine_vat_percent`).

    Хуучин DB-д тэр түлхүүр байхгүй бол компанийн ерөнхий `vat_percent`
    -аар, тэр ч байхгүй бол 0."""
    for key in (VAT_SETTING, "vat_percent"):
        row = db.get(models.Setting, key)
        if row and row.value:
            try:
                return float(row.value)
            except ValueError:
                return 0.0
    return 0.0


def _next_no(db: Session, period_end: date) -> str:
    """`M-YY/MM-N` — N нь тухайн он/сар дотор нэмэгдэнэ.

    ⚠ Он/сар нь НЭХЭМЖИЛСЭН ХУГАЦААНААС гарна, `clock.today()`-оос БИШ.
    Урьд нь 5-р сарын ажлыг 9-р сард гаргахад `M-26/09-1` гэсэн дугаар
    төрдөг байв: Отгоо эгч дугаараар нь хайхад «26/05» гэж хайдаг ба олдохгүй.
    Баримтын дугаар нь ХЭЗЭЭ ХЭВЛЭСЭН биш, ЮУГ нэхэмжилснийг хэлнэ.

    Гэрээний дугаарлалттай ижил хэв маяг: тоолуураас эхэлж, эзэлсэн дугаар
    таарвал урагшилна (`no` нь unique тул мөргөлдөөн чимээгүй өнгөрөхгүй)."""
    head = f"M-{period_end:%y/%m}-"
    n = db.query(models.MachineInvoice).filter(
        models.MachineInvoice.no.like(head + "%")).count() + 1
    while db.query(models.MachineInvoice).filter_by(no=f"{head}{n}").first():
        n += 1
    return f"{head}{n}"


def _overlapping_invoice(db: Session, mid: int, client: str,
                         d_from: date, d_to: date) -> models.MachineInvoice | None:
    """Ижил машин + ижил харилцагчийн ДАВХАЦСАН цонхтой баримт (эхнийх).

    Хоёр цонх [a1,a2] ба [b1,b2] нь `a1 <= b2 БА b1 <= a2` үед давхацна —
    ирмэг ОРОЛЦОНО, `billable_jobs`-ийн цонхтой яг ижил журам. Иймд 05-01–05-15
    ба 05-16–05-31 нь зэрэгцээ (чөлөөтэй), 05-15-аар таарвал давхардал.

    Харилцагчийг `strip()`-ээр жишнэ — `billable_jobs` мөрөө ЯГ тэгж түүдэг тул
    хоёр газар нэг дүрэм: «Түмэн Хийц » ба «Түмэн Хийц» нэг хүн.
    """
    key = client.strip()
    return (db.query(models.MachineInvoice)
            .filter(models.MachineInvoice.machine_id == mid,
                    models.MachineInvoice.client == key,
                    models.MachineInvoice.d_from <= d_to,
                    models.MachineInvoice.d_to >= d_from)
            .order_by(models.MachineInvoice.id).first())


def _machine(db: Session, mid: int) -> models.Machine:
    m = db.get(models.Machine, mid)
    if not m:
        raise HTTPException(404, "Машин олдсонгүй")
    return m


@router.get("/machines")
def list_machines(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    # Зогссон машин жагсаалтын СҮҮЛД — өдөр тутмын ажил идэвхтэйгээрээ эхэлнэ.
    machines = sorted(db.query(models.Machine).all(), key=lambda m: (-m.active, m.id))
    rows = [machine_ser(m) for m in machines]
    # Хураангуй нь мөр бүрийн НИЙЛБЭР — тусад нь бодвол хоёр дүрэм үүсч,
    # дотоод ажил нэг газраас хасагдаж нөгөө газраа үлддэг.
    total_in = sum(r["income"] for r in rows)
    total_ex = sum(r["expense"] for r in rows)
    return {"machines": rows,
            # Механизмын НӨАТ% нь ЭНД ч уншигдана: /api/settings нь бүх
            # тохиргоог нэг мөсөн буцаадаг ба тэнд `machine_vat_percent`
            # мөр байгаа (`app/seed.py`) — гэхдээ нэхэмжлэлийн дэлгэц нь
            # өөрийнхөө тоог өөрийнхөө хариунаас уншиж чадах ёстой.
            "vat_percent": _vat_percent(db),
            "summary": {"income": total_in, "expense": total_ex,
                        "internal": sum(r["internal"] for r in rows),
                        "net": total_in - total_ex}}


@router.get("/machines/{mid}/logs")
def machine_logs(mid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    m = _machine(db, mid)
    mine = audit.own_today(db, user, "machine_log", [l.id for l in m.logs])
    invs = db.query(models.MachineInvoice).filter_by(machine_id=mid).order_by(
        models.MachineInvoice.id.desc()).all()
    return {**machine_ser(m),
            "logs": [log_ser(l, l.id in mine)
                     for l in sorted(m.logs, key=lambda l: (l.date, l.id), reverse=True)],
            "invoices": [invoice_ser(i) for i in invs],
            "clients": sorted({l.client.strip() for l in m.logs
                               if l.entry == "job" and l.method != "INTERNAL" and l.client.strip()})}


@router.post("/machines")
def add_machine(body: MachineIn, db: Session = Depends(get_db),
                user=Depends(auth.require_roles("manager"))):
    m = models.Machine(**body.model_dump())
    db.add(m)
    db.commit()
    audit.log(db, user, "create", "machine", m.id, m.name)
    return machine_ser(m)


@router.patch("/machines/{mid}")
def patch_machine(mid: int, body: MachinePatch, db: Session = Depends(get_db),
                  user=Depends(auth.require_roles("manager"))):
    """Нэр/тэмдэглэл засах, машин зогсоох (`active=0`) ба сэргээх (`active=1`)."""
    m = _machine(db, mid)
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "active" in data and data["active"] not in (0, 1):
        raise HTTPException(400, "Төлөв 0 (зогссон) эсвэл 1 (идэвхтэй) байна")
    before = {k: getattr(m, k) for k in data}
    for k, v in data.items():
        setattr(m, k, v)
    db.commit()
    audit.log(db, user, "update", "machine", m.id,
              f"{m.name} · {audit.changes_text(before, data)}")
    return machine_ser(m)


@router.post("/machines/{mid}/logs")
def add_log(mid: int, body: LogIn, db: Session = Depends(get_db), user=Depends(guard)):
    m = _machine(db, mid)
    if not m.active:
        # Зогсоох нь УСТГАХ биш: түүх уншигдсан хэвээр үлдэнэ, зөвхөн шинэ
        # бичилт хаагдана — эс бөгөөс зогссон кран дээр тоо чимээгүй хуримтлагдана.
        raise HTTPException(400, "Зогссон механизм дээр бүртгэл нэмэхгүй — "
                                 "эхлээд идэвхжүүлнэ үү")
    if body.entry not in ("job", "expense"):
        raise HTTPException(400, "entry нь job эсвэл expense байна")
    if body.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    l = models.MachineLog(machine_id=mid, **body.model_dump())
    db.add(l)
    db.commit()
    # Бүртгэл НЭМЭХ нь засах/устгахтай ижил ЭЗЭНТЭЙ байх ёстой: /audit дээр
    # «хэн энэ 1.2 саяыг оруулав?» гэсэн асуулт өмнө нь хариугүй үлддэг байв
    # (зөвхөн засварласан, устгасан хүн харагдана).
    audit.log(db, user, "create", "machine_log", l.id,
              f"{m.name} · {l.date} · {l.label or ENTRY_MN[l.entry]} · "
              f"{l.client or '—'} · {l.amount:,.0f}₮ · {audit.value_mn(l.method)}")
    # Дөнгөж бичсэн хүн нь эзэн нь — мөр өөрөө засагдаж чадна гэдгээ хэлнэ.
    return log_ser(l, True)


def _log(db: Session, lid: int) -> models.MachineLog:
    l = db.get(models.MachineLog, lid)
    if not l:
        raise HTTPException(404, "Бүртгэл олдсонгүй")
    return l


def _own_log(db: Session, user, lid: int) -> None:
    """ӨӨРИЙН, ӨНӨӨДРИЙН мөр бол дарга ч засна, устгана.

    Ажлаа өөрөө бүртгэдэг хүн бичсэн зүйлээ засаж ч чаддаг байх ёстой:
    «Бүтэн өдөр» гэж дараад хагас байсныг мэдэх нь тэр өдөртөө л болдог
    явдал. Маргааш нь тэр мөр ашгийн тооцоонд орсон байх тул мөнгөний
    эздийнх (`money_guard`) хэвээр.
    """
    if getattr(user, "role", "") in ("manager", "finance"):
        return
    if not audit.is_own_today(db, user, "machine_log", lid):
        raise auth.denied("manager", "finance")


@router.patch("/machine-logs/{lid}")
def patch_log(lid: int, body: LogPatch, db: Session = Depends(get_db),
              user=Depends(guard)):
    """Inline засвар — огноо, ажил, харилцагч, дүн, хэлбэр, тэмдэглэл."""
    _own_log(db, user, lid)
    l = _log(db, lid)
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "amount" in data and data["amount"] <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    if "method" in data and data["method"] not in ("CASH", "BANK", "BARTER", "INTERNAL", ""):
        raise HTTPException(400, "Төлбөрийн хэлбэр буруу байна")
    before = {k: str(getattr(l, k)) for k in data}
    for k, v in data.items():
        setattr(l, k, v)
    db.commit()
    audit.log(db, user, "update", "machine_log", l.id,
              f"{l.machine.name} · {audit.changes_text(before, {k: str(v) for k, v in data.items()})}")
    return log_ser(l, audit.is_own_today(db, user, "machine_log", l.id))


@router.delete("/machine-logs/{lid}")
def delete_log(lid: int, db: Session = Depends(get_db), user=Depends(guard)):
    _own_log(db, user, lid)
    l = _log(db, lid)
    detail = (f"{l.machine.name} · {l.date} · {l.label or ENTRY_MN[l.entry]} · "
              f"{l.client or '—'} · {l.amount:,.0f}₮")
    db.delete(l)
    db.commit()
    audit.log(db, user, "delete", "machine_log", lid, detail)
    return {"ok": True}


# ---------- Механизмын нэхэмжлэл (тусдаа баримт) ----------

NO_ROWS = "Тухайн хугацаанд энэ харилцагчийн нэхэмжлэх ажил олдсонгүй"


def _overlap_warning(dup: models.MachineInvoice | None) -> str:
    """Давхардлын САНУУЛГА — 409-ийн мөртэй ИЖИЛ өгүүлбэр (нэг үг, нэг утга)."""
    if not dup:
        return ""
    return (f"№{dup.no} нь {dup.client}-ийн {dup.d_from}–{dup.d_to} хугацааг "
            f"аль хэдийн нэхэмжилсэн байна — давхардсан баримт үүсгэхгүй")


@router.post("/machines/{mid}/invoices")
def create_invoice(mid: int, body: InvoiceIn, db: Session = Depends(get_db),
                   user=Depends(money_guard)):
    m = _machine(db, mid)
    if body.d_from > body.d_to:
        raise HTTPException(400, "Эхлэх огноо дуусах огнооноос хойш байж болохгүй")
    # «Үүсгэх»-ийг хоёр дарахад ЯГ ижил мөрүүд дээр хоёр баримт төрдөг байв —
    # кран нэг ажлаа хоёр удаа нэхэмжилнэ. Давхацсан цонхыг АЛЬ баримттай
    # мөргөлдсөнийг нэрлэж татгалзана (409 — «мөргөлдөөн», 400 биш: хүсэлт
    # өөрөө зөв, зөвхөн одоо байгаа баримттай зөрчилдөж байна).
    dup = _overlapping_invoice(db, mid, body.client, body.d_from, body.d_to)
    rows = billable_jobs(m, body.client, body.d_from, body.d_to)
    total = sum(l.amount for l in rows)
    pct = _vat_percent(db)
    vat = total * pct / 100

    if body.dry_run:
        # УРЬДЧИЛСАН ХАРАХ — юу ч бичихгүй. Сануулгыг мөрөөр нь буцаана:
        # дэлгэц түүнийг «Үүсгэх» товчны ДЭРГЭД харуулж чадна.
        return {"dry_run": True, "no": _next_no(db, body.d_to),
                "client": body.client.strip(), "d_from": str(body.d_from),
                "d_to": str(body.d_to), "rows": len(rows),
                "lines": freeze_rows(rows), "total": total, "vat": vat,
                "vat_percent": pct, "grand_total": total + vat,
                "overlap_no": dup.no if dup else None,
                "warning": _overlap_warning(dup) or (NO_ROWS if not rows else "")}

    if dup:
        raise HTTPException(409, _overlap_warning(dup))
    if not rows:
        raise HTTPException(400, NO_ROWS)
    lines = freeze_rows(rows)
    inv = models.MachineInvoice(machine_id=mid, no=_next_no(db, body.d_to),
                                client=body.client.strip(), d_from=body.d_from,
                                d_to=body.d_to, total=total, vat=vat,
                                grand_total=total + vat,
                                # Баримт нь ГЭРЭЛ ЗУРАГ: дахин хэвлэхэд ижил
                                # мөр, ижил дүн (log хожим засагдсан ч).
                                detail_json=json.dumps(
                                    {"rows": lines, "total": total, "vat": vat,
                                     "vat_percent": pct, "grand_total": total + vat},
                                    ensure_ascii=False))
    db.add(inv)
    db.commit()
    audit.log(db, user, "create", "machine_invoice", inv.id,
              f"{m.name} · №{inv.no} · {inv.client} · {body.d_from}–{body.d_to} · "
              f"{len(rows)} мөр · {inv.grand_total:,.0f}₮")
    return {**invoice_ser(inv), "rows": len(rows)}


def _invoice(db: Session, iid: int) -> models.MachineInvoice:
    inv = db.get(models.MachineInvoice, iid)
    if not inv:
        raise HTTPException(404, "Нэхэмжлэл олдсонгүй")
    return inv


@router.get("/machine-invoices/{iid}")
def invoice_detail(iid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    """Баримтын ХӨЛДӨӨСӨН агуулга — цаасан дээр юу хэвлэгдэхийг ЯГ хэлнэ.

    Дэлгэц үүнийг «дахин хэвлэхээс өмнө харах» цонхонд ашиглана: log хожим
    засагдсан ч энэ мөрүүд ХӨДӨЛӨХГҮЙ (баримт бол гэрэл зураг).
    """
    inv = _invoice(db, iid)
    return {**invoice_ser(inv), "machine": inv.machine.name,
            "lines": frozen_rows(inv)}


@router.get("/machine-invoices/{iid}/pdf")
def invoice_pdf(iid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    inv = _invoice(db, iid)
    # ХӨЛДӨӨСӨН мөрүүдээр — log-ийг дахин уншихгүй. Хуучин (хөлдөөгүй)
    # баримт дээр л log руу буцаж очно (`pdfmachine.build_bill`-ийн нөөц зам).
    rows = billable_jobs(inv.machine, inv.client, inv.d_from, inv.d_to) \
        if not frozen_rows(inv) else None
    pdf = pdfmachine.machine_invoice_pdf(db, inv, rows)
    # №-д ташуу зураас байдаг (M-26/05-1) — файлын нэрэнд орвол зам болж эвдэрнэ.
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="mehanizm-{_safe(inv.no)}.pdf"'})


@router.delete("/machine-invoices/{iid}")
def delete_invoice(iid: int, db: Session = Depends(get_db), user=Depends(money_guard)):
    """Баримт устгана — ЛЕДЖЕР биш тул үлдэгдэлд юу ч хөдлөхгүй (log мөрүүд хэвээр)."""
    inv = _invoice(db, iid)
    detail = f"№{inv.no} · {inv.client} · {inv.grand_total:,.0f}₮"
    db.delete(inv)
    db.commit()
    audit.log(db, user, "delete", "machine_invoice", iid, detail)
    return {"ok": True}

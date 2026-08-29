"""Механизм (Автокран г.м.) — өдрийн ажлын log, орлого/зарлага, машин бүрийн ашиг."""
import re
from datetime import date
# Талбарын нэр нь `date` (LogPatch) — pydantic аннотацийг АНГИЙН орчинд нээдэг
# тул `date | None` нь «None | None» болж унана. contracts.py-тай ижил ялгуулагч.
from datetime import date as _date_t
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, auth
from ..services import audit, pdfmachine

router = APIRouter(prefix="/api")

# Log бичих, засах, нэхэмжлэх гаргах — гурван рольд адилхан нээлттэй (машин
# ӨӨРӨӨ үүсгэх/зогсоох нь менежерийнх).
guard = auth.require_roles("manager", "factory", "finance")


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


def _safe(name: str) -> str:
    """Файлын нэрэнд оруулж болох тэмдэгт л үлдээнэ (M-26/05-1 → M-26-05-1)."""
    return re.sub(r"[^0-9A-Za-z._-]+", "-", name).strip("-") or "file"


def machine_ser(m: models.Machine):
    income = sum(l.amount for l in m.logs if l.entry == "job")
    expense = sum(l.amount for l in m.logs if l.entry == "expense")
    return {"id": m.id, "name": m.name, "note": m.note, "active": m.active,
            "income": round(income), "expense": round(expense),
            "net": round(income - expense), "log_count": len(m.logs)}


def log_ser(l: models.MachineLog):
    return {"id": l.id, "date": str(l.date), "entry": l.entry, "label": l.label,
            "client": l.client, "amount": l.amount, "method": l.method, "note": l.note}


def invoice_ser(inv: models.MachineInvoice):
    return {"id": inv.id, "no": inv.no, "client": inv.client,
            "d_from": str(inv.d_from), "d_to": str(inv.d_to),
            "total": inv.total, "vat": inv.vat, "grand_total": inv.grand_total}


def billable_jobs(m: models.Machine, client: str, d_from: date, d_to: date):
    """Нэхэмжлэхэд ОРОХ мөрүүд — дүрэм НЭГ газар (роутер ба PDF хоёулаа эндээс).

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


def _vat_percent(db: Session) -> float:
    """Компанийн НӨАТ% — тохиргооноос. Жигүүр Зам одоогоор НӨАТ-гүй тул
    түлхүүр байхгүй = 0, гэрээний `vat_percent`-ийн анхны утгатай ижил."""
    row = db.get(models.Setting, "vat_percent")
    try:
        return float(row.value) if row and row.value else 0.0
    except ValueError:
        return 0.0


def _next_no(db: Session, today: date) -> str:
    """`M-YY/MM-N` — N нь тухайн он/сар дотор нэмэгдэнэ.

    Гэрээний дугаарлалттай ижил хэв маяг: тоолуураас эхэлж, эзэлсэн дугаар
    таарвал урагшилна (`no` нь unique тул мөргөлдөөн чимээгүй өнгөрөхгүй)."""
    head = f"M-{today:%y/%m}-"
    n = db.query(models.MachineInvoice).filter(
        models.MachineInvoice.no.like(head + "%")).count() + 1
    while db.query(models.MachineInvoice).filter_by(no=f"{head}{n}").first():
        n += 1
    return f"{head}{n}"


def _machine(db: Session, mid: int) -> models.Machine:
    m = db.get(models.Machine, mid)
    if not m:
        raise HTTPException(404, "Машин олдсонгүй")
    return m


@router.get("/machines")
def list_machines(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    # Зогссон машин жагсаалтын СҮҮЛД — өдөр тутмын ажил идэвхтэйгээрээ эхэлнэ.
    machines = sorted(db.query(models.Machine).all(), key=lambda m: (-m.active, m.id))
    total_in = sum(l.amount for m in machines for l in m.logs if l.entry == "job")
    total_ex = sum(l.amount for m in machines for l in m.logs if l.entry == "expense")
    return {"machines": [machine_ser(m) for m in machines],
            "summary": {"income": round(total_in), "expense": round(total_ex),
                        "net": round(total_in - total_ex)}}


@router.get("/machines/{mid}/logs")
def machine_logs(mid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    m = _machine(db, mid)
    invs = db.query(models.MachineInvoice).filter_by(machine_id=mid).order_by(
        models.MachineInvoice.id.desc()).all()
    return {**machine_ser(m),
            "logs": [log_ser(l) for l in sorted(m.logs, key=lambda l: (l.date, l.id), reverse=True)],
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
    return log_ser(l)


def _log(db: Session, lid: int) -> models.MachineLog:
    l = db.get(models.MachineLog, lid)
    if not l:
        raise HTTPException(404, "Бүртгэл олдсонгүй")
    return l


@router.patch("/machine-logs/{lid}")
def patch_log(lid: int, body: LogPatch, db: Session = Depends(get_db), user=Depends(guard)):
    """Inline засвар — огноо, ажил, харилцагч, дүн, хэлбэр, тэмдэглэл."""
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
    return log_ser(l)


@router.delete("/machine-logs/{lid}")
def delete_log(lid: int, db: Session = Depends(get_db), user=Depends(guard)):
    l = _log(db, lid)
    detail = (f"{l.machine.name} · {l.date} · {l.label or l.entry} · "
              f"{l.client or '—'} · {l.amount:,.0f}₮")
    db.delete(l)
    db.commit()
    audit.log(db, user, "delete", "machine_log", lid, detail)
    return {"ok": True}


# ---------- Механизмын нэхэмжлэх (тусдаа баримт) ----------

@router.post("/machines/{mid}/invoices")
def create_invoice(mid: int, body: InvoiceIn, db: Session = Depends(get_db),
                   user=Depends(guard)):
    m = _machine(db, mid)
    if body.d_from > body.d_to:
        raise HTTPException(400, "Эхлэх огноо дуусах огнооноос хойш байж болохгүй")
    rows = billable_jobs(m, body.client, body.d_from, body.d_to)
    if not rows:
        raise HTTPException(400, "Тухайн хугацаанд энэ харилцагчийн нэхэмжлэх ажил олдсонгүй")
    total = sum(l.amount for l in rows)
    vat = total * _vat_percent(db) / 100
    inv = models.MachineInvoice(machine_id=mid, no=_next_no(db, date.today()),
                                client=body.client.strip(), d_from=body.d_from,
                                d_to=body.d_to, total=total, vat=vat,
                                grand_total=total + vat)
    db.add(inv)
    db.commit()
    audit.log(db, user, "create", "machine_invoice", inv.id,
              f"{m.name} · №{inv.no} · {inv.client} · {body.d_from}–{body.d_to} · "
              f"{len(rows)} мөр · {inv.grand_total:,.0f}₮")
    return {**invoice_ser(inv), "rows": len(rows)}


def _invoice(db: Session, iid: int) -> models.MachineInvoice:
    inv = db.get(models.MachineInvoice, iid)
    if not inv:
        raise HTTPException(404, "Нэхэмжлэх олдсонгүй")
    return inv


@router.get("/machine-invoices/{iid}/pdf")
def invoice_pdf(iid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    inv = _invoice(db, iid)
    rows = billable_jobs(inv.machine, inv.client, inv.d_from, inv.d_to)
    pdf = pdfmachine.machine_invoice_pdf(db, inv, rows)
    # №-д ташуу зураас байдаг (M-26/05-1) — файлын нэрэнд орвол зам болж эвдэрнэ.
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="mehanizm-{_safe(inv.no)}.pdf"'})


@router.delete("/machine-invoices/{iid}")
def delete_invoice(iid: int, db: Session = Depends(get_db), user=Depends(guard)):
    """Баримт устгана — ЛЕДЖЕР биш тул үлдэгдэлд юу ч хөдлөхгүй (log мөрүүд хэвээр)."""
    inv = _invoice(db, iid)
    detail = f"№{inv.no} · {inv.client} · {inv.grand_total:,.0f}₮"
    db.delete(inv)
    db.commit()
    audit.log(db, user, "delete", "machine_invoice", iid, detail)
    return {"ok": True}

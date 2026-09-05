"""ТООЦООНЫ ХУУЛГА — харилцагчийн хуудас БҮХЭЛДЭЭ, нэг цаасан дээр.

Отгоо эгчийн дэвтэрт харилцагч бүр ӨӨРИЙН ХУУДАСТАЙ байдаг: дээр нь өмнөх
үлдэгдэл, доогуур нь өдөр өдрөөр нэмэгдсэн түрээс, орж ирсэн төлбөр, хажууд
нь мөр бүрийн дараах ҮЛДЭГДЭЛ. Тэр хуудсыг харилцагч руу явуулж «ийм байна,
тааруулъя» гэдэг. Систем нь нэхэмжлэл (нэг цикл), хавсралт (нэг циклийн
задаргаа), акт (нэг гэрээ) гурвыг гаргадаг байсан ч ХАРИЛЦАГЧИЙН БҮТЭН
ХУУДСЫГ гаргадаггүй байв — тэр л энэ файл.

ХОЁР БАТАЛГАА (энэ хуудсыг итгэл хүлээх болгодог зүйл):

1. МӨРИЙН АРИФМЕТИК ИЛ: мөр бүрд `үлдэгдэл = өмнөх + нэмэгдсэн − төлсөн`.
   Тоон багана дээр нэмж хасахад ёроолын тоо ГАРНА — гараар шалгаж болно.
2. ЁРООЛЫН ТОО НЬ ДЭЛГЭЦИЙНХТЭЙ ЯГ ИЖИЛ: `Авлагын үлдэгдэл` мөр нь
   `billing.client_receivable(...)["total"]`-той таарна. Хоёр газар хоёр өөр
   тоо гарвал бүх шилжилтийн шалтгаан унана (H9b — нэг тодорхойлолт).

ХОЁРЫГ ЗЭРЭГ БАРИХЫН ТУЛД гурван шийдвэр:

· ТӨЛСӨН багана нь АВЛАГЫГ БУУРУУЛСАН хэсэг (`principal` хуваарилалт).
  Алдангид явсан ба хуваарилагдаагүй үлдсэн мөнгө нь авлагыг хөдөлгөдөггүй
  тул баганад орвол ёроолын тоо дэлгэцээсээ сална. Гэхдээ тэр мөнгө НУУГДАХГҮЙ:
  мөрийн утган дээр «нийт …₮ — алдангид …₮» гэж бичигдэнэ.
· АЛДАНГИ нь тоон баганад ОРОХГҮЙ (H2 — алданги нь авлага БИШ, хоёр дахь
  нүүр). Нэхсэн явдал нь мөр болж он цагийн дараалалдаа зогсоно, дүн нь
  утган дотроо явна, үлдэгдэл нь ХӨДӨЛӨХГҮЙ.
· НЭХЭМЖЛЭГДЭЭГҮЙ ТҮРЭЭС (явагдаж буй цикл) нь өөрийн мөртэй: тэр нь
  баримт БОЛООГҮЙ мөнгө тул хуулгын мөрүүдийн дунд зогсох ёсгүй, гэвч
  дэлгэц дээрх «Авлагын үлдэгдэл» түүнийг ОРУУЛЖ тоолдог.

`pdfappendix.py`-ийн загвараар: цэвэр `build_statement` (DB уншина, зурахгүй)
ба `render_statement` (зурна, боддоггүй) ХОЁР тусдаа. pt нэгж, абсолют
байрлуулалт, `pdflayout`-ийн примитивүүд.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.orm import Session

from .. import models
from . import billing
from .pdfgen import _company, _money
from .pdflayout import (A4, INK, MARGIN, MUTED, Doc, cell_row, draw_header, ensure_space,
                        move_down, rule, start_doc, text, wrap_to_width)

TITLE = "ТООЦООНЫ ХУУЛГА"

# ---- Баганын байрлал (цэг) ----
RIGHT = A4[0] - MARGIN
COL_DATE = MARGIN
COL_TEXT = 106
COL_ADD = 286
COL_PAID = 366
COL_BAL = 446
#: Нүдний тор — багана бүрийн зүүн ирмэг.
COLS = [COL_DATE, COL_TEXT, COL_ADD, COL_PAID, COL_BAL, RIGHT]
#: Ёроолын дүнгийн мөрүүд зөвхөн баруун талыг эзэлнэ (шошго | дүн).
TOTALS_COLS = [COL_TEXT, COL_BAL, RIGHT]

#: Баруун тэгшилсэн тоо хүрээндээ наалдахгүйн тулд 6 цэг амьсгал.
PAD = 6
W_TEXT = COL_ADD - COL_TEXT - PAD
W_ADD = COL_PAID - COL_ADD - PAD
W_PAID = COL_BAL - COL_PAID - PAD
W_BAL = RIGHT - COL_BAL - PAD

ROW_SIZE = 8.5
ROW_STEP = 16
CONT_STEP = 10
CELL_PAD_TOP = 11
CELL_PAD_BOT = ROW_STEP - CELL_PAD_TOP

#: Төлбөрийн хэлбэрийн үг — `routers/clients.py`-ийн он цагийн хэлхээтэй ИЖИЛ
#: (нэг ойлголт — нэг үг, UI-ЗАРЧИМ §3).
METHOD_MN = {"CASH": "Бэлэн", "BANK": "Данс", "BARTER": "Бартер",
             "CREDIT": "Тооцоогоор хаасан"}

#: Нэг өдөрт таарсан явдлуудын дараалал — эхлээд НЭХЭМЖЛЭГДСЭН, дараа нь
#: нэхэгдсэн алданги, эцэст нь ОРЖ ИРСЭН мөнгө (дэвтрийн уншигдах дараалал).
_RANK = {"invoice": 0, "penalty": 1, "payment": 2}


@dataclass
class StatementRow:
    """Хуулгын нэг мөр — нэг ЯВДАЛ.

    `debit` (Нэмэгдсэн) ба `credit` (Төлсөн) нь АВЛАГЫГ хөдөлгөсөн дүн;
    `balance` нь тэр мөрийн ДАРААХ үлдэгдэл. Алдангийн мөрд хоёул 0 —
    дүн нь `penalty` талбарт (мөн утган дотор) явна.
    """

    date: date
    text: str
    debit: float = 0.0
    credit: float = 0.0
    balance: float = 0.0
    kind: str = "invoice"       # invoice | payment | penalty
    #: ЗӨВХӨН `kind == "penalty"` — нэхэгдсэн алдангийн дүн (авлагад ОРОХГҮЙ).
    penalty: float = 0.0


@dataclass
class Statement:
    """Зурахад бэлэн хуулга — DB-гүй, зөвхөн тоо ба текст."""

    client_name: str
    d_from: date
    d_to: date
    #: `d_from`-ын ӨМНӨХ бүх явдлаас үлдсэн авлага.
    opening: float = 0.0
    rows: list[StatementRow] = field(default_factory=list)
    #: `d_to`-гийн байдлаарх НЭХЭМЖИЛСЭН үлдэгдэл (= opening + Σ мөр).
    closing: float = 0.0
    #: Явагдаж буй циклийн хуримтлал — `d_to` өнөөдөр байхад л утгатай.
    accrual: float = 0.0
    #: closing + accrual — дэлгэц дээрх «Авлагын үлдэгдэл»-тэй ЯГ ижил тоо.
    total: float = 0.0
    #: Хугацаанд нэхэгдсэн алданги (тоон баганаас ГАДНА, зөвхөн мэдээлэл).
    penalty_charged: float = 0.0


# ---------- утга (текст) ----------

def _entry_label(inv: models.Invoice) -> str:
    """Харилцагчийн дансны бичилтээс төрсөн нэхэмжлэлийн ШОШГО.

    `detail_json` нь `{"note": …, "label": …}` (services/entries.py) эсвэл
    шилжүүлэлтийн `{"note": "Хуучин системийн үлдэгдэл"}`. Уншигдахгүй бол
    хоосон — дуудагч нь дугаараар нь нэрлэнэ.
    """
    try:
        d = json.loads(inv.detail_json or "{}")
    except (ValueError, TypeError):
        return ""
    if not isinstance(d, dict):
        return ""
    return str(d.get("label") or d.get("note") or "")


def invoice_text(inv: models.Invoice) -> str:
    """Нэхэмжлэлийн мөрийн УТГА — «энэ мөнгө юуны төлөө вэ»."""
    c = inv.contract
    if (inv.no or "").startswith(billing.OPENING_PREFIX):
        # Хуучин үлдэгдэл нь ГЭРЭЭ БИШ (routers/clients.py-ийн хэлхээтэй ижил үг).
        return f"Хуучин үлдэгдэл — {inv.cycle_start} хүртэл"
    if billing.is_opening_invoice(inv):
        # Дансан дээрх түрээс БИШ бичилт (H11) — өөрийн өгүүлбэртэй.
        return _entry_label(inv) or f"Харилцагчийн дансны бичилт {inv.no}"
    if c.type == "sale":
        return f"Худалдаа · гэрээ №{c.no}"
    return (f"Түрээс {billing.cycle_label(inv.cycle_start, inv.cycle_end)} "
            f"· гэрээ №{c.no}")


def payment_parts(p: models.Payment) -> tuple[float, float, float]:
    """Төлбөрийг ГУРВАН хэсэгт: (авлага хаасан, алданги хаасан, хуваарилагдаагүй).

    ЗӨВХӨН эхнийх нь авлагыг бууруулна — хуулгын «Төлсөн» багана тэр тоог
    авна. Үлдсэн хоёр нь мөрийн утган дээр НЭРЛЭГДЭНЭ (мөнгө нуугдахгүй).
    """
    principal = sum(a.amount for a in p.allocations if a.part != "penalty")
    penalty = sum(a.amount for a in p.allocations if a.part == "penalty")
    return principal, penalty, round(p.amount - principal - penalty, 2)


def payment_text(p: models.Payment) -> str:
    """Төлбөрийн мөрийн утга — хэлбэр, тайлбар, задарсан хэсгүүд."""
    desc = (p.barter_desc or p.note or "").strip()
    head = f"Төлбөр — {METHOD_MN.get(p.method, p.method)}"
    if desc:
        head += f" {desc}"
    _, penalty, free = payment_parts(p)
    extras = []
    if penalty > 0.005:
        extras.append(f"алдангид {_money(penalty)}")
    if free > 0.005:
        extras.append(f"хуваарилагдаагүй {_money(free)}")
    if extras:
        head += f" (нийт {_money(p.amount)} — {' · '.join(extras)})"
    return head


def penalty_text(ch: models.PenaltyCharge) -> str:
    """Алдангийн мөр — дүн нь УТГАН дотроо, тоон баганад ОРОХГҮЙ (H2)."""
    return (f"Алданги нэхэв {_money(ch.amount)} — гэрээ №{ch.contract.no} "
            f"(авлагын үлдэгдэлд ОРООГҮЙ)")


# ---------- өгөгдөл цуглуулах ----------

def _events(db: Session, client: models.Client, d_to: date) -> list[StatementRow]:
    """`d_to` хүртэлх БҮХ амьд явдал, огнооны дарааллаар (үлдэгдэл бодоогүй).

    ХҮЧИНГҮЙ болсон мөр ОРОХГҮЙ: хуулга нь тооцоо тул `LIVE_*` шүүлтүүрүүд
    заавал. (Дэлгэц дээрх жагсаалт нь ЭСРЭГЭЭР — тэнд цуцлагдсан мөр
    ХАРАГДСААР үлддэг, учир нь тэр өдөр бичилт хийгдсэн нь үнэн.)
    """
    rows: list[StatementRow] = []

    invoices = (db.query(models.Invoice).join(models.Contract)
                .filter(models.Contract.client_id == client.id)
                .filter(billing.LIVE_INVOICE)
                .filter(models.Invoice.due_date <= d_to).all())
    for inv in invoices:
        rows.append(StatementRow(date=inv.due_date, text=invoice_text(inv),
                                 debit=round(inv.total, 2), kind="invoice"))

    payments = (db.query(models.Payment).filter_by(client_id=client.id)
                .filter(billing.LIVE_PAYMENT)
                .filter(models.Payment.date <= d_to).all())
    for p in payments:
        principal, _, _ = payment_parts(p)
        rows.append(StatementRow(date=p.date, text=payment_text(p),
                                 credit=round(principal, 2), kind="payment"))

    charges = (db.query(models.PenaltyCharge).filter_by(client_id=client.id)
               .filter(billing.LIVE_CHARGE)
               .filter(models.PenaltyCharge.as_of <= d_to).all())
    for ch in charges:
        rows.append(StatementRow(date=ch.as_of, text=penalty_text(ch),
                                 kind="penalty", penalty=round(ch.amount, 2)))

    rows.sort(key=lambda r: (r.date, _RANK.get(r.kind, 9), r.text))
    return rows


def first_event_date(db: Session, client: models.Client) -> date | None:
    """Харилцагчийн ХАМГИЙН ЭХНИЙ явдлын өдөр — хуулгын анхны `from`.

    Хуучин үлдэгдлийн нэхэмжлэл, анхны амьд нэхэмжлэл, анхны амьд төлбөр
    гурвын аль ЭРТ нь. Нэг ч явдалгүй бол `None` (дуудагч өнөөдрийг авна).
    """
    days: list[date] = []
    inv = (db.query(models.Invoice.due_date).join(models.Contract)
           .filter(models.Contract.client_id == client.id)
           .filter(billing.LIVE_INVOICE)
           .order_by(models.Invoice.due_date).first())
    if inv:
        days.append(inv[0])
    pay = (db.query(models.Payment.date).filter_by(client_id=client.id)
           .filter(billing.LIVE_PAYMENT)
           .order_by(models.Payment.date).first())
    if pay:
        days.append(pay[0])
    return min(days) if days else None


def build_statement(db: Session, client: models.Client, d_from: date,
                    d_to: date) -> Statement:
    """[d_from, d_to] хугацааны хуулгыг ГАРГАНА (зурахгүй).

    ЭХНИЙ ҮЛДЭГДЭЛ нь `d_from`-оос ӨМНӨХ бүх явдлын нийлбэр — хуучин
    үлдэгдлийн нэхэмжлэл БҮТНЭЭРЭЭ (тэр өөрөө «түүнээс өмнөх бүхэн» гэсэн
    утгатай) тэнд орно.

    ЁРООЛЫН ТОО: `total = closing + accrual`. `d_to` өнөөдөр (эсвэл түүнээс
    хойш) бол энэ нь `billing.client_receivable(client)["total"]`-той ЯГ
    таарна — дэлгэц дээрх «Авлагын үлдэгдэл» ба цаасан дээрх сүүлийн тоо
    хоёр ЗӨРВӨЛ шилжилтийн шалтгаан унана (H9b).

    ⚠ ИРЭЭДҮЙН ОГНООТОЙ бичилт (гараар өдрийг нь урагшлуулсан) `d_to`-гийн
    цаана үлдэнэ — тэр нь хуулгын хувьд ЗӨВ (тухайн өдрийн байдлаарх зураг),
    гэхдээ авлагын нийт тоонд аль хэдийн ордог тул зөрүү үүсгэж болно.
    """
    today = date.today()
    events = _events(db, client, d_to)

    opening = 0.0
    rows: list[StatementRow] = []
    for ev in events:
        if ev.date < d_from:
            opening = round(opening + ev.debit - ev.credit, 2)
        else:
            rows.append(ev)

    run = opening
    for r in rows:
        run = round(run + r.debit - r.credit, 2)
        r.balance = run

    # Явагдаж буй цикл — БАРИМТ БОЛООГҮЙ мөнгө. Зөвхөн «өнөөдрийн» хуулга
    # түүнийг мэдэх ёстой: өнгөрсөн хугацааны хуулга дээр тэр тоо утгагүй.
    accrual = 0.0
    if d_to >= today:
        accrual = round(billing.client_receivable(client, today)["uninvoiced"], 2)

    return Statement(
        client_name=client.name, d_from=d_from, d_to=d_to,
        opening=opening, rows=rows, closing=run, accrual=accrual,
        total=round(run + accrual, 2),
        penalty_charged=round(sum(r.penalty for r in rows), 2))


# ---------- зурах ----------

def period_text(st: Statement) -> str:
    return f"{st.d_from} – {st.d_to}"


def _table_header(doc: Doc) -> None:
    """Баганы толгой — БҮРЭН нүдтэй, хуудас тасрах бүрд дахин (on_new_page)."""
    top = doc.y
    move_down(doc, CELL_PAD_TOP)
    text(doc, "Огноо", size=9, bold=True, color=INK)
    text(doc, "Утга", size=9, bold=True, color=INK, x=COL_TEXT, width=W_TEXT)
    text(doc, "Нэмэгдсэн", size=9, bold=True, color=INK, x=COL_ADD, width=W_ADD,
         align="right")
    text(doc, "Төлсөн", size=9, bold=True, color=INK, x=COL_PAID, width=W_PAID,
         align="right")
    text(doc, "Үлдэгдэл", size=9, bold=True, color=INK, x=COL_BAL, width=W_BAL,
         align="right")
    bottom = doc.y + CELL_PAD_BOT
    cell_row(doc, COLS, top, bottom)
    doc.y = bottom + CELL_PAD_TOP


def _ledger_row(doc: Doc, day: str, lines: list[str], add: str, paid: str,
                bal: str, *, bold: bool = False) -> None:
    """Нэг мөр зурна — нүдний хүрээ нь үргэлжлэл мөрүүдийг ч хамарна."""
    b0 = doc.y
    text(doc, day, size=ROW_SIZE, bold=bold)
    text(doc, lines[0], size=ROW_SIZE, bold=bold, x=COL_TEXT, width=W_TEXT)
    text(doc, add, size=ROW_SIZE, bold=bold, x=COL_ADD, width=W_ADD, align="right")
    text(doc, paid, size=ROW_SIZE, bold=bold, x=COL_PAID, width=W_PAID, align="right")
    text(doc, bal, size=ROW_SIZE, bold=bold, x=COL_BAL, width=W_BAL, align="right")
    for cont in lines[1:]:
        move_down(doc, CONT_STEP)
        text(doc, cont, size=ROW_SIZE, color=MUTED, x=COL_TEXT, width=W_TEXT)
    cell_row(doc, COLS, b0 - CELL_PAD_TOP, doc.y + CELL_PAD_BOT)
    move_down(doc, ROW_STEP)


def _total_row(doc: Doc, label: str, value: float, strong: bool = False) -> None:
    """Ёроолын дүнгийн мөр — БҮРЭН нүдтэй (шошго | дүн)."""
    advance = 18 if strong else 14
    top = doc.y - CELL_PAD_TOP
    text(doc, label, size=12 if strong else 10, bold=strong, color=INK,
         x=COL_TEXT, width=COL_BAL - COL_TEXT - 8, align="right")
    text(doc, _money(value), size=12 if strong else 10, bold=strong, color=INK,
         x=COL_BAL, width=W_BAL, align="right")
    cell_row(doc, TOTALS_COLS, top, top + advance)
    move_down(doc, advance)


def _render(st: Statement, company: dict, logo_path: str | None = None):
    """Хуулгыг зурж `FPDF`-ээ БУЦААНА (байт биш) — хуудасны тоог тестлэх цорын
    ганц арга нь `pages_count` (төсөлд PDF задлах сан алга)."""
    doc = start_doc()
    draw_header(doc, company, TITLE, period_text(st), logo_path)

    text(doc, f"Харилцагч: {st.client_name}", size=10, bold=True)
    text(doc, f"Хугацаа: {period_text(st)}", size=9, color=MUTED, align="right")
    move_down(doc, 20)
    rule(doc)
    move_down(doc, 14)

    _table_header(doc)
    doc.on_new_page = _table_header

    # ЭХНИЙ МӨР нь ҮЛДЭГДЭЛ — хуудас нь тэгээс эхэлдэггүй.
    ensure_space(doc, 24)
    _ledger_row(doc, str(st.d_from), [f"{st.d_from} өдрийн үлдэгдэл"], "", "",
                _money(st.opening), bold=True)

    for r in st.rows:
        lines = wrap_to_width(doc, r.text, ROW_SIZE, W_TEXT)
        ensure_space(doc, 24 + (len(lines) - 1) * CONT_STEP)
        # Алдангийн мөр нь тоон баганад юу ч бичихгүй, үлдэгдэл нь ХӨДӨЛӨХГҮЙ.
        _ledger_row(doc, str(r.date), lines,
                    _money(r.debit) if r.debit else "",
                    _money(r.credit) if r.credit else "",
                    _money(r.balance))
    doc.on_new_page = None

    totals = 8 + 14 + (14 if st.accrual else 0) + 18 + CELL_PAD_TOP + CELL_PAD_BOT
    ensure_space(doc, totals)
    move_down(doc, 8)
    _total_row(doc, f"{st.d_to} өдрийн үлдэгдэл", st.closing)
    if st.accrual:
        _total_row(doc, "Нэхэмжлэгдээгүй түрээс (энэ цикл)", st.accrual)
    _total_row(doc, "Авлагын үлдэгдэл", st.total, strong=True)

    if st.penalty_charged:
        # Алданги нь ДЭЭРХ тооны ГАДНА — тэр хоёр нүүр нэг тоо болж
        # нийлэхгүй (H2). Тиймээс ёроолд ТУСДАА нэрлэнэ.
        ensure_space(doc, 20)
        move_down(doc, 12)
        text(doc, f"Нэхэгдсэн алданги (авлагаас ТУСДАА): "
                  f"{_money(st.penalty_charged)}", size=8.5, color=MUTED)

    move_down(doc, 32)
    ensure_space(doc, 12)
    text(doc, "Тооцоо гаргасан: ..............................", size=9, color=MUTED)
    text(doc, "Харилцагч хүлээн авсан: ..............................", size=9,
         color=MUTED, align="right")
    return doc.pdf


def render_statement(db: Session, st: Statement, logo_path: str | None = None) -> bytes:
    """Хуулгыг PDF байт болгоно. `db` нь ЗӨВХӨН компанийн нэрэнд хэрэгтэй."""
    return bytes(_render(st, {"name": _company(db)}, logo_path).output())


def client_statement_pdf(db: Session, client: models.Client, d_from: date,
                         d_to: date) -> bytes:
    """Хоёр алхмын нэг орох цэг — роутерийн дуудлага."""
    return render_statement(db, build_statement(db, client, d_from, d_to))

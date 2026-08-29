"""МЕХАНИЗМЫН НЭХЭМЖЛЭХ — краны ажлын өдрүүдийг харилцагч руу гаргах баримт.

`pdfgen.py` дотор ЗОРИУДААР ороогүй: тэр файл mm нэгжтэй, `cell`/`ln`-ээр урсдаг
бол энэ нь `pdfappendix.py`-тай ижил — pt нэгжтэй, `pdflayout`-ийн абсолют
примитивүүдээр байрлана. Хоёр баримт ижил толгой, ижил тор, ижил нийт дүнгийн
блоктой болж НЭГ ГЭР БҮЛ болж уншигдана.

Энэ баримт нь АВЛАГА ҮҮСГЭХГҮЙ (models.MachineInvoice-ийн тайлбарыг үзнэ үү):
төлбөрийн бодит байдал нь log мөрийн `method` дээр байгаа тул энд «Төлсөн»,
«Үлдэгдэл» мөр байхгүй — зөвхөн ямар ажлын төлөө хэдэн төгрөг нэхэж байгаа.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from .pdfgen import _company, _money
from .pdflayout import (A4, INK, MARGIN, MUTED, Doc, cell_row, draw_header, ensure_space,
                        fit, move_down, rule, start_doc, text, wrap_to_width)

# ---- Баганын байрлал (цэгээр). Хавсралттай ижил хэмнэл, өөр багана. ----
RIGHT = A4[0] - MARGIN
COL_DATE = MARGIN
COL_LABEL = 130
# 345 нь санамсаргүй тоо биш: «Төлбөрийн хэлбэр» толгой 9pt бүдүүнээр 95.6 цэг
# эзэлдэг тул 360-аас эхэлсэн багана (87 цэг) толгойгоо Дүнгийн багана руу
# халиулж хэвлэдэг байв. 345 → 102 цэг = толгой БАГТАНА.
COL_METHOD = 345
COL_AMOUNT = 455
# Ажлын нэрний багана — төлбөрийн хэлбэрийн баганаас 8 цэг зайтай зогсоно.
LABEL_WIDTH = COL_METHOD - COL_LABEL - 8

ROW_SIZE = 8.5
ROW_STEP = 16
CONT_STEP = 10

COLS = [MARGIN, COL_LABEL, COL_METHOD, COL_AMOUNT, RIGHT]
TOTALS_COLS = [COL_METHOD, COL_AMOUNT, RIGHT]
CELL_PAD_TOP = 11
CELL_PAD_BOT = ROW_STEP - CELL_PAD_TOP

TITLE = "МЕХАНИЗМЫН НЭХЭМЖЛЭХ"

METHODS = {"CASH": "Бэлэн", "BANK": "Данс", "BARTER": "Бартер", "INTERNAL": "Дотоод"}


@dataclass
class MachineRow:
    """Нэг ажлын өдөр — огноо, юу хийсэн, хэрхэн төлөгдсөн, хэд."""

    date: date
    label: str
    method: str
    amount: float
    note: str = ""


@dataclass
class MachineBill:
    """Зурахад бэлэн нэхэмжлэх — DB-гүй, зөвхөн тоо ба текст."""

    no: str
    machine_name: str
    client_name: str
    period_start: date
    period_end: date
    rows: list[MachineRow] = field(default_factory=list)
    subtotal: float = 0.0
    vat: float = 0.0
    total: float = 0.0


def _table_header(doc: Doc) -> None:
    """Баганы толгой — БҮРЭН нүдтэй. Хуудас тасрах бүрд дахин зурагдана."""
    top = doc.y
    move_down(doc, CELL_PAD_TOP)
    text(doc, "Огноо", size=9, bold=True, color=INK)
    text(doc, "Ажил", size=9, bold=True, color=INK, x=COL_LABEL, width=LABEL_WIDTH)
    text(doc, "Төлбөрийн хэлбэр", size=9, bold=True, color=INK, x=COL_METHOD,
         width=COL_AMOUNT - COL_METHOD - 8)
    text(doc, "Дүн", size=9, bold=True, color=INK, x=COL_AMOUNT, width=RIGHT - COL_AMOUNT,
         align="right")
    bottom = doc.y + CELL_PAD_BOT
    cell_row(doc, COLS, top, bottom)
    doc.y = bottom + CELL_PAD_TOP


def _total_row(doc: Doc, label: str, value: float, strong: bool = False) -> None:
    """Дүнгийн мөр — БҮРЭН нүдтэй (шошго | дүн), хавсралттай ижил хэмжээ/тон."""
    advance = 18 if strong else 14
    top = doc.y - CELL_PAD_TOP
    text(doc, label, size=12 if strong else 10, bold=strong, color=INK,
         x=COL_METHOD, width=COL_AMOUNT - COL_METHOD - 8, align="right")
    text(doc, _money(value), size=12 if strong else 10, bold=strong, color=INK,
         x=COL_AMOUNT, width=RIGHT - COL_AMOUNT, align="right")
    cell_row(doc, TOTALS_COLS, top, top + advance)
    move_down(doc, advance)


def _render(bill: MachineBill, company: dict, logo_path: str | None = None):
    """Нэхэмжлэхийг зурж `FPDF`-ээ БУЦААНА (байт биш) — хуудасны тоог тестлэх
    цорын ганц арга (`pdfappendix._render`-тэй ижил гэрээ)."""
    doc = start_doc()
    draw_header(doc, company, TITLE, f"{bill.period_start} - {bill.period_end}", logo_path)

    text(doc, f"Харилцагч: {bill.client_name}", size=10, bold=True)
    text(doc, f"№{bill.no}", size=9, color=MUTED, align="right")
    move_down(doc, 14)
    text(doc, f"Механизм: {bill.machine_name}", size=9, color=MUTED)
    text(doc, f"Хугацаа: {bill.period_start} - {bill.period_end}", size=9, color=MUTED,
         align="right")
    move_down(doc, 20)
    rule(doc)
    move_down(doc, 14)

    _table_header(doc)
    doc.on_new_page = _table_header
    for row in bill.rows:
        # Ажлын нэрний ҮРГЭЛЖЛЭЛ нь ижил тод (INK) — тэр нь нэг өгүүлбэрийн
        # үлдэгдэл. Зөвхөн ТЭМДЭГЛЭЛ бүдэг (MUTED): тэр нь өөр төрлийн мэдээлэл.
        label_lines = wrap_to_width(doc, row.label or "Ажил", ROW_SIZE, LABEL_WIDTH)
        note_lines = wrap_to_width(doc, row.note, ROW_SIZE, LABEL_WIDTH) if row.note else []
        lines = label_lines + note_lines
        ensure_space(doc, 24 + (len(lines) - 1) * CONT_STEP)
        b0 = doc.y
        text(doc, str(row.date), size=ROW_SIZE)
        text(doc, lines[0], size=ROW_SIZE, x=COL_LABEL, width=LABEL_WIDTH)
        # Хэлбэр нь богино шошго ч гэсэн дүнгийн багана руу халихыг зөвшөөрөхгүй.
        text(doc, fit(doc, METHODS.get(row.method, row.method or "-"),
                      COL_AMOUNT - COL_METHOD - 8, size=ROW_SIZE),
             size=ROW_SIZE, x=COL_METHOD, width=COL_AMOUNT - COL_METHOD - 8)
        text(doc, _money(row.amount), size=ROW_SIZE, x=COL_AMOUNT, width=RIGHT - COL_AMOUNT,
             align="right")
        for i, continuation in enumerate(lines[1:], start=1):
            move_down(doc, CONT_STEP)
            text(doc, continuation, size=ROW_SIZE, x=COL_LABEL, width=LABEL_WIDTH,
                 color=INK if i < len(label_lines) else MUTED)
        cell_row(doc, COLS, b0 - CELL_PAD_TOP, doc.y + CELL_PAD_BOT)
        move_down(doc, ROW_STEP)
    doc.on_new_page = None

    totals = 8 + 14 + (14 if bill.vat > 0 else 0) + 18 + CELL_PAD_TOP + CELL_PAD_BOT
    ensure_space(doc, totals)
    move_down(doc, 8)
    _total_row(doc, "Дэд дүн", bill.subtotal)
    # НӨАТ-гүй компанид «НӨАТ 0₮» мөр нь эргэлзээ төрүүлнэ — хэвлэхгүй.
    if bill.vat > 0:
        _total_row(doc, "НӨАТ", bill.vat)
    _total_row(doc, "Нийт", bill.total, strong=True)

    move_down(doc, 32)
    ensure_space(doc, 12)
    text(doc, "Нэхэмжилсэн: ..............................", size=9, color=MUTED)
    text(doc, "Харилцагч хүлээн авсан: ..............................", size=9, color=MUTED,
         align="right")
    return doc.pdf


def build_bill(inv, logs) -> MachineBill:
    """DB мөрүүдээс зурахад бэлэн нэхэмжлэх — `db` хэрэггүй тул шууд тестлэгдэнэ."""
    rows = [MachineRow(date=l.date, label=l.label, method=l.method, amount=l.amount,
                       note=l.note)
            for l in sorted(logs, key=lambda l: (l.date, l.id))]
    return MachineBill(no=inv.no, machine_name=inv.machine.name, client_name=inv.client,
                       period_start=inv.d_from, period_end=inv.d_to, rows=rows,
                       subtotal=inv.total, vat=inv.vat, total=inv.grand_total)


def machine_invoice_pdf(db, inv, logs, logo_path: str | None = None) -> bytes:
    """Нэхэмжлэхийг PDF байт болгоно. `db` нь ЗӨВХӨН компанийн нэрэнд хэрэгтэй."""
    return bytes(_render(build_bill(inv, logs), {"name": _company(db)}, logo_path).output())

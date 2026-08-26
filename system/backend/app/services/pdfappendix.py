"""ТҮРЭЭСИЙН ТООЦООНЫ ХАВСРАЛТ — циклийн тооцоог ЗУРВАС бүрээр нь задалж харуулах хуудас.

Нэхэмжлэл нь «хэдэн төгрөг» гэж хэлдэг бол хавсралт нь «яагаад» гэдгийг хэлнэ:
материал бүр хэдэн ширхэг, хэдэн хоног, ямар тарифаар гадаа байсныг мөр мөрөөр нь
харуулна. Циклийн дундуур ирсэн буцаалт нь хоёр мөр болж (240ш×12 хоног, дараа нь
210ш×18 хоног) НҮДЭЭР харагдана — `accrue_rent` эдгээрийг нэхэмжлэхийн тулд нэг мөр
болгон нийлүүлдэг, энд `accrue_rent_segments`-ээр буцааж задална.

`pdfgen.py` дотор ЗОРИУДААР ороогүй: тэр файл mm нэгжтэй, `cell`/`ln`-ээр дараалан
урсдаг бол энэ нь pt нэгжтэй, `pdflayout`-ийн абсолют примитивүүдээр байрладаг.
Загварын хилийг ФАЙЛЫН хил болгосон нь дараагийн баримтыг `_pdf()`-ээр 2.83× масштабтай
бичихээс сэргийлнэ.

Эх сурвалж (Barilga-ERP `rentalAppendix.ts`)-ийн ХОЁР АЛДАА энд ЗАСАГДСАН:
1. Мөрийн давталт дундаас хуудас тасрахад баганы толгой дахин зурагддаггүй байв —
   `doc.on_new_page` ашиглаж, давталтын дараа `None` болгож цэвэрлэнэ.
2. Нийт дүн ба гарын үсгийн блокт `ensureSpace` ер нь байгаагүй — сүүлийн мөр хуудасны
   ёроолд буусан баримт дээр захаас хальж, ХУУДСАН ГАДУУР зурагддаг байв.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from . import billing
from .pdfgen import _company, _money
from .pdflayout import (A4, INK, MARGIN, MUTED, Doc, cell_row, draw_header, ensure_space,
                        fit, move_down, rule, start_doc, text, wrap_to_width)

# ---- Баганын байрлал: эх сурвалжаас ЯГ ХЭВЭЭР (цэгээр) ----
RIGHT = A4[0] - MARGIN
COL_GRADE = 245
COL_QTY = 315
COL_RATE = 360
COL_DAYS = 430
COL_TOTAL = 475
# Материалын нэрний багана — зэрэглэлийн баганаас 8 цэг зайтай зогсоно.
NAME_WIDTH = COL_GRADE - MARGIN - 8

ROW_SIZE = 8.5      # хүснэгтийн мөрийн фонт
ROW_STEP = 16       # нэг мөрийн өндөр
CONT_STEP = 10      # үргэлжлэл (тайлбар) мөрийн өндөр

# Нүдний тор: багана бүрийн босоо зураас нь эдгээр x дээр татагдана.
COLS = [MARGIN, COL_GRADE, COL_QTY, COL_RATE, COL_DAYS, COL_TOTAL, RIGHT]
# Нийт дүнгийн мөрүүд зөвхөн баруун талыг эзэлдэг (шошго | дүн) — invoice-ийн
# ердийн зохион байгуулалт.
TOTALS_COLS = [COL_QTY, COL_TOTAL, RIGHT]
# Текстийн baseline-аас нүдний дээд/доод ирмэг хүртэлх зай. Нийлбэр нь ЯГ
# ROW_STEP байхаар сонгосон тул зэрэгцээ мөрүүдийн нүд ЗАЛГАА (contiguous)
# болж, хуучин босоо хэмнэл хэвээр хадгалагдана.
CELL_PAD_TOP = 11
CELL_PAD_BOT = ROW_STEP - CELL_PAD_TOP   # = 5

TITLE = "ТҮРЭЭСИЙН ТООЦООНЫ ХАВСРАЛТ"


@dataclass
class AppendixRow:
    """Хавсралтын нэг мөр — эсвэл нэг ЗУРВАС, эсвэл нэг ТӨЛБӨР.

    Төлбөрийн мөр (засвар/акт) нь `note`-той ирнэ («Засвар (2026-04-01)») ба
    тоо/тариф/хоногийн багана нь ХООСОН хэвлэгдэнэ — тэдгээр нь хоногоор
    тооцогддоггүй, харин нэхэмжлэлийн нийт дүнд ОРДОГ тул мөр нь заавал хэрэгтэй.
    """

    material: str
    grade: str
    qty: float
    rate: float
    days: int
    amount: float
    seg_from: date | None = None
    seg_to: date | None = None
    note: str | None = None


@dataclass
class Appendix:
    """Зурахад бэлэн хавсралт — DB-гүй, зөвхөн тоо ба текст."""

    client_name: str
    contract_no: str
    period_start: date
    period_end: date
    due_date: date | None
    label: str | None
    rows: list[AppendixRow] = field(default_factory=list)
    subtotal: float = 0.0
    vat: float = 0.0
    total: float = 0.0


# ---------- өгөгдөл цуглуулах (DB хэрэггүй) ----------

def build_appendix(c, gmap: dict, mmap: dict, d_from: date, d_to: date, *,
                   due_date: date | None = None, label: str | None = None) -> Appendix:
    """[d_from, d_to) цонхны хавсралтыг гэрээнээс ГАРГАНА.

    `db` ЗОРИУДААР авдаггүй: харилцагчийн нэр гэрээнээсээ, материал/зэрэглэлийн
    нэр нь дуудагчийн `mmap`/`gmap`-аас гарна (уналт нь `pdfgen.invoice_pdf`-тэй
    ижил — материалд "?", зэрэглэлд ""). Ингэснээр мөрийн логик HTTP-гүйгээр
    тестлэгдэнэ.

    НИЙТ ДҮНГ ГАРГАНА, `inv.total`-ыг УНШИХГҮЙ: `subtotal` = Σзурвас + төлбөр,
    `vat` = subtotal × гэрээний НӨАТ%, `total` = subtotal + vat — яг
    `derivable_invoice_specs`-ийн томьёо. Иймд засварлаагүй гэрээнд нэхэмжлэлтэйгээ
    таарч, явагдаж буй цикл (нэхэмжлэл БАЙХГҮЙ) ч ижил замаар бодогдоно.
    """
    rows: list[AppendixRow] = []
    for s in billing.accrue_rent_segments(c, d_from, d_to):
        rows.append(AppendixRow(
            material=str(mmap.get(s["material_id"], "?")),
            grade=str(gmap.get(s["grade_id"], "")),
            qty=s["qty"], rate=s["rate"], days=s["days"], amount=s["amount"],
            seg_from=s["seg_from"], seg_to=s["seg_to"]))

    # Засвар + актын төлбөр нэхэмжлэлийн нийт дүнд ОРДОГ (`charge_amount`) тул
    # хавсралтад ч заавал гарна — эс бөгөөс Дэд дүн нэхэмжлэлтэйгээ нийлэхгүй.
    _, charge_items = billing.charges_in(c, d_from, d_to)
    for ch in charge_items:
        rows.append(AppendixRow(material="", grade="", qty=0.0, rate=0.0, days=0,
                                amount=ch["amount"],
                                note=f"{ch['desc']} ({ch['date']})"))

    subtotal = sum(r.amount for r in rows)
    vat = subtotal * c.vat_percent / 100
    return Appendix(client_name=c.client.name, contract_no=c.no,
                    period_start=d_from, period_end=d_to, due_date=due_date, label=label,
                    rows=rows, subtotal=subtotal, vat=vat, total=subtotal + vat)


# ---------- зурах ----------

def _table_header(doc: Doc) -> None:
    """Баганы толгой — БҮРЭН нүдтэй. Мөрийн давталтын үед `doc.on_new_page` болж
    бүртгэгдэх тул үргэлжлэл хуудас бүр толгойтой (мөн хүрээтэй) нээгдэнэ.

    Толгойн шошго нь МОНГОН БАРИМТЫН чухал шошго тул тод (INK), бүдүүн, ≥9 pt —
    урьд нь бүдэг (MUTED) 8 pt байсныг тодруулав."""
    top = doc.y
    move_down(doc, CELL_PAD_TOP)   # текстийн baseline руу бууна
    text(doc, "Материал", size=9, bold=True, color=INK)
    text(doc, "Зэрэглэл", size=9, bold=True, color=INK, x=COL_GRADE, width=60)
    text(doc, "Тоо", size=9, bold=True, color=INK, x=COL_QTY, width=38, align="right")
    text(doc, "Өдрийн үнэ", size=9, bold=True, color=INK, x=COL_RATE, width=62, align="right")
    text(doc, "Хоног", size=9, bold=True, color=INK, x=COL_DAYS, width=38, align="right")
    text(doc, "Дүн", size=9, bold=True, color=INK, x=COL_TOTAL, width=RIGHT - COL_TOTAL,
         align="right")
    bottom = doc.y + CELL_PAD_BOT
    cell_row(doc, COLS, top, bottom)
    doc.y = bottom + CELL_PAD_TOP   # эхний өгөгдлийн мөрийн baseline (нүд залгаа)


def _total_row(doc: Doc, label: str, value: float, strong: bool = False) -> None:
    """Дүнгийн мөр — БҮРЭН нүдтэй (шошго | дүн).

    Эдгээр нь мөнгөн дүнгийн шошго тул бүгд ТОД (INK): Дэд дүн, НӨАТ нь бүдүүн
    бус ≥10 pt, «Нийт» нь бүдүүн, илүү том (12 pt) — урьд нь Дэд дүн/НӨАТ бүдэг
    (MUTED) байсныг тодруулав. Шошго нь дүнгийн баганы зүүн ирмэг рүү тэгшилж,
    хоосон зайг багасгав."""
    advance = 18 if strong else 14
    top = doc.y - CELL_PAD_TOP
    text(doc, label, size=12 if strong else 10, bold=strong, color=INK,
         x=COL_QTY, width=COL_TOTAL - COL_QTY - 8, align="right")
    text(doc, _money(value), size=12 if strong else 10, bold=strong, color=INK,
         x=COL_TOTAL, width=RIGHT - COL_TOTAL, align="right")
    cell_row(doc, TOTALS_COLS, top, top + advance)
    move_down(doc, advance)


def _multi_segment_keys(rows: list[AppendixRow]) -> set[tuple]:
    """Нэгээс олон зурвастай (материал, зэрэглэл, тариф) бүлгүүд.

    Ийм бүлэгт л огнооны дэд мөр хэвлэнэ: эс бөгөөс харилцагч нэг материалын
    12 ба 18 хоногийн хоёр мөрийг хараад АЛЬ нь аль хугацаа болохыг ялгах
    аргагүй болно. Ганц зурвастай мөрийн огноо нь толгой дээрх тооцооны
    хугацаатай давхардах тул дарамт болно."""
    seen: dict[tuple, int] = {}
    for r in rows:
        if r.seg_from is None:
            continue
        key = (r.material, r.grade, r.rate)
        seen[key] = seen.get(key, 0) + 1
    return {k for k, n in seen.items() if n > 1}


def _row_lines(doc: Doc, row: AppendixRow, multi: set[tuple]) -> list[str]:
    """Нэрний баганад багтах мөрүүд — эхнийх нь үндсэн мөрд, үлдсэн нь бүдэг
    үргэлжлэлд хэвлэгдэнэ.

    30 тэмдэгтээр таслах нь «Хавтан 50×50 · 2026.04.01–2026.04.30»-ыг юу ч
    үлдээхгүй хайчилдаг байсан ба хавсралт нь ЯГ ЭНЭ мэдээллийн төлөө байдаг."""
    lines = wrap_to_width(doc, row.note or row.material, ROW_SIZE, NAME_WIDTH)
    if row.seg_from and row.seg_to and (row.material, row.grade, row.rate) in multi:
        lines += wrap_to_width(doc, f"{row.seg_from} – {row.seg_to}", ROW_SIZE, NAME_WIDTH)
    return lines


def _render(ap: Appendix, company: dict, logo_path: str | None = None):
    """Хавсралтыг зурж, `FPDF`-ээ БУЦААНА (байт биш).

    Буцаах утга нь зориудын нэмэлт: төсөлд PDF-ээс текст задлах сан суулгаагүй
    тул хуудас тасарсныг `pages_count`-оор шалгах цорын ганц арга энэ юм.
    """
    doc = start_doc()
    draw_header(doc, company, TITLE,
                ap.label or f"{ap.period_start} - {ap.period_end}", logo_path)

    text(doc, f"Харилцагч: {ap.client_name}", size=10, bold=True)
    text(doc, f"Гэрээ: {ap.contract_no}", size=9, color=MUTED, align="right")
    move_down(doc, 14)
    text(doc, f"Тооцооны хугацаа: {ap.period_start} - {ap.period_end}", size=9, color=MUTED)
    if ap.due_date:
        text(doc, f"Төлөх огноо: {ap.due_date}", size=9, color=MUTED, align="right")
    move_down(doc, 20)
    rule(doc)
    move_down(doc, 14)

    multi = _multi_segment_keys(ap.rows)
    _table_header(doc)
    # ЗАСВАР №1: давталтын доторх хуудас таслалт бүрд толгойг дахин зурна.
    doc.on_new_page = _table_header
    for row in ap.rows:
        lines = _row_lines(doc, row, multi)
        ensure_space(doc, 24 + (len(lines) - 1) * CONT_STEP)
        b0 = doc.y   # эхний мөрийн baseline — нүдний дээд ирмэгийг эндээс бодно
        text(doc, lines[0], size=ROW_SIZE)
        # Зэрэглэл нь ЧӨЛӨӨТ текст (дарга нэрийг нь өөрчилж болно) тул тооны
        # багана руу халихаас `fit`-ээр сэргийлнэ — эх сурвалжид байгаагүй.
        text(doc, fit(doc, row.grade or "-", 56, size=ROW_SIZE),
             size=ROW_SIZE, x=COL_GRADE, width=60)
        if row.note is None:
            text(doc, f"{row.qty:,.0f}", size=ROW_SIZE, x=COL_QTY, width=38, align="right")
            text(doc, _money(row.rate), size=ROW_SIZE, x=COL_RATE, width=62, align="right")
            text(doc, str(row.days), size=ROW_SIZE, x=COL_DAYS, width=38, align="right")
        text(doc, _money(row.amount), size=ROW_SIZE, x=COL_TOTAL, width=RIGHT - COL_TOTAL,
             align="right")
        for continuation in lines[1:]:
            move_down(doc, CONT_STEP)
            text(doc, continuation, size=ROW_SIZE, color=MUTED)
        # Нүдний хүрээ нь мөрийн БҮТЭН өндрийг (үргэлжлэл мөрүүд орсон) хамарна.
        # doc.y одоо сүүлчийн (үргэлжлэл) мөрийн baseline дээр байна.
        cell_row(doc, COLS, b0 - CELL_PAD_TOP, doc.y + CELL_PAD_BOT)
        move_down(doc, ROW_STEP)
    # Толгойг ЦЭВЭРЛЭНЭ: доорх нийт дүнгийн блок хуудас тасалбал түүний дээр
    # хоосон хүснэгтийн толгой гарах учиргүй.
    doc.on_new_page = None

    # ЗАСВАР №2: эх сурвалжид энэ блокт огт шалгалт байгаагүй. Нийт дүнгийн
    # мөрүүд бүгд нүдтэй тул тэдгээрийн өндрийг бүтнээр нь нөөцөлнө.
    totals = 8 + 14 + (14 if ap.vat > 0 else 0) + 18 + CELL_PAD_TOP + CELL_PAD_BOT
    ensure_space(doc, totals)
    move_down(doc, 8)   # хүснэгт ба нийт дүнгийн хооронд амьсгал
    _total_row(doc, "Дэд дүн", ap.subtotal)
    # НӨАТ-гүй гэрээнд «НӨАТ 0₮» гэсэн мөр нь эргэлзээ төрүүлнэ — хэвлэхгүй.
    if ap.vat > 0:
        _total_row(doc, "НӨАТ", ap.vat)
    _total_row(doc, "Нийт", ap.total, strong=True)

    move_down(doc, 32)
    ensure_space(doc, 12)
    text(doc, "Тооцоо гаргасан: ..............................", size=9, color=MUTED)
    text(doc, "Харилцагч хүлээн авсан: ..............................", size=9, color=MUTED,
         align="right")
    return doc.pdf


def render_appendix(db, ap: Appendix, logo_path: str | None = None) -> bytes:
    """Хавсралтыг PDF байт болгоно. `db` нь ЗӨВХӨН компанийн нэрэнд хэрэгтэй."""
    return bytes(_render(ap, {"name": _company(db)}, logo_path).output())


# ---------- хоёр орох цэг ----------

def invoice_appendix_pdf(db, inv, gmap: dict, mmap: dict) -> bytes:
    """Тухайн НЭХЭМЖЛЭЛИЙН хавсралт — цонх нь [cycle_start, cycle_end).

    Шошгонд `cycle_end`-ийг ЯГ хэвээр (хасах 1 хоноггүй) хэвлэнэ: системийн бусад
    хэсэг (акт, нэхэмжлэлийн жагсаалт) хагас нээлттэй мужаа ингэж харуулдаг тул
    хавсралт нь нэхэмжлэлтэйгээ ИЖИЛ хугацааг хамарч байгаа мэт харагдах ёстой.
    """
    c = inv.contract
    ap = build_appendix(c, gmap, mmap, inv.cycle_start, inv.cycle_end,
                        due_date=inv.due_date,
                        label=f"{inv.no} · {inv.cycle_start} – {inv.cycle_end}")
    return render_appendix(db, ap)


def cycle_appendix_pdf(db, c, gmap: dict, mmap: dict, today: date | None = None) -> bytes | None:
    """ЯВАГДАЖ БУЙ циклийн хавсралт — нэхэмжлэл хараахан үүсээгүй байхад.

    Цонх нь `current_cycle_accrual`-ийн дотоод цонхтой ЯГ ИЖИЛ
    ([cs, min(today+1, ce))) — эс бөгөөс хуудасны дүн нь дэлгэц дээрх «явагдаж
    буй хуримтлал»-аас зөрнө. Цикл байхгүй бол (худалдаа, дууссан гэрээ)
    `None` буцаана; роутер үүнийг 400 болгоно.
    """
    today = today or date.today()
    cur = billing.current_cycle_accrual(c, today)
    if cur is None:
        return None
    cs = date.fromisoformat(cur["cycle_start"])
    ce = date.fromisoformat(cur["cycle_end"])
    ap = build_appendix(c, gmap, mmap, cs, min(today + timedelta(days=1), ce),
                        label=f"{cs} – {ce} · явагдаж буй "
                              f"({cur['days_done']}/{cur['days_total']} хоног)")
    return render_appendix(db, ap)

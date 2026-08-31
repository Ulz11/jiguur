"""PDF — нэхэмжлэл болон тооцоо нийлсэн акт (кирилл фонттой)."""
import json
import os
from datetime import date
from fpdf import FPDF
from sqlalchemy.orm import Session
from .. import models
from . import billing
from .pdflayout import GRID

FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "assets", "fonts")

# Хүснэгтийн тор нь ДӨРВӨН баримтад нэг ижил тонтой байхын тулд pdflayout-ийн
# GRID-ийг хуваалцана. pdfgen нь mm нэгжтэй тул зузааныг mm-ээр — 0.18mm ≈ 0.5pt
# буюу pdflayout-ийн GRID_W-тэй ижил зузаан. `cell(..., border=1)` бүрийн өмнө
# `set_draw_color(*GRID)` + `set_line_width(GRID_W_MM)` дуудна.
GRID_W_MM = 0.18


def _pdf() -> FPDF:
    p = FPDF(format="A4")
    p.add_font("dejavu", "", os.path.join(FONT_DIR, "DejaVuSans.ttf"))
    p.add_font("dejavu", "B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))
    p.set_auto_page_break(auto=True, margin=15)
    p.add_page()
    return p


def _company(db: Session) -> str:
    s = db.get(models.Setting, "company_name")
    return s.value if s and s.value else "Жигүүр Зам ХХК"


def _money(v: float) -> str:
    return f"{v:,.0f}₮"


def _invoice_detail(detail_json: str | None) -> tuple[list, list]:
    """`inv.detail_json`-ыг (lines, charges) болгон ЗАДЛАНА.

    Гурван хэлбэрийг зөвшөөрнө:
    - ХАВТГАЙ жагсаалт `[{...}]` — ХУДАЛДААНЫ нэхэмжлэл (charges байхгүй).
    - `{"lines": [...], "charges": [...]}` — түрээсийн нэхэмжлэл.
    - `{"note": "..."}` — шилжилтийн OB- нэхэмжлэл (мөр ч, төлбөр ч үгүй).

    isinstance-ийг ЭХЭЛЖ шалгана: жагсаалт дээр `detail.get(...)`-ыг дуудвал
    `AttributeError: 'list' object has no attribute 'get'` шидэж, PDF route 500
    болдог байсан (худалдааны нэхэмжлэлийн бодит production bug)."""
    detail = json.loads(detail_json or "[]")
    if isinstance(detail, list):
        return detail, []
    if isinstance(detail, dict):
        return detail.get("lines", []), detail.get("charges", [])
    return [], []


def invoice_pdf(db: Session, inv: models.Invoice, gmap: dict, mmap: dict) -> bytes:
    c = inv.contract
    p = _pdf()
    p.set_font("dejavu", "B", 14)
    p.cell(0, 8, _company(db), new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "", 10)
    p.cell(0, 6, f"НЭХЭМЖЛЭЛ {inv.no}", new_x="LMARGIN", new_y="NEXT")
    p.ln(2)
    p.cell(0, 6, f"Харилцагч: {c.client.name}", new_x="LMARGIN", new_y="NEXT")
    p.cell(0, 6, f"Гэрээ №{c.no} · {'Түрээс' if c.type == 'rent' else 'Худалдаа'}",
           new_x="LMARGIN", new_y="NEXT")
    if c.type == "rent":
        p.cell(0, 6, f"Тооцооны үе: {inv.cycle_start} — {inv.cycle_end}", new_x="LMARGIN", new_y="NEXT")
    p.cell(0, 6, f"Төлөх хугацаа: {inv.due_date}", new_x="LMARGIN", new_y="NEXT")
    p.ln(4)

    lines, charges = _invoice_detail(inv.detail_json)

    # Хүснэгтийн тор — Excel маягийн жигд, тод хүрээ (дөрвөн баримт нэг тонтой).
    p.set_draw_color(*GRID)
    p.set_line_width(GRID_W_MM)
    p.set_font("dejavu", "B", 9)
    w = [70, 25, 30, 30, 35]
    headers = ["Материал", "Зэрэглэл", "Тоо/хоног" if c.type == "rent" else "Тоо",
               "Тариф/Үнэ", "Дүн"]
    for i, h in enumerate(headers):
        p.cell(w[i], 7, h, border=1)
    p.ln()
    p.set_font("dejavu", "", 9)
    for ln in lines:
        qty = ln.get("qty_days", ln.get("qty", 0))
        p.cell(w[0], 7, str(mmap.get(ln.get("material_id"), "?")), border=1)
        p.cell(w[1], 7, str(gmap.get(ln.get("grade_id"), "")), border=1)
        p.cell(w[2], 7, f"{qty:,.0f}", border=1, align="R")
        p.cell(w[3], 7, f"{ln.get('rate', 0):,.0f}", border=1, align="R")
        p.cell(w[4], 7, _money(ln.get("amount", 0)), border=1, align="R")
        p.ln()
    for ch in charges:
        p.cell(w[0] + w[1] + w[2], 7, f"{ch.get('desc', '')} ({ch.get('date', '')})", border=1)
        p.cell(w[3], 7, "", border=1)
        p.cell(w[4], 7, _money(ch.get("amount", 0)), border=1, align="R")
        p.ln()
    p.ln(4)
    # ---- Нийт дүнгийн блок — Excel маягийн БҮРЭН хүрээтэй мини-хүснэгт ----
    # Мөр бүр (шошго | дүн) дөрвөн талдаа хүрээтэй тул чөлөөт тоо биш, нэг
    # ЗАЛГАА боксолсон тооцоо болж уншигдана. Дүнгийн нүд нь өгөгдлийн хүснэгтийн
    # «Дүн» баганы (сүүлийн баганы) ЯГ доор эгнэнэ: value_w = w[-1], баруун ирмэг
    # нь хүснэгтийн баруун ирмэгтэй (l_margin + Σw) давхцана.
    p.set_draw_color(*GRID)
    p.set_line_width(GRID_W_MM)
    label_w, value_w, row_h = 80, w[-1], 8
    x0 = p.w - p.r_margin - (label_w + value_w)

    def _totals_row(label: str, value: float, *, size: float = 9,
                    bold: bool = False, color: tuple = (0, 0, 0)) -> None:
        p.set_x(x0)
        p.set_font("dejavu", "B" if bold else "", size)
        p.set_text_color(*color)
        p.cell(label_w, row_h, label, border=1)
        p.cell(value_w, row_h, _money(value), border=1, align="R",
               new_x="LMARGIN", new_y="NEXT")
        p.set_text_color(0, 0, 0)

    # НӨАТ, Төлсөн нь туслах мөр (жижиг), Нийт дүн ба Үлдэгдэл нь ЧУХАЛ дүн тул
    # том, бүдүүн, тод болгож харьцааг тодотгов; алданги улаанаар.
    if inv.vat_amount:
        _totals_row("НӨАТ", inv.vat_amount)
    _totals_row("Нийт дүн", inv.total, size=12, bold=True)
    _totals_row("Төлсөн", inv.paid)
    _totals_row("Үлдэгдэл", billing.invoice_outstanding(inv), size=12, bold=True)
    # ⚠ ЗӨВХӨН НЭХЭГДСЭН алданги цаасан дээр гарна. Урьд нь энд амьд тооцоолол
    # (`invoice_penalty`) хэвлэгдэж, Отгоогийн ХЭЗЭЭ Ч нэхээгүй дүн харилцагчид
    # гардаг баримт дээр «Алданги» гэж зогсдог байв (Чадварын харьцуулалт
    # R25 / H2). Нэхэгдээгүй тооцоолол нь ХӨШҮҮРЭГ — дэлгэц дээр л амьдарна.
    pen = billing.invoice_penalty_due(inv)
    if pen > 0:
        _totals_row(f"Алданги ({c.penalty_percent}%/хоног, нэхэгдсэн)",
                    pen, size=8, color=(200, 30, 30))
    return bytes(p.output())


# ---------- Гэрээ — ТҮРЭЭС ба ХУДАЛДААГ тус тусад нь ----------
# Худалдааны гэрээ урьд нь бүхэлдээ ТҮРЭЭСИЙН нэр томьёо («Түрээслүүлэгч/эгч»)
# болон түрээсийн үүрэг (хүлээлгэн өгч буцаан авах) хэрэглэдэг байсан нь
# худалдаанд ХУУЛЬ ЗҮЙН хувьд буруу. Ялгааг цэвэр туслахуудад (дор) буулгаж,
# тест хийх боломжтой болгов.


def _party_labels(ctype: str) -> tuple[str, str]:
    """(компанийн үүрэг, харилцагчийн үүрэг) — гэрээний төрлөөр.

    Түрээс: компани «Түрээслүүлэгч», харилцагч «Түрээслэгч».
    Худалдаа: компани «Худалдагч», харилцагч «Худалдан авагч»."""
    if ctype == "sale":
        return "Худалдагч", "Худалдан авагч"
    return "Түрээслүүлэгч", "Түрээслэгч"


def _payment_clauses(c: models.Contract, day_total: float, sale_total: float) -> list[str]:
    """§2 Төлбөрийн нөхцлийн дугаарласан заалтууд — гэрээний төрлөөр.

    Түрээс: циклийн нэхэмжлэл + тооцооны эхлэл/төгсгөл. Худалдаа: нийт дүн +
    төлөх үүрэг + (сонголтоор) урьдчилгаа. Аль алинд НӨАТ ба алдангийг гэрээнд
    заасан бол нэмнэ. Дугаарлалт нь одоо байгаа заалтын тооноос үргэлжилнэ."""
    lines: list[str] = []
    if c.type == "sale":
        lines.append(f"2.1. Худалдааны нийт дүн {_money(sale_total)}.")
    else:
        lines += [
            f"2.1. Түрээсийн төлбөрийг {c.cycle_days} хоног тутам тооцож нэхэмжлэнэ. "
            f"Нэг циклийн дүн ойролцоогоор {_money(day_total * c.cycle_days)}.",
            "2.2. Түрээсийн тооцоо бараа гарсан өдрөөс эхэлж, буцаан хүлээлгэж өгсөн "
            "өдрөөр дуусна. Дундуур буцаасан бараанд ашигласан хоногоор нь тооцно.",
        ]
    if c.vat_percent:
        lines.append(f"2.{len(lines)+1}. Дээрх дүнд НӨАТ {c.vat_percent:g}% нэмж тооцно.")
    if c.type == "sale":
        lines.append(f"2.{len(lines)+1}. Худалдан авагч төлбөрөө гэрээнд заасан хугацаанд "
                     "бүрэн төлнө.")
    if c.penalty_percent:
        lines.append(f"2.{len(lines)+1}. Төлбөрийн хугацаа хэтэрсэн тохиолдолд хугацаа "
                     f"хэтэрсэн дүнгээс өдөрт {c.penalty_percent:g}% алданги тооцно.")
    if c.deposit:
        if c.type == "sale":
            lines.append(f"2.{len(lines)+1}. Худалдан авагч {_money(c.deposit)} урьдчилгаа "
                         "төлж, үлдэгдэл төлбөрийг тохиролцсон хугацаанд төлнө.")
        else:
            lines.append(f"2.{len(lines)+1}. Түрээслэгч {_money(c.deposit)} барьцаа төлнө. "
                         "Гэрээ дуусахад барьцааг буцаах эсвэл үлдэгдэл төлбөрт суутгана.")
    return lines


def _obligation_clauses(ctype: str) -> list[str]:
    """§3 Талуудын үүргийн дугаарласан заалтууд — гэрээний төрлөөр.

    Түрээс: хүлээлгэн өгөх, зориулалтаар ашиглах, буцаан үнэлэх. Худалдаа:
    бүрэн бүтэн хүлээлгэн өгч ӨМЧЛӨХ ЭРХ шилжүүлэх, төлбөр төлөх, эрсдэл
    хүлээлгэн өгсөн үеэс шилжих, буцаалт/баталгаат засвар тохиролцоогоор."""
    company_label, client_label = _party_labels(ctype)
    if ctype == "sale":
        return [
            f"3.1. {company_label} нь гэрээнд заасан бараа материалыг бүрэн бүтэн, "
            "зохих чанартайгаар хүлээлгэн өгч, өмчлөх эрхийг шилжүүлнэ.",
            f"3.2. {client_label} нь гэрээнд заасан төлбөрийг хугацаанд нь бүрэн төлнө.",
            f"3.3. Барааны өмчлөх эрх болон эрсдэл нь бараа хүлээлгэн өгсөн үеэс "
            f"{client_label}-д шилжинэ.",
            "3.4. Барааг буцаах болон баталгаат засварыг талууд харилцан тохиролцсоны "
            "үндсэн дээр шийдвэрлэнэ.",
            "3.5. Тээвэрлэлтийн зардлыг талууд тухай бүрд тохиролцоно.",
        ]
    return [
        f"3.1. {company_label} нь гэрээнд заасан бараа материалыг бүрэн бүтэн байдлаар "
        "хүлээлгэн өгнө.",
        f"3.2. {client_label} нь бараа материалыг зориулалтын дагуу ашиглаж, гэмтээсэн "
        "тохиолдолд засварын зардлыг, ашиглах боломжгүй болгосон бол актын үнийг төлнө.",
        "3.3. Буцаан авахдаа барааг шинэ/хуучин зэрэглэлээр нь дахин үнэлж хүлээн авна.",
        "3.4. Тээвэрлэлтийн зардлыг талууд тухай бүрд тохиролцоно.",
    ]


def _contract_header(p: FPDF, company: str, c: models.Contract,
                     company_label: str, client_label: str) -> None:
    """Гарчиг, №, огноо, оршил — үүргийн шошгоор параметрлэгдсэн (хуваалцсан)."""
    p.set_font("dejavu", "B", 13)
    p.cell(0, 8, ("ТҮРЭЭСИЙН ГЭРЭЭ" if c.type == "rent" else "ХУДАЛДААНЫ ГЭРЭЭ"),
           align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "", 9)
    p.cell(0, 6, f"№{c.no}", align="C", new_x="LMARGIN", new_y="NEXT")
    p.ln(3)
    p.cell(0, 6, f"Улаанбаатар хот{' ' * 40}{c.start_date}", new_x="LMARGIN", new_y="NEXT")
    p.ln(3)
    p.set_font("dejavu", "", 9.5)
    p.multi_cell(0, 5.5,
        f"Нэг талаас {company} (цаашид «{company_label}» гэх), нөгөө талаас "
        f"{c.client.name}{f' (РД: {c.client.reg})' if c.client.reg else ''} "
        f"(цаашид «{client_label}» гэх) нар дараах нөхцөлөөр харилцан тохиролцож "
        f"энэхүү гэрээг байгуулав.")
    p.ln(3)


def _contract_items_table(p: FPDF, c: models.Contract, gmap: dict, mmap: dict,
                          today: date) -> tuple[float, float]:
    """§1 Гэрээний зүйл — материалын жагсаалт (хуваалцсан). (day_total, sale_total)
    буцаана; тэдгээрийг §2 төлбөрийн нөхцөлд ашиглана."""
    p.set_font("dejavu", "B", 10)
    p.cell(0, 7, "1. Гэрээний зүйл", new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "B", 8.5)
    w = [58, 22, 26, 30, 34]
    heads = ["Материал", "Зэрэглэл", "Тоо/ш",
             "Тариф ₮/ш/хоног" if c.type == "rent" else "Нэгж үнэ ₮",
             "Өдрийн дүн" if c.type == "rent" else "Нийт дүн"]
    # Хүснэгтийн тор — Excel маягийн жигд, тод хүрээ (дөрвөн баримт нэг тонтой).
    p.set_draw_color(*GRID)
    p.set_line_width(GRID_W_MM)
    for i, hh in enumerate(heads):
        p.cell(w[i], 7, hh, border=1, align="C")
    p.ln()
    p.set_font("dejavu", "", 8.5)
    day_total = sale_total = total_qty = 0.0
    for it in c.items:
        q = billing.qty_on(c, it.material_id, it.grade_id, today)
        if q <= 0 and c.type == "rent":
            # анхны ачилтын тоог харуулна
            for mv in c.movements:
                if mv.type == "ISSUE":
                    for ln in mv.lines:
                        if ln.material_id == it.material_id and ln.grade_id == it.grade_id:
                            q = max(q, ln.qty)
        total_qty += q
        amt = q * (it.daily_rate if c.type == "rent" else it.unit_price)
        if c.type == "rent":
            day_total += amt
        else:
            sale_total += amt
        p.cell(w[0], 6.5, str(mmap.get(it.material_id, "?")), border=1)
        p.cell(w[1], 6.5, str(gmap.get(it.grade_id, "")), border=1, align="C")
        p.cell(w[2], 6.5, f"{q:,.0f}", border=1, align="R")
        p.cell(w[3], 6.5, f"{(it.daily_rate if c.type == 'rent' else it.unit_price):,.0f}",
               border=1, align="R")
        p.cell(w[4], 6.5, _money(amt), border=1, align="R")
        p.ln()
    p.set_font("dejavu", "B", 8.5)
    p.cell(w[0] + w[1], 7, "Нийт", border=1)
    p.cell(w[2], 7, f"{total_qty:,.0f}", border=1, align="R")
    p.cell(w[3], 7, "", border=1)
    p.cell(w[4], 7, _money(day_total if c.type == "rent" else sale_total), border=1, align="R")
    p.ln(10)
    return day_total, sale_total


def _contract_signatures(p: FPDF, company: str, c: models.Contract,
                         company_label: str, client_label: str) -> None:
    """Гарын үсгийн блок — үүргийн шошгоор параметрлэгдсэн (хуваалцсан).
    Түрээс: ТҮРЭЭСЛҮҮЛЭГЧ/ТҮРЭЭСЛЭГЧ. Худалдаа: ХУДАЛДАГЧ/ХУДАЛДАН АВАГЧ."""
    p.set_font("dejavu", "B", 9.5)
    p.cell(95, 6, company_label.upper(), new_x="RIGHT")
    p.cell(0, 6, client_label.upper(), new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "", 9.5)
    p.cell(95, 6, company, new_x="RIGHT")
    p.cell(0, 6, c.client.name, new_x="LMARGIN", new_y="NEXT")
    p.ln(6)
    p.cell(95, 6, "........................................", new_x="RIGHT")
    p.cell(0, 6, "........................................", new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "", 8)
    p.cell(95, 5, "(гарын үсэг, тамга)", new_x="RIGHT")
    p.cell(0, 5, f"(гарын үсэг, тамга){'  ' + c.client.person if c.client.person else ''}",
           new_x="LMARGIN", new_y="NEXT")


def _compose_contract(db: Session, c: models.Contract, gmap: dict, mmap: dict) -> bytes:
    """Гэрээг угсрах хуваалцсан цөм — ялгаа нь бүхэлдээ дээрх цэвэр туслахуудад
    (нэр томьёо, төлбөр, үүрэг) байх тул түрээс/худалдаа хоёулаа ЭНД нийлнэ."""
    today = date.today()
    company = _company(db)
    company_label, client_label = _party_labels(c.type)
    p = _pdf()

    _contract_header(p, company, c, company_label, client_label)
    day_total, sale_total = _contract_items_table(p, c, gmap, mmap, today)

    # ---- 2. Төлбөрийн нөхцөл ----
    p.set_font("dejavu", "B", 10)
    p.cell(0, 7, "2. Төлбөрийн нөхцөл", new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "", 9.5)
    for t in _payment_clauses(c, day_total, sale_total):
        p.multi_cell(0, 5.5, t)
        p.ln(1)
    p.ln(2)

    # ---- 3. Талуудын үүрэг ----
    p.set_font("dejavu", "B", 10)
    p.cell(0, 7, "3. Талуудын үүрэг", new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "", 9.5)
    for t in _obligation_clauses(c.type):
        p.multi_cell(0, 5.5, t)
        p.ln(1)
    if c.note:
        p.ln(1)
        p.set_font("dejavu", "B", 9.5)
        p.cell(0, 6, "Нэмэлт нөхцөл:", new_x="LMARGIN", new_y="NEXT")
        p.set_font("dejavu", "", 9.5)
        p.multi_cell(0, 5.5, c.note)
    p.ln(8)

    _contract_signatures(p, company, c, company_label, client_label)
    return bytes(p.output())


def contract_pdf(db: Session, c: models.Contract, gmap: dict, mmap: dict) -> bytes:
    """Гэрээний бүрэн хувилбар. Түрээс ба худалдааны гэрээ нэр томьёо, төлбөрийн
    нөхцөл, талуудын үүргээрээ ЯЛГААТАЙ тул төрлөөр нь салгаж зурна."""
    if c.type == "sale":
        return _sale_contract_pdf(db, c, gmap, mmap)
    return _rental_contract_pdf(db, c, gmap, mmap)


def _rental_contract_pdf(db: Session, c: models.Contract, gmap: dict, mmap: dict) -> bytes:
    """Түрээсийн гэрээ — «Түрээслүүлэгч»/«Түрээслэгч», циклийн төлбөр, буцаалт."""
    return _compose_contract(db, c, gmap, mmap)


def _sale_contract_pdf(db: Session, c: models.Contract, gmap: dict, mmap: dict) -> bytes:
    """Худалдааны гэрээ — «Худалдагч»/«Худалдан авагч», нийт дүн, өмчлөл шилжих."""
    return _compose_contract(db, c, gmap, mmap)


def act_pdf(db: Session, c: models.Contract, gmap: dict, mmap: dict) -> bytes:
    """Тооцоо нийлсэн акт — хоёр тал гарын үсэг зурдаг хуудас (бодит форматыг дуурайв)."""
    today = date.today()
    p = _pdf()
    p.set_font("dejavu", "", 9)
    p.cell(0, 6, f"{c.start_date} №{c.no} Гэрээний хавсралт", align="R", new_x="LMARGIN", new_y="NEXT")
    p.ln(2)
    p.set_font("dejavu", "B", 12)
    p.cell(0, 8, "Түрээслэсэн бараа материалын тооцоолол" if c.type == "rent"
           else "Худалдааны тооцоолол", align="C", new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "B", 11)
    p.cell(0, 8, c.client.name, new_x="LMARGIN", new_y="NEXT")
    p.set_font("dejavu", "", 9)
    p.cell(0, 6, f"Тооцоо нийлсэн огноо: {today}", new_x="LMARGIN", new_y="NEXT")
    p.ln(3)

    # Нэхэмжлэлүүд цикл дарааллаар. Толгойн шошго (Дүн/Төлсөн/Үлдэгдэл/Алданги)
    # нь чухал мөнгөн баганууд тул тод, бүдүүн, том (10 pt).
    p.set_font("dejavu", "B", 10)
    w = [45, 40, 35, 35, 35]
    # Хүснэгтийн тор — Excel маягийн жигд, тод хүрээ (дөрвөн баримт нэг тонтой).
    p.set_draw_color(*GRID)
    p.set_line_width(GRID_W_MM)
    # «Алданги» багана нь ЗӨВХӨН нэхэгдсэнийг харуулна — гарын үсэгтэй цаасан
    # дээр нэхээгүй тооцоолол зогсох нь худал нэхэмжлэл болно (R25 / H2).
    for i, h in enumerate(["Үе / Нэхэмжлэл", "Дүн", "Төлсөн", "Үлдэгдэл", "Нэхэгдсэн алданги"]):
        p.cell(w[i], 8, h, border=1)
    p.ln()
    p.set_font("dejavu", "", 9)
    tot = paid = out = pen_t = 0.0
    for inv in sorted(c.invoices, key=lambda i: i.due_date):
        o = billing.invoice_outstanding(inv)
        pen = billing.invoice_penalty_due(inv)
        label = f"{inv.cycle_start} — {inv.cycle_end}" if c.type == "rent" else inv.no
        p.cell(w[0], 7, label, border=1)
        p.cell(w[1], 7, _money(inv.total), border=1, align="R")
        p.cell(w[2], 7, _money(inv.paid), border=1, align="R")
        p.cell(w[3], 7, _money(o), border=1, align="R")
        p.cell(w[4], 7, _money(pen) if pen else "-", border=1, align="R")
        p.ln()
        tot += inv.total; paid += inv.paid; out += o; pen_t += pen
    cur = billing.current_cycle_accrual(c, today)
    if cur:
        p.cell(w[0], 7, f"{cur['cycle_start']} — явагдаж буй ({cur['days_done']}/{cur['days_total']} хоног)", border=1)
        p.cell(w[1], 7, _money(cur["accrued"]), border=1, align="R")
        p.cell(w[2] + w[3] + w[4], 7, "цикл дуусаагүй", border=1)
        p.ln()
    # «Нийт» мөр — актын гол дүн тул тод, бүдүүн, том (10 pt).
    p.set_font("dejavu", "B", 10)
    p.cell(w[0], 8, "Нийт", border=1)
    p.cell(w[1], 8, _money(tot), border=1, align="R")
    p.cell(w[2], 8, _money(paid), border=1, align="R")
    p.cell(w[3], 8, _money(out), border=1, align="R")
    p.cell(w[4], 8, _money(pen_t) if pen_t else "-", border=1, align="R")
    p.ln(12)

    p.set_font("dejavu", "", 9)
    p.cell(0, 6, "Хугацаа хэтэрсэн тохиолдолд гэрээнд зааснаар алданги тооцно.",
           new_x="LMARGIN", new_y="NEXT")
    p.ln(8)
    p.cell(95, 6, "Тооцоо нийлсэн:", new_x="RIGHT")
    p.cell(0, 6, "", new_x="LMARGIN", new_y="NEXT")
    p.ln(2)
    p.cell(95, 6, f"{_company(db)}-ийн менежер", new_x="RIGHT")
    p.cell(0, 6, f"Түрээслэгч: {c.client.name}", new_x="LMARGIN", new_y="NEXT")
    p.cell(95, 6, "________________________", new_x="RIGHT")
    p.cell(0, 6, "________________________", new_x="LMARGIN", new_y="NEXT")
    return bytes(p.output())

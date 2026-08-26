"""PDF байрлуулалтын хэрэгслүүд — фонтоор ХЭМЖИГДСЭН мөр таслалт, кирилл
глифийн хамгаалалт, тодорхой (explicit) хуудаслалт.

`pdfgen.py` нь mm нэгжтэй, `cell`/`ln`-ээр дараалан урсдаг. Энэ модуль нь pt
нэгжтэй, бүх зүйлийг АБСОЛЮТ координатаар байрлуулна — багана бүрийн өргөнийг
фонтоор хэмжиж таслах, тасарсан хуудсанд толгойг дахин зурах гэх мэт зүйлийг
урсгал загвараар хийх боломжгүй тул хоёр загварыг тусдаа файл болгов.

Гурван хамгаалалт логикоор биш, БҮТЦЭЭР хийгдсэн:
1. `set_auto_page_break(False)` — хуудаслалт зөвхөн `ensure_space`-ээр явна,
   эс тэгвэл `doc.y` бодит хуудаснаасаа салж хоцорно.
2. Зөвхөн абсолют примитив (`pdf.text`/`pdf.line`/`pdf.image`) ашиглана —
   `cell`/`ln`/`multi_cell` нь fpdf2-ийн ӨӨРИЙН курсорыг хөдөлгөдөг ба энэ
   хэрэгсэл түүнийг мөшгидөггүй.
3. Хэмжилт бүрийн өмнө `_use()`-ээр фонтоо сонгоно; `get_string_width`-ийг
   энэ модулиас гадуур дуудахгүй.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable

from fontTools.ttLib import TTFont
from fpdf import FPDF

# Хэмжээ, зай — бүгд ЦЭГ (pt). fpdf2-д өнгө нь 0–255 бүхэл тоо.
A4: tuple[float, float] = (595.28, 841.89)
A4_LANDSCAPE: tuple[float, float] = (841.89, 595.28)
MARGIN = 42
INK = (18, 23, 28)
MUTED = (115, 128, 140)
LINE = (222, 227, 232)

_FAMILY = "dejavu"


@dataclass
class Doc:
    """Нэг баримтын төлөв. `w`/`h` нь хуудасны хэмжээ — өргөн хүснэгттэй
    баримт цаасаа хөндлөн эргүүлэхэд туслах бүр нь дахин мэдэх шаардлагагүй."""

    pdf: FPDF
    w: float
    h: float
    y: float
    # Фонтын зурж ЧАДАХ кодын цэгүүд. `printable`-ийг үзнэ үү.
    glyphs: frozenset[int]
    # Хуудас тасрахад дуудагдана — хүснэгтийн баганы толгойг үргэлжлэл
    # хуудсанд дахин зурахад хэрэглэнэ. Мөрийн давталтын дараа `None` болгож
    # цэвэрлэнэ, эс тэгвэл нийт дүнгийн блок ч толгойтой хуудас нээнэ.
    on_new_page: Callable[["Doc"], None] | None = None


@lru_cache(maxsize=8)
def _glyphs(path: str) -> frozenset[int]:
    """Фонт файлын cmap. Import үед биш, анхны дуудлагад ЗАЛХУУГААР ачаална
    (~5 мс, нэг удаа): ингэснээр модулийн import үнэгүй хэвээр үлдэж, фонт
    олдохгүй байх нь серверийг унагаах биш, тухайн хүсэлтийн алдаа болно."""
    return frozenset(TTFont(path, lazy=True).getBestCmap())


def start_doc(
    size: tuple[float, float] = A4,
    regular: str | None = None,
    bold: str | None = None,
) -> Doc:
    """Шинэ баримт нээх. `unit="pt"` тул `p.k == 1` — өөрөөр хэлбэл
    `get_string_width` нь ЦЭГЭЭР хэмжинэ, зурах координаттай ижил нэгжээр."""
    # Import-ыг функц дотор: pdfgen-тэй модулийн түвшинд уяхгүйн тулд.
    from .pdfgen import FONT_DIR

    regular = regular or os.path.join(FONT_DIR, "DejaVuSans.ttf")
    bold = bold or os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")

    pdf = FPDF(unit="pt", format=size)
    pdf.add_font(_FAMILY, "", regular)
    pdf.add_font(_FAMILY, "B", bold)
    # Автомат хуудаслалт УНТРААЛТТАЙ — fpdf2 бидний мэдэхгүйгээр хуудас нэмвэл
    # `doc.y` бодит хуудаснаасаа салж, дараагийн бүх мөр буруу газар буух болно.
    pdf.set_auto_page_break(False)
    pdf.add_page()

    # y нь ДЭЭД захаас эхэлж ДООШОО өснө (pdf-lib-ийн эсрэг чиглэл).
    return Doc(pdf=pdf, w=pdf.w, h=pdf.h, y=MARGIN, glyphs=_glyphs(regular))


def _use(doc: Doc, size: float, bold: bool = False) -> None:
    """Хэмжих ба зурахын өмнөх ганц оролт. fpdf2-ийн `set_font` нь ижил фонт
    сонгогдсон үед шууд буцдаг тул давтан дуудахад үнэгүй."""
    doc.pdf.set_font(_FAMILY, "B" if bold else "", size)


def printable(doc: Doc, value: str) -> str:
    """Суулгасан фонтын зурж чадахгүй тэмдэгт хоосон ХАЙРЦАГ болж хэвлэгддэг
    ба харилцагч руу явсан баримт дээрх хайрцаг нь илгээгчийн алдаа мэт
    уншигдана. DejaVu Sans өргөн хамрах ч бүх нийтийнх биш: бүтэн өргөний
    хэлбэрүүд байхгүй тул үеийн төмөр замд нэмэлт олголт тэмдэглэдэг ＋ нь □
    болж хэвлэгдэж байв.

    Бүтэн өргөний латиныг ASCII ихрээр нь солино — ижил тэмдэгт, зөвхөн өргөн
    нь өөр тул юу ч алдагдахгүй. Түүний дараа ч дэмжигдээгүй үлдсэнийг
    хайрцаглахын оронд ХАЯНА: нэг чимэг дутуу нэр уншигдана, хайрцагтай нэр
    эвдэрсэн юм шиг харагдана."""
    out: list[str] = []
    for ch in str(value):
        code = ord(ch)
        if code in doc.glyphs:
            out.append(ch)
            continue
        # U+FF01–U+FF5E нь ASCII 0x21–0x7E-ийн бүтэн өргөний хэлбэр, тогтмол
        # 0xFEE0 зайтай.
        folded = code - 0xFEE0 if 0xFF01 <= code <= 0xFF5E else None
        if folded is not None and folded in doc.glyphs:
            out.append(chr(folded))
    return "".join(out)


def wrap_to_width(
    doc: Doc, value: str, size: float, max_width: float, bold: bool = False
) -> list[str]:
    """`value`-г `max_width`-д багтах мөрүүд болгон таслах — таслалтыг зурах
    ЯГ тэр фонтоор хэмжинэ.

    Нэхэмжлэл урьд нь нэрийг 46 тэмдэгтээр тасалж гурван цэг нэмдэг байсан нь
    хоёр талаараа буруу: тэмдэгтийн тоо бол өргөн биш, мөн «Хавтан 50×50 ·
    2026.04.01–2026.04.30 · 30 хон…» гэдэг нь харилцагчаас яг юуны төлбөр
    нэхэж буйг НУУНА. Ганцаараа ч багтахгүй үг дундуураа тасарна — хажуугийн
    багана руу халихыг зөвшөөрөхгүй."""

    def fits(s: str) -> bool:
        _use(doc, size, bold)
        return doc.pdf.get_string_width(s) <= max_width

    lines: list[str] = []
    line = ""

    for word in printable(doc, value).split():
        candidate = f"{line} {word}" if line else word
        if fits(candidate):
            line = candidate
            continue
        if line:
            lines.append(line)
            line = ""
        if fits(word):
            line = word
            continue
        rest = word
        while rest and not fits(rest):
            cut = len(rest) - 1
            # `cut > 1` — нэг ч тэмдэгт багтахгүй нарийн багана дээр мөнхийн
            # давталтад орохгүйн тулд наад зах нь нэг тэмдэгт таслана.
            while cut > 1 and not fits(rest[:cut]):
                cut -= 1
            lines.append(rest[:cut])
            rest = rest[cut:]
        line = rest
    if line:
        lines.append(line)

    return lines if lines else [""]


def fit(doc: Doc, value: str, width: float, *, size: float = 10, bold: bool = False) -> str:
    """Мөрийг `width` цэгт багтах хэмжээнд нь тасалж, тасалсан бол гурван
    цэгээр төгсгөнө.

    `text()` нь өгсөн зүйлээ зурдаг бөгөөд хайчилдаггүй тул урт нэр хажуугийн
    тоон багана дундуур гарч хэвлэгддэг. Нэрийг тооны хажууд тавьдаг хүснэгт
    бүрт энэ хэрэгтэй: `text()`-д дамжуулдаг `width` нь зөвхөн баруун
    тэгшлэлтэд ашиглагддаг тул зүүн тэгшилсэн нүдэнд юу ч хийдэггүй.
    Суулгасан фонтоор хэмжих нь цорын ганц шударга арга — кирилл ба латин
    дундаж өргөнөө хуваалцдаггүй."""
    # Зурагдах зүйлээ хэмжинэ, дамжуулсныг нь биш: `text()` дэмжигдээгүй
    # глифийг эхлээд хаядаг тул тэрнээс өмнө хэмжсэн нэр нь хэзээ ч эзлээгүй
    # өргөний эсрэг таслагдана.
    drawn = printable(doc, value)
    _use(doc, size, bold)
    if doc.pdf.get_string_width(drawn) <= width:
        return drawn

    ellipsis = "…" if 0x2026 in doc.glyphs else "..."
    budget = width - doc.pdf.get_string_width(ellipsis)
    if budget <= 0:
        return ""

    # Тэмдэгт тус бүрээр гүйхийн оронд ХОЁРТЫН ХАЙЛТ: `get_string_width` нь
    # мөрийг гүйлгэдэг тул 40 тэмдэгтийн нэрийг нэг нэгээр нь хасах нь
    # шалтгаангүйгээр квадрат хугацаа иднэ.
    fits_len, over = 0, len(drawn)
    while fits_len < over:
        mid = (fits_len + over + 1) // 2  # JS-ийн Math.ceil((fits+over)/2)
        if doc.pdf.get_string_width(drawn[:mid]) <= budget:
            fits_len = mid
        else:
            over = mid - 1
    return f"{drawn[:fits_len].rstrip()}{ellipsis}"


def ensure_space(doc: Doc, needed: float) -> bool:
    """Дараагийн блок хуудасны доод захаас хальж байвал шинэ хуудас нээх.

    Эх сурвалж дээр буцаах утга байгаагүй; `bool` нэмсэн нь ЗОРИУДЫН зөрүү —
    төсөлд PDF-ээс текст задлах сан суулгаагүй тул хуудас таслах шийдвэрийг
    тестээр шалгах өөр арга алга."""
    if doc.y + needed < doc.h - MARGIN:
        return False
    doc.pdf.add_page()
    doc.y = MARGIN
    if doc.on_new_page is not None:
        doc.on_new_page(doc)
    return True


def text(
    doc: Doc,
    value: str,
    *,
    x: float | None = None,
    size: float = 10,
    bold: bool = False,
    color: tuple[int, int, int] = INK,
    align: str = "left",
    width: float | None = None,
) -> float:
    """Мөр зурж, ЗУРСАН x-ээ буцаана (буцаах утга нь `ensure_space`-тэй адил
    зориудын нэмэлт — баруун тэгшлэлтийг тестээр шалгах цорын ганц арга).

    Хуудсанд хүрэх бүх мөр эндүүр өнгөрдөг тул дуудагч бүр санах шаардлагагүй:
    харилцагчийн нэр, тэмдэглэл зэрэг чөлөөт текст дэх санамсаргүй тэмдэгт
    хэзээ ч хайрцаг болж хэвлэгдэхгүй."""
    drawn = printable(doc, value)
    _use(doc, size, bold)
    x0 = MARGIN if x is None else x
    if align == "right":
        # fpdf2-ийн `text()`-д align байхгүй тул өөрсдөө бодно.
        w = (doc.w - MARGIN * 2) if width is None else width
        x0 = x0 + w - doc.pdf.get_string_width(drawn)
    # Өнгө нь баримтын төлөв — дуудлага бүрт дахин тавина.
    doc.pdf.set_text_color(*color)
    if drawn:
        # `pdf.text` нь pdf-lib-ийн `drawText`-тэй адил СУУРЬ ШУГАМААР (baseline)
        # байрлуулдаг тул хаана ч өндрийн засвар хийх шаардлагагүй.
        doc.pdf.text(x0, doc.y, drawn)
    return x0


def move_down(doc: Doc, amount: float) -> None:
    """Курсорыг ДООШ. fpdf2 дээрээсээ доошоо тоолдог тул y нь ӨСНӨ —
    pdf-lib-ийн `y -= n`-ийн эргүүлсэн хувилбар."""
    doc.y += amount


def rule(doc: Doc) -> None:
    """Одоогийн y дээр хөндлөн зураас татна; курсорыг ХӨДӨЛГӨХГҮЙ."""
    # Өнгө ба зузаан нь баримтын төлөв — хооронд нь юу ч өөрчилсөн байж болох
    # тул дуудлага бүрт дахин баталгаажуулна.
    doc.pdf.set_draw_color(*LINE)
    doc.pdf.set_line_width(0.7)
    doc.pdf.line(MARGIN, doc.y, doc.w - MARGIN, doc.y)


def vline(doc: Doc, x: float, y0: float, y1: float) -> None:
    """`x` дээр `y0`-оос `y1` хүртэл БОСОО зураас (LINE өнгө, 0.7pt).

    `rule`-ийн адил курсорыг ХӨДӨЛГӨХГҮЙ — босоо зураас нь мөрийн БҮТЭН өндрийг
    хамардаг тул дуудагч мөрийнхөө дээд/доод y-г өөрөө мэдэж дамжуулна. Өнгө ба
    зузааныг дуудлага бүрт дахин тавьна (баримтын хуваалцсан төлөв)."""
    doc.pdf.set_draw_color(*LINE)
    doc.pdf.set_line_width(0.7)
    doc.pdf.line(x, y0, x, y1)


def cell_row(doc: Doc, xs: list[float], y0: float, y1: float) -> None:
    """Нэг мөрийн БҮРЭН нүдний тор: дээд (`y0`) ба доод (`y1`) хөндлөн зураас нь
    `xs[0]`-оос `xs[-1]` хүртэл, `xs` доторх багана бүрийн `x` дээр босоо зураас.

    Курсорыг ХӨДӨЛГӨХГҮЙ. Энэ нь `pdfgen`-ийн `border=1` хүснэгтийн харагдацыг
    абсолют байрлуулалттай (pt) хуудсанд дуурайлгах примитив — толгой, өгөгдлийн
    мөр, нийт дүнгийн мөр бүгд ижил хүрээтэй болно. Зэргэлдээ мөрүүд дундах
    зураасаа хоёр удаа зурдаг (нэгнийх нь доод = нөгөөгийнх нь дээд) нь харагдацад
    нөлөөгүй — мөр бүр өөрөө бүрэн хаалттай байх нь хуудас тасрахад илүү найдвартай."""
    doc.pdf.set_draw_color(*LINE)
    doc.pdf.set_line_width(0.7)
    doc.pdf.line(xs[0], y0, xs[-1], y0)
    doc.pdf.line(xs[0], y1, xs[-1], y1)
    for x in xs:
        doc.pdf.line(x, y0, x, y1)


def draw_header(
    doc: Doc,
    company: dict,
    title: str,
    subtitle: str,
    logo_path: str | None = None,
) -> None:
    """Баримтын толгой: зүүнд компани (эсвэл лого), баруунд гарчиг + тайлбар.

    `company` нь `name`/`reg`/`phone`/`address` (бүгд заавал бус) түлхүүртэй
    dict. jiguur зөвхөн `company_name` хадгалдаг тул мета мөр ихэвчлэн хоосон
    гарч, эх сурвалжийн `if (meta)` хамгаалалт түүнийг алгасана."""
    header_top = doc.y
    logo_height = 0.0

    if logo_path and os.path.exists(logo_path):
        # ТУРШИГДААГҮЙ САЛАА: энэ төсөлд лого файл байхгүй тул тестээр
        # хамрагдаагүй. fpdf2 зургийг ДЭЭД зүүн буланаар нь байрлуулдаг
        # (pdf-lib доод зүүнээр) — эх сурвалжийн доод захын y = headerTop-h+4
        # нь дээрээсээ тооцоход header_top-4 болж хөрвөнө.
        info = doc.pdf.image(logo_path, x=MARGIN, y=header_top - 4, w=112)
        logo_height = float(getattr(info, "rendered_height", 0) or 0)
    else:
        text(doc, company.get("name") or "Жигүүр Зам", size=16, bold=True)

    text(doc, title, size=16, bold=True, align="right")
    move_down(doc, 15)
    text(doc, subtitle, size=9, color=MUTED, align="right")

    # Бүтэн лого нь өмнөх зөвхөн-текст толгойноос ӨНДӨР. Компанийн мета
    # мэдээллийг зурахаас өмнө түүний яг масштаблагдсан өндрийг нөөцлөнө —
    # ингэснээр зураг ба текст хэзээ ч давхцахгүй. Эх сурвалжийн
    # `Math.min(y, top - h - 6)` нь доороос дээш тоолдог тул эргүүлэхэд
    # `max(...)` БОЛНО.
    if logo_height:
        doc.y = max(doc.y, header_top + logo_height + 6)

    meta = " · ".join(
        part
        for part in (
            f"ТТД: {company['reg']}" if company.get("reg") else None,
            company.get("phone"),
            company.get("address"),
        )
        if part
    )
    if meta:
        text(doc, meta, size=8.5, color=MUTED)
    move_down(doc, 14)
    rule(doc)
    move_down(doc, 20)

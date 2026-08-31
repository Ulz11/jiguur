"""Гарын авлага.md → хэвлэдэг PDF (кирилл фонттой, брэндийн өнгөтэй).

Ажиллуулах:  python docs/make_manual_pdf.py
"""
import os
import re
import sys

from fpdf import FPDF

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTS = os.path.join(ROOT, "system", "backend", "assets", "fonts")
SRC = os.path.join(HERE, "Гарын авлага.md")
OUT = os.path.join(HERE, "Гарын авлага.pdf")
LOGO = os.path.join(HERE, "logo-white.png")      # бараан нүүрэнд зориулсан цагаан хувилбар

NAVY = (37, 56, 134)
NAVY_DEEP = (25, 41, 107)
ORANGE = (255, 138, 11)
INK = (38, 49, 77)
GREY = (99, 112, 139)
LINE = (223, 227, 235)
SOFT = (245, 246, 248)


class Manual(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("dj", "", 7.5)
        self.set_text_color(*GREY)
        self.cell(0, 6, "ЖИГҮҮР ЗАМ ХХК · СИСТЕМИЙН ГАРЫН АВЛАГА", align="L")
        self.set_draw_color(*LINE)
        self.line(12, 17, 198, 17)
        self.ln(8)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-14)
        self.set_font("dj", "", 7.5)
        self.set_text_color(*GREY)
        self.cell(0, 6, str(self.page_no()), align="C")


# DejaVu фонтод байхгүй emoji-г уншигдах тэмдэгтээр солино
GLYPH = {"🔑": "[түлхүүр]", "✅": "тийм", "⭐": "★", "⚠️": "⚠", "🙌": "", "☎": "☎"}


def clean(t: str) -> str:
    """Markdown-ы тэмдэгтүүдийг цэвэрлэнэ."""
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)          # линк
    t = t.replace("**", "").replace("`", "")
    t = re.sub(r"(?<!\w)\*(?!\s)([^*]+)\*(?!\w)", r"\1", t)  # ташуу
    for k, v in GLYPH.items():
        t = t.replace(k, v)
    return t.strip()


def main():
    if not os.path.exists(SRC):
        sys.exit(f"олдсонгүй: {SRC}")
    pdf = Manual(format="A4")
    pdf.add_font("dj", "", os.path.join(FONTS, "DejaVuSans.ttf"))
    pdf.add_font("dj", "B", os.path.join(FONTS, "DejaVuSans-Bold.ttf"))
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_margins(12, 12, 12)

    # ---------- Нүүр хуудас ----------
    pdf.add_page()
    pdf.set_fill_color(*NAVY_DEEP)
    pdf.rect(0, 0, 210, 297, "F")
    if os.path.exists(LOGO):
        try:
            pdf.image(LOGO, x=62, y=48, w=86)
        except Exception:
            pass
    pdf.set_xy(0, 150)
    pdf.set_font("dj", "B", 27)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 13, "СИСТЕМИЙН", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 13, "ГАРЫН АВЛАГА", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*ORANGE)
    pdf.set_line_width(1.2)
    pdf.line(88, 182, 122, 182)
    pdf.set_line_width(0.2)
    pdf.set_xy(0, 190)
    pdf.set_font("dj", "", 11)
    pdf.set_text_color(200, 210, 235)
    pdf.cell(0, 8, "Ажилчдад зориулав", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("dj", "", 9)
    pdf.cell(0, 7, "Түрээс · Худалдаа · Тооцоо · Санхүү", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(0, 262)
    pdf.set_font("dj", "", 8.5)
    pdf.set_text_color(150, 165, 205)
    pdf.cell(0, 6, "Хувилбар 1.1  ·  2026 он", align="C")

    pdf.add_page()
    pdf.set_text_color(*INK)

    in_code = False
    table: list[list[str]] = []
    quote: list[str] = []

    def flush_table():
        """Хуримтлуулсан хүснэгтийг зурна."""
        nonlocal table
        if not table:
            return
        head, rows = table[0], table[1:]
        ncol = len(head)
        avail = 186
        widths = [avail / ncol] * ncol
        if ncol > 1:                       # эхний багана илүү өргөн
            widths = [avail * 0.34] + [(avail * 0.66) / (ncol - 1)] * (ncol - 1)

        # Толгой ганцаараа хуудасны төгсгөлд үлдэхээс сэргийлнэ
        if pdf.get_y() + 7 + 12 > 275:
            pdf.add_page()
        # толгой
        pdf.set_font("dj", "B", 7.5)
        pdf.set_fill_color(*NAVY)
        pdf.set_text_color(255, 255, 255)
        for i, cell in enumerate(head):
            pdf.cell(widths[i], 7, clean(cell)[:46], border=0, align="L", fill=True)
        pdf.ln()
        # мөрүүд
        pdf.set_font("dj", "", 7.5)
        pdf.set_text_color(*INK)
        pdf.set_draw_color(*LINE)
        for ri, row in enumerate(rows):
            texts = [clean(c) for c in row] + [""] * (ncol - len(row))
            h = 6
            lines = [max(1, len(pdf.multi_cell(widths[i], h, texts[i], dry_run=True,
                                               output="LINES"))) for i in range(ncol)]
            rh = h * max(lines)
            if pdf.get_y() + rh > 275:
                pdf.add_page()
            y0 = pdf.get_y()
            x = pdf.l_margin
            if ri % 2 == 0:
                pdf.set_fill_color(*SOFT)
                pdf.rect(x, y0, avail, rh, "F")
            for i in range(ncol):
                pdf.set_xy(x, y0)
                pdf.multi_cell(widths[i], h, texts[i], border=0, align="L")
                x += widths[i]
            pdf.set_xy(pdf.l_margin, y0 + rh)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + avail, pdf.get_y())
        pdf.ln(4)
        table = []

    def flush_quote():
        """Дараалсан «>» мөрүүдийг НЭГ хайрцаг болгож зурна."""
        nonlocal quote
        if not quote:
            return
        txt = " ".join(q for q in quote if q)
        quote = []
        if not txt:
            return
        pdf.set_font("dj", "", 8.5)
        hh = len(pdf.multi_cell(176, 5.5, txt, dry_run=True, output="LINES")) * 5.5 + 4
        if pdf.get_y() + hh > 275:
            pdf.add_page()
        y0 = pdf.get_y()
        pdf.set_fill_color(255, 244, 230)
        pdf.rect(pdf.l_margin, y0, 186, hh, "F")
        pdf.set_fill_color(*ORANGE)
        pdf.rect(pdf.l_margin, y0, 2.5, hh, "F")
        pdf.set_xy(pdf.l_margin + 6, y0 + 2)
        pdf.set_text_color(*INK)
        pdf.multi_cell(176, 5.5, txt)
        pdf.set_xy(pdf.l_margin, y0 + hh + 2.5)

    with open(SRC, encoding="utf-8") as f:
        lines = f.readlines()

    skip_toc = False
    for raw in lines:
        line = raw.rstrip("\n")
        s = line.strip()

        if s.startswith("```"):
            in_code = not in_code
            if in_code:
                flush_table()
                flush_quote()
                pdf.ln(1)
            else:
                pdf.ln(2)
            continue
        if in_code:
            pdf.set_font("dj", "", 8)
            pdf.set_fill_color(*SOFT)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 5.5, "   " + clean(line), fill=True, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
            continue

        # хүснэгт
        if s.startswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if all(set(c) <= set("-: ") for c in cells if c):
                continue                                    # тусгаарлагч мөр
            table.append(cells)
            continue
        flush_table()
        if not s.startswith(">"):
            flush_quote()

        if not s:
            pdf.ln(2.5)
            continue

        # Агуулга хэсгийг PDF-д оруулахгүй (хуудасны дугаар таарахгүй)
        if s.startswith("## Агуулга"):
            skip_toc = True
            continue
        if skip_toc:
            if s.startswith("---"):
                skip_toc = False
            continue

        if s.startswith("---"):
            pdf.set_draw_color(*LINE)
            pdf.line(pdf.l_margin, pdf.get_y(), 198, pdf.get_y())
            pdf.ln(3)
            continue

        if s.startswith("# "):
            continue                                        # гарчиг нүүрэнд бий
        if s.startswith("## "):
            if pdf.get_y() > 210:
                pdf.add_page()
            pdf.ln(3)
            txt = clean(s[3:])
            pdf.set_fill_color(*NAVY_DEEP)
            y = pdf.get_y()
            pdf.rect(pdf.l_margin, y, 186, 10, "F")
            pdf.set_fill_color(*ORANGE)
            pdf.rect(pdf.l_margin, y, 3, 10, "F")
            pdf.set_xy(pdf.l_margin + 6, y + 0.6)
            pdf.set_font("dj", "B", 12)
            pdf.set_text_color(255, 255, 255)
            pdf.cell(0, 9, txt, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
            pdf.ln(3.5)
            continue
        if s.startswith("### "):
            pdf.ln(2)
            pdf.set_font("dj", "B", 10)
            pdf.set_text_color(*NAVY)
            pdf.multi_cell(0, 6, clean(s[4:]))
            pdf.set_text_color(*INK)
            pdf.ln(1)
            continue

        if s.startswith(">"):
            quote.append(clean(s.lstrip("> ")))
            continue

        # жагсаалт
        m = re.match(r"^(\d+)\.\s+(.*)", s)
        if m:
            pdf.set_font("dj", "B", 9)
            pdf.set_text_color(*ORANGE)
            pdf.cell(7, 5.5, m.group(1) + ".")
            pdf.set_font("dj", "", 9)
            pdf.set_text_color(*INK)
            pdf.multi_cell(179, 5.5, clean(m.group(2)))
            pdf.ln(0.6)
            continue
        if s.startswith("- "):
            pdf.set_font("dj", "", 9)
            pdf.set_text_color(*ORANGE)
            pdf.cell(5, 5.5, "•")
            pdf.set_text_color(*INK)
            pdf.multi_cell(181, 5.5, clean(s[2:]))
            pdf.ln(0.6)
            continue

        pdf.set_font("dj", "", 9)
        pdf.multi_cell(0, 5.5, clean(s))
        pdf.ln(0.8)

    flush_table()
    flush_quote()
    pdf.output(OUT)
    print(f"Бэлэн: {OUT}  ({os.path.getsize(OUT)/1024:.0f} KB, {pdf.page_no()} хуудас)")


if __name__ == "__main__":
    main()

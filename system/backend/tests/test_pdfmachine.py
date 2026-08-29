"""МЕХАНИЗМЫН НЭХЭМЖЛЭХ — зурагчийн тест.

`pdfappendix`-тэй ижил гэрээ: `_render` нь `FPDF`-ээ буцаадаг тул хуудасны тоо
ба зурсан замыг шалгах боломжтой (төсөлд PDF-ээс текст задлах сан суулгаагүй).
DB хэрэггүй — `MachineBill` нь цэвэр тоо, текст.
"""
import os
import re
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.services import pdfmachine


def bill(n: int) -> pdfmachine.MachineBill:
    rows = [pdfmachine.MachineRow(date=date(2026, 5, 1) + timedelta(days=i),
                                  label="Бүтэн өдөр", method="BANK", amount=1_200_000)
            for i in range(n)]
    total = sum(r.amount for r in rows)
    return pdfmachine.MachineBill(no="M-26/05-1", machine_name="Автокран 25т",
                                  client_name="Түмэн Хийц", period_start=date(2026, 5, 1),
                                  period_end=date(2026, 5, 31), rows=rows,
                                  subtotal=total, vat=0.0, total=total)


def test_render_produces_a_pdf():
    pdf = pdfmachine._render(bill(3), {"name": "Жигүүр Зам ХХК"})
    assert pdf.pages_count == 1
    assert bytes(pdf.output())[:4] == b"%PDF"


def test_render_spills_onto_a_second_page():
    """Урт нэхэмжлэх хоёр дахь хуудас руу ЗӨВ тасарна (мөр захаас халихгүй).

    ⚠ ШУДАРГА ХЯЗГААР: хоёрдугаар хуудсан дээр толгой дахин зурагдсаныг энэ тест
    БАТЛАХГҮЙ — түүнийг `test_pdflayout.py`-ийн `on_new_page` тагнуул хариуцна."""
    pdf = pdfmachine._render(bill(80), {"name": "Жигүүр Зам ХХК"})
    assert pdf.pages_count >= 2
    assert bytes(pdf.output())[:4] == b"%PDF"


def test_render_draws_a_full_column_grid():
    """Excel маягийн БҮРЭН нүдний тор — багана бүрийн x дээр БОСОО зураас."""
    pdf = pdfmachine._render(bill(3), {"name": "Жигүүр Зам ХХК"})
    content = b"".join(bytes(p.contents) for p in pdf.pages.values())
    for x in (pdfmachine.COL_LABEL, pdfmachine.COL_METHOD, pdfmachine.COL_AMOUNT):
        pat = (rf"{x}\.00 [0-9.]+ m {x}\.00 [0-9.]+ l").encode()
        assert re.search(pat, content), f"багана x={x} дээр босоо зураас алга"


def test_header_labels_fit_inside_their_columns():
    """Толгойн шошго хөрш багана руу ХАЛИХГҮЙ.

    `pdflayout.text` нь хайчилдаггүй тул хэт урт толгой нүдний зураасыг дайрч
    хэвлэгддэг (эхний хувилбарт «Төлбөрийн хэлбэр» 95.6 цэг байхад багана нь
    ердөө 87 цэг байв). Багана нэмэгдэх/нэр солигдох бүрд энэ тест хамгаална."""
    doc = pdfmachine.start_doc()
    widths = {
        "Огноо": pdfmachine.COL_LABEL - pdfmachine.MARGIN,
        "Ажил": pdfmachine.LABEL_WIDTH,
        "Төлбөрийн хэлбэр": pdfmachine.COL_AMOUNT - pdfmachine.COL_METHOD - 8,
        "Дүн": pdfmachine.RIGHT - pdfmachine.COL_AMOUNT,
    }
    doc.pdf.set_font("dejavu", "B", 9)
    for label, avail in widths.items():
        assert doc.pdf.get_string_width(label) <= avail, f"«{label}» баганадаа багтахгүй"

"""pdfgen-ийн ЦЭВЭР туслахууд — DB ч, HTTP ч, PDF задлагч ч хэрэггүй.

Төсөлд PDF-ээс текст задлах сан суулгаагүй тул зурсан байт доторх текст/хэмжээг
шалгах боломжгүй. Иймд шошго ба задаргааны ЛОГИКИЙГ цэвэр функц болгон гаргаж,
ЭНД шалгана; зурсан баримтуудыг %PDF тэмдгээр (test_api.py) шалгана.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.services import pdfgen


# ---------- Task 1: нэхэмжлэлийн detail_json задаргаа ----------

def test_invoice_detail_reads_a_flat_list_as_lines():
    """ХУДАЛДААНЫ нэхэмжлэлийн detail_json нь ХАВТГАЙ жагсаалт. Түүнийг мөрүүд
    болгож, төлбөрийг ХООСОН болгоно — `list.get` шидэхгүй (production 500 bug)."""
    raw = '[{"material_id": 1, "grade_id": 2, "qty": 5, "rate": 100, "amount": 500}]'
    lines, charges = pdfgen._invoice_detail(raw)
    assert lines == [{"material_id": 1, "grade_id": 2, "qty": 5, "rate": 100, "amount": 500}]
    assert charges == []


def test_invoice_detail_reads_rent_dict_shape():
    """Түрээсийн нэхэмжлэл нь {"lines": [...], "charges": [...]}."""
    raw = '{"lines": [{"amount": 1}], "charges": [{"amount": 2}]}'
    lines, charges = pdfgen._invoice_detail(raw)
    assert lines == [{"amount": 1}]
    assert charges == [{"amount": 2}]


def test_invoice_detail_ob_note_dict_does_not_crash():
    """Шилжилтийн OB- нэхэмжлэл нь {"note": "..."} — мөр ч, төлбөр ч байхгүй.
    Задлахад хоосон буцаана, алдаа шидэхгүй."""
    lines, charges = pdfgen._invoice_detail('{"note": "Эхний үлдэгдэл"}')
    assert lines == []
    assert charges == []


def test_invoice_detail_handles_empty_and_none():
    """Хоосон/None detail_json нь хоосон мөр, хоосон төлбөр."""
    assert pdfgen._invoice_detail(None) == ([], [])
    assert pdfgen._invoice_detail("") == ([], [])
    assert pdfgen._invoice_detail("[]") == ([], [])

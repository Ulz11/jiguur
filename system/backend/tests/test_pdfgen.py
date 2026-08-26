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


# ---------- Task 4: гэрээний нэр томьёо (түрээс vs худалдаа) ----------

from types import SimpleNamespace


def _fake_contract(**kw):
    kw.setdefault("cycle_days", 30)
    kw.setdefault("vat_percent", 0)
    kw.setdefault("penalty_percent", 0)
    kw.setdefault("deposit", 0)
    return SimpleNamespace(**kw)


def test_party_labels_rent_uses_lessor_lessee():
    """Түрээсийн гэрээ: компани «Түрээслүүлэгч», харилцагч «Түрээслэгч»."""
    company_label, client_label = pdfgen._party_labels("rent")
    assert company_label == "Түрээслүүлэгч"
    assert client_label == "Түрээслэгч"


def test_party_labels_sale_uses_seller_buyer_not_rental_terms():
    """Худалдааны гэрээ: компани «Худалдагч», харилцагч «Худалдан авагч» —
    түрээсийн нэр томьёо ОГТ гарахгүй (production дахь буруу нэр томьёоны засвар)."""
    company_label, client_label = pdfgen._party_labels("sale")
    assert company_label == "Худалдагч"
    assert client_label == "Худалдан авагч"
    assert "Түрээслэгч" not in (company_label, client_label)
    assert "Түрээслүүлэгч" not in (company_label, client_label)


def test_obligation_clauses_sale_are_sale_terms_not_rental():
    """Худалдааны §3 үүрэг нь ХУДАЛДААНЫХ: өмчлөх эрх шилжих, төлбөр төлөх —
    түрээсийн 'хүлээлгэн өгч буцаан авах' нэр томьёо байхгүй."""
    joined = " ".join(pdfgen._obligation_clauses("sale"))
    assert "Худалдагч" in joined and "Худалдан авагч" in joined
    assert "Түрээслэгч" not in joined and "Түрээслүүлэгч" not in joined
    assert "өмчл" in joined   # өмчлөх эрх шилжих нь худалдааны цөм


def test_obligation_clauses_rent_keep_rental_terms():
    """Түрээсийн §3 үүрэг нь ТҮРЭЭСИЙНХ хэвээр — регресс хамгаалалт."""
    joined = " ".join(pdfgen._obligation_clauses("rent"))
    assert "Түрээслүүлэгч" in joined and "Түрээслэгч" in joined
    assert "Худалдагч" not in joined


def test_payment_clauses_sale_states_total_vat_and_penalty():
    """Худалдааны §2 нь нийт дүн, НӨАТ, алдангийг заана — түрээсийн циклийн
    нэр томьёо ОРОХГҮЙ."""
    c = _fake_contract(type="sale", vat_percent=10, penalty_percent=0.5)
    joined = " ".join(pdfgen._payment_clauses(c, 0.0, 1_000_000.0))
    assert "Худалдааны нийт дүн" in joined
    assert "НӨАТ" in joined
    assert "алданги" in joined
    assert "Түрээс" not in joined


def test_payment_clauses_rent_states_cycle_billing():
    """Түрээсийн §2 нь циклийн нэхэмжлэлийн нөхцлийг заасан хэвээр."""
    c = _fake_contract(type="rent", penalty_percent=0.5)
    joined = " ".join(pdfgen._payment_clauses(c, 100.0, 0.0))
    assert "Түрээсийн төлбөр" in joined
    assert "хоног тутам" in joined

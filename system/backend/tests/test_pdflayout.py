"""PDF байрлуулалтын хэрэгслүүд — координатын чиглэл, глифийн хамгаалалт,
фонтоор хэмжигдсэн мөр таслалт. Өгөгдлийн сан ч, HTTP client ч хэрэггүй."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from app.services import pdflayout
from app.services.pdflayout import MARGIN

# Хуудасны баруун ирмэг — баруун тэгшлэлтийн шалгуур энэ тоо руу яг таарна.
RIGHT = 595.28 - MARGIN


@pytest.fixture()
def doc():
    return pdflayout.start_doc()


def width_of(doc, value, size, bold=False):
    """Хэмжилтийг ҮРГЭЛЖ `_use()`-ээр хийнэ: фонтоо сонгохгүйгээр хэмжвэл
    өмнөх дуудлагаас үлдсэн фонтоор хэмжигдэж, тест худал ногооруулна."""
    pdflayout._use(doc, size, bold)
    return doc.pdf.get_string_width(value)


def test_start_doc_is_a4_in_points(doc):
    """A4 нь ЦЭГ (pt) нэгжээр нээгдэнэ: `k == 1` тул `get_string_width` нь
    pdf-lib-ийн `widthOfTextAtSize`-тай яг ижил нэгжээр буцаана."""
    assert doc.w == pytest.approx(595.28, abs=0.01)
    assert doc.h == pytest.approx(841.89, abs=0.01)
    assert doc.pdf.k == 1
    assert doc.y == MARGIN


def test_move_down_moves_toward_the_bottom_of_the_page(doc):
    """pdf-lib доороосоо дээшээ, fpdf2 дээрээсээ доошоо тоолдог: `move_down`
    нь y-г ӨСГӨНӨ. Энэ тест координатын эргэлтийг хадаж байгаа юм."""
    before = doc.y

    pdflayout.move_down(doc, 20)

    assert doc.y == before + 20
    assert doc.y > before


def test_ensure_space_keeps_the_page_when_the_block_fits(doc):
    """Багтах блок хуудсыг таслахгүй — курсор ч, хуудасны тоо ч хөдлөхгүй."""
    before = doc.y

    broke = pdflayout.ensure_space(doc, 100)

    assert broke is False
    assert doc.y == before
    assert doc.pdf.pages_count == 1


def test_ensure_space_starts_a_new_page_and_resets_to_the_top_margin(doc):
    """Багтахгүй блок шинэ хуудас нээж, курсорыг ДЭЭД захад буулгана."""
    broke = pdflayout.ensure_space(doc, 800)

    assert broke is True
    assert doc.y == MARGIN
    assert doc.pdf.pages_count == 2


def test_ensure_space_redraws_the_table_header_on_the_new_page(doc):
    """Эх сурвалж (layout.ts) дээрх АЛДААНЫ регресс тест: тэнд мөрийн давталт
    дундаас хуудас тасрахад баганы толгой дахин зурагддаггүй байсан.
    `on_new_page` дуудагдсанаар л үргэлжлэл хуудас толгойтой болно."""
    spy = []
    doc.on_new_page = spy.append

    pdflayout.ensure_space(doc, 100)
    assert spy == [], "хуудас тасраагүй үед толгой дахин зурагдах учиргүй"

    pdflayout.ensure_space(doc, 800)
    assert spy == [doc], "тасарсан хуудас бүрт толгой ЯГ нэг удаа зурагдана"


def test_printable_folds_fullwidth_to_ascii(doc):
    """DejaVu-д бүтэн өргөний хэлбэр байхгүй тул ＋ нь □ болж хэвлэгддэг байв.
    Бүтэн өргөнийг ASCII ихрээр нь солино — ижил тэмдэгт, өөр өргөн."""
    assert pdflayout.printable(doc, "Ａ１＋") == "A1+"


def test_printable_drops_glyphs_the_font_cannot_draw(doc):
    """Зурагдаж чадахгүй тэмдэгтийг хайрцаг болгохын оронд ХАЯНА: нэг чимэг
    дутуу нэр уншигдана, хайрцагтай нэр эвдэрсэн юм шиг харагдана."""
    assert pdflayout.printable(doc, "Хэв中хашмал") == "Хэвхашмал"


def test_printable_keeps_mongolian_and_tugrik(doc):
    """Монгол Ө/Ү, ₮ тэмдэг, гурван цэг, × ба зураас бүгд DejaVu-д БАЙНА —
    хамгаалалт нь эдгээрийн аль нэгийг ч идэж болохгүй."""
    value = "Өнөөдөр Үнэ 330₮ … × –"

    assert pdflayout.printable(doc, value) == value


def test_wrap_to_width_keeps_every_line_within_the_width(doc):
    """Материалын урт нэрийг тэмдэгтээр биш, ФОНТООР хэмжиж таслана:
    мөр бүр багананд багтаж, буцаагаад нийлүүлэхэд эх нэр гарна."""
    name = "Хэв хашмал 6012 өндөр бат бөх ган хийц зэрэглэл А шинэчилсэн загвар"

    lines = pdflayout.wrap_to_width(doc, name, 8.5, 195)

    assert len(lines) > 1
    assert all(width_of(doc, ln, 8.5) <= 195 for ln in lines)
    assert " ".join(lines) == name


def test_wrap_to_width_breaks_a_word_that_cannot_fit_alone(doc):
    """Ганцаараа ч багтахгүй үг дундуураа тасарна — хажуугийн багана руу
    халихыг зөвшөөрөхгүй."""
    token = "Х" * 60

    lines = pdflayout.wrap_to_width(doc, token, 8.5, 195)

    assert len(lines) > 1
    assert all(width_of(doc, ln, 8.5) <= 195 for ln in lines)
    assert "".join(lines) == token


def test_wrap_to_width_returns_one_empty_line_for_empty_input(doc):
    """Хоосон утга нэг хоосон мөр буцаана — дуудагч мөрийн өндрөө тоолохдоо
    хоосон жагсаалт дээр бүдрэхгүйн тулд."""
    assert pdflayout.wrap_to_width(doc, "", 9, 100) == [""]
    assert pdflayout.wrap_to_width(doc, "   ", 9, 100) == [""]


def test_fit_returns_the_string_unchanged_when_it_fits(doc):
    """Багтаж байгаа мөрийг хөндөхгүй."""
    assert pdflayout.fit(doc, "Хэв хашмал", 200) == "Хэв хашмал"


def test_fit_truncates_with_an_ellipsis_within_the_width(doc):
    """Багтахгүй мөрийг ГУРВАН ЦЭГЭЭР тасална — тасалсны дараа хэмжсэн өргөн
    заасан хязгаараас хэтрэхгүй байх нь гол шалгуур."""
    name = "Хэв хашмал 6012 өндөр бат бөх ган хийц зэрэглэл А"

    cut = pdflayout.fit(doc, name, 80, size=9)

    assert cut.endswith("…")
    assert width_of(doc, cut, 9) <= 80
    assert len(cut) < len(name)


def test_fit_returns_empty_when_the_ellipsis_alone_does_not_fit(doc):
    """Гурван цэг ч багтахгүй нарийхан багананд юу ч хэвлэхгүй."""
    assert pdflayout.fit(doc, "Хэв хашмал 6012", 1.0) == ""


def test_text_right_aligns_flush_to_the_column_edge(doc):
    """Баруун тэгшлэлтийг fpdf2 хийж өгдөггүй тул өөрсдөө бодно: зурсан x
    дээр мөрийн өргөнийг нэмэхэд багануудын баруун ирмэг ЯГ гарна."""
    value = "1,247,400₮"

    x = pdflayout.text(doc, value, align="right")

    assert x + width_of(doc, value, 10) == pytest.approx(RIGHT, abs=0.01)


def test_rule_does_not_move_the_cursor(doc):
    """Зураас нь одоогийн y дээр татагдана — курсорыг дуудагч өөрөө хөдөлгөнө."""
    before = doc.y

    pdflayout.rule(doc)

    assert doc.y == before
    assert doc.pdf.pages_count == 1

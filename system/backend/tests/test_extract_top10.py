"""ТОП-10-ЫН ЗАДЛАГЧ — түүний дэвтэр юу гэж хэлж байгааг унших ЦЭВЭР функцүүд.

Аудит (`docs/Топ10 өгөгдлийн зураглал.md` §5.3) задлагчийн ГУРВАН тодорхой
алдааг нэрлэсэн; энэ файл тэдгээрийг ба тэдгээрийн хажуугаар унадаг байсан
өгөгдлийг барина:

  E1  огноогүй буцаалтын мөр ГАДАА гэж тоологдоно — Бутангууд 4,432 vs 1,879
  E2  `'буцаалт'` гэсэн ГУРАВ ДАХЬ баганын нэршил танигдахгүй (Марч, Зулаа)
  E3  зэрэглэлийг НЭРИЙН баганад бичсэн нь `А` болж нурна; каталогийн нүх унана

  + үлдэгдлийн ЭСРЭГ томьёо (Хурд групп 78.2сая ӨР↔КРЕДИТ)
  + гэрээний ЖИНХЭНЭ огноо ба дугаар (Марч 2022.3.1)
  + КАЛЕНДАРЬ САРЫН цикл (Грэйт — сар бүр 1,363,320₮ дутуу)
  + НӨАТ, барьцааны гүйдэг дэвтэр, гарын үсэг, талбайн хуваалт, --clients

Excel-гүйгээр шалгагдана: нүдний утга нь энгийн tuple.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "migration"))

import pytest

import build_real_data_xlsx as B


# ═══════════════════════════════════════════════════ E1 · хэн ГАДАА байгаа вэ

def test_hand_picked_total_names_the_rows_that_are_still_out():
    """Бутангууд-7!V61 «=+V58+V55+…+V10» — тэр ЯГ 16 мөрийг тоолсон.

    Энэ бол ШИЙДВЭР: буцаагдсан дэд мөрүүдийг өөрөө хассан. Задлагч түүнийг
    үл ойшоовол 4,432ш (10 дахин их) болно."""
    got = B.parse_total_formula(
        "=+V58+V55+V52+V49+V47+V44+V41+V38+V35+V32+V29+V26+V23+V20+V15+V10")
    assert got["kind"] == "refs"
    assert got["rows"] == [58, 55, 52, 49, 47, 44, 41, 38, 35, 32, 29, 26, 23, 20, 15, 10]
    assert 11 not in got["rows"]         # V11 = 548ш буцаалт — тоологдоогүй


def test_sum_total_names_a_whole_range():
    """ГрэйтМайнинг-5!D22 «=SUM(D7:D21)» — бүх мөр."""
    got = B.parse_total_formula("=SUM(D7:D21)")
    assert got["kind"] == "range"
    assert got["rows"][0] == 7 and got["rows"][-1] == 21
    assert len(got["rows"]) == 15


@pytest.mark.parametrize("f", ["", None, "1879", "=+V58*2", "=SUM(D7:D21)+X1"])
def test_total_formula_unreadable_is_none(f):
    """Уншиж чадаагүйг ТААМАГЛАХГҮЙ — None буцаагаад хуучин дүрэм рүү унана."""
    assert B.parse_total_formula(f) is None


# ═══════════════════════════════════════════════════ E2 · «буцаалт» гэсэн нэр

def test_returns_column_has_three_names():
    """Марч-1!I7 ба Зулаа-3!I7/AS7 = `'буцаалт'` — гурав дахь нэршил."""
    assert "буцаалт" in B.BACK_LABELS
    assert "ирсэн" in B.BACK_LABELS and "орлого" in B.BACK_LABELS


def test_return_column_is_found_when_labelled_buцaalt():
    """`тоо | үнэ | хоног | дүн | гарсан | буцаалт` — блокийн толгой."""
    rows = [("Материал", None, "тоо", "үнэ", "хоног", "дүн", "гарсан", "буцаалт")]
    blocks = B.find_blocks(rows)
    assert len(blocks) == 1
    cols = blocks[0]["cols"]
    assert cols["тоо"] == 2 and cols["үнэ"] == 3 and cols["хоног"] == 4
    assert cols["ирсэн"] == 7          # «буцаалт» = буцаж ирсэн багана
    assert cols["гарсан"] == 6


# ═══════════════════════════════════════════════════ E3 · НЭРИЙН баганын зэрэглэл

@pytest.mark.parametrize("raw, want", [
    ("пластик", "плас"), ("плас", "плас"), ("пл", "плас"),
    ("шинэ", "шинэ"), ("ШИНЭ", "шинэ"), ("  шинэ ", "шинэ"),
    ("хэв", None), ("6012", None), (6012, None), (None, None), ("В2", None),
])
def test_grade_token(raw, want):
    assert B.grade_token(raw) == want


def test_grade_written_in_the_name_column_reaches_the_sku():
    """`ӨнөОрд-8!AN8='пластик'` `AO8=6012` — 321ш нь `А` болж нурдаг байв."""
    cells = ("пластик", 6012, 321, 330, 30)      # нэр · код · тоо · үнэ · хоног
    code, raw, carry = B._resolve_code(cells, qc=2, carry=None)
    assert code == ("Хэв хашмал 6012", "плас")
    assert carry == ("Хэв хашмал 6012", "плас")


def test_grade_word_alone_inherits_the_previous_sku():
    """`Бутангууд-7!U47='шинэ'` — өмнөх мөрийн Тулаас В2-ын ШИНЭ зэрэглэл."""
    code, _, _ = B._resolve_code((None, "шинэ", 1247, 110, 30), qc=2,
                                 carry=("Тулаас В2", "А"))
    assert code == ("Тулаас В2", "шинэ")


def test_explicit_grade_beats_the_name_column():
    """«5012 пл» гэж КОДЫН нүдэнд бичсэн нь нэрийн баганаас ДЭЭГҮҮР."""
    code, _, _ = B._resolve_code(("шинэ", "5012 пл", 10, 330, 30), qc=2, carry=None)
    assert code == ("Хэв хашмал 5012", "плас")


def test_catalog_gap_sku_now_resolves():
    """Өнө Ордын `AO27='1м'` 278ш — урьд нь ЧИМЭЭГҮЙ унадаг байв."""
    code, _, _ = B._resolve_code(("труба", "1м", 278, 110, 30), qc=2, carry=None)
    assert code == ("Труба 1м", "А")
    assert B.CATALOG_NEW["Труба 1м"]["base_rate"] == 110


# ═══════════════════════════════════════════════ ҮЛДЭГДЛИЙН ТЭМДЭГ (№106)

def test_hurd_group_formula_is_written_backwards():
    """WB3!J32 «=+I32-H32» — 78,165,000₮ нь ӨР БИШ, ИЛҮҮ ТӨЛӨЛТ."""
    assert B.sign_from_formula("=+I32-H32") == -1


def test_every_other_board_row_is_billed_minus_paid():
    assert B.sign_from_formula("=+H8-I8") == 1
    assert B.sign_from_formula("=+H3-I3") == 1


@pytest.mark.parametrize("f", [None, "", "=SUM(H5:H33)", "=+B3+C3", "78165000"])
def test_unknown_balance_formula_keeps_the_written_sign(f):
    assert B.sign_from_formula(f) == 1


# ═══════════════════════════════════════════ ГЭРЭЭНИЙ ЖИНХЭНЭ ОГНОО ба №

@pytest.mark.parametrize("head, day, no, apx", [
    (" 2022.3.1  №02 Гэрээний хавсралт  №4", date(2022, 3, 1), "02", "4"),
    ("2024.4.04 №24/ 03  Гэрээний хавсралт № 4", date(2024, 4, 4), "24/03", "4"),
    ("2025.5.08 №25/04 Гэрээний хавсралт №4", date(2025, 5, 8), "25/04", "4"),
    ("2025.09.22 №25.19 Гэрээний хавсралт", date(2025, 9, 22), "25.19", ""),
    ("2026.03.25 №26/02 Гэрээний хавсралт №4", date(2026, 3, 25), "26/02", "4"),
    ("2025.3.15 № 25/03 Гэрээний хавсралт", date(2025, 3, 15), "25/03", ""),
])
def test_contract_header(head, day, no, apx):
    got = B.parse_contract_header(head)
    assert got["date"] == day
    assert got["no"] == no
    assert got["appendix"] == apx


def test_header_without_a_date_does_not_invent_one():
    got = B.parse_contract_header("Гэрээний хавсралт №4")
    assert got["date"] is None
    assert got["no"] == ""              # «№4» бол ХАВСРАЛТ, гэрээ биш
    assert got["appendix"] == "4"


# ═══════════════════════════════════════════ КАЛЕНДАРЬ САР (R5 / H3)

def test_great_mining_cycles_are_calendar_months():
    """`'4.01-4.30'`, `'5.01-5.31 31х'`, `'6.01-6.30'` — сарын жинхэнэ урт."""
    assert B.cycle_mode_from_labels(
        ["4.01-4.30", "5.01-5.31      31х", "6.01-6.30", "7.01-7.31", "8.01-8.31"]
    ) == "month"


def test_thirty_day_anchored_cycles_stay_days():
    """`'3.15-4.13'` → `'4.14-5.13'` — гэрээний өдөрт зангидсан 30 хоног."""
    assert B.cycle_mode_from_labels(
        ["3.15-4.13", "4.14-5.13", "5.14-6.12"]) == "days"


def test_no_labels_is_days():
    assert B.cycle_mode_from_labels([]) == "days"
    assert B.cycle_mode_from_labels(["Нийт", None]) == "days"


# ═══════════════════════════════════════════════════════════ НӨАТ (R14/H12)

def test_vat_percent_row_sets_the_rate():
    """НьюМэнПовэр-22!F22 = `'НӨАТ 10%'` — энэ бол ХУВЬ."""
    pct, notes = B.vat_of(["Материал", "НӨАТ 10%", 330])
    assert pct == 10
    assert notes == []


def test_vat_sentence_is_a_note_not_a_rate():
    """«нөат шивсэн» / «НӨАТ харилцан шивэлцэнэ» — ФАКТ, хувь биш."""
    pct, notes = B.vat_of(["нөат шивсэн", "НӨАТ харилцан шивэлцэнэ"])
    assert pct == 0
    assert notes == ["нөат шивсэн", "НӨАТ харилцан шивэлцэнэ"]


def test_barter_vat_rule_from_the_statement_sheet_is_seen():
    """Блүүт тооцоо!G9 — дүрэм нь БЛҮҮМ-2 дээр биш, statement дээр байдаг."""
    pct, notes = B.vat_of(
        ["бартерт 9957 УКК машин нөатгүй дүн.  нөат авах бол 10% нэмж төлбөр хийнэ "])
    assert pct == 0
    assert len(notes) == 1 and "9957" in notes[0]


# ═════════════════════════════════ БАРЬЦААНЫ ГҮЙДЭГ ДЭВТЭР (R22 / H8)

def test_deposit_chain_is_five_decisions():
    """Зулаа-3!G30 «=20000000-8265000+3000000+3000000+10000000»."""
    terms = B.parse_money_chain("=20000000-8265000+3000000+3000000+10000000")
    assert terms == [20_000_000, -8_265_000, 3_000_000, 3_000_000, 10_000_000]
    assert sum(terms) == 27_735_000


def test_deposit_events_keep_the_order_and_never_book_a_payment():
    ev = B.deposit_events_from_chain(
        [20_000_000, -8_265_000, 3_000_000], date(2026, 9, 1), "Зулаа-3!G30")
    assert [e["kind"] for e in ev] == ["lodge", "apply", "topup"]
    assert [e["amount"] for e in ev] == [20_000_000, 8_265_000, 3_000_000]
    assert all(e["date"] == "2026-09-01" for e in ev)
    assert all("Зулаа-3!G30" in e["note"] for e in ev)
    # `amount` ҮРГЭЛЖ ЭЕРЭГ — тэмдгийг `kind` зөөнө
    assert all(e["amount"] > 0 for e in ev)


def test_single_deposit_number_is_one_lodge():
    assert B.deposit_events_from_chain([21_000_000], date(2026, 9, 1), "x") == [
        {"kind": "lodge", "amount": 21_000_000, "date": "2026-09-01",
         "note": "хуучин системээс — x"}]


@pytest.mark.parametrize("f", ["=+G24-G25", "=SUM(G20:G24)", "байршуулаагүй", None])
def test_not_a_money_chain(f):
    assert B.parse_money_chain(f) is None


# ═══════════════════════════════════════════════ ГАРЫН ҮСЭГ (№72, 73)

@pytest.mark.parametrize("text, extra, name, role, ph, ph2", [
    ("Төслийн менежер: Н.Батцоож ............................", (96590908,),
     "Н.Батцоож", "Төслийн менежер", "96590908", ""),
    (" Захирал Б.Дарханбаяр  ........................  88111935  99991491", (),
     "Б.Дарханбаяр", "Захирал", "88111935", "99991491"),
    ("иргэн О.Зулаа ...................   99205311 ", (99116330,),
     "иргэн О.Зулаа", "", "99205311", "99116330"),
    ("Нярав : Н.Соль  .........................", (99966285,),
     "Н.Соль", "Нярав", "99966285", ""),
    ("Талбайн менежер:Ч.Амаржаргал….............................", (94066667,),
     "Ч.Амаржаргал", "Талбайн менежер", "94066667", ""),
])
def test_signatory(text, extra, name, role, ph, ph2):
    got = B.parse_signatory(text, extra)
    assert got["name"] == name
    assert got["role"] == role
    assert got["phone"] == ph
    assert got["phone2"] == ph2


@pytest.mark.parametrize("text", ["", None, ".............................", "   "])
def test_signatory_of_nothing(text):
    assert B.parse_signatory(text) is None


# ═══════════════════════════════════════════ ТАЛБАЙН ХУВААЛТ (№88, 97)

def test_site_split_sums_exactly_to_the_sheet_total():
    """Блүүмийн 4,294ш = технологи 2,044 + архангай 326 + дарь эх 1,924."""
    got = B.split_qty(4294, [2044, 326, 1924])
    assert sum(got) == 4294
    assert got == [2044, 326, 1924]


def test_site_split_rounding_never_loses_a_piece():
    for total in (1, 7, 99, 1879, 4294):
        got = B.split_qty(total, [3, 1, 1])
        assert sum(got) == total
        assert all(q >= 0 for q in got)


def test_site_split_with_no_weights_is_empty():
    assert B.split_qty(100, [0, 0]) == [0.0, 0.0]
    assert B.split_qty(0, [1, 1]) == [0.0, 0.0]


# ═══════════════════════════════════════════ ЗАХЫН ТЭМДЭГЛЭЛ (№112)

@pytest.mark.parametrize("text", [
    "7.06нд тооцов", "нөат шивсэн", "модонд", "кранд", "байршуулаагүй",
    "ирээгүй", "хаав", "тооцоо дууссан.", "барьцаанаас суутгаж тооцов.",
    "бартер илүү төлөлт", "хугацаа хэтэрвэл уг түрээсийн гэрээний 4.2-т зааснаар алданга тооцно",
])
def test_margin_note_is_recognised(text):
    assert B.is_margin_note(text) is True


@pytest.mark.parametrize("text", ["Нийт", "тоо", "үнэ", "хоног", "дүн", "", None,
                                  "Материал", "гарсан", "ирсэн", "6012"])
def test_table_labels_are_not_notes(text):
    assert B.is_margin_note(text) is False


# ═══════════════════════════════════════════ ХАРИЛЦАГЧИЙН ШҮҮЛТҮҮР

def test_top10_is_the_audit_ranking():
    """Аудит §1.2 — Нийт дүнгээр эрэмбэлсэн ЯГ арав."""
    assert B.TOP10 == ["Хурд групп", "Бутангууд", "Блүүм технологи",
                       "Ашид Донж Билгүүн", "Грэйт Майнинг", "Өнө Орд ХХК яармаг",
                       "Голден лайт", "Марч констракшн", "Дархан Оюунаа", "Зулаа"]
    assert len(B.TOP10) == len(set(B.TOP10)) == 10


def test_every_top10_name_is_canonical():
    """Топ-10 бүр НЭР ХУВИЛБАРЫН толинд каноник байх ёстой — эс тэгвэл
    шүүлтүүр нь хуудсыг олохгүй, гэрээ ҮҮСЭХГҮЙ."""
    for name in B.TOP10:
        assert B.canon_client(name).name == name, name
        assert B.canon_client(name).matched, name


def test_every_top10_with_a_sheet_is_reachable_from_sheet_client():
    """Хуудастай долоо нь `SHEET_CLIENT`-аар олдоно (гурав нь хуудасгүй)."""
    reachable = {v for v in B.SHEET_CLIENT.values() if v}
    have = [n for n in B.TOP10 if n in reachable]
    assert len(have) == 7
    for name in ("Хурд групп", "Голден лайт", "Дархан Оюунаа"):
        assert name not in reachable      # WB1-д хуудасгүй (аудит §1.2)

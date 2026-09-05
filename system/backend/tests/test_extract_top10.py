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


# ═══════════════════════ ХАМРАЛТ — ДЭВТЭР ХААНА ДУУССАН БЭ (`last_covered`)
#
# Түүний дэвтэр СҮҮЛЧИЙН циклийн мөрийнхөө ТӨГСГӨЛ хүртэл нэхсэн. Тэр огноог
# хэн ч уншдаггүй байсан тул систем олголтоо `as_of` (9.01) дээр буулгаж,
# хоёрын хооронд ХЭН Ч нэхэхгүй нүх үлдээж байв — Блүүм дээр 8.12-8.31-ийн
# 20 хоног = 24,589,200₮, долоон гэрээгээр ~102 сая₮.

def test_last_covered_is_the_end_of_the_last_cycle_line():
    """БЛҮҮМ-2 (V24 `'7.13-8.11'`) — дэвтэр 8.11 хүртэл нэхэгдсэн."""
    assert B.last_covered_from_labels(
        ["5.14-6.12", "6.13-7.12", "7.13-8.11"], 2026) == date(2026, 8, 11)


def test_last_covered_of_calendar_months_is_the_last_day_of_the_month():
    """Грэйт Майнинг — `'8.01-8.31'` → 8-р сарын СҮҮЛЧИЙН өдөр."""
    assert B.last_covered_from_labels(
        ["4.01-4.30", "5.01-5.31      31х", "6.01-6.30", "7.01-7.31", "8.01-8.31"],
        2026) == date(2026, 8, 31)


def test_last_covered_reads_the_LAST_line_not_the_largest():
    """Ашид Донж — `'7.23-8.21'`-ийн ДАРАА `'8.01-8.31'`: дэвтрийн ДАРААЛАЛ."""
    assert B.last_covered_from_labels(["7.23-8.21", "8.01-8.31"], 2026) \
        == date(2026, 8, 31)


def test_last_covered_across_the_new_year_lands_in_the_next_year():
    """`'12.15-1.13'` — төгсгөл нь ЭХЛЭЛЭЭСЭЭ өмнөх сард унавал ДАРАА жил."""
    assert B.last_covered_from_labels(["12.15-1.13"], 2026) == date(2027, 1, 13)


def test_no_cycle_line_means_no_coverage_date():
    """Шошго алга бол ТААМАГЛАХГҮЙ — None буцаана (ачаалагч тугтай мөр өргөнө)."""
    assert B.last_covered_from_labels([], 2026) is None
    assert B.last_covered_from_labels(["Нийт", None], 2026) is None
    assert B.last_covered_from_labels(["13.01-14.30"], 2026) is None
    assert B.last_covered_from_labels(["2.15-2.30"], 2026) is None   # 2.30 байхгүй


def test_board_last_covered_is_the_last_month_column_with_money():
    """Самбарын `'3 сар' … '7 сар'` — Блүүм 7 сар хүртэл (сарын сүүлчээр)."""
    head = ("Харилцагч", "Өмнөх үлд", "3 сар", "4 сар", "5 сар", "6 сар", "7 сар",
            "Нийт дүн", "Тооцоо хийсэн", "Үлдэгдэл", "Барьцаа")
    row = ("Блүүм технологи", 237099320, 40190700, 35275080, 38408800, 38408800,
           38408800, 427791500, 35000000, 392791500, None)
    assert B.board_last_covered(head, row, 2026) == date(2026, 7, 31)


def test_board_row_with_a_hole_still_ends_at_the_last_filled_month():
    """Бутангууд — 5 ба 7 сар хоосон, 6 сар дүнтэй: хамрал 6 сарын сүүл."""
    head = ("Харилцагч", "Өмнөх үлд", "3 сар", "4 сар", "5 сар", "6 сар", "7 сар")
    row = ("Бутангууд ", 71900254, 107196210, 82175670, None, 74061430, None)
    assert B.board_last_covered(head, row, 2026) == date(2026, 6, 30)


def test_board_row_without_a_month_amount_has_no_coverage_date():
    head = ("Харилцагч", "Өмнөх үлд", "3 сар", "4 сар")
    assert B.board_last_covered(head, ("Өнө Орд ХХК нүхт", None, None, None),
                                2026) is None


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


# ═════════════════════ OB-ИЙН ЭХ СУРВАЛЖ — ТҮҮНИЙ ӨӨРИЙН ХУУДАС (2-р шат)

#: БЛҮҮМ-2-ийн сүүлчийн блок: T=19 · U=20(тоо) · V=21 · W=22(хоног) · X=23(дүн)
BAL_QTY, BAL_AMT = 20, 23


def _bal_row(label, amount, tail=None):
    return (None,) * 19 + (label, None, None, tail, amount)


def _bal_rows():
    """`X33 = X30 − X32` нь ТҮҮНИЙ үлдэгдэл; `T27` нь ЭХЛЭЛ, `W30` нь дундах."""
    return [_bal_row("тоо", None, "хоног"),
            _bal_row("өмнөх үлдэгдэл", 237_099_320),
            _bal_row("Нийт төлөх дүн", 417_179_050, "үлдэгдэл"),
            _bal_row("Төлсөн", 35_000_000),
            _bal_row("Үлдэгдэл", 382_179_050)]


def test_the_sheet_names_its_own_balance_in_its_own_last_cell():
    """OB нь САМБАРААС биш, ТҮҮНИЙ ХУУДСААС гарна: тэгвэл үлдэгдэл ба
    хамралт хоёр НЭГ дэвтрээс гарч, `billing_from` нь бүтцээрээ зөв болно."""
    got = B.sheet_balance(_bal_rows(), BAL_QTY, BAL_AMT, "БЛҮҮМ-2")
    assert got == {"amount": 382_179_050.0, "ref": "БЛҮҮМ-2!X5"}


def test_the_previous_balance_line_is_not_the_balance():
    """«өмнөх үлдэгдэл» бол ЭХЛЭЛ, төгсгөл БИШ — сонгогдох ёсгүй."""
    rows = _bal_rows()[:2]
    assert B.sheet_balance(rows, BAL_QTY, BAL_AMT, "БЛҮҮМ-2") is None


def test_the_last_balance_line_wins_over_an_earlier_one():
    """Блок дотор «үлдэгдэл» гэсэн үг ХОЁР удаа гарна (W30 ба T33)."""
    got = B.sheet_balance(_bal_rows()[:3], BAL_QTY, BAL_AMT, "БЛҮҮМ-2")
    assert got["amount"] == 417_179_050.0          # r3 — сүүлчийнх нь тэр
    got = B.sheet_balance(_bal_rows(), BAL_QTY, BAL_AMT, "БЛҮҮМ-2")
    assert got["amount"] == 382_179_050.0          # r5 нь бүр сүүлд


@pytest.mark.parametrize("label", ["Нийт төлөх үлдэгдэл төлбөр",
                                   "Үлдэгдэл төлбөр", "үлдэгдэл",
                                   "Нийт төлөх үлдэгдэл дүн"])
def test_every_wording_of_her_balance_line_is_found(label):
    """Долоон хуудсанд ДӨРВӨН өөр нэршил: бүгд «үлд»-ээр эхэлдэггүй."""
    got = B.sheet_balance([_bal_row(label, 1_234_567)], BAL_QTY, BAL_AMT, "X")
    assert got["amount"] == 1_234_567.0


def test_a_sheet_without_a_balance_line_says_so():
    assert B.sheet_balance([_bal_row("Нийт", 5_000_000)],
                           BAL_QTY, BAL_AMT, "X") is None


# ═════════════════════ ТЭМДЭГЛЭЛИЙН БОДЛОГО — МАШИНЫ ТЭМДЭГ ГАРНА (2-р шат)

def test_a_real_margin_memo_is_kept_as_plain_text_without_a_cell_reference():
    """Гурав ба түүнээс дээш үгтэй тэмдэглэл нь ТҮҮНИЙ өгүүлбэр — хэвээрээ."""
    memo = "хугацаа хэтэрвэл уг түрээсийн гэрээний 4.2-т зааснаар алданга тооцно"
    kept, dropped = B.harvest_notes([(memo,)], {}, {}, {}, "Зулаа-3",
                                    date(2026, 9, 1))
    assert len(kept) == 1 and dropped == []
    assert kept[0]["text"] == memo                 # нүдний хаяг НААГААГҮЙ
    assert "!" not in kept[0]["text"]
    assert kept[0]["flag"] is False
    assert kept[0]["author"] == "Дэвтрээс"


@pytest.mark.parametrize("memo", ["буцаалт", "модонд", "хаав", "нөат шивсэн"])
def test_a_one_or_two_word_margin_label_is_not_a_note(memo):
    """«буцаалт» бол өгүүлбэр биш, ХҮСНЭГТИЙН ШОШГО — гэрээн дээр наах юм алга."""
    kept, dropped = B.harvest_notes([(memo,)], {}, {}, {}, "Зулаа-3",
                                    date(2026, 9, 1))
    assert kept == []
    assert len(dropped) == 1 and dropped[0]["text"] == memo


def test_a_yellow_cell_no_longer_becomes_a_note():
    """«ШАР нүд: 35,000,000 — «бартер»» гэдэг нь МАШИНЫ хэл — хавсралтад."""
    kept, dropped = B.harvest_notes(
        [("бартер", 35_000_000)], {}, {(1, 2): B.YELLOW}, {}, "Блүүт тооцоо",
        date(2026, 9, 1))
    assert kept == []
    yellow = [d for d in dropped if d["kind"] == "шар нүд"]
    assert len(yellow) == 1
    assert yellow[0]["text"] == "ШАР нүд: 35,000,000 — «бартер»"
    assert yellow[0]["ref"] == "Блүүт тооцоо!B1"


def test_a_hand_written_red_number_no_longer_becomes_a_note():
    kept, dropped = B.harvest_notes(
        [("нэхэмжлэх", 12_000_000)], {}, {}, {(1, 2): "FFFF0000"}, "Марч-1",
        date(2026, 9, 1))
    assert kept == []
    assert len(dropped) == 1 and dropped[0]["kind"] == "улаан дүн"


# ═════════════════════ ТАЛБАЙН ЖИН — ЗЭРЭГЛЭЛ ХАРААХГҮЙ УНАЛТ (2-р шат)

def _bluum_park():
    """«2026 шинэ» 16/17/18-р мөр — `Z6='V2 шинэ'` нь ТУСДАА багана."""
    return {
        "БЛҮҮМ технологи": {("Хэв хашмал 6012", "А"): 1879,
                            ("Тулаас В2", "А"): 165},
        "БЛҮҮМ архангай": {("Хэв хашмал 6012", "А"): 178,
                           ("Труба 6м", "А"): 60, ("Труба 3м", "А"): 50,
                           ("Тулаас В2", "А"): 18, ("Тулаас В4", "А"): 20},
        "Блүүм дарь эх": {("Хэв хашмал 6012", "А"): 1324,
                          ("Тулаас В2", "шинэ"): 600},
    }


def _bluum_items():
    return [{"material": "Хэв хашмал 6012", "grade": "А", "qty": 3381,
             "daily_rate": 330},
            {"material": "Тулаас В2", "grade": "А", "qty": 783, "daily_rate": 110},
            {"material": "Тулаас В4", "grade": "А", "qty": 20, "daily_rate": 220},
            {"material": "Труба 6м", "grade": "А", "qty": 60, "daily_rate": 220},
            {"material": "Труба 3м", "grade": "А", "qty": 50, "daily_rate": 200}]


def test_the_park_weight_folds_grades_when_the_exact_sku_is_missing():
    """`Z18` дээрх 600ш «V2 шинэ» нь гэрээн дээр «В2·А» гэж бичигдсэн.

    ЯГ таарах жин олдохгүй тул урьд нь ЖИН 0 болж, дарь эхийн 600ш нь
    технологи руу нүүж 2,585/385/1,324 гэсэн ХУДАЛ задаргаа гарч байв.
    """
    sites, problem = B._site_split("Блүүм технологи", _bluum_items(),
                                   _bluum_park(), B.Report())
    assert problem is None
    total = {s["site"]: sum(i["qty"] for i in s["items"]) for s in sites}
    assert total == {"БЛҮҮМ технологи": 2044, "БЛҮҮМ архангай": 326,
                     "Блүүм дарь эх": 1924}
    v2 = {s["site"]: sum(i["qty"] for i in s["items"]
                         if i["material"] == "Тулаас В2") for s in sites}
    assert v2 == {"БЛҮҮМ технологи": 165, "БЛҮҮМ архангай": 18,
                  "Блүүм дарь эх": 600}
    assert sum(total.values()) == 4294


def test_a_dated_snapshot_that_does_not_reconcile_is_not_split():
    """Батцоож!F нь 2026.04.01-ний ЗУРАГ (11,866ш) — өнөөдрийн 1,879ш БИШ.

    Нэг ХООСОН нүднээс төрсөн хуваалтыг «түүний хэлсэн хуваарилалт» гэж
    бичих нь ЗОХИОМОЛ баримт болно: систем хуваахгүй, ТҮҮНЭЭС асууна.
    """
    explicit = {B.AE_BLOCK: {("Хэв хашмал 6012", "А"): 11_866},
                B.OTHER_SITE: {("Тулаас В2", "шинэ"): 10}}
    items = [{"material": "Хэв хашмал 6012", "grade": "А", "qty": 1879,
              "daily_rate": 330}]
    sites, problem = B._site_split("Бутангууд", items, {}, B.Report(),
                                   explicit=explicit, snapshot="2026-04-01")
    assert sites == []
    assert problem is not None
    assert "2026-04-01" in problem["text"] and "1,879" in problem["text"]
    assert "хуваарилна" in problem["text"]


def test_a_snapshot_that_does_reconcile_still_splits():
    explicit = {B.AE_BLOCK: {("Хэв хашмал 6012", "А"): 1200},
                B.OTHER_SITE: {("Хэв хашмал 6012", "А"): 679}}
    items = [{"material": "Хэв хашмал 6012", "grade": "А", "qty": 1879,
              "daily_rate": 330}]
    sites, problem = B._site_split("Бутангууд", items, {}, B.Report(),
                                   explicit=explicit, snapshot="2026-04-01")
    assert problem is None
    assert [sum(i["qty"] for i in s["items"]) for s in sites] == [1200, 679]


# ═════════════════════ АГУУЛАХ — ХОЁР ДЭВТРИЙН НИЙЛБЭР (2-р шат)

def test_the_yard_row_fills_the_materials_the_count_left_blank():
    """«тооллого 6.22»-д трубаны тоо нүд ХООСОН — паркийн дэвтрийн хашааны
    мөр (row 51) л мэднэ. Урьд нь 7 труба бүгд 0-ээр ачаалагдаж байв."""
    stock = [{"material": "Хэв хашмал 6012", "grade": "А", "on_hand": 10_899}]
    yard = {("Труба 1м", "А"): 200, ("Труба 6м", "А"): 717,
            ("Труба 1.5м", "А"): 0, ("Шат", "А"): 34,
            ("Хэв хашмал 6012", "шинэ"): 999}
    got = B.fill_stock_from_yard(stock, yard, B.Report())
    by = {(r["material"], r["grade"]): r["on_hand"] for r in got}
    assert by[("Труба 1м", "А")] == 200
    assert by[("Труба 6м", "А")] == 717
    assert by[("Шат", "А")] == 34
    assert ("Труба 1.5м", "А") not in by            # хашаанд ч 0 — мөр үүсгэхгүй
    # ТООЛЛОГО мэдэж байгааг НЭГ Ч ХӨНДӨХГҮЙ (зэрэглэл нь өөр байсан ч)
    assert by[("Хэв хашмал 6012", "А")] == 10_899
    assert ("Хэв хашмал 6012", "шинэ") not in by


def test_the_yard_fill_is_recorded_as_grade_a():
    got = B.fill_stock_from_yard([], {("Тулаас В6", "А"): 145}, B.Report())
    assert got == [{"material": "Тулаас В6", "grade": "А", "on_hand": 145.0,
                    "source": "2026 шинэ!51 (Хашаанд бгаа)"}]


def test_the_yard_row_is_read_off_the_park_sheet():
    rows = [(None, "Харилцагч", "Хэв", None, "Труба"),
            (None, None, "6012", None, "1м"),
            (1, "Хурд Гранд Слаб", 5, None, 6),
            (45, "Хашаанд бгаа", 10_899, None, 200),
            (47, "Үндсэн материал", 18_907, None, 514)]
    got = B.parse_park_yard(rows)
    assert got[("Хэв хашмал 6012", "А")] == 10_899
    assert got[("Труба 1м", "А")] == 200
    assert len(got) == 2


# ═════════════════════ КАТАЛОГ — ЮУ Ч ЗОХИОХГҮЙ (2-р шат)

def test_the_new_catalog_rows_invent_no_repair_fee():
    """«Труба 1м»-ийн 4,000₮ засварын хураамж нь ХААНААС Ч гараагүй байв —
    гурван дэвтэрт «засвар» гэсэн үг ГАНЦ удаа, чөлөөт тэмдэглэл болж гарна."""
    for name, spec in B.CATALOG_NEW.items():
        assert spec.get("repair_fee", 0) == 0, name


def test_the_same_sentence_is_pasted_only_once():
    """Гэрээний нөхцөлийн мөр цикл бүрийн хажууд ДАХИН ДАХИН бичигдсэн байдаг:
    нүдний хаяг текстээс гарсны дараа тэдгээр нь ЯГ ижил мөрүүд."""
    memo = "хугацаа хэтэрвэл уг түрээсийн гэрээний 4.2-т зааснаар алданга тооцно"
    drop = []
    got = B.dedupe_notes([{"text": memo, "flag": False, "ref": "Зулаа-3!I7"},
                          {"text": memo, "flag": False, "ref": "Зулаа-3!AS7"}],
                         drop, "Зулаа", "гэрээ")
    assert len(got) == 1 and got[0]["ref"] == "Зулаа-3!I7"
    assert len(drop) == 1 and drop[0]["kind"] == "давхардсан"


def test_the_flagged_vat_copy_wins_over_the_bare_one():
    """«НӨАТ: «…»» нь ижил өгүүлбэрийг ТУГТАЙГААР давтдаг — тугтай нь ялна."""
    txt = "бартерт 9957 УКК машин нөатгүй дүн. нөат авах бол 10% нэмж төлбөр хийнэ"
    got = B.dedupe_notes([{"text": txt, "flag": False, "ref": "БЛҮҮМ-2!G9"},
                          {"text": f"НӨАТ: «{txt}»", "flag": True, "ref": "БЛҮҮМ-2"}],
                         [], "Блүүм технологи", "гэрээ")
    assert len(got) == 1 and got[0]["flag"] is True

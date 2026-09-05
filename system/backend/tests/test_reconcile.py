"""ТУЛГАЛТЫН ТАЙЛАН — ХАМРАЛТЫН ЗАЛГАА (P0-11) шалгах ЦЭВЭР функцүүд.

Тайлангийн §5.3 нь «таны дэвтэр хаана дуусав → систем хаанаас эхлэв» гэдгийг
гэрээ тус бүрд харуулна; §9 нь самбар ба харилцагчийн хуудас ХАМРАЛТААРАА
зөрсөн бүх мөрийг ТЭР шийдэх ёстой жагсаалт болгож гаргана.

Урьд нь тулгалт нь ЗӨВХӨН нэхэмжилсэн дүнг самбартай харьцуулж, хуримтлалыг
«таны дэвтэрт байхгүй» гэж ӨӨРСӨӨ өршөөдөг байсан тул энэ нүхийг ХАРЖ
ЧАДДАГГҮЙ байв: Блүүм дээр 8.12-8.31-ийн 20 хоног = 24,589,200₮ хэн ч
нэхэхгүй өнгөрөх байлаа.

DB-гүйгээр шалгагдана: оролт нь задлагчийн мөр + ачаалсан гурван огноо.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "migration"))

import reconcile as R

AS_OF = date(2026, 9, 1)


DAY = 1_229_460         # Блүүмийн жинхэнэ өдрийн дүн — 4,294ш, холимог тарифаар


def _row(**over):
    """Блүүмийн жинхэнэ хэмжээс (БЛҮҮМ-2, 3 дахь блок): 4,294ш = 1,229,460₮."""
    row = {"client": "Блүүм технологи", "no": "24/03", "sheet": "БЛҮҮМ-2",
           "last_covered": "2026-08-11", "board_last_covered": "2026-07-31",
           "items": [{"material": "Хэв хашмал", "grade": "А", "qty": 3381,
                      "daily_rate": 330},
                     {"material": "Тулгуур В2", "grade": "А", "qty": 783,
                      "daily_rate": 110},
                     {"material": "Тулгуур В4", "grade": "А", "qty": 20,
                      "daily_rate": 220},
                     {"material": "Дам нуруу 6м", "grade": "А", "qty": 60,
                      "daily_rate": 220},
                     {"material": "Дам нуруу 3м", "grade": "А", "qty": 50,
                      "daily_rate": 200}]}
    row.update(over)
    return row


# ═════════════════════════════ §5.3 · ЗАЛГАА ЯГ ТААРАХ ЁСТОЙ

def test_a_clean_handover_passes_all_three_conditions():
    """Тооцоо 8.12-оос · олголт 8.12-нд · 8.12→9.01-ийн хуримтлал > 0."""
    got = R.coverage_check(_row(), date(2026, 8, 12), date(2026, 8, 12),
                           20 * DAY, AS_OF)
    assert got["ok"] is True and got["problems"] == []
    assert got["last_covered"] == date(2026, 8, 11)
    assert got["billing_from"] == date(2026, 8, 12)
    assert got["day_amount"] == DAY


def test_a_gap_between_her_book_and_the_meter_is_named():
    """Хуучин зан: тооцоо `as_of`-оос — 8.12-8.31 хэн ч нэхэхгүй үлдэнэ."""
    got = R.coverage_check(_row(), AS_OF, AS_OF, 0.0, AS_OF)
    assert got["ok"] is False
    assert any("хамралт+1 (2026-08-12)" in p for p in got["problems"])


def test_an_issue_dated_off_the_billing_start_is_named():
    """Олголт нь тооцооны эхлэлээс хөндийрвөл хоног ба ₮ ЗӨРНӨ."""
    got = R.coverage_check(_row(), date(2026, 8, 12), AS_OF, 20 * DAY, AS_OF)
    assert got["ok"] is False
    assert got["problems"] == ["эхний олголт 2026-09-01 ≠ тооцооны эхлэл 2026-08-12"]


def test_a_silent_meter_after_the_handover_is_named():
    """Огноо нь таарсан ч ₮ хуримтлагдаагүй бол падан хаа нэгтээ унасан."""
    got = R.coverage_check(_row(), date(2026, 8, 12), date(2026, 8, 12), 0.0, AS_OF)
    assert got["ok"] is False
    assert any("хуримтлал 0" in p for p in got["problems"])


def test_a_handover_in_the_future_may_legitimately_accrue_nothing():
    """Грэйт — хамралт 8.31, тооцоо 9.01-ээс: тулгасан өдөр хүртэл 0 нь ЗӨВ."""
    row = _row(client="Грэйт Майнинг", no="25/04", last_covered="2026-08-31",
               board_last_covered="2026-08-31")
    got = R.coverage_check(row, AS_OF, AS_OF, 0.0, AS_OF)
    assert got["ok"] is True


def test_a_sheet_with_no_cycle_label_is_flagged_not_guessed():
    got = R.coverage_check(_row(last_covered=None), AS_OF, AS_OF, 0.0, AS_OF)
    assert got["ok"] is False
    assert got["problems"] == ["хуудсанд циклийн шошго алга — хамралт МЭДЭГДЭХГҮЙ"]


# ═════════════════════════════ §9 · САМБАР ↔ ХУУДАС ХАМРАЛТ ЗӨРӨВ

def test_the_board_and_the_sheet_disagree_in_days_and_tugrug():
    """Самбар 7 сарын сүүлээр, хуудас 8.11 хүртэл — 11 хоног маргаантай."""
    g = R.board_gap(_row())
    assert (g["board"], g["sheet"], g["days"]) == (date(2026, 7, 31),
                                                   date(2026, 8, 11), 11)
    assert g["amount"] == 11 * DAY
    assert g["text"] == ("Самбар 2026-07-31 хүртэл, хуудас 2026-08-11 хүртэл — "
                         "зөрүү 11 хоног, 13 524 060₮")


def test_a_sheet_behind_the_board_gives_a_negative_gap():
    """Бутангууд — самбар 6.30, хуудас 6.12: зөрүү СӨРӨГ (дэвтэр нь хоцорсон)."""
    g = R.board_gap(_row(client="Бутангууд", no="25.19",
                         last_covered="2026-06-12",
                         board_last_covered="2026-06-30"))
    assert g["days"] == -18 and g["amount"] == -18 * DAY


def test_agreeing_or_missing_dates_produce_no_line():
    assert R.board_gap(_row(board_last_covered="2026-08-11")) is None
    assert R.board_gap(_row(board_last_covered=None)) is None
    assert R.board_gap(_row(last_covered=None)) is None


# ═════════════════════════════ §2.4 · OB ХААНААС ГАРАВ — ХУУДАС ↔ САМБАР

def test_the_two_books_disagree_and_the_gap_becomes_a_question():
    """Блүүм: хуудас 382,179,050₮ · самбар 392,791,500₮ — 10,612,450₮ зөрүү."""
    got = R.ob_source_row({"name": "Блүүм технологи", "balance": 382_179_050,
                           "balance_source": "sheet",
                           "balance_sheet": 382_179_050,
                           "balance_board": 392_791_500,
                           "balance_ref": "БЛҮҮМ-2!X33"})
    assert got["delta"] == -10_612_450
    assert got["question"] == ("Хуудас 382 179 050₮ · самбар 392 791 500₮ · "
                               "зөрүү 10 612 450₮ — аль нь вэ?")
    assert got["ref"] == "БЛҮҮМ-2!X33"


def test_two_books_that_agree_ask_nothing():
    """Зулаа — хоёр дэвтэр ЯГ ижил 857,200₮."""
    got = R.ob_source_row({"name": "Зулаа", "balance": 857_200,
                           "balance_source": "sheet",
                           "balance_sheet": 857_200, "balance_board": 857_200})
    assert got["delta"] == 0 and got["question"] == ""


def test_a_client_without_a_sheet_stays_on_the_board():
    """Хурд групп · Голден лайт · Дархан Оюунаа — WB1-д хуудасгүй."""
    got = R.ob_source_row({"name": "Дархан Оюунаа", "balance": 59_400_000,
                           "balance_source": "board", "balance_sheet": None,
                           "balance_board": 59_400_000})
    assert got["source"] == "самбар" and got["question"] == ""
    assert got["sheet"] is None


# ═════════════════════════════ §5.4 · АГУУЛАХ — ХОЁР ДЭВТЭР

def _stock_data():
    return {"stock": [{"material": "Хэв хашмал 6012", "grade": "А", "on_hand": 8000},
                      {"material": "Хэв хашмал 6012", "grade": "В", "on_hand": 2899},
                      {"material": "Труба 1м", "grade": "А", "on_hand": 200,
                       "source": "2026 шинэ!51 (Хашаанд бгаа)"}],
            "audit": {"park_yard": {"Хэв хашмал 6012·А": 10_899,
                                    "Труба 1м·А": 200,
                                    "Тулаас В2·шинэ": 21_634}}}


def test_the_count_and_the_park_book_are_compared_per_material():
    got = R.stock_gap(_stock_data())
    by = {r["material"]: r for r in got["rows"]}
    assert by["Хэв хашмал 6012"]["count"] == 10_899
    assert by["Хэв хашмал 6012"]["park"] == 10_899
    assert by["Хэв хашмал 6012"]["delta"] == 0
    # Хашааны мөрөөр НӨХӨГДСӨН мөр нь «тооллого» баганад ТООЛОГДОХГҮЙ
    assert by["Труба 1м"]["count"] == 0 and by["Труба 1м"]["park"] == 200
    assert by["Тулаас В2"]["count"] == 0 and by["Тулаас В2"]["park"] == 21_634


def test_the_stock_totals_carry_the_whole_gap():
    got = R.stock_gap(_stock_data())
    assert got["count"] == 10_899
    assert got["park"] == 32_733
    assert got["delta"] == 10_899 - 32_733

"""Бодит датаны задлагчийн ЦЭВЭР функцүүд — TDD.

Задлагч (migration/build_real_data_xlsx.py) нь Отгоо эгчийн гурван ажлын
дэвтрийг уншина. Excel-ийн нүд бол чөлөөт гадаргуу тул задлагчийн бүх эрсдэл
эдгээр жижиг функцэд төвлөрдөг:

  * мөнгөний товчлол   «16.5к» = 16,500₮ · «170сая» = 170,000,000₮
  * таван огнооны хэлбэр
  * нэрийн хувилбарууд (ӨнөОрд / Өнө Орд ХХК / өнөорд)
  * материалын код     6012 · В2 / V2 · 6м
  * сөрөг үлдэгдэл = ИЛҮҮ төлөлт (кредит), өр биш
  * барьцаа «байршуулаагүй» = байхгүй, 0 биш

Тэдгээр нь цэвэр функц — Excel-гүйгээр шалгагдана.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "migration"))

import pytest

import build_real_data_xlsx as B


# ---------------------------------------------------------------- мөнгө

@pytest.mark.parametrize("raw, want", [
    (None, None),
    ("", None),
    ("   ", None),
    (1_045_000, 1_045_000.0),
    (-192_500.0, -192_500.0),
    ("1 045 000", 1_045_000.0),
    ("1 045 000", 1_045_000.0),        # тасрахгүй зай
    ("1,045,000", 1_045_000.0),
    ("5 000₮", 5_000.0),
    ("16.5к", 16_500.0),                          # «говь тооцоо» актын мөр
    ("11к", 11_000.0),
    ("495к", 495_000.0),
    ("2546.5к", 2_546_500.0),
    ("40 К", 40_000.0),
    ("170сая төлсөн", 170_000_000.0),
    ("-10 сая", -10_000_000.0),
    ("1.2 тэрбум", 1_200_000_000.0),
    ("(1 000)", -1_000.0),                        # хаалт = сөрөг
    ("3.5 мянга", 3_500.0),
])
def test_parse_money(raw, want):
    assert B.parse_money(raw) == want


def test_parse_money_never_reads_metres_as_millions():
    """«6м» бол ТРУБАНЫ УРТ, 6 сая биш. Нэг үсэг материалыг мөнгө болгож
    хувиргавал паркийн бүх тоо мөнгө болж хувирна."""
    assert B.parse_money("6м") is None
    assert B.parse_money("1.5м") is None
    assert B.parse_money("байршуулаагүй") is None
    assert B.parse_money("Нийт") is None


# ---------------------------------------------------------------- огноо

@pytest.mark.parametrize("raw, want", [
    ("2026.07.20", date(2026, 7, 20)),           # 1. цэгтэй бүтэн
    ("2026.1.22", date(2026, 1, 22)),            # 2. тэглэлгүй
    ("2026-06-25", date(2026, 6, 25)),           # 3. ISO
    ("2026-06-25 00:00:00", date(2026, 6, 25)),
    ("2026/4", date(2026, 4, 1)),                # 4. зөвхөн сар → сарын 1
    ("25.06.2024", date(2024, 6, 25)),           # 5. өдөр эхэлсэн
    (date(2026, 5, 8), date(2026, 5, 8)),
    (None, None),
    ("", None),
    ("2027.1улирал", None),                      # улирал — огноо биш
    ("байхгүй", None),
])
def test_parse_date_any(raw, want):
    assert B.parse_date_any(raw) == want


def test_parse_date_month_day_needs_a_year():
    """«7.05» гэсэн циклийн огноонд жил байхгүй — жилийг ГАДНААС өгнө,
    таамаглахгүй."""
    assert B.parse_date_any("7.05") is None
    assert B.parse_date_any("7.05", default_year=2026) == date(2026, 7, 5)
    assert B.parse_date_any("8.03", default_year=2026) == date(2026, 8, 3)


# ---------------------------------------------------------------- нэр

def test_canonical_name_merges_her_variants():
    """Нэг тал — нэг нэр. Хувилбар бүр ТҮҮНИЙ самбарын нэр рүү нийлнэ."""
    for raw in ["ӨнөОрд ХХК", "Өнө Орд ХХК", "өнөорд", "ӨнөОрд ХХК архив",
                "Өнө Орд ХХК яармаг"]:
        assert B.canon_client(raw).name == "Өнө Орд ХХК яармаг", raw
    for raw in ["Өнөорд Нүхт", "ӨнөОрд ХХК нүхт", "Өнө Орд ХХК Нүхт"]:
        assert B.canon_client(raw).name == "Өнө Орд ХХК нүхт", raw
    for raw in ["Бутангууд ", "бутангууд ххк", "Бутангууд констракшн  ХХК"]:
        assert B.canon_client(raw).name == "Бутангууд", raw
    # түүний үсгийн алдаа хэвээрээ хадгалагдана (самбар нь эх сурвалж)
    assert B.canon_client("Агар Эрдэнэс Трэйд ХХК").name == "Агар Эдэнэс Трэйд"


def test_canonical_name_keeps_separate_parties_apart():
    """«Говь Ресурс Хурд» ба «Хурд групп» — нэг үг таарсан ч ӨӨР тал.
    Эргэлзээтэйг НЭГТГЭХГҮЙ, ТУГ өргөнө (§1 олдвор б)."""
    a = B.canon_client("Говь Ресурс Хурд")
    b = B.canon_client("Хурд групп")
    assert a.name != b.name
    c = B.canon_client("Хурд Гранд Слаб")
    assert c.name not in (a.name, b.name)


def test_unknown_name_is_flagged_not_guessed():
    r = B.canon_client("Огт мэдэгдэхгүй ХХК")
    assert r.matched is False
    assert r.name == "Огт мэдэгдэхгүй ХХК"     # чимээгүй хаяхгүй — хэвээр нь


def test_name_key_ignores_case_space_and_legal_suffix():
    assert B.name_key(" Сүхжин  ХХК ") == B.name_key("сүхжин")
    assert B.name_key("Нью Мэн Повер ХХК") == B.name_key("НьюМэнПовэр")


# ---------------------------------------------------------------- барьцаа

def test_deposit_not_lodged_is_none_not_zero():
    """«байршуулаагүй» = амлаад байршуулаагүй; 0₮ гэж бичвэл ТӨЛСӨН мэт
    уншигдана (R21)."""
    assert B.parse_deposit("байршуулаагүй") is None
    assert B.parse_deposit("Байршуулаагүй ") is None
    assert B.parse_deposit(None) is None
    assert B.parse_deposit(21_000_000) == 21_000_000.0
    assert B.parse_deposit(0) == 0.0


# ------------------------------------------------------- үлдэгдэл ба кредит

def test_negative_balance_is_credit_not_debt():
    """Сөрөг үлдэгдэл = «илүү» (R18) — өр биш, кредит."""
    r = B.split_balance(-4_820_388)
    assert r.debt == 0 and r.credit == 4_820_388
    r = B.split_balance(111_658_360)
    assert r.debt == 111_658_360 and r.credit == 0
    assert B.split_balance(0).debt == 0


def test_negative_balance_written_in_the_deposit_column(caplog):
    """БМонголын кейс: үлдэгдэл хоосон, сөрөг дүн нь БАРЬЦААНЫ баганад
    бичигдсэн. Барьцаа болгож уншвал 192,500₮ хаанаас ч гарахгүй."""
    bal, dep, note = B.reconcile_balance_and_deposit(total=1_045_000,
                                                     paid=1_237_500,
                                                     balance=None,
                                                     deposit=192_500)
    assert bal == -192_500
    assert dep == 0
    assert note


# ---------------------------------------------------------------- материал

@pytest.mark.parametrize("raw, want", [
    (6012, ("Хэв хашмал 6012", "А")),
    ("6012", ("Хэв хашмал 6012", "А")),
    ("5012 пл", ("Хэв хашмал 5012", "плас")),
    ("В2", ("Тулаас В2", "А")),
    ("V2", ("Тулаас В2", "А")),                   # WB2-ийн латин V
    ("V2 шинэ", ("Тулаас В2", "шинэ")),
    ("B4", ("Тулаас В4", "А")),
    ("6м", ("Труба 6м", "А")),
    ("4 м", ("Труба 4м", "А")),
    ("Нийт", None),
    ("", None),
    (None, None),
    ("1025", ("Хэв хашмал 1025", "А")),            # каталогийн НҮХ — одоо нээгдэв
    ("1м", ("Труба 1м", "А")),                     # Өнө Ордын 278ш
])
def test_material_code(raw, want):
    assert B.material_of(raw) == want


def test_catalog_gap_is_opened_not_dropped():
    """Каталогт байхгүй SKU (1025, 2020, труба 5м/1.5м/1м, шат) — ЧИМЭЭГҮЙ алга
    болохгүй: КАТАЛОГТ НЭЭГДЭЖ, тайланд ч гарна (E3).

    Урьд нь `material_of` эдгээрт None буцааж, Өнө Ордын «Труба 1м» 278ш
    ачаалагдалгүй унадаг байв (түүний Нийт 5,855 − задлагч 5,577 = 278)."""
    assert B.material_of("2020") == ("Хэв хашмал 2020", "А")
    assert B.material_of("5м") == ("Труба 5м", "А")
    assert B.material_of("Шат") == ("Шат", "А")
    assert "1025" in B.CATALOG_GAPS
    assert "Шат" in B.CATALOG_GAPS
    # …ба каталогт нээгдэх мөр нь БҮГД тайлбартай
    for name, spec in B.CATALOG_NEW.items():
        assert spec["why"], name
        assert spec["category"]

"""Отгоо эгчийн ГУРВАН ажлын дэвтрээс (.xlsx) `real_data.json` угсарна.

    python migration/build_real_data_xlsx.py --src "…/Түрээсийн тооцоо 2026 2"

Эх сурвалж (P0-10):
  WB1 «Түрээсийн тооцоо 2026.xlsx»        — хөдөлгүүр: харилцагч тус бүрийн
        хуудас, хэвтээ циклийн блокууд (тоо·үнэ·хоног·дүн), тооллого 6.22
  WB2 «Үндсэн материалын тооцоо 24он.xlsx» — паркийн дэвтэр: МӨР=харилцагч ×
        БАГАНА=SKU гадаа матриц («2026 шинэ» = хамгийн сүүлийн байдал)
  WB3 «2026 тооцоо.xlsx»                   — удирдлагын самбар: «Түрээс
        тооцоо-26» (Нийт дүн · Тооцоо хийсэн · **Үлдэгдэл** · Барьцаа),
        «Өглөгө.зээл-26» (зээл)

ЗАРЧИМ (docs/Чадварын харьцуулалт.md §1):
  * Самбарын `Үлдэгдэл` бол ТҮҮНИЙ эрх мэдэлтэй авлага — бид түүнийг л ачаална.
  * `Барьцаа` балансын ГАДНА (R21); «байршуулаагүй» = 0 биш, БАЙХГҮЙ.
  * Сөрөг үлдэгдэл = «илүү» (R18) → кредит төлбөр, өр биш.
  * Нэг баримт гурван дэвтэрт ЗӨРӨХ эрхтэй (олдвор б) — бид зөрүүг НУУХГҮЙ,
    тайланд гаргаж, шийдвэрийг ЭЗЭНД нь үлдээнэ.
  * Эргэлзээтэй нэрийг НЭГТГЭХГҮЙ — тусад нь үлдээж туг өргөнө.
  * Тааруулж чадаагүй юмыг чимээгүй хаяхгүй — warnings-д гарна.

Гаралт нь `app/services/migration.py:load_data()`-ийн уншдаг бүтэц + `audit`
блок (тулгалтын тайлан үүнээс уншина). Детерминистик: ижил оролт → ижил байт.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime

try:
    from barter_manual import BARTER
except ImportError:  # pragma: no cover — багцаас дуудахад
    from .barter_manual import BARTER  # type: ignore

# Дэвтрүүдийн байдлаар: хамгийн сүүлийн бичилт 2026.08.04 → 9-р сарын 1-нээс
# систем тоолж эхэлнэ. Тогтмол — «өнөөдөр» гэвэл гаралт өдөр бүр өөрчлөгдөнө.
DEFAULT_AS_OF = "2026-09-01"

WB1 = "Түрээсийн тооцоо 2026.xlsx"
WB2 = "Үндсэн материалын тооцоо 24он.xlsx"
WB3 = "2026 тооцоо.xlsx"


# ════════════════════════════════════════════════════════ 1. ЦЭВЭР ФУНКЦҮҮД
# (Excel-гүйгээр тесттэй — tests/test_build_real_data.py)

_SCALE = {"к": 1e3, "мянга": 1e3, "сая": 1e6, "тэрбум": 1e9}
_DATEISH = re.compile(r"^\s*\d{4}\s*[./-]\s*\d{1,2}\s*(?:[./-]\s*\d{1,4})?\s*$")
_NUM = re.compile(r"(?<!\w)(-?\d[\d   ,]*(?:\.\d+)?)")
_SCALE_RE = re.compile(r"\s*(к|К|мянга|сая|тэрбум)", re.IGNORECASE)
_WORD_START = re.compile(r"\s*[^\W\d_]", re.UNICODE)


def parse_money(v) -> float | None:
    """Нүднээс ₮. Товчлол «16.5к»=16,500 · «170сая»=170,000,000.

    «6м» бол ТРУБАНЫ УРТ — мөнгө биш. Тоо дараа нь танигдаагүй үг ирвэл
    эсвэл ард нь дахин тоо (циклийн шошго «4.14-5.13») ирвэл None.
    """
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (datetime, date)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(" ", " ").replace(" ", " ").strip()
    if not s:
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg, s = True, s[1:-1].strip()
    s = re.sub(r"₮|төгрөг|төг\b", " ", s, flags=re.IGNORECASE).strip()
    if _DATEISH.match(s):
        return None
    m = _NUM.search(s)
    if not m:
        return None
    rest = s[m.end():]
    mult = 1.0
    ms = _SCALE_RE.match(rest)
    if ms:
        mult = _SCALE[ms.group(1).lower()]
        rest = rest[ms.end():]
    elif _WORD_START.match(rest):
        return None                      # тоо + үг = хэмжээс/код, мөнгө биш
    if re.search(r"\d", rest):
        return None                      # «4.14-5.13», «№25/04»
    try:
        val = float(m.group(1).replace(" ", "").replace(",", ""))
    except ValueError:
        return None
    val *= mult
    return -val if neg else val


_D_YMD = re.compile(r"^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)")
_D_DMY = re.compile(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\s*$")
_D_YM = re.compile(r"^(\d{4})[.\-/](\d{1,2})\s*$")
_D_MD = re.compile(r"^(\d{1,2})[.](\d{1,2})\s*$")


def parse_date_any(v, default_year: int | None = None) -> date | None:
    """Түүний ТАВАН огнооны хэлбэр:
    2026.07.20 · 2026.1.22 · 2026-06-25(ISO/datetime) · 2026/4(сар) · 25.06.2024
    Зургаа дахь нь «7.05» (сар.өдөр) — жилгүй тул `default_year` шаардана.
    """
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if not s:
        return None

    def _mk(y, m, d):
        try:
            return date(int(y), int(m), int(d))
        except ValueError:
            return None

    m = _D_YMD.match(s)
    if m:
        return _mk(m.group(1), m.group(2), m.group(3))
    m = _D_DMY.match(s)
    if m:
        return _mk(m.group(3), m.group(2), m.group(1))
    m = _D_YM.match(s)
    if m:
        return _mk(m.group(1), m.group(2), 1)
    m = _D_MD.match(s)
    if m and default_year:
        return _mk(default_year, m.group(1), m.group(2))
    return None


_LEGAL = re.compile(r"(ххк|ххн|ххт|хк|llc|ltd)")


def name_key(s: str) -> str:
    """Нэрийн харьцуулах түлхүүр — том/жижиг, зай, хуулийн хэлбэр, хашилт,
    э/е ба ё/е-гийн хэлбэлзлийг арилгана («Повер»↔«Повэр»)."""
    s = unicodedata.normalize("NFKC", str(s or "")).casefold()
    s = re.sub(r"[«»\"'`.,\-–—()]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = _LEGAL.sub(" ", s)
    s = s.replace(" ", "")
    return s.replace("э", "е").replace("ё", "е")


# ── Нэрийн хувилбарууд → ТҮҮНИЙ самбарын нэр ────────────────────────────────
# Түлхүүр = каноник (AR самбар «Түрээс тооцоо-26»), утга = баримтжсан хувилбар.
# Нэмэх бүрд ЯАГААД гэдгийг бич — энэ хүснэгт нь тайланд хэвлэгддэг.
ALIASES: dict[str, list[str]] = {
    "Өнө Орд ХХК яармаг": ["ӨнөОрд", "ӨнөОрд ХХК", "Өнө Орд ХХК", "өнөорд",
                           "ӨнөОрд ХХК архив", "өнөорд-Архив", "ӨнөОрд-8"],
    "Өнө Орд ХХК нүхт": ["Өнөорд Нүхт", "ӨнөОрд ХХК нүхт", "Өнө Орд ХХК Нүхт",
                         "Өнөорд Нүхт-20"],
    "Марч констракшн": ["Марч", "Марч констракшн ХХК", "Марч-1"],
    "Блүүм технологи": ["БЛҮҮМ технологи", "БЛҮҮМ технологи ХХК", "БЛҮҮМ ХХК",
                        "БЛҮҮМ-2", "Блүүт тооцоо"],
    "Грэйт Майнинг": ["Грэйт майнинг", "Грэйт Майнинг ХХК", "ГрэйтМайнинг ХХК",
                      "ГрэйтМайнинг-5"],
    "Бутангууд": ["Бутангууд ХХК", "Бутангууд констракшн ХХК", "бутан",
                  "Бутангууд-7"],
    # хуудасны толгой: «"Гоби Ресурс Хилл" ХХК Хурд зайсан төсөл» = самбарын
    # «Говь Ресурс Хурд» (нэг төсөл, нэг гэрээ №25/21)
    "Говь Ресурс Хурд": ["Гоби Ресурс Хилл", "Гоби Ресурс Хилл ХХК", "Говьресурс",
                         "ГобиресурсХилл", "Говьресурс-4", "говь тооцоо"],
    "Монуул ХХК": ["Монуул", "Монуул МЧМ майнинг ХХК", "Монуул-10", "Монуул тооцоо"],
    "БМонгол ХХК": ["БМонгол", "Билгүүн Монгол ХХК", "БМ-12"],
    "Зулаа": ["иргэн О.Зулаа", "О.Зулаа", "Зулаа-3"],
    "Мөнхболд": ["Мөнхболд-9"],
    "Ашид Донж Билгүүн": ["Ашид донж билгүүн", "Ашид Донж Билгүүн ХХК", "АшидДонж-11"],
    "Удам констракшн": ["Удам констракшн ХХК", "Удам-13"],
    "Шижир Тиара": ["Шижир Тиара ХХК", "ШижирТиара-14"],
    # Самбарт «Эдэнэс» гэж бичигдсэн (үсэг унасан) — самбар нь эх сурвалж тул
    # каноник нь ТҮҮНИЙ бичсэнээр үлдэнэ.
    "Агар Эдэнэс Трэйд": ["Агар Эрдэнэс Трэйд", "Агар Эрдэнэс Трэйд ХХК",
                          "Агар Эрдэнэс-15"],
    "Арвинбулаг констракшн": ["Арвинбулаг", "Арвинбулаг констракшн ХХК",
                              "Арвинбулаг-16"],
    "Сүхжин ХХК": ["Сүхжин", "Сүхжин-18"],
    "Хатанбүүвэй": ["Д.Хатанбүүвэй", "Хатанбүүвэй-19"],
    "Цэрэнчимэд": ["Н.Цэрэнчимэд", "Цэрэнчимэд-21"],
    "Нью Мэн Повер ХХК": ["Нью Мэн Повер", "НьюМэнПовэр", "НьюМэнПовэр-22"],
    "Өрнүүн Эрчит Зам ххк": ["Өрнүүн Эрчит Зам", "Өрнүүн эрчит зам ХХК",
                             "Өрнүүн эрчит зам-17"],
    "Орхонзам": ["ОрхонЗам ХХК"],
    "Голден лайт": ["Голден лайт групп"],
    "Тэнгис тэмүүлэгч": ["Тэнгис Тэмүүлэгч ХХК", "ТэнгисТэмүүлэгч"],
    "Түдэвтэй Уул": ["Түдэвтэй уул"],
    "Жаргалант Ургамал": ["Жаргалант Ургамал ХХК", "Жаргалант ургамал-23"],
    "Бэлгүтэй": ["Х.Бэлгүтэй", "Бэлгүтэй-6"],
    "Эрдэнэт шанд": ["иргэн Ч.Баярмагнай", "Ч.Баярмагнай", "эрдэнэт шанд-24"],
    # ── зөвхөн AR самбарт: хувилбаргүй, гэхдээ каноник ──
    "Дархан Оюунаа": [], "Тасралтгүй урсгал": [], "Грандслаб": [],
    "Хурд групп": [],
    # ── зөвхөн ПАРКИЙН дэвтэрт (WB2): бие даасан тал гэж үзэв, нэгтгээгүй ──
    "БЛҮҮМ архангай": [], "Блүүм дарь эх": [], "Говьресурс УТБА": [],
    "Говьресус БМ": [], "Хурд Гранд Слаб": [], "Хурд Бетон арматур": [],
    "УранОчир": [], "Батхолбоо": [], "Сачи-бэхи 38": [], "Ганцоож": [],
    "Угаал Гол ХХК": [], "Орон нутаг": [], "Ангирмаа": [], "Д.Мягмаржав": [],
    "Флорес импекс ХХК": [], "Зүмбэр харш": [], "Оюунаа эгч": [],
}

# Нэгтгээгүй — ТҮҮНИЙ шийдэх ёстой хосууд. (нэр А, нэр Б, асуулт)
AMBIGUOUS: list[tuple[str, str, str]] = [
    ("Блүүм технологи", "БЛҮҮМ архангай",
     "Архангайн талбай нь Блүүмийн НЭГ авлагад орох уу, тусдаа харилцагч уу? "
     "НОТОЛГОО: БЛҮҮМ-2 хуудасны 4,294ш = технологи 2,044 + архангай 326 + "
     "дарь эх 1,924 — яг таарч байна, тэгэхээр хуудас нь ГУРВУУЛАНГ хамарсан."),
    ("Блүүм технологи", "Блүүм дарь эх",
     "Дарь эхийн талбай нь Блүүмийн НЭГ авлагад орох уу, тусдаа харилцагч уу? "
     "(дээрх нотолгоог үзнэ үү)"),
    ("Говь Ресурс Хурд", "Говьресурс УТБА",
     "УТБА-гийн төсөл нь ижил тал уу? (паркийн дэвтэрт тусдаа мөр)"),
    ("Говь Ресурс Хурд", "Говьресус БМ",
     "«Говьресус БМ» нь Говьресурсын өөр төсөл үү, БМонгол уу?"),
    ("Хурд групп", "Грандслаб",
     "«Хурд Гранд Слаб» нь Хурд группын дотор уу, тусдаа «Грандслаб» уу?"),
    ("Дархан Оюунаа", "Оюунаа эгч",
     "Паркийн дэвтрийн «Оюунаа эгч» нь самбарын «Дархан Оюунаа» мөн үү?"),
    ("Бутангууд", "Батцоож",
     "«Батцоож» хуудас нь Бутангуудын дэд дэвтэр үү (гэрээ №25/19 ижил)?"),
]

_ALIAS_INDEX: dict[str, str] = {}
for _canon, _variants in ALIASES.items():
    _ALIAS_INDEX[name_key(_canon)] = _canon
    for _v in _variants:
        _ALIAS_INDEX[name_key(_v)] = _canon


@dataclass(frozen=True)
class Canon:
    name: str
    matched: bool
    raw: str


def canon_client(raw) -> Canon:
    """Нэрийн хувилбар → каноник нэр. Танигдаагүйг ХЭВЭЭР нь буцаана
    (`matched=False`) — чимээгүй хаях нь мөнгө алдах хамгийн хямд арга."""
    s = re.sub(r"\s+", " ", str(raw or "")).strip()
    key = name_key(s)
    if key in _ALIAS_INDEX:
        return Canon(_ALIAS_INDEX[key], True, s)
    return Canon(s, False, s)


def parse_deposit(v) -> float | None:
    """Барьцаа. «байршуулаагүй» → None (0 гэвэл ТӨЛСӨН мэт уншигдана, R21)."""
    if isinstance(v, str) and "байршуул" in v.casefold():
        return None
    return parse_money(v)


@dataclass(frozen=True)
class Balance:
    debt: float
    credit: float


def split_balance(x: float | None) -> Balance:
    """Сөрөг үлдэгдэл = ИЛҮҮ төлөлт (R18) — өр биш, кредит."""
    v = float(x or 0)
    return Balance(debt=v if v > 0 else 0.0, credit=-v if v < 0 else 0.0)


def reconcile_balance_and_deposit(total, paid, balance, deposit):
    """Самбарын мөрөөс (үлдэгдэл, барьцаа, тэмдэглэл).

    БМонголын кейс: `Үлдэгдэл` хоосон, сөрөг дүн нь БАРЬЦААНЫ баганад
    бичигдсэн — барьцаа гэж уншвал 192,500₮ хоёр газраас нэг зэрэг гарна.
    """
    note = ""
    bal = balance
    if bal is None:
        bal = (total or 0) - (paid or 0)
    dep = deposit or 0
    if bal < 0 and dep > 0 and abs(abs(bal) - dep) < 1:
        dep = 0
        note = ("Сөрөг үлдэгдэл БАРЬЦААНЫ баганад бичигдсэн — барьцаа гэж "
                "тооцоогүй, илүү төлөлт (кредит) болгов")
    return float(bal), float(dep), note


# ── Материалын код ──────────────────────────────────────────────────────────
HEV_CODES = ("6012", "5012", "4512", "4012", "3012", "2012",
             "1010", "1015", "1020", "1515", "1200", "2400")
TRUBA_CODES = ("6м", "4м", "3м", "2м")
GRADE_SUFFIX = {"пл": "плас", "плас": "плас", "ш": "шинэ", "шинэ": "шинэ",
                "а": "А", "в": "В", "b": "В", "сольсон": "сольсон", "шорт": "шорт"}

# Дэвтэрт бий — каталогт АЛГА. Чимээгүй хаяхгүй, тайланд гарна.
CATALOG_GAPS: dict[str, str] = {
    "1025": "Дотор булан 1025 — каталогт байхгүй",
    "2020": "Дотор булан 2020 — каталогт байхгүй",
    "5м": "Труба 5м — каталогт байхгүй",
    "1.5м": "Труба 1.5м — каталогт байхгүй",
    "1.5": "Труба 1.5м — каталогт байхгүй",
    "1м": "Труба 1м — каталогт байхгүй",
    "Шат": "Шат — каталогт байхгүй (материалын ангилал нээгээгүй)",
}


def material_of(raw) -> tuple[str, str] | None:
    """Нүд → (каталогийн нэр, зэрэглэл) эсвэл None.
    6012→Хэв · В2/V2→Тулаас · 6м→Труба. «5012 пл», «V2 шинэ» → зэрэглэл."""
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, float) and raw == int(raw):
        s = str(int(raw))
    else:
        s = str(raw).strip()
    if not s:
        return None
    s = re.sub(r"(\d)\s+м\b", r"\1м", s)          # «4 м» → «4м»
    parts = s.split()
    base = parts[0]
    base = re.sub(r"^[BbVvВв](?=\d)", "В", base)
    grade = GRADE_SUFFIX.get(parts[1].casefold(), "А") if len(parts) > 1 else "А"
    if base in HEV_CODES:
        return (f"Хэв хашмал {base}", grade)
    if re.fullmatch(r"В[2-6]", base):
        return (f"Тулаас {base}", grade)
    if re.fullmatch(r"\d+(?:\.\d+)?м", base):
        return (f"Труба {base}", grade) if base in TRUBA_CODES else None
    return None


# ══════════════════════════════════════════════════ 2. ДЭВТЭР УНШИХ ДАВХРАГА

class Report:
    """Бүх алдаа, туг, шийдвэрийг НЭГ газар цуглуулна."""

    def __init__(self):
        self.warnings: list[str] = []
        self.unparsed: list[str] = []
        self.merges: list[dict] = []
        self.gaps: list[str] = []

    def warn(self, msg: str):
        if msg not in self.warnings:
            self.warnings.append(msg)

    def cannot_parse(self, where: str, value):
        self.unparsed.append(f"{where}: {value!r}")


def _rows(ws, max_col=None):
    return [tuple(r) for r in ws.iter_rows(max_col=max_col or ws.max_column,
                                           values_only=True)]


def _txt(c) -> str:
    return "" if c is None else str(c).strip()


# ── WB3 · AR самбар ────────────────────────────────────────────────────────
def parse_ar_board(rows, rep: Report) -> dict[str, dict]:
    """«Түрээс тооцоо-26»: [нэр, өмнөх, 3–7 сар, Нийт дүн, Тооцоо хийсэн,
    Үлдэгдэл, Барьцаа]. Нэргүй мөр + дүнтэй = хүснэгт дуусав."""
    out: dict[str, dict] = {}
    for ri, r in enumerate(rows[2:], start=3):
        r = tuple(r) + (None,) * 12
        name = _txt(r[0])
        if not name:
            if parse_money(r[1]) or parse_money(r[2]):
                break                                  # нийлбэрийн мөр
            continue
        total, paid = parse_money(r[7]), parse_money(r[8])
        bal, dep, note = reconcile_balance_and_deposit(
            total, paid, parse_money(r[9]), parse_deposit(r[10]))
        not_lodged = isinstance(r[10], str) and "байршуул" in str(r[10]).casefold()
        c = canon_client(name)
        if not c.matched:
            rep.warn(f"AR самбар: нэр толинд алга — «{name}» (хэвээр нь авав)")
        row = out.setdefault(c.name, {"name": c.name, "sources": [], "total": 0.0,
                                      "paid": 0.0, "balance": 0.0, "deposit": 0.0,
                                      "deposit_not_lodged": False, "notes": [],
                                      "rows": 0})
        row["sources"].append(name)
        row["total"] += total or 0
        row["paid"] += paid or 0
        row["balance"] += bal
        row["deposit"] += dep
        row["deposit_not_lodged"] = row["deposit_not_lodged"] or not_lodged
        row["rows"] += 1
        if note:
            row["notes"].append(note)
        if row["rows"] > 1:
            rep.merges.append({"canonical": c.name, "kind": "самбарын давхар мөр",
                               "sources": list(row["sources"]),
                               "detail": f"{row['rows']} мөр нийлүүлэв"})
    return out


def parse_ar_totals(rows, rep: Report) -> dict:
    """Самбарын НИЙЛБЭРИЙН мөр (нэргүй, эхний баганад дүнтэй).

    Түүний нийлбэр нь мөрүүдийнхээ нийлбэртэй ТААРАХ албагүй: SUM-ийн муж нь
    гараар бичигдсэн бөгөөд хүснэгтийн ЭХНИЙ мөрүүдийг тасалж орхисон байж
    болно. Тиймээс ХОЁУЛАНГ нь бичиж, зөрүүг нь тайланд гаргана."""
    for r in rows[2:]:
        r = tuple(r) + (None,) * 12
        if _txt(r[0]):
            continue
        if parse_money(r[1]) or parse_money(r[2]):
            return {"prev": parse_money(r[1]), "total": parse_money(r[7]),
                    "paid": parse_money(r[8]), "balance": parse_money(r[9]),
                    "deposit": parse_money(r[10])}
    rep.warn("AR самбар: нийлбэрийн мөр олдсонгүй")
    return {}


def parse_small_receivables(rows, rep: Report) -> list[dict]:
    """Самбарын доод «тооцов» жагсаалт — жижиг авлагууд, «Нийт»-д зогсоно."""
    out, started = [], False
    for r in rows:
        r = tuple(r) + (None,) * 4
        if not started:
            started = any("тооцов" in _txt(c) for c in r)
            continue
        name = _txt(r[0])
        if not name:
            continue
        if name == "Нийт":
            break
        amt = parse_money(r[1])
        if amt and amt > 0:
            out.append({"name": canon_client(name).name, "balance": round(amt),
                        "deposit": 0.0, "note": "Жижиг авлага («тооцов» жагсаалт)"})
    return out


def parse_loans(rows, rep: Report) -> list[dict]:
    """«Өглөгө.зээл-26»: [№, нэр, үндсэн, сарын хүү %, эхэлсэн огноо, …]"""
    out = []
    for r in rows:
        r = tuple(r) + (None,) * 6
        name = _txt(r[1])
        principal = parse_money(r[2])
        rate = parse_money(r[3])
        if not name or not principal or principal <= 0:
            continue
        start = parse_date_any(r[4])
        if r[4] not in (None, "") and start is None:
            rep.cannot_parse(f"Зээл «{name}» огноо", r[4])
        low = name.casefold()
        kind = ("bank" if "банк" in low else
                "credit" if "кредит" in low else "private")
        out.append({"name": name, "kind": kind, "principal": round(principal),
                    "monthly_rate": rate or 0,
                    "start_date": start.isoformat() if start else None,
                    "note": "" if rate else "Хүүгүй өглөг гэж бүртгэв"})
        if not rate:
            rep.warn(f"Зээл «{name}»: сарын хүү бичигдээгүй — 0%-иар авав")
        if "старкэйч" in low:
            break                       # доош нь хүснэгтийн гадуурх тэмдэглэл
    return out


# ── WB1 · тооллого ─────────────────────────────────────────────────────────
GROUP_PREFIX = {"хэв": "Хэв хашмал {}", "тулаас": "Тулаас {}", "труба": "Труба {}"}


def parse_stock(rows, rep: Report) -> list[dict]:
    """«тооллого 6.22»: [_, бүлэг, код, төлөв, тоо] — бүлэг/код доош өвлөнө.
    Төлөвгүй мөр = дэд нийлбэр (тухайн кодод өмнө нь төлөвтэй мөр орсон бол)."""
    acc: dict[tuple, float] = {}
    group = code = None
    for r in rows:
        r = tuple(r) + (None,) * 6
        g = _txt(r[1]).casefold()
        if g in GROUP_PREFIX:
            group = g
        if r[2] not in (None, ""):
            code = _txt(int(r[2]) if isinstance(r[2], float) and r[2] == int(r[2])
                        else r[2])
        state = _txt(r[3])
        cnt = parse_money(r[4])
        if group is None or code is None or cnt is None or cnt <= 0:
            continue
        if not state:
            if any(k[0] == group and k[1] == code for k in acc):
                continue                                       # дэд нийлбэр
            state = "А"
        acc[(group, code, state)] = acc.get((group, code, state), 0) + cnt
    out = []
    for (g, c, s), q in sorted(acc.items()):
        mat = material_of(c)
        if mat is None:
            rep.warn(f"Тооллого: каталогт байхгүй SKU — {GROUP_PREFIX[g].format(c)} "
                     f"({q:g}ш ачаалагдсангүй)")
            continue
        out.append({"material": GROUP_PREFIX[g].format(c), "grade": s, "on_hand": q})
    return out


# ── WB1 · харилцагчийн хуудас (циклийн блокууд) ────────────────────────────
_CYCLE_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})")
_NO_RE = re.compile(r"№\s*(\d{1,2}\s*[./]\s*\d{1,3})")
_NO_FALLBACK = re.compile(r"№\s*(\d{1,3})")

# Хуудас → каноник харилцагч. Клиент биш хуудсууд: None + шалтгаан.
SHEET_CLIENT: dict[str, str | None] = {
    "ТэнгисТэмүүлэгч": None, "Марч-1": "Марч констракшн", "БЛҮҮМ-2": "Блүүм технологи",
    "Блүүт тооцоо": None, "Зулаа-3": "Зулаа", "Говьресурс-4": "Говь Ресурс Хурд",
    "говь тооцоо": None, "ГрэйтМайнинг-5": "Грэйт Майнинг", "Бэлгүтэй-6": "Бэлгүтэй",
    "Бутангууд-7": "Бутангууд", "Батцоож": None, "Бутан-Өнөорд": None,
    "ӨнөОрд-8": "Өнө Орд ХХК яармаг", "өнөорд-Архив": None, "Мөнхболд-9": "Мөнхболд",
    "Монуул-10": "Монуул ХХК", "Монуул тооцоо": None,
    "АшидДонж-11": "Ашид Донж Билгүүн", "БМ-12": "БМонгол ХХК",
    "Удам-13": "Удам констракшн", "ШижирТиара-14": "Шижир Тиара",
    "Агар Эрдэнэс-15": "Агар Эдэнэс Трэйд", "Арвинбулаг-16": "Арвинбулаг констракшн",
    "Өрнүүн эрчит зам-17": "Өрнүүн Эрчит Зам ххк", "Сүхжин-18": "Сүхжин ХХК",
    "Хатанбүүвэй-19": "Хатанбүүвэй", "Өнөорд Нүхт-20": "Өнө Орд ХХК нүхт",
    "Автокран": None, "Төвшөө": None, "тооллого 6.22": None,
    "Цэрэнчимэд-21": "Цэрэнчимэд", "НьюМэнПовэр-22": "Нью Мэн Повер ХХК",
    "Жаргалант ургамал-23": "Жаргалант Ургамал", "эрдэнэт шанд-24": "Эрдэнэт шанд",
    "Содоо худалдаа": None, "Зайсан үнийн санал": None,
}
NON_CLIENT_REASON = {
    "ТэнгисТэмүүлэгч": "худалдааны тооцоо (түрээс биш)",
    "Блүүт тооцоо": "Блүүмийн тооцоо нийлсэн хуудас",
    "говь тооцоо": "Говьресурсын тооцоо нийлсэн хуудас",
    "Батцоож": "Бутангуудын (№25/19) дэд дэвтэр — эзэн нь тодорхойгүй",
    "Бутан-Өнөорд": "харилцагч ХООРОНДЫН тооцоо (H11) — систем дэмжээгүй",
    "өнөорд-Архив": "архив",
    "Монуул тооцоо": "тооцоо нийлсэн хуудас",
    "Автокран": "кран — механизмын дэвтэр",
    "Төвшөө": "тэмдэглэл (эзэн нь тодорхойгүй)",
    "тооллого 6.22": "нөөцийн тооллого",
    "Содоо худалдаа": "худалдааны тооцоо",
    "Зайсан үнийн санал": "үнийн санал",
}


# Тоо/буцаалтын баганыг тэр ГУРВАН янзаар нэрлэдэг.
QTY_LABELS = ("тоо", "тоо ш", "тоо/ш")
BACK_LABELS = ("ирсэн", "орлого")          # буцаж ирсэн огноо
OUT_LABELS = ("гарсан", "зарлага")         # олгосон огноо


def find_blocks(rows, max_header_row=14) -> list[dict]:
    """Хэвтээ блокийн толгойнууд. «үнэ»-г тулгуур болгоно, учир нь:
      * «тоо» ба «үнэ» хооронд хоосон багана байж болно (БЛҮҮМ-2 блок 2);
      * тооны баганыг «тоо» биш, ХАРИЛЦАГЧИЙН нэрээр нэрлэсэн байж болно
        (Өнөорд Нүхт-20 → «Өнөорд»);
      * буцаалтын багана «ирсэн» эсвэл «орлого» гэж нэрлэгддэг (Монуул-10).
    """
    blocks = []
    for ri, row in enumerate(rows[:max_header_row]):
        cells = [_txt(c).casefold() for c in row]
        for ci, c in enumerate(cells):
            if c != "үнэ" or ci == 0:
                continue
            days = next((j for j in range(ci + 1, min(ci + 4, len(cells)))
                         if cells[j] == "хоног"), None)
            if days is None:
                continue
            qty = next((j for j in range(max(ci - 3, 0), ci)
                        if cells[j] in QTY_LABELS), None)
            if qty is None:
                qty = ci - 1                      # «Өнөорд» гэх мэт нэршил
            cols = {"тоо": qty, "үнэ": ci, "хоног": days}
            for j in range(days + 1, min(days + 5, len(cells))):
                if cells[j] in BACK_LABELS:
                    cols["ирсэн"] = j
                elif cells[j] in OUT_LABELS:
                    cols["гарсан"] = j
            blocks.append({"header_row": ri, "cols": cols})
    return blocks


def block_period_end(rows, qty_col) -> tuple[int, int]:
    """Блокийн «Нийт» мөрний циклийн шошгоос үеийн ТӨГСГӨЛ (сар, өдөр)."""
    best = (0, 0)
    lo, hi = max(qty_col - 1, 0), qty_col + 5
    for r in rows:
        for c in tuple(r)[lo:hi]:
            m = _CYCLE_RE.search(_txt(c))
            if m:
                best = max(best, (int(m.group(3)), int(m.group(4))))
    return best


def _row_period(cells, qc) -> tuple[int, int] | None:
    """Мөрөнд циклийн шошго («4.30-5.31») байвал түүний ТӨГСГӨЛ."""
    for c in cells[max(qc - 3, 0):qc + 5]:
        m = _CYCLE_RE.search(_txt(c))
        if m:
            return (int(m.group(3)), int(m.group(4)))
    return None


def _resolve_code(cells, qc, carry):
    """SKU-гийн нүд блок бүрд өөр байрлана:
      «Материал | код | тоо»  (Грэйт)  → qc-1
      «код | тэмдэглэл | тоо» (Агар)   → qc-2, дунд нь «үлд» гэсэн тэмдэглэл
      хоосон                            → өмнөх мөрөө өвлөнө
      «шинэ»/«пл»                       → өмнөх SKU + ЭНЭ зэрэглэл
    Буцна: ((материал, зэрэглэл) | None, түүхий утга, өвлүүлэх шинэ carry)"""
    prim = cells[qc - 1] if qc >= 1 else None
    sec = cells[qc - 2] if qc >= 2 else None
    for raw in (prim, sec):
        got = material_of(raw)
        if got:
            return got, raw, got
    word = _txt(prim).casefold()
    if word in GRADE_SUFFIX and carry:
        return (carry[0], GRADE_SUFFIX[word]), prim, carry
    if _txt(prim) == "" and _txt(sec) == "" and carry:
        return carry, None, carry
    return None, (prim if _txt(prim) else sec), carry


def parse_contract_sheet(sheet_name, rows, rep: Report):
    """Хуудасны ХАМГИЙН СҮҮЛИЙН блокийн ХАМГИЙН СҮҮЛИЙН үеэс одоо ГАДАА
    байгаа мөрүүд.

    Түүний хуудас циклээ ХОЁР янзаар давхарлана: баруун тийш шинэ блок
    (БЛҮҮМ) БА доош шинэ үе (Удам). Хоёуланг нь уншина — эс тэгвэл Удамын
    7.06-нд бүгдийг буцаасныг олж харалгүй 1,600ш-ийг гадаа гэж бүртгэнэ.
    «ирсэн» багана дүүрсэн мөр = буцаагдсан («ирээгүй» гэж бичсэн нь ЭСРЭГ).
    """
    blocks = find_blocks(rows)
    if not blocks:
        return None, {"error": "тоо·үнэ·хоног толгой олдсонгүй"}
    block = max(blocks, key=lambda b: block_period_end(rows, b["cols"]["тоо"]))
    cols = block["cols"]
    qc, rc = cols["тоо"], cols["үнэ"]
    irsen = cols.get("ирсэн")

    # ---- блокийг босоо үеүүдэд хуваах ----
    sections: list[dict] = []
    cur: list[tuple] = []
    for r in rows[block["header_row"] + 1:]:
        cells = tuple(r) + (None,) * 12
        if any(_txt(c).startswith("Нийт төлөх") for c in cells[max(qc - 3, 0):qc + 2]):
            break
        per = _row_period(cells, qc)
        if per:
            sections.append({"period": per, "rows": cur})
            cur = []
            continue
        cur.append(cells)
    if cur:
        sections.append({"period": (0, 0), "rows": cur})

    def _live_rows(sec):
        n = 0
        for cells in sec["rows"]:
            if parse_money(cells[qc]) and parse_money(cells[rc]):
                n += 1
        return n

    filled = [s for s in sections if _live_rows(s)]
    if not filled:
        return [], {"no": _contract_no(rows), "vat_mentioned": _vat_seen(rows),
                    "returned_rows": 0, "period_end": (0, 0),
                    "blocks": len(blocks), "sections": len(sections),
                    "empty": True}
    section = max(filled, key=lambda s: s["period"])

    items: dict[tuple, float] = {}
    carry = None
    skipped_returned = 0
    for cells in section["rows"]:
        code, raw_code, carry = _resolve_code(cells, qc, carry)
        qty, rate = parse_money(cells[qc]), parse_money(cells[rc])
        if qty is None or rate is None:
            continue
        if not (50 <= rate <= 2000) or not (0 < qty <= 50000):
            continue
        if code is None:
            rep.warn(f"{sheet_name}: SKU таних боломжгүй — «{_txt(raw_code)}» "
                     f"({qty:g}ш × {rate:g}₮ алгасав)"
                     + (f" · {CATALOG_GAPS[_txt(raw_code)]}"
                        if _txt(raw_code) in CATALOG_GAPS else ""))
            continue
        back = _txt(cells[irsen]) if irsen is not None else ""
        if back and "ирээгүй" not in back.casefold():
            skipped_returned += 1
            continue
        items[(code[0], code[1], rate)] = items.get((code[0], code[1], rate), 0) + qty

    meta = {"no": _contract_no(rows), "vat_mentioned": _vat_seen(rows),
            "returned_rows": skipped_returned, "period_end": section["period"],
            "blocks": len(blocks), "sections": len(sections)}
    out = [{"material": m, "grade": g, "qty": q, "daily_rate": rt}
           for (m, g, rt), q in sorted(items.items())]
    return out, meta


def _contract_no(rows) -> str:
    no = ""
    for hr in rows[:3]:
        head = " ".join(_txt(c) for c in tuple(hr)[:6])
        m = _NO_RE.search(head) or _NO_FALLBACK.search(head)
        if m:
            no = re.sub(r"\s+", "", m.group(1))
            break
    return no


def _vat_seen(rows) -> bool:
    return any("нөат" in _txt(c).casefold() for r in rows for c in r)


# ── WB2 · паркийн матриц ───────────────────────────────────────────────────
def parse_park_matrix(rows, rep: Report, sheet_label: str):
    """«2026 шинэ»: МӨР=харилцагч × БАГАНА=SKU. Хоёр толгой мөр (бүлэг, код).
    Буцна: {каноник: {(материал, зэрэглэл): тоо}} + танигдаагүй баганууд."""
    hdr = None
    for ri, r in enumerate(rows[:12]):
        if any(_txt(c) == "Харилцагч" for c in r):
            hdr = ri
            break
    if hdr is None:
        rep.warn(f"{sheet_label}: «Харилцагч» толгой олдсонгүй — матриц уншаагүй")
        return {}, []
    code_row = tuple(rows[hdr + 1]) + (None,) * 4
    group_row = tuple(rows[hdr]) + (None,) * 4
    colmap: dict[int, tuple[str, str]] = {}
    unknown: list[str] = []
    for ci in range(2, len(code_row)):
        raw = _txt(code_row[ci])
        if not raw or raw.casefold() in ("нийт хэв", "нийт"):
            continue
        # «V2 шинэ» — зэрэглэл баганын гарчигт шингэсэн
        mat = material_of(raw)
        if mat is None:
            grp = _txt(group_row[ci])
            unknown.append(f"{grp + ' ' if grp else ''}{raw}".strip())
            continue
        colmap[ci] = mat
    STOP = {"түрээсийн дүн", "хашаанд бгаа", "үндсэн материал", "худалдаж авсан",
            "бнсу орж ирсэн", "хятад улсаас ирсэн", "зарагдсан", "акт",
            "акт орж ирсэн", "аа-д", "тооцоолуур", "түрээсэнд", "үлдэгдэл"}
    out: dict[str, dict] = {}
    for r in rows[hdr + 2:]:
        r = tuple(r) + (None,) * 4
        name = _txt(r[1])
        if not name:
            continue
        if name.casefold() in STOP:
            break
        c = canon_client(name)
        bucket = out.setdefault(c.name, {})
        for ci, mat in colmap.items():
            q = parse_money(r[ci]) if ci < len(r) else None
            if q:
                bucket[mat] = bucket.get(mat, 0) + q
        if not c.matched:
            rep.warn(f"Паркийн дэвтэр: нэр толинд алга — «{name}» (хэвээр нь авав)")
    return out, sorted(set(unknown))


# ═══════════════════════════════════════════════════════════ 3. УГСРАЛТ

def build(src_dir: str, as_of: str) -> tuple[dict, Report]:
    import openpyxl

    rep = Report()

    def load(fn):
        path = os.path.join(src_dir, fn)
        if not os.path.exists(path):
            raise SystemExit(f"Файл олдсонгүй: {path}")
        return openpyxl.load_workbook(path, data_only=True)

    wb1, wb2, wb3 = load(WB1), load(WB2), load(WB3)

    # ---- WB3: самбар, жижиг авлага, зээл ----
    board_rows = _rows(wb3["Түрээс тооцоо-26"], max_col=14)
    board = parse_ar_board(board_rows, rep)
    board_totals = parse_ar_totals(board_rows, rep)
    small = parse_small_receivables(board_rows, rep)
    loans = parse_loans(_rows(wb3["Өглөгө.зээл-26"], max_col=12), rep)

    # ---- WB1: тооллого ----
    stock = parse_stock(_rows(wb1["тооллого 6.22"], max_col=10), rep)

    # ---- WB2: паркийн матриц (гадаа байгаа) ----
    park, unknown_sku = parse_park_matrix(_rows(wb2["2026 шинэ"]), rep, "2026 шинэ")
    park_prev, _ = parse_park_matrix(_rows(wb2["2026 он"]), rep, "2026 он")
    for u in unknown_sku:
        code = u.split()[-1]
        rep.warn(f"Паркийн дэвтэр: каталогт байхгүй багана — {u}"
                 + (f" ({CATALOG_GAPS[code]})" if code in CATALOG_GAPS else ""))
        rep.gaps.append(u)

    # ---- WB1: харилцагчийн хуудсууд ----
    sheets_seen = {ws.title.strip() for ws in wb1.worksheets}
    for name in sorted(sheets_seen - set(SHEET_CLIENT)):
        rep.warn(f"WB1: тодорхойлогдоогүй хуудас — «{name}» (алгасав)")

    contracts: list[dict] = []
    sheet_report: list[dict] = []
    used_no: dict[str, str] = {}
    for sheet, client in SHEET_CLIENT.items():
        if sheet not in sheets_seen:
            rep.warn(f"WB1: хуудас алга — «{sheet}»")
            continue
        if client is None:
            sheet_report.append({"sheet": sheet, "client": None,
                                 "reason": NON_CLIENT_REASON.get(sheet, "клиент биш")})
            continue
        rows = _rows(wb1[sheet])
        items, meta = parse_contract_sheet(sheet, rows, rep)
        in_park = client in park
        on_rent = park.get(client, {})
        out_qty = sum(on_rent.values())
        entry = {"sheet": sheet, "client": client, "meta": meta,
                 "wb1_qty": sum(i["qty"] for i in items) if items else 0,
                 "wb2_qty": out_qty, "wb2_listed": in_park}
        if items is None:
            rep.warn(f"{sheet} ({client}): {meta['error']} — гэрээ үүсээгүй")
            entry["result"] = "толгой олдсонгүй"
            sheet_report.append(entry)
            continue
        if not items:
            entry["result"] = "хуудасны сүүлийн үед гадаа мөр үлдээгүй"
            if out_qty > 0:
                rep.warn(f"{sheet} ({client}): хуудсанд гадаа мөр алга, харин "
                         f"паркийн дэвтэрт {out_qty:g}ш байна — ШИЙДВЭР ХЭРЭГТЭЙ")
            sheet_report.append(entry)
            continue
        # ХОЁР дэвтрийн санал зөрөх гурван тохиолдол (олдвор б):
        #   бүртгэлтэй & >0  → хоёул зөвшөөрөв   → гэрээ үүснэ
        #   бүртгэлгүй       → парк мэдэхгүй (8-р сарын шинэ гэрээ) → үүснэ + туг
        #   бүртгэлтэй & =0  → парк «буцсан» гэж БАТАЛЖ байна → ҮҮСГЭХГҮЙ + туг
        if in_park and out_qty <= 0:
            entry["result"] = "паркийн дэвтэр 0 гэж БАТАЛСАН — гэрээ үүсгээгүй"
            rep.warn(f"{sheet} ({client}): хуудсанд {entry['wb1_qty']:g}ш гадаа "
                     f"боловч «2026 шинэ» паркийн дэвтэр 0 гэж бичсэн — гэрээ "
                     f"ҮҮСГЭЭГҮЙ. АЛЬ нь үнэн бэ?")
            sheet_report.append(entry)
            continue
        if not in_park:
            rep.warn(f"{sheet} ({client}): паркийн дэвтэрт мөр АЛГА (8-р сарын "
                     f"шинэ гэрээ бололтой) — хуудсаар нь {entry['wb1_qty']:g}ш "
                     f"гадаа гэж үүсгэв, ТЭР баталгаажуулна")
        no = meta["no"] or sheet
        if no in used_no:
            rep.warn(f"Гэрээний дугаар давхардав: №{no} — «{used_no[no]}» ба "
                     f"«{sheet}». Хоёр дахийг №{no}·{sheet} болгов")
            no = f"{no}·{sheet}"
        used_no[no] = sheet
        if meta["vat_mentioned"]:
            rep.warn(f"{sheet} ({client}): хуудсанд НӨАТ дурдагдсан — систем 0%-иар "
                     f"ачаалав, хувь хэмжээг ТЭР баталгаажуулна (H12)")
        day = sum(i["qty"] * i["daily_rate"] for i in items)
        contracts.append({
            "client": client, "no": no, "items": items, "vat_percent": 0,
            "note": (f"Шилжүүлэлт: «{sheet}» хуудсаас · өдрийн дүн {day:,.0f}₮"
                     + (" · НӨАТ шалгах" if meta["vat_mentioned"] else "")),
        })
        entry["result"] = "гэрээ үүсэв"
        entry["no"] = no
        entry["day_amount"] = day
        sheet_report.append(entry)

    # ---- Харилцагчдын жагсаалт ----
    clients: list[dict] = []
    seen: set[str] = set()
    for name, row in board.items():
        note = "Мастер самбар «Түрээс тооцоо-26»"
        if row["notes"]:
            note += " · " + " · ".join(row["notes"])
        if row["deposit_not_lodged"]:
            note += " · барьцаа БАЙРШУУЛААГҮЙ"
        clients.append({"name": name, "balance": round(row["balance"]),
                        "deposit": round(row["deposit"]), "note": note})
        seen.add(name)
    for row in small:
        if row["name"] in seen:
            rep.warn(f"«{row['name']}» самбар БА «тооцов» жагсаалтад давхар — "
                     f"жижиг авлагыг алгасав")
            continue
        clients.append(row)
        seen.add(row["name"])
    # Гэрээтэй боловч самбарт байхгүй харилцагч — 0 үлдэгдлээр нээнэ
    for c in contracts:
        if c["client"] not in seen:
            clients.append({"name": c["client"], "balance": 0, "deposit": 0,
                            "note": "Самбарт байхгүй — паркийн/хуудасны дэвтрээс"})
            seen.add(c["client"])
            rep.warn(f"«{c['client']}»: AR самбарт мөр алга, гэрээ нь бий — "
                     f"үлдэгдэл 0-ээр нээв")
    # Паркийн дэвтэрт гадаа байгаа боловч хаана ч алга
    for name, mats in sorted(park.items()):
        if sum(mats.values()) > 0 and name not in seen:
            rep.warn(f"«{name}»: паркийн дэвтэрт {sum(mats.values()):g}ш гадаа "
                     f"байна, AR самбарт мөр алга — ШИЙДВЭР ХЭРЭГТЭЙ")

    alias_map = {v: canon for canon, vs in ALIASES.items() for v in vs}
    data = {
        "as_of": as_of,
        "source": f"{WB1} + {WB2} + {WB3} (openpyxl, 2026.08 байдлаар)",
        "clients": sorted(clients, key=lambda c: c["name"]),
        "stock": stock,
        "loans": loans,
        "barter": BARTER,
        "contracts": sorted(contracts, key=lambda c: c["no"]),
        "audit": {
            "alias_map": dict(sorted(alias_map.items())),
            "ambiguous": [{"a": a, "b": b, "question": q} for a, b, q in AMBIGUOUS],
            "merges": rep.merges,
            "ar_board": {k: {kk: vv for kk, vv in v.items() if kk != "notes"}
                         for k, v in sorted(board.items())},
            "ar_board_totals": board_totals,
            "park_now": {k: {f"{m}·{g}": q for (m, g), q in sorted(v.items())}
                         for k, v in sorted(park.items()) if v},
            "park_prev": {k: {f"{m}·{g}": q for (m, g), q in sorted(v.items())}
                          for k, v in sorted(park_prev.items()) if v},
            "sheets": sheet_report,
            "catalog_gaps": sorted(set(rep.gaps)),
            "warnings": rep.warnings,
            "unparsed": rep.unparsed,
        },
    }
    return data, rep


def main(argv=None):
    ap = argparse.ArgumentParser(description="xlsx → real_data.json")
    ap.add_argument("--src", default=os.path.expanduser(
        "~/Downloads/Түрээсийн тооцоо 2026 2"), help="гурван .xlsx байгаа хавтас")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(
        os.path.abspath(__file__)), "real_data.json"))
    ap.add_argument("--as-of", default=DEFAULT_AS_OF)
    a = ap.parse_args(argv)

    data, rep = build(a.src, a.as_of)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")

    debt = sum(c["balance"] for c in data["clients"] if c["balance"] > 0)
    cred = -sum(c["balance"] for c in data["clients"] if c["balance"] < 0)
    print(f"→ {a.out}")
    print(f"  Харилцагч : {len(data['clients'])}  ·  авлага {debt:,.0f}₮  ·  "
          f"илүү төлөлт {cred:,.0f}₮")
    print(f"  Барьцаа   : {sum(c['deposit'] for c in data['clients']):,.0f}₮")
    print(f"  Гэрээ     : {len(data['contracts'])}  ·  өдрийн нийт дүн "
          f"{sum(i['qty'] * i['daily_rate'] for c in data['contracts'] for i in c['items']):,.0f}₮")
    print(f"  Нөөц      : {len(data['stock'])} мөр · "
          f"{sum(s['on_hand'] for s in data['stock']):,.0f}ш")
    print(f"  Зээл      : {len(data['loans'])} · "
          f"{sum(l['principal'] for l in data['loans']):,.0f}₮")
    print(f"  Бартер    : {len(data['barter'])}")
    print(f"  Анхааруулга: {len(rep.warnings)} · задлагдаагүй нүд: {len(rep.unparsed)}")
    for w in rep.warnings:
        print("   ⚠", w)
    for u in rep.unparsed:
        print("   ✗", u)
    return 0


if __name__ == "__main__":
    sys.exit(main())

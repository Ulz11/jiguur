"""Numbers файлуудаас real_data.json угсрах скрипт.

Claude-ийн sandbox дотор нэг удаа ажилласан — гаралт нь real_data.json.
Дахин ажиллуулах бол: pip install numbers-parser, файлын замуудаа тохируулна.

Эх сурвалж:
  «2026 тооцоо.numbers» → Түрээс тооцоо-26 (авлага, барьцаа), Өглөгө.зээл-26 (зээл)
  «Түрээсийн тооцоо 2026.numbers» → тооллого 6.22 (нөөц)
  Бартер: «Бартер болон авлага-26» + «Бартерт тооцуулах-26»-аас гараар баталгаажуулж кодлов.
"""
import json
import re
import sys
from datetime import date

from numbers_parser import Document

SRC_MAIN = sys.argv[1] if len(sys.argv) > 1 else "/sessions/practical-eager-faraday/mnt/uploads/2026 тооцоо.numbers"
SRC_RENT = sys.argv[2] if len(sys.argv) > 2 else "/sessions/practical-eager-faraday/mnt/uploads/Түрээсийн тооцоо 2026.numbers"
OUT = sys.argv[3] if len(sys.argv) > 3 else "real_data.json"


def rows_of(path, sheet_name):
    doc = Document(path)
    for sheet in doc.sheets:
        if sheet.name.strip() == sheet_name:
            return list(sheet.tables[0].rows(values_only=True))
    raise SystemExit(f"Sheet олдсонгүй: {sheet_name}")


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_clients(rows):
    """Түрээс тооцоо-26: [name, өмнөх, 3-7 сар ×5, нийт, тооцсон, үлдэгдэл, барьцаа]"""
    out = {}
    for r in rows[2:]:
        name = str(r[0] or "").strip()
        if not name:
            # нэргүй мөр = хүснэгт дууссан (нийт дүнгийн мөр)
            if any(num(x) for x in r[1:3]):
                break
            continue
        total, paid, bal, dep = num(r[7]), num(r[8]), num(r[9]), num(r[10])
        if bal is None:
            bal = (total or 0) - (paid or 0)
        dep = dep or 0
        # БМонгол кейс: сөрөг үлдэгдлийн дүн барьцааны баганад бичигдсэн байсан
        if bal < 0 and abs(abs(bal) - dep) < 1:
            dep = 0
        if name in out:  # Бутангууд 2 мөр — нэгтгэнэ
            out[name]["balance"] += bal
            out[name]["deposit"] += dep
        else:
            out[name] = {"name": name, "balance": round(bal), "deposit": round(dep),
                         "note": "Мастер хүснэгтээс (2026 тооцоо)"}
    return list(out.values())


def parse_small_receivables(rows):
    """«тооцов» хэсэг — жижиг авлагууд (Дарханбаяр… Гаваа), Нийт мөрөнд зогсоно."""
    out = []
    started = False
    for r in rows:
        c0 = str(r[0] or "").strip()
        if not started:
            if any("тооцов" in str(c or "") for c in r):
                started = True
            continue
        name = c0 or None
        if not name:
            continue
        if name == "Нийт":
            break
        amt = num(r[1])
        if amt and amt > 0:
            out.append({"name": name, "balance": round(amt), "note": "Жижиг авлага (тооцов жагсаалт)"})
    return out


def parse_loans(rows):
    """Өглөгө.зээл-26: [№, нэр, үндсэн, хүү, огноо, ...сарын төлөлтүүд]"""
    out = []
    for r in rows:
        name = str(r[1] or "").strip()
        principal = num(r[2])
        rate = num(r[3])
        if not name or not principal or principal <= 0:
            continue
        raw_date = str(r[4] or "").strip()
        m = re.match(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", raw_date)
        start = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None
        kind = ("bank" if "банк" in name.lower()
                else "credit" if "кредит" in name.lower() else "private")
        out.append({"name": name, "kind": kind, "principal": round(principal),
                    "monthly_rate": rate or 0, "start_date": start,
                    "note": "" if rate else "Хүүгүй өглөг гэж бүртгэв"})
        if "старкэйч" in name.lower():
            break  # үүнээс доош хүснэгтийн гадуурх тэмдэглэлүүд
    return out


MAT_MAP = {  # тооллогын код → каталогийн нэр
    "хэв": "Хэв хашмал {code}", "тулаас": "Тулаас {code}", "труба": "Труба {code}",
}


def parse_stock(rows):
    """тооллого 6.22: [_, бүлэг, код, төлөв, тоо] — бүлэг/код нь доош өвлөгдөнө."""
    out = {}
    group = code = None
    for r in rows:
        c1 = str(r[1] or "").strip().lower()
        c2 = r[2]
        state = str(r[3] or "").strip()
        cnt = num(r[4])
        if c1 in MAT_MAP:
            group = c1
        if c2 not in (None, ""):
            code = c2
            if isinstance(code, float) and code == int(code):
                code = str(int(code))
            else:
                code = str(code).strip()
        if group is None or code is None or cnt is None or cnt <= 0:
            continue
        if not state:
            # төлөвгүй мөр: дэд нийлбэр (алгасна) эсвэл ганц утгатай код (А гэж үзнэ)
            # дэд нийлбэрийг ялгах: өмнө нь энэ кодод төлөвтэй мөр орсон бол нийлбэр
            if any(k[0] == group and k[1] == code for k in out):
                continue
            state = "А"
        key = (group, code, state)
        out[key] = out.get(key, 0) + cnt
    result = []
    for (g, c, s), q in out.items():
        result.append({"material": MAT_MAP[g].format(code=c), "grade": s, "on_hand": q})
    return result


# ---- Бартер: 2 sheet-ээс гараар баталгаажуулсан жагсаалт ----
BARTER = [
    # Машин (Бартер болон авлага-26 + Бартерт тооцуулах-26)
    {"type": "Машин", "name": "Toyota Hiace 10 суудалтай", "detail": "4416УАУ · 2012 он",
     "date_in": "2024-06-25", "value_in": 55_000_000, "asking_price": 56_000_000,
     "sold_amount": 55_000_000},
    {"type": "Машин", "name": "Toyota Land Cruiser J300", "detail": "0314УНҮ · 2022 он",
     "date_in": "2023-01-03", "value_in": 250_000_000, "asking_price": 250_000_000,
     "sold_amount": 240_000_000},
    {"type": "Машин", "name": "Lexus NX300h", "detail": "0673УКР · 2017 он",
     "date_in": "2022-06-18", "value_in": 75_000_000, "asking_price": 75_000_000,
     "sold_amount": 75_000_000},
    {"type": "Машин", "name": "Чиргүүл", "detail": "5001 · 2025 он",
     "date_in": "2025-07-05", "value_in": 55_000_000, "asking_price": 56_000_000},
    {"type": "Машин", "name": "Вэлпайр №1", "date_in": "2026-01-01", "value_in": 36_000_000},
    {"type": "Машин", "name": "Вэлпайр №2", "date_in": "2026-01-01", "value_in": 65_000_000},
    {"type": "Бусад", "name": "Цамхагт кран ДАХАН ×2", "detail": "2019 он · 2ш",
     "date_in": "2026-04-28", "value_in": 360_000_000, "asking_price": 396_000_000},
    # Байр (Бартер болон авлага-26)
    {"type": "Байр", "name": "Баянбүрд · 31.51м²", "detail": "1 тоот · 4.5 сая/м²",
     "date_in": "2026-01-01", "value_in": 141_795_000},
    {"type": "Байр", "name": "Яармаг молл · 14.85м² №1", "detail": "6.5 сая/м²",
     "date_in": "2026-01-01", "value_in": 96_525_000},
    {"type": "Байр", "name": "Яармаг молл · 14.85м² №2", "detail": "6.5 сая/м²",
     "date_in": "2026-01-01", "value_in": 96_525_000},
    {"type": "Байр", "name": "Яармаг молл · 14.52м²", "detail": "6.5 сая/м²",
     "date_in": "2026-01-01", "value_in": 94_380_000},
    {"type": "Байр", "name": "Арцат Өргөө · 116.93м²", "detail": "ХУД 23-р хороо · 1232/1 тоот · үйлчилгээ",
     "date_in": "2026-01-01", "value_in": 409_255_000, "asking_price": 502_799_000},
    {"type": "Байр", "name": "Цэцэн хотхон · 53.15м²", "detail": "ХУД 21-р хороо · 9 давхар · 2 өрөө",
     "date_in": "2026-01-01", "value_in": 186_025_000, "asking_price": 201_970_000,
     "sold_amount": 191_340_000},
    {"type": "Байр", "name": "Гурван бугат · 51.9м²", "detail": "2.5 сая/м²",
     "date_in": "2026-01-01", "value_in": 129_750_000},
    {"type": "Байр", "name": "Буянт шарга · D-10d C · 63.0м²", "date_in": "2026-01-01", "value_in": 201_600_000},
    {"type": "Байр", "name": "Буянт шарга · D-7d E · 63.38м²", "date_in": "2026-01-01", "value_in": 202_816_000},
    {"type": "Байр", "name": "Буянт шарга · E-13d F · 54.69м²", "date_in": "2026-01-01", "value_in": 175_008_000},
    {"type": "Байр", "name": "Буянт шарга · E-14d E · 75.9м²", "date_in": "2026-01-01", "value_in": 242_880_000},
    {"type": "Байр", "name": "Буянт шарга · A-9d E · 63.38м²", "date_in": "2026-01-01", "value_in": 202_816_000},
    {"type": "Байр", "name": "Буянт шарга · A-9d D · 45.02м²", "date_in": "2026-01-01", "value_in": 144_064_000},
    {"type": "Байр", "name": "Буянт шарга · A-12d D · 45.02м²", "date_in": "2026-01-01", "value_in": 144_064_000},
    {"type": "Байр", "name": "Буянт шарга · A-13d D · 45.02м²", "date_in": "2026-01-01", "value_in": 144_064_000},
    {"type": "Байр", "name": "Бутан · E-7d A · 55.01м²", "date_in": "2026-01-01", "value_in": 176_032_000},
    {"type": "Байр", "name": "Бутан · A-5d D · 45.02м²", "date_in": "2026-01-01", "value_in": 144_064_000},
    {"type": "Байр", "name": "Бутан · A-7d D · 45.02м²", "date_in": "2026-01-01", "value_in": 144_064_000},
]


# ---- Идэвхтэй гэрээнүүд: клиент sheet-ээс задлах ----
# (sheet нэр, мастер дахь харилцагчийн нэр) — 7-р сард тооцоо идэвхтэй явж байсан 8 гэрээ
ACTIVE_SHEETS = [
    ("БЛҮҮМ-2", "Блүүм технологи"),
    ("ГрэйтМайнинг-5", "Грэйт Майнинг"),
    ("АшидДонж-11", "Ашид Донж Билгүүн"),
    ("Өрнүүн эрчит зам-17", "Өрнүүн Эрчит Зам ххк"),
    ("Сүхжин-18", "Сүхжин ХХК"),
    ("Хатанбүүвэй-19", "Хатанбүүвэй"),
    ("Цэрэнчимэд-21", "Цэрэнчимэд"),
    ("НьюМэнПовэр-22", "Нью Мэн Повер ХХК"),
]
HEV_CODES = {"6012", "5012", "4512", "4012", "3012", "2012", "1010", "1015",
             "1020", "1515", "1200", "2400", "2020"}


GRADE_SUFFIX = {"пл": "плас", "плас": "плас", "ш": "шинэ", "шинэ": "шинэ",
                "а": "А", "в": "В", "сольсон": "сольсон", "шорт": "шорт"}


def _code_of(v):
    """Нүд материалын код мөн үү: 6012 → Хэв, В2/в4 → Тулаас, 6м → Труба.
    «5012 пл», «В2 ш» маягийн дагавар → зэрэглэл. Буцна: (материал, зэрэглэл) | None."""
    if v is None or v == "":
        return None
    s = str(v).strip()
    if isinstance(v, float) and v == int(v):
        s = str(int(v))
    parts = s.split()
    base = parts[0].replace("B", "В").replace("b", "В").replace("в", "В")
    grade = GRADE_SUFFIX.get(parts[1].lower(), "А") if len(parts) > 1 else "А"
    if base in HEV_CODES:
        return (f"Хэв хашмал {base}", grade)
    if re.fullmatch(r"В[2-6]", base):
        return (f"Тулаас {base}", grade)
    if re.fullmatch(r"\d ?м", base):
        return (f"Труба {base.replace(' ', '')}", grade)
    return None


def _period_end(rows, qty_col):
    """Блокийн «Нийт» мөрнөөс үеийн төгсгөл (м, ө)-ийг олно — блок сонгоход хэрэглэнэ."""
    best = None
    for r in rows:
        for c in r[max(qty_col - 1, 0):qty_col + 4]:
            m = re.search(r"\d{1,2}\.\d{1,2}\s*[-–]\s*(\d{1,2})\.(\d{1,2})", str(c or ""))
            if m:
                best = max(best or (0, 0), (int(m.group(1)), int(m.group(2))))
    return best or (0, 0)


def parse_contract_sheet(rows):
    """Sheet-ийн ХАМГИЙН СҮҮЛИЙН блокоос одоо түрээсэнд байгаа мөрүүдийг авна.
    «ирсэн» огноотой мөр = буцаагдсан тул хасна. Дараалсан хоосон кодтой мөр
    өмнөх кодоо өвлөнө (Цэрэнчимэдийн задаргаа шиг)."""
    header_blocks = []
    for ri, r in enumerate(rows[:12]):
        cols = [str(c or "").strip() for c in r]
        for ci in range(len(cols) - 2):
            if cols[ci] == "тоо" and cols[ci + 1] == "үнэ" and cols[ci + 2] == "хоног":
                irsen = ci + 5 if ci + 5 < len(cols) and cols[ci + 5] == "ирсэн" else None
                header_blocks.append({"hr": ri, "qty": ci, "irsen": irsen})
    if not header_blocks:
        return None, "толгой мөр олдсонгүй"
    # хамгийн сүүлийн үетэй блок
    block = max(header_blocks, key=lambda b: _period_end(rows, b["qty"]))
    qc, irsen = block["qty"], block["irsen"]
    items = {}
    carry = None
    vat = 0
    for r in rows[block["hr"] + 1:]:
        cells = list(r) + [None] * 8
        # «Нийт» мөрөнд блок дуусна
        if any(str(c or "").strip() == "Нийт" for c in cells[max(qc - 3, 0):qc + 1]):
            break
        parsed = _code_of(cells[qc - 1])
        code = parsed or (None if cells[qc - 1] not in (None, "") else carry)
        qty, rate = num(cells[qc]), num(cells[qc + 1])
        if parsed:
            carry = parsed
        if not code or not qty or not rate or not (50 <= rate <= 2000) or not (0 < qty <= 50000):
            continue
        if irsen is not None and cells[irsen] not in (None, ""):
            continue  # буцаагдсан
        key = (code[0], code[1], rate)
        items[key] = items.get(key, 0) + qty
    # блокийн мужид НӨАТ мөр байвал 10%
    for r in rows:
        cells = [str(c or "").strip() for c in (list(r) + [""] * 8)]
        if "НӨАТ" in cells[max(qc - 3, 0):qc + 3]:
            vat = 10
            break
    out = [{"material": m, "grade": g, "qty": q, "daily_rate": rt}
           for (m, g, rt), q in items.items()]
    return out, vat, None


def parse_active_contracts(path):
    doc = Document(path)
    sheets = {s.name.strip(): s for s in doc.sheets}
    out, report = [], []
    for sheet_name, client_name in ACTIVE_SHEETS:
        if sheet_name not in sheets:
            report.append(f"⚠ {sheet_name}: sheet олдсонгүй")
            continue
        rows = list(sheets[sheet_name].tables[0].rows(values_only=True))
        no = ""
        for hr in rows[:3]:
            m = re.search(r"№\s*([\w/ ]{1,10}?)\s*(?:Гэрээ|$)",
                          " ".join(str(c or "") for c in hr[:4]))
            if m:
                no = m.group(1).replace(" ", "")
                break
        items, vat, err = parse_contract_sheet(rows)
        if err or not items:
            report.append(f"⚠ {sheet_name} ({client_name}): {err or 'мөр олдсонгүй'} — гараар үүсгэнэ үү")
            continue
        day_sum = sum(i["qty"] * i["daily_rate"] for i in items)
        out.append({"client": client_name, "no": no or sheet_name,
                    "items": items, "vat_percent": vat,
                    "note": f"Шилжүүлэлт: {sheet_name} sheet-ээс · өдрийн дүн {day_sum:,.0f}₮"})
        report.append(f"✓ {sheet_name} → {client_name}: №{no or '?'} · {len(items)} мөр · "
                      f"{sum(i['qty'] for i in items):,.0f}ш · {day_sum:,.0f}₮/өдөр · сард ~{day_sum*30:,.0f}₮"
                      + (" · НӨАТ 10%" if vat else ""))
    return out, report


def main():
    master = rows_of(SRC_MAIN, "Түрээс тооцоо-26")
    loans_rows = rows_of(SRC_MAIN, "Өглөгө.зээл-26")
    stock_rows = rows_of(SRC_RENT, "тооллого 6.22")

    clients = parse_clients(master) + parse_small_receivables(master)
    contracts, report = parse_active_contracts(SRC_RENT)
    data = {
        "as_of": str(date.today()),
        "source": "2026 тооцоо.numbers + Түрээсийн тооцоо 2026.numbers (2026.08 байдлаар)",
        "clients": clients,
        "stock": parse_stock(stock_rows),
        "loans": parse_loans(loans_rows),
        "barter": BARTER,
        "contracts": contracts,
    }
    print("--- Идэвхтэй гэрээнүүд ---")
    for line in report:
        print(" ", line)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    bal_sum = sum(c["balance"] for c in data["clients"])
    print(f"Харилцагч: {len(data['clients'])} · авлагын нийлбэр {bal_sum:,.0f}₮")
    print(f"Нөөцийн мөр: {len(data['stock'])} · нийт {sum(s['on_hand'] for s in data['stock']):,.0f}ш")
    print(f"Зээл: {len(data['loans'])} · нийт {sum(l['principal'] for l in data['loans']):,.0f}₮")
    print(f"Бартер: {len(data['barter'])} · орж ирсэн нийт {sum(b['value_in'] for b in data['barter']):,.0f}₮")


if __name__ == "__main__":
    main()

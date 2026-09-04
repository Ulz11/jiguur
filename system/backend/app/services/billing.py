"""Тооцооны хөдөлгүүр — системийн зүрх.

Дүрмүүд (бодит Numbers файлуудаас баталгаажсан):
- Түрээс хоногоор: тухайн өдөр d-д бараа "гадаа" бол тоолно.
  Өдрийн муж [гарсан өдөр, буцсан өдөр) — 3.20-нд гарч 3.21-нд буцвал 1 хоног.
- Цикл = гэрээний өдрөөс эхэлсэн cycle_days (30) хоногийн үе. [эхлэл, төгсгөл) хагас нээлттэй.
- Цөөнх гэрээ КАЛЕНДАРЬ САРААР явна (`cycle_mode="month"`, R5/H3): зангилаа нь
  эхлэх огнооны ӨДӨР, хоног нь тухайн сарын жинхэнэ урт. 31 хоногтой сар
  ×31/30 илүү нэхэгддэг нь ТУСГАЙ КОДГҮЙГЭЭР, зүгээр л 31 хоног хуримтлагдсанаас
  өөрөө гарна. Доод урсгал бүхэлдээ ЦОНХЫГ хэрэглэдэг тул горимыг мэдэхгүй.
- Буцаалт циклийн дундуур ирвэл өдрөөр нь пропорц бодогдоно (өөрөө гарна).
- Засвар, актын төлбөр тухайн циклийн нэхэмжлэлд нэмэгдэнэ.
- Алданги = үлдэгдэл × %/хоног × хэтэрсэн хоног. ⚠ ЭНЭ НЬ ТООЦООЛОЛ, НЭХЭМЖЛЭЛ
  БИШ: алданги нь Отгоогийн ХӨШҮҮРЭГ (Excel-дээ 20 жил зарлаад ганц ч удаа
  тооцоогүй — R25) тул системд ОРОХ ганц хаалга нь «Алданги нэхэх» товч.
  Нэхэгдсэн (`penalty_booked`) нь мөнгө; нэхэгдээгүй нь зөвхөн харагдац.
"""
import json
import threading
from calendar import monthrange
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from .. import models


# ---------- ХӨДӨЛГӨӨНИЙ ТӨРЛҮҮД — ганц эх сурвалж ----------
#
# Дөрөв нь ХОЁР анги: ISSUE нь ПАДАН ТӨРҮҮЛНЭ, бусад гурав нь падангаас
# ХАСНА. Тооцооны хөдөлгүүр бүхэлдээ энэ хуваалт дээр зогсдог (`_deltas`-ийн
# тэмдэг, `_lots`-ийн `eats`, `_timeline_ok`) — тиймээс шинэ гарц нэмэхэд
# хөдөлгүүрийн дотор талд салбар нэмэгддэггүй.
MOVEMENT_TYPES = ("ISSUE", "RETURN", "WRITEOFF", "SALE")
CONSUMING_TYPES = ("RETURN", "WRITEOFF", "SALE")

# Нэхэмжлэлийн төлбөрийн мөрийн ШОШГО — тайлан үүгээр орлогыг ангилна
# (`services/reports.charge_kind`). Үг солих нь ангиллыг солино.
SALE_CHARGE_DESC = "Худалдаа"


# ---------- тоо ширхэгийн хугацааны шугам ----------

def movement_active(mv: models.Movement) -> bool:
    """Хөдөлгөөн ТООЦООНД ОРОХ уу — баталгаажсан БА хүчингүй болоогүй.

    Тооцооны хөдөлгүүр рүү орох ГАНЦ хаалга. Хоёр өөр шалтгаанаар (хараахан
    баталгаажаагүй / цуцлагдсан) хөдөлгөөн тооцооноос гардаг ч үр дүн нь адил:
    нөөц ч, түрээс ч, нэхэмжлэл ч түүнийг ХАРААГҮЙ мэт ажиллана. Дэлгэц дээр
    ХАРАГДСААР үлдэх нь тусдаа асуудал (`serializers`) — тэнд аль нь ч
    алга болохгүй.
    """
    return mv.status == "done" and getattr(mv, "voided_at", None) is None


def _deltas(contract: models.Contract):
    """(material_id, grade_id) бүрээр огноот өөрчлөлтүүд: ISSUE +qty, бусад -qty.

    ГАНЦ ХУВААЛТ: ISSUE нь ГАДАА гаргадаг, RETURN/WRITEOFF/SALE гурав нь
    гадаанаас ХАСДАГ. Тиймээс шинэ гарц (SALE — «худалдаа болгов», H7) энэ
    тэмдгээр АЯНДАА зөв ажиллана: зарагдсан тоо тэр өдрөөсөө гадаа байхаа
    болино, тусгай салбар шаардахгүй.
    """
    out: dict[tuple[int, int], list[tuple[date, float]]] = {}
    for mv in contract.movements:
        if not movement_active(mv):
            continue
        for ln in mv.lines:
            key = (ln.material_id, ln.grade_id)
            sign = 1 if mv.type == "ISSUE" else -1
            out.setdefault(key, []).append((mv.date, sign * ln.qty))
    for lst in out.values():
        lst.sort(key=lambda x: x[0])
    return out


def qty_on(contract: models.Contract, material_id: int, grade_id: int, day: date) -> float:
    q = 0.0
    for d, dq in _deltas(contract).get((material_id, grade_id), []):
        if d <= day:
            q += dq
    return max(q, 0.0)


def rate_map(contract: models.Contract) -> dict[tuple[int, int], float]:
    return {(it.material_id, it.grade_id): it.daily_rate for it in contract.items}


# ---------- падан (lot) загвар ----------

def default_rates(contract: models.Contract) -> dict[tuple[int, int], float]:
    """Гэрээний мөрийн үндсэн тариф — мөрд тариф тамгалагдаагүй үед унах утга."""
    if contract.type == "sale":
        return {(it.material_id, it.grade_id): it.unit_price for it in contract.items}
    return {(it.material_id, it.grade_id): it.daily_rate for it in contract.items}


def rate_changes_of(contract: models.Contract) -> list:
    """Гэрээний ХҮЧИНТЭЙ тарифын өөрчлөлтүүд, хилийнхээ дарааллаар (R3 / H6).

    Хүчингүй болсон нь ОГТ БАЙХГҮЙ мэт — `movement_active`, `akt_active`-тай
    яг ижил журам. Эрэмбэ нь `(effective_from, id)`: нэг хил дээр хоёр удаа
    тохирсон бол СҮҮЛЧИЙНХ нь хүчинтэй (сүүлийн үг эзэнд үлдэнэ).
    """
    rows = [rc for rc in getattr(contract, "rate_changes", None) or []
            if rc.voided_at is None]
    rows.sort(key=lambda rc: (rc.effective_from, rc.id or 0))
    return rows


def resolve_rate(contract: models.Contract, material_id: int, grade_id: int,
                 base: float, day: date | None) -> float:
    """ЦОНХНЫ тариф — ЭНЭ БОЛ ТАРИФЫН ГАНЦ ШИЙДЭГЧ.

    `base` нь падангийн ТАМГАЛАГДСАН (төрөх үеийн) тариф; `day` нь тухайн
    цонхны эхлэл. `effective_from <= day` нөхцөлтэй, материал+зэрэглэл нь
    таарсан, `old_rate` заасан бол ПАДАНГИЙН ЖИНХЭНЭ тарифтай нь тохирсон
    хамгийн СҮҮЛЧИЙН өөрчлөлт хүчинтэй. Юу ч таараагүй бол `base` хэвээр.

    `day is None` бол огт шийдэхгүй — падангийн төрөлхийн тарифыг л буцаана
    (падангийн ҮНЭМЛЭХ хэрэгтэй газруудад: бүлэглэл, `old_rate`-ийн хүрээ).

    ⚠ `effective_from` нь заавал циклийн ХИЛ (API-ийн валидаци) тул цонх дотор
    хариулт нь ТОГТМОЛ: `[cs, ce)` дотор аль ч өдрөөр асуусан нэг л тариф
    гарна. Иймд зурвасууд тарифын улмаас ХЭЗЭЭ Ч хагалагдахгүй.
    """
    if day is None:
        return base
    out = base
    for rc in rate_changes_of(contract):
        if rc.effective_from > day:
            break
        if rc.material_id != material_id or rc.grade_id != grade_id:
            continue
        if rc.old_rate is not None and abs(rc.old_rate - base) >= 0.005:
            continue
        out = rc.new_rate
    return out


def line_rate(contract: models.Contract, ln: models.MovementLine,
              defaults: dict[tuple[int, int], float] | None = None,
              on: date | None = None) -> float:
    """Мөрийн тариф: өөрийн тариф, байхгүй бол гэрээний мөрийн үндсэн тариф.

    Хуучин (тамгалагдаагүй) мөрүүд болон тестийн туслахууд тарифгүй бичдэг тул
    энэ уналт ХЭРЭГТЭЙ — тэдгээр нь гэрээний тарифаараа хэвээр бодогдоно.

    `on` өгвөл үр дүн нь ЦОНХ-МЭДЭГЧ болно: тухайн өдрөөр хүчинтэй тарифын
    өөрчлөлт (R3 / H6) дээрээс нь тавигдана. Энэ бол ТАРИФЫН ГАНЦ ЗААМ —
    хавсралт, нэхэмжлэл, дэлгэц гурвуулаа эндүүр уншина.
    """
    if ln.rate is not None:
        base = ln.rate
    else:
        if defaults is None:
            defaults = default_rates(contract)
        base = defaults.get((ln.material_id, ln.grade_id), 0.0)
    return resolve_rate(contract, ln.material_id, ln.grade_id, base, on)


def lot_rate_in(contract: models.Contract, lot: dict, d_from: date) -> float:
    """Тухайн цонхонд ЭНЭ падан ямар тарифаар нэхэгдэх вэ (`line_rate`-ийн заам)."""
    return resolve_rate(contract, lot["material_id"], lot["grade_id"],
                        lot["rate"], d_from)


def _override_of(contract: models.Contract, ln: models.MovementLine, day: date,
                 choices: dict[int, int] | None = None):
    """Буцаалтын мөрийн ГАР ХОНОГ → `(хоног, циклийн эхлэл, тамга)` эсвэл `None`.

    Циклийн эхлэлийг ЭНД (нэг л удаа) шийднэ: гар хоног нь буцаалт БУУСАН
    циклийн дотор л үйлчилдэг тул тэр цонхны эхлэл нь хожим `_lot_segments`
    доторх «энэ цонхонд хамаарах уу» шалгуурын ГАНЦ түлхүүр болно.

    Гурав дахь гишүүн нь `days_confirmed` — «ЭНЭ ТООГ ТЭР ХАРААД БАТАЛСАН».
    Тамгатай бол хумилт хаана ч ажиллахгүй (H5-ийн сүүлчийн миль).

    `choices` — ХАДГАЛАГДААГҮЙ сонголтууд `{мөрийн id: хоног}`: хаалтын wizard
    «хэрэв би ийм тоо сонговол» гэж асуухад л хэрэглэгдэнэ. Сонголт нь өөрөө
    ШИЙДВЭР тул ҮРГЭЛЖ тамгатай — эс бөгөөс урьдчилсан тоо нь хаалтын дараах
    цаастай зөрнө (яг тэр зөрөх нь энэ бүх ажлын шалтгаан).
    """
    days = getattr(ln, "billed_days_override", None)
    confirmed = bool(getattr(ln, "days_confirmed", 0))
    if choices and ln.id in choices:
        days, confirmed = choices[ln.id], True
    if days is None:
        return None
    win = cycle_of(contract, day)
    return None if win is None else (int(days), win[0], confirmed)


def _billed_days(ov: tuple, lot_date: date, win: tuple[date, date]) -> int:
    """Гар хоногийн мөрөнд ЭЦСИЙН ХОНОГ — `_lot_segments` ба
    `return_attribution` ХОЁУЛАА эндээс уншина (зөрөх нь боломжгүй).

    Тамгатай бол ТҮҮНИЙ тоо ЯГ тэрээрээ. Тамгагүй бол `override_cap` нь тор
    хэвээр: бичих агшны валидаци яг тэр хязгаараар явдаг тул амьд зам дээр
    хумилт ажиллахгүй — загварыг ШУУД хөндсөн (тест, миграци) үед л.
    """
    return ov[0] if ov[2] else min(ov[0], override_cap(lot_date, win))


def _allocate(pool: list[dict], qty: float, pin: int | None) -> list[tuple[dict, float, bool]]:
    """Буцаалт/акт АЛЬ падангуудаас хасагдах вэ — ГАНЦ дүрэм, ганц газарт.

    Эхлээд `issue_line_id`-аар заасан падангаас (тухайн агшны үлдэгдлээр
    хязгаарлаж), үлдсэнийг нь FIFO-гоор (`pool` нь хуучнаас шинэ рүү
    эрэмбэлэгдсэн). Буцна: `[(падан, авсан тоо, заасан эсэх)]`.

    Үлдэгдлийг ЭНД хуулбар дээр бууруулна — дуудагч нь өөрөө (`_lots`) эсвэл
    огт хөндөхгүй (`consumed_lots`) байж болно. Хуваарилалт хоёр газар хоёр
    өөр байх боломжгүй болсноор ВАЛИДАЦИ ба ХӨДӨЛГҮҮР нэг тоо руу хардаг.
    """
    out: list[tuple[dict, float, bool]] = []
    left = {l["line_id"]: l["left"] for l in pool}
    remain = qty
    if pin:
        lot = next((l for l in pool if l["line_id"] == pin), None)
        if lot is not None:
            take = min(remain, left[lot["line_id"]])
            if take > 0:
                out.append((lot, take, True))
                left[lot["line_id"]] -= take
                remain -= take
    for lot in pool:
        if remain <= 0.0000001:
            break
        take = min(remain, left[lot["line_id"]])
        if take <= 0:
            continue
        out.append((lot, take, False))
        left[lot["line_id"]] -= take
        remain -= take
    return out


class _DraftLine:
    """Хараахан ҮҮСЭЭГҮЙ (эсвэл засагдах гэж буй) буцаалтын мөрийн ЗӨӨЛӨН хувилбар.

    Хадгалахаас ӨМНӨ «энэ мөр аль падангаас хасагдах вэ» гэдгийг ЯГ тооцооны
    хуваарилалтаар асуухад л хэрэгтэй — тиймээс `_lots`-д MovementLine-ийн
    оронд орох хамгийн бага гадаргуу.
    """
    __slots__ = ("id", "material_id", "grade_id", "qty", "issue_line_id",
                 "billed_days_override")

    def __init__(self, d: dict, new_id: int | None = None):
        # Шинэ мөрд СӨРӨГ id — жинхэнэ мөрийн id-тай хэзээ ч мөргөлдөхгүй тул
        # «энэ мөр аль падангаас хассан» гэдгийг `takes`-аас шүүж болно.
        self.id = d["line_id"] if d.get("line_id") is not None else new_id
        self.material_id = d["material_id"]
        self.grade_id = d["grade_id"]
        self.qty = d["qty"]
        self.issue_line_id = d.get("issue_line_id")
        self.billed_days_override = None


# Шинэ мөр ҮРГЭЛЖ хамгийн сүүлд ордог: жинхэнэ түлхүүр нь (огноо, mv.id, ln.id)
# бөгөөд шинэ id-ууд бүгдээс ИХ байна.
_DRAFT_KEY = 2 ** 62


def _lots(contract: models.Contract, drafts: list[dict] = (),
          choices: dict[int, int] | None = None) -> list[dict]:
    """Гэрээний бүх падан — баталгаажсан (done) ОЛГОЛТЫН мөр бүр нэг падан.

    Падан бүр өөрийн тариф, огноо, тоотой. ХАСАХ гурван төрөл (буцаалт, акт,
    ХУДАЛДАА — `CONSUMING_TYPES`) паданг ХААНА (`_allocate`): эхлээд заасан
    падангаас, үлдсэнийг нь FIFO-гоор. Гурвуулаа ЯГ ижил замаар хаадаг тул
    падангийн хувьд «худалдсан 40ш» ба «буцсан 40ш» ялгаагүй — ялгаа нь
    зөвхөн МӨНГӨНД ба НӨӨЦӨД байна.
    Хамаарал нь ХАДГАЛАГДАХГҮЙ, бодогдоно — тул хоёр паданг дамнасан буцаалт
    өөрөө хуваагдана. Хүлээгдэж буй (pending) олголт ХЭЗЭЭ Ч тооцоонд орохгүй.

    `drafts` — хараахан ХАДГАЛАГДААГҮЙ буцаалтын мөрүүд (`consumed_lots`).
    `line_id` нь байвал ТЭР мөрийг орлоно (засвар), эс бөгөөс шинэ мөр болж
    хамгийн сүүлд ордог. Тооцоонд ОРОЛЦОХГҮЙ — зөвхөн хуваарилалтыг асуух зам.

    Падан бүр хоёр бүртгэл авч явна:
      · `consumed` — (огноо, тоо, ГАР ХОНОГ). ЗӨВХӨН тооцоонд: `_lot_segments`
        үүгээр алхдаг тул хэлбэр нь ХЭВЭЭР үлдэнэ. Гурав дахь гишүүн нь
        `None` (машины тоо) эсвэл `(хоног, циклийн эхлэл)` — H5-ийн ГАР ХОНОГ.
      · `takes`    — (аль МӨР хассан, огноо, тоо, заасан эсэх). Тооцоонд
        оролцохгүй, зөвхөн ХАРУУЛАХ (`return_attribution`) зориулалттай.
    """
    defaults = default_rates(contract)
    subs = {d["line_id"]: _DraftLine(d) for d in drafts if d.get("line_id") is not None}
    lots: list[dict] = []
    eats: list[tuple] = []
    for mv in contract.movements:
        if not movement_active(mv):
            continue
        for ln in mv.lines:
            key = (mv.date, mv.id, ln.id or 0)
            if mv.type == "ISSUE":
                lots.append({"line_id": ln.id, "movement_id": mv.id,
                             "material_id": ln.material_id,
                             "grade_id": ln.grade_id, "date": mv.date, "qty": ln.qty,
                             "rate": line_rate(contract, ln, defaults),
                             "left": ln.qty, "consumed": [], "takes": [], "_key": key})
            else:
                eats.append((key, subs.get(ln.id, ln)))
    for i, d in enumerate(drafts):
        if d.get("line_id") is None:
            eats.append(((d["date"], _DRAFT_KEY, i), _DraftLine(d, -(i + 1))))
    lots.sort(key=lambda l: l["_key"])

    def _eat(lot: dict, day: date, take: float, ln, pinned: bool):
        ov = _override_of(contract, ln, day, choices)
        lot["left"] -= take
        lot["consumed"].append((day, take, ov))
        lot["takes"].append({"line_id": ln.id, "date": day, "qty": take,
                             "pinned": pinned, "ov": ov})

    for key, ln in sorted(eats, key=lambda e: e[0]):
        day = key[0]
        pool = [l for l in lots if l["material_id"] == ln.material_id
                and l["grade_id"] == ln.grade_id and l["date"] <= day]
        for lot, take, pinned in _allocate(pool, ln.qty, ln.issue_line_id):
            _eat(lot, day, take, ln, pinned)

    for lot in lots:
        lot.pop("_key")
        lot["consumed"].sort(key=lambda e: e[0])
    return lots


# ---------- ГАР ХОНОГИЙН ДЭЭД ХЯЗГААР (H5) ----------
#
# «Хоёр тал 12 хоног гэж гарын үсэг зурсан бол 12 нь хэлцлийн баримт» — гэвч
# нэг падангаас буцсан хэсэг нь ТЭР ПАДАН ЦИКЛДЭЭ ОРСОН өдрөөс өмнө гадаа
# байж чадахгүй. Тиймээс хязгаар нь циклийн урт БИШ, ПАДАНГИЙН ЦОНХ.
#
# Энэ илэрхийлэл нь ГАНЦ эх сурвалж: `_lot_segments` ба `return_attribution`
# хумихдаа, роутер валидаци хийхдээ ЯГ үүнийг дууддаг. Хоёр тал зөрөх нь
# боломжгүй — зөрөх нь яг тэр буг байсан (зөвшөөрөгдсөн тоо чимээгүй багасч,
# хавсралт дээр өөр тоо хэвлэгдэнэ).

def override_cap(lot_date: date, win: tuple[date, date]) -> int:
    """Тухайн цонхонд ЭНЭ падангийн хамгийн урт боломжит хоног."""
    return (win[1] - max(lot_date, win[0])).days


def draft_line(day: date, material_id: int, grade_id: int, qty: float,
               pin: int | None = None) -> dict:
    """Нэг хадгалагдаагүй буцаалтын мөрийн тодорхойлолт (`prior`-т хураахад)."""
    return {"line_id": None, "date": day, "material_id": material_id,
            "grade_id": grade_id, "qty": qty, "issue_line_id": pin}


def consumed_lots(contract: models.Contract, day: date, material_id: int,
                  grade_id: int, qty: float, *, pin: int | None = None,
                  line_id: int | None = None,
                  prior: list[dict] = ()) -> list[dict]:
    """Энэ буцаалт АЛЬ падангуудаас хасагдах вэ — тооцооны ЯГ тэр хуваарилалт.

    `line_id` заасан бол тэр мөрийг (хадгалагдсан утгаараа биш) ЭНЭ тоо/заалтаар
    ОРЛУУЛЖ бодно — засвар нь өөрийнхөө хасалттай зөрчилдөхгүй.
    `prior` — ижил хүсэлтийн ӨМНӨХ мөрүүд (`draft_line`): нэг буцаалтад нэг
    материал хоёр мөртэй ирвэл хоёр дахь нь эхнийхийнхээ дараа хасагдана.
    """
    drafts = [*prior, draft_line(day, material_id, grade_id, qty, pin)]
    if line_id is not None:
        drafts[-1]["line_id"] = line_id
    probe = line_id if line_id is not None else -len(drafts)
    return [lot for lot in _lots(contract, drafts)
            if any(t["line_id"] == probe for t in lot["takes"])]


def max_billed_days(contract: models.Contract, day: date, material_id: int,
                    grade_id: int, qty: float, *, pin: int | None = None,
                    line_id: int | None = None,
                    prior: list[dict] = ()) -> int | None:
    """Гар хоногийн ДЭЭД ХЯЗГААР — хөдөлгүүр яг үүгээр хумидаг тул валидаци ч.

    Буцаалт хэд хэдэн падан дамнавал хамгийн ЖИЖИГ цонх шийднэ: тэр падан
    дээр хумигдвал нийт дүн нь гарын үсэгтэй тооноос доош унана. Циклд
    хамаарахгүй огноо (`cycle_of` → None) бол хязгаар байхгүй.
    """
    win = cycle_of(contract, day)
    if win is None:
        return None
    caps = [override_cap(lot["date"], win)
            for lot in consumed_lots(contract, day, material_id, grade_id, qty,
                                     pin=pin, line_id=line_id, prior=prior)]
    # Падангүй (бүрэн буцаагдсан) бол цонхны урт — хуучин зан төлөв хэвээр
    return min(caps) if caps else (win[1] - win[0]).days


def return_attribution(contract: models.Contract) -> dict[int, list[dict]]:
    """Буцаалт/актын МӨР бүр АЛЬ падангаас хассаныг буцаана (зөвхөн УНШИНА).

    `{мөрийн id: [{issue_line_id, issue_movement_id, date, rate, qty, pinned,
    days, billed_days, override}]}`. Хамаарлыг ХАДГАЛАХГҮЙ — `_lots`-ийн ЯГ тэр
    хуваарилалтаас (заасан падан → FIFO) уншиж авна, тул дэлгэц дээр харагдах
    хамаарал нэхэмжлэлийн тоог гаргасан хамаарал ХОЁР ӨӨР байх боломжгүй.

    `days` = МАШИНЫ тоо (падан циклдээ орсноос буцаалт хүртэл), `billed_days` =
    үнэхээр нэхэгдэх тоо. Хоёулаа ирдэг тул дэлгэц зөрүүг НУУХГҮЙ: «13 хоног
    (гараар — системээр 12)».

    Падангийн дарааллаар (хуучнаас шинэ) — Отгоо «эхлээд хуучнаас хасагдав»
    гэдгийг дээрээс нь доош уншина.
    """
    out: dict[int, list[dict]] = {}
    for lot in _lots(contract):
        for t in lot["takes"]:
            win = cycle_of(contract, t["date"])
            start = max(lot["date"], win[0]) if win else lot["date"]
            days = max((t["date"] - start).days, 0)
            billed = days
            if t["ov"] is not None and win is not None:
                # `_lot_segments`-тэй НЭГ илэрхийлэл (`_billed_days`) — дэвтэр
                # дээр уншигдах тоо ба мөнгө нь ЗӨРӨХ боломжгүй.
                billed = _billed_days(t["ov"], lot["date"], win)
            # Тариф нь ТЭР БУЦААЛТ нэхэгдсэн цонхны хүчинтэй утга (R3 / H6) —
            # хавсралт дээр хэвлэгдэх тоотой яг нэг заамаас.
            eff = resolve_rate(contract, lot["material_id"], lot["grade_id"],
                               lot["rate"], win[0] if win else lot["date"])
            out.setdefault(t["line_id"], []).append(
                {"issue_line_id": lot["line_id"], "issue_movement_id": lot["movement_id"],
                 "date": str(lot["date"]), "rate": eff,
                 "qty": t["qty"], "pinned": t["pinned"],
                 "days": days, "billed_days": billed,
                 "override": t["ov"] is not None})
    return out


def _lot_segments(lot: dict, d_from: date, d_to: date) -> list[dict]:
    """[d_from, d_to) дотор тухайн паданг ТОГТМОЛ ТООТОЙ зурвасуудад задална.

    ЭНЭ БОЛ МӨНГӨНИЙ ГАНЦ АЛХАЛТ. `_lot_qty_days` нь үүнийг нийлүүлдэг тул
    хавсралтын мөрүүд ба нэхэмжлэлийн дүн ХОЁР ӨӨР кодоос гарах боломжгүй —
    тэнцэл нь шалгалт биш, БҮТЭЦ.

    Мөр бүр: {seg_from, seg_to, qty, days, override}. Ердийн зурваст
    `days == (seg_to - seg_from).days`; тоо нь 0 буюу сөрөг зурвасыг алгасна.

    ГАР ХОНОГ (H5). Буцаалтын мөр өөрийн хоног авч явбал ТЭР ХЭСЭГ нь алхалтаас
    САЛЖ, өөрийн мөр болж гарна — Отгоогийн дэвтрийн хэлбэр яг энэ: үндсэн мөр
    (гадаа үлдсэн тоо × бүтэн цикл) + буцаалтын ДЭД МӨР (буцсан тоо × ТҮҮНИЙ
    тоолсон хоног). Салсан хэсэг нь `start` дээр буцсан мэт үлдсэн алхалтаас
    хасагдана, тул давхар тоологдох боломжгүй.

    Гурван ХАТУУ нөхцөл (бүгд нэг мөрөнд):
      · зөвхөн буцаалт БУУСАН цикл — цонхны эхлэл нь тэр циклийн эхлэлтэй
        таарсан үед л (өмнөх/дараагийн цикл ердийнхөөрөө нэхэгдэнэ);
      · зөвхөн цонх дотор буусан буцаалт (`start < ed < d_to`);
      · хоног нь ПАДАНГИЙН цонхонд багтана (`override_cap`) — нэг мөр тэр
        падан циклдээ орсноос хойшхи хоногоос ИЛҮҮГ хэзээ ч нэхэхгүй.
    """
    start = max(lot["date"], d_from)
    if start >= d_to:
        return []
    q = lot["qty"]
    out: list[dict] = []
    walk: list[tuple[date, float]] = []
    for ed, eq, ov in lot["consumed"]:
        if ed <= start:
            q -= eq
            continue
        if ov is None or ov[1] != d_from or ed >= d_to:
            walk.append((ed, eq))
            continue
        q -= eq                                  # алхалтаас САЛНА
        # `return_attribution`-тай НЭГ илэрхийлэл (`_billed_days`).
        # ХААЛТ (H5-ийн сүүлчийн миль): эцсийн цикл ТАСАРЧ `d_to` нь хаасан
        # өдөр дээр богиносоход энэ хумилт нь ЗӨВШӨӨРӨГДСӨН тоог дараад
        # хавсралт дээр өөр тоо хэвлэдэг байв. Тамгатай мөр дээр хумилт
        # ОГТ ажиллахгүй — ТҮҮНИЙ тоо цонхноос үл хамааран зогсоно.
        days = _billed_days(ov, lot["date"], (d_from, d_to))
        if eq > 0 and days > 0:
            out.append({"seg_from": start, "seg_to": ed, "qty": eq,
                        "days": days, "override": True})

    cur = start
    for ed, eq in walk:
        seg_end = min(ed, d_to)
        if seg_end > cur:
            if q > 0:
                out.append({"seg_from": cur, "seg_to": seg_end, "qty": q,
                            "days": (seg_end - cur).days, "override": False})
            cur = seg_end
        q -= eq
        if cur >= d_to:
            break
    if cur < d_to and q > 0:
        out.append({"seg_from": cur, "seg_to": d_to, "qty": q,
                    "days": (d_to - cur).days, "override": False})
    return out


def _lot_qty_days(lot: dict, d_from: date, d_to: date) -> float:
    """[d_from, d_to) дотор тухайн паданд хэдэн ш×хоног ТООЦОГДОХ вэ.

    ЗУРВАСУУДЫН НИЙЛБЭР — тусдаа алхалт БИШ. Ингэснээр «Σ сегмент ==
    accrue_rent» тэнцэл нь хоёр функцийг зэрэгцүүлж арчлахаас чөлөөлөгдөнө.
    """
    return sum(s["qty"] * s["days"] for s in _lot_segments(lot, d_from, d_to))


def lot_qty_on(contract: models.Contract, day: date) -> list[dict]:
    """Өнөөдрийн байдлаар падан бүрийн үлдэгдэл (гэрээний дэлгэрэнгүйд)."""
    out = []
    for lot in _lots(contract):
        if lot["date"] > day:
            continue
        q = lot["qty"] - sum(eq for ed, eq, _ in lot["consumed"] if ed <= day)
        out.append({**lot, "qty_left": max(q, 0.0)})
    return out


def accrue_rent(contract: models.Contract, d_from: date, d_to: date,
                choices: dict[int, int] | None = None):
    """[d_from, d_to) хоорондох түрээсийн хуримтлал. Буцна: (нийт, мөрийн задаргаа).

    Падан бүрээр явна; задаргааны мөр (material, grade, ТАРИФ)-аар бүлэглэгдэнэ —
    иймд нэг материал өөр өөр тарифтай хоёр мөр болж гарч ирж болно.

    `choices` — хадгалагдаагүй гар хоногийн сонголт (`_override_of`): хаалтын
    wizard «хэрэв» асуухад л дамжина, DB-д юу ч хүрэхгүй.
    """
    lines: dict[tuple[int, int, float], dict] = {}
    total = 0.0
    for lot in _lots(contract, choices=choices):
        # Цонхны тариф (R3 / H6): падангийн тамгалагдсан утга дээр тухайн
        # цонхонд хүчин төгөлдөр өөрчлөлт тавигдана. `d_from` нь цонхны эхлэл —
        # `effective_from` нь заавал хил тул цонх дотор хариулт тогтмол.
        rate = lot_rate_in(contract, lot, d_from)
        if rate <= 0:
            continue
        qty_days = _lot_qty_days(lot, d_from, d_to)
        if qty_days <= 0:
            continue
        key = (lot["material_id"], lot["grade_id"], rate)
        row = lines.get(key)
        if row is None:
            row = lines[key] = {"material_id": key[0], "grade_id": key[1],
                                "qty_days": 0.0, "rate": rate, "amount": 0.0}
        row["qty_days"] += qty_days
        row["amount"] += qty_days * rate
        total += qty_days * rate
    return total, list(lines.values())


def accrue_rent_segments(contract: models.Contract, d_from: date, d_to: date) -> list[dict]:
    """[d_from, d_to) хоорондох түрээсийн ЗУРВАС бүрийн задаргаа (зөвхөн УНШИНА).

    `accrue_rent`-тэй ЯГ ИЖИЛ падангуудаар явна (тариф <= 0 паданг мөн алгасна —
    нийлбэрийн тэнцэл үүнээс хамаарна), гэхдээ падан бүрийг тогтмол тоотой
    зурвасуудад задалж мөр бүрд нь нэг мөр гаргана. Иймд циклийн дундуур ирсэн
    буцаалт хавсралтад НҮДЭЭР ХАРАГДАНА: 240ш×12 хоног, дараа нь 210ш×18 хоног.

    Мөр бүр: {material_id, grade_id, rate, qty, days, amount, seg_from, seg_to,
    override}; `amount = qty × days × rate`, огноонууд нь `date` объект (мөр биш).
    `override=True` бол хоног нь ГАРААР тохирсон (H5) — тэр мөр цаасан дээр
    тэмдэгтэй хэвлэгдэнэ, `days` нь огнооны зөрүүтэй санаатайгаар зөрж болно.
    Эрэмбэ: (material_id, grade_id, rate, seg_from) — нэг материалын зурвасууд
    зэрэгцэж, цаг хугацааны дарааллаар харагдана.

    ТЭНЦЭЛ: sum(мөрийн amount) == accrue_rent(contract, d_from, d_to)[0]

    `accrue_rent`-д ЗОРИУДААР хүрээгүй: тэр нь НЭХЭМЖЛЭХИЙН тулд зурвасуудыг
    (material, grade, тариф)-аар НИЙЛҮҮЛДЭГ, энэ нь ХАВСРАЛТЫН тулд буцааж
    ЗАДАЛДАГ. Хоёр өөр хэрэгцээ — нэг тоон үр дүн.
    """
    out: list[dict] = []
    for lot in _lots(contract):
        rate = lot_rate_in(contract, lot, d_from)      # `accrue_rent`-тэй НЭГ заам
        if rate <= 0:
            continue
        for s in _lot_segments(lot, d_from, d_to):
            out.append({"material_id": lot["material_id"], "grade_id": lot["grade_id"],
                        "rate": rate, "qty": s["qty"], "days": s["days"],
                        "amount": s["qty"] * s["days"] * rate,
                        "seg_from": s["seg_from"], "seg_to": s["seg_to"],
                        "override": s["override"]})
    out.sort(key=lambda s: (s["material_id"], s["grade_id"], s["rate"], s["seg_from"]))
    return out


def movement_charges_in(contract: models.Contract, d_from: date, d_to: date):
    """[d_from, d_to) доторх ХӨДӨЛГӨӨНӨӨС гарсан засвар + акт + ХУДАЛДААНЫ хөлс.

    Тоо ширхэгээс каталогийн үнээр бодогддог, гараар бичигддэггүй хэсэг.

    ШОШГО НЬ УТГА ЗӨӨНӨ. «Засвар», «Акт», «Худалдаа» гэсэн гурван үг нь
    зөвхөн цаасны толгой биш — тайлан (`reports.charge_kind`) ЭДГЭЭР ҮГЭЭР
    орлогыг ангилдаг. «Худалдаа» нь ТҮРЭЭСИЙН орлого БИШ: тэр мөр нэхэмжлэл
    дотор яваа ч P&L дээр ХУДАЛДААНЫ орлого болж таслагдана (H7).
    """
    total = 0.0
    items = []
    for mv in contract.movements:
        if not movement_active(mv) or not (d_from <= mv.date < d_to):
            continue
        for ln in mv.lines:
            if ln.repair_fee:
                total += ln.repair_fee
                items.append({"date": str(mv.date), "desc": "Засвар", "amount": ln.repair_fee})
            if ln.writeoff_fee:
                total += ln.writeoff_fee
                items.append({"date": str(mv.date), "desc": "Акт", "amount": ln.writeoff_fee})
            if getattr(ln, "sale_fee", 0):
                total += ln.sale_fee
                items.append({"date": str(mv.date), "desc": SALE_CHARGE_DESC,
                              "amount": ln.sale_fee})
    return total, items


def akt_active(a: models.AktEntry) -> bool:
    """Актын бичилт ТООЦООНД ОРОХ уу — хүчингүй болоогүй эсэх.

    Хөдөлгөөний `movement_active`-тэй ижил үүрэг: тооцооны хөдөлгүүр рүү орох
    ГАНЦ хаалга. Цуцлагдсан бичилт дэлгэц дээр ХАРАГДСААР үлдэнэ, гэхдээ
    нэхэмжлэл, хавсралт, акт-PDF-ийн аль нь ч түүнийг хэзээ ч хэвлэхгүй.
    """
    return a.voided_at is None


def akt_entries_of(contract: models.Contract) -> list[models.AktEntry]:
    """Гэрээний ХҮЧИНТЭЙ актын бичилтүүд, огноогоор эрэмбэлэгдсэн.

    `getattr` уналттай: талбаргүй туслах объект («fake» гэрээ) ч хуучин
    зан төлөвөө хадгална.
    """
    rows = [a for a in (getattr(contract, "akt_entries", None) or []) if akt_active(a)]
    return sorted(rows, key=lambda a: (a.date, a.id or 0))


def akt_charges_in(contract: models.Contract, d_from: date, d_to: date):
    """[d_from, d_to) доторх ЧӨЛӨӨТ актын бичилтүүд (R12 / H4).

    Мөр бүр өөрийн ТЭМДЭГЛЭЛЭЭ шошго болгож авч явна («Акт: Кран дуудлага») —
    хөдөлгөөнөөс гарсан «Засвар»/«Акт» мөрөөс тодоор ялгарна. Хөнгөлөлт нь
    сөрөг дүнтэйгээ л явна: тусдаа төрөл биш, тэмдэг нь өөрөө хэлнэ.
    """
    total = 0.0
    items = []
    for a in akt_entries_of(contract):
        if not (d_from <= a.date < d_to):
            continue
        total += a.amount
        items.append({"date": str(a.date), "desc": f"Акт: {a.note}", "amount": a.amount})
    return total, items


def charges_in(contract: models.Contract, d_from: date, d_to: date):
    """[d_from, d_to) доторх БҮХ төлбөр: засвар/акт (хөдөлгөөнөөс) + чөлөөт акт.

    Нэхэмжлэлийн `charge_amount`, хавсралтын төлбөрийн мөрүүд, НӨАТ-ын суурь
    гурвуулаа ЭНД нийлнэ — тиймээс актын бичилт нэмэхэд гурвуулаа өөрөө дагана.
    """
    mv_total, mv_items = movement_charges_in(contract, d_from, d_to)
    akt_total, akt_items = akt_charges_in(contract, d_from, d_to)
    return mv_total + akt_total, mv_items + akt_items


# ---------- цикл ба нэхэмжлэл ----------

CYCLE_MODES = ("days", "month")


def cycle_mode(contract: models.Contract) -> str:
    """Гэрээний мөчлөгийн хэлбэр — «days» (анхны) эсвэл «month».

    `getattr` уналттай: багана нэмэгдэхээс өмнөх мөр, эсвэл талбаргүй
    туслах объект («fake» гэрээ) ч 30 хоногийн хуучин зан төлөвөө хадгална.
    """
    return getattr(contract, "cycle_mode", None) or "days"


def add_months(anchor: date, n: int) -> date:
    """`anchor`-оос n сарын дараах ЗАНГИЛААНЫ өдөр — сарын уртад хумигдана.

    ХАЗГАЙЛАЛТЫН (clamp) ДҮРЭМ: зорилтот сард зангилааны өдөр байхгүй бол ТЭР
    САРЫН СҮҮЛЧИЙН өдөр болно (1.31 + 1 сар = 2.28, өндөр жилд 2.29). Хумилт нь
    ХЭЗЭЭ Ч ХАДГАЛАГДАХГҮЙ — дараагийн хил `anchor`-оос дахин бодогдох тул
    зангилаа боломжтой газраа ЭРГЭЖ ОЧНО (1.31 → 2.28 → 3.31 → 4.30 → 5.31).

    Иймд цонхнууд нь зайгүй, давхцалгүй, гэрээний эхлэлээс мөнхөд тодорхой.
    """
    m = anchor.month - 1 + n
    y = anchor.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(anchor.day, monthrange(y, m)[1]))


def cycle_window(contract: models.Contract, n: int) -> tuple[date, date]:
    """n-р циклийн ХАГАС НЭЭЛТТЭЙ цонх [эхлэл, төгсгөл) — n нь 0-оос тоологдоно.

    Тооцооны БҮХ доод урсгал (хуримтлал, зурвас, нэхэмжлэлийн spec, хавсралт,
    төсөөлөл) ЗӨВХӨН цонхыг хэрэглэнэ — хоногийн арифметик хийхгүй. Горим
    солигдоход тэдгээрийн аль нь ч мэдэхгүй өнгөрнө.
    """
    if cycle_mode(contract) == "month":
        return add_months(contract.start_date, n), add_months(contract.start_date, n + 1)
    step = timedelta(days=contract.cycle_days)
    cs = contract.start_date + n * step
    return cs, cs + step


def cycle_of(contract: models.Contract, d: date) -> tuple[date, date] | None:
    """`d` огноо АЛЬ циклийн цонхонд унах вэ. Гэрээний эхлэлээс өмнө бол None.

    Хоногийн горимд шууд хуваалт; календарь горимд сарын алхмаас эхлээд
    хумигдсан хилээс болж нэг алхам хазайж болох тул зэргэлдээ рүү нь
    ГУЛСАНА (`cycle_window` нь зайгүй, давхцалгүй тул хамгийн ихдээ нэг алхам).

    ЗӨВХӨН ЦОНХЫГ хэрэглэнэ — горимоо мэдэхгүй.
    """
    if d < contract.start_date:
        return None
    if cycle_mode(contract) == "month":
        n = ((d.year - contract.start_date.year) * 12
             + d.month - contract.start_date.month)
        for _ in range(4):                     # хумилтын хазайлт ≤ 1 алхам
            cs, ce = cycle_window(contract, max(n, 0))
            if d < cs:
                n -= 1
                continue
            if d >= ce:
                n += 1
                continue
            return cs, ce
        return None
    return cycle_window(contract, (d - contract.start_date).days // contract.cycle_days)


def is_cycle_boundary(contract: models.Contract, d: date) -> bool:
    """`d` нь энэ гэрээний циклийн ЭХЛЭЛ мөн үү (R3 / H6-ийн валидаци).

    Тарифын өөрчлөлтийн `effective_from` энэ шалгуурыг давна — иймд нэг цонх
    дотор тариф хоёр болох боломжгүй болж, зурвасууд хагалагдахгүй. Горимоо
    мэдэхгүй: `cycle_of` цонхыг өөрөө олно.
    """
    if d < contract.start_date:
        return False
    w = cycle_of(contract, d)
    return w is not None and w[0] == d


def this_cycle_start(contract: models.Contract, today: date | None = None) -> date:
    """Өнөөдөр аль циклд байна вэ — түүний эхлэл («Энэ циклээс»)."""
    today = today or date.today()
    if today < contract.start_date:
        return contract.start_date
    w = cycle_of(contract, today)
    return w[0] if w else contract.start_date


def next_cycle_start(contract: models.Contract, today: date | None = None) -> date:
    """ДАРААГИЙН циклийн эхлэл — тарифын өөрчлөлтийн АНХНЫ утга.

    Отгоогийн семантик: «шинэ тариф дараагийн циклээс». Энэ огноогоор ирсэн
    өөрчлөлт НЭХЭМЖЛЭГДСЭН юуг ч хөндөхгүй тул дахин бодолт ч шаардахгүй.
    """
    today = today or date.today()
    if today < contract.start_date:
        return contract.start_date
    w = cycle_of(contract, today)
    return w[1] if w else contract.start_date


# Хөнгөлөлт нь ЦИКЛИЙГ сөрөг болгож болохгүй: сөрөг нэхэмжлэл нь харилцагчид
# «бид танд өртэй» гэсэн баримт болно — Отгоо ийм цаас хэвлэж үзээгүй.
AKT_NEGATIVE_ERR = "Циклийн нийт дүн сөрөг болно — хөнгөлөлт хэт их байна"


def akt_negative_windows(contract: models.Contract, *, drop_id: int | None = None,
                         add: tuple[date, float] | None = None) -> list[tuple[date, date]]:
    """Санал болгож буй актын өөрчлөлтийн дараа НИЙТ дүн нь сөрөг болох циклүүд.

    `drop_id` — устгагдаж/хөдөлж буй бичилт (засвар, хүчингүй болголт),
    `add` — шинээр орох (огноо, дүн). Хоёул өгөгдвөл ЗАСВАР болно.

    ХОЁР цонх шалгагдана: бичилт ГАРЧ буй цонх (эерэг мөр гарахад тэнд үлдсэн
    хөнгөлөлт нүцгэн үлдэж болно) ба бичилт ОРЖ буй цонх. Цонх бүрийн дүн нь
    түрээс + хөдөлгөөний засвар/акт + тэр цонхны актын бичилтүүд.
    """
    wins: set[tuple[date, date]] = set()
    for a in akt_entries_of(contract):
        if a.id is not None and a.id == drop_id:
            w = cycle_of(contract, a.date)
            if w:
                wins.add(w)
    if add is not None:
        w = cycle_of(contract, add[0])
        if w:
            wins.add(w)

    rows = [(a.date, a.amount) for a in akt_entries_of(contract)
            if a.id is None or a.id != drop_id]
    if add is not None:
        rows.append(add)

    bad = []
    for cs, ce in sorted(wins):
        rent, _ = accrue_rent(contract, cs, ce)
        mv_charge, _ = movement_charges_in(contract, cs, ce)
        akt = sum(amt for d, amt in rows if cs <= d < ce)
        if rent + mv_charge + akt < -0.005:
            bad.append((cs, ce))
    return bad


def cycles_of(contract: models.Contract, today: date):
    """Гэрээний бүх дууссан ба одоогийн цикл. [(start, end, complete), ...]"""
    out = []
    n = 0
    while True:
        cs, ce = cycle_window(contract, n)
        if cs > today:
            break
        out.append((cs, ce, ce <= today))
        if ce > today:
            break
        n += 1
    return out


def cycle_index(contract: models.Contract, cycle_start: date) -> int:
    """Циклийн дугаар — гэрээний эхлэлээс тоологдоно (1-ээс эхэлнэ).

    Байрлалаас (хэдэн нэхэмжлэл үүссэнээс) БИШ огнооноос гарна: иймд
    нэхэмжлэлүүдийг устгаад дахин үүсгэхэд дугаар нь ЯГ ХЭВЭЭР үлдэнэ.

    Календарь горимд энэ нь САРЫН АЛХМЫН тоо — хоногийн зөрүү нь сар бүр өөр
    (28…31) тул хуваахад тогтворгүй болно. Хумигдсан хил (1.31 → 2.28) ч
    сарынхаа дугаарыг л авч явна.
    """
    if cycle_mode(contract) == "month":
        return ((cycle_start.year - contract.start_date.year) * 12
                + cycle_start.month - contract.start_date.month) + 1
    return (cycle_start - contract.start_date).days // contract.cycle_days + 1


def last_movement_day(contract: models.Contract) -> date | None:
    """Тооцоонд орох СҮҮЛЧИЙН хөдөлгөөний огноо — хаалтын ДООД хил (H7).

    Хаах огноо түүнээс ӨМНӨ байвал бүртгэгдсэн буцаалт хаалтын дараа болсон
    болж хувирна: гарын үсэгтэй цаас өөрөө өөртэйгээ зөрчилдөнө.
    """
    days = [mv.date for mv in contract.movements if movement_active(mv)]
    return max(days) if days else None


def close_day(contract: models.Contract) -> date | None:
    """Хаагдсан гэрээний ХААСАН ӨДӨР — эцсийн тасархай цонхны төгсгөл (H7).

    NULL (хуучин, огноогүй хаалт) бол зан төлөв ЯГ ХЭВЭЭР: stub төрөхгүй,
    цонхнууд өнөөдрийг хүртэл ердийнхөөрөө гарна.
    """
    if contract.status != "closed":
        return None
    return getattr(contract, "closed_date", None)


def close_day_conflicts(contract: models.Contract, close_date: date,
                        today: date | None = None) -> list[dict]:
    """ХААЛТ нь ТОХИРСОН ХОНОГТОЙ зөрчилдөж буй мөрүүд — wizard-ийн асуулт.

    Гэрээ хаахад эцсийн цикл ТАСАРНА (`[циклийн эхлэл, хаасан өдөр + 1)`).
    Тэр богино цонх нь падангийн цонхыг богиносгодог тул бүртгэх агшинд
    зөвшөөрөгдсөн хоног энд багтахаа болино. Урьд нь хөдөлгүүр түүнийг
    ЧИМЭЭГҮЙ хумиж, гарын үсэгтэй 20 нь хавсралт дээр 16 болж хэвлэгддэг байв.

    Одооноос энэ нь ШИЙДВЭР болно: мөр бүрд хоёр тоо, хоёулангийнх нь ₮.
    Тамгатай (`days_confirmed`) мөр ХЭЗЭЭ Ч энд гарахгүй — тэр аль хэдийн
    шийдэгдсэн, дахин асуух нь шийдвэрийг эргэлзээ болгоно.

    Мөр бүр: {line_id, movement_id, date, material_id, grade_id, qty,
    agreed_days, window_days, day_amount, agreed_amount, window_amount,
    diff_amount}. Нэрийг (материал, зэрэглэл) роутер нэмнэ.

    ЗӨВХӨН ЭЦСИЙН ТАСАРХАЙ ЦОНХ: бүтэн циклүүд нь бичих агшинд аль хэдийн
    шалгагдсан тул тэнд зөрчил байх боломжгүй, мөн нэхэмжлэгдсэн түүхийг
    хаалтын мөчид эргүүлэн асуух нь ТУСДАА (дахин бодолтын) хаалга.
    """
    today = today or date.today()
    if contract.type != "rent":
        return []
    # ЯГ `derivable_invoice_specs`-ийн тасралт: дуусаагүй циклийн төгсгөл нь
    # хаасан өдрийн МАРГААШ болно. Хаалт нь циклийн хил дээр таарвал тасархай
    # цонх огт төрөхгүй — зөрчил ч байхгүй.
    open_cycle = next((cs for cs, ce, complete
                       in cycles_of(contract, min(today, close_date))
                       if not complete), None)
    if open_cycle is None:
        return []
    win = (open_cycle, close_date + timedelta(days=1))
    if win[1] <= win[0]:
        return []
    d_from, d_to = win
    rows: dict[int, dict] = {}
    for lot in _lots(contract):
        rate = lot_rate_in(contract, lot, d_from)
        if rate <= 0:
            continue
        # `_lot_segments`-ийн ЯГ ТЭР шалгуурууд (зөрвөл асуулт нь мөнгөнөөсөө
        # сална: нэхэгддэггүй мөрөнд шийдвэр асуух, эсвэл эсрэгээр).
        start = max(lot["date"], d_from)
        for t in lot["takes"]:
            ov = t["ov"]
            # Тамгатай, гар хоноггүй, эсвэл ӨӨР цонхны мөр — асуулт биш
            if ov is None or ov[2] or ov[1] != d_from or not (start < t["date"] < d_to):
                continue
            cap = max(override_cap(lot["date"], win), 0)
            r = rows.get(t["line_id"])
            if r is None:
                r = rows[t["line_id"]] = {
                    "line_id": t["line_id"], "movement_id": lot["movement_id"],
                    "date": str(t["date"]), "material_id": lot["material_id"],
                    "grade_id": lot["grade_id"], "qty": 0.0,
                    "agreed_days": ov[0], "window_days": cap, "day_amount": 0.0}
            # Нэг буцаалт хоёр падан дамнавал цонх нь ХАМГИЙН ЖИЖИГЭЭР шийднэ —
            # `max_billed_days`-тэй ижил дүрэм.
            r["window_days"] = min(r["window_days"], cap)
            r["qty"] += t["qty"]
            r["day_amount"] += t["qty"] * rate      # ЭНЭ МӨРИЙН нэг хоногийн ₮
    out = []
    for r in rows.values():
        if r["agreed_days"] <= r["window_days"]:
            continue                            # багтаж байна — асуулт үүсгэхгүй
        # Тамга дарагдсан хоног нь ЯГ тэрээрээ нэхэгддэг тул дүн нь энгийн
        # үржвэр — Отгоо эгч цаасан дээр дахин гаргаж чадах арифметик.
        r["agreed_amount"] = r["agreed_days"] * r["day_amount"]
        r["window_amount"] = r["window_days"] * r["day_amount"]
        r["diff_amount"] = r["agreed_amount"] - r["window_amount"]
        out.append(r)
    return sorted(out, key=lambda r: (r["date"], r["line_id"]))


def derivable_invoice_specs(contract: models.Contract, today: date | None = None,
                            *, close_date: date | None = None,
                            day_choices: dict[int, int] | None = None) -> list[dict]:
    """Гэрээний өгөгдлөөс ГАРГАЖ БОЛОХ бүх нэхэмжлэлийн ЦЭВЭР жагсаалт.

    DB-д юу ч бичихгүй — зөвхөн тооцоолно. `ensure_invoices` (нэмэх) ба
    `services/rebuild.py` (дахин үүсгэх) хоёул ЭНЭ ЖАГСААЛТААС ажиллана, тул
    "нэмэгдсэн" ба "дахин бодогдсон" нэхэмжлэл ялгаагүй байхыг баталгаажуулна.

    Мөр бүр: no, cycle_start, cycle_end, due_date, rent_amount, charge_amount,
    vat_amount, total, detail_json — models.Invoice-ийн талбарууд.

    ХААЛТ (H7). Хаагдсан гэрээнд эцсийн ТАСАРХАЙ цикл ч нэхэмжлэл болно:
    цонх нь [циклийн эхлэл, closed_date + 1) — Отгоо эгчийн ёслолын эхний
    алхам («эцсийн хагас сарыг нэхээд хаана»). Хаалтын огнооноос ХОЙШ юу ч
    нэхэгдэхгүй: тоолуур ҮНЭХЭЭР зогсоно. Дугаар нь ЦОНХНЫ эхлэлээс гарах тул
    (`cycle_index`) дугаарлалт ХЭВЭЭР — stub нь ээлжийн дугаараа авна.

    `close_date=` нь ХААГААГҮЙ гэрээн дээр «хаавал юу болох вэ» гэдгийг
    урьдчилан харуулна (хаалтын wizard) — гэрээнд юу ч хүрэхгүй.

    `day_choices=` нь тэр урьдчилсан тооцоонд ГАР ХОНОГИЙН СОНГОЛТыг оруулна
    (`{мөрийн id: хоног}`): хаалтын мөчид цонх тасарч түүний тохирсон хоног
    багтахаа болиход тэр СОНГОЛТ хийдэг бөгөөс wizard-ийн амлалт ба хаасны
    дараах цаас ХОЁУЛАА энэ ганц функцээр гардаг тул зөрөх боломжгүй.
    """
    today = today or date.today()
    cd = close_date if close_date is not None else close_day(contract)
    specs: list[dict] = []
    if contract.type == "sale":
        # мөр бүр өөрийн нэгж үнэтэй; байхгүй бол гэрээний мөрийнхөөр
        prices = default_rates(contract)
        for mv in contract.movements:
            if mv.type != "ISSUE" or not movement_active(mv):
                continue
            # Худалдаанд цикл байхгүй — нэгж үнийн өөрчлөлт нь ОЛГОЛТЫН
            # ӨДРӨӨР шийдэгдэнэ (тарифын нэг л заам, `resolve_rate`).
            rate_of = {ln.id: line_rate(contract, ln, prices, on=mv.date) for ln in mv.lines}
            amount = sum(ln.qty * rate_of[ln.id] for ln in mv.lines)
            detail = [{"material_id": ln.material_id, "grade_id": ln.grade_id, "qty": ln.qty,
                       "rate": rate_of[ln.id],
                       "amount": ln.qty * rate_of[ln.id]} for ln in mv.lines]
            vat = amount * contract.vat_percent / 100
            specs.append({"no": f"S-{contract.no}-{mv.id}", "cycle_start": mv.date,
                          "cycle_end": mv.date, "due_date": mv.date,
                          "rent_amount": amount, "charge_amount": 0.0, "vat_amount": vat,
                          "total": amount + vat, "detail_json": json.dumps(detail)})
        return specs

    # Хаагдсан бол давхрага нь ХААСАН ӨДРӨӨР зогсоно — хойшхи цонх огт гарахгүй
    horizon = today if cd is None else min(today, cd)
    for cs, ce, complete in cycles_of(contract, horizon):
        if not complete:
            if cd is None:
                continue                       # хаагдаагүй — дуусаагүй цикл нэхэгдэхгүй
            ce = cd + timedelta(days=1)        # ЭЦСИЙН ТАСАРХАЙ ЦОНХ
            if ce <= cs:
                continue
        rent, lines = accrue_rent(contract, cs, ce, day_choices)
        charge, charge_items = charges_in(contract, cs, ce)
        if rent == 0 and charge == 0:
            continue
        vat = (rent + charge) * contract.vat_percent / 100
        specs.append({"no": f"R-{contract.no}-{cycle_index(contract, cs)}",
                      "cycle_start": cs, "cycle_end": ce, "due_date": ce,
                      "rent_amount": rent, "charge_amount": charge, "vat_amount": vat,
                      "total": rent + charge + vat,
                      "detail_json": json.dumps({"lines": lines, "charges": charge_items})})
    return specs


def spec_key(contract: models.Contract, cycle_start: date, cycle_end: date, no: str):
    """Нэхэмжлэлийн ӨВӨРМӨЦ түлхүүр: түрээс → цикл, худалдаа → дугаар."""
    return no if contract.type == "sale" else (cycle_start, cycle_end)


# ---------- ЗЭРЭГЦЭЭ ХҮСЭЛТИЙН ХААЛГА ----------
# Гэрээ бүрд НЭГ түгжээ. `ensure_invoices` нь бараг БҮХ GET замаас дуудагддаг
# (`/api/clients` идэвхтэй гэрээ бүрд, гэрээний дэлгэрэнгүй, дашбоард, авлага
# цуглуулах, хаалтын урьдчилсан тооцоо, өдөр тутмын cron…). FastAPI-ийн sync
# endpoint-ууд threadpool дээр ЗЭРЭГ гүйдэг тул хоёр хүсэлт нэг гэрээ дээр
# амархан давхацна: хоёул «нэхэмжлэл алга» гэж уншаад, хоёул үүсгэнэ.
# Үр дагавар нь ЗҮГЭЭР давхардсан мөр биш — тэр циклийн АВЛАГА ХОЁР ДАХИН
# нэмэгдэнэ (нэхэмжлэл бол авлагын суурь, H9b «нэг тоо»).
#
# ⚠ ЭНЭ ТҮГЖЭЭГ `ensure_invoices` ГАНЦААРАА барьж байсан нь ХАНГАЛТГҮЙ байв.
# `rebuild_contract_invoices` нь ЯГ ТЭР нэхэмжлэлүүдийг УСТГААД ДАХИН
# үүсгэдэг: устгаад `commit()` хийсэн ба шинээр `add()` хийж `commit()`
# хийхийн ХООРООНД гэрээ нь нэхэмжлэлГҮЙ байдалтай ХАРАГДАНА. Тэр цонхонд
# зэрэгцээ GET (`/api/contracts/:id`, `/api/clients`, дашбоард …) `ensure`-ээ
# дуудвал түгжээг СУЛ олж аваад «цикл алга» гэж уншаад ДАХИН үүсгэнэ —
# дараа нь rebuild өөрөө бас үүсгэж, ЯГ ИЖИЛ дугаартай ХОЁР мөр үлдэнэ
# (E2E дээр 396,000₮ = 2 × 198,000₮ болж баригдав). Тиймээс rebuild ч мөн
# ЭНЭ түгжээг барина (`services/rebuild.py`).
#
# `RLock` — нэг урсгал доторх давхар барилт (rebuild → ensure) гацахгүй.
_INVOICE_LOCKS: dict[int, threading.RLock] = {}
_INVOICE_LOCKS_GUARD = threading.Lock()


def contract_invoice_lock(contract_id: int) -> threading.RLock:
    """Гэрээний нэхэмжлэлийн түгжээ — `ensure` ба `rebuild` ХОЁУЛАА барина."""
    with _INVOICE_LOCKS_GUARD:
        lock = _INVOICE_LOCKS.get(contract_id)
        if lock is None:
            lock = _INVOICE_LOCKS[contract_id] = threading.RLock()
        return lock


# Хуучин дотоод нэр — дуудагчид эвдрэхгүй.
_contract_invoice_lock = contract_invoice_lock


def _existing_invoice_keys(db: Session, contract: models.Contract) -> set:
    """Гэрээн дээр ОДООГООР байгаа нэхэмжлэлийн түлхүүрүүд — DB-ЭЭС уншина.

    `contract.invoices` цуглуулга нь ХУУЧИРСАН байж болно: энэ session гэрээгээ
    уншсаны ДАРАА өөр хүсэлт нэхэмжлэл үүсгэчихсэн байх нь энгийн. Тэр хуучин
    зурган дээр тулгуурлан шийдвэл ЯГ тэр циклийг дахин үүсгэнэ.
    """
    rows = (db.query(models.Invoice.cycle_start, models.Invoice.cycle_end, models.Invoice.no)
            .filter(models.Invoice.contract_id == contract.id).all())
    return {spec_key(contract, cs, ce, no) for cs, ce, no in rows}


def ensure_invoices(db: Session, contract: models.Contract, today: date | None = None):
    """Дууссан цикл бүрд нэхэмжлэл автоматаар үүсгэнэ (байхгүй бол).

    ⚠ ЗӨВХӨН НЭМНЭ (append-only) — байгаа нэхэмжлэлд хэзээ ч хүрэхгүй, тул
    олон GET зам дээр давтан дуудагдахад аюулгүй. Дахин бодолт (устгаад дахин
    үүсгэх) нь `services/rebuild.py`-ийн ажил, зөвхөн засварын endpoint-оос.

    ⚠ ЗЭРЭГЦЭЭ ХҮСЭЛТЭД ч аюулгүй: гэрээний түгжээний дор «байгааг УНШ →
    дутууг БИЧ» хоёр алхам ХУВААГДАХГҮЙ. Түгжээ нь процессын дотор — систем
    нэг uvicorn ажилчинтай ажилладаг (`run.sh` / `run.bat`), тиймээс энэ нь
    бүрэн хаалт. Хэрэв хожим олон ажилчинтай болвол DB түвшний өвөрмөц
    индекс (contract_id, cycle_start, cycle_end) нэмэх ёстой.

    ⚠ Түгжээг ЗӨВХӨН энэ функц барих нь ХАНГАЛТГҮЙ: нэхэмжлэлийг устгадаг
    цорын ганц зам (`rebuild_contract_invoices`) ч мөн барих ёстой — эс
    бөгөөс түүний «устгасан ба дахин үүсгэсний ХООРОНД» гэсэн цонхонд энэ
    функц орж, ижил циклийг ХОЁР удаа төрүүлнэ.
    """
    today = today or date.today()
    created = []
    with _contract_invoice_lock(contract.id):
        existing = _existing_invoice_keys(db, contract)
        for sp in derivable_invoice_specs(contract, today):
            if spec_key(contract, sp["cycle_start"], sp["cycle_end"], sp["no"]) in existing:
                continue
            # relationship-д нэмнэ — эс бөгөөс тухайн session дотор ачаалагдсан
            # contract.invoices цуглуулга хуучирч, авлага буруу тооцогдоно.
            inv = models.Invoice(contract_id=contract.id, **sp)
            contract.invoices.append(inv)
            created.append(inv)
        if created or contract.type == "sale":
            db.commit()
    if created:
        apply_client_credit(db, contract.client_id)
    return created


def current_cycle_accrual(contract: models.Contract, today: date | None = None):
    """Одоогийн (дуусаагүй) циклийн хуримтлал — UI-д амьд харуулна.

    ⚠ ХААГДСАН ГЭРЭЭНД АМЬД ЦИКЛ БАЙХГҮЙ (H7). Хаалт нь эцсийн ТАСАРХАЙ
    цонхыг ([циклийн эхлэл, хаасан өдөр + 1)) ЖИНХЭНЭ нэхэмжлэл болгодог
    (`derivable_invoice_specs(..., close_date=)`). Хэрэв тэр цонхыг дээрээс нь
    дахин «амьд хуримтлал» гэж тооцвол ЯГ ТЭР МӨНГӨ ХОЁР УДАА тоологдоно:
    авлага = нэхэмжилсэн үлдэгдэл + хуримтлал гэсэн ГАНЦ тодорхойлолт (H9b)
    тул гэрээний «Нийт үлдэгдэл», харилцагчийн авлага, дашбоардын KPI,
    Авлага цуглуулах ДӨРВҮҮЛЭЭ хаагдсан гэрээ тутамд эцсийн циклийн дүнгээр
    хөөрөгдөж байв. «Тоолуур ҮНЭХЭЭР зогсоно» гэдэг нь энэ.
    """
    today = today or date.today()
    if contract.type != "rent":
        return None
    if close_day(contract) is not None:
        return None
    cycles = cycles_of(contract, today)
    if not cycles:
        return None
    cs, ce, complete = cycles[-1]
    if complete:
        return None
    rent, _ = accrue_rent(contract, cs, min(today + timedelta(days=1), ce))
    day_sum, _ = accrue_rent(contract, today, today + timedelta(days=1))
    # Нийт хоног нь ЦОНХНООС гарна, `cycle_days`-аас БИШ: календарь горимд тэр
    # тоо утгагүй (28…31), 30 хоногийн горимд ЯГ ижил утга гарна.
    return {"cycle_start": str(cs), "cycle_end": str(ce),
            "days_done": (today - cs).days + 1, "days_total": (ce - cs).days,
            "accrued": rent, "day_amount": day_sum}


def _dotted(d: date) -> str:
    """Циклийн шошгонд хүн уншдаг огноо: 2026-08-15 → 2026.08.15."""
    return str(d).replace("-", ".")


def cycle_last_day(ce: date) -> date:
    """Хагас нээлттэй цонхны СҮҮЛЧИЙН хоног — [cs, ce) → ce − 1.

    «Хасах нэг» энэ ГАНЦ мөрөнд амьдарна. Хөдөлгүүр бүхэлдээ хагас нээлттэй
    цонхоор ажилладаг (зайгүй, давхцалгүй) ч Отгоогийн шошго БАГТААМЖТАЙ
    ('3.15-4.13' = 30 хоног) — хоёр ертөнцийн хил нь энэ функц.
    """
    return ce - timedelta(days=1)


def cycle_label(cs: date, ce: date, *, dotted: bool = False) -> str:
    """Цонхны БАГТААМЖТАЙ шошго: [03-15, 04-14) → «2026-03-15 – 2026-04-13».

    Нэхэмжлэл, хавсралт, акт, дашбоард — цикл ХАРАГДАХ БҮХ газар энэ ганц
    томьёогоор. Цаас ба дэлгэц дээр нэг цонх хоёр өөр төгсгөлтэй харагдвал
    «аль нь үнэн бэ» гэсэн асуулт гарын үсэг зурахаас өмнө төрнө.

    Хоосон/нэг хоногийн цонхонд урвуу муж хэвлэхгүй — төгсгөл нь эхлэлээсээ
    хойш зогсоно (худалдаа, OB нэхэмжлэлийн цикл нь нэг өдөр).
    """
    fmt = _dotted if dotted else str
    return f"{fmt(cs)} – {fmt(max(cycle_last_day(ce), cs))}"


def upcoming_payment(contract: models.Contract, today: date | None = None):
    """Одоогийн циклийн ТӨСӨӨЛӨЛ — «цикл дуустал өөр хөдөлгөөн гарахгүй» гэвэл
    ХЭЗЭЭ, ХЭДИЙГ нэхэмжлэх вэ.

    `current_cycle_accrual` нь ӨНӨӨДРИЙГ ХҮРТЭЛ хуримтлагдсаныг хэлдэг бол энэ
    нь БҮТЭН циклийн дүнг хэлнэ — «энэ сар хэд ирэх вэ» гэдэг нь мөнгөө
    төлөвлөх асуулт, хагас хариулт нь ажилладаггүй.

    Хугацаа нь `derivable_invoice_specs`-ийн дүрмээр гарна (түрээсийн
    нэхэмжлэлийн due = циклийн төгсгөл), тул төсөөлөл нь цикл дуусахад төрөх
    ЖИНХЭНЭ нэхэмжлэлтэй яг таарна.

    None буцаах тохиолдлууд — мөр ГАРГАХГҮЙ гэсэн үг:
      · худалдаа (цикл гэж байхгүй), хаагдсан гэрээ
      · хоосон цикл: гадаа бараагүй бол хуримтлал 0, тэр цикл нэхэмжлэл ч
        төрүүлэхгүй (`derivable_invoice_specs` алгасдаг) — «0₮ хүлээгдэж
        байна» гэсэн хий мөр Отгоогийн жагсаалтыг бохирдуулна.
    """
    today = today or date.today()
    if contract.type != "rent" or contract.status != "active":
        return None
    cycles = cycles_of(contract, today)
    if not cycles:
        return None
    cs, ce, complete = cycles[-1]
    if complete:
        return None
    rent, _ = accrue_rent(contract, cs, ce)
    if rent <= 0:
        return None
    return {"cycle_start": cs, "cycle_end": ce,
            "cycle_label": cycle_label(cs, ce, dotted=True),
            "expected_date": ce, "projected_amount": rent}


# ---------- алданги ба үлдэгдэл ----------

# ---------- ХҮЧИНГҮЙ НЭХЭМЖЛЭЛ (H1-ийн тэгш хэм) ----------
#
# Нэхэмжлэл нь ерөнхийдөө ДЕРИВАЦЛАГДДАГ (`R-`/`S-`) тул засвар нь дахин
# бодолтоор явна — цуцлах гэсэн ойлголт тэдэнд хэрэггүй. Гэвч ГАРААР
# үүсгэсэн нэхэмжлэл бий: харилцагчийн дансан дээрх түрээс биш бичилт
# (`A-`, H11). Түүнийг УСТГАВАЛ Отгоогийн хуудасны мөр алга болно; тиймээс
# төлбөртэй ЯГ ижил журам — мөр нь ХҮЧИНГҮЙ тэмдэгтэй үлдэж, зөвхөн
# тооцооноос гарна. Хаана авлага НИЙЛҮҮЛЖ байна, тэнд энэ шүүлтүүр заавал.
LIVE_INVOICE = models.Invoice.voided_at.is_(None)


def invoice_active(inv: models.Invoice) -> bool:
    """ORM объект дээрх ижил шалгуур (query биш, ачаалагдсан цуглуулгад)."""
    return getattr(inv, "voided_at", None) is None


def live_invoices(contract: models.Contract) -> list[models.Invoice]:
    return [i for i in contract.invoices if invoice_active(i)]


def void_invoice(db: Session, inv: models.Invoice, reason: str,
                 user_name: str = "") -> list[dict]:
    """Нэхэмжлэлийг ХҮЧИНГҮЙ болгоно — мөрийг нь УСТГАХГҮЙ.

    Түүн дээр суусан хуваарилалт бүр СУЛАРНА (төлбөр нь хэвээр үлдэж,
    хуваарилагдаагүй кредит болно), дараа нь харилцагчийн кредит дахин
    хуваарилагдана — `void_payment`-ийн толин тусгал.
    """
    rows = db.query(models.PaymentAllocation).filter_by(invoice_id=inv.id).all()
    released = [{"payment_id": a.payment_id, "part": a.part, "amount": a.amount} for a in rows]
    for a in rows:
        db.delete(a)
    inv.paid = 0.0
    inv.penalty_paid = 0.0
    inv.voided_at = datetime.utcnow()
    inv.void_reason = reason
    inv.voided_by = user_name or ""
    inv.status = _stored_status(inv)
    db.commit()
    db.expire_all()
    apply_client_credit(db, inv.contract.client_id)
    return released


def invoice_outstanding(inv: models.Invoice) -> float:
    return max(inv.total - inv.paid, 0.0)


def invoice_penalty_due(inv: models.Invoice) -> float:
    """НЭХЭГДСЭН алдангийн үлдэгдэл — хуваарилалт ЗӨВХӨН үүнийг хааж чадна.

    Нэхэгдээгүй (амьд тооцоолол) алданги төлөгдөх боломжгүй: тэр «Алданги
    нэхэх» товч дарагдаж, `book_penalties`-аар хөлдөж байж мөнгө хүлээж авна.
    """
    return max((inv.penalty_booked or 0.0) - (inv.penalty_paid or 0.0), 0.0)


def _penalty_since(inv: models.Invoice) -> date:
    """Амьд алданги хаанаас хойш бодогдох вэ — хугацаа хэтэрсэн өдөр эсвэл
    хамгийн сүүлд бүртгэсэн өдрөөс (аль хожуу нь)."""
    until = inv.penalty_booked_until
    return until if until and until > inv.due_date else inv.due_date


def invoice_penalty(inv: models.Invoice, today: date | None = None) -> float:
    """Харагдах алданги = НЭХЭГДСЭН үлдэгдэл + нэхсэн өдрөөс хойшхи ТООЦООЛОЛ.

    Хэзээ ч нэхэгдээгүй нэхэмжлэлд энэ нь хуучин томьёотой ЯГ ижил
    (booked = 0, since = due_date) — гэхдээ бүхэлдээ НЭХЭГДЭЭГҮЙ дүн.
    """
    today = today or date.today()
    pen = invoice_penalty_due(inv)
    out = invoice_outstanding(inv)
    if out <= 0:
        return pen
    days = (today - _penalty_since(inv)).days
    if days <= 0:
        return pen
    return pen + out * inv.contract.penalty_percent / 100 * days


def invoice_penalty_unbooked(inv: models.Invoice, today: date | None = None) -> float:
    """НЭХЭГДЭЭГҮЙ алдангийн тооцоолол — зөвхөн МЭДЭЭЛЭЛ, төлөгдөхгүй.

    Отгоо энэ тоог 20 жилийн турш харж байгаагүй: хуудсандаа алдангийг
    зарлаад хэзээ ч нэхээгүй. Одоо хэдийг өршөөж байгаагаа ХАРНА — хөшүүрэг
    нь хүчтэй болно. Хаана ч гэсэн «нэхэгдээгүй» шошготой явна.
    """
    return max(invoice_penalty(inv, today) - invoice_penalty_due(inv), 0.0)


def penalty_days(inv: models.Invoice, as_of: date) -> int:
    """`as_of` өдрөөр нэхэгдэх ХОНОГИЙН тоо (нэхэх баримтын «Y хоног»)."""
    if invoice_outstanding(inv) <= 0.005 or inv.contract.penalty_percent <= 0:
        return 0
    return max((as_of - _penalty_since(inv)).days, 0)


def invoice_status(inv: models.Invoice, today: date | None = None) -> str:
    today = today or date.today()
    out = invoice_outstanding(inv)
    if out <= 0.005:
        # үндсэн дүн хаагдсан ч бүртгэгдсэн алданги үлдсэн бол ТӨЛӨГДӨӨГҮЙ хэвээр
        if invoice_penalty_due(inv) > 0.005:
            return "penalty"
        return "paid"
    if today > inv.due_date:
        return "overdue"
    return "partial" if inv.paid > 0 else "open"


def _book_invoices(invoices, as_of: date) -> list[dict]:
    """Хэтэрсэн нэхэмжлэлүүдийг `as_of` өдрөөр хөлдөөнө — алдангийн ЦӨМ.

    Монотон: `penalty_booked_until` зөвхөн УРАГШ явна (нэмэгдэл 0 байсан ч
    тэмдэглэнэ); `as_of` нь нэхсэн өдрөөс хойш байвал юу ч хийхгүй.
    Буцна: нэхэгдсэн мөр бүрийн задаргаа (баримтад ЯГ энэ мөрүүд хэвлэгдэнэ).
    """
    rows: list[dict] = []
    for inv in invoices:
        if inv.contract.penalty_percent <= 0:      # OB болон алдангигүй гэрээ
            continue
        if invoice_outstanding(inv) <= 0.005:      # үндсэн дүн хаагдсан → өсөхгүй
            continue
        if as_of <= inv.due_date:
            continue
        since = _penalty_since(inv)
        if as_of < since:                          # ХОЙШОО явахгүй
            continue
        days = (as_of - since).days
        inc = invoice_outstanding(inv) * inv.contract.penalty_percent / 100 * days
        inv.penalty_booked = (inv.penalty_booked or 0.0) + inc
        inv.penalty_booked_until = as_of
        rows.append({"invoice_id": inv.id, "no": inv.no,
                     "cycle_start": str(inv.cycle_start), "cycle_end": str(inv.cycle_end),
                     "days": days, "amount": round(inc, 2)})
    return rows


def book_penalties(db: Session, client_id: int, as_of: date,
                   contract_id: int | None = None, record: bool = True,
                   user_name: str = "") -> float:
    """Алдангийг `as_of` өдрөөр НЭХНЭ — ИЛ ҮЙЛДЭЛ, хажуугийн үр дагавар БИШ.

    ⚠ АНХААР — ЭНЭ ФУНКЦ БИЧДЭГ, БАС МӨНГӨ НЭХДЭГ. `ensure_invoices`-оос,
    ямар ч GET (унших) замаас, төлбөр бүртгэхээс, барьцааны тооцооноос
    ДУУДАЖ БОЛОХГҮЙ. Зөвхөн хоёр зам үлдсэн:
      · POST /api/contracts/{id}/book-penalty — «Алданги нэхэх» товч
      · rebuild-ийн replay (`record=False` — хуучин явдлыг ДАХИН тоглуулна)

    `record=True` бол нэхэлт бүр `PenaltyCharge` явдал болж үлдэнэ: дахин
    бодолт (rebuild) нэхэмжлэлүүдийг устгаад шинээр төрүүлэхэд эдгээр
    огноогоор ДАХИН нэхэж, өнгөрсөн шийдвэрүүд алдагдахгүй.
    Буцна: нийт нэхэгдсэн алданги.
    """
    q = (db.query(models.Invoice).join(models.Contract)
         .filter(models.Contract.client_id == client_id).filter(LIVE_INVOICE))
    if contract_id is not None:
        q = q.filter(models.Invoice.contract_id == contract_id)
    invoices = q.all()
    rows = _book_invoices(invoices, as_of)
    if record:
        _record_charges(db, client_id, invoices, rows, as_of, user_name)
    db.commit()
    return sum(r["amount"] for r in rows)


def _record_charges(db: Session, client_id: int, invoices, rows: list[dict],
                    as_of: date, user_name: str) -> None:
    """Нэхэлтийг ГЭРЭЭ БҮРЭЭР явдал болгож бичнэ.

    Дүн 0 байсан ч бичигдэнэ: нэхэлт нь `penalty_booked_until`-ыг урагшлуулдаг
    тул тэр агшин өөрөө ТӨЛӨВ — replay түүнийг алдвал дараагийн нэхэлт хэт
    олон хоног тоолно.
    """
    by_contract: dict[int, float] = {}
    for inv in invoices:
        if inv.contract.penalty_percent > 0:
            by_contract.setdefault(inv.contract_id, 0.0)
    inv_contract = {i.id: i.contract_id for i in invoices}
    for r in rows:
        cid = inv_contract[r["invoice_id"]]
        by_contract[cid] = by_contract.get(cid, 0.0) + r["amount"]
    for cid, amount in by_contract.items():
        db.add(models.PenaltyCharge(contract_id=cid, client_id=client_id, as_of=as_of,
                                    amount=round(amount, 2), user_name=user_name))


def charge_contract_penalty(db: Session, contract: models.Contract, as_of: date,
                            user_name: str = "") -> dict:
    """«Алданги нэхэх» — гэрээний нэхэмжлэлүүд дээр нэг ИЛ нэхэлт.

    Буцна: {as_of, total, rows} — мөр бүр нь баримтын «№R-… : X₮ (Y хоног)».
    """
    rows = _book_invoices(live_invoices(contract), as_of)
    db.add(models.PenaltyCharge(contract_id=contract.id, client_id=contract.client_id,
                                as_of=as_of, amount=round(sum(r["amount"] for r in rows), 2),
                                user_name=user_name))
    db.commit()
    return {"as_of": str(as_of), "total": round(sum(r["amount"] for r in rows), 2),
            "rows": rows}


# ХҮЧИНГҮЙ болсон НЭХЭЛТИЙГ хасах ганц шүүлтүүр (`LIVE_PAYMENT`-ийн ах дүү).
# Хаана алданги ТООЦОГДОЖ байна, тэнд энэ нь заавал: replay, тайлан. Жагсаалт
# (харагдац) нь ЭСРЭГЭЭР — цуцлагдсан нэхэлт ХАРАГДСААР үлдэх ёстой, эс бөгөөс
# «хэдийг өршөөв» гэдэг нь дэлгэцээс алга болно.
LIVE_CHARGE = models.PenaltyCharge.voided_at.is_(None)


def charge_active(ch: models.PenaltyCharge) -> bool:
    """ORM объект дээрх ижил шалгуур (query биш, ачаалагдсан цуглуулгад)."""
    return getattr(ch, "voided_at", None) is None


def contract_penalty_charges(db: Session, contract_id: int,
                             live_only: bool = True) -> list[models.PenaltyCharge]:
    """Гэрээний нэхэлтийн явдлууд — replay-ийн эх сурвалж, огноогоор эрэмбэлэгдсэн.

    `live_only=True` (анхны утга) — ЗӨВХӨН хүчинтэй нэхэлт: replay нь цуцалсан
    шийдвэрийг ДАХИН тоглуулж болохгүй (эс бөгөөс огт хамаагүй засвар хийх бүрд
    өршөөсөн алданги өөрөө амилна). `False` — ХАРАГДАЦ-д: түүх бүтнээрээ.
    """
    q = db.query(models.PenaltyCharge).filter_by(contract_id=contract_id)
    if live_only:
        q = q.filter(LIVE_CHARGE)
    return q.order_by(models.PenaltyCharge.as_of, models.PenaltyCharge.created_at,
                      models.PenaltyCharge.id).all()


def contract_balance(contract: models.Contract, today: date | None = None):
    today = today or date.today()
    live = live_invoices(contract)
    outstanding = sum(invoice_outstanding(i) for i in live)
    penalty = sum(invoice_penalty(i, today) for i in live)
    # Хоёр нүүрийг ТУСАД нь: нэхэгдсэн нь МӨНГӨ (төлөгдөнө), нэхэгдээгүй нь
    # зөвхөн ХӨШҮҮРЭГ. Нийлүүлж харуулсан тоо нь «машин өр зохиов» гэж уншигдана.
    booked = sum(invoice_penalty_due(i) for i in live)
    cur = current_cycle_accrual(contract, today)
    return {"outstanding": outstanding, "penalty": penalty,
            "penalty_booked": booked, "penalty_unbooked": max(penalty - booked, 0.0),
            "accruing": cur["accrued"] if cur else 0.0}


# ---------- АВЛАГА: НЭГ ТОДОРХОЙЛОЛТ, БҮХ ДЭЛГЭЦЭД (H9b) ----------
#
# Урьд нь нэг харилцагч ХОЁР өөр нийт дүнтэй байв: дашбоард/харилцагчийн мөр
# нь «нэхэмжилсэн + одоогийн циклийн хуримтлал», Авлага цуглуулах нь зөвхөн
# «нэхэмжилсэн». Отгоо эгч хоёр дэлгэцийг зэрэгцүүлэн хараад «хуудсууд минь
# шиг л зөрж байна» гэнэ — шилжилтийн шалтгаан нь бүтнээрээ унана.
#
# ГАНЦ тодорхойлолт нь ТҮҮНИЙ удирддаг бүтэн үнэн:
#     авлага = нэхэмжилсэн үлдэгдэл + одоогийн циклийн хуримтлал
# БҮРЭЛДЭХҮҮН нь харагдаж болно («үүнээс нэхэмжлэгдээгүй: X₮»), НИЙТ дүн нь
# хаана ч ГАНЦ. Алданги энэ тоонд ОРОХГҮЙ — тэр бол тусдаа хоёр нүүр (H2).

def contract_receivable(contract: models.Contract, today: date | None = None) -> dict:
    """Нэг гэрээний авлага, задаргаатайгаа. Алдангийн хоёр нүүр дагалдана —
    дуудагч `contract_balance`-ыг ДАХИН дуудах шаардлагагүй (хуримтлалыг
    хоёр удаа бодох нь жагсаалт бүр дээр давхар зардал)."""
    b = contract_balance(contract, today)
    return {"total": b["outstanding"] + b["accruing"],
            "invoiced": b["outstanding"], "uninvoiced": b["accruing"],
            "penalty": b["penalty"], "penalty_booked": b["penalty_booked"],
            "penalty_unbooked": b["penalty_unbooked"]}


def client_receivable(client: models.Client, today: date | None = None) -> dict:
    """Харилцагчийн авлага — ДЭЛГЭЦ БҮРИЙН ТОО ЭНДЭЭС ГАРНА.

    `serializers.client_row` (жагсаалт, профайл, дашбоардын хуваарийн мөр) ба
    `analytics.collections` (авлагын жагсаалт) хоёул ЭНЭ функцийг дууддаг.
    Шинэ дэлгэц нэмэгдвэл мөн эндээс — өөр газар дахин нийлүүлж БОЛОХГҮЙ.
    """
    today = today or date.today()
    invoiced = uninvoiced = 0.0
    penalty = booked = deposit = 0.0
    active = 0
    # `contract_balance` нь циклийн хуримтлалыг дахин боддог тул гэрээ бүрд
    # НЭГ л удаа дуудна (жагсаалт нь бүх харилцагчийг алхдаг).
    for ct in client.contracts:
        b = contract_balance(ct, today)
        invoiced += b["outstanding"]
        uninvoiced += b["accruing"]
        penalty += b["penalty"]
        booked += b["penalty_booked"]
        deposit += ct.deposit
        if ct.status == "active":
            active += 1
    total = invoiced + uninvoiced
    return {"total": total, "invoiced": invoiced, "uninvoiced": uninvoiced,
            "penalty": penalty, "penalty_booked": booked,
            "penalty_unbooked": max(penalty - booked, 0.0),
            "deposit": deposit, "active_contracts": active,
            "overdue": any(invoice_status(i, today) == "overdue"
                           for ct in client.contracts for i in live_invoices(ct))}


def receivable_display(total: float, invoiced: float) -> dict:
    """Дугуйлалтын ГАНЦ дүрэм: НИЙТ дүн эрх мэдэлтэй, задаргаа нь түүн рүү нийлнэ.

    Хэсэг бүрийг тусад нь дугуйлбал «12,000,001 = 11,000,000 + 1,000,000»
    гэсэн нэг төгрөгийн зөрүү гарч ирдэг — Отгоогийн нүдэнд энэ нь тоо
    буруу гэсэн үг, тайлбар биш.
    """
    t = round(total)
    inv = round(invoiced)
    return {"total": t, "invoiced": inv, "uninvoiced": t - inv}


# ---------- төлбөрийн хуваарилалт ----------

def payment_unallocated(payment: models.Payment) -> float:
    return payment.amount - sum(a.amount for a in payment.allocations)


# ХҮЧИНГҮЙ болсон төлбөрийг ХАСАХ ганц шүүлтүүр. Хаана мөнгө НИЙЛҮҮЛЖ байна,
# тэнд энэ нь заавал: хуваарилалт, replay, орлого, мөнгөн урсгал. Жагсаалт
# (харагдац) нь ЭСРЭГЭЭР — цуцлагдсан мөр ХАРАГДСААР үлдэх ёстой.
LIVE_PAYMENT = models.Payment.voided_at.is_(None)


def payment_active(p: models.Payment) -> bool:
    """ORM объект дээрх ижил шалгуур (query биш, ачаалагдсан цуглуулгад)."""
    return getattr(p, "voided_at", None) is None


def apply_client_credit(db: Session, client_id: int) -> float:
    """Хуваарилагдаагүй үлдсэн (урьдчилж төлсөн) мөнгийг шинэ нэхэмжлэлүүдэд
    автоматаар хаана — хамгийн хуучин төлбөрөөс, хамгийн хуучин нэхэмжлэл рүү.

    Цуцлагдсан төлбөр эндээс ХАСАГДАНА: түүний мөнгө «урьдчилсан төлбөр» болж
    үлдвэл сулласан алдаа шинэ нэхэмжлэл дээр өөрөө дахин наалдана.
    """
    payments = (db.query(models.Payment).filter_by(client_id=client_id)
                .filter(LIVE_PAYMENT)
                .order_by(models.Payment.date, models.Payment.id).all())
    applied = 0.0
    for p in payments:
        remain = payment_unallocated(p)
        if remain <= 0.005:
            continue
        applied += _fill_invoices(db, p, remain)
    if applied:
        db.commit()
    return applied


def _stored_status(inv: models.Invoice) -> str:
    """`inv.status` талбарт хадгалагдах төлөв (invoice_status-тай нэг утгатай).

    `paid == 0` салаа нь ЗӨВХӨН хуваарилалт СУЛАРСАН үед (void) хэрэгтэй:
    `_fill_one` үүнийг мөнгө орсны дараа л дууддаг тул тэнд зан төлөв өөрчлөгдөөгүй.
    """
    if inv.total - inv.paid > 0.005:
        return "partial" if inv.paid > 0.005 else "open"
    return "penalty" if invoice_penalty_due(inv) > 0.005 else "paid"


def _fill_one(db: Session, payment: models.Payment, inv: models.Invoice,
              remain: float, manual: int = 0, principal_only: bool = False) -> float:
    """Нэг нэхэмжлэлийг ХААХ: эхлээд ҮНДСЭН дүн, дараа нь ТҮҮНИЙ бүртгэгдсэн алданги."""
    filled = 0.0
    out = invoice_outstanding(inv)
    if out > 0 and remain > 0:
        take = min(out, remain)
        db.add(models.PaymentAllocation(payment_id=payment.id, invoice_id=inv.id,
                                        amount=take, part="principal", manual=manual))
        inv.paid += take
        remain -= take
        filled += take
    due = 0.0 if principal_only else invoice_penalty_due(inv)
    if due > 0 and remain > 0:
        take = min(due, remain)
        db.add(models.PaymentAllocation(payment_id=payment.id, invoice_id=inv.id,
                                        amount=take, part="penalty", manual=manual))
        inv.penalty_paid = (inv.penalty_paid or 0.0) + take
        remain -= take
        filled += take
    if filled:
        inv.status = _stored_status(inv)
    return filled


def _fill_invoices(db: Session, payment: models.Payment, remain: float,
                   principal_only: bool = False) -> float:
    """Нэг төлбөрийн `remain` дүнг тохирох нэхэмжлэлүүдэд хуваарилна.

    Дараалал: хамгийн хуучин нэхэмжлэлийг БҮТНЭЭР хаана (үндсэн → алданги),
    дараа нь дараагийнх руу. Хаана ч алданги бүртгэгдээгүй үед энэ нь
    хуучин зан төлөвтэй яг ижил.
    """
    q = (db.query(models.Invoice).join(models.Contract)
         .filter(models.Contract.client_id == payment.client_id)
         .filter(LIVE_INVOICE))
    if payment.contract_id:
        q = q.filter(models.Invoice.contract_id == payment.contract_id)
    filled = 0.0
    for inv in sorted(q.all(), key=lambda i: (i.due_date, i.id)):
        if remain <= 0:
            break
        if invoice_outstanding(inv) <= 0 and (principal_only or invoice_penalty_due(inv) <= 0):
            continue
        took = _fill_one(db, payment, inv, remain, principal_only=principal_only)
        remain -= took
        filled += took
    return filled


def allocate_payment(db: Session, payment: models.Payment,
                     manual: list[dict] | None = None,
                     principal_only: bool = False):
    """Төлбөрийг нэхэмжлэлүүдэд хуваарилна. Буцна: хуваарилагдсан дүн.

    `manual` = [{invoice_id, amount}] — гараар чиглүүлсэн хуваарилалт; өгсөн
    дарааллаар нь ЭХЛЭЭД хийгдэнэ (мөр бүр manual=1), үлдсэн мөнгө хуучин
    журмаараа (хамгийн хуучнаас) автоматаар хуваарилагдана.

    `principal_only` — БАРЬЦААНЫ суутгалд: суутгасан дүн зөвхөн ҮНДСЭН өрийг
    бууруулна (дарга "6 сая суутгав" гэвэл авлага яг 6 саяар буурч харагдана).
    Алданги нь бүртгэгдсэн хэвээр үлдэж, бодит төлбөрөөр хаагдана.
    """
    filled = 0.0
    remain = payment.amount
    for row in manual or []:
        if remain <= 0:
            break
        inv = db.get(models.Invoice, int(row["invoice_id"]))
        if inv is None:
            continue
        took = _fill_one(db, payment, inv, min(float(row["amount"]), remain), manual=1,
                         principal_only=principal_only)
        remain -= took
        filled += took
    filled += _fill_invoices(db, payment, remain, principal_only=principal_only)
    db.commit()
    return filled


# ---------- хүчингүй болгох (устгалын ОРОНД) ----------

def payment_release_preview(payment: models.Payment) -> list[dict]:
    """Энэ төлбөрийг цуцлавал АЛЬ нэхэмжлэлээс ХЭД суларах вэ (зөвхөн УНШИНА).

    `void_payment`-ийн үр дүнтэй ЯГ ижил жагсаалт — Отгоо баталгаажуулах цонхон
    дээр «юу буцаж нээгдэх» гэдгээ хийхээсээ ӨМНӨ уншина. Хоёр газарт хоёр
    өөр тоо гарах боломжгүй байх ёстой тул нэг л дүрмээр бодогдоно.
    """
    rows: dict[tuple[int, str], dict] = {}
    for a in payment.allocations:
        key = (a.invoice_id, a.part)
        row = rows.get(key)
        if row is None:
            row = rows[key] = {"invoice_id": a.invoice_id, "no": a.invoice.no,
                               "part": a.part, "amount": 0.0}
        row["amount"] += a.amount
    return sorted(rows.values(), key=lambda r: (r["no"], r["part"]))


def void_payment(db: Session, payment: models.Payment, reason: str,
                 user_name: str = "") -> list[dict]:
    """Төлбөрийг ХҮЧИНГҮЙ болгоно — мөрийг нь УСТГАХГҮЙ.

    Гурван алхам:
      1) хуваарилалт бүрийг устгаж нэхэмжлэлийн `paid` / `penalty_paid`-ыг
         яг тэр дүнгээр буцааж хасна, төлвийг нь дахин бодно;
      2) төлбөрийг цуцлагдсан гэж тэмдэглэнэ (шалтгаан, хэн, хэзээ);
      3) харилцагчийн ҮЛДСЭН (цуцлагдаагүй) кредитийг дахин хуваарилна —
         сулласан нэхэмжлэл рүү урьдчилсан төлбөр өөрөө очно.

    ⚠ НЭХЭГДСЭН АЛДАНГИ ҮЛДЭНЭ. Алданги нь Отгоогийн ИЛ шийдвэрээр нэхэгдсэн
    (`PenaltyCharge` явдал) — төлбөрийн хажуугийн үр дагавар БИШ, тиймээс
    төлбөр цуцлагдахад тэр шийдвэр хүчингүй болох ямар ч шалтгаан алга.
    Цуцлалт нь зөвхөн ТӨЛӨГДСӨН гэсэн тэмдгийг (`penalty_paid`) сулруулна,
    НЭХЭЛТИЙГ (`penalty_booked`, `penalty_booked_until`) буцаахгүй. Нэхэлтээ
    буцаах гэвэл тэр нь тусдаа ИЛ үйлдэл байх ёстой.

    Буцна: сулларсан мөрүүд (нэхэмжлэл, хэсэг, дүн) — audit ба баримтад.
    """
    released = payment_release_preview(payment)
    touched: dict[int, models.Invoice] = {}
    for a in list(payment.allocations):
        inv = a.invoice
        if a.part == "penalty":
            inv.penalty_paid = max((inv.penalty_paid or 0.0) - a.amount, 0.0)
        else:
            inv.paid = max(inv.paid - a.amount, 0.0)
        touched[inv.id] = inv
        db.delete(a)
    db.flush()
    for inv in touched.values():
        inv.status = _stored_status(inv)
    payment.voided_at = datetime.utcnow()
    payment.void_reason = reason
    payment.voided_by = user_name
    db.commit()
    db.expire_all()
    apply_client_credit(db, payment.client_id)
    return released


# ---------- нөөцөд хөдөлгөөн тусгах ----------

def _stock(db: Session, material_id: int, grade_id: int) -> models.Stock:
    st = db.query(models.Stock).filter_by(material_id=material_id, grade_id=grade_id).first()
    if not st:
        st = models.Stock(material_id=material_id, grade_id=grade_id)
        db.add(st)
        db.flush()
    return st


def apply_movement_stock(db: Session, mv: models.Movement):
    """Хөдөлгөөн 'done' болоход нөөцөд тусгана.

    ХУДАЛДАА БОЛГОВ (SALE, H7): `on_rent` -= qty, БУСАД ХУВААРЬ НЬ ХӨДӨЛӨХГҮЙ.
    Бараа буцаж ирээгүй тул `on_hand` руу орохгүй; эвдэрсэн ч биш тул
    `written_off` руу ч орохгүй — тэр ЗАРАГДСАН, компанийнх байхаа больсон.
    Энэ бол шинэ дүрэм БИШ: худалдааны гэрээний ISSUE яг ингэдэг (`sale`
    салбар доор — `on_hand` -= qty, `on_rent` руу нэмэхгүй).

    ҮР ДАГАВАР (ил хэлье): «Нийт эзэмшил = Агуулахад + Түрээсэнд + Засварт»
    гэсэн адилтгал зарагдсан хэмжээгээр БУУРНА. Энэ нь ЗӨВ — парк үнэхээр
    багассан (R27-ийн «− Зарагдсан» гишүүн) — бөгөөс ердийн худалдааны
    гэрээнд аль хэдийн үнэн байсан.
    """
    sale = mv.contract.type == "sale"
    for ln in mv.lines:
        st = _stock(db, ln.material_id, ln.grade_id)
        if mv.type == "ISSUE":
            st.on_hand -= ln.qty
            if not sale:
                st.on_rent += ln.qty
        elif mv.type == "RETURN":
            st.on_rent -= ln.qty
            back = ln.qty - ln.repair_qty - ln.writeoff_qty
            tgt = _stock(db, ln.material_id, ln.return_grade_id or ln.grade_id)
            tgt.on_hand += max(back, 0)
            tgt.in_repair += ln.repair_qty
            tgt.written_off += ln.writeoff_qty
        elif mv.type == "WRITEOFF":
            st.on_rent -= ln.qty
            st.written_off += ln.qty
        elif mv.type == "SALE":
            st.on_rent -= ln.qty
    db.commit()


LOT_CONSUMED_ERR = ("Дараагийн буцаалт энэ падангаас хасагдсан — "
                    "эхлээд түүнийг цуцална уу")


def lot_consumers(contract: models.Contract, movement_id: int) -> list[int]:
    """Энэ ОЛГОЛТЫН падангуудаас хассан буцаалт/актын мөрүүдийн id.

    Хоосон бол падан нь ХӨНДӨГДӨӨГҮЙ — олголтыг цуцлахад хэн ч эх үүсвэргүй
    үлдэхгүй. Хоосон биш бол цуцлалт нь дараагийн буцаалтыг агаарт үлдээж,
    үлдэгдлийг сөрөг болгоно — тиймээс ЭХЛЭЭД тэр буцаалтаа цуцлах ёстой.

    Хамаарлыг тооцоолж (хадгалдаггүй) гаргадаг тул энд ЯГ тэр `_lots`-ийн
    хуваарилалтаар алхана: дэлгэц дээр «#12 падангаас 40ш» гэж харагдсан мөр
    ЯГ энэ хоригийг үүсгэнэ.
    """
    out: list[int] = []
    for lot in _lots(contract):
        if lot["movement_id"] != movement_id:
            continue
        out += [t["line_id"] for t in lot["takes"] if t["qty"] > 0]
    return out


def reversal_block(db: Session, mv: models.Movement) -> str | None:
    """`unapply_movement_stock` нөөцийг сөрөг болгох уу? Болгох бол ЯАГААДЫГ хэлнэ.

    Толин тусгалыг буцаах нь зарим тоог БУУРУУЛДАГ (буцаалт цуцлах ⇒ агуулахаас
    хасна). Хооронд нь бараа дахин олгогдсон бол хасах юм үлдээгүй — тэр
    үед бид үлдэгдлийг сөрөг болгохын оронд шалтгааныг нь монголоор хэлж
    ТАТГАЛЗАНА.

    ХУДАЛДАА (SALE) нь энд ямагт НЭЭЛТТЭЙ бөгөөс тэр нь МЭДЭЭЖ: түүний
    урвуу үйлдэл нь `on_rent`-ийг зөвхөн НЭМДЭГ (`unapply_movement_stock`),
    юуг ч хасдаггүй тул нөөцийг сөрөг болгох арга ЗАРЧМЫН ХУВЬД байхгүй.
    Худалдааны хоригийг ӨӨР хаалга барина: түүнийг ТЭЖЭЭСЭН олголтыг
    цуцлах гэвэл `lot_consumers` → `LOT_CONSUMED_ERR` («эхлээд түүнийг
    цуцална уу») гэж татгалзана. Салбарыг ИЛЭРХИЙ бичсэн нь — «мартагдсан»
    ба «шалгах юмгүй» хоёрыг дараагийн уншигч ялгах ёстой.
    """
    sale = mv.contract.type == "sale"
    need: dict[tuple[int, int, str], float] = {}

    def take(material_id: int, grade_id: int, field: str, q: float):
        if q > 0.0001:
            key = (material_id, grade_id, field)
            need[key] = need.get(key, 0.0) + q

    for ln in mv.lines:
        if mv.type == "ISSUE":
            if not sale:
                take(ln.material_id, ln.grade_id, "on_rent", ln.qty)
        elif mv.type == "RETURN":
            tgt = ln.return_grade_id or ln.grade_id
            take(ln.material_id, tgt, "on_hand", ln.qty - ln.repair_qty - ln.writeoff_qty)
            take(ln.material_id, tgt, "in_repair", ln.repair_qty)
            take(ln.material_id, tgt, "written_off", ln.writeoff_qty)
        elif mv.type == "WRITEOFF":
            take(ln.material_id, ln.grade_id, "written_off", ln.qty)
        elif mv.type == "SALE":
            pass                                   # хасагдах хувиарь БАЙХГҮЙ

    for (material_id, grade_id, field), q in need.items():
        st = db.query(models.Stock).filter_by(material_id=material_id,
                                              grade_id=grade_id).first()
        have = getattr(st, field, 0.0) if st else 0.0
        if have + 0.0001 >= q:
            continue
        m = db.get(models.Material, material_id)
        name = m.name if m else "Материал"
        if field == "on_hand":
            return (f"{name}: буцаж ирсэн бараа дахин олгогдсон — агуулахад "
                    f"{have:g}ш л байна ({q:g}ш хасах шаардлагатай). Эхлээд "
                    f"дараагийн олголтыг цуцална уу")
        if field == "on_rent":
            return (f"{name}: түрээсэнд {have:g}ш л байна ({q:g}ш хасах "
                    f"шаардлагатай) — энэ олголтыг буцаах боломжгүй")
        label = "засварт" if field == "in_repair" else "акталсан"
        return (f"{name}: {label} тоо аль хэдийн өөрчлөгдсөн ({have:g}ш, "
                f"{q:g}ш хасах шаардлагатай) — цуцлах боломжгүй")
    return None


def unapply_movement_stock(db: Session, mv: models.Movement):
    """`apply_movement_stock`-ийн ЯГ УРВУУ үйлдэл — хөдөлгөөнийг засахын өмнө.

    Мөр бүрийн салбар (буцах зэрэглэл, засвар, акт, худалдаа) толин тусгал
    байх ёстой: эс бөгөөс засварын дараа агуулахын үлдэгдэл гажина.
    """
    sale = mv.contract.type == "sale"
    for ln in mv.lines:
        st = _stock(db, ln.material_id, ln.grade_id)
        if mv.type == "ISSUE":
            st.on_hand += ln.qty
            if not sale:
                st.on_rent -= ln.qty
        elif mv.type == "RETURN":
            st.on_rent += ln.qty
            back = ln.qty - ln.repair_qty - ln.writeoff_qty
            tgt = _stock(db, ln.material_id, ln.return_grade_id or ln.grade_id)
            tgt.on_hand -= max(back, 0)
            tgt.in_repair -= ln.repair_qty
            tgt.written_off -= ln.writeoff_qty
        elif mv.type == "WRITEOFF":
            st.on_rent += ln.qty
            st.written_off -= ln.qty
        elif mv.type == "SALE":
            # Зарагдсан бараа ТҮРЭЭСЭНД буцаж орно — өөр ямар ч хувиарь
            # хөндөгдөөгүй тул хасах юм ч алга (`reversal_block`-ийн тайлбар).
            st.on_rent += ln.qty
    db.commit()


# ---------- мэдэгдэл (амьд тооцоолол) ----------

def pending_shipments(db: Session, scope: str = "all") -> list[models.Movement]:
    """Баталгаажаагүй ачилтууд — `scope` төрлийн гэрээнийх. Мэдэгдэл ба
    дашбоардын самбар ХОЁУЛАА эндээс уншина: нэг жагсаалт хоёр газар өөр
    байвал «3 ачилт хүлээгдэж байна» гэсэн мэдэгдлийн доор 5 мөр гарна."""
    rows = (db.query(models.Movement)
            .filter_by(status="pending", type="ISSUE")
            .filter(models.Movement.voided_at.is_(None)).all())
    if scope == "all":
        return rows
    return [mv for mv in rows if mv.contract.type == scope]


def build_notifications(db: Session, today: date | None = None, scope: str = "all"):
    """Мэдэгдэл — ЗӨВХӨН `scope` төрлийн гэрээнүүдээс.

    Топбарын Түрээс/Худалдаа шүүлтүүр KPI, хэтэрсэн жагсаалт, насжилтыг
    шүүдэг байхад мэдэгдэл нь бүх гэрээг зөөсөөр байв: «Худалдаа» гэж шүүсэн
    хүн худалдаанд огт хамаагүй түрээсийн нэхэмжлэлүүдийг мэдэгдлээс уншдаг.
    Шүүлтүүр хагас үйлчилбэл шүүлтүүрт итгэхээ болино.

    Энд бүх мэдэгдэл ГЭРЭЭТЭЙ (`contract_id`) тул бүгд шүүгдэнэ. Гэрээний
    төрөлгүй мэдэгдлүүд (зээл, бартер, амлалт) нь дашбоард дээр нэмэгддэг ба
    scope-оос хамаардаггүй — тэдэнд түрээс/худалдаа гэсэн харьяалал байхгүй.
    """
    today = today or date.today()
    notes = []
    contracts = db.query(models.Contract).filter(models.Contract.status == "active").all()
    for c in contracts:
        ensure_invoices(db, c, today)
    for c in contracts:
        if scope != "all" and c.type != scope:
            continue
        if c.end_date and c.type == "rent":
            left = (c.end_date - today).days
            if 0 <= left <= 7:
                notes.append({"kind": "ending", "level": "warn",
                              "title": f"{c.client.name} — гэрээ №{c.no} дуусахад {left} хоног",
                              "sub": f"Дуусах огноо {c.end_date}. Сунгах эсэхийг шийднэ үү.",
                              "contract_id": c.id})
            elif left < 0:
                notes.append({"kind": "expired", "level": "danger",
                              "title": f"{c.client.name} — гэрээ №{c.no}-ийн хугацаа хэтэрсэн",
                              "sub": f"{-left} хоногийн өмнө дуусах ёстой байсан. Сунгах эсвэл хаана уу.",
                              "contract_id": c.id})
        for inv in live_invoices(c):
            st = invoice_status(inv, today)
            if st == "overdue":
                # Мэдэгдэл дээр «алданги X₮» гэж бичих нь НЭХСЭН мэт уншигдана.
                # Нэхэгдсэн нь өр; нэхэгдээгүй нь тооцоолол — ≈ ба шошготой (H2).
                due = invoice_penalty_due(inv)
                unbooked = invoice_penalty_unbooked(inv, today)
                days = (today - inv.due_date).days
                sub = f"Үлдэгдэл {invoice_outstanding(inv):,.0f}₮"
                if due > 0.5:
                    sub += f" · нэхэгдсэн алданги {due:,.0f}₮"
                if unbooked > 0.5:
                    sub += f" · алдангийн тооцоолол ≈{unbooked:,.0f}₮ (нэхэгдээгүй)"
                notes.append({"kind": "overdue", "level": "danger",
                              "title": f"{c.client.name} — нэхэмжлэл {inv.no} {days} хоног хэтэрлээ",
                              "sub": sub,
                              "contract_id": c.id, "invoice_id": inv.id})
    pending = pending_shipments(db, scope)
    for mv in pending:
        notes.append({"kind": "shipment", "level": "info",
                      "title": f"{mv.contract.client.name} — №{mv.contract.no} ачилт хүлээгдэж байна",
                      "sub": mv.note or f"Огноо {mv.date}",
                      "contract_id": mv.contract_id, "movement_id": mv.id})
    return notes

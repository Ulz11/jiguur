"""Тооцооны хөдөлгүүр — системийн зүрх.

Дүрмүүд (бодит Numbers файлуудаас баталгаажсан):
- Түрээс хоногоор: тухайн өдөр d-д бараа "гадаа" бол тоолно.
  Өдрийн муж [гарсан өдөр, буцсан өдөр) — 3.20-нд гарч 3.21-нд буцвал 1 хоног.
- Цикл = гэрээний өдрөөс эхэлсэн cycle_days (30) хоногийн үе. [эхлэл, төгсгөл) хагас нээлттэй.
- Буцаалт циклийн дундуур ирвэл өдрөөр нь пропорц бодогдоно (өөрөө гарна).
- Засвар, актын төлбөр тухайн циклийн нэхэмжлэлд нэмэгдэнэ.
- Алданги = үлдэгдэл × %/хоног × хэтэрсэн хоног (амьд тооцоолол).
"""
import json
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from .. import models


# ---------- тоо ширхэгийн хугацааны шугам ----------

def _deltas(contract: models.Contract):
    """(material_id, grade_id) бүрээр огноот өөрчлөлтүүд: ISSUE +qty, RETURN/WRITEOFF -qty."""
    out: dict[tuple[int, int], list[tuple[date, float]]] = {}
    for mv in contract.movements:
        if mv.status != "done":
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


def line_rate(contract: models.Contract, ln: models.MovementLine,
              defaults: dict[tuple[int, int], float] | None = None) -> float:
    """Мөрийн тариф: өөрийн тариф, байхгүй бол гэрээний мөрийн үндсэн тариф.

    Хуучин (тамгалагдаагүй) мөрүүд болон тестийн туслахууд тарифгүй бичдэг тул
    энэ уналт ХЭРЭГТЭЙ — тэдгээр нь гэрээний тарифаараа хэвээр бодогдоно.
    """
    if ln.rate is not None:
        return ln.rate
    if defaults is None:
        defaults = default_rates(contract)
    return defaults.get((ln.material_id, ln.grade_id), 0.0)


def _lots(contract: models.Contract) -> list[dict]:
    """Гэрээний бүх падан — баталгаажсан (done) ОЛГОЛТЫН мөр бүр нэг падан.

    Падан бүр өөрийн тариф, огноо, тоотой. Буцаалт/акт паданг ХААНА:
    эхлээд `issue_line_id`-аар заасан падангаас (тухайн өдрийн үлдэгдлээр
    хязгаарлаж), үлдсэнийг нь (material, grade) дотор FIFO-гоор.
    Хамаарал нь ХАДГАЛАГДАХГҮЙ, бодогдоно — тул хоёр паданг дамнасан буцаалт
    өөрөө хуваагдана. Хүлээгдэж буй (pending) олголт ХЭЗЭЭ Ч тооцоонд орохгүй.

    Падан бүр хоёр бүртгэл авч явна:
      · `consumed` — (огноо, тоо). ЗӨВХӨН тооцоонд: `_lot_qty_days` ба
        `_lot_segments` үүгээр алхдаг тул хэлбэр нь ХЭВЭЭР үлдэнэ.
      · `takes`    — (аль МӨР хассан, огноо, тоо, заасан эсэх). Тооцоонд
        оролцохгүй, зөвхөн ХАРУУЛАХ (`return_attribution`) зориулалттай.
    """
    defaults = default_rates(contract)
    lots: list[dict] = []
    eats: list[tuple] = []
    for mv in contract.movements:
        if mv.status != "done":
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
                eats.append((key, ln))
    lots.sort(key=lambda l: l["_key"])

    def _eat(lot: dict, day: date, take: float, ln, pinned: bool):
        lot["left"] -= take
        lot["consumed"].append((day, take))
        lot["takes"].append({"line_id": ln.id, "date": day, "qty": take, "pinned": pinned})

    for key, ln in sorted(eats, key=lambda e: e[0]):
        day = key[0]
        remain = ln.qty
        pool = [l for l in lots if l["material_id"] == ln.material_id
                and l["grade_id"] == ln.grade_id and l["date"] <= day]
        # 1) заасан падан — тухайн өдрийн үлдэгдлээс ИЛҮҮГ авахгүй
        if ln.issue_line_id:
            pinned = next((l for l in pool if l["line_id"] == ln.issue_line_id), None)
            if pinned:
                take = min(remain, pinned["left"])
                if take > 0:
                    _eat(pinned, day, take, ln, True)
                    remain -= take
        # 2) үлдсэнийг FIFO — хамгийн хуучин падангаас
        for lot in pool:
            if remain <= 0.0000001:
                break
            take = min(remain, lot["left"])
            if take <= 0:
                continue
            _eat(lot, day, take, ln, False)
            remain -= take

    for lot in lots:
        lot.pop("_key")
        lot["consumed"].sort(key=lambda e: e[0])
    return lots


def return_attribution(contract: models.Contract) -> dict[int, list[dict]]:
    """Буцаалт/актын МӨР бүр АЛЬ падангаас хассаныг буцаана (зөвхөн УНШИНА).

    `{мөрийн id: [{issue_line_id, issue_movement_id, date, rate, qty, pinned}]}`.
    Хамаарлыг ХАДГАЛАХГҮЙ — `_lots`-ийн ЯГ тэр хуваарилалтаас (заасан падан →
    FIFO) уншиж авна, тул дэлгэц дээр харагдах хамаарал нэхэмжлэлийн тоог
    гаргасан хамаарал ХОЁР ӨӨР байх боломжгүй.

    Падангийн дарааллаар (хуучнаас шинэ) — Отгоо «эхлээд хуучнаас хасагдав»
    гэдгийг дээрээс нь доош уншина.
    """
    out: dict[int, list[dict]] = {}
    for lot in _lots(contract):
        for t in lot["takes"]:
            out.setdefault(t["line_id"], []).append(
                {"issue_line_id": lot["line_id"], "issue_movement_id": lot["movement_id"],
                 "date": str(lot["date"]), "rate": lot["rate"],
                 "qty": t["qty"], "pinned": t["pinned"]})
    return out


def _lot_qty_days(lot: dict, d_from: date, d_to: date) -> float:
    """[d_from, d_to) дотор тухайн паданд хэдэн ш×хоног гадаа байсан бэ."""
    start = max(lot["date"], d_from)
    if start >= d_to:
        return 0.0
    q = lot["qty"]
    cur = start
    total = 0.0
    for ed, eq in lot["consumed"]:
        if ed <= start:
            q -= eq
            continue
        seg_end = min(ed, d_to)
        if seg_end > cur:
            total += max(q, 0.0) * (seg_end - cur).days
            cur = seg_end
        q -= eq
        if cur >= d_to:
            break
    if cur < d_to:
        total += max(q, 0.0) * (d_to - cur).days
    return total


def _lot_segments(lot: dict, d_from: date, d_to: date) -> list[tuple[date, date, float]]:
    """[d_from, d_to) дотор тухайн паданг ТОГТМОЛ ТООТОЙ зурвасуудад задална.

    `_lot_qty_days`-ийн ЯГ ИЖИЛ алхалт — ялгаа нь зөвхөн нийлүүлэхийн оронд
    зурвас бүрийг (эхлэл, төгсгөл, тоо) гэж ГАРГАДАГ. Тоо нь 0 буюу сөрөг
    зурвасыг алгасна: `max(q, 0.0)` дор тэдгээр яг 0 нэмдэг тул нийлбэр
    өөрчлөгдөхгүй.

    ТЭНЦЭЛ: sum(q * (b - a).days for a, b, q in _lot_segments(lot, f, t))
            == _lot_qty_days(lot, f, t)
    """
    start = max(lot["date"], d_from)
    if start >= d_to:
        return []
    q = lot["qty"]
    cur = start
    out: list[tuple[date, date, float]] = []
    for ed, eq in lot["consumed"]:
        if ed <= start:
            q -= eq
            continue
        seg_end = min(ed, d_to)
        if seg_end > cur:
            if q > 0:
                out.append((cur, seg_end, max(q, 0.0)))
            cur = seg_end
        q -= eq
        if cur >= d_to:
            break
    if cur < d_to and q > 0:
        out.append((cur, d_to, max(q, 0.0)))
    return out


def lot_qty_on(contract: models.Contract, day: date) -> list[dict]:
    """Өнөөдрийн байдлаар падан бүрийн үлдэгдэл (гэрээний дэлгэрэнгүйд)."""
    out = []
    for lot in _lots(contract):
        if lot["date"] > day:
            continue
        q = lot["qty"] - sum(eq for ed, eq in lot["consumed"] if ed <= day)
        out.append({**lot, "qty_left": max(q, 0.0)})
    return out


def accrue_rent(contract: models.Contract, d_from: date, d_to: date):
    """[d_from, d_to) хоорондох түрээсийн хуримтлал. Буцна: (нийт, мөрийн задаргаа).

    Падан бүрээр явна; задаргааны мөр (material, grade, ТАРИФ)-аар бүлэглэгдэнэ —
    иймд нэг материал өөр өөр тарифтай хоёр мөр болж гарч ирж болно.
    """
    lines: dict[tuple[int, int, float], dict] = {}
    total = 0.0
    for lot in _lots(contract):
        rate = lot["rate"]
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

    Мөр бүр: {material_id, grade_id, rate, qty, days, amount, seg_from, seg_to};
    `days = (seg_to - seg_from).days`, `amount = qty × days × rate`, огноонууд нь
    `date` объект (мөр биш). Эрэмбэ: (material_id, grade_id, rate, seg_from) —
    нэг материалын зурвасууд зэрэгцэж, цаг хугацааны дарааллаар харагдана.

    ТЭНЦЭЛ: sum(мөрийн amount) == accrue_rent(contract, d_from, d_to)[0]

    `accrue_rent`-д ЗОРИУДААР хүрээгүй: тэр нь НЭХЭМЖЛЭХИЙН тулд зурвасуудыг
    (material, grade, тариф)-аар НИЙЛҮҮЛДЭГ, энэ нь ХАВСРАЛТЫН тулд буцааж
    ЗАДАЛДАГ. Хоёр өөр хэрэгцээ — нэг тоон үр дүн.
    """
    out: list[dict] = []
    for lot in _lots(contract):
        rate = lot["rate"]
        if rate <= 0:
            continue
        for seg_from, seg_to, qty in _lot_segments(lot, d_from, d_to):
            days = (seg_to - seg_from).days
            out.append({"material_id": lot["material_id"], "grade_id": lot["grade_id"],
                        "rate": rate, "qty": qty, "days": days,
                        "amount": qty * days * rate,
                        "seg_from": seg_from, "seg_to": seg_to})
    out.sort(key=lambda s: (s["material_id"], s["grade_id"], s["rate"], s["seg_from"]))
    return out


def charges_in(contract: models.Contract, d_from: date, d_to: date):
    """[d_from, d_to) доторх засвар + актын төлбөрүүд."""
    total = 0.0
    items = []
    for mv in contract.movements:
        if mv.status != "done" or not (d_from <= mv.date < d_to):
            continue
        for ln in mv.lines:
            if ln.repair_fee:
                total += ln.repair_fee
                items.append({"date": str(mv.date), "desc": "Засвар", "amount": ln.repair_fee})
            if ln.writeoff_fee:
                total += ln.writeoff_fee
                items.append({"date": str(mv.date), "desc": "Акт", "amount": ln.writeoff_fee})
    return total, items


# ---------- цикл ба нэхэмжлэл ----------

def cycles_of(contract: models.Contract, today: date):
    """Гэрээний бүх дууссан ба одоогийн цикл. [(start, end, complete), ...]"""
    out = []
    n = 0
    while True:
        cs = contract.start_date + timedelta(days=n * contract.cycle_days)
        ce = cs + timedelta(days=contract.cycle_days)
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
    """
    return (cycle_start - contract.start_date).days // contract.cycle_days + 1


def derivable_invoice_specs(contract: models.Contract, today: date | None = None) -> list[dict]:
    """Гэрээний өгөгдлөөс ГАРГАЖ БОЛОХ бүх нэхэмжлэлийн ЦЭВЭР жагсаалт.

    DB-д юу ч бичихгүй — зөвхөн тооцоолно. `ensure_invoices` (нэмэх) ба
    `services/rebuild.py` (дахин үүсгэх) хоёул ЭНЭ ЖАГСААЛТААС ажиллана, тул
    "нэмэгдсэн" ба "дахин бодогдсон" нэхэмжлэл ялгаагүй байхыг баталгаажуулна.

    Мөр бүр: no, cycle_start, cycle_end, due_date, rent_amount, charge_amount,
    vat_amount, total, detail_json — models.Invoice-ийн талбарууд.
    """
    today = today or date.today()
    specs: list[dict] = []
    if contract.type == "sale":
        # мөр бүр өөрийн нэгж үнэтэй; байхгүй бол гэрээний мөрийнхөөр
        prices = default_rates(contract)
        for mv in contract.movements:
            if mv.type != "ISSUE" or mv.status != "done":
                continue
            amount = sum(ln.qty * line_rate(contract, ln, prices) for ln in mv.lines)
            detail = [{"material_id": ln.material_id, "grade_id": ln.grade_id, "qty": ln.qty,
                       "rate": line_rate(contract, ln, prices),
                       "amount": ln.qty * line_rate(contract, ln, prices)} for ln in mv.lines]
            vat = amount * contract.vat_percent / 100
            specs.append({"no": f"S-{contract.no}-{mv.id}", "cycle_start": mv.date,
                          "cycle_end": mv.date, "due_date": mv.date,
                          "rent_amount": amount, "charge_amount": 0.0, "vat_amount": vat,
                          "total": amount + vat, "detail_json": json.dumps(detail)})
        return specs

    for cs, ce, complete in cycles_of(contract, today):
        if not complete:
            continue
        rent, lines = accrue_rent(contract, cs, ce)
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


def ensure_invoices(db: Session, contract: models.Contract, today: date | None = None):
    """Дууссан цикл бүрд нэхэмжлэл автоматаар үүсгэнэ (байхгүй бол).

    ⚠ ЗӨВХӨН НЭМНЭ (append-only) — байгаа нэхэмжлэлд хэзээ ч хүрэхгүй, тул
    олон GET зам дээр давтан дуудагдахад аюулгүй. Дахин бодолт (устгаад дахин
    үүсгэх) нь `services/rebuild.py`-ийн ажил, зөвхөн засварын endpoint-оос.
    """
    today = today or date.today()
    created = []
    existing = {spec_key(contract, i.cycle_start, i.cycle_end, i.no) for i in contract.invoices}
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
    """Одоогийн (дуусаагүй) циклийн хуримтлал — UI-д амьд харуулна."""
    today = today or date.today()
    if contract.type != "rent":
        return None
    cycles = cycles_of(contract, today)
    if not cycles:
        return None
    cs, ce, complete = cycles[-1]
    if complete:
        return None
    rent, _ = accrue_rent(contract, cs, min(today + timedelta(days=1), ce))
    day_sum, _ = accrue_rent(contract, today, today + timedelta(days=1))
    return {"cycle_start": str(cs), "cycle_end": str(ce),
            "days_done": (today - cs).days + 1, "days_total": contract.cycle_days,
            "accrued": rent, "day_amount": day_sum}


def _dotted(d: date) -> str:
    """Циклийн шошгонд хүн уншдаг огноо: 2026-08-15 → 2026.08.15."""
    return str(d).replace("-", ".")


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
            "cycle_label": f"{_dotted(cs)}–{_dotted(ce)}",
            "expected_date": ce, "projected_amount": rent}


# ---------- алданги ба үлдэгдэл ----------

def invoice_outstanding(inv: models.Invoice) -> float:
    return max(inv.total - inv.paid, 0.0)


def invoice_penalty_due(inv: models.Invoice) -> float:
    """БҮРТГЭГДСЭН алдангийн үлдэгдэл — хуваарилалт ЗӨВХӨН үүнийг хааж чадна.

    Амьд (бүртгэгдээгүй) алданги хараахан төлөгдөх боломжгүй: тэр төлбөр
    бүртгэх агшинд `book_penalties`-аар хөлдөж байж мөнгө хүлээж авна.
    """
    return max((inv.penalty_booked or 0.0) - (inv.penalty_paid or 0.0), 0.0)


def _penalty_since(inv: models.Invoice) -> date:
    """Амьд алданги хаанаас хойш бодогдох вэ — хугацаа хэтэрсэн өдөр эсвэл
    хамгийн сүүлд бүртгэсэн өдрөөс (аль хожуу нь)."""
    until = inv.penalty_booked_until
    return until if until and until > inv.due_date else inv.due_date


def invoice_penalty(inv: models.Invoice, today: date | None = None) -> float:
    """Харагдах алданги = БҮРТГЭГДСЭН үлдэгдэл + бүртгэсэн өдрөөс хойшхи АМЬД дүн.

    Хэзээ ч бүртгэгдээгүй нэхэмжлэлд энэ нь хуучин томьёотой ЯГ ижил
    (booked = 0, since = due_date).
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


def book_penalties(db: Session, client_id: int, as_of: date) -> float:
    """Харилцагчийн хэтэрсэн нэхэмжлэлүүдийн алдангийг `as_of` өдрөөр БҮРТГЭНЭ.

    ⚠ АНХААР — ЭНЭ ФУНКЦ БИЧДЭГ. `ensure_invoices`-оос болон ямар ч GET
    (унших) замаас ДУУДАЖ БОЛОХГҮЙ: тэдгээр нь өдөрт олон удаа ажилладаг тул
    алданги хуудас сэргээх бүрд хөлдөж эхэлнэ. Зөвхөн:
      · POST /api/payments (төлбөр бүртгэх агшин, as_of = төлбөрийн огноо)
      · барьцааны тооцоо (settle_deposit)
      · (хожим) нэхэмжлэл дахин үүсгэх replay
    Монотон: `penalty_booked_until` зөвхөн УРАГШ явна (нэмэгдэл 0 байсан ч
    тэмдэглэнэ); `as_of` нь бүртгэсэн өдрөөс хойш байвал юу ч хийхгүй.
    Буцна: нийт нэмэгдсэн алданги.
    """
    invoices = (db.query(models.Invoice).join(models.Contract)
                .filter(models.Contract.client_id == client_id).all())
    added = 0.0
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
        inc = (invoice_outstanding(inv) * inv.contract.penalty_percent / 100
               * (as_of - since).days)
        inv.penalty_booked = (inv.penalty_booked or 0.0) + inc
        inv.penalty_booked_until = as_of
        added += inc
    db.commit()
    return added


def contract_balance(contract: models.Contract, today: date | None = None):
    today = today or date.today()
    outstanding = sum(invoice_outstanding(i) for i in contract.invoices)
    penalty = sum(invoice_penalty(i, today) for i in contract.invoices)
    cur = current_cycle_accrual(contract, today)
    return {"outstanding": outstanding, "penalty": penalty,
            "accruing": cur["accrued"] if cur else 0.0}


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
    q = db.query(models.Invoice).join(models.Contract).filter(
        models.Contract.client_id == payment.client_id)
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

    ⚠ БҮРТГЭГДСЭН АЛДАНГИ ҮЛДЭНЭ. Алданги нь төлбөр бүртгэх агшинд хөлдөж
    (`book_penalties` монотон) бодит болсон — тэр агшин болсон нь үнэн. Цуцлалт
    нь зөвхөн ТӨЛӨГДСӨН гэсэн тэмдгийг (`penalty_paid`) сулруулна, ХӨЛДӨӨЛТИЙГ
    (`penalty_booked`, `penalty_booked_until`) буцаахгүй. Шинжилгээ (H1) энэ
    хялбаршуулалтыг зөвшөөрсөн: буцаах гэвэл монотон загвар нурж, дараагийн
    хөлдөөлт бүр өмнөхөө дахин тоолж эхэлнэ.

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
    """Хөдөлгөөн 'done' болоход нөөцөд тусгана."""
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
    db.commit()


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
    db.commit()


# ---------- мэдэгдэл (амьд тооцоолол) ----------

def pending_shipments(db: Session, scope: str = "all") -> list[models.Movement]:
    """Баталгаажаагүй ачилтууд — `scope` төрлийн гэрээнийх. Мэдэгдэл ба
    дашбоардын самбар ХОЁУЛАА эндээс уншина: нэг жагсаалт хоёр газар өөр
    байвал «3 ачилт хүлээгдэж байна» гэсэн мэдэгдлийн доор 5 мөр гарна."""
    rows = db.query(models.Movement).filter_by(status="pending", type="ISSUE").all()
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
        for inv in c.invoices:
            st = invoice_status(inv, today)
            if st == "overdue":
                pen = invoice_penalty(inv, today)
                days = (today - inv.due_date).days
                notes.append({"kind": "overdue", "level": "danger",
                              "title": f"{c.client.name} — нэхэмжлэл {inv.no} {days} хоног хэтэрлээ",
                              "sub": f"Үлдэгдэл {invoice_outstanding(inv):,.0f}₮ · алданги {pen:,.0f}₮",
                              "contract_id": c.id, "invoice_id": inv.id})
    pending = pending_shipments(db, scope)
    for mv in pending:
        notes.append({"kind": "shipment", "level": "info",
                      "title": f"{mv.contract.client.name} — №{mv.contract.no} ачилт хүлээгдэж байна",
                      "sub": mv.note or f"Огноо {mv.date}",
                      "contract_id": mv.contract_id, "movement_id": mv.id})
    return notes

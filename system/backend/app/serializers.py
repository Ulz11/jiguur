"""Модель → JSON dict хөрвүүлэлтүүд."""
import json
from datetime import date
from . import models
from .services import billing


def grade(g: models.Grade):
    return {"id": g.id, "code": g.code, "name": g.name, "sort": g.sort}


def material(m: models.Material, stocks: list[models.Stock] | None = None):
    d = {"id": m.id, "name": m.name, "category": m.category, "code": m.code,
         "unit": m.unit, "base_rate": m.base_rate, "repair_fee": m.repair_fee,
         "active": m.active,
         "prices": [{"grade_id": p.grade_id, "grade": p.grade.code,
                     "nb_price": p.nb_price, "sale_price": p.sale_price} for p in m.prices]}
    if stocks is not None:
        rows = [s for s in stocks if s.material_id == m.id]
        d["stock"] = [{"grade_id": s.grade_id, "grade": s.grade.code, "on_hand": s.on_hand,
                       "on_rent": s.on_rent, "in_repair": s.in_repair,
                       "written_off": s.written_off} for s in rows]
        d["on_hand_total"] = sum(s.on_hand for s in rows)
        d["on_rent_total"] = sum(s.on_rent for s in rows)
    return d


MOVEMENT_LIMIT = 20


def material_detail(m: models.Material, contracts: list[models.Contract],
                    stocks: list[models.Stock], grades: list[models.Grade],
                    today: date, limit: int = MOVEMENT_LIMIT):
    """Нэг материалын ХУВААРИЛАЛТ — «энэ хэв ХААНА байна вэ?» гэсэн ганц хариу.

    Отгоо агуулахын жагсаалтаас нэг мөр дарахад: агуулахад хэд үлдсэн, гадаа
    хэд байгаа, гадаа байгаа нь ХЭНД (харилцагч, гэрээ, зэрэглэл, тариф,
    хэзээнээс) байгааг нэг дэлгэцээс уншина. Өмнө нь энэ хариуг гаргахын тулд
    гэрээ бүрийг ээлжлэн нээж, толгойдоо нэмдэг байв.

    ХОЁР ӨӨР ЭХ СУРВАЛЖ, ЗӨРӨХ ЁСГҮЙ:
      · агуулахад — нөөцийн хүснэгт (`Stock.on_hand`);
      · гадаа     — гэрээ бүр дээрх ПАДАНГИЙН алхалт (`billing.lot_qty_on`),
                    өөрөөр хэлбэл гэрээний дэлгэрэнгүйн материалын мөр өөрөө.
    Тиймээс энд ШИНЭ тооцоо байхгүй — байгаа хоёр тоог нэг дор эвлүүлж байна.

    НИЙТ ЭЗЭМШИЛ = агуулахад + түрээсэнд + ЗАСВАРТ. Гурав нь бүтэн хуваалт:
    компанийн эзэмшлийн ширхэг бүр яг нэг нүдэнд зогсоно. `reports/materials`-
    ийн `owned` ижил дүрмээр бодогддог — хоёр хуудас нэг тоо хэлнэ. АКТАЛСАН
    нь хуваалтаас ГАДНА (тэр бараа компанийнх байхаа больсон) ч харагдана.
    Худалдсан бараа «гадаа» БИШ (буцаж ирэхгүй) — `contract_row.qty_out`-ийн
    дүрэмтэй ижил. Баталгаажаагүй ачилт үлдэгдэл хөдөлгөхгүй (падан болоогүй)
    ч сүүлийн хөдөлгөөнд ХАРАГДАНА — дарга юу хүлээгдэж байгаагаа мэдэх ёстой.

    ХҮЛЭЭГДЭЖ БУЙ АЧИЛТ ХУВААРИЛАЛТААС Ч НУУГДАХГҮЙ. «Хэнд хэд байна» гэсэн
    хуудас нь баталгаажаагүй ачилтыг бүтнээр нь хасдаг байв: 450ш явахаар
    бэлэн байхад мөр нь зөвхөн доод жагсаалтад (`counted: false`) үлдэж,
    хуваарилалтаас алга болно — тэр барааг агуулахад байгаа гэж уншина.
    Мөр бүр `pending` авч явна; баталгаажсан үлдэгдэлгүй ч ирж буй ачилттай
    гэрээ өөрийн мөртэй (`qty: 0`, `pending > 0`) гарна. Тоо нь ХОЁР ТУСДАА
    талбар: `qty` бол падан, `pending` бол амлалт — нийлүүлбэл аль нь ч
    итгэл хүлээхээ болино (гэрээний дэлгэрэнгүйн «+Nш хүлээгдэж буй» журам).
    """
    gname = {g.id: g.code for g in grades}
    gorder = {g.id: (g.sort, g.code) for g in grades}
    rows = {s.grade_id: s for s in stocks if s.material_id == m.id}

    # ---- ХҮЛЭЭГДЭЖ БУЙ: баталгаажаагүй ачилтууд (гэрээ+зэрэглэлээр) ----
    # Падан болоогүй тул үлдэгдэлд ОРОХГҮЙ — гэхдээ хаашаа явж байгаа нь
    # мэдэгдэх ёстой. Худалдаа энд ч ордоггүй: зарагдсан бараа «гадаа» биш.
    pending_by: dict[tuple[int, int], float] = {}
    pending_since: dict[tuple[int, int], date] = {}
    for c in contracts:
        if c.type != "rent":
            continue
        for mv in c.movements:
            if mv.type != "ISSUE" or mv.status == "done" or mv.voided_at is not None:
                continue
            for ln in mv.lines:
                if ln.material_id != m.id:
                    continue
                key = (c.id, ln.grade_id)
                pending_by[key] = pending_by.get(key, 0.0) + ln.qty
                prev = pending_since.get(key)
                pending_since[key] = mv.date if prev is None else min(prev, mv.date)

    # ---- ГАДАА: гэрээ бүрийн падангийн үлдэгдэл ----
    holdings: list[dict] = []
    out_by_grade: dict[int, float] = {}
    for c in contracts:
        if c.type != "rent":
            continue
        per: dict[int, dict] = {}
        for lot in billing.lot_qty_on(c, today):
            if lot["material_id"] != m.id or lot["qty_left"] <= 0:
                continue
            h = per.get(lot["grade_id"])
            if h is None:
                h = per[lot["grade_id"]] = {"qty": 0.0, "rates": set(),
                                            "since": lot["date"], "lots": 0}
            h["qty"] += lot["qty_left"]
            h["rates"].add(lot["rate"])
            h["since"] = min(h["since"], lot["date"])
            h["lots"] += 1
        for gid, h in per.items():
            out_by_grade[gid] = out_by_grade.get(gid, 0.0) + h["qty"]
            holdings.append({
                "contract_id": c.id, "contract_no": c.no, "status": c.status,
                "client_id": c.client_id, "client": c.client.name,
                "grade_id": gid, "grade": gname.get(gid, "?"),
                "qty": round(h["qty"], 3),
                # Хүлээгдэж буй ачилт нь ТУСДАА тоо — `qty`-д хэзээ ч нийлэхгүй
                "pending": round(pending_by.pop((c.id, gid), 0.0), 3),
                # Нэг гэрээ нэг материалыг ХОЁР өөр тарифаар барьж болно
                # (дундуур нь үнэ солигдвол) — тариф бүр нь өөрийн падантай.
                "rates": sorted(h["rates"]), "lots": h["lots"],
                "since": str(h["since"]), "days": (today - h["since"]).days})

    # Баталгаажсан үлдэгдэлгүй ч ирж буй ачилттай гэрээ — мөрөө АВНА.
    # (`pop` дээрх мөрүүдэд хуваарилагдсан тул энд зөвхөн үлдэгдэлгүй нь үлдэнэ.)
    cmap = {c.id: c for c in contracts}
    for (cid, gid), qty in pending_by.items():
        c = cmap[cid]
        since = pending_since[(cid, gid)]
        holdings.append({
            "contract_id": c.id, "contract_no": c.no, "status": c.status,
            "client_id": c.client_id, "client": c.client.name,
            "grade_id": gid, "grade": gname.get(gid, "?"),
            "qty": 0.0, "pending": round(qty, 3),
            # Тариф нь падан үүсэх ҮЕДЭЭ тогтдог — хараахан падан алга
            "rates": [], "lots": 0,
            "since": str(since), "days": (today - since).days})
    holdings.sort(key=lambda h: (gorder.get(h["grade_id"], (99, "")), -h["qty"], h["client"]))

    # ---- ЗЭРЭГЛЭЛ бүрийн эзэмшил ----
    per_grade = []
    for gid in sorted(set(rows) | set(out_by_grade), key=lambda g: gorder.get(g, (99, ""))):
        st = rows.get(gid)
        on_hand = st.on_hand if st else 0.0
        out = round(out_by_grade.get(gid, 0.0), 3)
        in_repair = st.in_repair if st else 0.0
        per_grade.append({"grade_id": gid, "grade": gname.get(gid, "?"),
                          "on_hand": on_hand, "out": out,
                          "in_repair": in_repair,
                          "written_off": st.written_off if st else 0.0,
                          # ЭЗЭМШИЛ = агуулахад + түрээсэнд + ЗАСВАРТ. Засварт
                          # байгаа бараа компанийнх хэвээр, зүгээр л түр
                          # ашиглагдахгүй байна — хуваалтаас гаргавал эзэмшил
                          # хаашаа ч хамаарахгүй алга болно. Акталсан нь ХАРИН
                          # ГАДНА: тэр бараа компанийнх байхаа больсон.
                          # `reports/materials`-ийн `owned` яг ийм бодогддог.
                          "total": round(on_hand + out + in_repair, 3)})

    # ---- Сүүлийн хөдөлгөөн (бүх гэрээг дамнасан) ----
    moves = []
    for c in contracts:
        for mv in c.movements:
            for ln in mv.lines:
                if ln.material_id != m.id:
                    continue
                sign = 1 if mv.type == "ISSUE" else -1
                moves.append({
                    "id": ln.id, "movement_id": mv.id, "type": mv.type,
                    "date": str(mv.date), "status": mv.status,
                    "counted": billing.movement_active(mv), "note": mv.note,
                    "voided": mv.voided_at is not None,
                    "void_reason": mv.void_reason or "",
                    "contract_id": c.id, "contract_no": c.no, "contract_type": c.type,
                    "client_id": c.client_id, "client": c.client.name,
                    "grade_id": ln.grade_id, "grade": gname.get(ln.grade_id, "?"),
                    "qty": ln.qty, "delta": sign * ln.qty,
                    "return_grade": gname.get(ln.return_grade_id) if ln.return_grade_id else None,
                    "repair_qty": ln.repair_qty, "writeoff_qty": ln.writeoff_qty,
                    "_key": (mv.date, mv.id, ln.id or 0)})
    moves.sort(key=lambda r: r["_key"], reverse=True)
    total_moves = len(moves)
    moves = moves[:limit]
    for r in moves:
        r.pop("_key")

    on_hand_total = sum(g["on_hand"] for g in per_grade)
    out_total = sum(g["out"] for g in per_grade)
    repair_total = sum(g["in_repair"] for g in per_grade)
    return {"id": m.id, "name": m.name, "category": m.category, "code": m.code,
            "unit": m.unit, "base_rate": m.base_rate, "repair_fee": m.repair_fee,
            "active": m.active,
            "grades": per_grade,
            "totals": {"on_hand": round(on_hand_total, 3), "out": round(out_total, 3),
                       "in_repair": repair_total,
                       "written_off": sum(g["written_off"] for g in per_grade),
                       "total": round(on_hand_total + out_total + repair_total, 3),
                       # Хуваалтаас ГАДНА: хараахан хөдлөөгүй, зөвхөн ирж байгаа
                       "pending": round(sum(h["pending"] for h in holdings), 3),
                       "contracts": len({h["contract_id"] for h in holdings}),
                       "clients": len({h["client_id"] for h in holdings})},
            "holdings": holdings,
            "movements": moves, "movements_total": total_moves}


def client_row(c: models.Client, today: date):
    """Харилцагчийн мөр — жагсаалт, профайл, дашбоардын хуваарь ЭНДЭЭС уншина.

    Авлагын тоо нь `billing.client_receivable`-ээс шууд гарна: НЭГ
    тодорхойлолт, бүх дэлгэцэд (H9b). Задаргаа нь дагалдана — дэлгэц
    «үүнээс нэхэмжлэгдээгүй: X₮» гэсэн дэд мөр гаргаж чадна.
    """
    r = billing.client_receivable(c, today)
    rv = billing.receivable_display(r["total"], r["invoiced"])
    return {"id": c.id, "name": c.name, "reg": c.reg, "person": c.person,
            "phone": c.phone, "note": c.note, "active_contracts": r["active_contracts"],
            "receivable": rv["total"],
            # НИЙТ дүн нь ганц; БҮРЭЛДЭХҮҮН нь харагдаж болно.
            "receivable_invoiced": rv["invoiced"],
            "receivable_uninvoiced": rv["uninvoiced"],
            "penalty": round(r["penalty"]),
            # НЭХЭГДСЭН нь мөнгө, НЭХЭГДЭЭГҮЙ нь хөшүүрэг — хоёрыг нэг тоо
            # болгож нийлүүлбэл «машин өр зохиов» гэж уншигдана (H2).
            "penalty_booked": round(r["penalty_booked"]),
            "penalty_unbooked": round(r["penalty_unbooked"]),
            "deposit": r["deposit"], "overdue": r["overdue"]}


def contract_row(c: models.Contract, today: date):
    b = billing.contract_balance(c, today)
    cur = billing.current_cycle_accrual(c, today)
    overdue = any(billing.invoice_status(i, today) == "overdue"
                  for i in billing.live_invoices(c))
    ending = (c.end_date is not None and c.status == "active"
              and 0 <= (c.end_date - today).days <= 7)
    state = ("closed" if c.status == "closed"
             else "opening" if c.no.startswith("OB-")
             else "overdue" if overdue else "ending" if ending else "active")
    # Гадаа байгаа тоо — зөвхөн ТҮРЭЭС дээр утгатай (худалдсан бараа буцаж
    # ирэхгүй). Дарга буцаалт хүлээж буй гэрээгээ үүгээр л ялгаж хардаг.
    qty_out = (round(sum(l["qty_left"] for l in billing.lot_qty_on(c, today)), 3)
               if c.type == "rent" else 0)
    return {"id": c.id, "no": c.no, "client_id": c.client_id, "client": c.client.name,
            "qty_out": qty_out,
            "type": c.type, "start_date": str(c.start_date),
            "end_date": str(c.end_date) if c.end_date else None,
            "deposit": c.deposit, "penalty_percent": c.penalty_percent,
            "deposit_status": c.deposit_status, "deposit_applied": c.deposit_applied,
            "deposit_returned": c.deposit_returned,
            "deposit_settled_date": str(c.deposit_settled_date) if c.deposit_settled_date else None,
            "state": state, "status": c.status,
            # ТООЦООНЫ МӨЧЛӨГ (R5 / H3) — «days» эсвэл «month». ЖАГСААЛТАД ч
            # хэрэгтэй: календарь горим нь нэхэмжлэлийн огноо, циклийн уртыг
            # (31 хоногийн сар) хоёуланг өөрчилдөг тул «аль харилцагч сараар
            # тооцогддог вэ» гэдэг гэрээ бүрийг НЭЭЛГҮЙГЭЭР харагдана.
            "cycle_mode": billing.cycle_mode(c),
            # ХААСАН ӨДӨР (H7) — эцсийн тасархай циклийн төгсгөлийг тодорхойлно
            "closed_date": str(c.closed_date) if getattr(c, "closed_date", None) else None,
            "balance": round(b["outstanding"] + b["accruing"]),
            "penalty": round(b["penalty"]),
            "penalty_booked": round(b["penalty_booked"]),
            "penalty_unbooked": round(b["penalty_unbooked"]),
            "day_amount": round(cur["day_amount"]) if cur else 0,
            "cycle": cur, "note": c.note}


def upcoming_row(c: models.Contract, today: date):
    """Гэрээний ХҮЛЭЭГДЭЖ БУЙ төлбөрийн мөр — байхгүй бол None.

    Дашбоардын самбар ба харилцагчийн профайл ХОЁУЛАА эндээс уншина: нэг гэрээ
    хоёр дэлгэц дээр өөр дүн хэлбэл аль нь ч итгэл хүлээхээ болино.
    ⚠ Энэ бол ТӨСӨӨЛӨЛ — нэхэмжлэгдсэн баримт БИШ. UI-д ил тэмдэглэгдэнэ.
    """
    up = billing.upcoming_payment(c, today)
    if not up:
        return None
    return {"contract_id": c.id, "contract_no": c.no,
            "client_id": c.client_id, "client": c.client.name,
            "cycle_start": str(up["cycle_start"]), "cycle_end": str(up["cycle_end"]),
            "cycle_label": up["cycle_label"],
            "expected_date": str(up["expected_date"]),
            "projected_amount": round(up["projected_amount"])}


def movement(mv: models.Movement, gmap: dict, mmap: dict):
    """Хөдөлгөөний мөр. ХҮЧИНГҮЙ болсон нь ч ЭНД гарна — цуцлалт бол устгал БИШ:
    түүхэн дэх мөр нь тэмдэгтэйгээ үлдэж, зөвхөн тооцооноос гарна."""
    return {"id": mv.id, "type": mv.type, "date": str(mv.date), "note": mv.note,
            # ТАЛБАЙ (№88, 97) — хоосон бол хоосон мөр, NULL БИШ
            "site": mv.site or "",
            "status": mv.status,
            "voided": mv.voided_at is not None,
            "void_reason": mv.void_reason or "",
            "voided_by": mv.voided_by or "",
            "voided_at": str(mv.voided_at)[:19] if mv.voided_at else None,
            "lines": [{"id": l.id,
                       "material_id": l.material_id, "material": mmap.get(l.material_id, "?"),
                       "grade_id": l.grade_id, "grade": gmap.get(l.grade_id, "?"),
                       "qty": l.qty, "rate": l.rate,
                       # Падан-заалт ба буцаж ирсэн зэрэглэлийн ID — засварын
                       # сонгогчид хэрэгтэй (мөнгө биш, тул даргад ч үлдэнэ).
                       "issue_line_id": l.issue_line_id,
                       "return_grade_id": l.return_grade_id,
                       "return_grade": gmap.get(l.return_grade_id) if l.return_grade_id else None,
                       "repair_qty": l.repair_qty, "repair_fee": l.repair_fee,
                       "writeoff_qty": l.writeoff_qty, "writeoff_fee": l.writeoff_fee,
                       # ХУДАЛДАА БОЛГОВ (H7) — SALE мөрийн дүн (мөнгө: `_F_LINE`)
                       "sale_fee": l.sale_fee}
                      for l in mv.lines]}


def material_lines(c: models.Contract, gmap: dict, mmap: dict, today: date):
    """Материал (+зэрэглэл) бүрийн ХӨДӨЛГӨӨНИЙ ДЭВТЭР — зөвхөн УНШИНА.

    Гэрээний дэлгэрэнгүйд материалын мөр задарч гарах мөрүүд: юу гарсан
    (падан: огноо, тоо, ТАРИФ), юу буцсан (огноо, тоо, АЛЬ падангаас) —
    Отгоогийн Numbers дэвтрийн «материалын доорх түүх» яг тэр дараалалд.

    Мөр бүр `delta` (тэмдэгтэй тоо) ба `counted` (тооцоонд орох эсэх) авч явна:
    үлдэгдлийг ТООЦООЛОХ ганц дүрэм — `counted` мөрүүдийн `delta`-гийн нийлбэр.
    Хүлээгдэж буй ачилт ХАРАГДАНА (Отгоо хүлээж байгаагаа мэдэх ёстой) ч
    `counted=False` — хөдөлгүүр түүнийг тооцдоггүйтэй яг адил.

    ТЭНЦЭЛ: sum(delta for counted) == held == материалын мөрүүдийн тооны нийлбэр.
    """
    attribution = billing.return_attribution(c)
    defaults = billing.default_rates(c)
    order = {(it.material_id, it.grade_id): i for i, it in enumerate(c.items)}

    held: dict[tuple[int, int], float] = {}
    for lot in billing.lot_qty_on(c, today):
        key = (lot["material_id"], lot["grade_id"])
        held[key] = held.get(key, 0.0) + lot["qty_left"]

    groups: dict[tuple[int, int], dict] = {}

    def group(material_id: int, grade_id: int) -> dict:
        key = (material_id, grade_id)
        g = groups.get(key)
        if g is None:
            g = groups[key] = {"material_id": material_id, "material": mmap.get(material_id, "?"),
                               "grade_id": grade_id, "grade": gmap.get(grade_id, "?"),
                               "held": round(held.get(key, 0.0), 3), "lines": []}
        return g

    # Огт хөдлөөгүй гэрээний мөр ч дэвтэртэй — хүснэгтийн мөр бүр задардаг байна
    for it in c.items:
        group(it.material_id, it.grade_id)

    for mv in c.movements:
        for ln in mv.lines:
            sign = 1 if mv.type == "ISSUE" else -1
            group(ln.material_id, ln.grade_id)["lines"].append({
                "id": ln.id, "movement_id": mv.id, "type": mv.type,
                "date": str(mv.date), "status": mv.status, "note": mv.note,
                # Талбай нь МӨРӨӨРӨӨ явна: гэрээний доторх задаргаа
                # (2,044 технологи · 326 архангай · 1,924 дарь эх) эндээс гарна
                "site": mv.site or "",
                "qty": ln.qty, "delta": sign * ln.qty,
                # Цуцлагдсан мөр ХАРАГДАНА, гэхдээ `counted: False` — хүлээгдэж
                # буй ачилттай яг ижил журам, тул тэнцэл хэвээр:
                # sum(delta for counted) == held.
                "counted": billing.movement_active(mv),
                "voided": mv.voided_at is not None,
                "void_reason": mv.void_reason or "",
                # Тариф нь ӨНӨӨДРИЙН ХҮЧИНТЭЙ утга (`resolve_rate`-ийн заам) —
                # дээрх материалын мөртэй ЯГ нэг тоо. Хоёр нь зөрвөл «аль нь
                # үнэн бэ» гэсэн асуулт дэвтэр дээрээ төрнө (R3 / H6).
                "rate": (billing.line_rate(c, ln, defaults, on=today)
                         if mv.type == "ISSUE" else None),
                "sources": attribution.get(ln.id, []) if mv.type != "ISSUE" else None,
                "return_grade": gmap.get(ln.return_grade_id) if ln.return_grade_id else None,
                # ГАР ХОНОГ (H5) — `None` бол машины тоо. Дэвтэрт зөрүүний
                # тэмдэг («13 хоног · гараар — системээр 12») эндээс гарна;
                # хоногийн тоонууд өөрсдөө `sources`-д мөр мөрөөр нь ирнэ.
                "billed_days_override": ln.billed_days_override,
                # ТЭР ХАРААД БАТАЛСАН эсэх: тамгатай тоог хөдөлгүүр хумихгүй
                # тул дэлгэц дээр ч «системээр N» нь ЗӨВЛӨМЖ болж уншигдана.
                "days_confirmed": bool(ln.days_confirmed),
                "repair_qty": ln.repair_qty, "repair_fee": ln.repair_fee,
                "writeoff_qty": ln.writeoff_qty, "writeoff_fee": ln.writeoff_fee,
                "sale_fee": ln.sale_fee,
                "_key": (mv.date, mv.id, ln.id or 0)})

    out = []
    for g in sorted(groups.values(),
                    key=lambda g: (order.get((g["material_id"], g["grade_id"]), 999),
                                   g["material"], g["grade"])):
        g["lines"].sort(key=lambda ln: ln["_key"])
        for ln in g["lines"]:
            ln.pop("_key")
        out.append(g)
    return out


def shipment_summary(mv: models.Movement, limit: int = 4) -> str:
    """Ачилтын мөрүүдийн нэг мөрт багтах хураангуй — ЮУГ, ямар зэрэглэлээр, хэдийг.

    Дарга дашбоардын мөрөн дээрээс шууд уншиж «Ачсан ✓» дарна. Зөвхөн тоо
    ширхэг (×450) бол утгагүй: 450 нь хэв үү, труба уу гэдэг нь мэдэгдэхгүй.
    4-өөс олон мөртэй ачилт нь мөрөө сунгахгүй — үлдсэнийг тоогоор нь хэлнэ.
    """
    parts = [f"{l.material.name} ({l.grade.code}) ×{l.qty:g}" for l in mv.lines[:limit]]
    rest = len(mv.lines) - limit
    if rest > 0:
        parts.append(f"… +{rest} мөр")
    return " · ".join(parts)


def invoice(inv: models.Invoice, today: date):
    return {"id": inv.id, "no": inv.no, "contract_id": inv.contract_id,
            "contract_no": inv.contract.no, "client": inv.contract.client.name,
            "client_id": inv.contract.client_id,
            "cycle_start": str(inv.cycle_start), "cycle_end": str(inv.cycle_end),
            "due_date": str(inv.due_date),
            "rent_amount": round(inv.rent_amount), "charge_amount": round(inv.charge_amount),
            "vat_amount": round(inv.vat_amount), "total": round(inv.total),
            "paid": round(inv.paid),
            "outstanding": round(billing.invoice_outstanding(inv)),
            "penalty": round(billing.invoice_penalty(inv, today)),      # нэхэгдсэн + тооцоолол
            "penalty_due": round(billing.invoice_penalty_due(inv)),     # НЭХЭГДСЭН — төлж болно
            # НЭХЭГДЭЭГҮЙ тооцоолол: зөвхөн мэдээлэл, төлбөр үүнийг хааж чадахгүй
            "penalty_unbooked": round(billing.invoice_penalty_unbooked(inv, today)),
            # Нэхэлтийн баримт («Y хоног») FRONTEND дээр дурын `as_of`-оор
            # дахин бодогдоно — тэр бодолтын эхлэл цэг нь энэ огноо.
            "penalty_since": str(billing._penalty_since(inv)),
            "status": billing.invoice_status(inv, today),
            # ХҮЧИНГҮЙ — гараар үүсгэсэн (`A-`) нэхэмжлэл дээр л утгатай (H1):
            # мөр нь ХАРАГДСААР үлдэж, тооцооноос л гарна.
            "voided": inv.voided_at is not None,
            "void_reason": inv.void_reason or "",
            "voided_by": inv.voided_by or "",
            "voided_at": str(inv.voided_at)[:19] if inv.voided_at else None,
            # ХАМТАРСАН ГАРЫН ҮСГИЙН ТӨЛӨВ (№69) — «энэ тоог хоёр тал баталсан»
            "agreed_at": str(inv.agreed_at) if inv.agreed_at else None,
            "agreed_by": inv.agreed_by or "",
            "detail": json.loads(inv.detail_json or "[]")}


def akt_entry(a: models.AktEntry):
    """Чөлөөт актын бичилт (R12 / H4) — мөр нь ХААШАА буусныг өөрөө хэлнэ.

    `cycle_start`/`cycle_end` нь СЕРВЕР талын цонх: жагсаалт дээр «энэ мөр аль
    циклд нэхэгдэх вэ» гэдгийг Отгоо тааварлах ёсгүй. Гэрээний эхлэлээс өмнөх
    огноо (цикл эхлээгүй) бол хоосон.

    ХҮЧИНГҮЙ болсон нь ч ЭНД гарна — цуцлалт бол устгал БИШ (H1).
    """
    win = billing.cycle_of(a.contract, a.date) if a.contract else None
    return {"id": a.id, "contract_id": a.contract_id, "date": str(a.date),
            "amount": a.amount, "note": a.note or "",
            "cycle_start": str(win[0]) if win else None,
            "cycle_end": str(win[1]) if win else None,
            "created_at": str(a.created_at)[:19] if a.created_at else None,
            "voided": a.voided_at is not None,
            "void_reason": a.void_reason or "",
            "voided_by": a.voided_by or "",
            "voided_at": str(a.voided_at)[:19] if a.voided_at else None}


def rate_change(rc, gmap: dict | None = None, mmap: dict | None = None):
    """Тарифын дахин тохиролт (R3 / H6) — «330₮ → 350₮ 2026-04-19-ээс».

    `old_rate` нь ПАДАНГИЙН ҮЕИЙГ заана; NULL бол тухайн материал+зэрэглэлийн
    БҮГД («бүх тарифаас») — жагсаалтад тэмдэглэгдэнэ.

    ХҮЧИНГҮЙ болсон нь ч ЭНД гарна — цуцлалт бол устгал БИШ (H1).
    """
    return {"id": rc.id, "contract_id": rc.contract_id,
            "material_id": rc.material_id, "material": (mmap or {}).get(rc.material_id, ""),
            "grade_id": rc.grade_id, "grade": (gmap or {}).get(rc.grade_id, ""),
            "old_rate": rc.old_rate, "new_rate": rc.new_rate,
            "effective_from": str(rc.effective_from), "note": rc.note or "",
            "created_at": str(rc.created_at)[:19] if rc.created_at else None,
            "voided": rc.voided_at is not None,
            "void_reason": rc.void_reason or "",
            "voided_by": rc.voided_by or "",
            "voided_at": str(rc.voided_at)[:19] if rc.voided_at else None}


def penalty_charge(pc: models.PenaltyCharge):
    """Алданги НЭХСЭН явдал (R25 / H2) — «2026-08-31 өдрөөр 49,500₮ нэхэв».

    Мөр нь ТҮЛХЭЦийг хадгална, `amount` нь баримт (rebuild огноогоор нь ДАХИН
    нэхдэг тул хөлдсөн дүн биш). Урьд нь энэ хүснэгт БИЧИГДЭЭД ХЭЗЭЭ Ч
    ХАРАГДДАГГҮЙ байв — гаргасан шийдвэрүүд нь дэлгэцэн дээр байхгүй.

    ХҮЧИНГҮЙ болсон нь ч ЭНД гарна — цуцлалт бол устгал БИШ (H1).
    """
    return {"id": pc.id, "contract_id": pc.contract_id, "client_id": pc.client_id,
            "as_of": str(pc.as_of), "amount": pc.amount,
            "user_name": pc.user_name or "",
            "created_at": str(pc.created_at)[:19] if pc.created_at else None,
            "voided": pc.voided_at is not None,
            "void_reason": pc.void_reason or "",
            "voided_by": pc.voided_by or "",
            "voided_at": str(pc.voided_at)[:19] if pc.voided_at else None}


def payment(p: models.Payment):
    """Төлбөрийн мөр. ХҮЧИНГҮЙ болсон нь ч ЭНД гарна — цуцлалт бол устгал БИШ.

    `allocations` нь цуцлах цонхны баримтад ХЭРЭГТЭЙ: «энэ мөнгө аль
    нэхэмжлэлээс суларна» гэдгийг Отгоо дарахаасаа ӨМНӨ уншина.
    """
    return {"id": p.id, "client_id": p.client_id, "client": p.client.name,
            "contract_id": p.contract_id,
            "contract_no": p.contract.no if p.contract else None,
            "date": str(p.date), "amount": p.amount, "method": p.method,
            "barter_desc": p.barter_desc, "note": p.note,
            "voided": p.voided_at is not None,
            "void_reason": p.void_reason or "",
            "voided_by": p.voided_by or "",
            "voided_at": str(p.voided_at)[:19] if p.voided_at else None,
            "allocations": [{"invoice_id": a.invoice_id, "invoice_no": a.invoice.no,
                             "amount": a.amount, "part": a.part}
                            for a in p.allocations]}


def attachment(a: models.Attachment):
    return {"id": a.id, "filename": a.filename, "size": a.size,
            "uploaded_at": str(a.uploaded_at)[:16],
            "entity_type": a.entity_type, "entity_id": a.entity_id}


# ---------- Мөнгөний хана: УСТСАН (2026-09, эзэний шийдвэр) ----------
#
# Энд `factory_contract_detail` гэдэг шүүлтүүр байсан: гэрээний дэлгэрэнгүйн
# хариунаас үйлдвэрийн даргын хувьд үлдэгдэл, алданги, барьцаа, НӨАТ,
# нэхэмжлэл, төлбөр, тариф, өдрийн дүн БҮГДИЙГ хасдаг байв.
#
# ЭЗЭН: «энэ бол ЭМХ ЦЭГЦНИЙ асуудал, нууцлалынх биш. Дарга санхүүгийн
# талаар асуухад хариулж чаддаг байх ЁСТОЙ — зүгээр цэгцтэй байг».
#
# Хана нь ЯГ ТҮҮНИЙГ болиулж байсан: даргаас асуухад тэр хариулах ЮМГҮЙ
# байв. Тиймээс сервер нь бүх рольд ИЖИЛ хариу өгнө; эмх цэгц нь
# ХАРАГДАЦЫН ажил болов — даргын дэлгэц дээр мөнгө нь ажлынх нь агуулгын
# ХОЙНО, НЭГ хэлбэрийн, ХУМИГДСАН «Санхүү» задаргаа дотор зогсоно
# (`ui.tsx` `FinanceDisclosure`).
#
# ⚠ Дахин хана босгох бол ЭНД биш: эрх (үйлдэл) ба харагдац (эмх цэгц) хоёр
# өөр асуулт. Одоогийн эрхийн зураас нь router-үүдийн `require_roles` дээр
# хэвээр — дарга мөнгө ХӨДӨЛГӨХГҮЙ (төлбөр, акт, алданги, нэхэмжлэл).

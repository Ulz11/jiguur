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
    outstanding = penalty = booked = deposit = 0.0
    active = 0
    for ct in c.contracts:
        b = billing.contract_balance(ct, today)
        outstanding += b["outstanding"] + b["accruing"]
        penalty += b["penalty"]
        booked += b["penalty_booked"]
        deposit += ct.deposit
        if ct.status == "active":
            active += 1
    overdue = any(billing.invoice_status(i, today) == "overdue"
                  for ct in c.contracts for i in ct.invoices)
    return {"id": c.id, "name": c.name, "reg": c.reg, "person": c.person,
            "phone": c.phone, "note": c.note, "active_contracts": active,
            "receivable": round(outstanding), "penalty": round(penalty),
            # НЭХЭГДСЭН нь мөнгө, НЭХЭГДЭЭГҮЙ нь хөшүүрэг — хоёрыг нэг тоо
            # болгож нийлүүлбэл «машин өр зохиов» гэж уншигдана (H2).
            "penalty_booked": round(booked),
            "penalty_unbooked": round(max(penalty - booked, 0.0)),
            "deposit": deposit, "overdue": overdue}


def contract_row(c: models.Contract, today: date):
    b = billing.contract_balance(c, today)
    cur = billing.current_cycle_accrual(c, today)
    overdue = any(billing.invoice_status(i, today) == "overdue" for i in c.invoices)
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
                       "writeoff_qty": l.writeoff_qty, "writeoff_fee": l.writeoff_fee}
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
                "qty": ln.qty, "delta": sign * ln.qty,
                # Цуцлагдсан мөр ХАРАГДАНА, гэхдээ `counted: False` — хүлээгдэж
                # буй ачилттай яг ижил журам, тул тэнцэл хэвээр:
                # sum(delta for counted) == held.
                "counted": billing.movement_active(mv),
                "voided": mv.voided_at is not None,
                "void_reason": mv.void_reason or "",
                "rate": billing.line_rate(c, ln, defaults) if mv.type == "ISSUE" else None,
                "sources": attribution.get(ln.id, []) if mv.type != "ISSUE" else None,
                "return_grade": gmap.get(ln.return_grade_id) if ln.return_grade_id else None,
                "repair_qty": ln.repair_qty, "repair_fee": ln.repair_fee,
                "writeoff_qty": ln.writeoff_qty, "writeoff_fee": ln.writeoff_fee,
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


# ---------- Мөнгөний хана: гэрээний дэлгэрэнгүй → ҮЙЛДВЭРИЙН ДАРГА ----------
#
# «Системийн зураглал» §4-т даргын хүрээ нь тодорхой: ТООЛНО, ЗЭРЭГЛЭЛ
# ТОГТООНО. Үнэ, авлага, нэхэмжлэл нь Отгоо, санхүүчийнх.
#
# Зөвхөн дэлгэц дээр нуух нь (ContractDetail `seesMoney`) НУУСАН БОЛОВ гэсэн үг
# биш байв: тариф, өдрийн дүн, хуримтлал, нэхэмжлэл бүгд даргын ТОКЕН руу
# явсаар байсан. Тиймээс зураас нь ЭНД — серверийн хариунд — татагдана.
#
# Талбарыг 0 болгохгүй, БҮРМӨСӨН хасна: «0₮-ийн гэрээ» гэж уншигдах эрсдэлгүй,
# мөн нэмэгдэх шинэ талбар өөрөө нэвтрэхгүй (жагсаалтад орох хүртэл).
_F_TOP = ("balance", "penalty", "penalty_booked", "penalty_unbooked",
          "penalty_percent", "day_amount", "deposit",
          "deposit_status", "deposit_applied", "deposit_returned",
          "deposit_settled_date", "vat_percent")
# Актын бичилт нь МӨНГӨ (±дүн) — бүхэл бүлгээрээ санхүүгийнх
_F_BLOCKS = ("invoices", "payments", "akt_entries")
_F_ITEM = ("daily_rate", "unit_price", "day_amount", "repair_fee", "writeoff_price")
# Хөдөлгөөний/дэвтрийн мөр: падангийн ТАРИФ, засвар/актын ДҮН явахгүй.
# `repair_qty`, `writeoff_qty` нь ТОО — тэр бол даргын ажил, үлдэнэ.
_F_LINE = ("rate", "repair_fee", "writeoff_fee")
_F_CYCLE = ("accrued", "day_amount")


def _without(d: dict, keys) -> dict:
    return {k: v for k, v in d.items() if k not in keys}


def factory_contract_detail(payload: dict) -> dict:
    """`contract_detail`-ийн хариунаас мөнгө агуулсан БҮХ талбарыг хасна.

    Үлдэх нь: тоо ширхэг, зэрэглэл, огноо, төлөв, хөдөлгөөний түүх, материал
    бүрийн дэвтэр (аль падангаас хэд буцсан нь ХАМААРАЛ — тоо, дугаар нь
    даргын ажил, тариф нь биш) ба циклийн хугацааны явц.
    """
    out = _without(payload, _F_TOP + _F_BLOCKS)

    if isinstance(out.get("cycle"), dict):
        out["cycle"] = _without(out["cycle"], _F_CYCLE)

    out["items"] = [_without(it, _F_ITEM) for it in payload.get("items") or []]

    out["movements"] = [{**mv, "lines": [_without(l, _F_LINE) for l in mv["lines"]]}
                        for mv in payload.get("movements") or []]

    groups = []
    for g in payload.get("material_lines") or []:
        lines = []
        for ln in g["lines"]:
            row = _without(ln, _F_LINE)
            if row.get("sources"):
                row["sources"] = [_without(s, _F_LINE) for s in row["sources"]]
            lines.append(row)
        groups.append({**g, "lines": lines})
    out["material_lines"] = groups
    return out

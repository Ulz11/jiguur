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


def client_row(c: models.Client, today: date):
    outstanding = penalty = deposit = 0.0
    active = 0
    for ct in c.contracts:
        b = billing.contract_balance(ct, today)
        outstanding += b["outstanding"] + b["accruing"]
        penalty += b["penalty"]
        deposit += ct.deposit
        if ct.status == "active":
            active += 1
    overdue = any(billing.invoice_status(i, today) == "overdue"
                  for ct in c.contracts for i in ct.invoices)
    return {"id": c.id, "name": c.name, "reg": c.reg, "person": c.person,
            "phone": c.phone, "note": c.note, "active_contracts": active,
            "receivable": round(outstanding), "penalty": round(penalty),
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
    return {"id": mv.id, "type": mv.type, "date": str(mv.date), "note": mv.note,
            "status": mv.status,
            "lines": [{"id": l.id,
                       "material_id": l.material_id, "material": mmap.get(l.material_id, "?"),
                       "grade_id": l.grade_id, "grade": gmap.get(l.grade_id, "?"),
                       "qty": l.qty, "rate": l.rate,
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
                "counted": mv.status == "done",
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
            "penalty": round(billing.invoice_penalty(inv, today)),      # бүртгэгдсэн + амьд
            "penalty_due": round(billing.invoice_penalty_due(inv)),     # бүртгэгдсэн — төлж болно
            "status": billing.invoice_status(inv, today),
            "detail": json.loads(inv.detail_json or "[]")}


def payment(p: models.Payment):
    return {"id": p.id, "client_id": p.client_id, "client": p.client.name,
            "contract_id": p.contract_id,
            "contract_no": p.contract.no if p.contract else None,
            "date": str(p.date), "amount": p.amount, "method": p.method,
            "barter_desc": p.barter_desc, "note": p.note}


def attachment(a: models.Attachment):
    return {"id": a.id, "filename": a.filename, "size": a.size,
            "uploaded_at": str(a.uploaded_at)[:16],
            "entity_type": a.entity_type, "entity_id": a.entity_id}

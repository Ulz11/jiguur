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
    return {"id": c.id, "no": c.no, "client_id": c.client_id, "client": c.client.name,
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


def movement(mv: models.Movement, gmap: dict, mmap: dict):
    return {"id": mv.id, "type": mv.type, "date": str(mv.date), "note": mv.note,
            "status": mv.status,
            "lines": [{"material_id": l.material_id, "material": mmap.get(l.material_id, "?"),
                       "grade_id": l.grade_id, "grade": gmap.get(l.grade_id, "?"),
                       "qty": l.qty,
                       "return_grade": gmap.get(l.return_grade_id) if l.return_grade_id else None,
                       "repair_qty": l.repair_qty, "repair_fee": l.repair_fee,
                       "writeoff_qty": l.writeoff_qty, "writeoff_fee": l.writeoff_fee}
                      for l in mv.lines]}


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
            "penalty": round(billing.invoice_penalty(inv, today)),
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

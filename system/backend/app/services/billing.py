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
from datetime import date, timedelta
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


def accrue_rent(contract: models.Contract, d_from: date, d_to: date):
    """[d_from, d_to) хоорондох түрээсийн хуримтлал. Буцна: (нийт, мөрийн задаргаа)."""
    rates = rate_map(contract)
    deltas = _deltas(contract)
    lines: dict[tuple[int, int], dict] = {}
    total = 0.0
    for key, changes in deltas.items():
        rate = rates.get(key, 0.0)
        if rate <= 0:
            continue
        # өдөр бүрийн qty — өөрчлөлтийн цэгүүдээр сегментчилж тоолно
        day = d_from
        qty_days = 0.0
        while day < d_to:
            q = 0.0
            for cd, dq in changes:
                if cd <= day:
                    q += dq
            q = max(q, 0.0)
            qty_days += q
            day += timedelta(days=1)
        amt = qty_days * rate
        if qty_days > 0:
            lines[key] = {"material_id": key[0], "grade_id": key[1],
                          "qty_days": qty_days, "rate": rate, "amount": amt}
            total += amt
    return total, list(lines.values())


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


def ensure_invoices(db: Session, contract: models.Contract, today: date | None = None):
    """Дууссан цикл бүрд нэхэмжлэл автоматаар үүсгэнэ (байхгүй бол)."""
    today = today or date.today()
    created = []
    if contract.type == "sale":
        for mv in contract.movements:
            if mv.type != "ISSUE" or mv.status != "done":
                continue
            no = f"S-{contract.no}-{mv.id}"
            if any(i.no == no for i in contract.invoices):
                continue
            prices = {(it.material_id, it.grade_id): it.unit_price for it in contract.items}
            amount = sum(ln.qty * prices.get((ln.material_id, ln.grade_id), 0) for ln in mv.lines)
            detail = [{"material_id": ln.material_id, "grade_id": ln.grade_id, "qty": ln.qty,
                       "rate": prices.get((ln.material_id, ln.grade_id), 0),
                       "amount": ln.qty * prices.get((ln.material_id, ln.grade_id), 0)} for ln in mv.lines]
            vat = amount * contract.vat_percent / 100
            inv = models.Invoice(contract_id=contract.id, no=no, cycle_start=mv.date,
                                 cycle_end=mv.date, due_date=mv.date,
                                 rent_amount=amount, charge_amount=0, vat_amount=vat,
                                 total=amount + vat, detail_json=json.dumps(detail))
            # relationship-д нэмнэ — эс бөгөөс тухайн session дотор ачаалагдсан
            # contract.invoices цуглуулга хуучирч, авлага буруу тооцогдоно.
            contract.invoices.append(inv)
            created.append(inv)
        db.commit()
        if created:
            apply_client_credit(db, contract.client_id)
        return created

    existing = {(i.cycle_start, i.cycle_end) for i in contract.invoices}
    seq = len(contract.invoices)
    for cs, ce, complete in cycles_of(contract, today):
        if not complete or (cs, ce) in existing:
            continue
        rent, lines = accrue_rent(contract, cs, ce)
        charge, charge_items = charges_in(contract, cs, ce)
        if rent == 0 and charge == 0:
            continue
        vat = (rent + charge) * contract.vat_percent / 100
        seq += 1
        inv = models.Invoice(
            contract_id=contract.id, no=f"R-{contract.no}-{seq}",
            cycle_start=cs, cycle_end=ce, due_date=ce,
            rent_amount=rent, charge_amount=charge, vat_amount=vat,
            total=rent + charge + vat,
            detail_json=json.dumps({"lines": lines, "charges": charge_items}))
        contract.invoices.append(inv)      # session доторх цуглуулгыг шинэчилнэ
        created.append(inv)
    if created:
        db.commit()
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


# ---------- алданги ба үлдэгдэл ----------

def invoice_outstanding(inv: models.Invoice) -> float:
    return max(inv.total - inv.paid, 0.0)


def invoice_penalty(inv: models.Invoice, today: date | None = None) -> float:
    today = today or date.today()
    out = invoice_outstanding(inv)
    if out <= 0:
        return 0.0
    days = (today - inv.due_date).days
    if days <= 0:
        return 0.0
    return out * inv.contract.penalty_percent / 100 * days


def invoice_status(inv: models.Invoice, today: date | None = None) -> str:
    today = today or date.today()
    out = invoice_outstanding(inv)
    if out <= 0.005:
        return "paid"
    if today > inv.due_date:
        return "overdue"
    return "partial" if inv.paid > 0 else "open"


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


def apply_client_credit(db: Session, client_id: int) -> float:
    """Хуваарилагдаагүй үлдсэн (урьдчилж төлсөн) мөнгийг шинэ нэхэмжлэлүүдэд
    автоматаар хаана — хамгийн хуучин төлбөрөөс, хамгийн хуучин нэхэмжлэл рүү."""
    payments = (db.query(models.Payment).filter_by(client_id=client_id)
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


def _fill_invoices(db: Session, payment: models.Payment, remain: float) -> float:
    """Нэг төлбөрийн `remain` дүнг тохирох нэхэмжлэлүүдэд хуваарилна."""
    q = db.query(models.Invoice).join(models.Contract).filter(
        models.Contract.client_id == payment.client_id)
    if payment.contract_id:
        q = q.filter(models.Invoice.contract_id == payment.contract_id)
    filled = 0.0
    for inv in sorted(q.all(), key=lambda i: (i.due_date, i.id)):
        if remain <= 0:
            break
        out = invoice_outstanding(inv)
        if out <= 0:
            continue
        take = min(out, remain)
        db.add(models.PaymentAllocation(payment_id=payment.id, invoice_id=inv.id, amount=take))
        inv.paid += take
        inv.status = "paid" if inv.total - inv.paid <= 0.005 else "partial"
        remain -= take
        filled += take
    return filled


def allocate_payment(db: Session, payment: models.Payment):
    """Хамгийн хуучин нэхэмжлэлээс эхэлж автоматаар хаана. Буцна: хуваарилагдсан дүн."""
    filled = _fill_invoices(db, payment, payment.amount)
    db.commit()
    return filled


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


# ---------- мэдэгдэл (амьд тооцоолол) ----------

def build_notifications(db: Session, today: date | None = None):
    today = today or date.today()
    notes = []
    contracts = db.query(models.Contract).filter(models.Contract.status == "active").all()
    for c in contracts:
        ensure_invoices(db, c, today)
    for c in contracts:
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
    pending = db.query(models.Movement).filter_by(status="pending", type="ISSUE").all()
    for mv in pending:
        notes.append({"kind": "shipment", "level": "info",
                      "title": f"{mv.contract.client.name} — №{mv.contract.no} ачилт хүлээгдэж байна",
                      "sub": mv.note or f"Огноо {mv.date}",
                      "contract_id": mv.contract_id, "movement_id": mv.id})
    return notes

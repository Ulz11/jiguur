"""Материалын ашигт байдал ба мөнгөний урсгалын прогноз."""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from .. import models
from . import billing
from . import loans as loans_svc

STALE_DAYS = 180          # бартер хөрөнгө хэдэн хоног хэвтвэл «зогсонги» гэх вэ
FORECAST_BUCKETS = [(0, 30, "0–30 хоног"), (31, 60, "31–60 хоног"), (61, 90, "61–90 хоног")]


# ---------------- Материалын ашигт байдал ----------------

def material_yield(db: Session, months: int = 6, today: date | None = None):
    """Материал бүрийн өгөөж: тухайн үед олсон түрээсийн орлого ÷ хөрөнгийн үнэ.

    Мөн ашиглалт (түрээсэнд байгаа хувь) ба нөөцийн задаргаа.
    """
    today = today or date.today()
    d_from = today - timedelta(days=30 * months)

    # (material_id, grade_id) → орлого
    revenue: dict[tuple[int, int], float] = {}
    qty_days: dict[tuple[int, int], float] = {}
    for c in db.query(models.Contract).all():
        if c.no.startswith("OB-"):
            continue
        if c.type == "rent":
            _, lines = billing.accrue_rent(c, d_from, today + timedelta(days=1))
            for ln in lines:
                key = (ln["material_id"], ln["grade_id"])
                revenue[key] = revenue.get(key, 0) + ln["amount"]
                qty_days[key] = qty_days.get(key, 0) + ln["qty_days"]
        else:
            prices = {(i.material_id, i.grade_id): i.unit_price for i in c.items}
            for mv in c.movements:
                if (mv.type != "ISSUE" or not billing.movement_active(mv)
                        or not (d_from <= mv.date <= today)):
                    continue
                for ln in mv.lines:
                    key = (ln.material_id, ln.grade_id)
                    revenue[key] = revenue.get(key, 0) + ln.qty * prices.get(key, 0)

    stocks = db.query(models.Stock).all()
    mats = {m.id: m for m in db.query(models.Material).all()}
    grades = {g.id: g.code for g in db.query(models.Grade).all()}
    prices = {(p.material_id, p.grade_id): p.nb_price
              for p in db.query(models.MaterialGradePrice).all()}

    agg: dict[int, dict] = {}
    for s in stocks:
        m = mats.get(s.material_id)
        if not m or not m.active:
            continue
        owned = (s.on_hand or 0) + (s.on_rent or 0) + (s.in_repair or 0)
        if owned <= 0 and not revenue.get((s.material_id, s.grade_id)):
            continue
        row = agg.setdefault(s.material_id, {
            "material_id": m.id, "material": m.name, "category": m.category,
            "base_rate": m.base_rate, "on_hand": 0.0, "on_rent": 0.0, "in_repair": 0.0,
            "owned": 0.0, "asset_value": 0.0, "revenue": 0.0, "qty_days": 0.0, "grades": []})
        row["on_hand"] += s.on_hand or 0
        row["on_rent"] += s.on_rent or 0
        row["in_repair"] += s.in_repair or 0
        row["owned"] += owned
        row["asset_value"] += owned * prices.get((s.material_id, s.grade_id), 0)
        row["revenue"] += revenue.get((s.material_id, s.grade_id), 0)
        row["qty_days"] += qty_days.get((s.material_id, s.grade_id), 0)
        row["grades"].append({"grade": grades.get(s.grade_id, "?"), "on_hand": s.on_hand or 0,
                              "on_rent": s.on_rent or 0})

    rows = []
    for r in agg.values():
        rented = r["on_rent"]
        pool = r["on_hand"] + rented
        r["utilization"] = round(rented / pool * 100, 1) if pool else 0.0
        r["yield_percent"] = round(r["revenue"] / r["asset_value"] * 100, 1) if r["asset_value"] else 0.0
        # жилд шилжүүлсэн өгөөж — харьцуулахад тохиромжтой
        r["annual_yield"] = round(r["yield_percent"] * 12 / max(months, 1), 1)
        r["idle_value"] = round(r["on_hand"] * (r["asset_value"] / r["owned"] if r["owned"] else 0))
        for k in ("owned", "on_hand", "on_rent", "in_repair", "asset_value", "revenue", "qty_days"):
            r[k] = round(r[k])
        rows.append(r)

    rows.sort(key=lambda x: -x["yield_percent"])
    return {"months": months, "from": str(d_from), "to": str(today), "rows": rows,
            "totals": {
                "asset_value": sum(r["asset_value"] for r in rows),
                "revenue": sum(r["revenue"] for r in rows),
                "idle_value": sum(r["idle_value"] for r in rows),
                "utilization": round(
                    sum(r["on_rent"] for r in rows) /
                    max(sum(r["on_hand"] + r["on_rent"] for r in rows), 1) * 100, 1)}}


# ---------------- Мөнгөний урсгалын прогноз ----------------

def cash_forecast(db: Session, today: date | None = None):
    """30/60/90 хоногийн орох/гарах мөнгө.

    Орох: нээлттэй нэхэмжлэлийн үлдэгдэл (төлөх хугацаагаар) + дуусах циклийн хуримтлал
    Гарах: зээлийн сарын төлбөр + цалингийн сан + механизмын дундаж зарлага
    Хугацаа хэтэрсэн авлагыг огноогүй тул тусад нь харуулна.
    """
    today = today or date.today()
    buckets = [{"label": lbl, "start": a, "end": b, "inflow": 0.0, "outflow": 0.0,
                "items_in": [], "items_out": []} for a, b, lbl in FORECAST_BUCKETS]

    def bucket_for(d: date):
        days = (d - today).days
        for b in buckets:
            if b["start"] <= days <= b["end"]:
                return b
        return None

    overdue_inflow = 0.0
    legacy_inflow = 0.0
    for c in db.query(models.Contract).all():
        billing.ensure_invoices(db, c, today)
    for inv in db.query(models.Invoice).filter(billing.LIVE_INVOICE).all():
        out = billing.invoice_outstanding(inv)
        if out <= 0:
            continue
        # Хуучин системээс шилжсэн үлдэгдэл — бодит төлөх хугацаа тодорхойгүй тул
        # прогнозод оруулахгүй (эс бөгөөс эхний сар хэт өөдрөг харагдана)
        if (inv.no or "").startswith("OB-") or (inv.contract.no or "").startswith("OB-"):
            legacy_inflow += out
            continue
        if inv.due_date < today:
            overdue_inflow += out
            continue
        b = bucket_for(inv.due_date)
        if b:
            b["inflow"] += out
            b["items_in"].append({"label": f"{inv.contract.client.name} · {inv.no}",
                                  "date": str(inv.due_date), "amount": round(out)})

    # Идэвхтэй гэрээний ирээдүйн циклүүд — цикл бүрд дахин нэхэмжлэгдэнэ.
    # (Одоогийн бараа гадаа байна гэж үзсэн төсөөлөл; буцаалт хийвэл багасна.)
    #
    # Цонх бүрийн дүн нь ТУХАЙН ЦОНХНЫ уртаар бодогдоно, `cycle_days`-аар БИШ:
    # календарь гэрээнд сарууд өөр өөр урттай (28…31) тул нэг тогтмолоор
    # үржүүлбэл прогноз хуанлигаас салж, 31 хоногийн сар доогуур тооцогдоно.
    for c in db.query(models.Contract).filter(models.Contract.status == "active").all():
        if c.no.startswith("OB-") or c.type != "rent":
            continue
        cur = billing.current_cycle_accrual(c, today)
        if not cur or cur["day_amount"] <= 0:
            continue
        # Явагдаж буй цикл (1-ээс тоологддог) — түүнээс эхлээд 4 цонх урагш
        first = billing.cycle_index(c, date.fromisoformat(cur["cycle_start"])) - 1
        for n in range(4):
            cs, ce = billing.cycle_window(c, first + n)
            if (ce - today).days > 90:
                break
            if c.end_date and ce > c.end_date:
                break
            full = cur["day_amount"] * (ce - cs).days
            b = bucket_for(ce)
            if b:
                b["inflow"] += full
                b["items_in"].append({
                    "label": f"{c.client.name} · №{c.no} цикл хаагдана",
                    "date": str(ce), "amount": round(full)})

    # Зээлийн төлөлт (3 сар урагш)
    monthly_loan = 0.0
    for l in db.query(models.Loan).filter(models.Loan.status == "active").all():
        # Гэрээгээр тохирсон сарын төлөлт байвал мөнгө ТЭР дүнгээр гарна; үгүй бол
        # хуучин конвенцоор сарын хүүгээр (Зээл хуудсын ойрын төлөлттэй нэг эх сурвалж).
        due = loans_svc.planned_due(l)
        if due <= 0:
            continue
        label = f"{l.name} · " + ("сарын төлөлт" if (l.monthly_payment or 0) > 0 else "хүү")
        monthly_loan += due
        d = loans_svc.next_due_date(l, today)
        for _ in range(3):
            b = bucket_for(d)
            if b:
                b["outflow"] += due
                b["items_out"].append({"label": label, "date": str(d), "amount": round(due)})
            y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
            import calendar
            d = date(y, m, min(d.day, calendar.monthrange(y, m)[1]))

    # Цалин — сард 2 удаа (15 ба сарын сүүлээр)
    emps = db.query(models.Employee).filter(models.Employee.active == 1).all()
    pct_row = db.get(models.Setting, "ndsh_percent")
    pct = float(pct_row.value) if pct_row and pct_row.value else 11.5
    half_fund = 0.0
    for e in emps:
        base = e.monthly_salary / 2 if e.type in ("main", "contract") else e.daily_rate * 11
        half_fund += base - (base * pct / 100 if e.ndsh else 0)
    import calendar
    d = today
    for _ in range(6):
        day = 15 if d.day < 15 else calendar.monthrange(d.year, d.month)[1]
        pay = date(d.year, d.month, day)
        if pay >= today:
            b = bucket_for(pay)
            if b and half_fund > 0:
                b["outflow"] += half_fund
                b["items_out"].append({"label": "Цалин (хагас сар)", "date": str(pay),
                                       "amount": round(half_fund)})
        nd = pay + timedelta(days=1)
        d = nd

    # Механизмын дундаж сарын зарлага
    logs = db.query(models.MachineLog).filter(
        models.MachineLog.entry == "expense",
        models.MachineLog.date >= today - timedelta(days=90)).all()
    machine_avg = sum(l.amount for l in logs) / 3 if logs else 0.0
    if machine_avg > 0:
        for i, b in enumerate(buckets):
            b["outflow"] += machine_avg
            b["items_out"].append({"label": "Механизмын зарлага (дундаж)",
                                   "date": str(today + timedelta(days=30 * (i + 1))),
                                   "amount": round(machine_avg)})

    cum = 0.0
    for b in buckets:
        b["inflow"] = round(b["inflow"]); b["outflow"] = round(b["outflow"])
        b["net"] = b["inflow"] - b["outflow"]
        cum += b["net"]
        b["cumulative"] = round(cum)
        b["items_in"] = sorted(b["items_in"], key=lambda x: -x["amount"])[:8]
        b["items_out"] = sorted(b["items_out"], key=lambda x: -x["amount"])[:8]

    return {"today": str(today), "buckets": buckets,
            "overdue_inflow": round(overdue_inflow),
            "legacy_inflow": round(legacy_inflow),
            "monthly_loan_due": round(monthly_loan),
            "monthly_salary": round(half_fund * 2),
            "risk": min((b for b in buckets if b["cumulative"] < 0),
                        key=lambda b: b["cumulative"], default=None)}


# ---------------- Авлага цуглуулах ажлын урсгал ----------------

def collections(db: Session, today: date | None = None):
    today = today or date.today()
    for c in db.query(models.Contract).filter(models.Contract.status == "active").all():
        billing.ensure_invoices(db, c, today)

    rows = []
    for cl in db.query(models.Client).all():
        overdue = 0.0
        oldest_days = 0
        for ct in cl.contracts:
            for inv in billing.live_invoices(ct):
                out = billing.invoice_outstanding(inv)
                if out <= 0 or inv.due_date >= today:
                    continue
                # «Хэтэрсэн» нь ХЭВЭЭР: нэхэгдсэн, хугацаа нь өнгөрсөн хэсэг.
                # Энэ бол залгах дараалал — авлагын НИЙТ дүн биш.
                overdue += out
                oldest_days = max(oldest_days, (today - inv.due_date).days)
        if overdue <= 0.5:
            continue
        # Үлдэгдэл нь АВЛАГЫН ГАНЦ ТОДОРХОЙЛОЛТООС (H9b): нэхэмжилсэн +
        # одоогийн циклийн хуримтлал. Урьд нь энэ дэлгэц зөвхөн нэхэмжилсэнийг
        # харуулж, дашбоард/харилцагчийн мөртэй зөрдөг байв — нэг харилцагч
        # хоёр нийт дүнтэй. `overdue ≤ invoiced ≤ total` эрэмбэ хэвээр тул
        # эрэмбэлэлт, шүүлтүүр, «хамгийн хуучин» бүгд хөндөгдөөгүй.
        rc = billing.client_receivable(cl, today)
        rv = billing.receivable_display(rc["total"], rc["invoiced"])
        penalty, booked = rc["penalty"], rc["penalty_booked"]
        notes = sorted(cl.notes if hasattr(cl, "notes") else [], key=lambda n: n.date) \
            if False else sorted(db.query(models.CollectionNote).filter_by(client_id=cl.id).all(),
                                 key=lambda n: (n.date, n.id))
        last = notes[-1] if notes else None
        promise = next((n for n in reversed(notes) if n.status == "open" and n.promise_date), None)
        rows.append({
            "client_id": cl.id, "client": cl.name, "person": cl.person, "phone": cl.phone,
            "overdue": round(overdue), "penalty": round(penalty),
            # НЭГ авлага (H9b) — `/api/clients`, `/api/clients/{id}`,
            # дашбоардын хуваарийн мөртэй ЯГ ижил тоо, задаргаатайгаа.
            "balance": rv["total"],
            "balance_invoiced": rv["invoiced"],
            "balance_uninvoiced": rv["uninvoiced"],
            # Утсаар ярихад «нэхсэн» ба «нэхэж болох» хоёр өөр зэвсэг (H2 / R25)
            "penalty_booked": round(booked),
            "penalty_unbooked": round(max(penalty - booked, 0.0)),
            "oldest_days": oldest_days,
            "last_contact": str(last.date) if last else None,
            "last_note": last.note if last else "",
            "days_since_contact": (today - last.date).days if last else None,
            "promise_date": str(promise.promise_date) if promise else None,
            "promise_amount": round(promise.promise_amount) if promise else 0,
            "promise_late": bool(promise and promise.promise_date < today),
            "notes_count": len(notes),
        })
    rows.sort(key=lambda r: -r["overdue"])
    return {"rows": rows,
            "total_overdue": round(sum(r["overdue"] for r in rows)),
            "no_contact": sum(1 for r in rows if r["last_contact"] is None),
            "promises_late": sum(1 for r in rows if r["promise_late"])}

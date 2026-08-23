"""Дашбоард — KPI, орлогын задаргаа, насжилт, мэдэгдэл."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, auth
from ..services import billing
from ..services import loans as loans_svc

router = APIRouter(prefix="/api")

MN_MONTH = {1: "1-р", 2: "2-р", 3: "3-р", 4: "4-р", 5: "5-р", 6: "6-р",
            7: "7-р", 8: "8-р", 9: "9-р", 10: "10-р", 11: "11-р", 12: "12-р"}


def month_keys(today: date, n=6):
    keys = []
    y, m = today.year, today.month
    for _ in range(n):
        keys.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(keys))


@router.get("/dashboard")
def dashboard(scope: str = "all", db: Session = Depends(get_db),
              user=Depends(auth.current_user)):
    today = date.today()
    contracts = db.query(models.Contract).all()
    for c in contracts:
        if c.status == "active":
            billing.ensure_invoices(db, c, today)

    def in_scope(c: models.Contract | None):
        return scope == "all" or (c is not None and c.type == scope)

    # ---- KPI ----
    receivable = penalty = overdue_amt = 0.0
    overdue_cnt = 0
    active_cnt = ending_cnt = 0
    for c in contracts:
        if not in_scope(c):
            continue
        b = billing.contract_balance(c, today)
        receivable += b["outstanding"] + b["accruing"]
        penalty += b["penalty"]
        if c.status == "active" and not c.no.startswith("OB-"):
            active_cnt += 1
            if c.end_date and 0 <= (c.end_date - today).days <= 7:
                ending_cnt += 1
        for inv in c.invoices:
            if billing.invoice_status(inv, today) == "overdue":
                overdue_amt += billing.invoice_outstanding(inv)
                overdue_cnt += 1

    stocks = db.query(models.Stock).all()
    tot_hand = sum(s.on_hand for s in stocks)
    tot_rent = sum(s.on_rent for s in stocks)
    utilization = round(tot_rent / (tot_hand + tot_rent) * 100, 1) if (tot_hand + tot_rent) else 0

    # ---- Орлого сараар: Түрээс / Худалдаа / Бартер ----
    keys = month_keys(today)
    series = {"rent": [0.0] * 6, "sale": [0.0] * 6, "barter": [0.0] * 6}
    for p in db.query(models.Payment).all():
        ctype = p.contract.type if p.contract else "rent"
        if scope != "all" and ctype != scope:
            continue
        k = (p.date.year, p.date.month)
        if k not in keys:
            continue
        bucket = "barter" if p.method == "BARTER" else ctype
        series[bucket][keys.index(k)] += p.amount
    revenue = {"months": [MN_MONTH[m] for _, m in keys],
               "rent": [round(v) for v in series["rent"]],
               "sale": [round(v) for v in series["sale"]],
               "barter": [round(v) for v in series["barter"]]}

    # ---- Насжилт ----
    buckets = [["0–30 хоног", 0.0], ["31–60", 0.0], ["61–90", 0.0], ["90+", 0.0]]
    for c in contracts:
        if not in_scope(c):
            continue
        for inv in c.invoices:
            out = billing.invoice_outstanding(inv)
            if out <= 0:
                continue
            days = (today - inv.due_date).days
            i = 0 if days <= 30 else 1 if days <= 60 else 2 if days <= 90 else 3
            buckets[i][1] += out
    aging = [{"label": l, "amount": round(v)} for l, v in buckets]

    notifications = billing.build_notifications(db, today)

    # Зээлийн ойрын төлөлтүүд (бодит дата) + 3 хоногийн дотор бол мэдэгдэл
    loan_sum = loans_svc.summary(db, today)
    loans_upcoming = loan_sum["upcoming"][:5]
    for u_ in loans_upcoming:
        left = (date.fromisoformat(u_["due"]) - today).days
        if 0 <= left <= 3:
            notifications.insert(0, {
                "kind": "loan", "level": "warn",
                "title": f"{u_['name']} — зээлийн төлөлт {left} хоногийн дараа",
                "sub": f"{u_['amount']:,.0f}₮ · сарын хүү {u_['rate']}%"})

    # Зогсонги бартер хөрөнгө — их мөнгө хөдөлгөөнгүй хэвтэж байвал сануулна
    from .barter import STALE_DAYS
    stale = [a for a in db.query(models.BarterAsset).filter_by(status="held").all()
             if (today - a.date_in).days >= STALE_DAYS]
    if stale:
        val = sum(a.value_in for a in stale)
        oldest = max((today - a.date_in).days for a in stale)
        notifications.insert(0, {
            "kind": "barter_stale", "level": "warn",
            "title": f"Бартер: {len(stale)} хөрөнгө {STALE_DAYS}+ хоног зарагдаагүй",
            "sub": f"{val:,.0f}₮ хөдөлгөөнгүй хэвтэж байна · хамгийн удаан нь {oldest} хоног"})

    # Амлалтаа биелүүлээгүй харилцагчид
    late = db.query(models.CollectionNote).filter(
        models.CollectionNote.status == "open",
        models.CollectionNote.promise_date < today).all()
    if late:
        notifications.insert(0, {
            "kind": "promise_late", "level": "danger",
            "title": f"{len(late)} харилцагч төлбөрийн амлалтаа биелүүлээгүй",
            "sub": "Авлага цуглуулах хуудаснаас дэлгэрэнгүйг харна уу"})

    pending = [{"id": mv.id, "contract_id": mv.contract_id,
                "contract_no": mv.contract.no, "client": mv.contract.client.name,
                "date": str(mv.date),
                "summary": " · ".join(f"×{l.qty:g}" for l in mv.lines[:4])}
               for mv in db.query(models.Movement).filter_by(status="pending", type="ISSUE").all()]

    # энэ сарын худалдаа (sale scope-ийн KPI)
    month_sale = 0.0
    for c in contracts:
        if c.type != "sale":
            continue
        for inv in c.invoices:
            if (inv.cycle_start.year, inv.cycle_start.month) == (today.year, today.month):
                month_sale += inv.total

    return {"kpi": {"receivable": round(receivable), "penalty": round(penalty),
                    "overdue": round(overdue_amt), "overdue_count": overdue_cnt,
                    "active_contracts": active_cnt, "ending_soon": ending_cnt,
                    "utilization": utilization, "month_sale": round(month_sale)},
            "revenue": revenue, "aging": aging,
            "notifications": notifications[:20], "pending_shipments": pending,
            "loans_upcoming": loans_upcoming,
            "loans_total": loan_sum["total_debt"]}

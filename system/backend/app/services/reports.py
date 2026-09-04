"""Тайлангийн угсрагч — P&L (аккруэл) + мөнгөн урсгалын цуврал.

Зарчим:
- Түрээсийн орлого = тухайн үед ДУУССАН циклийн нэхэмжлэл (rent + засвар/акт, НӨАТ-гүй)
- Худалдааны орлого = тухайн үеийн худалдааны нэхэмжлэл
- Механизмын орлого/зарлага = ажлын log-оор
- Цалингийн зардал = тухайн үед ОЛГОСОН бодолтууд (base дүнгээр)
- Зээлийн хүү = тухайн үед төлсөн хүү
- Бартерын үр дүн = тухайн үед зарагдсан хөрөнгийн (зарсан − орж ирсэн)
"""
import calendar
import json
from datetime import date
from sqlalchemy.orm import Session
from .. import models
from . import billing


def is_opening(inv: models.Invoice) -> bool:
    """Хуучин системээс шилжсэн үлдэгдэл — авлага мөн, гэхдээ ЭНЭ ҮЕИЙН ОРЛОГО БИШ."""
    return (inv.no or "").startswith("OB-") or (inv.contract.no or "").startswith("OB-")


def charge_kind(desc: str) -> str:
    """Нэхэмжлэлийн төлбөрийн мөрийн АНГИЛАЛ — billing бичсэн шошгоор нь.

    «Засвар» / «Акт» / «Худалдаа» нь хөдөлгөөнөөс (movement_charges_in),
    «Акт: …» нь чөлөөт актын бичилт (akt_charges_in). Танигдаагүй нь «other» —
    буруу ангилалд чимээгүй орохын оронд ил халаасанд гарна.

    «sale» нь бусдаасаа ТӨРӨЛХ ЯЛГААТАЙ: нөгөө дөрөв нь ТҮРЭЭСИЙН гэрээний
    дагалдах төлбөр (түрээсийн орлого) байхад худалдаа нь БАРАА зарсны орлого.
    Тиймээс `pnl` түүнийг түрээсээс хасаж, худалдааны орлого руу зөөнө (H7).
    """
    if desc == "Засвар":
        return "repair"
    if desc == "Акт":
        return "writeoff"
    if desc == billing.SALE_CHARGE_DESC:
        return "sale"
    if desc.startswith("Акт:"):
        return "akt"
    return "other"


def invoice_charges(inv: models.Invoice) -> list[dict]:
    """detail_json доторх төлбөрийн мөрүүд — хуучин/эвдэрсэн JSON-д хоосон."""
    try:
        data = json.loads(inv.detail_json or "{}")
    except (ValueError, TypeError):
        return []
    if not isinstance(data, dict):
        return []
    rows = data.get("charges", [])
    return rows if isinstance(rows, list) else []


def pnl(db: Session, d_from: date, d_to: date):
    """P&L + тоо бүрийн ЗАДАРГАА («detail»).

    Дүн бүр өөрийн мөрүүдээсээ НИЙЛЖ гарна — задаргааны нийлбэр толгойн
    тоотойгоо зөрөх боломжгүй: нэг л эх сурвалж, хоёр түвшний уншилт.
    """
    rent_income = sale_income = 0.0
    rent_rows: list[dict] = []
    sale_rows: list[dict] = []
    charge_split = {"repair": 0.0, "writeoff": 0.0, "akt": 0.0, "other": 0.0}
    charge_rows: list[dict] = []
    # ХУДАЛДАА БОЛГОВ (H7) — түрээсийн нэхэмжлэлийн ДОТОР явдаг ч ТҮРЭЭСИЙН
    # орлого БИШ. `charge_split`-д ОРУУЛАХГҮЙ нь санаатай: тэр толь нь
    # «түрээсийн дагалдах төлбөр» гэсэн утгатай бөгөөс `rent_net` түүгээр
    # бодогдоно. Худалдаа тусдаа хураагдаж, тусдаа задарна.
    sale_charge = 0.0
    sale_charge_rows: list[dict] = []
    for inv in (db.query(models.Invoice).join(models.Contract)
                .filter(billing.LIVE_INVOICE).all()):
        if is_opening(inv):
            continue
        base = inv.rent_amount + inv.charge_amount
        c = inv.contract
        if c.type == "rent":
            # цикл [start, end) — end нь дуусах агшин тул түүгээр нь тайланд оруулна
            if not (d_from <= inv.cycle_end <= d_to):
                continue
            # Засвар/акт/чөлөөт актын задаргаа — нэхэмжлэл бичигдэхдээ хадгалсан
            # мөрүүдээс. Задрахгүй үлдсэн нь «other»: нийлбэр ЯМАГТ таарна.
            parsed = 0.0
            inv_sale = 0.0
            for ch in invoice_charges(inv):
                amt = float(ch.get("amount") or 0)
                desc = str(ch.get("desc") or "")
                parsed += amt
                row = {"date": str(ch.get("date") or inv.cycle_end),
                       "client": c.client.name, "contract_no": c.no,
                       "desc": desc, "amount": round(amt)}
                if charge_kind(desc) == "sale":
                    inv_sale += amt
                    sale_charge_rows.append(row)
                    continue
                charge_split[charge_kind(desc)] += amt
                charge_rows.append(row)
            leftover = inv.charge_amount - parsed
            if abs(leftover) > 0.5:
                charge_split["other"] += leftover
                charge_rows.append({"date": str(inv.cycle_end), "client": c.client.name,
                                    "contract_no": c.no, "desc": "Задаргаагүй",
                                    "amount": round(leftover)})
            # Мөр нь ТҮРЭЭСЭЭР оруулсан хувиа л хэлнэ; зарсан хэсэг нь өөрийн
            # баганатай. Иймд `rent + charge == total` мөрөндөө ХЭВЭЭР зөв, ба
            # мөрүүдийн Σ нь толгойн `rent_income`-тэй ЯГ таарна.
            rent_base = base - inv_sale
            rent_income += rent_base
            sale_charge += inv_sale
            rent_rows.append({"date": str(inv.cycle_end), "client": c.client.name,
                              "contract_no": c.no, "no": inv.no,
                              "cycle_start": str(inv.cycle_start),
                              "cycle_end": str(inv.cycle_end),
                              "rent": round(inv.rent_amount),
                              "charge": round(inv.charge_amount - inv_sale),
                              "sale": round(inv_sale),
                              "total": round(rent_base)})
        else:
            if not (d_from <= inv.cycle_start <= d_to):
                continue
            sale_income += base
            sale_rows.append({"date": str(inv.cycle_start), "client": c.client.name,
                              "contract_no": c.no, "no": inv.no,
                              "amount": round(base)})
    rent_net = rent_income - sum(charge_split.values())
    # Түрээсийн гэрээн дээр «худалдаа болгосон» бараа нь ХУДАЛДААНЫ орлого:
    # мөнгө алга болохгүй, зөвхөн ЗӨВ халаас руу орно (машины INTERNAL-тай
    # ижил журам — толгойн тоо, задаргаа хоёулаа дагана).
    sale_income += sale_charge

    # Алдангийн орлого — КАССЫН зарчмаар (бодит төлөгдсөн, төлбөрийн огноогоор).
    # Түрээс/худалдаа аккруэл боловч алданги бол цуглуулсан цагтаа л орлого.
    # Хүчингүй болсон төлбөрийн хуваарилалт устдаг тул энд аяндаа ороогүй байх
    # ёстой — гэхдээ шүүлтүүрийг ИЛЭРХИЙ бичнэ: орлогын нийлбэр хэзээ ч
    # цуцлагдсан мөнгөнөөс хамаарч болохгүй.
    penalty_income = 0.0
    penalty_paid_rows: list[dict] = []
    for a in (db.query(models.PaymentAllocation)
              .join(models.Payment, models.PaymentAllocation.payment_id == models.Payment.id)
              .filter(models.PaymentAllocation.part == "penalty",
                      models.Payment.voided_at.is_(None),
                      models.Payment.date >= d_from, models.Payment.date <= d_to)
              .order_by(models.Payment.date).all()):
        penalty_income += a.amount
        penalty_paid_rows.append({"date": str(a.payment.date),
                                  "client": a.payment.client.name,
                                  "invoice_no": a.invoice.no,
                                  "amount": round(a.amount)})

    # Нэхэгдсэн алданги — МЭДЭЭЛЭЛ: орлогод зөвхөн ТӨЛӨГДСӨН нь орно (R25/H2),
    # харин «энэ хугацаанд хэдийг нэхэв» гэдэг нь тайлангийн асуулт мөн.
    booked_rows = [{"date": str(pc.as_of), "client": pc.contract.client.name,
                    "contract_no": pc.contract.no, "amount": round(pc.amount),
                    "user": pc.user_name}
                   for pc in db.query(models.PenaltyCharge)
                   .filter(billing.LIVE_CHARGE,
                           models.PenaltyCharge.as_of >= d_from,
                           models.PenaltyCharge.as_of <= d_to)
                   .order_by(models.PenaltyCharge.as_of).all()]

    # ДОТООД ажил (`INTERNAL`) ОРЛОГО БИШ — өөрийн барилга дээрх кран руу
    # нэхэмжлэл явдаггүй (`machines.billable_jobs`), машины карт ба мөнгөн
    # урсгал ч хасдаг. P&L ганцаараа нэмсээр байсан нь нэг сарын ижил ажлыг
    # ГУРВАН дэлгэц дээр хоёр өөр дүнгээр харуулж байв. Тоо нь алга болохгүй:
    # картынхтай ижил хэлбэрээр («Дотоод ажил Nш · N₮») тусдаа гарна.
    logs = db.query(models.MachineLog).filter(
        models.MachineLog.date >= d_from, models.MachineLog.date <= d_to).all()

    def _internal(l) -> bool:
        return l.entry == "job" and l.method == "INTERNAL"

    machine_income = sum(l.amount for l in logs if l.entry == "job" and not _internal(l))
    machine_expense = sum(l.amount for l in logs if l.entry == "expense")
    internal_logs = [l for l in logs if _internal(l)]
    machine_internal = sum(l.amount for l in internal_logs)
    mach_agg: dict[int, dict] = {}
    for l in logs:
        row = mach_agg.setdefault(l.machine_id, {"machine": l.machine.name,
                                                 "income": 0.0, "expense": 0.0,
                                                 "internal": 0.0})
        if _internal(l):
            row["internal"] += l.amount
        else:
            row["income" if l.entry == "job" else "expense"] += l.amount
    machine_rows = [{"machine": r["machine"], "income": round(r["income"]),
                     "expense": round(r["expense"]),
                     "internal": round(r["internal"]),
                     "net": round(r["income"] - r["expense"])}
                    for r in mach_agg.values()]
    machine_rows.sort(key=lambda r: -r["net"])

    salary_expense = 0.0
    salary_rows: list[dict] = []
    for run in db.query(models.SalaryRun).filter(models.SalaryRun.paid == 1).all():
        if run.paid_date and d_from <= run.paid_date <= d_to:
            amt = sum(i.base for i in run.items)
            salary_expense += amt
            salary_rows.append({"date": str(run.paid_date),
                                "label": f"{run.period} · {run.half}-р хагас",
                                "employees": len(run.items), "amount": round(amt)})
    salary_rows.sort(key=lambda r: r["date"])

    interest_expense = 0.0
    interest_rows: list[dict] = []
    for p in (db.query(models.LoanPayment)
              .filter(models.LoanPayment.part == "interest",
                      models.LoanPayment.date >= d_from,
                      models.LoanPayment.date <= d_to)
              .order_by(models.LoanPayment.date).all()):
        interest_expense += p.amount
        interest_rows.append({"date": str(p.date), "loan": p.loan.name,
                              "amount": round(p.amount)})

    # Бартер: мөр бүр ЯАЖ орж ирснээ (хэнээс, хэзээ, ямар үнээр) болон ЯАЖ
    # зарагдснаа (хэзээ, хэнд, хэдээр) хамт авч явна — зөрүү нь хаанаас
    # гарсан нь мөрөн дээрээ уншигдана.
    barter_result = 0.0
    barter_rows: list[dict] = []
    for a in db.query(models.BarterAsset).filter(
            models.BarterAsset.status == "sold").all():
        if not (a.sold_date and d_from <= a.sold_date <= d_to):
            continue
        diff = a.sold_amount - a.value_in
        barter_result += diff
        barter_rows.append({"name": a.name, "type": a.type,
                            "client": a.client.name if a.client else "",
                            "date_in": str(a.date_in), "value_in": round(a.value_in),
                            "sold_date": str(a.sold_date), "sold_to": a.sold_to,
                            "sold_amount": round(a.sold_amount),
                            "diff": round(diff)})
    barter_rows.sort(key=lambda r: r["sold_date"])

    detail = {
        "rent_net": round(rent_net),
        "charge": {"repair": round(charge_split["repair"]),
                   "writeoff": round(charge_split["writeoff"]),
                   "akt": round(charge_split["akt"]),
                   "other": round(charge_split["other"]),
                   "rows": sorted(charge_rows, key=lambda r: r["date"])},
        "rent_invoices": sorted(rent_rows, key=lambda r: (r["date"], r["client"])),
        "sale_invoices": sorted(sale_rows, key=lambda r: (r["date"], r["client"])),
        # «Худалдаа болгов» (H7) — түрээсийн гэрээнээс гарсан ХУДАЛДААНЫ орлого.
        # Толгойн `sale_income` = Σ sale_invoices + `sale_charge`.
        "sale_charge": round(sale_charge),
        "sale_charges": sorted(sale_charge_rows, key=lambda r: (r["date"], r["client"])),
        "penalty_paid": penalty_paid_rows,
        "penalty_booked": {"total": round(sum(r["amount"] for r in booked_rows)),
                           "rows": booked_rows},
        "machines": machine_rows,
        "salary": salary_rows,
        "interest": interest_rows,
        "barter": barter_rows,
    }

    # Дуусаагүй циклүүдэд хуримтлагдаж буй дүн — мэдээлэл болгож (үр дүнд ОРОХГҮЙ)
    accruing = 0.0
    for c in db.query(models.Contract).filter(models.Contract.status == "active").all():
        if c.no.startswith("OB-"):
            continue
        cur = billing.current_cycle_accrual(c, min(d_to, date.today()))
        if cur:
            accruing += cur["accrued"]

    total_income = rent_income + sale_income + machine_income + penalty_income
    total_expense = machine_expense + salary_expense + interest_expense
    return {"from": str(d_from), "to": str(d_to), "accruing": round(accruing),
            "rent_income": round(rent_income), "sale_income": round(sale_income),
            "machine_income": round(machine_income),
            # Орлогод ОРООГҮЙ — гэхдээ кран хэдэн өдөр өөрийн барилга дээр
            # зогссоныг мэдэх нь мэдээлэл (машины картын толь).
            "machine_internal": round(machine_internal),
            "machine_internal_count": len(internal_logs),
            "penalty_income": round(penalty_income),
            "machine_expense": round(machine_expense),
            "salary_expense": round(salary_expense),
            "interest_expense": round(interest_expense),
            "barter_result": round(barter_result),
            "total_income": round(total_income),
            "total_expense": round(total_expense),
            "net": round(total_income - total_expense + barter_result),
            "detail": detail}


def month_bounds(y: int, m: int):
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def cashflow_series(db: Session, today: date, n: int = 6):
    """Сүүлийн n сарын мөнгөн урсгал: орсон (харилцагчийн төлбөр + механизм)
    ба гарсан (механизмын зарлага + хүү + олгосон цалин).

    Орсон дүн нь төлбөрийн хэлбэрээр задарна: бэлэн / данс / бартер.
    Механизмын ажлын хэлбэргүй ("") хуучин бичлэг → данс; INTERNAL (дотоод
    ажил) нь урсгалд ОГТ ОРОХГҮЙ (өмнөх зан төлөв хэвээр).
    `cash_in` = гурван задаргааны нийлбэр (хуучин хэрэглэгчид эвдрэхгүй)."""
    keys = []
    y, m = today.year, today.month
    for _ in range(n):
        keys.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    keys.reverse()
    months, cin, cout = [], [], []
    f_cash, f_bank, f_barter = [], [], []
    for (y, m) in keys:
        d1, d2 = month_bounds(y, m)
        # Цуцлагдсан төлбөр мөнгөн урсгалд ОРООГҮЙ — тэр мөнгө хэзээ ч ороогүй.
        pays = db.query(models.Payment).filter(
            models.Payment.voided_at.is_(None),
            models.Payment.date >= d1, models.Payment.date <= d2).all()
        logs = db.query(models.MachineLog).filter(
            models.MachineLog.date >= d1, models.MachineLog.date <= d2).all()
        jobs = [l for l in logs if l.entry == "job" and l.method != "INTERNAL"]
        in_cash = (sum(p.amount for p in pays if p.method == "CASH")
                   + sum(l.amount for l in jobs if l.method == "CASH"))
        in_barter = (sum(p.amount for p in pays if p.method == "BARTER")
                     + sum(l.amount for l in jobs if l.method == "BARTER"))
        # Данс = BANK + аль ч ангилалд хамаарахгүй үлдсэн нь (хэлбэргүй хуучин бичлэг)
        in_bank = (sum(p.amount for p in pays if p.method not in ("CASH", "BARTER"))
                   + sum(l.amount for l in jobs if l.method not in ("CASH", "BARTER")))
        mach_out = sum(l.amount for l in logs if l.entry == "expense")
        interest = sum(p.amount for p in db.query(models.LoanPayment).filter(
            models.LoanPayment.part == "interest",
            models.LoanPayment.date >= d1, models.LoanPayment.date <= d2).all())
        sal = 0.0
        for run in db.query(models.SalaryRun).filter(models.SalaryRun.paid == 1).all():
            if run.paid_date and d1 <= run.paid_date <= d2:
                sal += sum(i.net for i in run.items)
        months.append(f"{m}-р")
        f_cash.append(round(in_cash))
        f_bank.append(round(in_bank))
        f_barter.append(round(in_barter))
        cin.append(f_cash[-1] + f_bank[-1] + f_barter[-1])
        cout.append(round(mach_out + interest + sal))
    return {"months": months, "cash_in": cin, "cash_out": cout,
            "inflow_cash": f_cash, "inflow_bank": f_bank, "inflow_barter": f_barter}

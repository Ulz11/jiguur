"""Тайлан + Excel export/import."""
import io
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session
from openpyxl import Workbook, load_workbook
from ..db import get_db
from .. import models, auth, serializers
from ..services import reports as R
from ..services import billing, loans as L

router = APIRouter(prefix="/api")
guard = auth.require_roles("manager", "finance")
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/reports")
def reports(months: int = 6, d_from: str = "", d_to: str = "",
            db: Session = Depends(get_db), user=Depends(guard)):
    today = date.today()
    if d_from and d_to:
        f, t = date.fromisoformat(d_from), date.fromisoformat(d_to)
    else:
        f = (today.replace(day=1) - timedelta(days=30 * (months - 1))).replace(day=1)
        t = today
    return {"pnl": R.pnl(db, f, t),
            "months": months,
            "series": R.cashflow_series(db, today, 6),
            "loans_total": L.summary(db, today)["total_debt"]}


def _xlsx(wb: Workbook) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/reports/export.xlsx")
def export_report(months: int = 6, db: Session = Depends(get_db), user=Depends(guard)):
    today = date.today()
    f = (today.replace(day=1) - timedelta(days=30 * (months - 1))).replace(day=1)
    p = R.pnl(db, f, today)
    wb = Workbook()
    ws = wb.active
    ws.title = "Ашиг алдагдал"
    ws.append(["Жигүүр Зам ХХК — Ашиг, алдагдлын тайлан"])
    ws.append([f"Хугацаа: {p['from']} — {p['to']}"])
    ws.append([])
    rows = [
        ("ОРЛОГО", ""), ("Түрээсийн орлого", p["rent_income"]),
        ("Худалдааны орлого", p["sale_income"]), ("Механизмын орлого", p["machine_income"]),
        ("Нийт орлого", p["total_income"]), ("", ""),
        ("ЗАРДАЛ", ""), ("Механизмын зарлага", p["machine_expense"]),
        ("Цалин", p["salary_expense"]), ("Зээлийн хүү", p["interest_expense"]),
        ("Нийт зардал", p["total_expense"]), ("", ""),
        ("Бартерын хэрэгжсэн үр дүн", p["barter_result"]),
        ("ЦЭВЭР ҮР ДҮН", p["net"]),
    ]
    for r_ in rows:
        ws.append(list(r_))
    ws.column_dimensions["A"].width = 34
    ws.column_dimensions["B"].width = 18

    ws2 = wb.create_sheet("Авлага")
    ws2.append(["Харилцагч", "Идэвхтэй гэрээ", "Авлагын үлдэгдэл", "Алданги", "Барьцаа"])
    today_ = date.today()
    for c in db.query(models.Client).order_by(models.Client.name).all():
        row = serializers.client_row(c, today_)
        ws2.append([row["name"], row["active_contracts"], row["receivable"],
                    row["penalty"], row["deposit"]])
    ws2.column_dimensions["A"].width = 32

    ws3 = wb.create_sheet("Зээл")
    ws3.append(["Зээлдүүлэгч", "Үндсэн дүн", "Нэмэлт олголт", "Үлдэгдэл",
                "Хүү %/сар", "Сарын хүү", "Сарын төлөлт"])
    from ..services.loans import loan_balance, monthly_due, topup_total
    for l in db.query(models.Loan).filter_by(status="active").all():
        ws3.append([l.name, l.principal, topup_total(l), loan_balance(l),
                    l.monthly_rate, monthly_due(l), l.monthly_payment or 0])
    ws3.column_dimensions["A"].width = 32

    return Response(_xlsx(wb), media_type=XLSX_MIME,
                    headers={"Content-Disposition": 'attachment; filename="tailan.xlsx"'})


@router.get("/export/receivables.xlsx")
def export_receivables(db: Session = Depends(get_db), user=Depends(guard)):
    today = date.today()
    for c in db.query(models.Contract).filter_by(status="active").all():
        billing.ensure_invoices(db, c, today)
    wb = Workbook()
    ws = wb.active
    ws.title = "Авлага"
    ws.append(["Харилцагч", "Регистр", "Утас", "Идэвхтэй гэрээ",
               "Авлагын үлдэгдэл", "Алданги", "Барьцаа", "Хэтэрсэн эсэх"])
    for c in db.query(models.Client).order_by(models.Client.name).all():
        row = serializers.client_row(c, today)
        ws.append([row["name"], row["reg"], row["phone"], row["active_contracts"],
                   row["receivable"], row["penalty"], row["deposit"],
                   "Тийм" if row["overdue"] else ""])
    ws.column_dimensions["A"].width = 32
    return Response(_xlsx(wb), media_type=XLSX_MIME,
                    headers={"Content-Disposition": 'attachment; filename="avlaga.xlsx"'})


@router.post("/import/clients")
async def import_clients(file: UploadFile, db: Session = Depends(get_db),
                         user=Depends(auth.require_roles("manager", "finance"))):
    """XLSX: Нэр | Регистр | Хариуцагч | Утас (эхний мөр — толгой)."""
    data = await file.read()
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True)
    except Exception:
        raise HTTPException(400, "XLSX файл уншигдсангүй")
    ws = wb.active
    existing = {c.name.strip().lower() for c in db.query(models.Client).all()}
    created = skipped = 0
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue  # толгой
        name = str(row[0] or "").strip()
        if not name:
            continue
        if name.lower() in existing:
            skipped += 1
            continue
        db.add(models.Client(name=name,
                             reg=str(row[1] or "").strip() if len(row) > 1 else "",
                             person=str(row[2] or "").strip() if len(row) > 2 else "",
                             phone=str(row[3] or "").strip() if len(row) > 3 else ""))
        existing.add(name.lower())
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped}

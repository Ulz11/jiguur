"""Цалин — үндсэн/гэрээт (15/15 хагасаар, заримд НДШ), өдрийн (өдрөөр)."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, auth

router = APIRouter(prefix="/api")
guard = auth.require_roles("manager", "finance")
NDSH_DEFAULT = 11.5  # % — Settings-ээс override хийж болно


class EmployeeIn(BaseModel):
    name: str
    role_title: str = ""
    type: str = "main"            # main | contract | daily
    monthly_salary: float = 0
    daily_rate: float = 0
    ndsh: bool = False


class RunIn(BaseModel):
    period: str                   # YYYY-MM
    half: int                     # 1 | 2
    daily_days: dict[str, float] = {}   # {employee_id: ажилласан өдөр}


class PayIn(BaseModel):
    date: date


def emp_ser(e: models.Employee):
    return {"id": e.id, "name": e.name, "role_title": e.role_title, "type": e.type,
            "monthly_salary": e.monthly_salary, "daily_rate": e.daily_rate,
            "ndsh": bool(e.ndsh), "active": e.active}


def run_ser(r: models.SalaryRun, emap: dict | None = None):
    items = [{"id": i.id, "employee_id": i.employee_id,
              "employee": emap.get(i.employee_id, "?") if emap else None,
              "base": i.base, "days": i.days, "ndsh_amount": i.ndsh_amount, "net": i.net}
             for i in r.items]
    return {"id": r.id, "period": r.period, "half": r.half, "paid": bool(r.paid),
            "paid_date": str(r.paid_date) if r.paid_date else None,
            "total_base": sum(i.base for i in r.items),
            "total_ndsh": sum(i.ndsh_amount for i in r.items),
            "total_net": sum(i.net for i in r.items),
            "items": items}


def _ndsh_percent(db: Session) -> float:
    s = db.get(models.Setting, "ndsh_percent")
    try:
        return float(s.value) if s and s.value else NDSH_DEFAULT
    except ValueError:
        return NDSH_DEFAULT


@router.get("/salary/employees")
def employees(db: Session = Depends(get_db), user=Depends(guard)):
    return [emp_ser(e) for e in db.query(models.Employee).filter_by(active=1)
            .order_by(models.Employee.type, models.Employee.name).all()]


@router.post("/salary/employees")
def add_employee(body: EmployeeIn, db: Session = Depends(get_db), user=Depends(guard)):
    if body.type not in ("main", "contract", "daily"):
        raise HTTPException(400, "Буруу төрөл")
    e = models.Employee(**{**body.model_dump(), "ndsh": 1 if body.ndsh else 0})
    db.add(e)
    db.commit()
    return emp_ser(e)


@router.put("/salary/employees/{eid}")
def edit_employee(eid: int, body: EmployeeIn, db: Session = Depends(get_db), user=Depends(guard)):
    e = db.get(models.Employee, eid)
    if not e:
        raise HTTPException(404, "Олдсонгүй")
    for k, v in body.model_dump().items():
        setattr(e, k, 1 if (k == "ndsh" and v) else (0 if k == "ndsh" else v))
    db.commit()
    return emp_ser(e)


@router.delete("/salary/employees/{eid}")
def deactivate_employee(eid: int, db: Session = Depends(get_db), user=Depends(guard)):
    e = db.get(models.Employee, eid)
    if not e:
        raise HTTPException(404, "Олдсонгүй")
    e.active = 0
    db.commit()
    return {"ok": True}


@router.get("/salary/runs")
def runs(db: Session = Depends(get_db), user=Depends(guard)):
    emap = {e.id: e.name for e in db.query(models.Employee).all()}
    rows = db.query(models.SalaryRun).order_by(models.SalaryRun.period.desc(),
                                               models.SalaryRun.half.desc()).all()
    return [run_ser(r, emap) for r in rows]


@router.post("/salary/runs")
def create_run(body: RunIn, db: Session = Depends(get_db), user=Depends(guard)):
    if body.half not in (1, 2):
        raise HTTPException(400, "half нь 1 эсвэл 2 байна")
    if db.query(models.SalaryRun).filter_by(period=body.period, half=body.half).first():
        raise HTTPException(400, f"{body.period}-ийн {body.half}-р хагасын бодолт аль хэдийн байна")
    pct = _ndsh_percent(db)
    run = models.SalaryRun(period=body.period, half=body.half)
    db.add(run)
    db.flush()
    for e in db.query(models.Employee).filter_by(active=1).all():
        if e.type in ("main", "contract"):
            base = e.monthly_salary / 2
            days = 0.0
        else:
            days = float(body.daily_days.get(str(e.id), 0))
            if days <= 0:
                continue
            base = days * e.daily_rate
        if base <= 0:
            continue
        ndsh_amt = base * pct / 100 if e.ndsh else 0.0
        db.add(models.SalaryItem(run_id=run.id, employee_id=e.id, base=base,
                                 days=days, ndsh_amount=ndsh_amt, net=base - ndsh_amt))
    db.commit()
    db.refresh(run)
    emap = {e.id: e.name for e in db.query(models.Employee).all()}
    return run_ser(run, emap)


@router.post("/salary/runs/{rid}/pay")
def pay_run(rid: int, body: PayIn, db: Session = Depends(get_db), user=Depends(guard)):
    r = db.get(models.SalaryRun, rid)
    if not r:
        raise HTTPException(404, "Олдсонгүй")
    r.paid = 1
    r.paid_date = body.date
    db.commit()
    return {"ok": True}

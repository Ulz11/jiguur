"""Цалин — үндсэн/гэрээт (15/15 хагасаар, заримд НДШ), өдрийн (өдрөөр)."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import ordering
from ..db import get_db
from .. import models, auth
from ..services import audit

router = APIRouter(prefix="/api")
guard = auth.require_roles("manager", "finance")
NDSH_DEFAULT = 11.5  # % — Settings-ээс override хийж болно

#: «САРЫН ЦАЛИНГИЙН САН» гэдгийн ГАНЦ тодорхойлолт: өдрийн ажилтныг
#: сард хэдэн өдөр ажиллана гэж тооцох вэ. 22 нь ажлын өдрийн тоо —
#: дэлгэц дээр «өдрийнхийг 22 хоногоор тооцов» гэж бичигддэгтэй ижил.
#: Урьд нь Цалин хуудас 22-оор, Аналитик хуудас 11×2 = 22-оор ГЭХДЭЭ өөр
#: (НДШ хассан) тоогоор бодож, нэг нэртэй хоёр тоо гардаг байв.
DAILY_DAYS_PER_MONTH = 22

#: Олгосон бодолтыг устгаж болохгүй: мөнгө гарсан, тайлан дээр сууна.
PAID_RUN_LOCKED = "Олгосон бодолтыг устгах боломжгүй"

#: Ажилтны талбарын МОНГОЛ нэр (`services/audit.py` FIELDS_MN нь нөгөө
#: агентын файл — толио энд авч явлаа).
FIELDS_MN = {"name": "нэр", "role_title": "албан тушаал", "type": "төрөл",
             "monthly_salary": "сарын цалин", "daily_rate": "өдрийн хөлс",
             "ndsh": "НДШ суутгах эсэх", "active": "идэвхтэй эсэх"}
TYPE_MN = {"main": "үндсэн", "contract": "гэрээт", "daily": "өдрийн"}


#: 1/0 хадгалдаг талбарууд — /audit дээр «1 → 0» биш «үгүй → тийм» гэж гарна.
YES_NO_FIELDS = ("ndsh", "active")


def _mn(v, key: str = "") -> str:
    if key in YES_NO_FIELDS:
        return "тийм" if v else "үгүй"
    return TYPE_MN.get(v, "—" if v is None or v == "" else str(v))


def _changes(before: dict, after: dict) -> str:
    return " · ".join(f"{FIELDS_MN.get(k, k)}: {_mn(before.get(k), k)} → {_mn(v, k)}"
                      for k, v in after.items() if before.get(k) != v)


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


def _run_percent(r: models.SalaryRun) -> float:
    """Бодолтын НДШ% — мөрөндөө тамгалагдсан утга.

    Хуучин (тамгагүй) бодолт дээр мөрүүдээсээ БУЦААЖ бодогдоно: НДШ суутгасан
    аль нэг мөр байвал `ndsh_amount / base × 100`. Огт суутгаагүй бодолт дээр
    хувь нь утгагүй тул 0 — дэлгэц түүнийг «—» гэж харуулна.
    """
    if r.ndsh_percent:
        return r.ndsh_percent
    for i in r.items:
        if i.ndsh_amount and i.base:
            return round(i.ndsh_amount / i.base * 100, 4)
    return 0.0


def run_ser(r: models.SalaryRun, emap: dict | None = None):
    items = [{"id": i.id, "employee_id": i.employee_id,
              "employee": emap.get(i.employee_id, "?") if emap else None,
              "base": i.base, "days": i.days, "ndsh_amount": i.ndsh_amount, "net": i.net}
             for i in r.items]
    return {"id": r.id, "period": r.period, "half": r.half, "paid": bool(r.paid),
            "paid_date": str(r.paid_date) if r.paid_date else None,
            # ХЭДЭН ХУВИАР суутгасныг БОДОЛТ ӨӨРӨӨ хэлнэ. Тохиргоо хожим
            # өөрчлөгдвөл хуучин бодолтын шошго ХУДАЛ болохгүй.
            "ndsh_percent": _run_percent(r),
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


def payroll(db: Session) -> dict:
    """«Сарын цалингийн сан» — НЭГ тодорхойлолт, хоёр тоо.

    · `payroll_monthly` — БРУТТО сан (үндсэн/гэрээт: сарын цалин; өдрийн:
      өдрийн хөлс × 22). Ажил олгогчийн зардлын хэмжээ.
    · `payroll_net` — НДШ суутгасны дараа ГАРТ олгогдох дүн. Мөнгөн
      урсгалын прогноз ба тайлангийн цалингийн зардал ҮҮГЭЭР явна.
    """
    pct = _ndsh_percent(db)
    gross = net = 0.0
    emps = db.query(models.Employee).filter_by(active=1).all()
    for e in emps:
        base = (e.daily_rate * DAILY_DAYS_PER_MONTH
                if e.type == "daily" else e.monthly_salary)
        gross += base
        net += base - (base * pct / 100 if e.ndsh else 0)
    return {"active_count": len(emps), "ndsh_percent": pct,
            "daily_days": DAILY_DAYS_PER_MONTH,
            "payroll_monthly": round(gross), "payroll_net": round(net)}


@router.get("/salary/summary")
def salary_summary(db: Session = Depends(get_db), user=Depends(guard)):
    """Цалингийн сангийн НЭГ эх сурвалж — Цалин ба Аналитик хоёр эндээс уншина."""
    return payroll(db)


@router.get("/salary/employees")
def employees(db: Session = Depends(get_db), user=Depends(guard)):
    return [emp_ser(e) for e in ordering.by_fields(
        db.query(models.Employee).filter_by(active=1).all(), "type", "name")]


@router.post("/salary/employees")
def add_employee(body: EmployeeIn, db: Session = Depends(get_db), user=Depends(guard)):
    if body.type not in TYPE_MN:
        raise HTTPException(400, "Буруу төрөл")
    e = models.Employee(**{**body.model_dump(), "ndsh": 1 if body.ndsh else 0})
    db.add(e)
    db.commit()
    pay = e.daily_rate if e.type == "daily" else e.monthly_salary
    audit.log(db, user, "create", "employee", e.id,
              f"{e.name} · {_mn(e.type)} · {pay:,.0f}₮"
              + (" · НДШ суутгана" if e.ndsh else ""))
    return emp_ser(e)


@router.put("/salary/employees/{eid}")
def edit_employee(eid: int, body: EmployeeIn, db: Session = Depends(get_db), user=Depends(guard)):
    e = db.get(models.Employee, eid)
    if not e:
        raise HTTPException(404, "Олдсонгүй")
    data = {k: (1 if v else 0) if k == "ndsh" else v for k, v in body.model_dump().items()}
    before = {k: getattr(e, k) for k in data}
    for k, v in data.items():
        setattr(e, k, v)
    db.commit()
    audit.log(db, user, "update", "employee", e.id, f"{e.name} · {_changes(before, data)}")
    return emp_ser(e)


@router.delete("/salary/employees/{eid}")
def deactivate_employee(eid: int, db: Session = Depends(get_db), user=Depends(guard)):
    """УСТГАХГҮЙ — идэвхгүй болгоно: хуучин бодолтууд дээр мөр нь үлдэнэ."""
    e = db.get(models.Employee, eid)
    if not e:
        raise HTTPException(404, "Олдсонгүй")
    e.active = 0
    db.commit()
    audit.log(db, user, "deactivate", "employee", e.id, f"{e.name} · жагсаалтаас гаргав")
    return {"ok": True}


@router.post("/salary/employees/{eid}/reactivate")
def reactivate_employee(eid: int, db: Session = Depends(get_db), user=Depends(guard)):
    """Буцаж ирсэн (эсвэл андуурч хассан) ажилтныг ЭРГҮҮЛЭН жагсаалтад.

    Хасалт нь эргэх замгүй байв: андуурч дарсан бол ажилтныг ДАХИН үүсгэхээс
    аргагүй болж, нэг хүн хоёр мөр болж, хуучин бодолтууд нь нөгөө мөрөн дээр
    үлддэг. Одоо ижил мөр эргэж ирнэ.
    """
    e = db.get(models.Employee, eid)
    if not e:
        raise HTTPException(404, "Олдсонгүй")
    e.active = 1
    db.commit()
    audit.log(db, user, "reactivate", "employee", e.id, f"{e.name} · жагсаалтад буцаав")
    return emp_ser(e)


@router.get("/salary/runs")
def runs(db: Session = Depends(get_db), user=Depends(guard)):
    emap = {e.id: e.name for e in db.query(models.Employee).all()}
    rows = db.query(models.SalaryRun).order_by(models.SalaryRun.period.desc(),
                                               models.SalaryRun.half.desc(),
                                               models.SalaryRun.id.desc()).all()
    return [run_ser(r, emap) for r in rows]


@router.post("/salary/runs")
def create_run(body: RunIn, db: Session = Depends(get_db), user=Depends(guard)):
    if body.half not in (1, 2):
        raise HTTPException(400, "half нь 1 эсвэл 2 байна")
    if db.query(models.SalaryRun).filter_by(period=body.period, half=body.half).first():
        raise HTTPException(400, f"{body.period}-ийн {body.half}-р хагасын бодолт аль хэдийн байна")
    pct = _ndsh_percent(db)
    # Хувь нь бодолт дээрээ ТАМГАЛАГДАНА — тохиргоо хожим өөрчлөгдвөл энэ
    # бодолтын дэлгэц дээрх «НДШ 11.5%» гэсэн шошго худал болохгүй.
    run = models.SalaryRun(period=body.period, half=body.half, ndsh_percent=pct)
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
    out = run_ser(run, emap)
    audit.log(db, user, "create", "salary", run.id,
              f"{run.period} · {run.half}-р хагас · {len(out['items'])} ажилтан · "
              f"НДШ {pct}% · гарт {out['total_net']:,.0f}₮")
    return out


@router.post("/salary/runs/{rid}/pay")
def pay_run(rid: int, body: PayIn, db: Session = Depends(get_db), user=Depends(guard)):
    r = db.get(models.SalaryRun, rid)
    if not r:
        raise HTTPException(404, "Олдсонгүй")
    r.paid = 1
    r.paid_date = body.date
    db.commit()
    audit.log(db, user, "pay", "salary", r.id,
              f"{r.period} · {r.half}-р хагас · {body.date} · "
              f"{sum(i.net for i in r.items):,.0f}₮ олгов")
    return {"ok": True}


@router.delete("/salary/runs/{rid}")
def delete_run(rid: int, db: Session = Depends(get_db), user=Depends(guard)):
    """Буруу бодсоныг УСТГАХ — зөвхөн ОЛГООГҮЙ байхад.

    Олгосон бодолт нь мөнгө гарсны баримт: тайлангийн цалингийн зардал,
    мөнгөн урсгал хоёр түүн дээр сууна. Түүнийг устгавал өнгөрсөн сарын
    тайлан чимээгүй өөрчлөгдөнө — тиймээс хаалттай.
    """
    r = db.get(models.SalaryRun, rid)
    if not r:
        raise HTTPException(404, "Олдсонгүй")
    if r.paid:
        raise HTTPException(400, PAID_RUN_LOCKED)
    detail = (f"{r.period} · {r.half}-р хагас · {len(r.items)} ажилтан · "
              f"{sum(i.net for i in r.items):,.0f}₮")
    for i in list(r.items):
        db.delete(i)
    db.delete(r)
    db.commit()
    audit.log(db, user, "delete", "salary", rid, detail)
    return {"ok": True}

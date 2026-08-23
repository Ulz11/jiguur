"""Механизм (Автокран г.м.) — өдрийн ажлын log, орлого/зарлага, машин бүрийн ашиг."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, auth

router = APIRouter(prefix="/api")


class MachineIn(BaseModel):
    name: str
    note: str = ""


class LogIn(BaseModel):
    date: date
    entry: str                 # job | expense
    label: str = ""
    client: str = ""
    amount: float
    method: str = ""           # CASH | BANK | BARTER | INTERNAL
    note: str = ""


def machine_ser(m: models.Machine):
    income = sum(l.amount for l in m.logs if l.entry == "job")
    expense = sum(l.amount for l in m.logs if l.entry == "expense")
    return {"id": m.id, "name": m.name, "note": m.note, "active": m.active,
            "income": round(income), "expense": round(expense),
            "net": round(income - expense), "log_count": len(m.logs)}


def log_ser(l: models.MachineLog):
    return {"id": l.id, "date": str(l.date), "entry": l.entry, "label": l.label,
            "client": l.client, "amount": l.amount, "method": l.method, "note": l.note}


@router.get("/machines")
def list_machines(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    machines = db.query(models.Machine).order_by(models.Machine.id).all()
    total_in = sum(l.amount for m in machines for l in m.logs if l.entry == "job")
    total_ex = sum(l.amount for m in machines for l in m.logs if l.entry == "expense")
    return {"machines": [machine_ser(m) for m in machines],
            "summary": {"income": round(total_in), "expense": round(total_ex),
                        "net": round(total_in - total_ex)}}


@router.get("/machines/{mid}/logs")
def machine_logs(mid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    m = db.get(models.Machine, mid)
    if not m:
        raise HTTPException(404, "Машин олдсонгүй")
    return {**machine_ser(m),
            "logs": [log_ser(l) for l in sorted(m.logs, key=lambda l: (l.date, l.id), reverse=True)]}


@router.post("/machines")
def add_machine(body: MachineIn, db: Session = Depends(get_db),
                user=Depends(auth.require_roles("manager"))):
    m = models.Machine(**body.model_dump())
    db.add(m)
    db.commit()
    return machine_ser(m)


@router.post("/machines/{mid}/logs")
def add_log(mid: int, body: LogIn, db: Session = Depends(get_db),
            user=Depends(auth.require_roles("manager", "factory", "finance"))):
    m = db.get(models.Machine, mid)
    if not m:
        raise HTTPException(404, "Машин олдсонгүй")
    if body.entry not in ("job", "expense"):
        raise HTTPException(400, "entry нь job эсвэл expense байна")
    if body.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    l = models.MachineLog(machine_id=mid, **body.model_dump())
    db.add(l)
    db.commit()
    return log_ser(l)

"""МЭДЭГДЛИЙН ГАРЧИГ дотоод дугаар (OB-2, A-3-1, R-24/03-1) ХЭЗЭЭ Ч харуулахгүй.

Дашбоардын «Мэдэгдэл» самбар: «Блүүм технологи — нэхэмжлэл OB-2 4 хоног
хэтэрлээ». `OB-2` бол хөдөлгүүрийн зохиомол дугаар — Отгоо эгч тийм нэхэмжлэл
бичиж байгаагүй, `A-3-1` ч мөн адил. Тэр дугаарыг уншаад юу болохыг ойлгох
хүн энэ байшинд алга. Тиймээс:

  · хуучин үлдэгдэл  → «хуучин үлдэгдэл (2026-08-11 хүртэл)»
  · бусад бичилт     → өөрийнхөө нэрээр («Байрны төлбөр суутгал»)
  · түрээсийн нэхэмжлэл → циклийн огноогоороо («2026-03-20 – 2026-04-19 нэхэмжлэл»)

Дэлгэц дээрх бусад газар (`lib/invoice.ts`) аль хэдийн ингэж дууддаг — энэ
тест нь серверээс угсрагддаг ганц гарчгийг тэр дүрэмд оруулна.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app import models
from app.services import billing, entries
from app.services import migration as M


def _session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def _client(db, name="Блүүм технологи"):
    cl = models.Client(name=name)
    db.add(cl)
    db.commit()
    db.refresh(cl)
    return cl


def _overdue_titles(db, today):
    return [n["title"] for n in billing.build_notifications(db, today)
            if n["kind"] == "overdue"]


def test_overdue_opening_balance_is_named_not_numbered():
    db = _session()
    cl = _client(db)
    today = date.today()
    as_of = today - timedelta(days=25)
    M.create_opening_balance(db, cl, 392_791_500, as_of)

    titles = _overdue_titles(db, today)
    assert len(titles) == 1
    t = titles[0]
    assert "OB-" not in t
    assert "хуучин үлдэгдэл" in t
    assert f"{as_of} хүртэл" in t                    # ХЭЗЭЭ хүртэлх үлдэгдэл вэ
    assert "25 хоног хэтэрлээ" in t


def test_overdue_entry_invoice_carries_her_label_not_a_code():
    db = _session()
    cl = _client(db, "Бутангууд")
    today = date.today()
    kind = sorted(entries.KINDS)[0]
    entries.create_entry(db, cl, today - timedelta(days=10), 139_648_000,
                         kind=kind, label="Байрны төлбөр суутгал")

    titles = _overdue_titles(db, today)
    assert len(titles) == 1
    t = titles[0]
    assert "A-" not in t
    assert "Байрны төлбөр суутгал" in t
    assert "10 хоног хэтэрлээ" in t


def test_overdue_rent_invoice_is_called_by_its_cycle_dates():
    db = _session()
    g = models.Grade(code="A", name="А", sort=1)
    m = models.Material(name="Хэв хашмал 6012", category="Хэв", base_rate=330)
    cl = _client(db)
    db.add_all([g, m])
    db.flush()
    start = date(2026, 3, 20)
    c = models.Contract(no="24/03", client_id=cl.id, type="rent", start_date=start,
                        cycle_days=30, penalty_percent=0)
    db.add(c)
    db.flush()
    db.add(models.ContractItem(contract_id=c.id, material_id=m.id, grade_id=g.id,
                               daily_rate=330))
    mv = models.Movement(contract_id=c.id, type="ISSUE", date=start, status="done")
    db.add(mv)
    db.flush()
    db.add(models.MovementLine(movement_id=mv.id, material_id=m.id, grade_id=g.id,
                               qty=100, rate=330))
    db.commit()

    today = start + timedelta(days=90)               # эхний цикл аль эрт хэтэрсэн
    titles = _overdue_titles(db, today)
    assert titles, "хэтэрсэн нэхэмжлэл байх ёстой"
    t = titles[0]
    assert "R-" not in t
    # Цонх нь [03-20, 04-19) хагас нээлттэй — дэлгэц дээр ХААНА Ч сүүлчийн
    # ХОНОГООР (04-18) бичдэг (гэрээний хуудас «08-22 – 09-20»), энд ч мөн адил.
    assert "2026-03-20 – 2026-04-18" in t

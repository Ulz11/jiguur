"""M5 / R4 — ЦИКЛИЙН ОГНОО ТҮҮНИЙ НҮДЭЭР: багтаамжтай (inclusive) дүрслэл.

Түүний циклийн шошго БАГТААМЖТАЙ: «3.15-4.13» гэдэг нь ЯГ 30 хоног (4.13 нь
циклд ОРНО). Хөдөлгүүр нь хагас нээлттэй [03-15, 04-14) цонхоор ажилладаг тул
дэлгэц дээр `cycle_end`-ийг ЯГ хэвээр хэвлэвэл төгсгөл нь ҮРГЭЛЖ нэг хоногоор
ХОЖУУ уншигдана — «машин нэг хоног нэмчихсэн» гэсэн эргэлзээ гарын үсэг
зурахаас өмнө төрнө.

ӨГӨГДӨЛ НЬ ХЭВЭЭР — зөвхөн ДҮРСЛЭЛ өөрчлөгдөнө: DB, тооцоо, spec түлхүүр,
rebuild бүгд хагас нээлттэй цонхоороо явсаар байна.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.services import billing
from tests.test_billing import setup_contract, mv


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def test_cycle_label_is_inclusive(db):
    """[03-15, 04-14) → «2026-03-15 – 2026-04-13» — 30 хоног, түүний уншилтаар."""
    assert billing.cycle_label(date(2026, 3, 15), date(2026, 4, 14)) \
        == "2026-03-15 – 2026-04-13"


def test_cycle_label_dotted_form_for_the_screen(db):
    """Дэлгэцийн шошго цэгтэй: «2026.03.15 – 2026.04.13»."""
    assert billing.cycle_label(date(2026, 3, 15), date(2026, 4, 14), dotted=True) \
        == "2026.03.15 – 2026.04.13"


def test_cycle_label_handles_month_ends(db):
    """Календарь-сарын цонх бүтэн сараа хэлнэ (2-р сар ч, 31 хоногтой сар ч)."""
    assert billing.cycle_label(date(2026, 4, 1), date(2026, 5, 1)) \
        == "2026-04-01 – 2026-04-30"
    assert billing.cycle_label(date(2026, 1, 31), date(2026, 2, 28)) \
        == "2026-01-31 – 2026-02-27"
    assert billing.cycle_label(date(2026, 12, 15), date(2027, 1, 15)) \
        == "2026-12-15 – 2027-01-14"


def test_cycle_label_of_a_single_day_window(db):
    """Нэг хоногийн цонх [d, d+1) → «d – d» — хоёр өөр огноо гарахгүй."""
    assert billing.cycle_label(date(2026, 5, 4), date(2026, 5, 5)) \
        == "2026-05-04 – 2026-05-04"
    # Хоосон цонх (худалдаа, OB) ч урвуу муж хэвлэхгүй
    assert billing.cycle_label(date(2026, 5, 4), date(2026, 5, 4)) \
        == "2026-05-04 – 2026-05-04"


def test_cycle_last_day_is_the_only_place_the_minus_one_lives(db):
    assert billing.cycle_last_day(date(2026, 4, 14)) == date(2026, 4, 13)
    assert billing.cycle_last_day(date(2026, 3, 1)) == date(2026, 2, 28)


def test_upcoming_payment_label_reads_inclusive(db):
    """Дашбоардын «Хүлээгдэж буй төлбөр» мөр ч түүний уншилтаар."""
    c, m, ga, gb = setup_contract(db, start=date(2026, 3, 20))
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])

    up = billing.upcoming_payment(c, date(2026, 4, 1))

    assert up["cycle_label"] == "2026.03.20 – 2026.04.18"
    # ӨГӨГДӨЛ нь ХАГАС НЭЭЛТТЭЙ хэвээр — зөвхөн шошго л багтаамжтай
    assert up["cycle_end"] == date(2026, 4, 19)


def test_appendix_period_line_reads_inclusive(db):
    """Хавсралтын «Тооцооны хугацаа» мөр — гарын үсэгтэй цаасны хугацаа."""
    from app.services import pdfappendix
    c, m, ga, gb = setup_contract(db, start=date(2026, 3, 20))
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    gmap, mmap = {ga.id: "А", gb.id: "В"}, {m.id: "Хэв хашмал 6012"}

    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))

    assert pdfappendix.period_text(ap) == "2026-03-20 – 2026-04-18"
    # Цонх өөрөө ХЭВЭЭР — мөрүүд 30 хоногоор бодогдоно
    assert ap.period_end == date(2026, 4, 19)
    assert ap.rows[0].days == 30

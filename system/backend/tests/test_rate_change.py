"""M6 / H6 · R3 — ТАРИФ ДАРААГИЙН ЦИКЛЭЭС: гарын үсэгтэй өнгөрсөн хөдлөхгүй.

Отгоо эгчийн Excel-д тариф циклүүдийн хооронд дахин тохирогддог (Мөнхболд
300→350→450). Түүний семантик нэг мөр: **ШИНЭ ТАРИФ ДАРААГИЙН ЦИКЛЭЭС** —
нэхэмжилсэн өнгөрсөн нь ХЭВЭЭР. Систем нь урьд нь `PATCH /items`-ээр
падангийн тарифыг УХРААЖ дарж бичдэг байсан бөгөөс дахин бодолт хийдэггүй:
нэхэмжлэгдсэн циклүүд хуучин дүнгээ хэдэн сар авч яваад, хамаагүй засварын
үед гэнэт үсэрдэг — «машин санамсаргүй түүх дахин бичлээ» (H6).

Одоо тариф нь ЯВДАЛ (`RateChange`): хэзээнээс, юунаас юу болов, тэмдэглэлтэй,
хүчингүй болгож болдог. Тооцоо нь ЦОНХООР шийднэ — цонх дотор ганц тариф
(`effective_from` нь заавал циклийн хил).

ХЭМЖИГДЭХҮҮН: 100ш × 300₮ × 30 хоног = 900,000₮ → 350₮ болбол 1,050,000₮.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"  # in-memory

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app import models
from app.services import billing

from tests.test_billing import setup_contract, mv


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def chg(db, c, m, g, *, new, eff, old=None, note="тохиролцов"):
    rc = models.RateChange(contract_id=c.id, material_id=m.id, grade_id=g.id,
                           old_rate=old, new_rate=new, effective_from=eff, note=note)
    db.add(rc)
    db.commit()
    db.refresh(c)
    return rc


def hundred(db, rate=300):
    """3.20-нд 100ш × `rate` гарсан гэрээ. Цонх: [3.20, 4.19), [4.19, 5.19)…"""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=rate)])
    return c, m, ga, gb


# ---------- хөдөлгүүр: цонх бүр өөрийн тарифаа шийднэ ----------

def test_next_cycle_change_leaves_the_signed_past_byte_stable(db):
    """Дараагийн циклээс тохирсон тариф нь ӨНГӨРСӨН цонхыг ХӨНДӨХГҮЙ.

    300 → 350: эхний цикл 900,000₮ хэвээр, хоёр дахь нь 1,050,000₮ болно.
    Энэ бол Мөнхболдын мөр — гарын үсэг зурсан цаас өөрөө өөрчлөгдөхгүй.
    """
    c, m, ga, gb = hundred(db)
    w0, w1 = billing.cycle_window(c, 0), billing.cycle_window(c, 1)
    assert billing.accrue_rent(c, *w0)[0] == pytest.approx(100 * 300 * 30)

    chg(db, c, m, ga, old=300, new=350, eff=w1[0])

    assert billing.accrue_rent(c, *w0)[0] == pytest.approx(900_000)
    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(100 * 350 * 30)


def test_history_wide_change_restates_every_window(db):
    """«Бүх түүхэнд» (эхлэх огноогоор) нь өнгөрснийг ч дахин тоолно."""
    c, m, ga, gb = hundred(db)
    chg(db, c, m, ga, old=300, new=350, eff=c.start_date)
    assert billing.accrue_rent(c, *billing.cycle_window(c, 0))[0] == pytest.approx(1_050_000)


def test_chained_changes_take_the_latest_boundary_at_or_before_the_window(db):
    """300 → 350 (2 дахь цикл) → 450 (4 дэх цикл): цонх бүр өөрийн тарифтай.

    Мөнхболдын гурван тариф. Гурав дахь цикл нь 350-аар (450 хараахан
    эхлээгүй), дөрөв дэх нь 450-аар нэхэгдэнэ.
    """
    c, m, ga, gb = hundred(db)
    chg(db, c, m, ga, old=300, new=350, eff=billing.cycle_window(c, 1)[0])
    chg(db, c, m, ga, old=300, new=450, eff=billing.cycle_window(c, 3)[0])

    rents = [billing.accrue_rent(c, *billing.cycle_window(c, n))[0] for n in range(4)]
    assert rents == [pytest.approx(x) for x in (900_000, 1_050_000, 1_050_000, 1_350_000)]


def test_old_rate_scope_touches_one_generation_only(db):
    """`old_rate` нь ПАДАНГИЙН ҮЕИЙГ заана — нөгөө нь хөдлөхгүй.

    330₮-ийн 100ш ба 300₮-ийн 50ш падан: 330 → 400 болгоход 300-ийн падан
    ХЭВЭЭР. Энэ бол `PATCH /items`-ийн `old_rate` дүрэм, одоо явдал болов.
    """
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)])
    w1 = billing.cycle_window(c, 1)

    chg(db, c, m, ga, old=330, new=400, eff=w1[0])

    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(100 * 400 * 30 + 50 * 300 * 30)


def test_unscoped_change_moves_every_generation(db):
    """`old_rate` заагаагүй бол материал+зэрэглэлийн БҮХ падан хөдөлнө."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)])
    w1 = billing.cycle_window(c, 1)

    chg(db, c, m, ga, new=400, eff=w1[0])

    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(150 * 400 * 30)


def test_voided_change_restores_the_old_rate(db):
    """Хүчингүй болсон өөрчлөлт нь тооцоонд ОГТ БАЙХГҮЙ мэт — тариф буцна."""
    c, m, ga, gb = hundred(db)
    w1 = billing.cycle_window(c, 1)
    rc = chg(db, c, m, ga, old=300, new=350, eff=w1[0])
    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(1_050_000)

    rc.voided_at = date(2026, 5, 1)
    db.commit()
    db.refresh(c)
    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(900_000)


def test_other_material_is_untouched(db):
    """Өөр материал/зэрэглэлийн өөрчлөлт хөндөлдөхгүй."""
    c, m, ga, gb = hundred(db)
    w1 = billing.cycle_window(c, 1)
    other = models.Material(name="Тулаас В2", category="Тулаас", base_rate=110)
    db.add(other)
    db.flush()
    chg(db, c, other, ga, new=999, eff=w1[0])
    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(900_000)


# ---------- зурвас ба хавсралт нэг л сувгаар уншина ----------

def test_segments_and_accrual_agree_after_a_change(db):
    """ТЭНЦЭЛ: Σ зурвас == accrue_rent — тарифын өөрчлөлттэй ч ХЭВЭЭР."""
    c, m, ga, gb = hundred(db)
    mv(db, c, "RETURN", date(2026, 5, 1),
       [dict(material_id=m.id, grade_id=ga.id, qty=40, return_grade_id=gb.id)])
    w1 = billing.cycle_window(c, 1)
    chg(db, c, m, ga, old=300, new=350, eff=w1[0])

    segs = billing.accrue_rent_segments(c, *w1)
    assert sum(s["amount"] for s in segs) == pytest.approx(billing.accrue_rent(c, *w1)[0])
    # Хавсралтын мөр бүр ШИНЭ тарифыг авч явна — цонх дотор ганц тариф
    assert {s["rate"] for s in segs} == {350}


def test_no_intra_window_split_appears(db):
    """Цонх дотор тариф ХОЁР болохгүй — `effective_from` нь заавал циклийн хил.

    Дараагийн циклээс тохирсон тариф нь ӨМНӨХ цонхны зурвасуудыг хагалахгүй.
    """
    c, m, ga, gb = hundred(db)
    chg(db, c, m, ga, old=300, new=350, eff=billing.cycle_window(c, 1)[0])
    assert {s["rate"] for s in billing.accrue_rent_segments(c, *billing.cycle_window(c, 0))} \
        == {300}


# ---------- M5 гар хоног + M6 тариф хамтдаа ----------

def test_manual_days_and_new_rate_compose(db):
    """Гар хоног × ШИНЭ тариф — хоёр шийдвэр нэг мөрөнд үржинэ (H5 + H6).

    [4.19, 5.19) цонхонд 100ш байснаас 30ш 5.1-нд буцав; Отгоо түүнийг 13
    хоног гэж тоолсон. Тариф энэ циклээс 350 болсон бол:
        30ш × 13 хоног × 350 + 70ш × 30 хоног × 350 = 136,500 + 735,000
    """
    c, m, ga, gb = hundred(db)
    r = mv(db, c, "RETURN", date(2026, 5, 1),
           [dict(material_id=m.id, grade_id=ga.id, qty=30, return_grade_id=gb.id)])
    w1 = billing.cycle_window(c, 1)
    r.lines[0].billed_days_override = 13
    db.commit()
    chg(db, c, m, ga, old=300, new=350, eff=w1[0])

    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(30 * 13 * 350 + 70 * 30 * 350)
    assert billing.accrue_rent(c, *w1)[0] == pytest.approx(871_500)


# ---------- цонхны хил ----------

def test_cycle_boundary_helpers(db):
    """`is_cycle_boundary` / `next_cycle_start` — UI-ийн сонголтын эх сурвалж."""
    c, m, ga, gb = hundred(db)
    assert billing.is_cycle_boundary(c, date(2026, 3, 20))
    assert billing.is_cycle_boundary(c, date(2026, 4, 19))
    assert not billing.is_cycle_boundary(c, date(2026, 4, 18))
    assert not billing.is_cycle_boundary(c, date(2026, 3, 19))     # эхлэхээс өмнө

    assert billing.next_cycle_start(c, date(2026, 4, 1)) == date(2026, 4, 19)
    assert billing.this_cycle_start(c, date(2026, 4, 1)) == date(2026, 3, 20)
    # ЯГ хил дээр зогсоход «дараагийн» нь дараагийнх л байна
    assert billing.next_cycle_start(c, date(2026, 4, 19)) == date(2026, 5, 19)


def test_calendar_month_boundaries_follow_the_month_step(db):
    """Календарь горимд хил нь САРЫН зангилаа (M3-тай нэг замаар)."""
    c, m, ga, gb = hundred(db)
    c.cycle_mode = "month"
    db.commit()
    assert billing.is_cycle_boundary(c, date(2026, 4, 20))
    assert not billing.is_cycle_boundary(c, date(2026, 4, 19))
    assert billing.next_cycle_start(c, date(2026, 4, 1)) == date(2026, 4, 20)

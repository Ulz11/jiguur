"""M6 / H7 — ХААЛТЫН ЗАН ҮЙЛ: эцсийн ТАСАРХАЙ цикл нэхэмжлэл болно.

«Хэлцэл хаахад тоолуур зогсдоггүй» байв: `end_date` ч, `status="closed"` ч
хуримтлалыг зогсоодоггүй, эцсийн хэсэгчилсэн цикл ХЭЗЭЭ Ч нэхэмжлэл болдоггүй
(spec нь зөвхөн БҮТЭН цонхыг гаргадаг). Отгоо эгчийн ёслол нь эсрэгээрээ:
эцсийн ТАСАРХАЙ циклээ нэхэж → дутагдуулсныг НБҮнээр барагдуулж → барьцааг
цэвэрлээд → «хаав» гэж бичдэг.

Одоо хаалт нь ОГНОО авч явна (`closed_date`) бөгөөс эцсийн цонх нь
[циклийн эхлэл, closed_date + 1) болж, ЯГ тэр дугаараар нэхэмжлэгдэнэ.

ХЭМЖИГДЭХҮҮН: 100ш × 330₮; [4.19, 5.19) циклийн бараа 5.03-нд буцаж ирээд
тэр өдрөө хаагдвал цонх нь [4.19, 5.04) — гэхдээ хоногийн муж нь ХАГАС
НЭЭЛТТЭЙ ХЭВЭЭР (гарсан өдөр тоологдож, буцсан өдөр тоологдохгүй) тул
100 × 330 × 14 = 462,000₮. Тасархай цонх нь ЦОНХ л шинэ — ХОНОГИЙН ДҮРЭМ хэвээр.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"  # in-memory

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app import models
from app.services import billing, rebuild as rebuild_svc

from tests.test_billing import setup_contract, mv


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


LATER = date(2026, 9, 1)          # «өнөөдөр» — хаалтаас хойш сар гаруй


def _closed(db, c, when: date):
    c.status = "closed"
    c.closed_date = when
    db.commit()
    db.refresh(c)
    return c


def _issued(db, qty=100, rate=330):
    """3.20-нд `qty`ш гарсан гэрээ. Цонх: [3.20, 4.19), [4.19, 5.19)…"""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=qty, rate=rate)])
    return c, m, ga, gb


def _specs(c, today=LATER, **kw):
    return billing.derivable_invoice_specs(c, today, **kw)


# ---------- 1. Эцсийн тасархай цикл ----------

def test_close_mid_cycle_emits_the_final_partial_invoice(db):
    """5.03-нд бүгдийг буцааж хаавал [4.19, 5.04) цонх нь өөрөө нэхэмжлэл болно.

    Хоног нь буцаалтын ЖИНХЭНЭ хуримтлал: 4.19-өөс 5.03 хүртэл 14 хоног
    (буцсан өдөр тоологдохгүй — хөдөлгүүрийн хагас нээлттэй дүрэм ХЭВЭЭР).
    """
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 3),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    _closed(db, c, date(2026, 5, 3))

    specs = _specs(c)
    assert len(specs) == 2
    last = specs[-1]
    assert (last["cycle_start"], last["cycle_end"]) == (date(2026, 4, 19), date(2026, 5, 4))
    assert last["rent_amount"] == pytest.approx(100 * 330 * 14)
    assert last["rent_amount"] == pytest.approx(462_000)
    assert last["due_date"] == date(2026, 5, 4)
    assert last["no"] == "R-24/03-2"            # дугаарлалт нь ЦОНХНООС — хэвээр


def test_open_contract_still_emits_complete_windows_only(db):
    """Хаагдаагүй гэрээнд дуусаагүй цикл нэхэмжлэл болохгүй — ХЭВЭЭР."""
    c, m, ga, gb = _issued(db)
    specs = _specs(c, today=date(2026, 5, 3))
    assert [(s["cycle_start"], s["cycle_end"]) for s in specs] \
        == [(date(2026, 3, 20), date(2026, 4, 19))]


def test_legacy_closed_contract_without_a_date_is_untouched(db):
    """Огноогүй (хуучин) хаалт нь зан төлөвөө ОГТ өөрчлөхгүй — stub төрөхгүй."""
    c, m, ga, gb = _issued(db)
    c.status = "closed"
    db.commit()
    db.refresh(c)
    specs = _specs(c, today=date(2026, 5, 3))
    assert [(s["cycle_start"], s["cycle_end"]) for s in specs] \
        == [(date(2026, 3, 20), date(2026, 4, 19))]


def test_no_phantom_stub_when_everything_came_back_earlier(db):
    """Бүх бараа өмнөх циклд буцсан бол ХООСОН stub төрөхгүй.

    4.10-нд бүгд буцаж, 5.03-нд хаалаа: [4.19, 5.04) цонхонд юу ч гадаа
    байгаагүй тул «0₮ нэхэмжлэл» гэсэн хий цаас гарахгүй.
    """
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 4, 10),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    _closed(db, c, date(2026, 5, 3))

    wins = [(s["cycle_start"], s["cycle_end"]) for s in _specs(c)]
    assert wins == [(date(2026, 3, 20), date(2026, 4, 19))]


def test_akt_inside_the_stub_window_lands_in_it(db):
    """Тасархай цонх доторх актын бичилт нь ЭЦСИЙН нэхэмжлэлд эвхэгдэнэ."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 4, 25),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 4, 28),
                           amount=1_163_500, note="Кран дуудлага"))
    db.commit()
    _closed(db, c, date(2026, 5, 3))

    last = _specs(c)[-1]
    assert (last["cycle_start"], last["cycle_end"]) == (date(2026, 4, 19), date(2026, 5, 4))
    assert last["rent_amount"] == pytest.approx(100 * 330 * 6)     # 4.19 → 4.25
    assert last["charge_amount"] == pytest.approx(1_163_500)
    assert last["total"] == pytest.approx(100 * 330 * 6 + 1_163_500)


def test_akt_only_stub_still_becomes_an_invoice(db):
    """Түрээс 0 ч акт байвал цаас гарна — «нэхэх зүйл байна» гэсэн дүрэм."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 4, 10),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    db.add(models.AktEntry(contract_id=c.id, date=date(2026, 4, 25),
                           amount=350_000, note="Тээвэр"))
    db.commit()
    _closed(db, c, date(2026, 5, 3))

    last = _specs(c)[-1]
    assert last["cycle_start"] == date(2026, 4, 19)
    assert last["rent_amount"] == 0 and last["charge_amount"] == pytest.approx(350_000)


def test_closing_on_the_last_day_of_a_window_matches_the_full_cycle(db):
    """Циклийн СҮҮЛЧИЙН хоногоор хаавал цонх нь бүтэн циклтэйгээ ЯГ тэнцүү."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 18),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    _closed(db, c, date(2026, 5, 18))          # [4.19, 5.19) цонхны сүүлчийн хоног

    last = _specs(c)[-1]
    assert (last["cycle_start"], last["cycle_end"]) == (date(2026, 4, 19), date(2026, 5, 19))
    assert last["rent_amount"] == pytest.approx(100 * 330 * 29)   # 4.19 → 5.18


def test_nothing_accrues_after_the_close_date(db):
    """Хаасны дараах цонхонд нэхэмжлэл ҮҮСЭХГҮЙ — тоолуур ЗОГСОНО (H7)."""
    c, m, ga, gb = _issued(db)
    _closed(db, c, date(2026, 5, 3))           # бараа гадаа үлдсэн ч (гар аргаар)
    wins = [(s["cycle_start"], s["cycle_end"]) for s in _specs(c, today=LATER)]
    assert wins[-1] == (date(2026, 4, 19), date(2026, 5, 4))
    assert all(s["cycle_start"] < date(2026, 5, 4) for s in _specs(c))


def test_closed_contract_has_no_live_cycle_left(db):
    """ХААГДСАН гэрээнд «явагдаж буй цикл» БАЙХГҮЙ — эцсийн тасархай цонх нь
    аль хэдийн ЖИНХЭНЭ нэхэмжлэл болсон.

    РЕГРЕСС (E2E-ээр баригдсан): `current_cycle_accrual` нь хаалтыг үл ойшоон
    ЯГ ТЭР цонхны түрээсийг «амьд хуримтлал» гэж дахин буцаадаг байв. Авлага
    нь ГАНЦ тодорхойлолттой (H9b: нэхэмжилсэн үлдэгдэл + хуримтлал) тул
    гэрээний «Нийт үлдэгдэл», харилцагчийн авлага, дашбоардын KPI, Авлага
    цуглуулах ДӨРВҮҮЛЭЭ хаагдсан гэрээ тутамд эцсийн циклийн дүнгээр
    хөөрөгддөг байсан: 1,452,000₮-ийн оронд 1,914,000₮.
    """
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 3),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    _closed(db, c, date(2026, 5, 3))
    today = date(2026, 5, 3)                   # хаасан ӨДРӨӨРӨӨ харж байна
    billing.ensure_invoices(db, c, today)

    assert billing.current_cycle_accrual(c, today) is None
    b = billing.contract_balance(c, today)
    assert b["accruing"] == 0
    outstanding = sum(billing.invoice_outstanding(i) for i in c.invoices)
    # [3.20, 4.19) 30 хоног + [4.19, 5.04) 14 хоног
    assert outstanding == pytest.approx(100 * 330 * (30 + 14))
    assert billing.contract_receivable(c, today)["total"] == pytest.approx(outstanding)
    assert billing.contract_receivable(c, today)["uninvoiced"] == 0


def test_active_contract_still_accrues_its_running_cycle(db):
    """Хаалтын засвар нь АМЬД гэрээг хөндөхгүй — хуримтлал хэвээр гүйнэ."""
    c, m, ga, gb = _issued(db)
    cur = billing.current_cycle_accrual(c, date(2026, 5, 3))
    assert cur is not None
    assert cur["accrued"] == pytest.approx(100 * 330 * 15)      # 4.19 → 5.03


def test_legacy_closed_contract_keeps_its_old_accrual_behaviour(db):
    """Огноогүй (хуучин) хаалт нь зан төлөвөө ОГТ өөрчлөхгүй — stub төрдөггүй
    тул тэнд давхар тоолол ч байхгүй."""
    c, m, ga, gb = _issued(db)
    c.status = "closed"
    db.commit()
    db.refresh(c)
    assert billing.current_cycle_accrual(c, date(2026, 5, 3)) is not None


# ---------- 2. Дахин бодолт нь ЯГ ТҮҮНИЙГ дахин гаргана ----------

def test_specs_are_stable_across_two_rebuilds(db):
    """Хоёр удаа дахин бодоход нэхэмжлэлүүд ЯГ ижил — stub нь тогтвортой."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 3),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    _closed(db, c, date(2026, 5, 3))
    billing.ensure_invoices(db, c, LATER)

    def snap():
        return sorted((i.no, i.cycle_start, i.cycle_end, round(i.total, 2))
                      for i in c.invoices)

    first = snap()
    assert len(first) == 2
    rebuild_svc.rebuild_contract_invoices(db, c, LATER)
    db.refresh(c)
    assert snap() == first
    rebuild_svc.rebuild_contract_invoices(db, c, LATER)
    db.refresh(c)
    assert snap() == first


def test_ensure_invoices_materialises_the_stub_once(db):
    """`ensure_invoices` олон удаа дуудагдахад stub ДАВХАРДАХГҮЙ."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 3),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    _closed(db, c, date(2026, 5, 3))
    assert len(billing.ensure_invoices(db, c, LATER)) == 2
    assert billing.ensure_invoices(db, c, LATER) == []
    assert len(c.invoices) == 2


# ---------- 3. Урьдчилан харах — DB-д юу ч бичихгүй ----------

def test_close_date_override_previews_without_writing(db):
    """`close_date=` нь ХААГААГҮЙ гэрээн дээр эцсийн дүнг ХАРУУЛНА (wizard)."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 3),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])

    specs = _specs(c, today=date(2026, 5, 3), close_date=date(2026, 5, 3))
    assert specs[-1]["rent_amount"] == pytest.approx(462_000)
    # Гэрээ хөндөгдөөгүй — жинхэнэ spec нь ХЭВЭЭР
    assert c.status == "active" and c.closed_date is None
    assert len(_specs(c, today=date(2026, 5, 3))) == 1


def test_last_movement_day_is_the_close_floor(db):
    """Сүүлийн хөдөлгөөний огноо — хаалтын ДООД хил (API-ийн валидацийн эх)."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 3),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    assert billing.last_movement_day(c) == date(2026, 5, 3)


def test_rate_change_inside_the_stub_window_applies(db):
    """M6-ийн хоёр хагас нийлнэ: тасархай цикл ч ШИНЭ тарифаараа нэхэгдэнэ."""
    c, m, ga, gb = _issued(db)
    mv(db, c, "RETURN", date(2026, 5, 3),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, return_grade_id=gb.id)])
    db.add(models.RateChange(contract_id=c.id, material_id=m.id, grade_id=ga.id,
                             old_rate=330, new_rate=450,
                             effective_from=date(2026, 4, 19), note="дахин тохиров"))
    db.commit()
    _closed(db, c, date(2026, 5, 3))

    assert _specs(c)[-1]["rent_amount"] == pytest.approx(100 * 450 * 14)

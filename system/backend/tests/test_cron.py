"""Өдөр тутмын нэхэмжлэл — ХҮНГҮЙГЭЭР (H9).

Өнөөдрийг хүртэл нэхэмжлэл нь хэн нэгэн хуудас нээх агшинд л төрдөг байв
(`ensure_invoices` 11 хүсэлтийн зам дээр). Отгоо аппаа нээхгүй бол мөнгө
БАЙХГҮЙ: авлага нь дутуу, Авлага цуглуулах жагсаалт нь бодит байдлаас
хоцорно. Түүний компьютерээс нэхэх ганц шаардлага — НЭГ тоо, ҮРГЭЛЖ ОДООХ.

Энэ файл гурван зүйлийг барьцаална:
  1. Цагийн ЦЭВЭР тоо бодолт (`next_run_at`) — унтахгүйгээр шалгагдана;
  2. `generate_all` нь гэрээ БҮРД `ensure_invoices` дуудсантай ЯГ ИЖИЛ үр дүн
     гаргана (ПАРИТЕТ) — cron өөр «хувилбар» нэхэмжлэл төрүүлэхгүй;
  3. Нэг гэрээ унасан ч давхрага зогсохгүй; JIGUUR_NO_CRON=1 үед огт асахгүй.
"""
import os
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JIGUUR_NO_CRON", "1")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app import models
from app.services import billing, cron


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


# ---------- өгөгдөл барих туслах (хоёр DB-д ЯГ ижил ертөнц) ----------

def build_world(db, *, start=date(2026, 3, 20)):
    """Хоёр идэвхтэй түрээсийн гэрээ + нэг OB- үлдэгдэл шилжүүлэлт."""
    ga = models.Grade(code="A", name="А", sort=1)
    m = models.Material(name="Хэв хашмал 6012", category="Хэв", base_rate=330, repair_fee=15000)
    cl1 = models.Client(name="БЛҮҮМ технологи")
    cl2 = models.Client(name="Мөнхболд")
    db.add_all([ga, m, cl1, cl2])
    db.flush()
    db.add(models.Stock(material_id=m.id, grade_id=ga.id, on_hand=9000))

    out = []
    for no, cl, qty in (("24/03", cl1, 2131), ("24/04", cl2, 500)):
        c = models.Contract(no=no, client_id=cl.id, type="rent", start_date=start,
                            cycle_days=30, penalty_percent=0, status="active")
        db.add(c)
        db.flush()
        db.add(models.ContractItem(contract_id=c.id, material_id=m.id, grade_id=ga.id,
                                   daily_rate=330, unit_price=58000))
        mv = models.Movement(contract_id=c.id, type="ISSUE", date=start, status="done")
        db.add(mv)
        db.flush()
        db.add(models.MovementLine(movement_id=mv.id, material_id=m.id,
                                   grade_id=ga.id, qty=qty))
        out.append(c)

    # OB- (үлдэгдэл шилжүүлэлт): гараар бичигдсэн, ГАРГАЖ БОЛОХГҮЙ нэхэмжлэл
    ob = models.Contract(no=f"OB-{cl1.id}", client_id=cl1.id, type="rent",
                         start_date=start, cycle_days=30, penalty_percent=0,
                         status="active", note="Үлдэгдэл шилжүүлэлт")
    db.add(ob)
    db.flush()
    db.add(models.Invoice(contract_id=ob.id, no=f"OB-{cl1.id}", cycle_start=start,
                          cycle_end=start, due_date=start, rent_amount=1_000_000,
                          total=1_000_000, detail_json="{}"))
    db.commit()
    out.append(ob)
    return out


def fingerprint(db):
    """DB доторх нэхэмжлэлийн ХУРУУНЫ ХЭЭ — дараалалаас хамаарахгүй."""
    return sorted((i.contract.no, i.no, str(i.cycle_start), str(i.cycle_end),
                   round(i.total, 2)) for i in db.query(models.Invoice).all())


TODAY = date(2026, 7, 1)


# ---------- 1. Цагийн цэвэр математик ----------

def test_next_run_is_today_when_the_hour_is_still_ahead():
    now = datetime(2026, 8, 31, 4, 30, 0)
    assert cron.next_run_at(now, 6) == datetime(2026, 8, 31, 6, 0, 0)


def test_next_run_rolls_to_tomorrow_when_the_hour_has_passed():
    now = datetime(2026, 8, 31, 6, 0, 1)
    assert cron.next_run_at(now, 6) == datetime(2026, 9, 1, 6, 0, 0)


def test_next_run_at_the_exact_hour_waits_a_full_day():
    """Яг 06:00:00 дээр зогсвол ДАХИН гүйхгүй — өдөрт нэг л удаа."""
    now = datetime(2026, 8, 31, 6, 0, 0)
    assert cron.next_run_at(now, 6) == datetime(2026, 9, 1, 6, 0, 0)


def test_next_run_crosses_month_and_year_boundaries():
    assert cron.next_run_at(datetime(2026, 12, 31, 23, 59, 0), 6) == datetime(2027, 1, 1, 6, 0, 0)


def test_seconds_until_is_never_negative_and_never_over_a_day():
    for h in range(24):
        for m in (0, 17, 59):
            s = cron.seconds_until(datetime(2026, 8, 31, h, m, 0), 6)
            assert 0 < s <= 24 * 3600


def test_seconds_until_counts_the_gap():
    assert cron.seconds_until(datetime(2026, 8, 31, 5, 30, 0), 6) == 1800.0


# ---------- 2. Паритет: cron ≡ хүсэлтийн зам ----------

def test_generate_all_creates_exactly_what_per_contract_ensure_would(db):
    """Cron-ы гаргасан нэхэмжлэл нь хуудас нээхэд гарахтай ЯГ ИЖИЛ.

    Хоёр өөр DB-д ижил ертөнц барьж, нэгд нь `generate_all`, нөгөөд нь
    гэрээ бүрээр `ensure_invoices` дуудаад хуруу хээг нь тулгана.
    """
    build_world(db)
    res = cron.generate_all(db, TODAY)

    engine2 = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine2)
    db2 = sessionmaker(bind=engine2, expire_on_commit=False)()
    for c in build_world(db2):
        billing.ensure_invoices(db2, c, TODAY)

    assert fingerprint(db) == fingerprint(db2)
    assert res["created"] == len(fingerprint(db2)) - 1     # OB- нь өмнөөс байсан
    db2.close()


def test_generate_all_second_run_creates_nothing(db):
    """Идемпотент — өдөр бүр гүйсэн ч давхар нэхэмжлэл ТӨРӨХГҮЙ."""
    build_world(db)
    first = cron.generate_all(db, TODAY)
    assert first["created"] > 0
    snap = fingerprint(db)

    second = cron.generate_all(db, TODAY)
    assert second["created"] == 0
    assert second["contracts"] == []
    assert fingerprint(db) == snap


def test_generate_all_never_derives_an_ob_transfer_contract(db):
    """OB- гэрээ гараар бичигдсэн — cron түүнд ЮУ Ч НЭМЭХГҮЙ."""
    contracts = build_world(db)
    ob = contracts[-1]
    cron.generate_all(db, TODAY)
    assert [i.no for i in ob.invoices] == [ob.no]


def test_closing_a_contract_freezes_what_the_cron_can_add(db):
    """Хаалт нь тоолуурыг ЗОГСООНО — cron сар өнгөрсөн ч юу ч нэмэхгүй (H7)."""
    c = build_world(db)[0]
    cron.generate_all(db, date(2026, 5, 20))
    before = sorted(i.no for i in c.invoices)
    assert before

    c.status, c.closed_date = "closed", date(2026, 5, 1)
    db.commit()

    res = cron.generate_all(db, TODAY)          # 7-р сар хүртэл алхлаа
    db.refresh(c)
    assert c.no not in res["contracts"]
    assert sorted(i.no for i in c.invoices) == before


def test_generate_all_touches_only_active_contracts(db):
    """Хаагдсан гэрээг cron өөрөө СЭРГЭЭХГҮЙ — зөвхөн идэвхтэйг нь алхна."""
    c1, c2, _ob = build_world(db)
    c2.status = "closed"
    c2.closed_date = None
    db.commit()

    cron.generate_all(db, TODAY)
    db.refresh(c2)
    assert c2.invoices == []
    assert c1.invoices


def test_generate_all_applies_client_credit_like_the_request_paths(db):
    """Урьдчилж төлсөн мөнгө cron-ын гаргасан нэхэмжлэлд ӨӨРӨӨ хаагдана.

    Мөнхболд (OB- үлдэгдэлгүй) — 500,000₮ нь ЗӨВХӨН шинэ циклүүд рүү орно.
    """
    c2 = build_world(db)[1]
    db.add(models.Payment(client_id=c2.client_id, date=date(2026, 4, 1),
                          amount=500_000, method="BANK"))
    db.commit()

    cron.generate_all(db, TODAY)
    db.refresh(c2)
    assert sum(i.paid for i in c2.invoices) == pytest.approx(500_000)


# ---------- 3. Давхрага унахгүй ----------

def test_one_broken_contract_does_not_stop_the_others(db, monkeypatch):
    """Нэг гэрээ дээр алдаа гарвал ҮЛДСЭН нь бүгд нэхэгдсэн хэвээр."""
    c1, c2, _ob = build_world(db)
    real = billing.ensure_invoices

    def boom(session, contract, today=None):
        if contract.id == c1.id:
            raise RuntimeError("падангийн дэвтэр эвдэрлээ")
        return real(session, contract, today)

    monkeypatch.setattr(cron.billing, "ensure_invoices", boom)
    res = cron.generate_all(db, TODAY)

    assert len(res["errors"]) == 1
    assert res["errors"][0]["no"] == c1.no
    db.refresh(c2)
    assert c2.invoices, "унасан гэрээ нөгөөгийнхийг зогсоох ёсгүй"


def test_run_once_writes_one_audit_line_when_it_created_something(db, monkeypatch):
    monkeypatch.setattr(cron, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)
    build_world(db)

    res = cron.run_once(TODAY)
    logs = db.query(models.AuditLog).filter_by(action="cron").all()
    assert len(logs) == 1
    assert f"cron: {res['created']} нэхэмжлэл үүсэв" in logs[0].detail


def test_a_run_that_created_nothing_stays_silent(db, monkeypatch):
    monkeypatch.setattr(cron, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)
    build_world(db)
    cron.run_once(TODAY)

    cron.run_once(TODAY)      # хоёр дахь гүйлт — юу ч үүсэхгүй
    assert db.query(models.AuditLog).filter_by(action="cron").count() == 1


# ---------- 4. JIGUUR_NO_CRON ----------

def test_env_flag_disables_the_scheduler(monkeypatch):
    monkeypatch.setenv("JIGUUR_NO_CRON", "1")
    assert cron.disabled() is True
    monkeypatch.setenv("JIGUUR_NO_CRON", "0")
    assert cron.disabled() is False
    monkeypatch.delenv("JIGUUR_NO_CRON", raising=False)
    assert cron.disabled() is False


def test_no_task_is_scheduled_under_the_test_flag(monkeypatch):
    """Тестийн орчинд давхрага ОГТ асахгүй — суут детерминистик хэвээр."""
    from app.main import app
    monkeypatch.setenv("JIGUUR_NO_CRON", "1")
    with TestClient(app):
        assert app.state.cron_task is None


def test_the_task_is_scheduled_when_the_flag_is_absent(monkeypatch):
    from app.main import app
    monkeypatch.delenv("JIGUUR_NO_CRON", raising=False)
    with TestClient(app):
        t = app.state.cron_task
        assert t is not None and not t.done()
    # Хаагдахад заавал цуцлагдана — сервер унтрахад давхрага үлдэхгүй
    assert app.state.cron_task is None


# ---------- 5. Гар товчлуур нь ЯГ ижил замаар явна ----------

def test_manual_trigger_shares_the_same_service(client, as_role):
    r = client.post("/api/invoices/generate", headers=as_role("sanhuu"))
    assert r.status_code == 200
    body = r.json()
    assert "created" in body and "date" in body
    # хоёр дахь дуудалт — 0 (идемпотент)
    assert client.post("/api/invoices/generate",
                       headers=as_role("sanhuu")).json()["created"] == 0


def test_factory_cannot_trigger_generation(client, as_role):
    assert client.post("/api/invoices/generate",
                       headers=as_role("darga")).status_code == 403

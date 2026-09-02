"""КАЛЕНДАРЬ-САРЫН мөчлөг (H3 / R5) — цөөнх боловч ГЭРЭЭГЭЭР баталгаажсан горим.

Отгоогийн харилцагчдын цөөнх нь 30 хоногт зангидсан циклээр БИШ, ЖИНХЭНЭ
КАЛЕНДАРЬ САРААР нэхэгддэг ('4.01-4.30' → '5.01-5.31'). Тэр сарууд өөр өөр
урттай тул 31 хоногтой сар нь 30 хоногтой сараас ×31/30 ИЛҮҮ нэхэгддэг —
түүний хуудсанд 40,899,600₮ ба 42,262,920₮ гэж хоёр зэрэгцээ мөр болж
батлагдсан (42,262,920 / 40,899,600 = 31/30 яг таг).

Энэ горимгүйгээр тэдгээр харилцагчийн тоо нь ГАРЫН ҮСЭГТЭЙ гэрээгээ
зөрчинө — тэр хуудсууд Excel-д үлдэж, сар-хаалт бүхэлдээ Excel-д үлдэнэ.

ХАЗГАЙЛАЛТЫН (clamp) ДҮРЭМ — энэ файл түүнийг ХАМГААЛНА:
    Хил бүр нь гэрээний ЭХЛЭХ ОГНООНООС «n сар нэмэх»-ээр гарна; хэрэв
    зангилааны өдөр (эхлэх огнооны day) тухайн сард байхгүй бол ТЭР САРЫН
    СҮҮЛЧИЙН ӨДӨР болж хумигдана. Хумилт нь ХЭЗЭЭ Ч хадгалагддаггүй — дараагийн
    хил дахин ЭХЛЭЛЭЭС бодогдох тул зангилаа боломжтой газраа ЭРГЭЖ ОЧНО:
        1.31 → 2.28 → 3.31 → 4.30 → 5.31   (өндөр жилд 2.29)
    Иймд цонхнууд нь зайгүй, давхцалгүй залгаа үлдэнэ.
"""
import os
import sys
from calendar import monthrange
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

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


def month_contract(db, start=date(2026, 4, 1), penalty=0.0):
    """Календарь-сарын гэрээ — `cycle_days` нь утгагүй болно."""
    c, m, ga, gb = setup_contract(db, start=start, penalty=penalty)
    c.cycle_mode = "month"
    db.commit()
    db.refresh(c)
    return c, m, ga, gb


def wins(c, today):
    return [(cs, ce) for cs, ce, _ in billing.cycles_of(c, today)]


# ---------- 1. Цонхнууд ----------

def test_month_mode_first_of_month_gives_true_calendar_months(db):
    """1-нд эхэлсэн гэрээ → жинхэнэ календарь сарууд: 4-р сар 30, 5-р сар 31 хоног."""
    c, *_ = month_contract(db, start=date(2026, 4, 1))
    assert wins(c, date(2026, 6, 15)) == [
        (date(2026, 4, 1), date(2026, 5, 1)),
        (date(2026, 5, 1), date(2026, 6, 1)),
        (date(2026, 6, 1), date(2026, 7, 1)),
    ]
    apr, may, _ = billing.cycles_of(c, date(2026, 6, 15))
    assert (apr[1] - apr[0]).days == 30
    assert (may[1] - may[0]).days == 31


def test_month_mode_mid_month_anchor_runs_14th_to_13th(db):
    """14-нд зангидсан гэрээ: 3.14→4.14→5.14 — өдөр нь ХЭВЭЭР үлдэнэ."""
    c, *_ = month_contract(db, start=date(2026, 3, 14))
    assert wins(c, date(2026, 5, 20)) == [
        (date(2026, 3, 14), date(2026, 4, 14)),
        (date(2026, 4, 14), date(2026, 5, 14)),
        (date(2026, 5, 14), date(2026, 6, 14)),
    ]


def test_month_mode_ignores_cycle_days(db):
    """Календарь горимд `cycle_days` тооцоонд ОГТ оролцохгүй."""
    c, *_ = month_contract(db, start=date(2026, 4, 1))
    c.cycle_days = 7
    db.commit()
    assert wins(c, date(2026, 5, 15))[0] == (date(2026, 4, 1), date(2026, 5, 1))


def test_days_mode_stays_the_default_and_unchanged(db):
    """Анхны утга «days» — хуучин гэрээ бүр 30 хоногийн зангидсан циклээрээ."""
    c, *_ = setup_contract(db, start=date(2026, 3, 20))
    assert c.cycle_mode == "days"
    assert wins(c, date(2026, 5, 25)) == [
        (date(2026, 3, 20), date(2026, 4, 19)),
        (date(2026, 4, 19), date(2026, 5, 19)),
        (date(2026, 5, 19), date(2026, 6, 18)),
    ]


# ---------- 2. Хазгайлалт (clamp) ба өндөр жил ----------

def test_month_mode_clamps_31st_anchor_into_february_then_resumes(db):
    """1.31 → 2.28 → 3.31: хумилт нь ЗӨВХӨН тэр сард үйлчилж, зангилаа эргэж очно."""
    c, *_ = month_contract(db, start=date(2026, 1, 31))
    assert wins(c, date(2026, 5, 15)) == [
        (date(2026, 1, 31), date(2026, 2, 28)),
        (date(2026, 2, 28), date(2026, 3, 31)),
        (date(2026, 3, 31), date(2026, 4, 30)),
        (date(2026, 4, 30), date(2026, 5, 31)),
    ]


def test_month_mode_leap_year_february_ends_on_the_29th(db):
    """Өндөр жил: 2028.1.31 → 2.29 (2026 бол 28) → 3.31."""
    c, *_ = month_contract(db, start=date(2028, 1, 31))
    assert wins(c, date(2028, 4, 15)) == [
        (date(2028, 1, 31), date(2028, 2, 29)),
        (date(2028, 2, 29), date(2028, 3, 31)),
        (date(2028, 3, 31), date(2028, 4, 30)),
    ]


def test_month_mode_windows_are_contiguous_with_no_gaps(db):
    """Цонхнууд ЗАЛГАА: өмнөхийн төгсгөл = дараагийнхийн эхлэл, зайгүй.

    Хумигдсан хил (2.28) нь дараагийн циклийн ЭХЛЭЛ болох тул нэг ч хоног
    хоёр цикл дунд алдагдахгүй, давхардахгүй — 12 сарын турш."""
    c, *_ = month_contract(db, start=date(2026, 1, 31))
    for start in (date(2026, 1, 29), date(2026, 1, 30), date(2026, 1, 31),
                  date(2026, 8, 15), date(2027, 12, 31)):
        c.start_date = start
        db.commit()
        w = [billing.cycle_window(c, n) for n in range(13)]
        for (a_s, a_e), (b_s, _) in zip(w, w[1:]):
            assert a_e == b_s, f"{start}: {a_e} != {b_s}"
        assert w[12][0] == date(start.year + 1, start.month, start.day)


# ---------- 3. ×31/30 — Отгоогийн хоёр мөр ----------

def test_31_day_month_bills_exactly_31_over_30_of_the_30_day_month(db):
    """ИЖИЛ тоо × ИЖИЛ тариф: 5-р сарын нэхэмжлэл = 4-р сарынх × 31/30.

    Тусгай кодгүй — 31 хоногийн цонх өдрийн тарифаар 31 хоног хуримтлуулснаас
    үр дүн нь ӨӨРӨӨ гарна (түүний Excel: 40,899,600₮ → 42,262,920₮).
    """
    c, m, ga, _ = month_contract(db, start=date(2026, 4, 1))
    mv(db, c, "ISSUE", date(2026, 4, 1), [dict(material_id=m.id, grade_id=ga.id, qty=100)])

    created = billing.ensure_invoices(db, c, date(2026, 6, 1))
    apr = next(i for i in created if i.cycle_start == date(2026, 4, 1))
    may = next(i for i in created if i.cycle_start == date(2026, 5, 1))

    assert apr.rent_amount == pytest.approx(100 * 330 * 30)     # 990,000
    assert may.rent_amount == pytest.approx(100 * 330 * 31)     # 1,023,000
    assert may.rent_amount == pytest.approx(apr.rent_amount * 31 / 30)


def test_february_bills_less_than_march_at_the_same_rate(db):
    """2-р сар (28 хоног) нь 3-р сараас (31) БАГА нэхэгдэнэ — сар нь өөрөө урттай."""
    c, m, ga, _ = month_contract(db, start=date(2026, 2, 1))
    mv(db, c, "ISSUE", date(2026, 2, 1), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    inv = {i.cycle_start.month: i for i in billing.ensure_invoices(db, c, date(2026, 4, 1))}
    assert inv[2].rent_amount == pytest.approx(100 * 330 * 28)
    assert inv[3].rent_amount == pytest.approx(100 * 330 * 31)


# ---------- 4. Хэсэгчилсэн хуримтлал ----------

def test_month_mode_bills_from_the_issue_date_inside_the_window(db):
    """Календарь горимд эхлэл нь ЗАНГИЛАА — гэхдээ бараа хожуу гарвал ТЭР
    өдрөөс нэхэгдэнэ (эхний цикл өөрөө хэсэгчилсэн болно).

    4.01-нд эхэлсэн гэрээнд бараа 4.11-нд гарсан → 4-р сарын цонхонд 20 хоног
    (4.11 → 5.01), 5-р сарын цонхонд бүтэн 31 хоног.
    """
    c, m, ga, _ = month_contract(db, start=date(2026, 4, 1))
    mv(db, c, "ISSUE", date(2026, 4, 11), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    inv = {i.cycle_start.month: i for i in billing.ensure_invoices(db, c, date(2026, 6, 1))}
    assert inv[4].rent_amount == pytest.approx(100 * 330 * 20)
    assert inv[5].rent_amount == pytest.approx(100 * 330 * 31)


def test_month_mode_prorates_a_midcycle_return(db):
    """Сарын дундуур ирсэн буцаалт өдрөөрөө пропорцлогдоно (30 хоногийнхтой адил)."""
    c, m, ga, gb = month_contract(db, start=date(2026, 5, 1))
    mv(db, c, "ISSUE", date(2026, 5, 1), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    mv(db, c, "RETURN", date(2026, 5, 11), [dict(material_id=m.id, grade_id=ga.id, qty=40,
                                                 return_grade_id=gb.id)])
    total, _ = billing.accrue_rent(c, date(2026, 5, 1), date(2026, 6, 1))
    # 100ш × 10 хоног + 60ш × 21 хоног
    assert total == pytest.approx((100 * 10 + 60 * 21) * 330)


# ---------- 5. Дугаарлалт ----------

def test_month_cycle_index_counts_month_steps_from_the_start(db):
    """Дугаар = эхлэлээс хойшхи САРЫН алхмын тоо (+1) — огнооноос гарна."""
    c, *_ = month_contract(db, start=date(2026, 1, 31))
    assert billing.cycle_index(c, date(2026, 1, 31)) == 1
    assert billing.cycle_index(c, date(2026, 2, 28)) == 2      # хумигдсан хил ч гэсэн
    assert billing.cycle_index(c, date(2026, 3, 31)) == 3
    assert billing.cycle_index(c, date(2027, 1, 31)) == 13     # жил дамжина


def test_month_mode_invoice_numbers_survive_regeneration(db):
    """Устгаад дахин үүсгэхэд нэхэмжлэлийн дугаар ЯГ ХЭВЭЭР — байрлалаас биш
    огнооноос гардаг тул.

    1.31-нд эхэлсэн гэрээ; цикл 1 [1.31, 2.28), 2 [2.28, 3.31), 3 [3.31, 4.30)…
    Бараа 4.05-нд гарсан тул эхний ХОЁР цикл хоосон — эхний нэхэмжлэл нь "-1"
    БИШ, "-3" дугаартай төрөх ёстой (мөн хумигдсан хил дамжсан ч гэсэн)."""
    from app.services import rebuild

    c, m, ga, _ = month_contract(db, start=date(2026, 1, 31))
    mv(db, c, "ISSUE", date(2026, 4, 5), [dict(material_id=m.id, grade_id=ga.id, qty=50)])
    created = billing.ensure_invoices(db, c, date(2026, 7, 1))
    first = [(i.no, i.cycle_start, i.cycle_end, round(i.total, 2)) for i in created]
    assert [n for n, *_ in first] == ["R-24/03-3", "R-24/03-4", "R-24/03-5"]
    assert first[0][1:3] == (date(2026, 3, 31), date(2026, 4, 30))

    rebuild.rebuild_contract_invoices(db, c, date(2026, 7, 1))
    db.expire_all()
    again = sorted([(i.no, i.cycle_start, i.cycle_end, round(i.total, 2))
                    for i in c.invoices], key=lambda r: r[1])
    assert again == first


# ---------- 6. Явагдаж буй цикл ба төсөөлөл ----------

def test_current_cycle_days_total_is_the_real_window_length(db):
    """Явагдаж буй циклийн «нийт хоног» нь `cycle_days` БИШ, ЦОНХНЫ урт."""
    c, m, ga, _ = month_contract(db, start=date(2026, 5, 1))
    mv(db, c, "ISSUE", date(2026, 5, 1), [dict(material_id=m.id, grade_id=ga.id, qty=10)])
    cur = billing.current_cycle_accrual(c, date(2026, 5, 10))
    assert cur["days_total"] == 31          # 5-р сар, `cycle_days` = 30 биш
    assert cur["days_done"] == 10


def test_upcoming_payment_projects_the_whole_month_window(db):
    """Төсөөлөл нь ТУХАЙН САРЫН бүтэн цонхыг (31 хоног) нэхнэ."""
    c, m, ga, _ = month_contract(db, start=date(2026, 5, 1))
    mv(db, c, "ISSUE", date(2026, 5, 1), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    up = billing.upcoming_payment(c, date(2026, 5, 10))
    assert up["cycle_start"] == date(2026, 5, 1)
    assert up["cycle_end"] == date(2026, 6, 1)
    assert up["expected_date"] == date(2026, 6, 1)
    assert up["projected_amount"] == pytest.approx(100 * 330 * 31)
    # ШОШГЫН ФОРМАТ (M5/R4): цонх нь [5.01, 6.01) хэвээр, шошго нь БАГТААМЖТАЙ —
    # 5-р сар 31 хоног гэдэг нь «5.01 – 5.31» гэж уншигдана.
    assert up["cycle_label"] == "2026.05.01 – 2026.05.31"


def test_upcoming_payment_matches_the_month_invoice_that_will_be_issued(db):
    """Төсөөлсөн дүн нь цикл хаагдахад ТӨРӨХ нэхэмжлэлтэй яг таарна."""
    c, m, ga, _ = month_contract(db, start=date(2026, 5, 1))
    mv(db, c, "ISSUE", date(2026, 5, 1), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    up = billing.upcoming_payment(c, date(2026, 5, 20))
    inv = billing.ensure_invoices(db, c, date(2026, 6, 1))[0]
    assert inv.rent_amount == pytest.approx(up["projected_amount"])
    assert inv.due_date == up["expected_date"]


# ---------- 7. Дуудлагын бусад цэгүүд (хоногийн арифметик үлдээгүй эсэх) ----------

def test_cash_forecast_projects_month_windows_not_30_days(db):
    """Мөнгөний прогноз нь ирээдүйн циклийг ЦОНХООРООР нь тооцно.

    Хуучин код `day_amount × cycle_days` гэж үржүүлээд `+30 хоног` гэж
    урагшилдаг байв — календарь гэрээнд тэр нь 31 хоногийн сарыг 30-аар
    доогуур тооцоод, циклийн төгсгөлийг хуанлигаас салгана.
    """
    from app.services import analytics

    c, m, ga, _ = month_contract(db, start=date(2026, 5, 1))
    mv(db, c, "ISSUE", date(2026, 5, 1), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    db.commit()

    res = analytics.cash_forecast(db, date(2026, 5, 20))
    rows = [it for b in res["buckets"] for it in b["items_in"] if "цикл хаагдана" in it["label"]]
    assert [r["date"] for r in rows][:3] == ["2026-06-01", "2026-07-01", "2026-08-01"]
    # 6-р сар 30 хоног, 7-р сар 31 — дүн нь цонхныхоо уртаар ялгаатай
    assert rows[0]["amount"] == round(100 * 330 * 31)      # 5-р сар (явагдаж буй)
    assert rows[1]["amount"] == round(100 * 330 * 30)      # 6-р сар
    assert rows[2]["amount"] == round(100 * 330 * 31)      # 7-р сар


def test_contract_pdf_clause_states_the_month_anchor_not_a_day_count(db):
    """Гэрээний PDF §2.1: календарь горимд «сар бүрийн N-нд» гэж бичигдэнэ.

    «30 хоног тутам» гэж хэвлэвэл ГАРЫН ҮСЭГТЭЙ баримт нь системийн тооцоотой
    зөрнө — Отгоогийн хамгийн эмзэг итгэлийн цэг.
    """
    from app.services import pdfgen

    c, *_ = month_contract(db, start=date(2026, 5, 14))
    joined = " ".join(pdfgen._payment_clauses(c, 100.0, 0.0))
    assert "хоног тутам" not in joined
    assert "сар бүрийн 14" in joined


# ---------- 8. Хавсралт ----------

def test_appendix_renders_for_a_month_mode_contract(db):
    """Хавсралт нь ЦОНХЫГ л зурдаг — календарь горимд ч хэвлэгдэнэ."""
    from app.services import pdfappendix

    c, m, ga, _ = month_contract(db, start=date(2026, 5, 1))
    mv(db, c, "ISSUE", date(2026, 5, 1), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    inv = billing.ensure_invoices(db, c, date(2026, 6, 5))[0]
    gmap = {g.id: g.code for g in db.query(models.Grade).all()}
    mmap = {x.id: x.name for x in db.query(models.Material).all()}

    out = pdfappendix.invoice_appendix_pdf(db, inv, gmap, mmap)
    assert out[:4] == b"%PDF"

    live = pdfappendix.cycle_appendix_pdf(db, c, gmap, mmap, date(2026, 6, 10))
    assert live[:4] == b"%PDF"


# ================= API: горим солих ХААЛГА (RebuildModal-ийн урсгал) =================
#
# Горим солих нь `start_date` солихтой ЯГ адил — БҮХ цикл шинээр зурагдана.
# Тиймээс нэхэмжлэлтэй гэрээнд ижил хуурай ажиллагааны (dry-run) хаалгаар
# ордог: эхлээд зөрүү, `confirm` ирсэн үед л дахин бодолт.

from datetime import timedelta as _td


def _iso(days_ago: int) -> str:
    return str(date.today() - _td(days=days_ago))


def _make_contract(client, as_role, start_days_ago: int, cycle_mode=None, qty=100):
    """Гэрээ үүсгээд эхний ачилтыг дарга баталгаажуулна. → гэрээний id."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": f"Календарь ХХК {start_days_ago}"},
                     headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    body = {"client_id": cl["id"], "type": "rent", "start_date": _iso(start_days_ago),
            "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                       "qty": qty, "daily_rate": 330}]}
    if cycle_mode:
        body["cycle_mode"] = cycle_mode
    cid = client.post("/api/contracts", headers=h, json=body).json()["id"]
    hd = as_role("darga")
    for p in client.get("/api/dashboard", headers=hd).json()["pending_shipments"]:
        if p["contract_id"] == cid:
            client.post(f"/api/movements/{p['id']}/confirm", headers=hd)
    return cid


def test_wizard_can_create_a_calendar_month_contract(client, as_role):
    """POST /api/contracts нь `cycle_mode`-ыг хүлээж авна; анхны утга «days»."""
    h = as_role("otgoo")
    cid = _make_contract(client, as_role, 40, cycle_mode="month")
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert d["cycle_mode"] == "month"

    plain = _make_contract(client, as_role, 41)
    assert client.get(f"/api/contracts/{plain}", headers=h).json()["cycle_mode"] == "days"


def test_switch_mode_is_free_on_a_contract_with_no_invoices(client, as_role):
    """Нэхэмжлэлгүй гэрээнд горим солих нь ЧӨЛӨӨТЭЙ — дахин бодох юм алга."""
    h = as_role("otgoo")
    cid = _make_contract(client, as_role, 5)          # 5 хоног → цикл хаагдаагүй
    r = client.patch(f"/api/contracts/{cid}", headers=h, json={"cycle_mode": "month"})
    assert r.status_code == 200, r.text
    assert "rebuild_required" not in r.json()
    assert client.get(f"/api/contracts/{cid}", headers=h).json()["cycle_mode"] == "month"


def test_switch_mode_on_an_invoiced_contract_previews_then_rebuilds(client, as_role):
    """Нэхэмжлэлтэй гэрээ: эхлээд ЗӨРҮҮ, дараа нь `confirm` — start_date-тай ижил.

    Урьдчилан харах нь DB-д НЭГ Ч мөр үлдээхгүй; баталсны дараа нэхэмжлэлүүд
    САРЫН хэлбэртэй болж, дугаар нь шинэ циклүүдээсээ гарна.
    """
    h = as_role("otgoo")
    cid = _make_contract(client, as_role, 95)         # 3 цикл хаагдсан
    before = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert len(before["invoices"]) >= 3

    r = client.patch(f"/api/contracts/{cid}", headers=h, json={"cycle_mode": "month"})
    assert r.status_code == 200, r.text
    prev = r.json()
    assert prev["rebuild_required"] is True
    assert prev["diffs"], "зөрүүний жагсаалт хоосон байна"
    # Хуурай ажиллагаа — юу ч хадгалагдаагүй
    mid = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert mid["cycle_mode"] == "days"
    assert [i["no"] for i in mid["invoices"]] == [i["no"] for i in before["invoices"]]

    r2 = client.patch(f"/api/contracts/{cid}", headers=h,
                      json={"cycle_mode": "month", "confirm": True})
    assert r2.status_code == 200, r2.text
    assert r2.json()["rebuilt"]["created"] >= 1

    after = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert after["cycle_mode"] == "month"
    start = date.fromisoformat(after["start_date"])
    for inv in after["invoices"]:
        cs = date.fromisoformat(inv["cycle_start"])
        ce = date.fromisoformat(inv["cycle_end"])
        # Цикл нь гэрээний ЭХЛЭХ ӨДРӨӨР зангидагдана, богино сард тухайн сарын
        # сүүлийн өдөр хүртэл хумигдана (`billing.add_months` → `monthrange`).
        # Өмнө нь «эсвэл 28» гэсэн таамаг байсан нь 5-р сарын 31-нд эхэлсэн
        # гэрээ дээр унадаг: 6-р сарын цикл нь 30-нд эхэлнэ (28 ч биш, 31 ч биш).
        assert cs.day == min(start.day, monthrange(cs.year, cs.month)[1]), \
            f"{cs} нь {start.day}-ний зангилаанаас гарлаа"
        assert 28 <= (ce - cs).days <= 31, f"{cs} – {ce} нь сарын цонх биш"
        idx = (cs.year - start.year) * 12 + cs.month - start.month + 1
        assert inv["no"].endswith(f"-{idx}")


def test_switch_back_to_days_mode_also_goes_through_the_gate(client, as_role):
    """Буцаад 30 хоног болгох нь ч ижил хаалгаар — нэг чигийн хаалга байж болохгүй."""
    h = as_role("otgoo")
    cid = _make_contract(client, as_role, 95, cycle_mode="month")
    client.get(f"/api/contracts/{cid}", headers=h)     # нэхэмжлэл төрүүлнэ (H9)
    assert client.patch(f"/api/contracts/{cid}", headers=h,
                        json={"cycle_mode": "days"}).json()["rebuild_required"] is True
    client.patch(f"/api/contracts/{cid}", headers=h,
                 json={"cycle_mode": "days", "confirm": True})
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert d["cycle_mode"] == "days"
    for inv in d["invoices"]:
        cs = date.fromisoformat(inv["cycle_start"])
        assert (date.fromisoformat(inv["cycle_end"]) - cs).days == 30


def test_cycle_days_now_travels_the_gate_too(client, as_role):
    """`cycle_days` мөн адил — хуучин зан төлөв хэвээр (регресс)."""
    h = as_role("otgoo")
    cid = _make_contract(client, as_role, 95)
    client.get(f"/api/contracts/{cid}", headers=h)     # нэхэмжлэл төрүүлнэ (H9)
    r = client.patch(f"/api/contracts/{cid}", headers=h, json={"cycle_days": 15})
    assert r.json()["rebuild_required"] is True


def test_unknown_cycle_mode_is_refused(client, as_role):
    h = as_role("otgoo")
    cid = _make_contract(client, as_role, 5)
    r = client.patch(f"/api/contracts/{cid}", headers=h, json={"cycle_mode": "quarter"})
    assert r.status_code == 400
    assert "мөчлөг" in r.json()["detail"].lower()


def test_only_the_manager_may_switch_the_cycle_mode(client, as_role):
    """Санхүүч алданги/тэмдэглэл засдаг ч ТООЦООНЫ ХЭЛБЭРТ хүрэхгүй."""
    h = as_role("otgoo")
    cid = _make_contract(client, as_role, 5)
    r = client.patch(f"/api/contracts/{cid}", headers=as_role("sanhuu"),
                     json={"cycle_mode": "month"})
    assert r.status_code == 403
    assert client.get(f"/api/contracts/{cid}", headers=h).json()["cycle_mode"] == "days"


def test_contract_list_rows_carry_the_cycle_mode(client, as_role):
    """ЖАГСААЛТ дээр «аль харилцагч календарь сараар тооцогддог вэ» гэдэг харагдана.

    Дэлгэрэнгүй хуудас `cycle_mode`-оо мэддэг байсан ч жагсаалт нь мэддэггүй
    байв — Отгоо гэрээ бүрийг нээж үзэхээс өөр аргагүй болдог. Календарь горим
    нь нэхэмжлэлийн ОГНОО, циклийн УРТЫГ (31 хоногийн сар) хоёуланг өөрчилдөг
    тул жагсаалтаас ялгагдах ёстой.
    """
    h = as_role("otgoo")
    monthly = _make_contract(client, as_role, 40, cycle_mode="month")
    plain = _make_contract(client, as_role, 41)

    rows = {r["id"]: r for r in client.get("/api/contracts", headers=h).json()}
    assert rows[monthly]["cycle_mode"] == "month"
    # Анхны горим нь ЧИМЭЭГҮЙ дутуу байж болохгүй — талбар нь ҮРГЭЛЖ ирнэ
    assert rows[plain]["cycle_mode"] == "days"

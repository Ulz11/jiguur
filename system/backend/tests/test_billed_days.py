"""M5 / H5 — ХОНОГИЙГ ТЭР эзэмшинэ: буцаалтын мөрийн гар хоног + падан-pin.

Хоёр тал 12 хоног гэж гарын үсэг зурсан бол 12 нь хэлцлийн баримт. Машин 11
гэж бодсон ч гарын үсэгтэй цаас 12-ыг авч явна — тэгэхгүй бол хавсралт нь
гэрээ зөрчинө. Тиймээс буцаалтын мөр бүр өөрийн `billed_days_override` авч
явна; тооцоо ТҮҮНИЙ тоогоор явна, зөрүү нь ИЛ тэмдэглэгдэнэ.

ХЭМЖИГДЭХҮҮН (Блүүмийн хэмжээст): 3.20-нд 240ш гарч, 4.1-нд 30ш буцвал
буцсан 30ш нь 12 хоног гадаа байсан гэж машин боддог. Отгоо 13 гэж тоолсон бол
зөрүү нь ЯГ (13 − 12) × 30ш × 330₮ = 9,900₮.
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


F, T = date(2026, 3, 20), date(2026, 4, 19)      # эхний циклийн цонх [3.20, 4.19)


def _two_forty(db):
    """240ш 3.20-нд гарч, 30ш 4.1-нд буцсан гэрээ. Буцаалтын МӨРийг буцаана."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=240, rate=330)])
    r = mv(db, c, "RETURN", date(2026, 4, 1),
           [dict(material_id=m.id, grade_id=ga.id, qty=30, return_grade_id=gb.id)])
    return c, m, ga, gb, r.lines[0]


# ---------- хөдөлгүүр ----------

def test_override_shifts_accrual_by_exactly_the_day_difference(db):
    """Гар хоног нь ЯГ (гараар − системээр) × тоо × тариф-аар л хөдөлгөнө.

    240ш × 12 хоног + 210ш × 18 хоног = 2,197,800₮ (авто). Отгоо буцсан 30ш-ийг
    13 хоног гэж тоолсон бол +1 × 30 × 330 = 9,900₮ л нэмэгдэнэ — өөр юу ч биш.
    """
    c, m, ga, gb, ln = _two_forty(db)
    assert billing.accrue_rent(c, F, T)[0] == pytest.approx(2_197_800)

    ln.billed_days_override = 13
    db.commit()
    db.refresh(c)

    assert billing.accrue_rent(c, F, T)[0] == pytest.approx(2_197_800 + 1 * 30 * 330)


def test_override_can_shorten_the_count_too(db):
    """Тэр 10 хоног гэж тоолсон бол хоёр хоногийн зөрүү ХАСАГДАНА (−2 × 30 × 330)."""
    c, m, ga, gb, ln = _two_forty(db)
    ln.billed_days_override = 10
    db.commit()
    db.refresh(c)

    assert billing.accrue_rent(c, F, T)[0] == pytest.approx(2_197_800 - 2 * 30 * 330)


def test_segments_invariant_holds_with_the_override(db):
    """ТЭНЦЭЛ: Σ сегмент == accrue_rent — гар хоногтой ч ХЭВЭЭР.

    Хоёр тал нэг л алхалтаас гардаг тул хавсралт ба нэхэмжлэл ХЭЗЭЭ Ч зөрөхгүй.
    Задаргаа нь Отгоогийн дэвтрийнх: буцсан хэсэг нь ӨӨРИЙН мөртэй (30ш × 13
    хоног), үлдсэн нь бүтэн циклээрээ (210ш × 30 хоног).
    """
    c, m, ga, gb, ln = _two_forty(db)
    ln.billed_days_override = 13
    db.commit()
    db.refresh(c)

    segs = billing.accrue_rent_segments(c, F, T)
    total, lines = billing.accrue_rent(c, F, T)

    assert sum(s["amount"] for s in segs) == pytest.approx(total)
    assert sum(s["qty"] * s["days"] for s in segs) == pytest.approx(
        sum(ln_["qty_days"] for ln_ in lines))
    ov = [s for s in segs if s["override"]]
    assert len(ov) == 1
    assert (ov[0]["qty"], ov[0]["days"]) == (pytest.approx(30), 13)
    rest = [s for s in segs if not s["override"]]
    assert [(r["qty"], r["days"]) for r in rest] == [(pytest.approx(210), 30)]


def test_override_touches_only_the_window_holding_the_return(db):
    """Хоёр цикл дамнасан падан: ӨМНӨХ цикл ердийнхөөрөө нэхэгдэнэ.

    3.20-нд 100ш гарч 5.1-нд 40ш буцахад эхний цикл (3.20–4.19) бүтэн 30 хоног
    хэвээр; гар хоног нь зөвхөн буцаалт БУУСАН цикл (4.19–5.19) дотор ажиллана.
    """
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    r = mv(db, c, "RETURN", date(2026, 5, 1),
           [dict(material_id=m.id, grade_id=ga.id, qty=40, return_grade_id=gb.id)])
    first_before = billing.accrue_rent(c, F, T)[0]

    r.lines[0].billed_days_override = 15        # системээр 12
    db.commit()
    db.refresh(c)

    assert billing.accrue_rent(c, F, T)[0] == pytest.approx(first_before)
    second = billing.accrue_rent(c, date(2026, 4, 19), date(2026, 5, 19))[0]
    # авто: 100×12 + 60×18 = 2280 ш×хоног; гараар 15 → +3 × 40 = 2400
    assert second == pytest.approx(2400 * 330)


def test_override_never_leaks_past_the_cycle_end(db):
    """Цонхны уртаас урт хоног ХЭЗЭЭ Ч дараагийн цикл рүү халихгүй.

    Хөдөлгүүр өөрөө хумина: нэг мөр өөрийн циклийн хоногоос ИЛҮҮГ нэхэж
    чадахгүй (валидаци нь урд нь зогсоох боловч хөдөлгүүр ч бас хамгаална).
    """
    c, m, ga, gb, ln = _two_forty(db)
    ln.billed_days_override = 999
    db.commit()
    db.refresh(c)

    # 30ш нь ихдээ 30 хоног (цонхны урт), 210ш нь 30 хоног
    assert billing.accrue_rent(c, F, T)[0] == pytest.approx(240 * 30 * 330)
    # дараагийн цикл огт хөндөгдөхгүй — 210ш × 30 хоног
    assert billing.accrue_rent(c, T, date(2026, 5, 19))[0] == pytest.approx(210 * 30 * 330)


def test_override_applies_to_every_lot_the_return_consumed(db):
    """Хоёр падан дамнасан буцаалт — хоёуланд нь ТҮҮНИЙ хоног тавигдана.

    3.20-нд 100ш (330₮), 4.1-нд 50ш (300₮); 4.5-нд 70ш буцав → FIFO-гоор
    100ш-ийн падангаас 70ш. Гараар 20 хоног гэвэл тэр 70ш нь 20 хоногоор
    бодогдоно (авто нь 16).
    """
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=100, rate=330)])
    mv(db, c, "ISSUE", date(2026, 4, 1),
       [dict(material_id=m.id, grade_id=ga.id, qty=50, rate=300)])
    r = mv(db, c, "RETURN", date(2026, 4, 5),
           [dict(material_id=m.id, grade_id=ga.id, qty=70, return_grade_id=gb.id)])
    before = billing.accrue_rent(c, F, T)[0]

    r.lines[0].billed_days_override = 20
    db.commit()
    db.refresh(c)

    assert billing.accrue_rent(c, F, T)[0] == pytest.approx(before + 4 * 70 * 330)
    segs = billing.accrue_rent_segments(c, F, T)
    assert sum(s["amount"] for s in segs) == pytest.approx(billing.accrue_rent(c, F, T)[0])


def test_attribution_carries_both_counts_for_the_ledger(db):
    """Дэвтэрт ХОЁУЛАА гарна: түүний хоног ба системийн хоног.

    «12 хоног (гараар — системээр 11)» гэсэн зөрүүний тэмдэг эндээс тэжээгдэнэ.
    """
    c, m, ga, gb, ln = _two_forty(db)
    src = billing.return_attribution(c)[ln.id]
    assert len(src) == 1
    assert src[0]["days"] == 12 and src[0]["billed_days"] == 12
    assert src[0]["override"] is False

    ln.billed_days_override = 13
    db.commit()
    db.refresh(c)

    src = billing.return_attribution(c)[ln.id]
    assert src[0]["days"] == 12 and src[0]["billed_days"] == 13
    assert src[0]["override"] is True


# ---------- API: хаалга, валидаци, дахин бодолт ----------

def _iso(days_ago: int) -> str:
    from datetime import timedelta
    return str(date.today() - timedelta(days=days_ago))


def _confirm_all(client, as_role, cid):
    hd = as_role("darga")
    for p in client.get("/api/dashboard", headers=hd).json()["pending_shipments"]:
        if p["contract_id"] == cid:
            client.post(f"/api/movements/{p['id']}/confirm", headers=hd)


def _contract(client, as_role, h, qty=100, rate=330):
    """40 хоногийн өмнө эхэлсэн гэрээ — ЭХНИЙ ЦИКЛ ХААГДСАН (нэхэмжлэлтэй)."""
    cl = client.post("/api/clients", json={"name": "Гар хоног ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": _iso(40),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": qty, "daily_rate": rate}]}).json()["id"]
    _confirm_all(client, as_role, cid)
    return cid, m["id"], st["grade_id"]


def _return_line(client, h, cid):
    """Гэрээний дэвтрээс БУЦААЛТЫН мөрийг олно."""
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    for g in d["material_lines"]:
        for ln in g["lines"]:
            if ln["type"] == "RETURN":
                return ln
    raise AssertionError("буцаалтын мөр олдсонгүй")


def _cycle1_total(client, h, cid):
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    return sorted(d["invoices"], key=lambda i: i["cycle_start"])[0]["total"]


def test_override_rejects_more_days_than_the_cycle_holds(client, as_role):
    """Цонхонд багтахгүй хоног — ИЛЭРХИЙ татгалзал (чимээгүй хумилт БИШ)."""
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": _iso(25),
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 40}]})
    ln = _return_line(client, h, cid)

    r = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                     json={"billed_days_override": 31, "confirm": True})
    assert r.status_code == 400
    assert "30" in r.json()["detail"]

    r = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                     json={"billed_days_override": -1, "confirm": True})
    assert r.status_code == 400


def test_override_only_on_return_lines(client, as_role):
    """Олголтын мөрөнд гар хоног утгагүй — падан циклээ бүтнээр нь эзэлдэг."""
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    issue = d["material_lines"][0]["lines"][0]
    assert issue["type"] == "ISSUE"

    r = client.patch(f"/api/movement-lines/{issue['id']}", headers=h,
                     json={"billed_days_override": 10, "confirm": True})
    assert r.status_code == 400


def test_override_on_an_invoiced_cycle_shows_the_diff_then_rebuilds(client, as_role):
    """Нэхэмжлэгдсэн циклд гар хоног = ХУУРАЙ АЖИЛЛАГАА, дараа нь дахин бодолт.

    100ш × 330₮, 15 дахь хоногт 40ш буцав → 40×15 + 60×30 = 2400 ш×хоног =
    792,000₮. Отгоо 20 хоног гэж тоолсон бол +5 × 40 × 330 = 66,000₮.
    """
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": _iso(25),
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 40}]})
    ln = _return_line(client, h, cid)
    assert _cycle1_total(client, h, cid) == pytest.approx(792_000)

    dry = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                       json={"billed_days_override": 20})
    assert dry.status_code == 200
    body = dry.json()
    assert body["rebuild_required"] is True
    assert any(x["new_total"] - x["old_total"] == pytest.approx(66_000)
               for x in body["diffs"])
    assert _cycle1_total(client, h, cid) == pytest.approx(792_000)   # хараахан хөдлөөгүй

    ok = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                      json={"billed_days_override": 20, "confirm": True})
    assert ok.status_code == 200
    assert _cycle1_total(client, h, cid) == pytest.approx(858_000)
    assert _return_line(client, h, cid)["billed_days_override"] == 20


def test_clearing_the_override_restores_the_machine_count(client, as_role):
    """Хоосон = АВТО. Тэр буцаахад машины тоо ЯГ хэвэндээ орно."""
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": _iso(25),
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 40}]})
    ln = _return_line(client, h, cid)
    client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                 json={"billed_days_override": 20, "confirm": True})
    assert _cycle1_total(client, h, cid) == pytest.approx(858_000)

    r = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                     json={"billed_days_override": None, "confirm": True})
    assert r.status_code == 200
    assert _cycle1_total(client, h, cid) == pytest.approx(792_000)
    assert _return_line(client, h, cid)["billed_days_override"] is None


def test_return_can_be_created_with_her_day_count(client, as_role):
    """Буцаалт бүртгэх агшинд ЛЕ хоногоо бичиж болно — дараа нь засах шаардлагагүй."""
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": _iso(25),
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 40,
                   "billed_days_override": 20}]})
    assert r.status_code == 200
    ln = _return_line(client, h, cid)
    assert ln["billed_days_override"] == 20
    assert ln["sources"][0]["days"] == 15
    assert ln["sources"][0]["billed_days"] == 20
    assert ln["sources"][0]["override"] is True


def test_creation_rejects_an_impossible_day_count(client, as_role):
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": _iso(25),
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 40,
                   "billed_days_override": 45}]})
    assert r.status_code == 400


# ---------- Падан-pin бүртгэх агшинд (Task 2) ----------

def _issue_lines(client, h, cid):
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    return [ln for g in d["material_lines"] for ln in g["lines"] if ln["type"] == "ISSUE"]


def test_return_pins_the_chosen_lot_at_creation(client, as_role):
    """ХОЁР падан задгай байхад Отгоо АЛЬ-аас нь хасахыг бүртгэх агшинд заана.

    FIFO бол хуучин (330₮) падангаас хасах байсан; заавал ШИНЭ (300₮) падан
    сонгосон бол хамаарал түүнийг батална.
    """
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": _iso(20), "note": "Хоёр дахь падан",
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 50, "rate": 300}]})
    _confirm_all(client, as_role, cid)
    lots = _issue_lines(client, h, cid)
    assert len(lots) == 2
    second = next(x for x in lots if x["rate"] == 300)

    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": _iso(5),
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 30,
                   "issue_line_id": second["id"]}]})

    src = _return_line(client, h, cid)["sources"]
    assert len(src) == 1
    assert src[0]["issue_line_id"] == second["id"]
    assert src[0]["pinned"] is True
    assert src[0]["rate"] == 300


def test_creation_rejects_a_pin_from_another_material(client, as_role):
    """Сервер бүртгэх агшинд ч заалтыг нягтална — чимээгүй үл тоохгүй."""
    h = as_role("otgoo")
    cid, mid, gid = _contract(client, as_role, h)
    other_cid, other_mid, other_gid = _contract2(client, as_role, h)
    foreign = _issue_lines(client, h, other_cid)[0]

    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": _iso(5),
        "lines": [{"material_id": mid, "grade_id": gid, "qty": 30,
                   "issue_line_id": foreign["id"]}]})
    assert r.status_code == 400


def _contract2(client, as_role, h):
    cl = client.post("/api/clients", json={"name": "Хоёр дахь ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": _iso(40),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 20, "daily_rate": 330}]}).json()["id"]
    _confirm_all(client, as_role, cid)
    return cid, m["id"], st["grade_id"]


# ---------- Хавсралт: ТҮҮНИЙ тоо цаасан дээр, тэмдэгтэйгээ ----------

def test_appendix_prints_her_count_with_a_footnote_mark(db):
    """Гарын үсэгтэй цаас ТҮҮНИЙ хоногийг авч явна — тэмдэглэгээтэйгээ.

    Хавсралт нь машины тоог биш, гараар тохирсон тоог хэвлэнэ; хуудсан дээр
    зөрүү нь НУУГДАХГҮЙ (`*` тэмдэг + нэг мөр тайлбар).
    """
    from app.services import pdfappendix
    c, m, ga, gb, ln = _two_forty(db)
    gmap, mmap = {ga.id: "А", gb.id: "В"}, {m.id: "Хэв хашмал 6012"}

    plain = pdfappendix.build_appendix(c, gmap, mmap, F, T)
    assert not any(r.override for r in plain.rows)
    assert pdfappendix.legend_lines(plain) == []

    ln.billed_days_override = 13
    db.commit()
    db.refresh(c)

    ap = pdfappendix.build_appendix(c, gmap, mmap, F, T)
    marked = [r for r in ap.rows if r.override]
    assert len(marked) == 1
    assert (marked[0].qty, marked[0].days) == (pytest.approx(30), 13)
    assert pdfappendix.days_text(marked[0]) == "13*"
    assert pdfappendix.days_text(next(r for r in ap.rows if not r.override)) == "30"
    assert pdfappendix.legend_lines(ap) == ["* гараар тохирсон хоног"]
    # Дэд дүн нь хөдөлгүүрийн дүнтэй ХЭВЭЭР таарна
    assert ap.subtotal == pytest.approx(billing.accrue_rent(c, F, T)[0])

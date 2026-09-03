"""H5-ийн СҮҮЛЧИЙН МИЛЬ — хаалт нь тохирсон хоногийг чимээгүй хумидаг байв.

Гэрээ хаахад эцсийн цикл ТАСАРНА (`billing.py` — `ce = cd + 1`). Тэр тасархай
цонх нь падангийн цонхыг богиносгодог тул бүртгэх агшинд ЗӨВШӨӨРӨГДСӨН 20
хоног хавсралт дээр 16 болж хэвлэгддэг байв — гарын үсэг зурсан тоог машин
хаалтын мөчид дарж байсан гэсэн үг. Яг H5-ийн урьдчилан сэргийлэх гэсэн
зөрчил, зөвхөн өөр хаалгаар.

ШИНЭ ДҮРЭМ (эзний шийдвэр): ОТГОО ЭГЧ тохирсон хоногоо нэхнэ. Машин бодож,
санал болгож, АНХААРУУЛЖ болно — түүний тоог ЧИМЭЭГҮЙ ӨӨРЧЛӨХ эрхгүй.

Тамга нь `MovementLine.days_confirmed`: «энэ тоог ТЭР харж баталсан». Тамгатай
мөрийг хөдөлгүүр ХЭЗЭЭ Ч хумихгүй; тамгагүй мөр өнөөдрийнхөөрөө (бичих агшинд
шалгагдаж, хумилт нь тор хэвээр) үлдэнэ.

ХЭМЖИГДЭХҮҮН: 100ш × 330₮ гэрээ, 40 хоногийн өмнөх. 2-р цикл [−10, +20).
−5-нд 40ш буцахад Отгоо 12 хоног гэж тохирсон. −3-нд хаавал тасархай цонх
[−10, −2) нь ердөө 8 хоног — зөрүү нь ЯГ (12 − 8) × 40ш × 330₮ = 52,800₮.
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
from app.services import billing

from tests.test_billing import setup_contract, mv
from tests.test_api import iso, make_contract, _confirm_pending


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


# ---------- ХӨДӨЛГҮҮР ----------
#
# Цонх: 1-р цикл [3.20, 4.19). 240ш 3.20-нд гарч, 30ш 4.1-нд буцав (машин 12).
# 4.4-нд хаавал тасархай цонх [3.20, 4.5) — падангийн цонх 16 хоног болно.

CLOSE = date(2026, 4, 4)
WIN = (date(2026, 3, 20), date(2026, 4, 5))       # тасархай эцсийн цонх


def _lot_and_return(db, days: int, confirmed: bool):
    """240ш падан + 30ш буцаалт, ТҮҮНИЙ хоногтой. Гэрээг буцаана."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20),
       [dict(material_id=m.id, grade_id=ga.id, qty=240, rate=330)])
    r = mv(db, c, "RETURN", date(2026, 4, 1),
           [dict(material_id=m.id, grade_id=ga.id, qty=30, return_grade_id=gb.id)])
    ln = r.lines[0]
    ln.billed_days_override = days
    ln.days_confirmed = confirmed
    db.commit()
    db.refresh(c)
    return c, ln


def test_her_confirmed_count_survives_the_truncated_close_window(db):
    """ТАМГАТАЙ 20 хоног нь 16 хоногийн цонхонд ч ЯГ 20-оороо нэхэгдэнэ.

    30ш × 20 хоног + 210ш × 16 хоног = 1,306,800₮. Хумивал 1,267,200₮ —
    зөрүү нь ЯГ (20 − 16) × 30ш × 330₮ = 39,600₮, гарын үсэг зурсан мөнгө.
    """
    c, _ = _lot_and_return(db, 20, confirmed=True)
    total, _ = billing.accrue_rent(c, *WIN)
    assert total == pytest.approx(30 * 20 * 330 + 210 * 16 * 330)
    assert total == pytest.approx(1_306_800)


def test_without_the_stamp_the_old_net_still_clamps(db):
    """ТАМГАГҮЙ мөр өнөөдрийнхөөрөө — хумилт нь хэвээр (зан төлөв өөрчлөгдөөгүй)."""
    c, _ = _lot_and_return(db, 20, confirmed=False)
    total, _ = billing.accrue_rent(c, *WIN)
    assert total == pytest.approx(30 * 16 * 330 + 210 * 16 * 330)
    assert total == pytest.approx(1_267_200)


def test_the_segments_invariant_holds_with_an_unclamped_count(db):
    """Σ зурвас == accrue_rent — тэнцэл нь ХУМИЛТГҮЙ хоног дээр ч бүтэц хэвээр."""
    c, _ = _lot_and_return(db, 20, confirmed=True)
    total, _ = billing.accrue_rent(c, *WIN)
    segs = billing.accrue_rent_segments(c, *WIN)
    assert sum(s["amount"] for s in segs) == pytest.approx(total)
    over = [s for s in segs if s["override"]]
    assert len(over) == 1
    assert (over[0]["qty"], over[0]["days"]) == (30, 20)


def test_the_ledger_and_the_money_name_the_same_number(db):
    """`return_attribution` ба `_lot_segments` ЗӨРӨХ боломжгүй.

    Энэ нь яг тэр буг байсан: дэвтэр 20 гэж уншуулаад, мөнгө 16-аар явна.
    """
    c, ln = _lot_and_return(db, 20, confirmed=True)
    src = billing.return_attribution(c)[ln.id]
    assert len(src) == 1
    assert src[0]["billed_days"] == 20 and src[0]["days"] == 12
    assert src[0]["override"] is True
    seg = next(s for s in billing.accrue_rent_segments(c, *WIN) if s["override"])
    assert seg["days"] == src[0]["billed_days"]


def test_a_confirmed_count_inside_the_window_changes_nothing(db):
    """Зөрчилгүй тоо дээр тамга нь МӨНГИЙГ хөдөлгөхгүй — тамга бол хумилтын
    хаалга, нэмэлт эрх биш."""
    c, ln = _lot_and_return(db, 10, confirmed=True)
    stamped, _ = billing.accrue_rent(c, *WIN)
    ln.days_confirmed = 0                        # ЯГ ижил гэрээ, тамгаа мултлав
    db.commit()
    db.refresh(c)
    plain, _ = billing.accrue_rent(c, *WIN)
    assert stamped == pytest.approx(plain)
    assert stamped == pytest.approx(30 * 10 * 330 + 210 * 16 * 330)


def test_the_conflict_is_named_with_both_counts_and_the_difference(db):
    """Хаалт нь зөрчлийг ӨӨРӨӨ нэрлэнэ — хоёр тоо, ХОЁУЛАНГИЙН ₮."""
    c, ln = _lot_and_return(db, 20, confirmed=False)
    rows = billing.close_day_conflicts(c, CLOSE)
    assert len(rows) == 1
    r = rows[0]
    assert r["line_id"] == ln.id
    assert (r["agreed_days"], r["window_days"]) == (20, 16)
    assert r["agreed_amount"] == pytest.approx(30 * 20 * 330)
    assert r["window_amount"] == pytest.approx(30 * 16 * 330)
    assert r["diff_amount"] == pytest.approx(39_600)


def test_no_conflict_is_manufactured_when_the_window_holds_her_count(db):
    """Багтаж байгаа тоон дээр асуулт ГАРАХГҮЙ — хэрэггүй шийдвэр төрүүлэхгүй."""
    c, _ = _lot_and_return(db, 12, confirmed=False)
    assert billing.close_day_conflicts(c, CLOSE) == []


def test_an_already_confirmed_line_is_not_asked_twice(db):
    """Тамгатай мөр дахин асуугдахгүй — тэр шийдвэрээ аль хэдийн гаргасан."""
    c, _ = _lot_and_return(db, 20, confirmed=True)
    assert billing.close_day_conflicts(c, CLOSE) == []


def test_the_choice_can_be_previewed_without_writing_it(db):
    """Wizard-ийн «хэрэв» — гэрээнд хүрэхгүйгээр ТҮҮНИЙ сонголтоор бодно."""
    c, ln = _lot_and_return(db, 20, confirmed=False)
    picked, _ = billing.accrue_rent(c, *WIN, choices={ln.id: 20})
    assert picked == pytest.approx(1_306_800)
    windowed, _ = billing.accrue_rent(c, *WIN, choices={ln.id: 16})
    assert windowed == pytest.approx(1_267_200)
    # ГЭРЭЭНД ЮУ Ч БИЧИГДЭЭГҮЙ
    assert ln.billed_days_override == 20 and not ln.days_confirmed


# ---------- API: хаалтын wizard ----------

def _close_setup(client, as_role, days: int):
    """40 хоногийн өмнөх гэрээ; −5-нд 40ш (ТҮҮНИЙ хоногоор), −3-нд үлдсэн 60ш."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    client.patch(f"/api/contracts/{cid}", headers=h, json={"penalty_percent": 0})
    client.get(f"/api/contracts/{cid}", headers=h)              # ensure_invoices
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40,
                   "billed_days_override": days}]})
    assert r.status_code == 200, r.text
    r2 = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(3),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 60}]})
    assert r2.status_code == 200, r2.text
    return cid, m, st


def _session():
    """Тест клиентийн ЯГ ТЭР DB — хөдөлгүүрийг шууд асуухад."""
    from app.db import get_db
    from app.main import app
    return next(app.dependency_overrides[get_db]())


def _the_return_line(client, h, cid, qty):
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    for g in d["material_lines"]:
        for ln in g["lines"]:
            if ln["type"] == "RETURN" and ln["qty"] == qty:
                return ln
    raise AssertionError("буцаалтын мөр олдсонгүй")


# Тасархай цонх [−10, −2) = 8 хоног. Түүний 12 хоног нь 4 хоногоор ХЭТЭРНЭ.
AGREED, WINDOW, QTY, RATE = 12, 8, 40, 330
DIFF = (AGREED - WINDOW) * QTY * RATE                     # 52,800₮
HER_TOTAL = (QTY * AGREED + 60 * 7) * RATE                # 297,000₮
WINDOW_TOTAL = (QTY * WINDOW + 60 * 7) * RATE             # 244,200₮


def test_preview_surfaces_the_conflict_with_both_counts(client, as_role):
    """«Та 12 хоног гэж тохирсон · хаалтын огноогоор 8 хоног багтана» — ХОЁУЛАА."""
    h = as_role("otgoo")
    cid, m, st = _close_setup(client, as_role, AGREED)

    p = client.get(f"/api/contracts/{cid}/close-preview?close_date={iso(3)}",
                   headers=h).json()
    assert len(p["day_conflicts"]) == 1
    row = p["day_conflicts"][0]
    assert (row["agreed_days"], row["window_days"]) == (AGREED, WINDOW)
    assert row["diff_amount"] == DIFF
    assert row["material"] == m["name"]
    # ӨГӨГДМӨЛ нь ТҮҮНИЙ тоо — гарын үсэг зурсан нь тэр
    assert p["final_invoices"][0]["rent_amount"] == HER_TOTAL


def test_preview_follows_the_count_she_picks(client, as_role):
    """Сонгосон тоо нь ЯГ тэр агшинд амлалт болно (Receipt-ийн амлалт)."""
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, AGREED)
    ln = _the_return_line(client, h, cid, QTY)

    p = client.post(f"/api/contracts/{cid}/close-preview", headers=h, json={
        "close_date": iso(3),
        "day_choices": [{"line_id": ln["id"], "days": WINDOW}]}).json()
    assert p["final_invoices"][0]["rent_amount"] == WINDOW_TOTAL
    assert p["day_conflicts"] == []                       # шийдэгдсэн


def test_the_invoice_matches_what_the_step_promised(client, as_role):
    """АМЛАЛТ == ҮР ДҮН. Wizard 297,000₮ гэвэл цаас нь 297,000₮ болно."""
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, AGREED)

    promised = client.get(f"/api/contracts/{cid}/close-preview?close_date={iso(3)}",
                          headers=h).json()["final_invoices"][0]["total"]
    r = client.post(f"/api/contracts/{cid}/close", headers=h,
                    json={"close_date": iso(3)})
    assert r.status_code == 200, r.text
    assert len(r.json()["invoices"]) == 1
    assert r.json()["invoices"][0]["total"] == promised == HER_TOTAL


def test_closing_with_the_window_count_bills_the_window_count(client, as_role):
    """Тэр цонхны тоог сонговол ЯГ тэр нэхэгдэнэ — сонголт нь жинхэнэ."""
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, AGREED)
    ln = _the_return_line(client, h, cid, QTY)

    r = client.post(f"/api/contracts/{cid}/close", headers=h, json={
        "close_date": iso(3),
        "day_choices": [{"line_id": ln["id"], "days": WINDOW}]})
    assert r.status_code == 200, r.text
    assert r.json()["invoices"][0]["total"] == WINDOW_TOTAL
    assert _the_return_line(client, h, cid, QTY)["billed_days_override"] == WINDOW


def test_she_can_type_a_third_number_at_close(client, as_role):
    """«Өөр тоо» — бүрэн эрх чөлөө: 15 гэвэл 15 нэхэгдэнэ."""
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, AGREED)
    ln = _the_return_line(client, h, cid, QTY)

    r = client.post(f"/api/contracts/{cid}/close", headers=h, json={
        "close_date": iso(3),
        "day_choices": [{"line_id": ln["id"], "days": 15}]})
    assert r.status_code == 200, r.text
    assert r.json()["invoices"][0]["total"] == (QTY * 15 + 60 * 7) * RATE


def test_the_appendix_prints_her_count_with_the_variance_mark(client, as_role):
    """Хавсралт дээр ТҮҮНИЙ тоо одтой зогсоно — цаас нь гэрээтэйгээ таарна."""
    from app.services import pdfappendix
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, AGREED)
    client.post(f"/api/contracts/{cid}/close", headers=h, json={"close_date": iso(3)})

    s = _session()
    inv = (s.query(models.Invoice).filter_by(contract_id=cid)
           .order_by(models.Invoice.cycle_start.desc()).first())
    gmap = {g.id: g.name for g in s.query(models.Grade).all()}
    mmap = {m.id: m.name for m in s.query(models.Material).all()}
    ap = pdfappendix.build_appendix(inv.contract, gmap, mmap,
                                    inv.cycle_start, inv.cycle_end)
    over = [r for r in ap.rows if r.override]
    assert len(over) == 1 and over[0].days == AGREED
    assert pdfappendix.days_text(over[0]) == f"{AGREED}*"
    assert pdfappendix.OVERRIDE_LEGEND in pdfappendix.legend_lines(ap)


def test_rebuild_reproduces_her_count_exactly(client, as_role):
    """Дахин бодолт нь ТҮҮНИЙ шийдвэрийг давтана — replay-ийн бусад явдал шиг."""
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, AGREED)
    client.post(f"/api/contracts/{cid}/close", headers=h, json={"close_date": iso(3)})

    from app.services import rebuild as rebuild_svc
    s = _session()
    c = s.get(models.Contract, cid)
    out = rebuild_svc.rebuild_contract_invoices(s, c, date.today())
    assert out["created"] >= 1
    s.refresh(c)
    final = max(c.invoices, key=lambda i: i.cycle_start)
    assert final.rent_amount == pytest.approx(HER_TOTAL)


def test_the_close_decision_lands_in_the_audit(client, as_role):
    """Мөнгөний шийдвэр — ЭЗЭНТЭЙ. Хэн, хэдийг, юуны оронд гэдэг нь бичигдэнэ."""
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, AGREED)
    ln = _the_return_line(client, h, cid, QTY)
    client.post(f"/api/contracts/{cid}/close", headers=h, json={
        "close_date": iso(3),
        "day_choices": [{"line_id": ln["id"], "days": 15}]})

    trail = client.get("/api/audit?entity=movement&limit=300", headers=h).json()
    row = next(a for a in trail if "гар хоног" in a["detail"] and "15" in a["detail"])
    assert "баталсан" in row["detail"]


def test_a_clean_close_asks_nothing(client, as_role):
    """Зөрчилгүй хаалт дээр асуулт ОГТ гарахгүй."""
    h = as_role("otgoo")
    cid, _, _ = _close_setup(client, as_role, WINDOW)
    p = client.get(f"/api/contracts/{cid}/close-preview?close_date={iso(3)}",
                   headers=h).json()
    assert p["day_conflicts"] == []


# ---------- ЭРХ ЧӨЛӨӨ ЭНГИЙН ЗАМД: АНХААРУУЛНА, ХААХГҮЙ ----------

def test_a_day_count_past_the_window_warns_instead_of_refusing(client, as_role):
    """Цонхонд багтахгүй тоо нь ЗОГСООХГҮЙ — хоёр тоог нэрлээд БАТЛУУЛНА."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)

    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40,
                   "billed_days_override": 45}]})
    assert r.status_code == 200, r.text
    w = r.json()["days_warning"]
    assert w[0]["days"] == 45 and w[0]["window_days"] == 30
    assert "id" not in r.json()                            # хараахан бичигдээгүй


def test_she_confirms_and_the_number_she_typed_is_what_bills(client, as_role):
    """Баталсны дараа ЯГ тэр тоо нэхэгдэнэ — хумилт байхгүй."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)

    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40,
                   "billed_days_override": 45, "days_confirm": True}]})
    assert r.status_code == 200, r.text
    ln = _the_return_line(client, h, cid, 40)
    assert ln["sources"][0]["billed_days"] == 45
    assert ln["days_confirmed"] is True


def test_the_patch_road_warns_the_same_way(client, as_role):
    """Засварын зам ч ижил — хоёр зам НЭГ дүрэмтэй."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40}]})
    ln = _the_return_line(client, h, cid, 40)

    r = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                     json={"billed_days_override": 45, "confirm": True})
    assert r.status_code == 200, r.text
    assert r.json()["days_warning"][0]["window_days"] == 30
    assert _the_return_line(client, h, cid, 40)["billed_days_override"] is None

    ok = client.patch(f"/api/movement-lines/{ln['id']}", headers=h,
                      json={"billed_days_override": 45, "days_confirm": True,
                            "confirm": True})
    assert ok.status_code == 200, ok.text
    assert _the_return_line(client, h, cid, 40)["sources"][0]["billed_days"] == 45


def test_a_negative_day_count_is_still_refused(client, as_role):
    """ҮЛДСЭН ХАТУУ ТАТГАЛЗАЛ: сөрөг хоног гэж байхгүй — утгагүй тоо."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40,
                   "billed_days_override": -1, "days_confirm": True}]})
    assert r.status_code == 400

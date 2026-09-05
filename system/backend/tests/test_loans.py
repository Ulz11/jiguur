"""Зээл/өглөг — TDD. Бодит хэв маяг: Хаан банк шугам 800 сая × 1.6%/сар = 12.8 сая
сарын хүү; хүүг сар бүр төлдөг, үндсэн төлбөл үлдэгдэл (тиймээс сарын хүү) буурна."""
from datetime import date, timedelta

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


# ---------- Цөм тооцоо (unit) ----------

def test_loan_balance_and_monthly_due():
    from app.services import loans as L
    from app import models

    loan = models.Loan(name="Тест банк", principal=800_000_000, monthly_rate=1.6,
                       start_date=date(2026, 3, 14))
    loan.payments = []
    assert L.loan_balance(loan) == 800_000_000
    assert L.monthly_due(loan) == 800_000_000 * 0.016  # 12.8 сая

    # хүүгийн төлбөр үлдэгдлийг БУУРУУЛАХГҮЙ
    loan.payments = [models.LoanPayment(date=date(2026, 4, 14), amount=12_800_000, part="interest")]
    assert L.loan_balance(loan) == 800_000_000
    # үндсэн төлбөр үлдэгдэл + сарын хүүг бууруулна
    loan.payments.append(models.LoanPayment(date=date(2026, 5, 14), amount=300_000_000, part="principal"))
    assert L.loan_balance(loan) == 500_000_000
    assert L.monthly_due(loan) == 500_000_000 * 0.016


def test_next_due_date_keeps_day_of_month():
    from app.services import loans as L
    from app import models

    loan = models.Loan(name="Т", principal=1, monthly_rate=1, start_date=date(2026, 3, 14))
    assert L.next_due_date(loan, date(2026, 8, 10)) == date(2026, 8, 14)
    assert L.next_due_date(loan, date(2026, 8, 14)) == date(2026, 8, 14)
    assert L.next_due_date(loan, date(2026, 8, 15)) == date(2026, 9, 14)
    # 31-ний өдөр эхэлсэн зээл 2-р сард 28 болж хумигдана
    loan31 = models.Loan(name="Т31", principal=1, monthly_rate=1, start_date=date(2026, 1, 31))
    assert L.next_due_date(loan31, date(2027, 2, 1)) == date(2027, 2, 28)


# ---------- API ----------

def test_loans_api_flow(client, as_role):
    h = as_role("sanhuu")
    r = client.post("/api/loans", headers=h, json={
        "name": "Тест зээл", "kind": "private", "principal": 100_000_000,
        "monthly_rate": 2.0, "start_date": iso(45)})
    assert r.status_code == 200
    lid = r.json()["id"]
    # хүү төлөв — үлдэгдэл хэвээр
    client.post(f"/api/loans/{lid}/payments", headers=h,
                json={"date": iso(15), "amount": 2_000_000, "part": "interest"})
    # үндсэн төлөв — үлдэгдэл буурна
    client.post(f"/api/loans/{lid}/payments", headers=h,
                json={"date": iso(5), "amount": 40_000_000, "part": "principal"})
    lst = client.get("/api/loans", headers=h).json()
    row = next(x for x in lst["loans"] if x["id"] == lid)
    assert row["balance"] == 60_000_000
    assert row["monthly_due"] == 60_000_000 * 0.02
    assert row["interest_paid"] == 2_000_000
    assert lst["summary"]["total_debt"] >= 60_000_000


def test_factory_cannot_touch_loans_403(client, as_role):
    assert client.get("/api/loans", headers=as_role("darga")).status_code == 403


def test_dashboard_has_real_loan_upcoming(client, as_role):
    d = client.get("/api/dashboard", headers=as_role("otgoo")).json()
    assert "loans_upcoming" in d
    assert len(d["loans_upcoming"]) >= 1
    row = d["loans_upcoming"][0]
    assert {"name", "amount", "due"} <= set(row.keys())


# ---------- Inline засвар — суурь талбарууд (base-driven) ----------

def _mk_loan(client, h, **over):
    body = {"name": "Засвар тест", "kind": "bank", "principal": 1_000_000,
            "monthly_rate": 2.0, "start_date": iso(30)}
    body.update(over)
    return client.post("/api/loans", headers=h, json=body).json()


def test_patch_loan_principal_updates_balance(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    r = client.patch(f"/api/loans/{lid}", headers=h, json={"principal": 1_200_000})
    assert r.status_code == 200
    assert r.json()["principal"] == 1_200_000
    assert r.json()["balance"] == 1_200_000
    assert r.json()["monthly_due"] == 24_000   # 1,200,000 × 2%


def test_patch_loan_principal_rejects_below_principal_paid(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    client.post(f"/api/loans/{lid}/payments", headers=h,
                json={"date": iso(10), "amount": 300_000, "part": "principal"})
    r = client.patch(f"/api/loans/{lid}", headers=h, json={"principal": 200_000})
    assert r.status_code == 400


def test_patch_loan_start_date_updates_next_due(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h, start_date="2026-01-10")["id"]
    r = client.patch(f"/api/loans/{lid}", headers=h, json={"start_date": "2026-03-05"})
    assert r.status_code == 200
    assert r.json()["start_date"] == "2026-03-05"
    assert r.json()["next_due"].endswith("-05")   # сарын өдөр 5-аар дагана


def test_patch_loan_status(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    r = client.patch(f"/api/loans/{lid}", headers=h, json={"status": "closed"})
    assert r.status_code == 200
    assert r.json()["status"] == "closed"
    assert client.patch(f"/api/loans/{lid}", headers=h,
                        json={"status": "нээх"}).status_code == 400


# ---------- Төлөлт засах / устгах ----------

def test_edit_loan_payment(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    r0 = client.post(f"/api/loans/{lid}/payments", headers=h,
                     json={"date": iso(10), "amount": 20_000, "part": "interest"}).json()
    pid = r0["payments"][0]["id"]
    # хүү 20,000 → 25,000
    r = client.patch(f"/api/loans/{lid}/payments/{pid}", headers=h,
                     json={"date": iso(10), "amount": 25_000, "part": "interest"})
    assert r.status_code == 200
    assert r.json()["interest_paid"] == 25_000
    assert r.json()["balance"] == 1_000_000
    # part-ыг principal болгоход үлдэгдэл буурна
    r2 = client.patch(f"/api/loans/{lid}/payments/{pid}", headers=h,
                      json={"date": iso(10), "amount": 25_000, "part": "principal"})
    assert r2.status_code == 200
    assert r2.json()["interest_paid"] == 0
    assert r2.json()["balance"] == 975_000


def test_edit_loan_payment_rejects_principal_over_balance(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    r0 = client.post(f"/api/loans/{lid}/payments", headers=h,
                     json={"date": iso(10), "amount": 100_000, "part": "principal"}).json()
    pid = r0["payments"][0]["id"]
    r = client.patch(f"/api/loans/{lid}/payments/{pid}", headers=h,
                     json={"date": iso(10), "amount": 1_500_000, "part": "principal"})
    assert r.status_code == 400


def test_delete_loan_payment(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    r0 = client.post(f"/api/loans/{lid}/payments", headers=h,
                     json={"date": iso(10), "amount": 300_000, "part": "principal"}).json()
    assert r0["balance"] == 700_000
    pid = r0["payments"][0]["id"]
    r = client.delete(f"/api/loans/{lid}/payments/{pid}", headers=h)
    assert r.status_code == 200
    assert r.json()["balance"] == 1_000_000
    assert all(p["id"] != pid for p in r.json()["payments"])


# ---------- Нэмэлт олголт (topup) ----------
# Дүрэм: нэмэлт олголт нь үлдэгдлийг ӨСГӨНӨ. Хүү нь энэ модулийн хэвшсэн
# конвенцоор ОДООГИЙН үлдэгдэл × сарын хүү — тиймээс олголт хийсэн даруйд
# (хагас сарын пропорцгүйгээр) сарын хүү нь өссөн үлдэгдлээр бодогдоно.

def test_topup_increases_balance_and_interest():
    from app.services import loans as L
    from app import models

    loan = models.Loan(name="Хувь зээлдүүлэгч", principal=100_000_000, monthly_rate=2.0,
                       start_date=date(2026, 3, 14))
    loan.payments = []
    assert L.loan_balance(loan) == 100_000_000
    loan.payments.append(models.LoanPayment(date=date(2026, 5, 1), amount=50_000_000, part="topup"))
    assert L.loan_balance(loan) == 150_000_000
    assert L.monthly_due(loan) == 150_000_000 * 0.02      # 3.0 сая — өссөн үлдэгдлээр
    # үндсэн төлөлт нь олголтын дараа ч үлдэгдлийг бууруулна
    loan.payments.append(models.LoanPayment(date=date(2026, 6, 1), amount=20_000_000, part="principal"))
    assert L.loan_balance(loan) == 130_000_000


def test_topup_api_rides_the_same_history(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h, principal=1_000_000)["id"]
    r = client.post(f"/api/loans/{lid}/payments", headers=h,
                    json={"date": iso(3), "amount": 400_000, "part": "topup", "note": "нэмэлт"})
    assert r.status_code == 200, r.text
    assert r.json()["balance"] == 1_400_000
    assert r.json()["topup_total"] == 400_000
    row = next(x for x in client.get("/api/loans", headers=h).json()["loans"] if x["id"] == lid)
    assert row["balance"] == 1_400_000
    assert [p["part"] for p in row["payments"]] == ["topup"]
    assert row["monthly_due"] == 1_400_000 * 0.02


def test_topup_on_closed_loan_rejected(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    client.patch(f"/api/loans/{lid}", headers=h, json={"status": "closed"})
    r = client.post(f"/api/loans/{lid}/payments", headers=h,
                    json={"date": iso(1), "amount": 100_000, "part": "topup"})
    assert r.status_code == 400
    assert "хаагдсан" in r.json()["detail"].lower()


def test_topup_amount_must_be_positive(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    assert client.post(f"/api/loans/{lid}/payments", headers=h,
                       json={"date": iso(1), "amount": 0, "part": "topup"}).status_code == 400


def test_topup_row_edits_and_deletes_like_a_payment(client, as_role):
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]                       # 1,000,000
    r0 = client.post(f"/api/loans/{lid}/payments", headers=h,
                     json={"date": iso(5), "amount": 300_000, "part": "topup"}).json()
    pid = r0["payments"][0]["id"]
    assert r0["balance"] == 1_300_000
    r = client.patch(f"/api/loans/{lid}/payments/{pid}", headers=h,
                     json={"date": iso(5), "amount": 500_000, "part": "topup"})
    assert r.status_code == 200
    assert r.json()["balance"] == 1_500_000
    r2 = client.delete(f"/api/loans/{lid}/payments/{pid}", headers=h)
    assert r2.status_code == 200
    assert r2.json()["balance"] == 1_000_000


def test_deleting_topup_that_was_already_repaid_is_refused(client, as_role):
    """Олголт 500,000 → нийт 1.5 сая, үүнээс 1.2 саяг үндсэнд төлсөн.
    Олголтыг устгавал үлдэгдэл сөрөг болно — тиймээс хориглоно."""
    h = as_role("sanhuu")
    lid = _mk_loan(client, h)["id"]
    r0 = client.post(f"/api/loans/{lid}/payments", headers=h,
                     json={"date": iso(9), "amount": 500_000, "part": "topup"}).json()
    tid = r0["payments"][0]["id"]
    client.post(f"/api/loans/{lid}/payments", headers=h,
                json={"date": iso(4), "amount": 1_200_000, "part": "principal"})
    r = client.delete(f"/api/loans/{lid}/payments/{tid}", headers=h)
    assert r.status_code == 400
    assert client.get("/api/loans", headers=h).json()
    row = next(x for x in client.get("/api/loans", headers=h).json()["loans"] if x["id"] == lid)
    assert row["balance"] == 300_000                      # юу ч устаагүй


# ---------- Төлөвлөсөн сарын төлөлт ----------

def test_monthly_payment_persists_from_post_patch_and_get(client, as_role):
    h = as_role("sanhuu")
    r = client.post("/api/loans", headers=h, json={
        "name": "Төлөвлөгөөт", "kind": "bank", "principal": 10_000_000,
        "monthly_rate": 1.5, "start_date": iso(20), "monthly_payment": 900_000})
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    assert r.json()["monthly_payment"] == 900_000
    r2 = client.patch(f"/api/loans/{lid}", headers=h, json={"monthly_payment": 1_250_000})
    assert r2.status_code == 200
    assert r2.json()["monthly_payment"] == 1_250_000
    row = next(x for x in client.get("/api/loans", headers=h).json()["loans"] if x["id"] == lid)
    assert row["monthly_payment"] == 1_250_000
    assert row["monthly_due"] == 150_000                  # хүү нь ХЭВЭЭР (10 сая × 1.5%)
    assert client.patch(f"/api/loans/{lid}", headers=h,
                        json={"monthly_payment": -5}).status_code == 400


def test_upcoming_uses_monthly_payment_when_set(client, as_role):
    """Дашбоардын «Зээлийн ойрын төлөлт» — төлөвлөсөн дүн байвал түүгээр,
    байхгүй бол хуучин конвенцоор (сарын хүү)."""
    h = as_role("sanhuu")
    # Дашбоард ойрын 5-ыг л харуулдаг тул өнөөдөр төлөгдөх зээл үүсгэнэ (жагсаалтын эхэнд).
    lid = client.post("/api/loans", headers=h, json={
        "name": "Ойрын төлөлт тест", "kind": "private", "principal": 20_000_000,
        "monthly_rate": 3.0, "start_date": iso(0)}).json()["id"]
    d = client.get("/api/dashboard", headers=h).json()
    row = next(u for u in d["loans_upcoming"] if u["loan_id"] == lid)
    assert row["amount"] == 600_000                       # 20 сая × 3% — хуучин зан төлөв
    client.patch(f"/api/loans/{lid}", headers=h, json={"monthly_payment": 2_500_000})
    d2 = client.get("/api/dashboard", headers=h).json()
    row2 = next(u for u in d2["loans_upcoming"] if u["loan_id"] == lid)
    assert row2["amount"] == 2_500_000
    assert row2["planned"] is True


def test_forecast_uses_monthly_payment_when_set(client, as_role):
    h = as_role("sanhuu")
    f0 = client.get("/api/reports/forecast", headers=h).json()["monthly_loan_due"]
    lid = client.post("/api/loans", headers=h, json={
        "name": "Прогноз тест", "kind": "bank", "principal": 1_000_000,
        "monthly_rate": 1.0, "start_date": iso(2)}).json()["id"]
    client.patch(f"/api/loans/{lid}", headers=h, json={"monthly_payment": 500_000})
    f1 = client.get("/api/reports/forecast", headers=h).json()["monthly_loan_due"]
    assert round(f1 - f0) == 500_000                      # 10,000₮ хүү биш, 500,000₮ төлөлт


# ---------- «Төлөлт хоцорсон» — дүрэм нь ЦЭВЭР функц ----------

def _loan(**kw):
    from app import models
    base = dict(name="Хоцролтын банк", principal=100_000_000, monthly_rate=1.5,
                start_date=date(2026, 1, 10), status="active")
    return models.Loan(**{**base, **kw})


def _pay(loan, d: date, part="interest", amount=1_000_000):
    from app import models
    loan.payments.append(models.LoanPayment(loan_id=loan.id, date=d,
                                            amount=amount, part=part))


def test_overdue_only_after_the_due_day_has_passed_unpaid():
    """Энэ сарын төлөх өдөр ӨНГӨРСӨН боловч тэр сард төлөлт БАЙХГҮЙ = хоцорсон."""
    from app.services import loans as L
    l = _loan(start_date=date(2026, 1, 10))

    # 10-ны өдөр хараахан ирээгүй — хоцроогүй
    assert L.overdue_state(l, date(2026, 5, 9)) == (False, 0)
    # 10-нд нь өөрөө — «өнөөдөр төлнө» гэдэг нь хоцролт биш
    assert L.overdue_state(l, date(2026, 5, 10)) == (False, 0)
    # 15-нд төлөлтгүй — 5 хоног хоцорсон
    assert L.overdue_state(l, date(2026, 5, 15)) == (True, 5)


def test_a_payment_inside_the_month_clears_the_overdue_flag():
    from app.services import loans as L
    l = _loan(start_date=date(2026, 1, 10))
    _pay(l, date(2026, 5, 12))
    assert L.overdue_state(l, date(2026, 5, 20)) == (False, 0)
    # Өнгөрсөн сарын төлөлт нь ЭНЭ сарыг хаахгүй
    l2 = _loan(start_date=date(2026, 1, 10))
    _pay(l2, date(2026, 4, 12))
    assert L.overdue_state(l2, date(2026, 5, 20))[0] is True


def test_a_topup_is_not_a_payment_so_it_does_not_clear_overdue():
    """Нэмэлт олголт нь мөнгө ОРСОН явдал — «төлсөн» болохгүй."""
    from app.services import loans as L
    l = _loan(start_date=date(2026, 1, 10))
    _pay(l, date(2026, 5, 12), part="topup", amount=5_000_000)
    assert L.overdue_state(l, date(2026, 5, 20))[0] is True


def test_a_loan_taken_this_month_and_a_closed_loan_are_never_overdue():
    """Мөнгө сая гарт орсон зээл дээр улаан пилл өлгөх нь ХУДАЛ."""
    from app.services import loans as L
    fresh = _loan(start_date=date(2026, 5, 20))
    assert L.overdue_state(fresh, date(2026, 5, 25)) == (False, 0)
    closed = _loan(start_date=date(2026, 1, 10), status="closed")
    assert L.overdue_state(closed, date(2026, 5, 25)) == (False, 0)


def test_due_day_clamps_to_the_last_day_of_a_short_month():
    from app.services import loans as L
    l = _loan(start_date=date(2026, 1, 31))
    assert L.due_day(l, date(2026, 2, 15)) == date(2026, 2, 28)


def test_overdue_loans_lists_the_late_ones_worst_first(client, as_role):
    """`overdue_loans` нь МЭДЭГДЛИЙН давхрага ба дэлгэцийн НЭГ эх сурвалж."""
    from app.db import get_db
    from app.services import loans as L
    from app.main import app as fastapi_app

    h = as_role("otgoo")
    client.post("/api/loans", headers=h, json={
        "name": "Хоцорсон А", "principal": 50_000_000, "monthly_rate": 1.5,
        "start_date": "2026-01-05"})
    client.post("/api/loans", headers=h, json={
        "name": "Хоцорсон Б", "principal": 30_000_000, "monthly_rate": 1.5,
        "start_date": "2026-01-20"})
    db = next(fastapi_app.dependency_overrides[get_db]())
    try:
        rows = [r for r in L.overdue_loans(db, date(2026, 6, 25))
                if r["name"].startswith("Хоцорсон")]
        # ХАМГИЙН ИХ хоцорсон нь ДЭЭРЭЭ — Отгоо эгч эхний мөрөөс залгана
        assert [r["name"] for r in rows] == ["Хоцорсон А", "Хоцорсон Б"]
        assert rows[0]["days_late"] == 20 and rows[1]["days_late"] == 5
        assert rows[0]["due"] == "2026-06-05"
        # Төлөх өдөр нь ирээгүй сард ГАНЦ Ч мөр байхгүй (1-нээс өмнө)
        assert [r for r in L.overdue_loans(db, date(2026, 1, 3))
                if r["name"].startswith("Хоцорсон")] == []
    finally:
        db.close()


def test_loan_payload_and_summary_carry_the_overdue_shape(client, as_role):
    """Дэлгэц нь `overdue`, `days_late`-ыг мөр бүр дээрээ авна."""
    h = as_role("otgoo")
    lid = client.post("/api/loans", headers=h, json={
        "name": "Өнөөдөр авсан", "principal": 10_000_000, "monthly_rate": 1.2,
        "start_date": str(date.today())}).json()["id"]
    d = client.get("/api/loans", headers=h).json()
    row = next(x for x in d["loans"] if x["id"] == lid)
    # Өнөөдөр авсан зээл ХЭЗЭЭ Ч хоцроогүй
    assert row["overdue"] is False and row["days_late"] == 0
    assert row["due_day"]
    s = d["summary"]
    assert {"monthly_burden", "monthly_interest", "monthly_planned",
            "overdue_count", "overdue"} <= set(s)
    # «Сарын хүү» ба «Сарын зээлийн төлбөр» нь ХОЁР ӨӨР тоо, тус тусын нэртэй
    assert s["monthly_interest"] == s["monthly_burden"]
    assert s["overdue_count"] == len(s["overdue"])


# ---------- Автомат хаалт ба сэргээлт нь МӨРӨӨ үлдээнэ ----------

def _loan_id(client, h, **kw) -> int:
    body = {"name": "Хаагдах зээл", "principal": 1_000_000, "monthly_rate": 1.0,
            "start_date": iso(60), **kw}
    return client.post("/api/loans", headers=h, json=body).json()["id"]


def _trail(client, h, entity: str, eid: int):
    rows = client.get(f"/api/audit?entity={entity}&limit=200", headers=h).json()["rows"]
    return [r for r in rows if r["entity_id"] == eid]


def test_auto_close_says_so_in_the_response_and_in_the_audit(client, as_role):
    """Үлдэгдэл 0 болоход зээл ЧИМЭЭГҮЙ алга болдог байв — одоо хэлнэ."""
    h = as_role("otgoo")
    lid = _loan_id(client, h)
    r = client.post(f"/api/loans/{lid}/payments", headers=h, json={
        "date": iso(1), "amount": 1_000_000, "part": "principal"})
    assert r.status_code == 200, r.text
    assert r.json()["closed"] is True and r.json()["status"] == "closed"
    row = next(x for x in _trail(client, h, "loan", lid) if x["action"] == "close")
    assert "автоматаар хаав" in row["detail"]


def test_deleting_a_payment_that_leaves_a_balance_reopens_the_loan(client, as_role):
    """Хаагдсан зээлээс төлөлт уствал ӨР эргэж гарна — зээл нь СЭРГЭНЭ.

    Эс бөгөөс тэр өр жагсаалтаас алга болж, нийт өглөгөөс унана.
    """
    h = as_role("otgoo")
    lid = _loan_id(client, h)
    pay = client.post(f"/api/loans/{lid}/payments", headers=h, json={
        "date": iso(1), "amount": 1_000_000, "part": "principal"}).json()
    pid = pay["payments"][0]["id"]

    r = client.delete(f"/api/loans/{lid}/payments/{pid}", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["reopened"] is True
    assert r.json()["status"] == "active" and r.json()["balance"] == 1_000_000
    row = next(x for x in _trail(client, h, "loan", lid) if x["action"] == "reopen")
    assert "сэргээв" in row["detail"]
    # Хүүгийн төлөлт уствал (үлдэгдэл хөдлөхгүй) сэргээх зүйл алга
    assert lid in {x["id"] for x in client.get("/api/loans", headers=h).json()["loans"]}


def test_every_loan_write_leaves_an_audit_row(client, as_role):
    h = as_role("otgoo")
    lid = _loan_id(client, h, name="Бүртгэлтэй зээл", principal=5_000_000)
    client.patch(f"/api/loans/{lid}", headers=h, json={"monthly_rate": 1.8})
    p = client.post(f"/api/loans/{lid}/payments", headers=h, json={
        "date": iso(2), "amount": 90_000, "part": "interest"}).json()
    pid = p["payments"][0]["id"]
    client.patch(f"/api/loans/{lid}/payments/{pid}", headers=h, json={
        "date": iso(2), "amount": 95_000, "part": "interest"})
    client.delete(f"/api/loans/{lid}/payments/{pid}", headers=h)
    client.post(f"/api/loans/{lid}/close", headers=h)

    loan_rows = _trail(client, h, "loan", lid)
    assert {"create", "update", "close"} <= {r["action"] for r in loan_rows}
    upd = next(r for r in loan_rows if r["action"] == "update")
    assert "сарын хүү %" in upd["detail"]          # талбар нь МОНГОЛООР
    pay_rows = [r for r in client.get("/api/audit?entity=loan_payment&limit=200",
                                      headers=h).json()["rows"]]
    assert {"create", "update", "delete"} <= {r["action"] for r in pay_rows}
    assert any("хүү" in r["detail"] for r in pay_rows)

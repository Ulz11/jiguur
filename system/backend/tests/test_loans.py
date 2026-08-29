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

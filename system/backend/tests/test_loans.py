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

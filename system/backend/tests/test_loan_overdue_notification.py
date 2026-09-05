"""ХОЦОРСОН зээлийн төлөлт дашбоард дээр УЛААН мөр болж гарна.

Урьд нь зээлийн мэдэгдэл нь зөвхөн «3 хоногийн дотор төлөх» (шар) байв:
төлөх өдөр өнгөрөөд төлөлт бүртгэгдээгүй зээл `next_due`-гээ дараагийн сар руу
ЧИМЭЭГҮЙ гулсуулж, хэзээ ч улаан болдоггүй байв. `loans.overdue_loans` нь
одоо тэр дүрмийг мэднэ — дашбоард түүнийг УНШИЖ, зээл бүрийг ӨӨРИЙН
`loan_id`-аар мөр болгоно (нэгийг нь түр нуухад нөгөө нь хэвээр).
"""
import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _overdue_loan(client, h, name):
    """Энэ сарын төлөх өдөр (1-ний) ӨНГӨРСӨН, төлөлтгүй зээл. Сарын 1-нд
    «өнгөрсөн өдөр» гэж байхгүй тул дүрэм ёсоор хоцорч чадахгүй — алгасна."""
    if date.today().day == 1:
        pytest.skip("сарын 1-нд төлөх өдөр өнгөрөөгүй байдаг — дүрэм ёсоор")
    r = client.post("/api/loans", headers=h, json={
        "name": name, "kind": "bank", "principal": 300_000_000,
        "monthly_rate": 1.6, "start_date": "2026-03-01"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _rows(client, h, ids):
    d = client.get("/api/dashboard", headers=h).json()
    rows = [n for n in d["notifications"]
            if n["kind"] == "loan_overdue" and n.get("loan_id") in ids]
    return d, rows


def test_an_unpaid_loan_past_its_due_day_is_a_red_notification(client, as_role):
    h = as_role("otgoo")
    lid = _overdue_loan(client, h, "Тест зээл А")
    _, rows = _rows(client, h, {lid})
    assert len(rows) == 1
    n = rows[0]
    assert n["level"] == "danger"
    assert "Тест зээл А" in n["title"] and "хоцорлоо" in n["title"]
    assert "хоног" in n["title"]


def test_a_snoozed_overdue_loan_hides_only_itself(client, as_role):
    h = as_role("otgoo")
    a = _overdue_loan(client, h, "Тест зээл А")
    b = _overdue_loan(client, h, "Тест зээл Б")
    r = client.post("/api/notifications/snooze", headers=h,
                    json={"kind": "loan_overdue", "entity_id": a, "days": 7})
    assert r.status_code == 200, r.text
    d, rows = _rows(client, h, {a, b})
    assert [n["loan_id"] for n in rows] == [b]        # А нуугдав, Б хэвээр
    assert d["snoozed_count"] >= 1

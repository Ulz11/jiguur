"""Inline засварын API + дашбоардын шинэ задаргаа — TDD."""
from datetime import date, timedelta


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def test_patch_contract_fields(client, as_role):
    h = as_role("otgoo")
    r = client.patch("/api/contracts/1", headers=h, json={
        "penalty_percent": 1.0, "deposit": 5_000_000, "note": "Шинэ нөхцөл"})
    assert r.status_code == 200
    d = client.get("/api/contracts/1", headers=h).json()
    assert d["penalty_percent"] == 1.0
    assert d["deposit"] == 5_000_000
    assert d["note"] == "Шинэ нөхцөл"


def test_patch_item_rate_changes_day_amount(client, as_role):
    h = as_role("otgoo")
    d = client.get("/api/contracts/1", headers=h).json()
    it = d["items"][0]
    old_day = d["day_amount"]
    r = client.patch(f"/api/contracts/1/items", headers=h, json={
        "material_id": it["material_id"], "grade_id": it["grade_id"], "daily_rate": it["daily_rate"] + 100})
    assert r.status_code == 200
    d2 = client.get("/api/contracts/1", headers=h).json()
    assert d2["day_amount"] == old_day + it["qty"] * 100


def test_patch_loan_rate(client, as_role):
    h = as_role("sanhuu")
    l = client.get("/api/loans", headers=h).json()["loans"][0]
    r = client.patch(f"/api/loans/{l['id']}", headers=h, json={"monthly_rate": 2.5})
    assert r.status_code == 200
    assert r.json()["monthly_due"] == round(l["balance"] * 0.025)


def test_factory_cannot_patch_403(client, as_role):
    assert client.patch("/api/contracts/1", headers=as_role("darga"),
                        json={"note": "x"}).status_code == 403


def test_ndsh_setting_applies_to_new_run(client, as_role):
    h = as_role("otgoo")
    client.put("/api/settings", headers=h, json={"values": {"ndsh_percent": "13"}})
    e = client.post("/api/salary/employees", headers=h, json={
        "name": "НДШ Тест", "type": "main", "monthly_salary": 2_000_000, "ndsh": True}).json()
    run = client.post("/api/salary/runs", headers=h,
                      json={"period": "2025-03", "half": 1, "daily_days": {}}).json()
    item = next(i for i in run["items"] if i["employee_id"] == e["id"])
    assert item["ndsh_amount"] == 1_000_000 * 0.13


def test_dashboard_revenue_split_by_type(client, as_role):
    """Орлогын chart: Түрээс / Худалдаа / Бартер гэж задарна."""
    h = as_role("otgoo")
    rev = client.get("/api/dashboard", headers=h).json()["revenue"]
    assert {"months", "rent", "sale", "barter"} <= set(rev.keys())
    # seed: худалдааны гэрээн дээр бэлэн/данс төлбөр бий → sale тэгээс их
    assert sum(rev["sale"]) > 0
    assert sum(rev["barter"]) > 0
    # scope=sale үед rent цуврал хоосон
    rev_s = client.get("/api/dashboard?scope=sale", headers=h).json()["revenue"]
    assert sum(rev_s["rent"]) == 0

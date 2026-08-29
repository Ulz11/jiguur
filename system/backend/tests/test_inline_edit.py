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


def test_patch_item_rate_propagates_to_lots_at_old_default(client, as_role):
    """Тариф засахад ЗӨВХӨН тэр тарифтай падан шинэчлэгдэнэ.

    330₮-ийн 100ш + 300₮-ийн 50ш падантай гэрээнд 330 → 400 болгоход:
    330-ийн падан 400 болж, 300-ийн падан ХЭВЭЭР үлдэнэ."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Падан тариф ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(40),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 100, "daily_rate": 330}]}).json()["id"]

    def confirm():
        hd = as_role("darga")
        for p in client.get("/api/dashboard", headers=hd).json()["pending_shipments"]:
            if p["contract_id"] == cid:
                client.post(f"/api/movements/{p['id']}/confirm", headers=hd)

    confirm()
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(10), "note": "Нэмэлт олголт",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 50, "rate": 300}]})
    confirm()
    assert client.get(f"/api/contracts/{cid}", headers=h).json()["day_amount"] == 48_000

    r = client.patch(f"/api/contracts/{cid}/items", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"],
        "daily_rate": 400, "old_rate": 330})
    assert r.status_code == 200
    assert r.json()["daily_rate"] == 400          # гэрээний үндсэн тариф ч шинэчлэгдэв

    rows = client.get(f"/api/contracts/{cid}", headers=h).json()
    by_rate = {x["daily_rate"]: x for x in rows["items"]}
    assert set(by_rate) == {400, 300}
    assert by_rate[400]["qty"] == 100 and by_rate[300]["qty"] == 50
    assert rows["day_amount"] == 100 * 400 + 50 * 300      # 40,000 + 15,000
    assert rows["day_amount"] == 55_000


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
    """Орлогын chart: Түрээс / Худалдаа / Бартер гэж задарна.

    Өмнө нь энэ тест «scope=sale үед rent цуврал хоосон» гэдгийг барьцаалж
    байв. Тэр шүүлт нь ЗОХИОМОЛ: төлбөр гэрээгүй байж болох ба (nullable
    `contract_id`) код түүнийг «түрээс» гэж таамаглаж хуваадаг байсан тул
    шүүлтүүр мөнгийг чимээгүй алга болгож эсвэл буруу цувралд нэмдэг. Одоо
    график БҮХ ТӨРЛИЙГ хамарч, өөрийгөө `all_types` гэж зарлана."""
    h = as_role("otgoo")
    rev = client.get("/api/dashboard", headers=h).json()["revenue"]
    assert {"months", "rent", "sale", "barter"} <= set(rev.keys())
    # seed: худалдааны гэрээн дээр бэлэн/данс төлбөр бий → sale тэгээс их
    assert sum(rev["sale"]) > 0
    assert sum(rev["barter"]) > 0
    assert rev["all_types"] is True

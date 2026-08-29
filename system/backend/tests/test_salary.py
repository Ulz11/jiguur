"""Цалин — TDD. Дүрэм (эзний хариултаас):
- Үндсэн болон гэрээт ажилтан: сар бүр 15/15 хоногоор 2 хуваагдаж олгогдоно,
  заримд нь НДШ суутгана.
- Өдрийн ажилтан: ажилласан өдрөөр (өдрийн хөлс × өдөр)."""
from datetime import date, timedelta


def test_salary_run_half_month_calculation(client, as_role):
    """3.0 сая цалинтай НДШ-тэй үндсэн ажилтан: хагас сард 1.5 сая, НДШ 11.5% = 172,500
    суутгаад 1,327,500 гарт олгоно. Өдрийн ажилтан 80,000 × 10 өдөр = 800,000."""
    h = as_role("otgoo")
    e1 = client.post("/api/salary/employees", headers=h, json={
        "name": "Тест Үндсэн", "role_title": "Инженер", "type": "main",
        "monthly_salary": 3_000_000, "ndsh": True}).json()
    e2 = client.post("/api/salary/employees", headers=h, json={
        "name": "Тест Гэрээт", "role_title": "Засварчин", "type": "contract",
        "monthly_salary": 1_500_000, "ndsh": False}).json()
    e3 = client.post("/api/salary/employees", headers=h, json={
        "name": "Тест Өдрийн", "role_title": "Туслах", "type": "daily",
        "daily_rate": 80_000, "ndsh": False}).json()

    r = client.post("/api/salary/runs", headers=h, json={
        "period": "2026-08", "half": 1,
        "daily_days": {str(e3["id"]): 10}})
    assert r.status_code == 200, r.text
    run = r.json()
    items = {i["employee_id"]: i for i in run["items"]}
    assert items[e1["id"]]["base"] == 1_500_000
    assert items[e1["id"]]["ndsh_amount"] == 1_500_000 * 0.115
    assert items[e1["id"]]["net"] == 1_500_000 - 172_500
    assert items[e2["id"]]["base"] == 750_000 and items[e2["id"]]["ndsh_amount"] == 0
    assert items[e3["id"]]["base"] == 800_000 and items[e3["id"]]["days"] == 10
    # бодолт БҮХ идэвхтэй ажилтныг хамардаг тул нийт = мөрүүдийн нийлбэр
    assert run["total_net"] == sum(i["net"] for i in run["items"])
    assert run["total_base"] - run["total_ndsh"] == run["total_net"]


def test_salary_run_duplicate_rejected(client, as_role):
    h = as_role("otgoo")
    client.post("/api/salary/employees", headers=h, json={
        "name": "Д", "type": "main", "monthly_salary": 1_000_000, "ndsh": False})
    r1 = client.post("/api/salary/runs", headers=h, json={"period": "2025-01", "half": 2, "daily_days": {}})
    assert r1.status_code == 200
    r2 = client.post("/api/salary/runs", headers=h, json={"period": "2025-01", "half": 2, "daily_days": {}})
    assert r2.status_code == 400


def test_salary_pay_marks_paid(client, as_role):
    h = as_role("sanhuu")
    client.post("/api/salary/employees", headers=h, json={
        "name": "П", "type": "contract", "monthly_salary": 2_000_000, "ndsh": False})
    run = client.post("/api/salary/runs", headers=h, json={"period": "2025-02", "half": 1, "daily_days": {}}).json()
    r = client.post(f"/api/salary/runs/{run['id']}/pay", headers=h, json={"date": "2026-06-15"})
    assert r.status_code == 200
    lst = client.get("/api/salary/runs", headers=h).json()
    row = next(x for x in lst if x["id"] == run["id"])
    assert row["paid"] is True


def test_factory_cannot_see_salary_403(client, as_role):
    assert client.get("/api/salary/employees", headers=as_role("darga")).status_code == 403


def test_edit_employee_changes_what_the_next_run_pays(client, as_role):
    """Ажилтны мөрийг засахад ДАРААГИЙН бодолт шинэ утгаар бодогдоно —
    бодолт нь ажилчдыг бодох мөчид уншдаг гэдгийн баталгаа."""
    h = as_role("otgoo")
    e = client.post("/api/salary/employees", headers=h, json={
        "name": "Засагдах Ажилтан", "role_title": "Оператор", "type": "main",
        "monthly_salary": 2_000_000, "ndsh": False}).json()
    r1 = client.post("/api/salary/runs", headers=h,
                     json={"period": "2026-09", "half": 1, "daily_days": {}}).json()
    assert next(i for i in r1["items"] if i["employee_id"] == e["id"])["base"] == 1_000_000

    r = client.put(f"/api/salary/employees/{e['id']}", headers=h, json={
        "name": "Засагдсан Ажилтан", "role_title": "Ахлах оператор", "type": "main",
        "monthly_salary": 3_000_000, "daily_rate": 0, "ndsh": True})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Засагдсан Ажилтан"
    assert r.json()["ndsh"] is True

    r2 = client.post("/api/salary/runs", headers=h,
                     json={"period": "2026-09", "half": 2, "daily_days": {}}).json()
    it = next(i for i in r2["items"] if i["employee_id"] == e["id"])
    assert it["base"] == 1_500_000                     # 3.0 сая / 2
    assert it["ndsh_amount"] == 1_500_000 * 0.115      # НДШ асаасан нь тусав
    assert it["net"] == 1_500_000 - 172_500


def test_edit_employee_to_daily_switches_how_the_run_pays(client, as_role):
    """Үндсэн → өдрийн болгож зассан ажилтан ажилласан өдрөөрөө бодогдоно."""
    h = as_role("otgoo")
    e = client.post("/api/salary/employees", headers=h, json={
        "name": "Төрөл Солигдох", "type": "main", "monthly_salary": 1_200_000}).json()
    client.put(f"/api/salary/employees/{e['id']}", headers=h, json={
        "name": "Төрөл Солигдох", "role_title": "", "type": "daily",
        "monthly_salary": 0, "daily_rate": 90_000, "ndsh": False})
    run = client.post("/api/salary/runs", headers=h, json={
        "period": "2026-10", "half": 1, "daily_days": {str(e["id"]): 12}}).json()
    it = next(i for i in run["items"] if i["employee_id"] == e["id"])
    assert it["days"] == 12 and it["base"] == 12 * 90_000


def test_deactivated_employee_drops_out_of_the_next_run(client, as_role):
    h = as_role("otgoo")
    e = client.post("/api/salary/employees", headers=h, json={
        "name": "Гарах Ажилтан", "type": "main", "monthly_salary": 900_000}).json()
    assert client.delete(f"/api/salary/employees/{e['id']}", headers=h).status_code == 200
    assert all(x["id"] != e["id"] for x in client.get("/api/salary/employees", headers=h).json())
    run = client.post("/api/salary/runs", headers=h,
                      json={"period": "2026-11", "half": 1, "daily_days": {}}).json()
    assert all(i["employee_id"] != e["id"] for i in run["items"])

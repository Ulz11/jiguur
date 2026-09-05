"""Цалин — TDD. Дүрэм (эзний хариултаас):
- Үндсэн болон гэрээт ажилтан: сар бүр 15/15 хоногоор 2 хуваагдаж олгогдоно,
  заримд нь НДШ суутгана.
- Өдрийн ажилтан: ажилласан өдрөөр (өдрийн хөлс × өдөр)."""
from datetime import date, timedelta


def per(n: int) -> str:
    """Өнөөдрөөс n сарын хойшхи сар (n=0 — энэ сар). Seed нь ӨНГӨРСӨН САРЫН
    бодолт үүсгэдэг тул n ≥ 0 үед хэзээ ч мөргөлдөхгүй. Тогтмол он-сар бичвэл
    цаг гүйгээд ирэхэд унана: 2026-09-01-нд «2026-08» seed-тэй мөргөлдөж байв."""
    t = date.today()
    m = t.month - 1 + n
    return f"{t.year + m // 12}-{m % 12 + 1:02d}"


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
        "period": per(0), "half": 1,
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
                     json={"period": per(1), "half": 1, "daily_days": {}}).json()
    assert next(i for i in r1["items"] if i["employee_id"] == e["id"])["base"] == 1_000_000

    r = client.put(f"/api/salary/employees/{e['id']}", headers=h, json={
        "name": "Засагдсан Ажилтан", "role_title": "Ахлах оператор", "type": "main",
        "monthly_salary": 3_000_000, "daily_rate": 0, "ndsh": True})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Засагдсан Ажилтан"
    assert r.json()["ndsh"] is True

    r2 = client.post("/api/salary/runs", headers=h,
                     json={"period": per(1), "half": 2, "daily_days": {}}).json()
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
        "period": per(2), "half": 1, "daily_days": {str(e["id"]): 12}}).json()
    it = next(i for i in run["items"] if i["employee_id"] == e["id"])
    assert it["days"] == 12 and it["base"] == 12 * 90_000


def test_deactivated_employee_drops_out_of_the_next_run(client, as_role):
    h = as_role("otgoo")
    e = client.post("/api/salary/employees", headers=h, json={
        "name": "Гарах Ажилтан", "type": "main", "monthly_salary": 900_000}).json()
    assert client.delete(f"/api/salary/employees/{e['id']}", headers=h).status_code == 200
    assert all(x["id"] != e["id"] for x in client.get("/api/salary/employees", headers=h).json())
    run = client.post("/api/salary/runs", headers=h,
                      json={"period": per(3), "half": 1, "daily_days": {}}).json()
    assert all(i["employee_id"] != e["id"] for i in run["items"])


# ---------- Бодолтыг УСТГАХ — зөвхөн ОЛГООГҮЙ байхад ----------

def _emp(client, h, **kw) -> dict:
    body = {"name": "Устгалын ажилтан", "type": "main",
            "monthly_salary": 2_000_000, "ndsh": False, **kw}
    return client.post("/api/salary/employees", headers=h, json=body).json()


def test_an_unpaid_run_can_be_deleted_but_a_paid_one_cannot(client, as_role):
    """Буруу бодсоныг арилгах зам байх ёстой — гэхдээ МӨНГӨ ГАРСНЫ ДАРАА үгүй.

    Олгосон бодолт нь тайлангийн цалингийн зардал ба мөнгөн урсгалын
    суурь: устгавал өнгөрсөн сарын тайлан ЧИМЭЭГҮЙ өөрчлөгдөнө.
    """
    h = as_role("otgoo")
    _emp(client, h)
    run = client.post("/api/salary/runs", headers=h,
                      json={"period": per(4), "half": 1, "daily_days": {}}).json()
    assert client.delete(f"/api/salary/runs/{run['id']}", headers=h).status_code == 200
    assert all(r["id"] != run["id"] for r in client.get("/api/salary/runs", headers=h).json())

    run2 = client.post("/api/salary/runs", headers=h,
                       json={"period": per(4), "half": 2, "daily_days": {}}).json()
    client.post(f"/api/salary/runs/{run2['id']}/pay", headers=h, json={"date": "2026-06-15"})
    bad = client.delete(f"/api/salary/runs/{run2['id']}", headers=h)
    assert bad.status_code == 400
    assert bad.json()["detail"] == "Олгосон бодолтыг устгах боломжгүй"
    assert any(r["id"] == run2["id"] for r in client.get("/api/salary/runs", headers=h).json())


def test_a_removed_employee_can_come_back_on_the_same_row(client, as_role):
    """Хасалт нь эргэх замтай — эс бөгөөс нэг хүн хоёр мөр болно."""
    h = as_role("otgoo")
    e = _emp(client, h, name="Буцаж ирэх ажилтан")
    client.delete(f"/api/salary/employees/{e['id']}", headers=h)
    assert all(x["id"] != e["id"] for x in client.get("/api/salary/employees", headers=h).json())

    r = client.post(f"/api/salary/employees/{e['id']}/reactivate", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["active"] == 1
    assert any(x["id"] == e["id"] for x in client.get("/api/salary/employees", headers=h).json())
    # ДАРААГИЙН бодолт түүнийг дахин хамарна — мөр нь ижил `id`-тай
    run = client.post("/api/salary/runs", headers=h,
                      json={"period": per(5), "half": 1, "daily_days": {}}).json()
    assert any(i["employee_id"] == e["id"] for i in run["items"])
    assert client.post("/api/salary/employees/9999/reactivate", headers=h).status_code == 404


# ---------- НДШ%-ийн шошго ХУДЛА ЯРЬЖ БОЛОХГҮЙ ----------

def test_the_run_carries_the_ndsh_percent_it_was_calculated_with(client, as_role):
    """Тохиргоо хожим өөрчлөгдвөл ХУУЧИН бодолт хуучин хувиараа үлдэнэ.

    Дэлгэц дээр «НДШ 11.5%» гэсэн шошго нь тухайн бодолтын ҮНЭН байх ёстой:
    тохиргоог 15% болгосны дараа 4 сарын бодолтыг нээхэд 15% гэж бичигдвэл
    тэр тоо нь юу ч гэсэн үг биш болно.
    """
    h = as_role("otgoo")
    e = _emp(client, h, name="НДШ-тэй ажилтан", monthly_salary=4_000_000, ndsh=True)

    def mine(run):
        return next(i for i in run["items"] if i["employee_id"] == e["id"])

    old = client.post("/api/salary/runs", headers=h,
                      json={"period": per(6), "half": 1, "daily_days": {}}).json()
    assert old["ndsh_percent"] == 11.5
    assert mine(old)["ndsh_amount"] == 2_000_000 * 0.115

    assert client.put("/api/settings", headers=h,
                      json={"values": {"ndsh_percent": "15"}}).status_code == 200
    new = client.post("/api/salary/runs", headers=h,
                      json={"period": per(6), "half": 2, "daily_days": {}}).json()
    assert new["ndsh_percent"] == 15.0
    assert mine(new)["ndsh_amount"] == 2_000_000 * 0.15
    # ХУУЧИН бодолт ХӨДӨЛСӨНГҮЙ
    again = next(r for r in client.get("/api/salary/runs", headers=h).json()
                 if r["id"] == old["id"])
    assert again["ndsh_percent"] == 11.5


# ---------- «Сарын цалингийн сан» — НЭГ тодорхойлолт ----------

def test_payroll_summary_is_one_definition_gross_and_net(client, as_role):
    """Цалин ба Аналитик хоёр НЭГ эх сурвалжаас уншина (өдрийнх нь 22 хоног)."""
    h = as_role("otgoo")
    before = client.get("/api/salary/summary", headers=h).json()
    _emp(client, h, name="Сангийн үндсэн", monthly_salary=3_000_000, ndsh=True)
    _emp(client, h, name="Сангийн өдрийн", type="daily", monthly_salary=0,
         daily_rate=100_000, ndsh=False)
    s = client.get("/api/salary/summary", headers=h).json()
    assert s["daily_days"] == 22 and s["ndsh_percent"] == 11.5
    assert s["payroll_monthly"] - before["payroll_monthly"] == 3_000_000 + 2_200_000
    # Цэвэр сан = брутто − НДШ (зөвхөн НДШ-тэй ажилтнаас)
    assert s["payroll_net"] - before["payroll_net"] == \
        3_000_000 - 345_000 + 2_200_000
    assert s["active_count"] == before["active_count"] + 2
    assert s["payroll_net"] <= s["payroll_monthly"]
    assert client.get("/api/salary/summary", headers=as_role("darga")).status_code == 403


def test_every_salary_write_leaves_an_audit_row(client, as_role):
    h = as_role("otgoo")
    e = _emp(client, h, name="Бүртгэлтэй ажилтан")
    client.put(f"/api/salary/employees/{e['id']}", headers=h, json={
        "name": "Бүртгэлтэй ажилтан", "role_title": "Нярав", "type": "main",
        "monthly_salary": 2_500_000, "daily_rate": 0, "ndsh": True})
    client.delete(f"/api/salary/employees/{e['id']}", headers=h)
    client.post(f"/api/salary/employees/{e['id']}/reactivate", headers=h)
    run = client.post("/api/salary/runs", headers=h,
                      json={"period": per(7), "half": 1, "daily_days": {}}).json()
    client.post(f"/api/salary/runs/{run['id']}/pay", headers=h, json={"date": "2026-06-30"})

    emp_rows = [r for r in client.get("/api/audit?entity=employee&limit=200",
                                      headers=h).json()["rows"]
                if r["entity_id"] == e["id"]]
    assert {"create", "update", "deactivate", "reactivate"} == {r["action"] for r in emp_rows}
    upd = next(r for r in emp_rows if r["action"] == "update")
    assert "сарын цалин" in upd["detail"] and "НДШ суутгах эсэх" in upd["detail"]
    assert "үгүй → тийм" in upd["detail"]     # 1/0 биш, ҮГ

    run_rows = [r for r in client.get("/api/audit?entity=salary&limit=200",
                                      headers=h).json()["rows"]
                if r["entity_id"] == run["id"]]
    assert {"create", "pay"} == {r["action"] for r in run_rows}
    assert "олгов" in next(r for r in run_rows if r["action"] == "pay")["detail"]

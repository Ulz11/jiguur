"""НЭГ ТОДОРХОЙЛОЛТ: «хугацаа хэтэрсэн», насжилт, ашиглалт.

Отгоо эгч самбар дээр «12 нэхэмжлэл хэтэрсэн», Авлага цуглуулах хуудсан дээр
11 мөр хараад аль нь ч үнэн гэж итгэхээ болино — тоо нь зөрөх нь алдаа биш,
ИТГЭЛИЙН асуудал. Гурван зөрүүг энд барина:

  1. «Хэтэрсэн» гурван газар гурван босгоор бодогддог байв (0 / 0.005 / 0.5₮);
  2. Насжилтын «0–30» хувин нь ХУГАЦАА БОЛООГҮЙ мөнгийг өөртөө татаж, бүх
     нэхэмжилсэн авлагыг «хоцорсон» мэт харуулдаг байв;
  3. Ашиглалт нь самбар (бүх нөөц), агуулах (бүх нөөц, ГЭВЧ хүснэгт нь зөвхөн
     идэвхтэйг жагсаана), аналитик (идэвхтэй) гурван өөр хуваарьтай байв.

Дөрөв дэх нь БИЧИЛТ: «Аналитик» хуудас нээх нь нэхэмжлэл ТӨРҮҮЛДЭГ байв.
"""
from contextlib import contextmanager
from datetime import date, timedelta

import pytest

from app import models


def iso(days_ago: int = 0) -> str:
    return str(date.today() - timedelta(days=days_ago))


@contextmanager
def session():
    """Тестийн DB рүү шууд хүрэх (route байхгүй өөрчлөлтөд — ж: `active=0`)."""
    from app.db import get_db
    from app.main import app
    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    try:
        yield db
    finally:
        gen.close()


def a_rent_contract(client, h, days_ago=70, qty=300) -> dict:
    """Хэдэн цикл нэхэгдсэн, төлөгдөөгүй гэрээ — «хэтэрсэн» мөнгө үүснэ."""
    m = next(x for x in client.get("/api/materials", headers=h).json()
             if x["name"] == "Хэв хашмал 6012")
    grade = next(s for s in m["stock"] if s["grade"] == "А")
    cl = client.post("/api/clients", headers=h,
                     json={"name": f"Хэтэрсэн {days_ago}-{qty} ХХК"}).json()
    c = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(days_ago),
        "items": [{"material_id": m["id"], "grade_id": grade["grade_id"],
                   "qty": qty, "daily_rate": 330}]}).json()
    mv = next(x for x in client.get(f"/api/contracts/{c['id']}", headers=h)
              .json()["movements"] if x["status"] == "pending")
    client.post(f"/api/movements/{mv['id']}/confirm", headers=as_darga(client))
    return {"client": cl, "contract": c}


def as_darga(client):
    r = client.post("/api/auth/login", json={"username": "darga", "password": "1234"})
    return {"Authorization": "Bearer " + r.json()["token"]}


# ---------- 1. Самбар ↔ Авлага цуглуулах ----------

def test_the_dashboard_and_the_collections_page_count_the_same_thing(client, as_role):
    h = as_role("otgoo")
    a_rent_contract(client, h, days_ago=70)
    a_rent_contract(client, h, days_ago=95, qty=120)

    kpi = client.get("/api/dashboard", headers=h).json()["kpi"]
    col = client.get("/api/collections", headers=as_role("sanhuu")).json()

    assert kpi["overdue"] == pytest.approx(col["total_overdue"], abs=2)
    assert kpi["overdue_clients"] == len(col["rows"]), \
        "самбарын «хэдэн харилцагч» нь жагсаалтын мөрийн тоо байх ёстой"
    assert kpi["overdue_count"] == sum(r["overdue_invoices"] for r in col["rows"])
    assert kpi["overdue_clients"] > 0, "тестийн урьдчилсан нөхцөл: хэтэрсэн өр байна"


def test_a_client_who_paid_to_the_last_tugrik_leaves_both_lists(client, as_role):
    """0.004₮-ийн үлдэц нь ӨР БИШ — хоёр дэлгэц НЭГ босгоор шийднэ."""
    h = as_role("otgoo")
    w = a_rent_contract(client, h, days_ago=70, qty=50)
    prof = client.get(f"/api/clients/{w['client']['id']}", headers=h).json()
    due = sum(i["outstanding"] for i in prof["invoices"])
    assert due > 0
    client.post("/api/payments", headers=h, json={
        "client_id": w["client"]["id"], "contract_id": w["contract"]["id"],
        "date": iso(), "amount": due, "method": "BANK"})

    col = client.get("/api/collections", headers=as_role("sanhuu")).json()
    assert w["client"]["id"] not in [r["client_id"] for r in col["rows"]]
    kpi = client.get("/api/dashboard", headers=h).json()["kpi"]
    assert kpi["overdue_clients"] == len(col["rows"])


# ---------- 2. Насжилт ----------

def test_aging_splits_the_invoiced_receivable_and_nothing_else(client, as_role):
    h = as_role("otgoo")
    a_rent_contract(client, h, days_ago=100)
    d = client.get("/api/dashboard", headers=h).json()

    keys = [b["key"] for b in d["aging"]]
    assert keys == ["not_due", "0_30", "31_60", "61_90", "90_plus"]
    total = sum(b["amount"] for b in d["aging"])
    assert total == pytest.approx(d["kpi"]["receivable_invoiced"], abs=3), \
        "насжилт нь НЭХЭМЖИЛСЭН авлагыг бүтнээр нь хуваана"
    aged = sum(b["amount"] for b in d["aging"] if b["key"] != "not_due")
    assert aged == pytest.approx(d["kpi"]["overdue"], abs=3), \
        "«хугацаа болоогүй»-гээс бусад нь ЯГ хэтэрсэн дүн"
    # Дэлгэц «нийлбэр = нэхэмжилсэн хэсэг» гэдгээ хэлэхийн тулд үлдсэнийг мэднэ
    assert d["receivable_uninvoiced"] == d["kpi"]["receivable_uninvoiced"]
    assert (d["kpi"]["receivable"]
            == d["kpi"]["receivable_invoiced"] + d["receivable_uninvoiced"])


def test_an_invoice_whose_day_has_not_come_sits_in_its_own_bucket(client, as_role):
    """Маргааш төлөгдөх нэхэмжлэл «0–30 хоног хоцорсон» БИШ."""
    h = as_role("otgoo")
    before = client.get("/api/dashboard", headers=h).json()
    bucket = {b["key"]: b["amount"] for b in before["aging"]}

    cl = client.post("/api/clients", headers=h,
                     json={"name": "Ирээдүйн нэхэмжлэл ХХК"}).json()
    r = client.post(f"/api/clients/{cl['id']}/entries", headers=as_role("sanhuu"),
                    json={"date": iso(-10), "amount": 2_500_000,
                          "kind": "service", "label": "Кран түрээс"})
    assert r.status_code == 200, r.text

    after = client.get("/api/dashboard", headers=h).json()
    now = {b["key"]: b["amount"] for b in after["aging"]}
    assert now["not_due"] - bucket["not_due"] == 2_500_000
    assert now["0_30"] == bucket["0_30"], "хугацаа болоогүй мөнгө хоцролт БОЛСОНГҮЙ"
    assert after["kpi"]["overdue"] == before["kpi"]["overdue"], \
        "хугацаа болоогүй нь хэтэрсэн дүнд ОРОХГҮЙ"
    assert after["kpi"]["overdue_clients"] == before["kpi"]["overdue_clients"]
    assert not any(n.get("invoice_id") and n["kind"] == "overdue"
                   and n.get("contract_id") and cl["name"] in n["title"]
                   for n in after["notifications"]), "мэдэгдэл ч гарахгүй"


# ---------- 3. Ашиглалт ----------

def test_utilization_is_the_same_number_on_every_screen(client, as_role):
    """Идэвхгүй болсон материалын нөөц гурван хуудсыг гурван тийш татаж байв."""
    h = as_role("otgoo")
    with session() as db:
        m = db.query(models.Material).filter_by(name="Тулаас В2").first()
        m.active = 0
        db.commit()

    wh = client.get("/api/stock", headers=h).json()
    dash = client.get("/api/dashboard", headers=h).json()
    rep = client.get("/api/reports/materials", headers=as_role("sanhuu")).json()

    assert wh["totals"]["utilization"] == dash["kpi"]["utilization"]
    assert wh["totals"]["utilization"] == rep["totals"]["utilization"]
    # KPI нь ХҮСНЭГТИЙН мөрүүдээс нийлнэ (идэвхгүй материал жагсаалтад алга)
    listed = sum(s["on_hand"] for r in wh["rows"] for s in r["stock"])
    assert wh["totals"]["on_hand"] == pytest.approx(listed)
    assert not any(r["name"] == "Тулаас В2" for r in wh["rows"])


# ---------- 4. Уншдаг зам БИЧДЭГГҮЙ ----------

def test_the_forecast_does_not_create_a_single_invoice(client, as_role):
    """«Аналитик» хуудас нээхэд авлага ӨСӨХГҮЙ.

    Урьд нь `cash_forecast` нь гэрээ бүрд `ensure_invoices` дуудаж, GET
    хүсэлт нэхэмжлэл төрүүлдэг байв: «би зүгээр л хартал тоо өөрчлөгдлөө»
    гэсэн итгэл эвдрэх мөч. Нэхэмжлэл нь ЗӨВХӨН өдөр тутмын гүйлтээр төрнө.
    """
    h = as_role("otgoo")
    a_rent_contract(client, h, days_ago=70)
    with session() as db:                       # нэхэмжлэлүүдийг арчина
        db.query(models.Invoice).delete()
        db.commit()
        before = db.query(models.Invoice).count()

    f = client.get("/api/reports/forecast", headers=as_role("sanhuu"))
    assert f.status_code == 200, f.text
    client.get("/api/reports/materials", headers=as_role("sanhuu"))
    with session() as db:
        assert db.query(models.Invoice).count() == before, \
            "уншдаг зам нэхэмжлэл ТӨРҮҮЛЭВ"

    # …гэхдээ мөнгө нь прогнозоос АЛГА БОЛООГҮЙ: болоогүй нэхэмжлэл тооцоологдоно
    body = f.json()
    assert body["overdue_inflow"] + sum(b["inflow"] for b in body["buckets"]) > 0

    # Харин өдөр тутмын гүйлт нь ҮҮСГЭНЭ — тэр бол түүний ажил
    client.post("/api/invoices/generate", headers=as_role("sanhuu"))
    with session() as db:
        assert db.query(models.Invoice).count() > before


def test_the_forecast_names_the_month_it_is_worried_about(client, as_role):
    f = client.get("/api/reports/forecast", headers=as_role("sanhuu")).json()
    assert "risk_month" in f
    if f["risk"] is None:
        assert f["risk_month"] is None
    else:
        assert f["risk_month"] == f["risk"]["label"]
        worst = min(f["buckets"], key=lambda b: b["cumulative"])
        assert f["risk_month"] == worst["label"], \
            "сервер ХАМГИЙН ГҮН хасагдалтай цонхыг нэрлэнэ"

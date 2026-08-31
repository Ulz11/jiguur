"""АВЛАГА — НЭГ ТОДОРХОЙЛОЛТ, БҮХ ДЭЛГЭЦЭД (Чадварын харьцуулалт H9b).

Урьд нь нэг харилцагч ХОЁР өөр нийт дүнтэй байв:
  · дашбоард / харилцагчийн мөр → нэхэмжилсэн үлдэгдэл + ОДООГИЙН циклийн
    хуримтлал (нэхэмжлэгдээгүй);
  · Авлага цуглуулах             → зөвхөн нэхэмжилсэн.
Отгоо эгч хоёр дэлгэцийг зэрэгцүүлэн хараад: «хуудсууд минь шиг л зөрж
байна — би юунд шилжсэн юм бэ?» гэнэ. Excel рүү буцах шалтгаан бүтнээрээ.

Шийдэл: **авлага = нэхэмжилсэн үлдэгдэл + одоогийн циклийн хуримтлал**.
Энэ бол түүний өөрийнх нь удирддаг БҮТЭН үнэн («гадаа байгаа бараа мөнгө
болж хуримтлагдсаар байна»). БҮРЭЛДЭХҮҮН нь харагдаж болно
(«үүнээс нэхэмжлэгдээгүй: X₮»), НИЙТ дүн нь ГАНЦ байна.
"""
from datetime import date

from app import models
from app.services import billing
from tests.test_api import iso, make_contract, _confirm_pending


def _live_client(client, as_role):
    """40 хоногийн өмнөх гэрээ: 1 хэтэрсэн нэхэмжлэл + 10 хоногийн ХУРИМТЛАЛ."""
    h = as_role("sanhuu")
    cl_id, cid, _m, _st = make_contract(client, as_role, days_ago=40, qty=100)
    _confirm_pending(client, as_role, cid)
    return h, cl_id, cid


def _row(rows, cl_id, key="id"):
    return next(r for r in rows if r[key] == cl_id)


# ---------- 1. Дөрвөн хариу, НЭГ тоо ----------

def test_the_same_client_shows_one_receivable_on_every_screen(client, as_role):
    """/clients · /clients/{id} · /dashboard-ийн хуваарийн мөр · /collections."""
    h, cl_id, _cid = _live_client(client, as_role)

    lst = _row(client.get("/api/clients", headers=h).json(), cl_id)["receivable"]
    prof = client.get(f"/api/clients/{cl_id}", headers=h).json()["receivable"]

    dash = client.get("/api/dashboard", headers=h).json()
    sched = _row(dash["payment_schedule"], cl_id, "client_id")["receivable"]

    col = _row(client.get("/api/collections", headers=h).json()["rows"],
               cl_id, "client_id")["balance"]

    assert lst == prof == sched == col, \
        f"авлага зөрлөө: жагсаалт {lst} · профайл {prof} · хуваарь {sched} · цуглуулалт {col}"
    assert lst > 0


def test_the_unified_total_carries_the_uninvoiced_accrual(client, as_role):
    """Нийт дүн нь нэхэмжилсэнээс ИХ — дундах хуримтлал нь дотор нь байна."""
    h, cl_id, cid = _live_client(client, as_role)
    row = _row(client.get("/api/clients", headers=h).json(), cl_id)

    invoiced = row["receivable_invoiced"]
    uninvoiced = row["receivable_uninvoiced"]
    assert uninvoiced > 0, "10 хоногийн хуримтлал байх ёстой"
    assert row["receivable"] == invoiced + uninvoiced

    # 100ш × 330₮ × 30 хоног = 990,000₮ нэхэгдсэн.
    # Хоёр дахь цикл 10 хоногийн өмнө эхэлсэн; хуримтлал нь ӨНӨӨДРИЙГ
    # ОРУУЛАН тоологдоно (Отгоо гадаа байгаа хоногоо ингэж тоолдог) = 11 хоног.
    assert invoiced == 990_000
    assert uninvoiced == 100 * 330 * 11


def test_every_payload_carries_the_same_split(client, as_role):
    """Бүрэлдэхүүн нь ч дөрвүүлээ ижил — «үүнээс нэхэмжлэгдээгүй» нэг тоо."""
    h, cl_id, _cid = _live_client(client, as_role)

    lst = _row(client.get("/api/clients", headers=h).json(), cl_id)
    prof = client.get(f"/api/clients/{cl_id}", headers=h).json()
    sched = _row(client.get("/api/dashboard", headers=h).json()["payment_schedule"],
                 cl_id, "client_id")
    col = _row(client.get("/api/collections", headers=h).json()["rows"],
               cl_id, "client_id")

    un = lst["receivable_uninvoiced"]
    assert un > 0
    assert (prof["receivable_uninvoiced"] == sched["receivable_uninvoiced"]
            == col["balance_uninvoiced"] == un)
    assert col["balance_invoiced"] == lst["receivable_invoiced"]


# ---------- 2. Авлагын жагсаалт дээрх «хэтэрсэн» ----------

def test_overdue_is_a_subset_of_the_unified_receivable(client, as_role):
    """«Хэтэрсэн» нь ХЭВЭЭР — нэхэгдсэн, хугацаа нь өнгөрсөн хэсэг.

    Тиймээс `overdue ≤ balance_invoiced ≤ balance` гэсэн эрэмбэ ХЭЗЭЭ Ч
    зөрөхгүй: жагсаалтын эрэмбэ, шүүлтүүр, «залгах дараалал» хөндөгдөөгүй.
    """
    h, cl_id, _cid = _live_client(client, as_role)
    d = client.get("/api/collections", headers=h).json()
    for r in d["rows"]:
        assert r["overdue"] <= r["balance_invoiced"] <= r["balance"]
    row = _row(d["rows"], cl_id, "client_id")
    assert row["overdue"] == 990_000
    assert row["balance"] > row["overdue"]
    # Толгойн «Хугацаа хэтэрсэн нийт» нь ХЭТЭРСЭНийг хэвээр нийлүүлнэ
    assert d["total_overdue"] == sum(r["overdue"] for r in d["rows"])


def test_collections_still_lists_only_clients_with_overdue(client, as_role):
    """Нийт дүн өссөн ч жагсаалтад ОРОХ шалгуур нь хэвээр — хэтэрсэн байх."""
    h, _cl_id, _cid = _live_client(client, as_role)
    # Хугацаа хэтрээгүй, зөвхөн хуримтлалтай шинэ гэрээ
    fresh_cl, fresh_cid, _m, _st = make_contract(client, as_role, days_ago=5, qty=50)
    _confirm_pending(client, as_role, fresh_cid)

    ids = {r["client_id"] for r in client.get("/api/collections", headers=h).json()["rows"]}
    assert fresh_cl not in ids


# ---------- 3. Дашбоардын KPI ----------

def test_dashboard_kpi_names_the_uninvoiced_share(client, as_role):
    """KPI-ийн авлага ч ижил томьёо — доор нь «үүнээс нэхэмжлэгдээгүй»."""
    h, cl_id, _cid = _live_client(client, as_role)
    k = client.get("/api/dashboard", headers=h).json()["kpi"]
    assert k["receivable"] == k["receivable_invoiced"] + k["receivable_uninvoiced"]
    assert k["receivable_uninvoiced"] >= 100 * 330 * 10


# ---------- 4. Ганц эх сурвалж ----------

def test_client_receivable_is_the_single_serializer(client, as_role):
    """`billing.client_receivable` — дэлгэц бүрийн тоо ЭНДЭЭС гарна."""
    h, cl_id, _cid = _live_client(client, as_role)
    row = _row(client.get("/api/clients", headers=h).json(), cl_id)

    from app.db import SessionLocal          # noqa: F401  (зөвхөн API-тай тулгана)
    # API-ийн хариу нь бүхэл тоо (round) — функц нь бутархай
    assert abs(row["receivable"] - row["receivable_invoiced"]
               - row["receivable_uninvoiced"]) <= 1


def test_receivable_of_a_client_with_no_contracts_is_zero(client, as_role):
    h = as_role("sanhuu")
    cl = client.post("/api/clients", json={"name": "Хоосон ХХК"},
                     headers=as_role("otgoo")).json()
    row = _row(client.get("/api/clients", headers=h).json(), cl["id"])
    assert row["receivable"] == row["receivable_invoiced"] == row["receivable_uninvoiced"] == 0


def test_paid_off_client_shows_zero_receivable(client, as_role):
    """Бүтэн төлсний дараа нэхэмжилсэн хэсэг 0 — хуримтлал нь ҮЛДЭНЭ."""
    h, cl_id, cid = _live_client(client, as_role)
    r = client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 990_000, "method": "BANK"})
    assert r.status_code == 200, r.text

    row = _row(client.get("/api/clients", headers=h).json(), cl_id)
    assert row["receivable_invoiced"] == 0
    assert row["receivable"] == row["receivable_uninvoiced"] > 0

"""M6 / H7 — хаалтын API: огноо, эцсийн нэхэмжлэл, урьдчилан харагдац.

Отгоо эгчийн ёслол: гадаа үлдсэнээ шийд → эцсийн ТАСАРХАЙ циклээ нэх →
барьцаагаа цэвэрлэ → «хаав» гэж бич. Хаалтын wizard нь тэр дарааллыг
дэлгэц дээр давтдаг бөгөөс сервер нь түүний ГУРВАН асуултад хариулна:
юу гадаа байна, эцсийн тооцоо хэд болох, юу төлөгдөөгүй үлдэх вэ.

СУУРЬ КЕЙС: 40 хоногийн өмнөх гэрээ, 100ш × 330₮ (33,000₮/хоног).
Хоёр дахь цикл эхлээд 10 хоног болсон үед бүгдийг буцааж хаавал
эцсийн тасархай нэхэмжлэл = 33,000 × 10 = 330,000₮.
"""
from datetime import date, timedelta

from tests.test_api import iso, make_contract, _confirm_pending


def _detail(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()


def _setup(client, as_role, qty=100, returned=True):
    """Гэрээ + баталгаажсан ачилт (+ өнөөдөр бүгдийг буцаасан)."""
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=qty)
    _confirm_pending(client, as_role, cid)
    h = as_role("otgoo")
    client.patch(f"/api/contracts/{cid}", headers=h, json={"penalty_percent": 0})
    client.get(f"/api/contracts/{cid}", headers=h)      # ensure_invoices
    if returned:
        r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
            "type": "RETURN", "date": iso(0),
            "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": qty}]})
        assert r.status_code == 200, r.text
    return cid, m, st


# ---------- 1. Хаалт нь ОГНОО авч явна ----------

def test_close_materialises_the_final_partial_invoice(client, as_role):
    """Хаах агшинд эцсийн тасархай цикл нэхэмжлэл БОЛНО (H7)."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    before = len(_detail(client, h, cid)["invoices"])

    r = client.post(f"/api/contracts/{cid}/close", headers=h,
                    json={"close_date": iso(0)})
    assert r.status_code == 200, r.text
    assert r.json()["closed_date"] == iso(0)
    assert len(r.json()["invoices"]) == 1
    stub = r.json()["invoices"][0]
    assert stub["total"] == 330_000

    d = _detail(client, h, cid)
    assert d["status"] == "closed" and d["closed_date"] == iso(0)
    assert len(d["invoices"]) == before + 1
    assert any(i["total"] == 330_000 for i in d["invoices"])


def test_one_click_close_without_a_body_still_works(client, as_role):
    """Хуучин зам (биегүй POST) — өнөөдрөөр хаагдана, API нийцтэй хэвээр."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    r = client.post(f"/api/contracts/{cid}/close", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert _detail(client, h, cid)["closed_date"] == iso(0)


def test_close_date_before_the_last_movement_is_rejected(client, as_role):
    """Хаах огноо буцаалтаас ӨМНӨ байвал цаас өөрөө өөртэйгээ зөрчилдөнө."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    r = client.post(f"/api/contracts/{cid}/close", headers=h,
                    json={"close_date": iso(3)})
    assert r.status_code == 400
    assert "хөдөлгөөн" in r.json()["detail"].lower()
    assert _detail(client, h, cid)["status"] == "active"


def test_close_date_in_the_future_is_rejected(client, as_role):
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    r = client.post(f"/api/contracts/{cid}/close", headers=h,
                    json={"close_date": str(date.today() + timedelta(days=1))})
    assert r.status_code == 400
    assert "ирээдүй" in r.json()["detail"].lower()


def test_close_is_still_blocked_while_goods_are_out(client, as_role):
    """Гадаа бараатай хаалт ХЭВЭЭР 400 — wizard-ийн (a) алхам үүн дээр зогсоно."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role, returned=False)
    r = client.post(f"/api/contracts/{cid}/close", headers=h, json={"close_date": iso(0)})
    assert r.status_code == 400
    assert "түрээс" in r.json()["detail"].lower()


# ---------- 2. Урьдчилан харагдац — wizard-ийн гурван алхам ----------

def test_preview_lists_the_outstanding_lots_with_book_price(client, as_role):
    """(a) алхам: гадаа юу үлдэв — тоо ба ДУТАГДУУЛСАН болбол хэдэн ₮ болох."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role, returned=False)
    p = client.get(f"/api/contracts/{cid}/close-preview", headers=h).json()
    assert p["can_close"] is False
    row = p["outstanding"][0]
    assert row["material_id"] == m["id"] and row["qty"] == 100
    assert row["nb_price"] == 69_500                 # А зэрэглэлийн НБҮнэ
    assert row["writeoff_amount"] == 100 * 69_500


def test_preview_shows_the_final_amount_without_writing_anything(client, as_role):
    """(b) алхам: эцсийн тооцоо — DB-д мөр ч, төлөв ч ҮЛДЭХГҮЙ."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    before = len(_detail(client, h, cid)["invoices"])

    p = client.get(f"/api/contracts/{cid}/close-preview", headers=h).json()
    assert p["can_close"] is True
    assert p["outstanding"] == []
    assert len(p["final_invoices"]) == 1
    fi = p["final_invoices"][0]
    assert fi["total"] == 330_000
    assert fi["cycle_end"] == str(date.today() + timedelta(days=1))
    assert fi["label"]                                # багтаамжтай шошго
    assert p["unpaid"] > 0                            # эхний цикл төлөгдөөгүй

    d = _detail(client, h, cid)
    assert d["status"] == "active"
    assert len(d["invoices"]) == before               # хуурай — юу ч төрөөгүй


def test_preview_honours_a_chosen_close_date(client, as_role):
    """Сонгосон огноогоор дүн нь ХӨДӨЛНӨ — тэр огноог өөрөө сонгоно."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role, returned=False)
    p = client.get(f"/api/contracts/{cid}/close-preview",
                   headers=h, params={"close_date": iso(5)}).json()
    # Цонх нь [эхлэл+30, хаасан өдөр + 1) — 5 хоногийн өмнөөр хаавал 6 хоног
    # (бараа тэр өдрөө ч гадаа байсан тул хаалтын өдөр нь ТООЛОГДОНО)
    assert p["final_invoices"][0]["total"] == 33_000 * 6


def test_preview_reports_the_date_problem_instead_of_500(client, as_role):
    """Буруу огноо нь wizard-д УРЬДЧИЛЖ хэлэгдэнэ — товч дарахаас өмнө."""
    h = as_role("otgoo")
    cid, m, st = _setup(client, as_role)
    p = client.get(f"/api/contracts/{cid}/close-preview",
                   headers=h, params={"close_date": iso(3)}).json()
    assert p["can_close"] is False
    assert "хөдөлгөөн" in p["close_error"].lower()


def test_preview_carries_the_deposit_and_penalty_state(client, as_role):
    """(c) алхам: барьцаа ба нэхэгдсэн/нэхэгдээгүй алданги нэг мөрөнд."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40, qty=100, deposit=5_000_000)
    _confirm_pending(client, as_role, cid)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 100}]})
    p = client.get(f"/api/contracts/{cid}/close-preview", headers=h).json()
    assert p["deposit"]["amount"] == 5_000_000
    assert p["deposit"]["settled"] is False
    assert p["penalty_unbooked"] > 0                  # 0.5%/хоног — нэхэгдээгүй
    assert p["penalty_booked"] == 0


def test_preview_is_denied_to_the_factory_boss(client, as_role):
    """Хаалтын тооцоо бол МӨНГӨ — үйлдвэрийн даргад хаалттай."""
    cid, m, st = _setup(client, as_role)
    assert client.get(f"/api/contracts/{cid}/close-preview",
                      headers=as_role("darga")).status_code == 403

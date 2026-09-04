"""«ТООЦОО НИЙЛСЭН» — ЭНЭ ТООГ ХОЁР ТАЛ ГАРЫН ҮСГЭЭР БАТАЛСАН (№69 / P1-5).

Отгоо эгчийн АРВААН харилцагчийн хуудас бүр гарын үсгийн блокоор дуусдаг:

    БЛҮҮМ-2: «Тооцоо нийлсэн: » / « Жигүүр Зам ХХК» /
             « Ч.Отгонцэцэг ..... 94003848  80118801» /
             «түрээслэгч: БЛҮҮМ ХХК » / « Н.Манлай  ........  99003777»

Энэ бол чимэг БИШ, ТӨЛӨВ: тэр дүн дээр маргаан ДУУССАН. Систем нь
баталгаажсан ба батлагдаагүй тоог ЯЛГАДАГГҮЙ байсан — түүний бүх итгэл
тэр мөрөнд байдаг тул энэ ялгаагүй бол «энэ бол миний тооцоо биш» болно.
"""
from datetime import date, timedelta

from tests.test_features import iso, mk_contract


def _invoices(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()["invoices"]


def _first_invoice(client, h, cid):
    rows = _invoices(client, h, cid)
    assert rows, "тестийн урьдчилсан нөхцөл: нэхэмжлэл байх ёстой"
    return rows[-1]


def test_marking_an_invoice_agreed_records_the_date_and_the_signatory(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    assert inv["agreed_at"] is None and inv["agreed_by"] == ""

    r = client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                    json={"date": "2026-07-20", "by": "Н.Манлай"})
    assert r.status_code == 200, r.text
    assert r.json()["agreed_at"] == "2026-07-20"

    again = next(i for i in _invoices(client, h, c["id"]) if i["id"] == inv["id"])
    assert again["agreed_at"] == "2026-07-20"
    assert again["agreed_by"] == "Н.Манлай"


def test_the_signatory_is_required_because_a_tick_alone_names_nobody(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    r = client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                    json={"date": iso(0), "by": "   "})
    assert r.status_code == 400


def test_the_date_defaults_to_today(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    r = client.post(f"/api/invoices/{inv['id']}/agree", headers=h, json={"by": "Н.Манлай"})
    assert r.status_code == 200, r.text
    assert r.json()["agreed_at"] == iso(0)


def test_an_agreed_invoice_is_not_silently_re_signed(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                json={"date": iso(0), "by": "Н.Манлай"})
    r = client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                    json={"date": iso(0), "by": "Өөр хүн"})
    assert r.status_code == 409


def test_unagree_lifts_the_state_and_demands_a_reason(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                json={"date": iso(0), "by": "Н.Манлай"})
    bad = client.post(f"/api/invoices/{inv['id']}/unagree", headers=h, json={"reason": " "})
    assert bad.status_code == 400
    ok = client.post(f"/api/invoices/{inv['id']}/unagree", headers=h,
                     json={"reason": "тоо зөрж байсан"})
    assert ok.status_code == 200, ok.text
    again = next(i for i in _invoices(client, h, c["id"]) if i["id"] == inv["id"])
    assert again["agreed_at"] is None and again["agreed_by"] == ""
    # Нийлээгүй нэхэмжлэлийг ДАХИН цуцлах юм байхгүй
    assert client.post(f"/api/invoices/{inv['id']}/unagree", headers=h,
                       json={"reason": "дахин"}).status_code == 409


def test_the_factory_boss_never_signs_off_a_number(client, as_role):
    hd, ho = as_role("darga"), as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, ho, c["id"])
    assert client.post(f"/api/invoices/{inv['id']}/agree", headers=hd,
                       json={"date": iso(0), "by": "Н.Манлай"}).status_code == 403
    client.post(f"/api/invoices/{inv['id']}/agree", headers=ho,
                json={"date": iso(0), "by": "Н.Манлай"})
    assert client.post(f"/api/invoices/{inv['id']}/unagree", headers=hd,
                       json={"reason": "х"}).status_code == 403


def test_finance_may_sign_off(client, as_role):
    h = as_role("sanhuu")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    assert client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                       json={"date": iso(0), "by": "Н.Манлай"}).status_code == 200


def test_the_action_is_written_into_the_audit_log(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                json={"date": "2026-07-20", "by": "Н.Манлай"})
    rows = client.get("/api/audit?entity=invoice", headers=h).json()
    row = next(r for r in rows if r["action"] == "agree" and r["entity_id"] == inv["id"])
    assert "Н.Манлай" in row["detail"] and "2026-07-20" in row["detail"]


def test_a_rebuild_warns_before_it_rewrites_an_agreed_invoice(client, as_role):
    """Батлагдсан тоог дахин бодох нь ЧИМЭЭГҮЙ өнгөрөх ёсгүй (P1-5).

    «Тооцоо нийлсэн» гэж тэмдэглэсэн нэхэмжлэл дахин бодогдвол хоёр талын
    гарын үсэг зурсан тоо өөрчлөгдөнө — засварын хаалга (RebuildModal)
    түүнийг НЭРЛЭЖ хэлнэ.
    """
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, deposit=0, days_ago=40)
    inv = _first_invoice(client, h, c["id"])
    client.post(f"/api/invoices/{inv['id']}/agree", headers=h,
                json={"date": iso(0), "by": "Н.Манлай"})
    r = client.patch(f"/api/contracts/{c['id']}", headers=h, json={"start_date": iso(45)})
    assert r.status_code == 200, r.text
    body = r.json()
    warns = body.get("preview", body).get("warnings", []) if isinstance(body, dict) else []
    assert any("нийлсэн" in w for w in warns), f"анхааруулга алга: {warns}"


def test_the_agreed_line_reads_as_the_paper_does():
    """Актын мөр нь хуудасныхтай ИЖИЛ өгүүлбэр болно."""
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from types import SimpleNamespace
    from app.services import pdfgen

    inv = SimpleNamespace(agreed_at=date(2026, 7, 20), agreed_by="Н.Манлай")
    assert pdfgen.agreed_line(inv) == "Тооцоо нийлсэн: 2026.07.20 · Н.Манлай"
    assert pdfgen.agreed_line(SimpleNamespace(agreed_at=None, agreed_by="")) == ""
    # Гарын үсэгтэн бичигдээгүй бол огноо нь ганцаараа зогсоно
    assert pdfgen.agreed_line(SimpleNamespace(agreed_at=date(2026, 7, 20), agreed_by="")) \
        == "Тооцоо нийлсэн: 2026.07.20"

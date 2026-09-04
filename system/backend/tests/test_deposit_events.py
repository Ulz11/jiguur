"""БАРЬЦАА БОЛ ГҮЙДЭГ ДЭВТЭР, НЭГ НҮД БИШ (Чадварын харьцуулалт H8 / P1-11).

Зулаагийн хуудсан дээр барьцааны нүд нь ЭНЭ байдалтай сууна:

    G30 = «=20000000-8265000+3000000+3000000+10000000» = 27,735,000

Энэ бол нэг тоо БИШ — ТАВАН ШИЙДВЭР: 20 сая байршуулав, 8,265,000-ыг
авлагад суутгав, дараа нь гурван удаа нэмж байршуулав. Систем нь өнөөдөр
`Contract.deposit` гэсэн ГАНЦ float-д тэр таваас зөвхөн ҮР ДҮНГ нь барьдаг:
«аль нь буцаагдсан, аль нь суутгагдсан» гэдэг нь алга болно, тиймээс
гэрээний хаалт нь ХУДАЛ болно.

Мөн Бутангууд, Өнө Ордын хуудсууд дээр барьцааны нүдэнд «байршуулаагүй»
гэж БИЧИГДСЭН байдаг — тэр нь 0 БИШ, «үйл явдал огт болоогүй» (№55).

Иймд: `DepositEvent` дэвтэр; `Contract.deposit` нь тэдгээрийн НИЙЛБЭР
(багана нь кэш болж үлдэнэ — бүх хуучин уншигч хэвээр ажиллана).
"""
from datetime import date, timedelta

from tests.test_features import iso, mk_contract


def _events(client, h, cid):
    r = client.get(f"/api/contracts/{cid}/deposit-events", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _add(client, h, cid, kind, amount, days_ago=0, note=""):
    return client.post(f"/api/contracts/{cid}/deposit-events", headers=h, json={
        "kind": kind, "date": iso(days_ago), "amount": amount, "note": note})


def _receivable(client, h, cl_id) -> float:
    return client.get(f"/api/clients/{cl_id}", headers=h).json()["receivable"]


def _contract(client, h, cid) -> dict:
    return client.get(f"/api/contracts/{cid}", headers=h).json()


# ---------- 1. Зулаагийн гинж — ТАВАН явдал, НЭГ үлдэгдэл ----------

def test_zulaa_deposit_chain_is_five_events_not_one_number(client, as_role):
    """«=20000000-8265000+3000000+3000000+10000000» → 27,735,000₮."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=400, deposit=0, days_ago=70)
    cid = c["id"]

    assert _add(client, h, cid, "lodge", 20_000_000, 60).status_code == 200
    assert _add(client, h, cid, "apply", 8_265_000, 50).status_code == 200
    for d in (40, 30, 20):
        assert _add(client, h, cid, "topup", 3_000_000 if d != 20 else 10_000_000,
                    d).status_code == 200

    st = _events(client, h, cid)
    assert st["balance"] == 27_735_000
    assert len(st["events"]) == 5
    assert st["status"] == "held"
    # `Contract.deposit` нь ЭДГЭЭРИЙН нийлбэр — хуучин уншигчид хэвээр
    d = _contract(client, h, cid)
    assert d["deposit"] == 27_735_000
    assert d["deposit_applied"] == 8_265_000
    assert d["deposit_returned"] == 0


def test_the_ledger_carries_the_running_balance_of_every_line(client, as_role):
    """Мөр бүр «энэ бичилтийн ДАРААХ үлдэгдэл»-ээ өөртөө авч явна."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=400, deposit=0, days_ago=70)
    cid = c["id"]
    _add(client, h, cid, "lodge", 20_000_000, 60)
    _add(client, h, cid, "apply", 8_265_000, 50)
    _add(client, h, cid, "topup", 3_000_000, 40)
    rows = _events(client, h, cid)["events"]
    assert [r["balance_after"] for r in rows] == [20_000_000, 11_735_000, 14_735_000]


# ---------- 2. «байршуулаагүй» ≠ 0 ----------

def test_a_contract_with_no_events_is_not_lodged_not_zero(client, as_role):
    """Явдал огт байхгүй бол төлөв нь `none` — «0 барьцаатай» БИШ."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=0, days_ago=35)
    st = _events(client, h, c["id"])
    assert st["events"] == []
    assert st["status"] == "none"
    assert _contract(client, h, c["id"])["deposit_status"] == "none"


def test_a_contract_created_with_a_deposit_gets_its_lodge_event(client, as_role):
    """Гэрээ үүсгэхэд бичсэн барьцаа нь ЭХНИЙ байршуулалт болно."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=21_000_000, days_ago=35)
    st = _events(client, h, c["id"])
    assert st["balance"] == 21_000_000
    assert [e["kind"] for e in st["events"]] == ["lodge"]
    assert st["events"][0]["date"] == iso(35), "байршуулалт нь гэрээний эхлэх өдрөөр"


def test_topup_without_a_lodge_is_refused(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=0, days_ago=35)
    r = _add(client, h, c["id"], "topup", 1_000_000)
    assert r.status_code == 400
    assert "байршуул" in r.json()["detail"]


# ---------- 3. Суутгал = synthetic төлбөр (өнөөдрийнхтэй ЯГ ижил) ----------

def test_apply_books_the_synthetic_payment_and_moves_the_receivable(client, as_role):
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=400, deposit=10_000_000, days_ago=70)
    cid = c["id"]
    before = _receivable(client, h, cl["id"])
    assert before > 6_000_000

    r = _add(client, h, cid, "apply", 6_000_000)
    assert r.status_code == 200, r.text
    after = _receivable(client, h, cl["id"])
    assert before - after == 6_000_000, "суутгасан дүнгээр авлага ЯГ буурна"

    ev = r.json()["event"]
    assert ev["payment_id"], "суутгал нь ЖИНХЭНЭ төлбөрийн бичилт болно"
    pays = client.get(f"/api/payments?client_id={cl['id']}", headers=h).json()
    p = next(p for p in pays if p["id"] == ev["payment_id"])
    assert p["amount"] == 6_000_000 and not p["voided"]


def test_return_never_touches_the_receivable(client, as_role):
    """Буцаалт нь харилцагчид ӨГСӨН мөнгө — түүний өрийг хөндөхгүй."""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=400, deposit=10_000_000, days_ago=70)
    before = _receivable(client, h, cl["id"])
    assert _add(client, h, c["id"], "return", 4_000_000).status_code == 200
    assert _receivable(client, h, cl["id"]) == before
    assert _contract(client, h, c["id"])["deposit"] == 6_000_000


def test_the_ledger_never_spends_more_than_it_holds(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=1_000_000, days_ago=35)
    bad = _add(client, h, c["id"], "apply", 1_500_000)
    assert bad.status_code == 400
    assert _add(client, h, c["id"], "return", 1_000_000).status_code == 200
    assert _contract(client, h, c["id"])["deposit_status"] == "settled"


# ---------- 4. ХҮЧИНГҮЙ — тэгш хэмтэй ----------

def test_voiding_an_apply_voids_its_payment_and_gives_the_deposit_back(client, as_role):
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=400, deposit=10_000_000, days_ago=70)
    cid = c["id"]
    before = _receivable(client, h, cl["id"])
    ev = _add(client, h, cid, "apply", 6_000_000).json()["event"]
    assert _receivable(client, h, cl["id"]) == before - 6_000_000

    r = client.post(f"/api/deposit-events/{ev['id']}/void", headers=h,
                    json={"reason": "буруу дүн бичив"})
    assert r.status_code == 200, r.text
    assert _receivable(client, h, cl["id"]) == before, "авлага ЯГ буцаж ирнэ"
    assert _contract(client, h, cid)["deposit"] == 10_000_000

    pays = client.get(f"/api/payments?client_id={cl['id']}", headers=h).json()
    p = next(p for p in pays if p["id"] == ev["payment_id"])
    assert p["voided"], "synthetic төлбөр нь хамт хүчингүй болно"
    # Мөр нь УСТАХГҮЙ — дэвтэр дээр ХҮЧИНГҮЙ гэж харагдсаар үлдэнэ
    rows = _events(client, h, cid)["events"]
    assert any(e["id"] == ev["id"] and e["voided"] for e in rows)


def test_a_voided_event_leaves_the_running_total(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=0, days_ago=35)
    cid = c["id"]
    _add(client, h, cid, "lodge", 20_000_000, 30)
    top = _add(client, h, cid, "topup", 3_000_000, 20).json()["event"]
    assert _events(client, h, cid)["balance"] == 23_000_000
    client.post(f"/api/deposit-events/{top['id']}/void", headers=h,
                json={"reason": "давхар бичив"})
    assert _events(client, h, cid)["balance"] == 20_000_000


def test_void_needs_a_reason(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=5_000_000, days_ago=35)
    ev = _events(client, h, c["id"])["events"][0]
    r = client.post(f"/api/deposit-events/{ev['id']}/void", headers=h, json={"reason": "  "})
    assert r.status_code == 400


# ---------- 5. Хуучин хаалга ХЭВЭЭР ----------

def test_settle_deposit_still_works_and_writes_an_apply_return_pair(client, as_role):
    """`POST /settle-deposit` нь ХЭРЭГЛЭЖ БАЙГАА хаалга — одоо дэвтэр рүү бичнэ."""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=400, deposit=10_000_000, days_ago=70)
    cid = c["id"]
    before = _receivable(client, h, cl["id"])
    r = client.post(f"/api/contracts/{cid}/settle-deposit", headers=h, json={
        "date": iso(0), "apply_amount": 6_000_000, "return_amount": 4_000_000})
    assert r.status_code == 200, r.text
    st = _events(client, h, cid)
    assert [e["kind"] for e in st["events"]] == ["lodge", "apply", "return"]
    assert st["balance"] == 0 and st["status"] == "settled"
    assert before - _receivable(client, h, cl["id"]) == 6_000_000


# ---------- 6. Ролийн зураас ----------

def test_the_factory_boss_can_read_but_never_write_the_deposit_ledger(client, as_role):
    hd = as_role("darga")
    ho = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=5_000_000, days_ago=35)
    cid = c["id"]
    ev = _events(client, ho, cid)["events"][0]
    assert client.get(f"/api/contracts/{cid}/deposit-events", headers=hd).status_code == 403
    assert _add(client, hd, cid, "topup", 1_000_000).status_code == 403
    assert client.post(f"/api/deposit-events/{ev['id']}/void", headers=hd,
                       json={"reason": "х"}).status_code == 403


def test_finance_may_write_the_deposit_ledger(client, as_role):
    h = as_role("sanhuu")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, deposit=5_000_000, days_ago=35)
    assert _add(client, h, c["id"], "topup", 1_000_000).status_code == 200


# ---------- 7. Хуучин DB-ийн нөхөлт ----------

def test_backfill_gives_a_legacy_deposit_its_lodge_event(tmp_path):
    """Хуучин `deposit` багана нь дэвтэргүй үлдэх ёсгүй — түүх тасрана."""
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from sqlalchemy import create_engine
    from app.db import Base
    from app.schema import migrate_schema

    path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    settled = date.today() - timedelta(days=5)
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM deposit_events")
        conn.exec_driver_sql(
            "INSERT INTO clients (id, name, reg, person, phone, note, created_at) "
            "VALUES (1, 'Зулаа', '', '', '', '', '2026-01-01 00:00:00')")
        cols = ("id, no, client_id, type, start_date, cycle_days, cycle_mode, "
                "penalty_percent, deposit, deposit_status, deposit_returned, "
                "deposit_applied, deposit_settled_date, vat_percent, status, note, created_at")
        conn.exec_driver_sql(
            f"INSERT INTO contracts ({cols}) VALUES "
            "(1, '25/03', 1, 'rent', '2026-03-15', 30, 'days', 0, 27735000, 'held', "
            "0, 0, NULL, 0, 'active', '', '2026-03-15 00:00:00')")
        # Хоёр дахь гэрээ: хуучин системд АЛЬ ХЭДИЙН тооцоо хийгдсэн
        conn.exec_driver_sql(
            f"INSERT INTO contracts ({cols}) VALUES "
            "(2, '25/09', 1, 'rent', '2026-01-10', 30, 'days', 0, 5000000, 'settled', "
            f"2000000, 3000000, '{settled}', 0, 'active', '', '2026-01-10 00:00:00')")

    migrate_schema(engine)
    with engine.begin() as conn:
        rows = conn.exec_driver_sql(
            "SELECT contract_id, kind, amount, date, note FROM deposit_events "
            "ORDER BY contract_id, id").fetchall()
    by_c: dict = {}
    for cid, kind, amount, day, note in rows:
        by_c.setdefault(cid, []).append((kind, amount, day, note))
    assert by_c[1] == [("lodge", 27_735_000, "2026-03-15", "хуучин системээс")]
    # Тооцоо хийгдсэн гэрээ нь ГУРВАН мөр болж, үлдэгдэл нь 0 болно
    assert [k for k, *_ in by_c[2]] == ["lodge", "apply", "return"]
    assert sum(a if k in ("lodge", "topup") else -a for k, a, *_ in by_c[2]) == 0

    # ДАХИН ажиллуулахад давхардуулахгүй
    migrate_schema(engine)
    with engine.begin() as conn:
        again = conn.exec_driver_sql("SELECT COUNT(*) FROM deposit_events").fetchone()[0]
    assert again == len(rows)
    engine.dispose()

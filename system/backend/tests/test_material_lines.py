"""Материал бүрийн ХӨДӨЛГӨӨНИЙ ДЭВТЭР — гэрээний дэлгэрэнгүйн уншилтын хэсэг.

Отгоо Numbers дээрээ материал бүрийн доор нь тэр материалын түүхийг (юу гарсан,
юу буцсан, аль паданнаас) бичдэг байсан. Энэ дэвтэр нь ЯГ тэр: гэрээний
дэлгэрэнгүйд материалын мөрийн доор задарч гарах мөрүүд.

ХАМГААЛАХ ЁСТОЙ ТЭНЦЭЛ: мөрүүдийн тэмдэгт дүнгийн нийлбэр = гадаа байгаа тоо.
Хамаарал (аль падангаас хассан) нь ХАДГАЛАГДАХГҮЙ — `billing`-ийн заасан падан
/ FIFO дүрмээр бодогдоно.
"""
from datetime import date, timedelta

import pytest


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def _confirm_pending(client, as_role, cid: int):
    """Гэрээний хүлээгдэж буй ачилтуудыг дарга баталгаажуулна."""
    hd = as_role("darga")
    for p in client.get("/api/dashboard", headers=hd).json()["pending_shipments"]:
        if p["contract_id"] == cid:
            client.post(f"/api/movements/{p['id']}/confirm", headers=hd)


def _groups(d: dict) -> dict:
    return {(g["material_id"], g["grade_id"]): g for g in d["material_lines"]}


def test_detail_exposes_material_lines_for_every_item_row(client, as_role):
    """Материалын хүснэгтийн мөр бүр өөрийн дэвтэртэй байна."""
    h = as_role("otgoo")
    d = client.get("/api/contracts/1", headers=h).json()
    groups = _groups(d)
    assert groups, "material_lines хоосон байж болохгүй"
    for it in d["items"]:
        assert (it["material_id"], it["grade_id"]) in groups


def test_material_lines_running_balance_equals_held_qty(client, as_role):
    """Тэмдэгт дүнгийн нийлбэр = тухайн материалын гадаа байгаа тоо.

    Блүүмийн гэрээ: 2131 гарч, 306 буцаж, 400 буцсан → 1425 гадаа.
    """
    h = as_role("otgoo")
    d = client.get("/api/contracts/1", headers=h).json()
    for key, g in _groups(d).items():
        held = sum(it["qty"] for it in d["items"]
                   if (it["material_id"], it["grade_id"]) == key)
        counted = sum(ln["delta"] for ln in g["lines"] if ln["counted"])
        assert counted == pytest.approx(held), f"{g['material']} ({g['grade']})"
        assert g["held"] == pytest.approx(held)
    m6012 = next(g for g in d["material_lines"] if g["material"] == "Хэв хашмал 6012")
    assert m6012["held"] == pytest.approx(2131 - 306 - 400)
    assert m6012["held"] == pytest.approx(1425)


def test_material_lines_are_in_date_order_and_carry_lot_rate(client, as_role):
    """Мөрүүд огноогоор эрэмбэлэгдэж, олголт бүр өөрийн ПАДАНГИЙН тарифтай."""
    h = as_role("otgoo")
    d = client.get("/api/contracts/1", headers=h).json()
    g = next(x for x in d["material_lines"] if x["material"] == "Хэв хашмал 6012")
    dates = [ln["date"] for ln in g["lines"]]
    assert dates == sorted(dates)
    issues = [ln for ln in g["lines"] if ln["type"] == "ISSUE"]
    assert issues and all(ln["rate"] == 330 for ln in issues)
    assert issues[0]["qty"] == 2131 and issues[0]["delta"] == 2131
    rets = [ln for ln in g["lines"] if ln["type"] == "RETURN"]
    assert rets[0]["qty"] == 306 and rets[0]["delta"] == -306
    assert rets[0]["rate"] is None          # буцаалт тариф авч явахгүй
    # буцаалт нь ганц падангаас хассан — тэр нь эхний олголтын мөр
    assert [s["issue_line_id"] for s in rets[0]["sources"]] == [issues[0]["id"]]
    assert rets[0]["sources"][0]["qty"] == pytest.approx(306)
    assert rets[0]["sources"][0]["rate"] == 330


def test_return_attribution_walks_fifo_across_two_lots(client, as_role):
    """330₮-ийн 100ш, 300₮-ийн 50ш падантай гэрээнээс 120ш буцаахад:
    FIFO-гоор хуучин падангаас 100ш, шинэ падангаас 20ш хасагдана."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "ФИФО ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(40),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 100, "daily_rate": 330}]}).json()["id"]
    _confirm_pending(client, as_role, cid)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(20), "note": "Нэмэлт олголт",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 50, "rate": 300}]})
    _confirm_pending(client, as_role, cid)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5), "lines": [
            {"material_id": m["id"], "grade_id": st["grade_id"], "qty": 120,
             "return_grade_id": st["grade_id"]}]})

    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    g = next(x for x in d["material_lines"] if x["material_id"] == m["id"])
    issues = [ln for ln in g["lines"] if ln["type"] == "ISSUE"]
    ret = next(ln for ln in g["lines"] if ln["type"] == "RETURN")
    assert [ln["rate"] for ln in issues] == [330, 300]
    assert [(s["issue_line_id"], s["qty"], s["rate"], s["pinned"]) for s in ret["sources"]] == [
        (issues[0]["id"], 100, 330, False),
        (issues[1]["id"], 20, 300, False)]
    assert g["held"] == pytest.approx(30)
    assert sum(ln["delta"] for ln in g["lines"] if ln["counted"]) == pytest.approx(30)


def test_return_attribution_honours_pinned_padan_then_spills_fifo(client, as_role):
    """Заасан падан (50ш) хүрэхгүй бол үлдсэн нь FIFO-гоор хуучин падан руу.
    70ш-ийг ШИНЭ падангаас заавал хасахыг хүсэхэд: 50 нь тэндээс, 20 нь
    хуучин падангаас."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Заасан падан ХХК"}, headers=h).json()
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(40),
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 100, "daily_rate": 330}]}).json()["id"]
    _confirm_pending(client, as_role, cid)
    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(20), "note": "Нэмэлт олголт",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 50, "rate": 300}]})
    _confirm_pending(client, as_role, cid)
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    g = next(x for x in d["material_lines"] if x["material_id"] == m["id"])
    second = [ln for ln in g["lines"] if ln["type"] == "ISSUE"][1]

    client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5), "lines": [
            {"material_id": m["id"], "grade_id": st["grade_id"], "qty": 70,
             "issue_line_id": second["id"], "return_grade_id": st["grade_id"]}]})

    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    g = next(x for x in d["material_lines"] if x["material_id"] == m["id"])
    ret = next(ln for ln in g["lines"] if ln["type"] == "RETURN")
    by_lot = {s["issue_line_id"]: s for s in ret["sources"]}
    assert by_lot[second["id"]]["qty"] == pytest.approx(50)
    assert by_lot[second["id"]]["pinned"] is True
    first = [ln for ln in g["lines"] if ln["type"] == "ISSUE"][0]
    assert by_lot[first["id"]]["qty"] == pytest.approx(20)
    assert by_lot[first["id"]]["pinned"] is False
    assert g["held"] == pytest.approx(80)


def test_pending_issue_line_is_listed_but_not_counted(client, as_role):
    """Хүлээгдэж буй ачилт дэвтэрт ХАРАГДАНА (Отгоо хүлээж байгаагаа мэднэ),
    гэхдээ үлдэгдэлд ОРОХГҮЙ — тооцооны хөдөлгүүртэй яг адил."""
    h = as_role("otgoo")
    d = client.get("/api/contracts/4", headers=h).json()
    lines = [ln for g in d["material_lines"] for ln in g["lines"]]
    assert lines, "хүлээгдэж буй ачилтын мөрүүд харагдах ёстой"
    assert all(ln["status"] == "pending" and ln["counted"] is False for ln in lines)
    assert all(g["held"] == pytest.approx(0) for g in d["material_lines"])


def test_sale_contract_lines_have_unit_price_and_no_attribution(client, as_role):
    """Худалдаанд падан гэж байхгүй — олголтын мөр НЭГЖ ҮНЭЭ авч явна,
    буцаалтын хамаарал гарахгүй."""
    h = as_role("otgoo")
    d = client.get("/api/contracts/5", headers=h).json()
    assert d["type"] == "sale"
    g = next(x for x in d["material_lines"] if x["material"] == "Хэв хашмал 6012")
    assert [ln["type"] for ln in g["lines"]] == ["ISSUE"]
    assert g["lines"][0]["rate"] == 58000
    assert g["lines"][0]["sources"] is None

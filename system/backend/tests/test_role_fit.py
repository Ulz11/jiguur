"""РОЛЬ ↔ ЗАГВАР ЗӨРӨӨ — «дэлгэц нэг юм хэлж, сервер өөр юм хийдэг» газрууд.

Гурван хүн, гурван ажил (`docs/Гарын авлага.md` §3). Зөрөө нь хоёр тал руу
хоёулаа муу:

  · САНХҮҮЧИД баримт (PDF) ХААЛТТАЙ байв — тариф, үлдэгдэл тээж яваа
    хавсралтыг тэр л харилцагч руу илгээдэг атал сервер түүнийг оруулдаггүй;
  · ДАРГАД өөрийнхөө бүртгэсэн буцаалтыг ЗАСАХ зам байгаагүй — талбай дээр
    «40» гэж бичээд, 20 минутын дараа 38 байсныг олж мэдвэл Отгоо руу залгаж
    л засуулна. Тэр дуудлага нь өдөрт хэдэн удаа давтагдана.

Мөн ТАТГАЛЗЛЫН МӨР: «Энэ үйлдлийг хийх эрх байхгүй» гэдэг нь «тэгвэл хэн
хийх вэ?» гэсэн асуултыг үлдээдэг (`app/auth.py`-ийн `require_roles` энэ
асуултыг аль хэдийн хаасан — хоёр зам түүнийг тойрч үлджээ).
"""
from datetime import date, timedelta

from tests.test_api import iso, make_contract, _confirm_pending, _movements


def _grade(client, h, code: str) -> int:
    return next(g["id"] for g in client.get("/api/grades", headers=h).json()
                if g["code"] == code)


def _rent_with_return(client, as_role, *, days_ago=10, qty=100, ret_qty=40):
    """Гэрээ + баталгаажсан ачилт + ДАРГЫН бүртгэсэн буцаалт.

    Буцаалтыг ЗААВАЛ дарга бүртгэнэ: «өөрийнхөө бүртгэснийг засах» гэдгийн
    «өөрийнх» нь /audit-ийн мөрөөр тодорхойлогддог.
    """
    hd = as_role("darga")
    _, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    r = client.post(f"/api/contracts/{cid}/movements", headers=hd, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": ret_qty}]})
    assert r.status_code == 200, r.text
    ret = next(x for x in _movements(client, hd, cid) if x["type"] == "RETURN")
    return cid, m, st, ret


# ══════════════════════════════════════════════════════════════════════════
# 1. БАРИМТ (PDF) — САНХҮҮЧИЙНХ Ч МӨН (даргынх БИШ)
#
# Тариф, үлдэгдэл, алданги тээсэн хуудсыг дэлгэц дээр даргаас нуучихаад
# PDF-ээр нь татуулах нь зураасыг утгагүй болгоно. Санхүүч нь харин ЯГ
# эдгээр баримтыг харилцагч руу илгээдэг хүн.
# ══════════════════════════════════════════════════════════════════════════

def _pdf_paths(client, as_role, cid) -> list[str]:
    h = as_role("otgoo")
    assert client.post(f"/api/contracts/{cid}/generate-invoices",
                       headers=h).status_code == 200
    inv = client.get(f"/api/contracts/{cid}", headers=h).json()["invoices"][0]["id"]
    return [f"/api/contracts/{cid}/pdf",
            f"/api/contracts/{cid}/act-pdf",
            f"/api/contracts/{cid}/cycle-appendix-pdf",
            f"/api/invoices/{inv}/pdf",
            f"/api/invoices/{inv}/appendix-pdf"]


def test_factory_boss_gets_403_on_every_contract_pdf(client, as_role):
    _, cid, _m, _st = make_contract(client, as_role, days_ago=40, qty=60)
    _confirm_pending(client, as_role, cid)
    for path in _pdf_paths(client, as_role, cid):
        r = client.get(path, headers=as_role("darga"))
        assert r.status_code == 403, f"{path} → {r.status_code}"
        assert r.json()["detail"].startswith("Энэ үйлдлийг хийх эрх байхгүй — зөвхөн")


def test_finance_may_open_every_contract_pdf(client, as_role):
    _, cid, _m, _st = make_contract(client, as_role, days_ago=40, qty=60)
    _confirm_pending(client, as_role, cid)
    for path in _pdf_paths(client, as_role, cid):
        r = client.get(path, headers=as_role("sanhuu"))
        assert r.status_code == 200, f"{path} → {r.status_code} {r.text[:200]}"
        assert r.headers["content-type"] == "application/pdf"


# ══════════════════════════════════════════════════════════════════════════
# 2. ТАТГАЛЗЛЫН МӨР ХЭН ХИЙХИЙГ НЭРЛЭНЭ
# ══════════════════════════════════════════════════════════════════════════

def test_note_denial_names_the_roles(client, as_role):
    """Харилцагчийн зах дээр дарга бичихгүй — ГЭХДЭЭ хэн бичихийг хэлнэ."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Захын ХХК"}, headers=h).json()
    r = client.post("/api/notes", headers=as_role("darga"), json={
        "entity_type": "client", "entity_id": cl["id"],
        "date": iso(0), "text": "туршилт"})
    assert r.status_code == 403
    assert r.json()["detail"] == "Энэ үйлдлийг хийх эрх байхгүй — зөвхөн менежер, санхүү"


def test_promise_status_denial_names_the_roles(client, as_role):
    """Амлалт хаах нь авлагын ажил — мөр нь эзнээ нэрлэнэ."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Амлалт ХХК"}, headers=h).json()
    r0 = client.post(f"/api/clients/{cl['id']}/notes", headers=h, json={
        "date": iso(0), "kind": "call", "note": "маргааш төлнө",
        "promise_date": str(date.today() + timedelta(days=1))})
    assert r0.status_code == 200, r0.text
    n = r0.json()
    r = client.patch(f"/api/notes/{n['id']}", headers=as_role("darga"),
                     json={"status": "kept"})
    assert r.status_code == 403
    assert r.json()["detail"] == "Энэ үйлдлийг хийх эрх байхгүй — зөвхөн менежер, санхүү"


# ══════════════════════════════════════════════════════════════════════════
# 3. ДАРГА ӨӨРИЙНХӨӨ БҮРТГЭСНИЙГ ЗАСНА (буцаалтын мөр)
# ══════════════════════════════════════════════════════════════════════════

def test_factory_boss_fixes_return_quantity(client, as_role):
    cid, _m, _st, ret = _rent_with_return(client, as_role)
    lid = ret["lines"][0]["id"]
    r = client.patch(f"/api/movement-lines/{lid}", headers=as_role("darga"),
                     json={"qty": 38})
    assert r.status_code == 200, r.text
    det = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    got = next(x for x in det["movements"] if x["type"] == "RETURN")
    assert got["lines"][0]["qty"] == 38


def test_factory_boss_fixes_repair_and_writeoff_counts(client, as_role):
    cid, _m, _st, ret = _rent_with_return(client, as_role)
    lid = ret["lines"][0]["id"]
    r = client.patch(f"/api/movement-lines/{lid}", headers=as_role("darga"),
                     json={"repair_qty": 6, "writeoff_qty": 2})
    assert r.status_code == 200, r.text
    det = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    ln = next(x for x in det["movements"] if x["type"] == "RETURN")["lines"][0]
    assert ln["repair_qty"] == 6 and ln["writeoff_qty"] == 2


def test_factory_boss_fixes_return_grade(client, as_role):
    cid, _m, _st, ret = _rent_with_return(client, as_role)
    gB = _grade(client, as_role("darga"), "В")
    r = client.patch(f"/api/movement-lines/{ret['lines'][0]['id']}",
                     headers=as_role("darga"), json={"return_grade_id": gB})
    assert r.status_code == 200, r.text
    det = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    assert next(x for x in det["movements"]
                if x["type"] == "RETURN")["lines"][0]["return_grade_id"] == gB


def test_factory_boss_pins_the_issue_line(client, as_role):
    cid, _m, _st, ret = _rent_with_return(client, as_role)
    issue = next(x for x in _movements(client, as_role("darga"), cid)
                 if x["type"] == "ISSUE")
    pin = issue["lines"][0]["id"]
    r = client.patch(f"/api/movement-lines/{ret['lines'][0]['id']}",
                     headers=as_role("darga"), json={"issue_line_id": pin})
    assert r.status_code == 200, r.text
    det = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    assert next(x for x in det["movements"]
                if x["type"] == "RETURN")["lines"][0]["issue_line_id"] == pin


def test_factory_boss_writes_the_agreed_days(client, as_role):
    """ГАР ХОНОГ нь мөнгө биш, ХЭЛЦЛИЙН тоо — талбай дээр тохирдог нь тэр."""
    cid, _m, _st, ret = _rent_with_return(client, as_role)
    r = client.patch(f"/api/movement-lines/{ret['lines'][0]['id']}",
                     headers=as_role("darga"),
                     json={"billed_days_override": 7, "days_confirm": True})
    assert r.status_code == 200, r.text
    det = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    ln = next(x for x in det["movements"] if x["type"] == "RETURN")["lines"][0]
    assert ln.get("billed_days_override", 7) == 7


def test_factory_boss_may_not_touch_the_rate(client, as_role):
    """ТАРИФ бол МӨНГӨ — тэр зураас хэвээр."""
    cid, _m, _st, _ret = _rent_with_return(client, as_role)
    issue = next(x for x in _movements(client, as_role("darga"), cid)
                 if x["type"] == "ISSUE")
    before = issue["lines"][0]["rate"]
    r = client.patch(f"/api/movement-lines/{issue['lines'][0]['id']}",
                     headers=as_role("darga"), json={"rate": 1})
    assert r.status_code == 403
    assert r.json()["detail"].startswith("Энэ үйлдлийг хийх эрх байхгүй — зөвхөн")
    det = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    assert next(x for x in det["movements"]
                if x["type"] == "ISSUE")["lines"][0]["rate"] == before


def test_factory_boss_may_not_edit_an_issue_line(client, as_role):
    """ОЛГОЛТ нь падан төрүүлдэг — түүний тоог засах нь тарифын ертөнц."""
    cid, _m, _st, _ret = _rent_with_return(client, as_role)
    issue = next(x for x in _movements(client, as_role("darga"), cid)
                 if x["type"] == "ISSUE")
    r = client.patch(f"/api/movement-lines/{issue['lines'][0]['id']}",
                     headers=as_role("darga"), json={"qty": 90})
    assert r.status_code == 403


def test_manager_still_edits_everything(client, as_role):
    """Менежерийн эрх ХЭВЭЭР — шинэ хаалга хуучныг хумиагүй."""
    cid, _m, _st, _ret = _rent_with_return(client, as_role)
    h = as_role("otgoo")
    issue = next(x for x in _movements(client, h, cid) if x["type"] == "ISSUE")
    assert client.patch(f"/api/movement-lines/{issue['lines'][0]['id']}",
                        headers=h, json={"rate": 400}).status_code == 200


# ---- Хөдөлгөөний ОГНОО: өнөөдөр ӨӨРӨӨ бүртгэсэн бол ----

def test_factory_boss_fixes_the_date_of_what_he_registered_today(client, as_role):
    cid, _m, _st, ret = _rent_with_return(client, as_role)
    new_day = str(date.today() - timedelta(days=1))
    r = client.patch(f"/api/movements/{ret['id']}", headers=as_role("darga"),
                     json={"date": new_day})
    assert r.status_code == 200, r.text
    det = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    assert next(x for x in det["movements"] if x["id"] == ret["id"])["date"] == new_day


def test_factory_boss_may_not_move_someone_elses_movement(client, as_role):
    """Отгоогийн бүртгэсэн хөдөлгөөн нь ТҮҮНИЙХ — дарга огноог нь хөндөхгүй."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=10, qty=100)
    _confirm_pending(client, as_role, cid)
    assert client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 20}]}).status_code == 200
    ret = next(x for x in _movements(client, h, cid) if x["type"] == "RETURN")
    r = client.patch(f"/api/movements/{ret['id']}", headers=as_role("darga"),
                     json={"date": iso(1)})
    assert r.status_code == 403
    assert "менежер" in r.json()["detail"]


def test_movement_carries_the_own_today_flag(client, as_role):
    """Дэлгэц товчоо ЗУРАХААС ӨМНӨ мэдэх ёстой — сервер хэлнэ."""
    cid, _m, _st, ret = _rent_with_return(client, as_role)
    mine = client.get(f"/api/contracts/{cid}", headers=as_role("darga")).json()
    assert next(x for x in mine["movements"] if x["id"] == ret["id"])["mine_today"] is True
    hers = client.get(f"/api/contracts/{cid}", headers=as_role("otgoo")).json()
    assert next(x for x in hers["movements"] if x["id"] == ret["id"])["mine_today"] is False


# ══════════════════════════════════════════════════════════════════════════
# 4. «МИНИЙ БҮРТГЭЛ» — дарга ӨӨРИЙН мөрөө уншина
# ══════════════════════════════════════════════════════════════════════════

def test_audit_mine_is_open_to_every_role(client, as_role):
    for who in ("otgoo", "darga", "sanhuu"):
        r = client.get("/api/audit/mine", headers=as_role(who))
        assert r.status_code == 200, f"{who} → {r.status_code}"
        assert set(r.json()) == {"rows", "total"}


def test_audit_mine_shows_only_my_rows(client, as_role):
    _cid, _m, _st, _ret = _rent_with_return(client, as_role)
    d = client.get("/api/audit/mine", headers=as_role("darga")).json()
    assert d["rows"], "даргын бүртгэл хоосон байна"
    assert {r["user_name"] for r in d["rows"]} == {"Үйлдвэрийн дарга"}
    assert any(r["entity"] == "movement" and r["action"] == "create"
               for r in d["rows"])
    hers = client.get("/api/audit/mine", headers=as_role("otgoo")).json()
    assert {r["user_name"] for r in hers["rows"]} == {"Ч.Отгонцэцэг"}


def test_audit_mine_keeps_the_same_filters_and_paging(client, as_role):
    _cid, _m, _st, _ret = _rent_with_return(client, as_role)
    h = as_role("darga")
    only = client.get("/api/audit/mine?entity=movement&action=create",
                      headers=h).json()
    assert only["rows"] and all(r["entity"] == "movement" for r in only["rows"])
    page = client.get("/api/audit/mine?limit=1", headers=h).json()
    assert len(page["rows"]) == 1 and page["total"] >= 1


def test_audit_mine_cannot_be_steered_to_another_person(client, as_role):
    """`?user=` нь ЭНД утгагүй — хаалга нь дуудагчийнхаа мөрийг л мэднэ."""
    _cid, _m, _st, _ret = _rent_with_return(client, as_role)
    d = client.get("/api/audit/mine?user=Отгон", headers=as_role("darga")).json()
    assert all(r["user_name"] == "Үйлдвэрийн дарга" for r in d["rows"])


def test_full_audit_stays_manager_only(client, as_role):
    """`/api/audit` нь хэвээр — «миний» хаалга нь хуучныг сулруулаагүй."""
    assert client.get("/api/audit", headers=as_role("darga")).status_code == 403
    assert client.get("/api/audit", headers=as_role("sanhuu")).status_code == 403
    assert client.get("/api/audit", headers=as_role("otgoo")).status_code == 200


# ══════════════════════════════════════════════════════════════════════════
# 5. МЕХАНИЗМ — өнөөдөр өөрөө бичсэн мөрөө засна, устгана
# ══════════════════════════════════════════════════════════════════════════

def _machine(client, as_role):
    return client.post("/api/machines", headers=as_role("otgoo"),
                       json={"name": "Ролийн кран"}).json()


def _log(client, as_role, mid, who="darga", **over):
    body = {"date": iso(0), "entry": "job", "label": "Бүтэн өдөр",
            "client": "Түмэн Хийц", "amount": 900_000, "method": "CASH", **over}
    r = client.post(f"/api/machines/{mid}/logs", headers=as_role(who), json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_factory_boss_fixes_his_own_log_row(client, as_role):
    m = _machine(client, as_role)
    l = _log(client, as_role, m["id"])
    r = client.patch(f"/api/machine-logs/{l['id']}", headers=as_role("darga"),
                     json={"client": "Бат Бүтээц"})
    assert r.status_code == 200, r.text
    rows = client.get(f"/api/machines/{m['id']}/logs",
                      headers=as_role("otgoo")).json()["logs"]
    assert next(x for x in rows if x["id"] == l["id"])["client"] == "Бат Бүтээц"


def test_factory_boss_deletes_his_own_log_row(client, as_role):
    m = _machine(client, as_role)
    l = _log(client, as_role, m["id"])
    assert client.delete(f"/api/machine-logs/{l['id']}",
                         headers=as_role("darga")).status_code == 200
    rows = client.get(f"/api/machines/{m['id']}/logs",
                      headers=as_role("otgoo")).json()["logs"]
    assert all(x["id"] != l["id"] for x in rows)


def test_factory_boss_may_not_touch_someone_elses_log_row(client, as_role):
    m = _machine(client, as_role)
    l = _log(client, as_role, m["id"], who="otgoo")
    r = client.patch(f"/api/machine-logs/{l['id']}", headers=as_role("darga"),
                     json={"amount": 1})
    assert r.status_code == 403
    assert r.json()["detail"].startswith("Энэ үйлдлийг хийх эрх байхгүй — зөвхөн")
    assert client.delete(f"/api/machine-logs/{l['id']}",
                         headers=as_role("darga")).status_code == 403


def test_machine_log_row_says_whether_it_is_mine_today(client, as_role):
    m = _machine(client, as_role)
    mine = _log(client, as_role, m["id"])
    hers = _log(client, as_role, m["id"], who="otgoo", amount=100_000)
    rows = client.get(f"/api/machines/{m['id']}/logs",
                      headers=as_role("darga")).json()["logs"]
    by_id = {x["id"]: x for x in rows}
    assert by_id[mine["id"]]["mine_today"] is True
    assert by_id[hers["id"]]["mine_today"] is False


def test_finance_and_manager_keep_full_machine_log_rights(client, as_role):
    m = _machine(client, as_role)
    l = _log(client, as_role, m["id"], who="otgoo")
    assert client.patch(f"/api/machine-logs/{l['id']}", headers=as_role("sanhuu"),
                        json={"amount": 950_000}).status_code == 200
    assert client.delete(f"/api/machine-logs/{l['id']}",
                         headers=as_role("otgoo")).status_code == 200

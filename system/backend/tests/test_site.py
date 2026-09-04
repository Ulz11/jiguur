"""НЭГ ГЭРЭЭ, ОЛОН ТАЛБАЙ — буцаалт талбайгаараа тоологдоно (№88, 97).

Блүүмийн НЭГ хуудас ГУРВАН талбайг барина: 2026 шинэ!C16/C17/C18 нь
`БЛҮҮМ технологи` 2,044 · `БЛҮҮМ архангай` 326 · `Блүүм дарь эх` 1,924 —
нийлбэр нь 4,294ш, гэвч АВЛАГА нь НЭГ. Батцоожийн хуудсан дээр `F5` багана
нь `'А Е блок үлдэгдэл'` гэж дэд-объектын үлдэгдлээ өөрөө барьдаг.

Систем нь хөдөлгөөнд «хаанаас гарсан / хаана буцсан» гэсэн нүдгүй байв
(№88 NONE, №97 LOSSY): буцаалт ирэхэд аль талбайнх болох нь алга болж,
«технологиос 300ш буцлаа» гэдэг нь дэвтэрт бичигдэхгүй.

`Movement.site` нь НЭМЭЛТ багана: хоосон бол өнөөдрийнхтэй ЯГ адил ажиллана.
"""
from tests.test_features import iso, mk_contract


def _detail(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()


def _movements(client, h, cid):
    return _detail(client, h, cid)["movements"]


def _issue(client, h, cid, m, st, qty, days_ago, site=""):
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "ISSUE", "date": iso(days_ago), "site": site,
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": qty}]})
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    client.post(f"/api/movements/{mid}/confirm", headers=h)
    return mid


# ---------- 1. Хөдөлгөөн ТАЛБАЙГАА бүртгэх агшнаасаа авч явна ----------

def test_a_movement_carries_its_site(client, as_role):
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=100, days_ago=40)
    _issue(client, h, c["id"], m, st, 20, 20, site="Дарь эх")
    mv = next(x for x in _movements(client, h, c["id"])
              if x["type"] == "ISSUE" and x["date"] == iso(20))
    assert mv["site"] == "Дарь эх"


def test_a_movement_without_a_site_is_an_empty_string(client, as_role):
    """Хоосон нь NULL БИШ: хуучин мөрүүд ч талбайгүй гэдгээ хэлнэ."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=100, days_ago=40)
    assert all(mv["site"] == "" for mv in _movements(client, h, c["id"]))


def test_the_ledger_line_carries_the_site_too(client, as_role):
    """Падангийн дэвтрийн мөр ч талбайгаа авч явна — задаргаа тэндээс гарна."""
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=100, days_ago=40)
    _issue(client, h, c["id"], m, st, 20, 20, site="Архангай")
    sec = next(s for s in _detail(client, h, c["id"])["material_lines"]
               if s["material_id"] == m["id"])
    assert {ln["site"] for ln in sec["lines"]} == {"", "Архангай"}


# ---------- 2. Талбай ЗАСАГДАНА — талбай дээр байгаа хүн ч ----------

def test_the_site_is_editable_by_the_manager_and_the_factory_boss(client, as_role):
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=100, days_ago=40)
    mid = _issue(client, h, c["id"], m, st, 20, 20)
    r = client.patch(f"/api/movements/{mid}", headers=h, json={"site": "Технологи"})
    assert r.status_code == 200, r.text
    assert r.json()["site"] == "Технологи"
    # Талбай дээр байгаа хүн нь ҮЙЛДВЭРИЙН ДАРГА — түүнд ч зам нээлттэй
    rd = client.patch(f"/api/movements/{mid}", headers=as_role("darga"),
                      json={"site": "Дарь эх"})
    assert rd.status_code == 200, rd.text
    assert rd.json()["site"] == "Дарь эх"
    # Санхүүч нь хөдөлгөөний зам дээр байхгүй (хуучин дүрэм хэвээр)
    assert client.patch(f"/api/movements/{mid}", headers=as_role("sanhuu"),
                        json={"site": "Х"}).status_code == 403


def test_changing_a_site_never_asks_for_a_rebuild(client, as_role):
    """Талбай нь МӨНГӨ ХӨДӨЛГӨДӨГГҮЙ — дахин бодолтын хаалга нээгдэхгүй.

    Огноо солих нь нэхэмжлэгдсэн циклд хүрвэл баталгаажуулалт хүсдэг. Талбай
    бол зөвхөн «хаанаас» гэсэн шошго тул тэр асуулт төрөх ёсгүй: мөрөн дээр
    дарж засах агшинд гэнэт «дахин бодох уу?» гарвал Отгоо болих л болно.
    """
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=100, days_ago=70)
    mid = _issue(client, h, c["id"], m, st, 20, 60)
    totals_before = sorted((i["no"], i["total"]) for i in _detail(client, h, c["id"])["invoices"])
    r = client.patch(f"/api/movements/{mid}", headers=h, json={"site": "Технологи"})
    assert r.status_code == 200, r.text
    assert "rebuild_required" not in r.json()
    assert sorted((i["no"], i["total"]) for i in _detail(client, h, c["id"])["invoices"]) \
        == totals_before


def test_the_site_change_is_audited_in_mongolian(client, as_role):
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=100, days_ago=40)
    mid = _issue(client, h, c["id"], m, st, 20, 20, site="Архангай")
    client.patch(f"/api/movements/{mid}", headers=h, json={"site": "Дарь эх"})
    rows = client.get("/api/audit?entity=movement", headers=h).json()
    line = next(r["detail"] for r in rows if r["action"] == "update")
    assert "талбай: Архангай → Дарь эх" in line


def test_the_site_is_written_into_the_creation_audit_line(client, as_role):
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=100, days_ago=40)
    _issue(client, h, c["id"], m, st, 20, 20, site="Дарь эх")
    rows = client.get("/api/audit?entity=movement", headers=h).json()
    assert any(r["action"] == "create" and "Дарь эх" in r["detail"] for r in rows)


# ---------- 3. БЛҮҮМ: нэг гэрээ, гурван талбай ----------

def test_bluum_one_contract_three_sites(client, as_role):
    """2,044 технологи + 326 архангай + 1,924 дарь эх = 4,294ш, НЭГ авлага."""
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=1, days_ago=40)
    # Блүүмийн парк 4,294ш — seed агуулах түүнээс бага тул эхлээд тоолж тавина
    assert client.post("/api/stock/adjust", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"],
        "on_hand": 5000}).status_code == 200
    for qty, site in ((2044, "Технологи"), (326, "Архангай"), (1924, "Дарь эх")):
        _issue(client, h, c["id"], m, st, qty, 30, site=site)
    sec = next(s for s in _detail(client, h, c["id"])["material_lines"]
               if s["material_id"] == m["id"])
    per_site: dict[str, float] = {}
    for ln in sec["lines"]:
        if ln["counted"]:
            per_site[ln["site"]] = per_site.get(ln["site"], 0) + ln["delta"]
    assert per_site["Технологи"] == 2044
    assert per_site["Архангай"] == 326
    assert per_site["Дарь эх"] == 1924
    # Гурван талбайн нийлбэр нь ҮЛДЭГДЭЛТЭЙ тэнцэнэ (гэрээний эхний 1ш нэмэх нь)
    assert sum(per_site.values()) == sec["held"] == 4295


def test_a_return_can_name_the_site_it_came_back_from(client, as_role):
    h = as_role("otgoo")
    _cl, c, m, st = mk_contract(client, as_role, qty=100, days_ago=40)
    r = client.post(f"/api/contracts/{c['id']}/movements", headers=h, json={
        "type": "RETURN", "date": iso(10), "site": "Дарь эх",
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 40}]})
    assert r.status_code == 200, r.text
    mv = next(x for x in _movements(client, h, c["id"]) if x["type"] == "RETURN")
    assert mv["site"] == "Дарь эх"

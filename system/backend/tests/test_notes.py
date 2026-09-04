"""ЗАХЫН ТЭМДЭГЛЭЛ БА ШАР ТУГ — Отгоогийн шийдвэрүүдийн давхарга (P1-22).

Түүний хуудсууд дээр шийдвэр нь тоон дотор БИШ, ТООНЫ ХАЖУУД амьдардаг:

  · `ГрэйтМайнинг-5!H30` = `'7.06нд тооцов'` — тэр өдөр тооцоо хийгдсэн;
  · `F27` = `'нөат шивсэн'` — энэ дүн татварт шивэгдсэн, засах эрх ХААГДСАН;
  · `WB2!R22` = `'модонд'` — төлбөрийн ХЭЛБЭР;
  · гадна: `'хаав'`, `'ирээгүй'`, `'дутуу'`, `'барьцаанаас суутгаж тооцов.'`;
  · ШАР дүүргэлт (`FFFFFF00`) = «АНХААР» — өнгө нь өөрөө өгүүлбэр (№111).

Систем дээр эдгээрийн байр нь `Contract.note` / `Client.note` гэсэн ГАНЦ Text
байв: гурван тэмдэглэл нэг талбарт нурж, огноогүй, зохиогчгүй, шүүгдэхгүй
болно — тугны байр огт алга (№112 LOSSY).

`Note` нь тэдгээрийг МӨР МӨРӨӨР нь барина: огноо · текст · зохиогч · ⚑.
Хуучин `note` талбарууд ХЭВЭЭР — давхарга нь НЭМЭЛТ.
"""
from tests.test_features import iso, mk_contract


def _notes(client, h, etype, eid):
    r = client.get(f"/api/notes?entity_type={etype}&entity_id={eid}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _add(client, h, etype, eid, text, flag=False, days_ago=0):
    return client.post("/api/notes", headers=h, json={
        "entity_type": etype, "entity_id": eid, "date": iso(days_ago),
        "text": text, "flag": flag})


def _flagged(client, h):
    return client.get("/api/dashboard", headers=h).json()["flagged"]


# ---------- 1. Гурван тэмдэглэл НЭГ талбарт нурахаа болив ----------

def test_three_margin_notes_stay_three_rows(client, as_role):
    """«7.06нд тооцов» · «нөат шивсэн» · «хаав» — гурав нь ГУРАВ хэвээр."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    cid = c["id"]
    for i, t in enumerate(("7.06нд тооцов", "нөат шивсэн", "хаав")):
        assert _add(client, h, "contract", cid, t, days_ago=30 - i * 10).status_code == 200
    rows = _notes(client, h, "contract", cid)
    # Хамгийн шинэ нь ДЭЭРЭЭ — тэр сүүлийн шийдвэрээ эхэлж хардаг
    assert [r["text"] for r in rows] == ["хаав", "нөат шивсэн", "7.06нд тооцов"]
    assert rows[0]["author"] == "Ч.Отгонцэцэг"
    assert rows[0]["date"] == iso(10)


def test_the_legacy_single_note_field_still_works(client, as_role):
    """Давхарга нь НЭМЭЛТ: хуучин `Contract.note` хэвээр бичигдэж, уншигдана."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    cid = c["id"]
    assert client.patch(f"/api/contracts/{cid}", headers=h,
                        json={"note": "хуучин мөр"}).status_code == 200
    _add(client, h, "contract", cid, "шинэ давхарга")
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    assert d["note"] == "хуучин мөр"
    assert [n["text"] for n in _notes(client, h, "contract", cid)] == ["шинэ давхарга"]


def test_an_empty_note_is_refused(client, as_role):
    """Текстгүй тэмдэглэл нь маргааш тайлагдахгүй мөр — 400."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    assert _add(client, h, "contract", c["id"], "   ").status_code == 400


def test_an_unknown_entity_type_is_refused_and_a_missing_row_is_404(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    assert _add(client, h, "payment", c["id"], "тэмдэглэл").status_code == 400
    assert _add(client, h, "contract", 999_999, "тэмдэглэл").status_code == 404
    assert client.get("/api/notes?entity_type=hedgehog&entity_id=1",
                      headers=h).status_code == 400


# ---------- 2. ШАР НҮД нь байртай болов ----------

def test_the_yellow_flag_has_a_home_and_toggles_in_place(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    cid = c["id"]
    n = _add(client, h, "contract", cid, "ирээгүй", flag=True).json()
    assert n["flag"] is True
    r = client.patch(f"/api/notes/{n['id']}", headers=h, json={"flag": False})
    assert r.status_code == 200, r.text
    assert r.json()["flag"] is False
    assert _notes(client, h, "contract", cid)[0]["flag"] is False


def test_patch_edits_text_and_date_too(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    n = _add(client, h, "contract", c["id"], "тооцов").json()
    r = client.patch(f"/api/notes/{n['id']}", headers=h,
                     json={"text": "7.06нд тооцов", "date": iso(5)})
    assert r.status_code == 200, r.text
    assert r.json()["text"] == "7.06нд тооцов"
    assert r.json()["date"] == iso(5)


def test_the_old_collection_note_patch_is_untouched(client, as_role):
    """Хуучин `PATCH /notes/{id}` (амлалтын ТӨЛӨВ) ЯГ хэвээр ажиллана."""
    h = as_role("otgoo")
    cl = client.post("/api/clients", json={"name": "Тэмдэглэл ХХК"}, headers=h).json()
    n = client.post(f"/api/clients/{cl['id']}/notes", headers=h, json={
        "date": iso(0), "kind": "call", "note": "залгав",
        "promise_date": iso(-3), "promise_amount": 500_000}).json()
    r = client.patch(f"/api/notes/{n['id']}", headers=h, json={"status": "kept"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "kept"
    assert client.patch(f"/api/notes/{n['id']}", headers=as_role("darga"),
                        json={"status": "broken"}).status_code == 403


# ---------- 3. ЦУЦЛАЛТ БОЛ УСТГАЛ БИШ (H1) ----------

def test_a_voided_note_stays_on_the_row_with_its_reason(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    cid = c["id"]
    n = _add(client, h, "contract", cid, "буруу бичив", flag=True).json()
    r = client.post(f"/api/notes/{n['id']}/void", headers=h,
                    json={"reason": "өөр гэрээнийх байсан"})
    assert r.status_code == 200, r.text
    rows = _notes(client, h, "contract", cid)
    assert len(rows) == 1
    assert rows[0]["voided"] is True
    assert rows[0]["void_reason"] == "өөр гэрээнийх байсан"
    assert rows[0]["voided_by"] == "Ч.Отгонцэцэг"


def test_void_needs_a_reason_and_happens_once(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    n = _add(client, h, "contract", c["id"], "мөр").json()
    assert client.post(f"/api/notes/{n['id']}/void", headers=h,
                       json={"reason": "  "}).status_code == 400
    assert client.post(f"/api/notes/{n['id']}/void", headers=h,
                       json={"reason": "давхардав"}).status_code == 200
    assert client.post(f"/api/notes/{n['id']}/void", headers=h,
                       json={"reason": "дахин"}).status_code == 409


# ---------- 4. ДАРГА нь ТАЛБАЙ ДЭЭР «ирээгүй» гэдгийг АНЗААРДАГ ----------

def test_the_factory_boss_may_flag_a_contract_and_a_movement(client, as_role):
    """«ирээгүй» гэдгийг талбай дээр хардаг хүн нь ТЭР — түүнд бичих зам байна."""
    hd = as_role("darga")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    cid = c["id"]
    r = _add(client, hd, "contract", cid, "ирээгүй", flag=True)
    assert r.status_code == 200, r.text
    assert r.json()["author"] == "Үйлдвэрийн дарга"
    mid = client.get(f"/api/contracts/{cid}",
                     headers=as_role("otgoo")).json()["movements"][0]["id"]
    assert _add(client, hd, "movement", mid, "хагас ирсэн", flag=True).status_code == 200
    nid = r.json()["id"]
    assert client.patch(f"/api/notes/{nid}", headers=hd,
                        json={"flag": False}).status_code == 200


def test_the_factory_boss_is_kept_off_money_entities(client, as_role):
    """Харилцагч · нэхэмжлэл · материал нь түүний дэвтэр БИШ — 403."""
    hd = as_role("darga")
    h = as_role("otgoo")
    cl, c, m, _st = mk_contract(client, as_role, qty=20, days_ago=40)
    assert _add(client, hd, "client", cl["id"], "тэмдэглэл").status_code == 403
    assert _add(client, hd, "material", m["id"], "тэмдэглэл").status_code == 403
    inv = client.get(f"/api/contracts/{c['id']}", headers=h).json()["invoices"]
    if inv:
        assert _add(client, hd, "invoice", inv[0]["id"], "нөат шивсэн").status_code == 403
    n = _add(client, h, "client", cl["id"], "хаав").json()
    assert client.patch(f"/api/notes/{n['id']}", headers=hd,
                        json={"flag": True}).status_code == 403
    assert client.post(f"/api/notes/{n['id']}/void", headers=hd,
                       json={"reason": "болих"}).status_code == 403


def test_finance_may_write_everywhere(client, as_role):
    hf = as_role("sanhuu")
    cl, _c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    assert _add(client, hf, "client", cl["id"], "нөат шивсэн").status_code == 200


# ---------- 5. ШАР НҮДҮҮД НЭГ ДЭЛГЭЦЭН ДЭЭР ----------

def test_the_dashboard_gathers_every_flagged_row(client, as_role):
    """«Анхаарах» самбар = түүний шар нүднүүд НЭГ дор."""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    _add(client, h, "contract", c["id"], "7.06нд тооцов", flag=True, days_ago=2)
    _add(client, h, "client", cl["id"], "модонд төлнө", flag=True, days_ago=1)
    _add(client, h, "contract", c["id"], "энгийн мөр", flag=False)

    rows = _flagged(client, h)
    texts = [r["text"] for r in rows]
    assert "7.06нд тооцов" in texts and "модонд төлнө" in texts
    assert "энгийн мөр" not in texts
    # Шинэ нь дээрээ
    assert texts.index("модонд төлнө") < texts.index("7.06нд тооцов")
    con = next(r for r in rows if r["text"] == "7.06нд тооцов")
    assert con["entity_type"] == "contract" and con["entity_id"] == c["id"]
    assert c["no"] in con["entity_name"]
    cli = next(r for r in rows if r["text"] == "модонд төлнө")
    assert cli["entity_name"] == cl["name"]


def test_a_flagged_movement_carries_its_contract_so_the_link_lands(client, as_role):
    """Хөдөлгөөнд хуудас байхгүй — тэмдэглэл нь ГЭРЭЭГЭЭ авч явна."""
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    mid = client.get(f"/api/contracts/{c['id']}", headers=h).json()["movements"][0]["id"]
    _add(client, h, "movement", mid, "ирээгүй", flag=True)
    row = next(r for r in _flagged(client, h) if r["entity_type"] == "movement")
    assert row["contract_id"] == c["id"]
    assert row["entity_id"] == mid


def test_unflagging_and_voiding_clear_the_panel(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    a = _add(client, h, "contract", c["id"], "туг нэг", flag=True).json()
    b = _add(client, h, "contract", c["id"], "туг хоёр", flag=True).json()
    assert len([r for r in _flagged(client, h) if r["text"].startswith("туг")]) == 2
    client.patch(f"/api/notes/{a['id']}", headers=h, json={"flag": False})
    client.post(f"/api/notes/{b['id']}/void", headers=h, json={"reason": "болив"})
    assert [r for r in _flagged(client, h) if r["text"].startswith("туг")] == []


# ---------- 6. АУДИТ ----------

def test_every_note_action_signs_its_name(client, as_role):
    h = as_role("otgoo")
    _cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    n = _add(client, h, "contract", c["id"], "7.06нд тооцов", flag=True).json()
    client.patch(f"/api/notes/{n['id']}", headers=h, json={"flag": False})
    client.post(f"/api/notes/{n['id']}/void", headers=h, json={"reason": "болив"})
    rows = client.get("/api/audit?entity=note", headers=h).json()
    assert {r["action"] for r in rows} == {"create", "update", "void"}
    assert any("7.06нд тооцов" in r["detail"] for r in rows)
    assert all(r["user_name"] == "Ч.Отгонцэцэг" for r in rows)

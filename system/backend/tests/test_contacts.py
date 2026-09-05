"""ХАРИЛЦАГЧ БҮР 2-4 ХҮНТЭЙ — НЭГ талбар тэднийг барихгүй (№72, 73).

Отгоо эгчийн хуудас бүр гарын үсгийн блокоор дуусдаг, тэнд НЭГ биш ОЛОН хүн
өөрийн албан тушаал, утастайгаа зогсоно:

    Бутангууд-7!E79 = 'Төслийн менежер: Н.Батцоож ……'  H79 = 96590908
                 D80 = 'Нярав :'  E80 = 'Н.Соль'       H80 = 99966285
                 D81 = 'Захирал:' E81 = 'С.Лхагвасүрэн' H81 = 99113579

Грэйт нь 4 хүн, Марч 2 хүн + 2 утас, Ашид 1 хүн 2 утастай. Систем нь
`Client.person` (1) + `Client.phone` (1) гэсэн НЭГ хосыг л барьдаг тул
үлдсэн нь БҮГД унана (№72 LOSSY), албан тушаалын нэршил (нярав / Төслийн
менежер / Захирал / Талбайн менежер) ОГТ хадгалагдахгүй (№73 NONE).

⚠ Тэр ЗАХИРАЛ руу залгадаггүй: тооцоо нийлдэг хүн нь НЯРАВ. Тиймээс
«Авлага цуглуулах» жагсаалтын ☎ холбоос нь тэр хүнийг мэддэг байх ёстой.
"""
from tests.test_features import iso, mk_contract


def _contacts(client, h, cid):
    r = client.get(f"/api/clients/{cid}/contacts", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _add(client, h, cid, name, role="", phone="", phone2="", note=""):
    return client.post(f"/api/clients/{cid}/contacts", headers=h, json={
        "name": name, "role": role, "phone": phone, "phone2": phone2, "note": note})


def _butangууd(client, h, cid):
    """Бутангуудын ГУРВАН гарын үсэгтэн — хуудсан дээрх дарааллаараа."""
    _add(client, h, cid, "Н.Батцоож", "Төслийн менежер", "96590908")
    _add(client, h, cid, "Н.Соль", "Нярав", "99966285")
    _add(client, h, cid, "С.Лхагвасүрэн", "Захирал", "99113579")


# ---------- 1. ГУРВАН хүн ГУРАВ хэвээр ----------

def test_three_signatories_stay_three_rows(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    _butangууd(client, h, cl["id"])
    rows = _contacts(client, h, cl["id"])
    assert [(r["name"], r["role"], r["phone"]) for r in rows] == [
        ("Н.Батцоож", "Төслийн менежер", "96590908"),
        ("Н.Соль", "Нярав", "99966285"),
        ("С.Лхагвасүрэн", "Захирал", "99113579")]
    assert all(r["active"] is True for r in rows)


def test_one_person_two_phones(client, as_role):
    """Ашид Донж: НЭГ хүн, ХОЁР утас — «88111935  99991491»."""
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    _add(client, h, cl["id"], "Б.Дарханбаяр", "Захирал", "88111935", "99991491")
    row = _contacts(client, h, cl["id"])[0]
    assert row["phone"] == "88111935" and row["phone2"] == "99991491"


def test_a_nameless_contact_is_refused(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    assert _add(client, h, cl["id"], "  ", role="Нярав").status_code == 400


def test_a_missing_client_is_404(client, as_role):
    h = as_role("otgoo")
    assert _add(client, h, 999_999, "Н.Соль").status_code == 404
    assert client.get("/api/clients/999999/contacts", headers=h).status_code == 404


# ---------- 2. Хуучин НЭГ хос ХЭВЭЭР ----------

def test_the_primary_person_and_phone_are_untouched(client, as_role):
    """`Client.person` / `phone` нь ҮНДСЭН холбоо — жагсаалт нь НЭМЭЛТ."""
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    client.put(f"/api/clients/{cl['id']}", headers=h, json={
        "name": cl["name"], "person": "С.Лхагвасүрэн", "phone": "99113579"})
    _butangууd(client, h, cl["id"])
    prof = client.get(f"/api/clients/{cl['id']}", headers=h).json()
    assert prof["person"] == "С.Лхагвасүрэн"
    assert prof["phone"] == "99113579"
    # Профайл жагсаалтаа өөртөө авч явна — карт нь тусдаа хүсэлт хийхгүй
    assert len(prof["contacts"]) == 3


# ---------- 3. УСТГАЛГҮЙ: идэвхгүй болгоно ----------

def test_a_contact_is_deactivated_not_deleted(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    _butangууd(client, h, cl["id"])
    rows = _contacts(client, h, cl["id"])
    gone = next(r for r in rows if r["name"] == "С.Лхагвасүрэн")
    r = client.post(f"/api/contacts/{gone['id']}/deactivate", headers=h)
    assert r.status_code == 200, r.text
    after = _contacts(client, h, cl["id"])
    assert len(after) == 3, "мөр УСТАХГҮЙ — «ажиллахаа больсон» гэдэг нь БАЙХГҮЙ биш"
    assert next(x for x in after if x["id"] == gone["id"])["active"] is False
    # Идэвхтэй нь дээрээ
    assert [x["active"] for x in after] == [True, True, False]


def test_edit_changes_the_role_and_the_phone(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    n = _add(client, h, cl["id"], "Н.Соль", "Нярав", "99966285").json()
    r = client.put(f"/api/contacts/{n['id']}", headers=h, json={
        "name": "Н.Соль", "role": "Ерөнхий нярав", "phone": "99966285",
        "phone2": "80118800", "note": "тооцоо нийлдэг"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "Ерөнхий нярав"
    assert r.json()["phone2"] == "80118800"


def test_a_missing_contact_is_404(client, as_role):
    h = as_role("otgoo")
    assert client.put("/api/contacts/999999", headers=h,
                      json={"name": "Х"}).status_code == 404
    assert client.post("/api/contacts/999999/deactivate", headers=h).status_code == 404


# ---------- 3б. БУЦАЖ ИРСЭН ХҮН (deactivate-ийн толин тусгал) ----------

def test_a_contact_comes_back_to_the_calling_list(client, as_role):
    """Ажлаасаа гарсан хүн буцаж ирдэг; андуурч идэвхгүй болгосон ч байж
    болно. ШИНЭ мөр нэмбэл ХОЁР Н.Соль төрж, аль нь одоогийнх болохыг мэдэх
    аргагүй болно — тиймээс тэр л мөр буцаж асна."""
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    _butangууd(client, h, cl["id"])
    sole = next(c for c in _contacts(client, h, cl["id"]) if c["name"] == "Н.Соль")
    client.post(f"/api/contacts/{sole['id']}/deactivate", headers=h)

    r = client.post(f"/api/clients/{cl['id']}/contacts/{sole['id']}/reactivate", headers=h)

    assert r.status_code == 200, r.text
    assert r.json()["active"] is True
    after = _contacts(client, h, cl["id"])
    assert len(after) == 3, "сэргээлт нь ШИНЭ мөр үүсгэхгүй"
    assert next(x for x in after if x["id"] == sole["id"])["active"] is True
    row = next(x for x in client.get("/api/audit?entity=client_contact", headers=h).json()
               if x["action"] == "reactivate")
    assert "Н.Соль" in row["detail"] and "идэвхтэй болгов" in row["detail"]


def test_reactivating_an_active_person_is_409(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    k = _add(client, h, cl["id"], "Н.Соль", "Нярав", "99966285").json()

    r = client.post(f"/api/clients/{cl['id']}/contacts/{k['id']}/reactivate", headers=h)

    assert r.status_code == 409
    assert r.json()["detail"] == "Энэ хүн идэвхтэй байна"


def test_another_clients_contact_is_not_found_here(client, as_role):
    """Хаяг нь ХАРИЛЦАГЧААР дамждаг тул өөр харилцагчийн хүн энэ хаяг дээр
    БАЙХГҮЙ — 403 биш, 404 (тэр хүн энэ хуудсын хүн биш)."""
    h = as_role("otgoo")
    mine, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    other, *_ = mk_contract(client, as_role, qty=21, days_ago=41)
    k = _add(client, h, other["id"], "С.Лхагвасүрэн", "Захирал", "99113579").json()
    client.post(f"/api/contacts/{k['id']}/deactivate", headers=h)

    r = client.post(f"/api/clients/{mine['id']}/contacts/{k['id']}/reactivate", headers=h)

    assert r.status_code == 404
    assert client.post("/api/clients/999999/contacts/1/reactivate",
                       headers=h).status_code == 404
    # Өөрийнх нь хаягаар сэргээгдсэн хэвээр
    assert client.post(f"/api/clients/{other['id']}/contacts/{k['id']}/reactivate",
                       headers=h).status_code == 200


def test_the_factory_boss_may_not_reactivate(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    k = _add(client, h, cl["id"], "Н.Соль", "Нярав").json()
    client.post(f"/api/contacts/{k['id']}/deactivate", headers=h)
    path = f"/api/clients/{cl['id']}/contacts/{k['id']}/reactivate"

    assert client.post(path, headers=as_role("darga")).status_code == 403
    assert client.post(path, headers=as_role("sanhuu")).status_code == 200


# ---------- 4. Эрх ----------

def test_the_factory_boss_may_read_but_not_write(client, as_role):
    hd = as_role("darga")
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    n = _add(client, h, cl["id"], "Н.Соль", "Нярав", "99966285").json()
    assert _add(client, hd, cl["id"], "Х.Хүн").status_code == 403
    assert client.put(f"/api/contacts/{n['id']}", headers=hd,
                      json={"name": "Х"}).status_code == 403
    assert client.post(f"/api/contacts/{n['id']}/deactivate", headers=hd).status_code == 403


def test_finance_may_write(client, as_role):
    hf = as_role("sanhuu")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    assert _add(client, hf, cl["id"], "Н.Соль", "Нярав", "99966285").status_code == 200


# ---------- 5. АУДИТ (харилцагчийн модуль дээрх ЭХНИЙ бүртгэл) ----------

def test_every_contact_action_signs_its_name(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=20, days_ago=40)
    n = _add(client, h, cl["id"], "Н.Соль", "Нярав", "99966285").json()
    client.put(f"/api/contacts/{n['id']}", headers=h,
               json={"name": "Н.Соль", "role": "Нярав", "phone": "99966286"})
    client.post(f"/api/contacts/{n['id']}/deactivate", headers=h)
    rows = client.get("/api/audit?entity=client_contact", headers=h).json()
    assert {r["action"] for r in rows} == {"create", "update", "deactivate"}
    assert any("Н.Соль" in r["detail"] for r in rows)
    assert all(r["user_name"] == "Ч.Отгонцэцэг" for r in rows)


# ---------- 6. ЗАЛГАХ ЖАГСААЛТ нь НЯРАВЫГ мэднэ ----------

def test_the_collections_row_carries_the_named_people(client, as_role):
    """«Авлага цуглуулах» мөр нь ХЭНД залгахаа мэдэхийн тулд хүмүүсээ авч явна."""
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=400, days_ago=90)
    client.put(f"/api/clients/{cl['id']}", headers=h, json={
        "name": cl["name"], "person": "С.Лхагвасүрэн", "phone": "99113579"})
    _butangууd(client, h, cl["id"])
    row = next(r for r in client.get("/api/collections", headers=h).json()["rows"]
               if r["client_id"] == cl["id"])
    # Үндсэн хос ХЭВЭЭР — дэлгэц ЗӨВХӨН давуу эрхтэйг нь дээр нь тавина
    assert row["person"] == "С.Лхагвасүрэн" and row["phone"] == "99113579"
    assert [(c["name"], c["role"]) for c in row["contacts"]] == [
        ("Н.Батцоож", "Төслийн менежер"),
        ("Н.Соль", "Нярав"),
        ("С.Лхагвасүрэн", "Захирал")]


def test_a_deactivated_contact_leaves_the_calling_list(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=400, days_ago=90)
    _butangууd(client, h, cl["id"])
    sole = next(c for c in _contacts(client, h, cl["id"]) if c["name"] == "Н.Соль")
    client.post(f"/api/contacts/{sole['id']}/deactivate", headers=h)
    row = next(r for r in client.get("/api/collections", headers=h).json()["rows"]
               if r["client_id"] == cl["id"])
    assert [c["name"] for c in row["contacts"]] == ["Н.Батцоож", "С.Лхагвасүрэн"]

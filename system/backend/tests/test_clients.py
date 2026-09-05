"""ХАРИЛЦАГЧИЙН БҮРТГЭЛ — нэг нэр НЭГ мөр, хоосон мөр УСТДАГ.

Хоёр эсрэг талын хаалга нэг файлд:

  · `POST /api/clients` нь ДАВХАРДЛЫГ үүсэхээс нь өмнө зогсооно. «Бутангууд
    ХХК», «бутангууд ххк», «Бутангууд  ХХК» гурав нь гурван харилцагч болбол
    авлага гурав хуваагдаж, төлбөр нь аль нэг дээр нь сууна — «Авлагын
    үлдэгдэл» гурван өөр тоо болно (H9b-ийн эсрэг тал).
  · `DELETE /api/clients/{id}` нь ЗӨВХӨН хоосон мөрийг авна. Түүхтэй
    харилцагчийг устгах нь H1-ийн эсрэг — тэнд юу наалдсаныг НЭРЛЭЖ
    татгалзана.
"""
from tests.test_features import iso, mk_contract


def _add(client, h, name, reg="", person="", phone=""):
    return client.post("/api/clients", headers=h,
                       json={"name": name, "reg": reg, "person": person, "phone": phone})


# ---------- 1. ДАВХАРДАЛ ХААГДАНА ----------

def test_the_same_name_in_another_case_or_spacing_is_refused(client, as_role):
    """«Бутангууд ХХК» ба «  бутангууд   ххк » нь НЭГ харилцагч. Хариу нь
    аль мөр рүү очихыг хэлнэ (`existing_id`) — «аль хэдийн бүртгэлтэй»
    гэдэг нь хаана байгааг хэлэхгүй бол мухардмал хана."""
    h = as_role("otgoo")
    first = _add(client, h, "Бутангууд ХХК")
    assert first.status_code == 200, first.text

    again = _add(client, h, "  бутангууд   ххк ")

    assert again.status_code == 409
    d = again.json()["detail"]
    assert d["existing_id"] == first.json()["id"]
    assert d["field"] == "name"
    assert d["msg"] == (f"Энэ нэртэй харилцагч аль хэдийн бүртгэлтэй: "
                        f"Бутангууд ХХК (№{first.json()['id']})")
    assert len([c for c in client.get("/api/clients", headers=h).json()
                if c["name"].strip().lower() == "бутангууд ххк"]) == 1


def test_the_same_register_is_refused_even_under_another_name(client, as_role):
    """ТТД нь давхардахгүй тоо: нэг регистр — нэг байгууллага. Нэр нь өөр
    бичигдсэн ч (салбарын нэр, хуучин нэр) энэ нь ТЭР харилцагч."""
    h = as_role("otgoo")
    first = _add(client, h, "Ашид Донж ХХК", reg="2233445")

    again = _add(client, h, "Ашид Донж констракшн", reg="2233445")

    assert again.status_code == 409
    d = again.json()["detail"]
    assert d["existing_id"] == first.json()["id"] and d["field"] == "reg"
    assert "регистртэй" in d["msg"]


def test_an_empty_register_never_collides(client, as_role):
    """Регистргүй харилцагч олон байдаг — хоосон нүд нь давхардал БИШ."""
    h = as_role("otgoo")
    assert _add(client, h, "Нэг ХХК").status_code == 200
    assert _add(client, h, "Хоёр ХХК").status_code == 200


def test_a_blank_name_is_refused(client, as_role):
    h = as_role("otgoo")
    r = _add(client, h, "   ")
    assert r.status_code == 400
    assert r.json()["detail"] == "Харилцагчийн нэр заавал"


def test_creating_a_client_signs_its_name(client, as_role):
    """Урьд нь харилцагч үүсгэх нь бүртгэлгүй өнгөрдөг байв."""
    h = as_role("otgoo")
    r = _add(client, h, "Аудит Тест ХХК", reg="7788990")
    rows = client.get("/api/audit?entity=client", headers=h).json()
    row = next(x for x in rows if x["entity_id"] == r.json()["id"])
    assert row["action"] == "create"
    assert "Аудит Тест ХХК" in row["detail"] and "7788990" in row["detail"]
    assert row["user_name"] == "Ч.Отгонцэцэг"


def test_the_xlsx_importer_keeps_its_own_skip_behaviour(client, as_role):
    """Багц оруулалт нь НЭГ давхардлаас болж бүхэлдээ унах ёсгүй — тэр нь
    409 биш, `skipped` тоолуур. Хаалгын шалгалт роутерийнх, оруулагчийнх БИШ."""
    import io

    from openpyxl import Workbook

    h = as_role("otgoo")
    _add(client, h, "Давхар ХХК")
    wb = Workbook()
    ws = wb.active
    ws.append(["Нэр", "Регистр", "Хариуцагч", "Утас"])
    ws.append(["давхар ххк", "", "", ""])       # давхардал — алгасагдана
    ws.append(["Шинэ Оруулга ХХК", "", "", ""])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    r = client.post("/api/import/clients", headers=h,
                    files={"file": ("clients.xlsx", buf.read(), "application/vnd.ms-excel")})

    assert r.status_code == 200, r.text
    # ӨРГӨТГӨВ (2026-09, харилцагчийн дэлгэцийн засвар): хариу нь НЭРСЭЭ ч
    # авч явдаг боллоо (`added_names`/`skipped_names` — импортын үр дүнгийн
    # цонх тэднийг жагсаана, `test_client_screen_payload.py`). Энэ тестийн
    # барих зүйл нь ТООЛУУРЫН зан төлөв — «нэг давхардлаас болж багц бүхэлдээ
    # унахгүй» — тул бүтэн харьцуулалтыг тоонуудаар нь орлууллаа.
    j = r.json()
    assert (j["created"], j["skipped"]) == (1, 1)


# ---------- 2. ХООСОН ХАРИЛЦАГЧ УСТАНА ----------

def test_an_empty_client_is_deleted_with_its_contacts(client, as_role):
    """Андуурч бичсэн нэр мөнхөд үлдэх учиргүй. Гарын үсэгтнүүд нь өөрийн
    гэсэн амьдралгүй тул харилцагчийнхаа хамт явна."""
    h = as_role("otgoo")
    cl = _add(client, h, "Устгах Тест ХХК").json()
    k = client.post(f"/api/clients/{cl['id']}/contacts", headers=h,
                    json={"name": "Н.Соль", "role": "Нярав", "phone": "99966285"}).json()

    r = client.delete(f"/api/clients/{cl['id']}", headers=h)

    assert r.status_code == 200, r.text
    assert r.json()["deleted_contacts"] == 1
    assert client.get(f"/api/clients/{cl['id']}", headers=h).status_code == 404
    assert client.get(f"/api/clients/{cl['id']}/contacts", headers=h).status_code == 404
    assert all(c["id"] != cl["id"] for c in client.get("/api/clients", headers=h).json())
    row = next(x for x in client.get("/api/audit?entity=client", headers=h).json()
               if x["entity_id"] == cl["id"] and x["action"] == "delete")
    assert "Устгах Тест ХХК" in row["detail"]
    assert k["id"] > 0


def test_a_client_with_a_contract_is_refused_and_the_contract_is_named(client, as_role):
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=20, days_ago=40)

    r = client.delete(f"/api/clients/{cl['id']}", headers=h)

    assert r.status_code == 409
    assert r.json()["detail"] == (f"Энэ харилцагчид 1 гэрээ (№{c['no']}) "
                                  f"бүртгэлтэй тул устгах боломжгүй")


def test_the_account_contract_alone_blocks_the_delete(client, as_role):
    """ХУУЧИН ҮЛДЭГДЛИЙН `OB-` данс нь гэрээ ДҮР ЭСГЭСЭН мөр — гэвч түүн дээр
    нэхэмжлэл, бичилт сууна. «Гэрээгүй» гэж уншаад чимээгүй устгавал Отгоо
    эгчийн хуучин авлага алга болно."""
    h = as_role("otgoo")
    cl = _add(client, h, "Данстай ХХК").json()
    e = client.post(f"/api/clients/{cl['id']}/entries", headers=h, json={
        "date": iso(3), "amount": 1_000_000, "kind": "advance",
        "label": "Бэлэн мөнгө зээлсэн", "note": "", "ref": ""})
    assert e.status_code == 200, e.text

    r = client.delete(f"/api/clients/{cl['id']}", headers=h)

    assert r.status_code == 409
    detail = r.json()["detail"]
    assert f"№OB-{cl['id']}" in detail, "аль гэрээ саад болж буйг НЭРЛЭХГҮЙ байв"
    assert "1 бичилт" in detail
    assert detail.startswith("Энэ харилцагчид ") and detail.endswith("устгах боломжгүй")


def test_only_the_manager_may_delete_a_client(client, as_role):
    """Санхүү нь мөнгө хөдөлгөнө, БҮРТГЭЛИЙН мөр устгахгүй."""
    h = as_role("otgoo")
    cl = _add(client, h, "Эрхийн Тест ХХК").json()

    denied = client.delete(f"/api/clients/{cl['id']}", headers=as_role("sanhuu"))

    assert denied.status_code == 403
    assert denied.json()["detail"] == "Энэ үйлдлийг хийх эрх байхгүй — зөвхөн менежер"
    assert client.get(f"/api/clients/{cl['id']}", headers=h).status_code == 200


def test_deleting_a_missing_client_is_404(client, as_role):
    assert client.delete("/api/clients/999999",
                         headers=as_role("otgoo")).status_code == 404

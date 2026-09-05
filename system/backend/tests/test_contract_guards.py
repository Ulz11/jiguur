"""ХААЛГА ба НЯГТЛАЛ — гэрээний БИЧИХ замууд дээрх дөрвөн нүх (TDD).

Гэрээний router-ийн бичих зам БҮР эрхийн хаалгатай, нягтлалтай байх ёстой.
Дөрөв нь тэрнээс гажсан байв:

  1. `POST /contracts/{id}/generate-invoices` — эрхийн хаалгагүй: нэвтэрсэн
     БҮХ хүн (үйлдвэрийн дарга ч) нэхэмжлэл ТӨРҮҮЛЖ чадна. Нэхэмжлэл бол
     МӨНГӨ — менежер, санхүүчийн зам.
  2. `PATCH /contracts/{id}` дээр `{"start_date": null}` нь менежерийн
     шалгуур ба дахин бодолтын хаалга ХОЁУЛАНГ нь тойрч, гэрээний эхлэх
     огноог ЧИМЭЭГҮЙ хоослодог байв (`if ... is not None` гэсэн шүүлт нь
     ТҮЛХҮҮР биш УТГА хардаг байсан).
  3. Засвар + актын тоог `PATCH /movement-lines/{id}` нягталдаг ч
     БҮРТГЭХ агшинд (`POST /contracts/{id}/movements`) нягталдаггүй байв —
     40ш буцаалт дээр 30 засвар + 20 акт бичигдэж, сөрөг тоо ч оржээ.
  4. `POST /contracts/{id}/extend` нь ямар ч огноо авч (тооцооны эхлэлээс
     ӨМНӨ, сүүлийн буцаалтаас ӨМНӨ, өнгөрсөн өдөр) бичдэг байсан ба
     /audit дээр НЭГ Ч мөр үлдээдэггүй байв — «хэн сунгасан юм бэ?».
"""
from datetime import date, timedelta

from tests.test_api import iso, make_contract, _confirm_pending, _movements


def _detail(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()


def _future(days: int) -> str:
    return str(date.today() + timedelta(days=days))


# ---------- 1. Нэхэмжлэл ТӨРҮҮЛЭХ нь эрхтэй зам ----------

def test_factory_boss_cannot_generate_invoices(client, as_role):
    """Үйлдвэрийн дарга нэхэмжлэл төрүүлэхгүй — энэ бол МӨНГӨНИЙ товч."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role)
    _confirm_pending(client, as_role, cid)
    before = len(_detail(client, h, cid)["invoices"])
    r = client.post(f"/api/contracts/{cid}/generate-invoices", headers=as_role("darga"))
    assert r.status_code == 403
    assert len(_detail(client, h, cid)["invoices"]) == before


def test_manager_may_generate_invoices(client, as_role):
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role)
    _confirm_pending(client, as_role, cid)
    r = client.post(f"/api/contracts/{cid}/generate-invoices", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["created"] >= 1


def test_finance_may_generate_invoices_too(client, as_role):
    """Санхүүч нь нэхэмжлэлийн эзэн — түүнд хаалга нээлттэй хэвээр."""
    _, cid, m, st = make_contract(client, as_role)
    _confirm_pending(client, as_role, cid)
    r = client.post(f"/api/contracts/{cid}/generate-invoices", headers=as_role("sanhuu"))
    assert r.status_code == 200, r.text


# ---------- 2. NULL нь хаалганы АРААР ОРОХ зам БИШ ----------

def test_finance_sending_a_null_start_date_never_writes(client, as_role):
    """Санхүүчийн `{"start_date": null}` нь ЧИМЭЭГҮЙ бичигдэхгүй.

    403 ч бай, 400 ч бай — гол нь гэрээний эхлэх огноо ХЭВЭЭР үлдэнэ.
    """
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role)
    before = _detail(client, h, cid)["start_date"]
    r = client.patch(f"/api/contracts/{cid}", headers=as_role("sanhuu"),
                     json={"start_date": None})
    assert r.status_code in (400, 403), r.text
    assert _detail(client, h, cid)["start_date"] == before


def test_manager_sending_a_null_start_date_is_refused(client, as_role):
    """Менежер ч гэсэн эхлэх огноог ХООСОЛЖ болохгүй — тооцоо эхлэлгүй болно."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role)
    before = _detail(client, h, cid)["start_date"]
    r = client.patch(f"/api/contracts/{cid}", headers=h, json={"start_date": None})
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Гэрээний эхлэх огноо хоосон байж болохгүй"
    assert _detail(client, h, cid)["start_date"] == before


def test_null_cycle_days_and_null_cycle_mode_are_refused_too(client, as_role):
    """Циклийн хоног ба хэлбэр нь ч хоосорч болохгүй — цонх зурагдахаа болино."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role)
    for field in ("cycle_days", "cycle_mode"):
        r = client.patch(f"/api/contracts/{cid}", headers=h, json={field: None})
        assert r.status_code == 400, f"{field}: {r.text}"
        assert "хоосон" in r.json()["detail"]
    d = _detail(client, h, cid)
    assert d["cycle_days"] == 30 and d["cycle_mode"] == "days"


def test_a_null_heavy_field_cannot_slip_past_the_rebuild_gate(client, as_role):
    """Нэхэмжлэгдсэн гэрээ дээр ч NULL нь дахин бодолтын хаалгыг тойрохгүй.

    Урьд нь `heavy` хоосон үлдэж, `mutate()` шууд гүйж, нэхэмжлэлүүд нь
    ХУУЧИН тороороо үлдэж байхад гэрээний эхлэл алга болдог байв.
    """
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=95)
    _confirm_pending(client, as_role, cid)
    before = _detail(client, h, cid)
    assert len(before["invoices"]) >= 3

    r = client.patch(f"/api/contracts/{cid}", headers=h, json={"start_date": None})
    assert r.status_code == 400, r.text
    after = _detail(client, h, cid)
    assert after["start_date"] == before["start_date"]
    assert [i["no"] for i in after["invoices"]] == [i["no"] for i in before["invoices"]]


# ---------- 3. Засвар + акт нь БҮРТГЭХ агшинд ч нягтлагдана ----------

def _return(client, h, cid, m, st, qty=40, **line):
    return client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(5),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": qty, **line}]})


def _returns(client, h, cid):
    return [x for x in _movements(client, h, cid) if x["type"] == "RETURN"]


def test_repair_plus_akt_over_the_returned_qty_is_refused_at_creation(client, as_role):
    """40ш буцаалт дээр 30 засвар + 20 акт — засварын зам дээрхтэй ИЖИЛ татгалзал."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=10)
    _confirm_pending(client, as_role, cid)
    r = _return(client, h, cid, m, st, repair_qty=30, writeoff_qty=20)
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Засвар + акт нь буцаалтын тооноос их байна"
    assert _returns(client, h, cid) == [], "татгалзсан хөдөлгөөн DB-д үлдэв"


def test_negative_repair_qty_is_refused_at_creation(client, as_role):
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=10)
    _confirm_pending(client, as_role, cid)
    r = _return(client, h, cid, m, st, repair_qty=-1)
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Засвар, актын тоо сөрөг байж болохгүй"
    assert _returns(client, h, cid) == []


def test_negative_writeoff_qty_is_refused_at_creation(client, as_role):
    """Сөрөг акт нь СӨРӨГ МӨНГӨ болж нэхэмжлэлд ордог байв."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=10)
    _confirm_pending(client, as_role, cid)
    r = _return(client, h, cid, m, st, writeoff_qty=-5)
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Засвар, актын тоо сөрөг байж болохгүй"
    assert _returns(client, h, cid) == []


def test_repair_plus_akt_equal_to_the_returned_qty_still_passes(client, as_role):
    """Хязгаар нь ХАТУУ БИШ: 25 + 15 = 40 нь хэвийн буцаалт (регресс)."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=10)
    _confirm_pending(client, as_role, cid)
    r = _return(client, h, cid, m, st, repair_qty=25, writeoff_qty=15)
    assert r.status_code == 200, r.text
    ln = _returns(client, h, cid)[0]["lines"][0]
    assert ln["repair_qty"] == 25 and ln["writeoff_qty"] == 15


# ---------- 4. СУНГАЛТ нь огноогоо нягталж, гарын үсгээ үлдээнэ ----------

def _extend(client, h, cid, end_date):
    return client.post(f"/api/contracts/{cid}/extend", headers=h,
                       json={"end_date": end_date})


def test_extend_before_the_billing_origin_is_refused(client, as_role):
    """Дуусах огноо тооцооны эхлэлээс өмнө байвал гэрээ нь СӨРӨГ урттай болно."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40)
    r = _extend(client, h, cid, iso(50))
    assert r.status_code == 400, r.text
    assert "тооцооны эхлэл" in r.json()["detail"]
    assert _detail(client, h, cid)["end_date"] in (None, "")


def test_extend_before_the_last_movement_is_refused(client, as_role):
    """Өнөөдөр буцаалт бүртгээд өчигдрөөр дуусгавал буцаалт нь гэрээнээс ГАДНА үлдэнэ."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40)
    _confirm_pending(client, as_role, cid)
    r0 = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": iso(0),
        "lines": [{"material_id": m["id"], "grade_id": st["grade_id"], "qty": 100}]})
    assert r0.status_code == 200, r0.text
    r = _extend(client, h, cid, iso(1))
    assert r.status_code == 400, r.text
    assert "хөдөлгөөн" in r.json()["detail"].lower()


def test_extend_into_the_past_is_refused(client, as_role):
    """Сүүлийн хөдөлгөөн хол ард байсан ч ӨНГӨРСӨН өдрөөр дуусгахгүй."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40)
    _confirm_pending(client, as_role, cid)
    r = _extend(client, h, cid, iso(1))
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Дуусах огноо өнөөдрөөс өмнө байж болохгүй"
    assert _detail(client, h, cid)["end_date"] in (None, "")


def test_extend_writes_the_new_end_date_and_signs_the_audit(client, as_role):
    """Хүчинтэй сунгалт нь бичигдэж, /audit дээр МОНГОЛООР мөр үлдээнэ."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40)
    _confirm_pending(client, as_role, cid)
    target = _future(60)
    r = _extend(client, h, cid, target)
    assert r.status_code == 200, r.text
    assert r.json()["end_date"] == target
    assert _detail(client, h, cid)["end_date"] == target

    rows = [x for x in client.get("/api/audit?entity=contract", headers=h).json()
            if x["entity_id"] == cid and "дуусах огноо" in x["detail"]]
    assert rows, "сунгалт /audit дээр мөр үлдээсэнгүй"


def test_shortening_the_contract_is_allowed(client, as_role):
    """Богиносгох нь ЗӨВШӨӨРӨГДӨНӨ — «сунгах» товч нь огноо ЗАСАХ товч ч мөн."""
    h = as_role("otgoo")
    _, cid, m, st = make_contract(client, as_role, days_ago=40)
    _confirm_pending(client, as_role, cid)
    assert _extend(client, h, cid, _future(90)).status_code == 200
    r = _extend(client, h, cid, _future(10))
    assert r.status_code == 200, r.text
    assert _detail(client, h, cid)["end_date"] == _future(10)


def test_extend_stays_a_manager_only_door(client, as_role):
    """Эрхийн хаалга ХЭВЭЭР (регресс) — санхүүч гэрээний хугацаа сунгахгүй."""
    _, cid, m, st = make_contract(client, as_role, days_ago=40)
    assert _extend(client, as_role("sanhuu"), cid, _future(30)).status_code == 403

"""АГУУЛАХЫН ЗАЛРУУЛГА НЬ ДАРЖ БИЧИЛТ БИШ, БИЧИЛТ.

«2,044 байсан, одоо 1,900 — 144 ширхэг хаачив?» гэдэг нь Отгоо эгчийн
агуулах дээрх хамгийн байнгын маргаан. Урьд нь `POST /api/stock/adjust` ба
`POST /api/stock/stocktake` хоёул `Stock.on_hand`-ыг ШУУД тогтоодог байсан:
хуучин тоо, шалтгаан, хэн — юу ч үлдэхгүй, тиймээс маргаан нь хариултгүй.

Энд дөрвөн амлалт барина:
  1. Залруулга бүр МӨР болно (хэн, хэзээ, юунаас юу, яагаад);
  2. Сөрөг тоо ОРОХГҮЙ, зөрүүгүй нь МӨР ҮҮСГЭХГҮЙ;
  3. Андуурсныг БУЦААЖ болно — устгалгүйгээр (H1);
  4. Тооллого нь ХАРСАН тоон дээрээ тулгуурлана: хооронд нь ачилт бүртгэгдвэл
     тооллого 409-өөр зогсоно, чимээгүй дарж бичихгүй.
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine

from app.db import Base
from app.schema import migrate_schema


def iso(days_ago: int = 0) -> str:
    return str(date.today() - timedelta(days=days_ago))


def a_stock(client, h, name: str = "Труба 2м") -> tuple[dict, dict]:
    m = next(x for x in client.get("/api/materials", headers=h).json()
             if x["name"] == name)
    return m, m["stock"][0]


def on_hand(client, h, mid: int, gid: int) -> float:
    m = next(x for x in client.get("/api/materials", headers=h).json()
             if x["id"] == mid)
    return next(s for s in m["stock"] if s["grade_id"] == gid)["on_hand"]


def adjust(client, h, m, s, counted, note="") -> dict:
    return client.post("/api/stock/adjust", headers=h, json={
        "material_id": m["id"], "grade_id": s["grade_id"],
        "on_hand": counted, "note": note})


# ---------- 1. Мөр үүснэ ----------

def test_an_adjustment_keeps_the_number_it_replaced(client, as_role):
    h = as_role("darga")
    m, s = a_stock(client, h)
    r = adjust(client, h, m, s, s["on_hand"] - 144, note="Тооллогоор дутав")
    assert r.status_code == 200, r.text
    adj = r.json()["adjustment"]
    assert adj["before"] == s["on_hand"]
    assert adj["after"] == s["on_hand"] - 144
    assert adj["diff"] == -144
    assert adj["source"] == "adjust" and adj["source_mn"] == "залруулга"
    assert adj["note"] == "Тооллогоор дутав"
    assert adj["user_name"] == "Үйлдвэрийн дарга"
    assert r.json()["on_hand"] == s["on_hand"] - 144


def test_a_no_op_adjustment_writes_nothing_at_all(client, as_role):
    """Ижил тоог дахин тогтоох нь ЯВДАЛ БИШ — хоосон мөр түүхийг шингэлнэ."""
    h = as_role("darga")
    m, s = a_stock(client, h)
    r = adjust(client, h, m, s, s["on_hand"])
    assert r.status_code == 200
    assert r.json()["adjustment"] is None
    assert client.get(f"/api/stock/adjustments?material_id={m['id']}",
                      headers=h).json() == []


def test_a_negative_count_is_refused_in_her_own_words(client, as_role):
    h = as_role("darga")
    m, s = a_stock(client, h)
    r = adjust(client, h, m, s, -1)
    assert r.status_code == 400
    assert r.json()["detail"] == "Тоо сөрөг байж болохгүй"
    assert on_hand(client, h, m["id"], s["grade_id"]) == s["on_hand"]


# ---------- 2. Буцаалт (void) ----------

def test_voiding_an_adjustment_puts_the_old_number_back(client, as_role):
    h = as_role("darga")
    m, s = a_stock(client, h)
    adj = adjust(client, h, m, s, s["on_hand"] - 50).json()["adjustment"]

    r = client.post(f"/api/stock/adjustments/{adj['id']}/void", headers=h,
                    json={"reason": "Буруу зэрэглэл дээр тоолов"})
    assert r.status_code == 200, r.text
    assert r.json()["on_hand"] == s["on_hand"]
    row = r.json()["adjustment"]
    assert row["voided"] is True
    assert row["void_reason"] == "Буруу зэрэглэл дээр тоолов"
    # УСТГАЛ БИШ — жагсаалтад ХАРАГДСААР
    hist = client.get(f"/api/stock/adjustments?material_id={m['id']}",
                      headers=h).json()
    assert [x["id"] for x in hist] == [adj["id"]]


def test_a_void_that_would_make_the_balance_negative_is_refused(client, as_role):
    h = as_role("darga")
    m, s = a_stock(client, h)
    up = adjust(client, h, m, s, s["on_hand"] + 200).json()["adjustment"]
    adjust(client, h, m, s, 10)          # дараа нь бараг тэглэв

    r = client.post(f"/api/stock/adjustments/{up['id']}/void", headers=h,
                    json={"reason": "андуурав"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Буцаахад үлдэгдэл сөрөг болно"
    assert on_hand(client, h, m["id"], s["grade_id"]) == 10


def test_a_void_needs_a_reason_and_never_happens_twice(client, as_role):
    h = as_role("darga")
    m, s = a_stock(client, h)
    adj = adjust(client, h, m, s, s["on_hand"] + 5).json()["adjustment"]

    assert client.post(f"/api/stock/adjustments/{adj['id']}/void", headers=h,
                       json={"reason": "  "}).status_code == 400
    assert client.post(f"/api/stock/adjustments/{adj['id']}/void", headers=h,
                       json={"reason": "андуурав"}).status_code == 200
    again = client.post(f"/api/stock/adjustments/{adj['id']}/void", headers=h,
                        json={"reason": "дахиад"})
    assert again.status_code == 409
    assert on_hand(client, h, m["id"], s["grade_id"]) == s["on_hand"]


def test_only_the_warehouse_roles_may_void(client, as_role):
    h = as_role("darga")
    m, s = a_stock(client, h)
    adj = adjust(client, h, m, s, s["on_hand"] + 5).json()["adjustment"]
    assert client.post(f"/api/stock/adjustments/{adj['id']}/void",
                       headers=as_role("sanhuu"),
                       json={"reason": "болохгүй"}).status_code == 403


# ---------- 3. Тооллого: ХАРСАН тоо нь гэрээ ----------

def _lines(client, h, limit=3):
    st = client.get("/api/stock", headers=h).json()
    out = []
    for r in st["rows"]:
        for s in r["stock"]:
            out.append({"material_id": r["id"], "grade_id": s["grade_id"],
                        "system": s["on_hand"], "counted": s["on_hand"] - 1})
            if len(out) == limit:
                return out
    return out


def test_a_stale_page_cannot_overwrite_a_moved_balance(client, as_role):
    """Тооллого нь цагаар үргэлжилдэг — хооронд нь ачилт бүртгэгдэж болно.

    Тэр тохиолдолд хуудасны «системийн» тоо ХУУЧИРНА. Дарж бичих нь
    ачилтыг чимээгүй арчих гэсэн үг тул сервер 409-өөр зогсооно.
    """
    h = as_role("darga")
    lines = _lines(client, h, limit=3)
    m = next(x for x in client.get("/api/materials", headers=h).json()
             if x["id"] == lines[1]["material_id"])
    # хооронд нь агуулах хөдөллөө
    adjust(client, h, m, {"grade_id": lines[1]["grade_id"]},
           lines[1]["system"] + 7)

    r = client.post("/api/stock/stocktake", headers=h, json={
        "date": iso(), "note": "Утсаар", "lines": lines})
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert m["name"] in detail and "дахин ачаална уу" in detail
    assert f"{lines[1]['system']:g} → {lines[1]['system'] + 7:g}" in detail
    # ⚠ НЭГ Ч мөр бичигдээгүй — хагас тооллого гэж байхгүй
    for ln in lines:
        assert on_hand(client, h, ln["material_id"], ln["grade_id"]) == (
            ln["system"] + 7 if ln is lines[1] else ln["system"])


def test_the_same_line_twice_is_refused_instead_of_silently_winning(client, as_role):
    h = as_role("darga")
    line = _lines(client, h, limit=1)[0]
    r = client.post("/api/stock/stocktake", headers=h, json={
        "date": iso(), "note": "", "lines": [line, {**line, "counted": 0}]})
    assert r.status_code == 400
    assert "хоёр удаа" in r.json()["detail"]
    assert on_hand(client, h, line["material_id"], line["grade_id"]) == line["system"]


def test_a_stocktake_writes_one_batch_of_rows(client, as_role):
    h = as_role("darga")
    lines = _lines(client, h, limit=3)
    r = client.post("/api/stock/stocktake", headers=h, json={
        "date": iso(), "note": "7-р сарын тооллого", "lines": lines})
    assert r.status_code == 200, r.text
    assert r.json()["adjusted"] == 3
    batch = r.json()["batch"]

    for ln in lines:
        hist = client.get(f"/api/stock/adjustments?material_id={ln['material_id']}",
                          headers=h).json()
        row = next(x for x in hist if x["grade_id"] == ln["grade_id"])
        assert row["source"] == "stocktake" and row["source_mn"] == "тооллого"
        assert row["batch"] == batch, "нэг тооллого — нэг багц"
        assert row["diff"] == -1
        assert row["note"] == "7-р сарын тооллого"


# ---------- 4. Материалын дэлгэрэнгүй дээрх ТҮҮХ ----------

def test_the_material_history_shows_adjustments_beside_movements(client, as_role):
    """«Тоо яагаад өөрчлөгдөв?» — ачилт ч, тооллого ч НЭГ жагсаалтад."""
    h = as_role("otgoo")
    m, s = a_stock(client, h, "Хэв хашмал 6012")
    adjust(client, as_role("darga"), m, s, s["on_hand"] - 3, note="Хагарсан")
    client.post("/api/stock/stocktake", headers=as_role("darga"), json={
        "date": iso(), "note": "Тооллого", "lines": [{
            "material_id": m["id"], "grade_id": s["grade_id"],
            "system": s["on_hand"] - 3, "counted": s["on_hand"] - 5}]})

    hist = client.get(f"/api/materials/{m['id']}", headers=h).json()["movements"]
    kinds = [x["kind"] for x in hist if x["row"] == "adjustment"]
    assert kinds[:2] == ["Тооллого", "Залруулга"], "шинэ нь дээрээ"
    take = next(x for x in hist if x["kind"] == "Тооллого")
    assert take["delta"] == -2 and take["before"] == s["on_hand"] - 3
    assert take["contract_no"] == "" and take["client"] == ""
    # хөдөлгөөний мөрүүд нь өөрсдийн үгээ авч явна
    assert {x["kind"] for x in hist if x["row"] == "movement"} <= {
        "Ачилт", "Буцаалт", "Акт", "Худалдаа"}


def test_a_voided_shipment_stays_in_the_history_marked_as_void(client, as_role):
    h = as_role("otgoo")
    m, s = a_stock(client, h, "Хэв хашмал 6012")
    grade = next(x for x in m["stock"] if x["grade"] == "А")
    cl = client.post("/api/clients", json={"name": "Хүчингүйн тест ХХК"},
                     headers=h).json()
    c = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(5),
        "items": [{"material_id": m["id"], "grade_id": grade["grade_id"],
                   "qty": 40, "daily_rate": 330}]}).json()
    mv = next(x for x in client.get(f"/api/contracts/{c['id']}", headers=h)
              .json()["movements"] if x["status"] == "pending")
    client.post(f"/api/movements/{mv['id']}/confirm", headers=as_role("darga"))
    assert client.post(f"/api/movements/{mv['id']}/void", headers=h,
                       json={"reason": "Буруу гэрээнд бичив"}).status_code == 200

    hist = client.get(f"/api/materials/{m['id']}", headers=h).json()["movements"]
    row = next(x for x in hist if x["movement_id"] == mv["id"])
    assert row["voided"] is True
    assert row["void_reason"] == "Буруу гэрээнд бичив"
    assert row["counted"] is False, "хүчингүй мөр тоонд ОРОХГҮЙ, гэвч ХАРАГДАНА"


# ---------- 5. Схем ----------

@pytest.mark.sqlite_only
def test_the_migrator_fills_a_missing_column_on_an_old_adjustments_table(tmp_path):
    """Хүснэгт нь `create_all`-аар төрнө; ДУТУУ багана нь ALTER-аар нөхөгдөнө."""
    engine = create_engine("sqlite:///" + str(tmp_path / "old.db"))
    with engine.begin() as c:
        c.exec_driver_sql("""CREATE TABLE stock_adjustments (
            id INTEGER PRIMARY KEY, material_id INTEGER, grade_id INTEGER,
            date DATE, "before" FLOAT, "after" FLOAT, diff FLOAT)""")
    added = migrate_schema(engine)
    assert "stock_adjustments.source" in added
    assert "stock_adjustments.stocktake_batch" in added
    assert "stock_adjustments.voided_at" in added
    with engine.connect() as c:
        cols = {r[1] for r in c.exec_driver_sql(
            'PRAGMA table_info("stock_adjustments")')}
    assert cols == set(Base.metadata.tables["stock_adjustments"].columns.keys())
    assert migrate_schema(engine) == []          # idempotent
    engine.dispose()


@pytest.mark.parametrize("table", ["stock_adjustments", "notification_states"])
def test_new_tables_are_part_of_the_model_metadata(table):
    assert table in Base.metadata.tables

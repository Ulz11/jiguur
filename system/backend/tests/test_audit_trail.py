"""«ХЭН, ЮУГ, ХЭЗЭЭ — БҮГДИЙГ» гэдэг нь БҮГДИЙГ гэсэн үг.

Гарын авлага нь бүртгэлийг ингэж амладаг ч, өөрчлөлт хийдэг замуудын нэлээд
нь МӨР ҮЛДЭЭДЭГГҮЙ байв: тохиргоо (алдангийн суурь хувь!), каталогийн үнэ,
агуулахын залруулга, засварын буцаалт, нууц үг, ачилтын баталгаажуулалт,
гараар дарсан нэхэмжлэлийн гүйлт. Мөр дутуу бүртгэл нь бүртгэл БИШ —
Отгоо эгч нэг л удаа «энэ хаанаас гарав?» гэж хариултгүй үлдвэл дараагийн
удаа тэр асуултаа Excel-ээсээ асууна.

Энд зам бүрийн мөр БАЙГААГ, ЗӨВ БИЕТ дээр суусныг, МОНГОЛООР ярьж байгааг
шалгана. Мөрийн ӨГҮҮЛБЭР нь `test_audit_language.py`-ийн шүүлтүүрээр давна.
"""
from datetime import date, timedelta

from app.services import audit as audit_svc
from tests.test_audit_language import latin_in


def iso(days_ago: int = 0) -> str:
    return str(date.today() - timedelta(days=days_ago))


def rows(client, h, **params) -> list[dict]:
    q = "&".join(f"{k}={v}" for k, v in params.items())
    r = client.get(f"/api/audit?limit=500{'&' + q if q else ''}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["rows"]


def newest(client, h, entity: str) -> dict:
    got = rows(client, h, entity=entity)
    assert got, f"«{entity}» дээр мөр огт үлдсэнгүй"
    return got[0]


def assert_mongolian(row: dict) -> None:
    assert not latin_in(row["detail"]), \
        f"/audit-ийн «Дэлгэрэнгүй» дээр англи үг: {row['detail']}"
    assert (row["user_name"] or "").strip(), "эзэнгүй мөр — дэлгэц дээр «—» болно"


# ---------- Тохиргоо ----------

def test_settings_change_leaves_a_row_that_says_what_moved(client, as_role):
    """Алдангийн суурь хувь нь ЧИМЭЭГҮЙ мөнгө хөдөлгөдөг тохиргоо."""
    h = as_role("otgoo")
    assert client.put("/api/settings", headers=h, json={
        "values": {"penalty_default": "0.7"}}).status_code == 200
    row = newest(client, h, "settings")
    assert row["action"] == "update"
    assert "алдангийн суурь хувь: 0 → 0.7" in row["detail"]
    assert_mongolian(row)


# ---------- Каталог ----------

def test_grade_create_and_edit_are_both_recorded(client, as_role):
    h = as_role("otgoo")
    g = client.post("/api/grades", headers=h,
                    json={"code": "Г", "name": "Г зэрэглэл", "sort": 5}).json()
    made = newest(client, h, "grade")
    assert (made["action"], made["entity_id"]) == ("create", g["id"])
    assert "Г зэрэглэл" in made["detail"]

    client.put(f"/api/grades/{g['id']}", headers=h,
               json={"code": "Г", "name": "Гуравдугаар", "sort": 5})
    edited = newest(client, h, "grade")
    assert edited["action"] == "update"
    assert "нэр: Г зэрэглэл → Гуравдугаар" in edited["detail"]
    assert_mongolian(edited)


def test_material_price_change_names_the_grade_and_both_numbers(client, as_role):
    """НБҮнэ бол АКТЫН үнэ — өөрчлөгдвөл дараагийн акт бүр өөр мөнгө болно."""
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Труба 2м")
    prices = [{"grade_id": p["grade_id"], "nb_price": p["nb_price"],
               "sale_price": p["sale_price"]} for p in m["prices"]]
    first = prices[0]
    old_nb = first["nb_price"]
    first["nb_price"] = old_nb + 5000
    body = {k: m[k] for k in ("name", "category", "code", "unit", "base_rate",
                              "repair_fee")}
    assert client.put(f"/api/materials/{m['id']}", headers=h,
                      json={**body, "prices": prices}).status_code == 200
    row = newest(client, h, "material")
    assert row["action"] == "update" and row["entity_id"] == m["id"]
    assert "НБҮнэ" in row["detail"] and f"{old_nb:,.0f}₮" in row["detail"]
    assert_mongolian(row)


def test_new_material_is_recorded(client, as_role):
    h = as_role("otgoo")
    grades = client.get("/api/grades", headers=h).json()
    r = client.post("/api/materials", headers=h, json={
        "name": "Тулаас В9", "category": "Тулаас", "base_rate": 400,
        "prices": [{"grade_id": grades[0]["id"], "nb_price": 90000,
                    "sale_price": 90000}]})
    assert r.status_code == 200, r.text
    row = newest(client, h, "material")
    assert (row["action"], row["entity_id"]) == ("create", r.json()["id"])
    assert "Тулаас В9" in row["detail"]
    assert_mongolian(row)


# ---------- Агуулах ----------

def test_stock_adjust_and_repair_done_each_leave_a_row(client, as_role):
    h = as_role("darga")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Труба 2м")
    st = m["stock"][0]
    r = client.post("/api/stock/adjust", headers=h, json={
        "material_id": m["id"], "grade_id": st["grade_id"],
        "on_hand": st["on_hand"] - 3, "note": "Тоолж үзэхэд дутуу байв"})
    assert r.status_code == 200, r.text

    mh = as_role("otgoo")     # /audit нь менежерийнх
    row = newest(client, mh, "stock_adjustment")
    assert row["action"] == "adjust"
    assert row["entity_id"] == r.json()["adjustment"]["id"]
    assert f"{st['on_hand']:g} → {st['on_hand'] - 3:g}" in row["detail"]
    assert "Тоолж үзэхэд дутуу байв" in row["detail"]
    assert_mongolian(row)


def test_repair_done_says_where_the_pieces_went(client, as_role):
    """Засвараас гарсан бараа нь АГУУЛАХЫН ҮЛДЭГДЭЛ болно — мөр нь заавал."""
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    grade = next(s for s in m["stock"] if s["grade"] == "А")
    cl = client.post("/api/clients", json={"name": "Засварын тест ХХК"},
                     headers=h).json()
    c = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(10),
        "items": [{"material_id": m["id"], "grade_id": grade["grade_id"],
                   "qty": 30, "daily_rate": 330}]}).json()
    pend = next(mv for mv in client.get(f"/api/contracts/{c['id']}", headers=h)
                .json()["movements"] if mv["status"] == "pending")
    client.post(f"/api/movements/{pend['id']}/confirm", headers=as_role("darga"))
    # буцаалтын 10-аас 6 нь ЗАСВАРТ орно
    assert client.post(f"/api/contracts/{c['id']}/movements", headers=h, json={
        "type": "RETURN", "date": iso(1),
        "lines": [{"material_id": m["id"], "grade_id": grade["grade_id"],
                   "qty": 10, "repair_qty": 6}]}).status_code == 200

    assert client.post("/api/stock/repair-done", headers=as_role("darga"), json={
        "material_id": m["id"], "grade_id": grade["grade_id"],
        "qty": 4}).status_code == 200
    got = next(r for r in rows(client, h, entity="stock")
               if r["action"] == "repair_done")
    assert "засвараас 4ш" in got["detail"]
    assert "засварт 2ш үлдэв" in got["detail"]
    assert_mongolian(got)


# ---------- Тооллого ----------

def _take(client, h, lines, note="Сарын тооллого"):
    return client.post("/api/stock/stocktake", headers=h,
                       json={"date": iso(), "note": note, "lines": lines})


def test_a_stocktake_without_a_single_difference_still_leaves_its_row(client, as_role):
    """«Зөрүүгүй» бол ХИЙГДСЭН АЖИЛ — тэр мөр алга болох ёсгүй.

    Хамгийн үнэтэй хариулт нь «бүх юм байрандаа байна» гэдэг: түүнийг
    бүртгэлээс хасвал маргааш «тооллого хийсэн үү?» гэсэн асуулт үлдэнэ.
    """
    h = as_role("darga")
    st = client.get("/api/stock", headers=h).json()
    line = next({"material_id": r["id"], "grade_id": s["grade_id"],
                 "system": s["on_hand"], "counted": s["on_hand"]}
                for r in st["rows"] for s in r["stock"])
    r = _take(client, h, [line], note="Хяналтын тооллого")
    assert r.status_code == 200, r.text
    assert r.json()["adjusted"] == 0

    row = newest(client, as_role("otgoo"), "stock")
    assert row["action"] == "stocktake"
    assert "зөрүүгүй" in row["detail"]
    assert "Хяналтын тооллого" in row["detail"]
    assert_mongolian(row)


def test_a_long_stocktake_keeps_every_line_in_the_row(client, as_role):
    """Мөр бүрийн зөрүү БҮТНЭЭРЭЭ бичигдэнэ — 1000 тэмдэгт дээр тасрахгүй."""
    h = as_role("darga")
    st = client.get("/api/stock", headers=h).json()
    lines = [{"material_id": r["id"], "grade_id": s["grade_id"],
              "system": s["on_hand"], "counted": s["on_hand"] + 1}
             for r in st["rows"] for s in r["stock"]]
    assert len(lines) > 20, "тестийн урьдчилсан нөхцөл: олон мөртэй тооллого"
    assert _take(client, h, lines).status_code == 200

    row = newest(client, as_role("otgoo"), "stock")
    assert len(row["detail"]) > 1000, "хуучин 1000 тэмдэгтийн хязгаар хэвээр байна"
    assert len(row["detail"]) <= audit_svc.DETAIL_LIMIT
    for r_ in st["rows"]:
        if any(s for s in r_["stock"]):
            assert r_["name"] in row["detail"], f"«{r_['name']}» мөр тасарчээ"


# ---------- Ачилт баталгаажуулах ----------

def test_confirming_a_shipment_signs_the_moment_money_starts(client, as_role):
    h = as_role("otgoo")
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["name"] == "Хэв хашмал 6012")
    grade = next(s for s in m["stock"] if s["grade"] == "А")
    cl = client.post("/api/clients", json={"name": "Ачилтын тест ХХК"},
                     headers=h).json()
    c = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(3),
        "items": [{"material_id": m["id"], "grade_id": grade["grade_id"],
                   "qty": 25, "daily_rate": 330}]}).json()
    pend = next(mv for mv in client.get(f"/api/contracts/{c['id']}", headers=h)
                .json()["movements"] if mv["status"] == "pending")
    assert client.post(f"/api/movements/{pend['id']}/confirm",
                       headers=as_role("darga")).status_code == 200

    row = next(r for r in rows(client, h, entity="movement")
               if r["action"] == "confirm" and r["entity_id"] == pend["id"])
    assert "Ачсан ✓ 25ш" in row["detail"]
    assert "Ачилтын тест ХХК" in row["detail"]
    assert row["user_name"] == "Үйлдвэрийн дарга"
    assert_mongolian(row)


# ---------- Нэхэмжлэлийн гар гүйлт ----------

def test_the_manual_invoice_run_signs_itself(client, as_role):
    h = as_role("sanhuu")
    assert client.post("/api/invoices/generate", headers=h).status_code == 200
    row = next(r for r in rows(client, as_role("otgoo"), entity="invoice")
               if r["action"] == "generate")
    assert "Өдөр тутмын гүйлт:" in row["detail"]
    assert row["user_name"] == "Санхүүч", "гар гүйлт «Систем» гэж гарын үсэг зурахгүй"
    assert_mongolian(row)


# ---------- Нууц үг ----------

def test_a_password_change_is_recorded_but_never_written_down(client, as_role):
    h = as_role("sanhuu")
    secret = "МаагийнҮг99"
    assert client.post("/api/auth/change-password", headers=h, json={
        "old_password": "1234", "new_password": secret}).status_code == 200

    every = rows(client, as_role("otgoo"))
    assert not any(secret in r["detail"] or "1234" in r["detail"] for r in every), \
        "нууц үг бүртгэлд БИЧИГДЭХГҮЙ"
    row = next(r for r in every if r["entity"] == "user")
    assert row["action"] == "password"
    assert "нууц үг" in row["detail"]
    assert_mongolian(row)


# ---------- Аудит өөрөө унавал ЧИМЭЭГҮЙ БАЙХГҮЙ ----------

def test_a_failed_audit_write_shouts_on_stderr(capsys):
    """Аудит бичиж чадаагүй нь «хэн, юуг, хэзээ» гэсэн амлалт эвдэрсэн мөч.

    Урьд нь `print(...)` нь stdout руу нэг мөр бичээд өнгөрдөг байсан —
    stderr дээр traceback-тайгаа гарах нь хамгийн бага шаардлага.
    """
    class Broken:
        def add(self, _):
            raise RuntimeError("DB түгжээтэй")

        def commit(self):
            raise AssertionError("энд хүрэх ёсгүй")

        def rollback(self):
            pass

    audit_svc.log(Broken(), None, "update", "contract", 1, "туршилт")
    err = capsys.readouterr().err
    assert "БИЧИЖ ЧАДСАНГҮЙ" in err
    assert "RuntimeError" in err, "traceback stderr дээр гарах ёстой"


def test_the_detail_limit_is_wide_enough_for_a_whole_stocktake():
    assert audit_svc.DETAIL_LIMIT >= 4000
    assert audit_svc.trim("а" * 10) == "а" * 10
    long = audit_svc.trim("б" * (audit_svc.DETAIL_LIMIT + 500))
    assert len(long) == audit_svc.DETAIL_LIMIT
    assert long.endswith("…"), "тасарсан мөр ТАСАРСАНАА хэлнэ"


# ---------- Түлхүүр бүр frontend-ийн тольд байх ЁСТОЙ ----------
#
# `src/lib/audit.ts` нь `ACTIONS[r.action] ?? [r.action, …]` гэсэн ЧИМЭЭГҮЙ
# уналттай: дутуу түлхүүр алдаа өгөхгүй, зүгээр л «snooze» гэсэн түүхий
# англи үгийг Отгоо эгчийн дэлгэц дээр зурчихна. Тэр тольны жагсаалт нь
# энд ТУСГАЛАА олно — backend шинэ түлхүүр гаргамагц тест нь frontend-ийн
# дутууг хөгжүүлэлтийн үед унагаана.

#: `audit.ts` дээр АЛЬ ХЭДИЙН байгаа (BACKEND_ACTIONS).
MAPPED_ACTIONS = {
    "create", "update", "delete", "void", "stocktake", "settle_deposit",
    "rebuild", "close", "book_penalty", "cron", "agree", "unagree",
    "deactivate", "reactivate", "confirm",
}
#: `audit.ts` дээр АЛЬ ХЭДИЙН байгаа (BACKEND_ENTITIES + ENTITIES).
MAPPED_ENTITIES = {
    "contract", "contract_item", "payment", "stock", "collection_note",
    "movement", "invoice", "akt", "rate_change", "penalty_charge",
    "machine", "machine_log", "machine_invoice", "deposit_event",
    "client_entry", "note", "client_contact", "client", "material",
    "grade", "settings",
}
#: ⚠ ЭНЭ ХОЁРЫГ `audit.ts`-д НЭМЭХ ёстой (шинэ замууд).
NEW_ACTIONS = {"password", "adjust", "repair_done", "generate",
               "snooze", "unsnooze",
               # `app/auth.py`-ийн нэвтрэлтийн мөр (өөр эзэнтэй файл) — толинд
               # мөн байхгүй тул энд бүртгэв: дэлгэц дээр «login» гэж гарна.
               "login"}
NEW_ENTITIES = {"user", "stock_adjustment", "notification", "session"}


def test_no_audit_key_escapes_the_frontend_dictionary(client, as_role):
    """Бодит урсгалуудын үлдээсэн БҮХ түлхүүр толинд байна."""
    h = as_role("otgoo")
    client.put("/api/settings", headers=h, json={"values": {"ndsh_percent": "12"}})
    g = client.post("/api/grades", headers=h,
                    json={"code": "Д", "name": "Д зэрэглэл"}).json()
    client.put(f"/api/grades/{g['id']}", headers=h,
               json={"code": "Д", "name": "Дөрөв"})
    client.post("/api/auth/change-password", headers=h,
                json={"old_password": "1234", "new_password": "шинэҮг"})
    client.post("/api/invoices/generate", headers=as_role("sanhuu"))
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x["stock"])
    client.post("/api/stock/adjust", headers=as_role("darga"), json={
        "material_id": m["id"], "grade_id": m["stock"][0]["grade_id"],
        "on_hand": m["stock"][0]["on_hand"] + 2})
    client.post("/api/notifications/snooze", headers=h,
                json={"kind": "barter_stale", "days": 3})

    seen = {(r["action"], r["entity"]) for r in rows(client, h)}
    assert seen, "урсгалууд мөрөө үлдээсэнгүй"
    bad_a = {a for a, _ in seen} - MAPPED_ACTIONS - NEW_ACTIONS
    bad_e = {e for _, e in seen} - MAPPED_ENTITIES - NEW_ENTITIES
    assert not bad_a, f"тольгүй үйлдэл — дэлгэц дээр англиар гарна: {bad_a}"
    assert not bad_e, f"тольгүй биет: {bad_e}"

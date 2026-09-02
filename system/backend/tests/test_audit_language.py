"""ҮЙЛДЛИЙН БҮРТГЭЛ МОНГОЛООР ЯРИНА.

Отгоо эгч англи МЭДЭХГҮЙ. /audit нь «хэн юуг хэзээ өөрчилсөн» гэсэн ГАНЦ
хариулт тул тэнд гарсан «RETURN», «pending», «penalty_percent: 0.5 → 0.7»,
«call» гэсэн үг нь алдаа биш — ХООСОН НҮД. Мөр нь юу гэж байгааг тааж
чадахгүй бол бүхэл бүртгэл нь «миний хуудас биш» болж хувирна.

Гоожилт нь ГУРВАН давхаргатай байв:
  1. `Audit.tsx`-ийн `ACTIONS`/`ENTITIES` толь дутуу (void, close, cron,
     book_penalty, akt, rate_change, penalty_charge, machine*) — frontend тал,
     `src/lib/audit.test.ts` барина;
  2. `detail` мөрөнд DB-ийн ENUM шууд («RETURN», «pending», «call») — ЭНД;
  3. `changes_text` талбарын нэрийг түүхийгээр нь («penalty_percent») — ЭНД.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JIGUUR_NO_CRON", "1")

import pytest

from app.services import audit


#: Дэлгэрэнгүй мөрөнд ЗӨВШӨӨРӨГДӨХ латин: баримтын дугаар (R-26/07-4, OB-5).
DOC_CODE = re.compile(r"\b(?:[RSM]-[0-9A-Za-z/-]*[0-9]|OB-\d+)")


def latin_in(text: str) -> list[str]:
    """Баримтын дугаарыг хассаны дараа үлдсэн латин үгс."""
    return re.findall(r"[A-Za-z]+", DOC_CODE.sub(" ", text))


# ---------- 1. Толь өөрөө ----------

def test_every_enum_that_reaches_the_audit_line_has_a_mongolian_word():
    """Backend-ийн `detail` мөрөнд ордог БҮХ ENUM утга тольд байна.

    Жагсаалт нь дуудлагын газруудаас гарна:
      · хөдөлгөөний төрөл/төлөв   — routers/contracts.py (create/void movement)
      · төлбөр, зарлагын хэлбэр   — routers/payments.py · routers/machines.py
      · авлагын тэмдэглэл, амлалт — routers/features.py
      · гэрээний төрөл, циклийн хэлбэр — `changes_text`-ээр
    """
    reaching_audit = [
        "ISSUE", "RETURN", "WRITEOFF", "SALE",
        "pending", "done",
        "CASH", "BANK", "BARTER", "INTERNAL",
        "call", "visit", "message", "other",
        "open", "kept", "broken",
        "rent", "sale", "days", "month",
    ]
    missing = [v for v in reaching_audit if v not in audit.VALUES_MN]
    assert not missing, f"эдгээр утга /audit дээр ТҮҮХИЙ АНГЛИ болж гарна: {missing}"
    for v in reaching_audit:
        assert not latin_in(audit.VALUES_MN[v]), f"«{v}» → «{audit.VALUES_MN[v]}» латинтай"


def test_every_field_that_changes_text_can_report_has_a_mongolian_word():
    """`changes_text` нь ЗӨВХӨН эдгээр талбарыг хардаг (дуудлагын газрууд)."""
    reported = [
        # PATCH /contracts/{id}
        "penalty_percent", "deposit", "vat_percent", "note",
        "start_date", "end_date", "cycle_days", "cycle_mode",
        # PATCH /movements/{id} ба /movement-lines/{id}
        "date", "qty", "rate", "return_grade_id", "repair_qty",
        "writeoff_qty", "issue_line_id", "billed_days_override",
        # PATCH /machines/{id} ба /machine-logs/{id}
        "name", "active", "label", "client", "amount", "method",
    ]
    missing = [k for k in reported if k not in audit.FIELDS_MN]
    assert not missing, f"эдгээр талбар /audit дээр түүхийгээрээ гарна: {missing}"
    for k in reported:
        assert not latin_in(audit.FIELDS_MN[k]), f"«{k}» → «{audit.FIELDS_MN[k]}» латинтай"


def test_changes_text_translates_both_the_field_and_the_value():
    line = audit.changes_text({"cycle_mode": "days", "penalty_percent": 0.5},
                              {"cycle_mode": "month", "penalty_percent": 0.7})
    assert "циклийн хэлбэр: хоногоор → календарь сараар" in line
    assert "алдангийн хувь: 0.5 → 0.7" in line
    assert not latin_in(line)


def test_changes_text_stays_silent_when_nothing_changed():
    assert audit.changes_text({"note": "a"}, {"note": "a"}) == ""


def test_unknown_keys_fall_through_to_themselves_not_to_an_empty_cell():
    """Танихгүй түлхүүр ирвэл ХООСОН нүд үлдэхгүй — өөрөө гарна.

    Түүхий түлхүүр МУУ; хоосон нүд БҮР МУУ («энэ мөр юу байсан юм бэ?»).
    Дээрх бүрэн байдлын шалгалт нь тэр байдалд хүрэхээс сэргийлнэ.
    """
    assert audit.field_mn("шинэ_талбар") == "шинэ_талбар"
    assert audit.value_mn("ШИНЭ") == "ШИНЭ"
    assert audit.value_mn(None) == "—"


def test_the_cron_signs_its_rows_as_the_system_not_as_a_person():
    """Хүнгүй зам ч гарын үсэгтэй — /audit-ийн «Хэн» багана «—» болохгүй."""
    assert audit.SYSTEM.name == "Систем"
    assert audit.SYSTEM.id is None


# ---------- 2. Бодит урсгал — HTTP-ээр ----------

def _rent_contract(client, h) -> dict:
    mats = client.get("/api/materials", headers=h).json()
    m = next(x for x in mats if x.get("stock"))
    st = next(s for s in m["stock"] if s["on_hand"] >= 20)
    r = client.post("/api/contracts", headers=h, json={
        "client_id": 1, "type": "rent", "no": "ЛАТ-01",
        "start_date": "2026-06-01", "end_date": None,
        "cycle_days": 30, "cycle_mode": "days", "penalty_percent": 0,
        "deposit": 0, "vat_percent": 0, "note": "хэлний тест",
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 20, "daily_rate": 330, "unit_price": 0}]})
    assert r.status_code == 200, r.text
    return {**r.json(), "material_id": m["id"], "grade_id": st["grade_id"]}


def test_no_english_reaches_the_detail_column_across_the_real_flows(client, as_role):
    """Гэрээ → ачилт → буцаалт → засвар → тэмдэглэл: НЭГ Ч латин үг гарахгүй.

    Энэ бол «шинэ дуудлага нэмэхэд толь мартагдах» гэдгийн ганц бодит хамгаалалт:
    урсгал бүр өөрийн `detail` мөрөө үлдээх ба тэдгээрийг бүхэлд нь шүүнэ.
    """
    h = as_role("otgoo")
    c = _rent_contract(client, h)
    cid = c["id"]

    # гэрээний параметр засах (changes_text — талбар БА утга)
    assert client.patch(f"/api/contracts/{cid}", headers=h,
                        json={"penalty_percent": 0.7, "note": "шинэчлэв"}).status_code == 200

    # ачилт (pending) → баталгаажуулах
    detail = client.get(f"/api/contracts/{cid}", headers=h).json()
    pend = next(m for m in detail["movements"] if m["status"] == "pending")
    assert client.post(f"/api/movements/{pend['id']}/confirm", headers=h).status_code == 200

    # буцаалт үүсгэх + мөрийг нь засах
    r = client.post(f"/api/contracts/{cid}/movements", headers=h, json={
        "type": "RETURN", "date": "2026-07-01",
        "lines": [{"material_id": c["material_id"], "grade_id": c["grade_id"], "qty": 5}]})
    assert r.status_code == 200, r.text
    mv = client.get(f"/api/contracts/{cid}", headers=h).json()["movements"]
    line = next(m for m in mv if m["id"] == r.json()["id"])["lines"][0]
    assert client.patch(f"/api/movement-lines/{line['id']}", headers=h,
                        json={"repair_qty": 2, "confirm": True}).status_code == 200

    # авлагын тэмдэглэл — төрөл нь ENUM
    n = client.post("/api/clients/1/notes", headers=h, json={
        "date": "2026-07-02", "kind": "visit", "note": "уулзаж ярилцав"})
    assert n.status_code == 200, n.text
    assert client.patch(f"/api/notes/{n.json()['id']}", headers=h,
                        json={"status": "kept"}).status_code == 200

    # төлбөр — хэлбэр нь ENUM
    assert client.post("/api/payments", headers=h, json={
        "client_id": 1, "contract_id": cid, "date": "2026-07-03",
        "amount": 100000, "method": "CASH", "note": ""}).status_code == 200

    rows = client.get("/api/audit?limit=300", headers=h).json()
    assert len(rows) >= 6, "урсгалууд мөрөө үлдээсэнгүй"
    dirty = [(r["action"], r["entity"], r["detail"], latin_in(r["detail"]))
             for r in rows if latin_in(r["detail"])]
    assert not dirty, "/audit-ийн «Дэлгэрэнгүй» багана дээр англи үг:\n" + \
        "\n".join(f"  {a}/{e}: {d}  →  {w}" for a, e, d, w in dirty)

    # ХЭН нь ч хоосон биш
    assert all((r["user_name"] or "").strip() for r in rows), \
        "эзэнгүй мөр — /audit дээр «—» болж гарна"


@pytest.mark.parametrize("field,before,after,expect", [
    ("cycle_mode", "days", "month", "хоногоор → календарь сараар"),
    ("end_date", None, "2026-12-31", "— → 2026-12-31"),
    ("active", 1, 0, "идэвхтэй эсэх: 1 → 0"),
])
def test_named_changes_read_as_sentences(field, before, after, expect):
    assert expect in audit.changes_text({field: before}, {field: after})

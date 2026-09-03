"""АЛДАНГИЙГ БУЦААХ — хөшүүрэг СУЛРАХ ёстой (H1-ийн тэгш хэм · H2).

Отгоо эгч 20 жилийн Excel-дээ алданги ГАНЦ УДАА ч нэхээгүй: тэр бол утсаар
ярихад хэрэглэдэг хөшүүрэг (R25 / H2). Хөшүүрэг нь ТАТАГДААД СУЛАРДАГ байх
ёстой — андуурч нэхсэн, эсвэл нэхээд утсаар ярьж байгаад өршөөсөн нь ХЭВИЙН
тохиолдол, онцгой нь биш.

Систем дээр төлбөр, хөдөлгөөн, актын бичилт, тарифын өөрчлөлт, бартерын
хөрөнгө — БҮГД хүчингүй болдог (устгагддаггүй). Алдангийн нэхэлт л ганцаараа
буцах замгүй байв: мөнгө ҮҮСГЭДЭГ цорын ганц үйлдэл нь буцаагддаггүй.

Энэ файл тэр нүхийг барина. Гол механик нь ХАСАЛТ БИШ, ДАХИН ДЕРИВАЦИ:
явдлыг хүчингүй гэж тэмдэглээд, replay-ээс хасаад, `rebuild` дуудна —
`penalty_booked`, `penalty_booked_until`, төлбөрийн хуваарилалт бүгд
өөрсдөө зөв утгаа олно.
"""
from tests.test_api import iso, make_contract, _confirm_pending


def _invoices(client, h, cid):
    d = client.get(f"/api/contracts/{cid}", headers=h).json()
    return sorted(d["invoices"], key=lambda i: i["due_date"])


def _detail(client, h, cid):
    return client.get(f"/api/contracts/{cid}", headers=h).json()


def _overdue(client, as_role, days_ago=40, qty=100):
    """40 хоногийн өмнөх гэрээ → 10 хоног хэтэрсэн 990,000₮-ийн нэхэмжлэл."""
    h = as_role("sanhuu")
    cl_id, cid, m, st = make_contract(client, as_role, days_ago=days_ago, qty=qty)
    _confirm_pending(client, as_role, cid)
    inv = _invoices(client, h, cid)[0]
    assert inv["total"] == 990_000 and inv["outstanding"] == 990_000
    return h, cl_id, cid


def _charge(client, h, cid, as_of=None):
    r = client.post(f"/api/contracts/{cid}/book-penalty", headers=h,
                    json={"as_of": as_of or iso(0)})
    assert r.status_code == 200, r.text
    return r.json()


def _charges(client, h, cid):
    return _detail(client, h, cid)["penalty_charges"]


def _void(client, h, chid, reason="Утсаар ярьж өршөөв", confirm=False):
    body = {"reason": reason}
    if confirm:
        body["confirm"] = True
    return client.post(f"/api/penalty-charges/{chid}/void", headers=h, json=body)


# ---------- 1. Явдал ХАРАГДАНА (бичигдээд хэзээ ч үзүүлээгүй байв) ----------

def test_contract_detail_lists_the_charge_history(client, as_role):
    """Нэхсэн шийдвэр бүр гэрээний хуудсанд мөр болж гарна.

    Урьд нь `PenaltyCharge` нь БИЧИГДЭЭД ХЭЗЭЭ Ч ХАРАГДДАГГҮЙ байв —
    «гаргасан шийдвэрүүдийнх нь жагсаалт бичигдээд үзүүлэгддэггүй».
    """
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)

    rows = _charges(client, h, cid)
    assert len(rows) == 1
    ch = rows[0]
    assert ch["contract_id"] == cid
    assert ch["as_of"] == iso(0)
    assert ch["amount"] == 49_500
    assert ch["user_name"] == "Санхүүч"
    assert ch["voided"] is False
    assert ch["void_reason"] == "" and ch["voided_by"] == ""
    assert ch["created_at"] and ch["id"] > 0


# ---------- 2. Хүчингүй болгох = ДАХИН ДЕРИВАЦИ ----------

def test_void_returns_penalty_booked_to_its_pre_charge_value(client, as_role):
    """Нэхээд → хэсэгчлэн төлүүлээд → хүчингүй болгоход БҮГД буцна.

    Бодит тоо:
      · нэхэмжлэл 990,000₮, 10 хоног хэтэрсэн, 0.5%/хоног
      · нэхэлт   → 990,000 × 0.5% × 10 = 49,500₮ НЭХЭГДЭНЭ
      · 1,000,000₮ төлбөр → 990,000 үндсэн + 10,000 алданги (үлдэгдэл 39,500)
      · ХҮЧИНГҮЙ → нэхэлт алга, 1,000,000-ы 990,000 нь ҮНДСЭН дүнд, үлдсэн
        10,000₮ нь АЛДАНГИД БИШ, кредит болж суларна.
    """
    h, cl_id, cid = _overdue(client, as_role)
    before = _detail(client, h, cid)["penalty_booked"]
    assert before == 0

    _charge(client, h, cid)
    assert _invoices(client, h, cid)[0]["penalty_due"] == 49_500

    pay = client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 1_000_000, "method": "BANK"})
    assert pay.status_code == 200, pay.text
    assert pay.json()["allocated"] == 1_000_000

    mid = _invoices(client, h, cid)[0]
    assert mid["outstanding"] == 0 and mid["penalty_due"] == 39_500
    assert mid["status"] == "penalty"

    chid = _charges(client, h, cid)[0]["id"]
    r = _void(client, h, chid, confirm=True)
    assert r.status_code == 200, r.text

    after = _invoices(client, h, cid)[0]
    assert after["penalty_due"] == 0, "нэхэлт буцав — нэхэгдсэн алданги алга"
    assert after["total"] == 990_000 and after["paid"] == 990_000
    assert after["outstanding"] == 0
    assert after["status"] == "paid"
    assert _detail(client, h, cid)["penalty_booked"] == before

    d = _detail(client, h, cid)
    p = d["payments"][0]
    assert [(a["part"], a["amount"]) for a in p["allocations"]] == [("principal", 990_000)], \
        "алдангид явсан 10,000₮ суларч, зөвхөн ҮНДСЭН дүн хаагдана"
    assert d["penalty_charges"][0]["voided"] is True
    assert d["penalty_charges"][0]["void_reason"] == "Утсаар ярьж өршөөв"
    assert d["penalty_charges"][0]["voided_by"] == "Санхүүч"


def test_freed_money_reflows_to_a_later_invoice(client, as_role):
    """Сулларсан мөнгө алга болохгүй — ДАРААГИЙН нэхэмжлэл рүү өөрөө очно."""
    h, cl_id, cid = _overdue(client, as_role, days_ago=70)
    invs = _invoices(client, h, cid)
    assert len(invs) >= 2, "70 хоногт хоёр цикл нэхэгдэнэ"
    _charge(client, h, cid)
    booked = _detail(client, h, cid)["penalty_booked"]
    assert booked > 0

    # Эхний нэхэмжлэлийн үндсэн дүн + бүх нэхэгдсэн алданги
    amount = invs[0]["total"] + booked
    client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": amount, "method": "BANK"})
    assert _invoices(client, h, cid)[0]["penalty_due"] == 0

    chid = _charges(client, h, cid)[0]["id"]
    assert _void(client, h, chid, confirm=True).status_code == 200

    after = _invoices(client, h, cid)
    assert sum(i["penalty_due"] for i in after) == 0
    assert after[0]["outstanding"] == 0
    # Алдангид явсан мөнгө суларч, ХОЁР ДАХЬ циклийг барьж эхэлнэ
    assert after[1]["paid"] == booked
    assert after[1]["outstanding"] == after[1]["total"] - booked


# ---------- 3. Хаалга (gate): эхлээд ЗӨРҮҮ, дараа нь бичилт ----------

def test_void_is_gated_and_the_dry_run_writes_nothing(client, as_role):
    """Баталгаажуулаагүй дуудлага нь ЗӨРҮҮ буцаана, DB-д юу ч бичихгүй."""
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    chid = _charges(client, h, cid)[0]["id"]

    r = _void(client, h, chid)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rebuild_required"] is True
    assert isinstance(body["diffs"], list) and body["diffs"], "циклийн зөрүү гарах ёстой"
    assert "warnings" in body

    # ХУУРАЙ: нэхэлт нь ХЭВЭЭР, мөр нь хүчинтэй хэвээр
    assert _invoices(client, h, cid)[0]["penalty_due"] == 49_500
    assert _charges(client, h, cid)[0]["voided"] is False

    r = _void(client, h, chid, confirm=True)
    assert r.status_code == 200, r.text
    assert r.json()["voided"] is True
    assert _invoices(client, h, cid)[0]["penalty_due"] == 0


# ---------- 4. Хамгаалалтууд ----------

def test_blank_reason_is_400(client, as_role):
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    chid = _charges(client, h, cid)[0]["id"]
    r = _void(client, h, chid, reason="   ", confirm=True)
    assert r.status_code == 400
    assert "шалтгаан" in r.json()["detail"]
    assert _charges(client, h, cid)[0]["voided"] is False


def test_double_void_is_409(client, as_role):
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    chid = _charges(client, h, cid)[0]["id"]
    assert _void(client, h, chid, confirm=True).status_code == 200
    r = _void(client, h, chid, reason="дахин", confirm=True)
    assert r.status_code == 409


def test_missing_charge_is_404(client, as_role):
    h, cl_id, cid = _overdue(client, as_role)
    assert _void(client, h, 9_999, confirm=True).status_code == 404


def test_manager_may_void_and_it_is_audited(client, as_role):
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    chid = _charges(client, h, cid)[0]["id"]
    otgoo = as_role("otgoo")
    assert _void(client, otgoo, chid, reason="Андуурч нэхсэн",
                 confirm=True).status_code == 200

    logs = client.get("/api/audit", headers=otgoo).json()
    rows = logs["rows"] if isinstance(logs, dict) else logs
    hit = [a for a in rows if a["action"] == "void" and a["entity"] == "penalty_charge"]
    assert hit and hit[0]["entity_id"] == chid
    assert "Андуурч нэхсэн" in hit[0]["detail"]


def test_factory_may_not_void_but_reads_the_charges(client, as_role):
    """Дарга нэхэлтийг УНШИНА — цуцлахгүй.

    ⚠ Урьд нь энэ тест «даргын токен руу огт явахгүй» гэдгийг барьдаг байв.
    Эзний шийдвэрээр (2026-09) хана унав: «хэдэн төгрөгийн алданги нэхэгдсэн
    бэ» гэдэг нь тэр хариулах ёстой асуулт. ЦУЦЛАХ нь мөнгөний засвар тул
    403 ХЭВЭЭР — уншиж чадах бүхнээ хөдөлгөж чадна гэсэн үг биш.
    """
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    chid = _charges(client, h, cid)[0]["id"]
    darga = as_role("darga")

    assert _void(client, darga, chid, confirm=True).status_code == 403
    d = _detail(client, darga, cid)
    assert "penalty_charges" in d, "даргад алдангийн нэхэлтийн түүх ирсэнгүй"
    assert 49_500.0 in _numbers(d), "нэхэгдсэн алдангийн тоо даргад ирсэнгүй"
    assert [c["id"] for c in d["penalty_charges"]] == [c["id"] for c in _charges(client, h, cid)]


def _numbers(x) -> set:
    out = set()
    if isinstance(x, dict):
        for v in x.values():
            out |= _numbers(v)
    elif isinstance(x, list):
        for v in x:
            out |= _numbers(v)
    elif isinstance(x, (int, float)) and not isinstance(x, bool):
        out.add(float(x))
    return out


# ---------- 5. Replay: хүчингүй нэхэлт ДАХИН АМИЛАХГҮЙ ----------

def test_rebuild_after_void_never_resurrects_the_charge(client, as_role):
    """Цуцалсны дараах ямар ч засвар нэхэлтийг буцааж авчрахгүй.

    Хамгийн аюултай алдаа нь энэ байх байсан: rebuild нь ЯВДЛААР replay
    хийдэг тул хүчингүй явдлыг шүүхгүй бол огт хамаагүй засвар хийх бүрд
    цуцалсан алданги ӨӨРӨӨ амилна — «машин түүхийг дахин бичлээ».
    """
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    chid = _charges(client, h, cid)[0]["id"]
    assert _void(client, h, chid, confirm=True).status_code == 200
    assert _invoices(client, h, cid)[0]["penalty_due"] == 0

    # Огт хамаагүй засвар — гэрээний тэмдэглэл нь rebuild хийдэггүй тул
    # ЖИНХЭНЭ дахин бодолт: актын бичилт нэмээд буцаана.
    otgoo = as_role("otgoo")
    r = client.post(f"/api/contracts/{cid}/akt", headers=otgoo,
                    json={"date": iso(0), "amount": 50_000, "note": "Кран дуудлага"})
    assert r.status_code == 200, r.text
    if r.json().get("rebuild_required"):
        r = client.post(f"/api/contracts/{cid}/akt", headers=otgoo,
                        json={"date": iso(0), "amount": 50_000,
                              "note": "Кран дуудлага", "confirm": True})
        assert r.status_code == 200, r.text

    assert _invoices(client, h, cid)[0]["penalty_due"] == 0, \
        "цуцалсан нэхэлт дахин бодолтоор амилжээ"


def test_two_consecutive_rebuilds_are_identical_after_a_void(client, as_role):
    """Цуцалсны дараа дахин бодолт нь ТОГТМОЛ — хоёр удаа гүйлгэхэд ижил."""
    from app.services import rebuild as rebuild_svc
    from app import models

    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    client.post("/api/payments", headers=h, json={
        "client_id": cl_id, "contract_id": cid, "date": iso(0),
        "amount": 1_000_000, "method": "BANK"})
    chid = _charges(client, h, cid)[0]["id"]
    assert _void(client, h, chid, confirm=True).status_code == 200

    from app.db import get_db
    from app.main import app
    db = next(app.dependency_overrides[get_db]())
    try:
        c = db.get(models.Contract, cid)
        first = rebuild_svc.rebuild_contract_invoices(db, c)
        snap1 = _snapshot(db, models, cid)
        second = rebuild_svc.rebuild_contract_invoices(db, c)
        snap2 = _snapshot(db, models, cid)
        assert first["diffs"] == second["diffs"], "дахин бодолт нь тогтмол биш"
        assert snap1 == snap2
        for row in first["diffs"]:
            assert row["old_total"] == row["new_total"] and row["paid_delta"] == 0, \
                "цуцалсны дараах дахин бодолт юуг ч хөдөлгөх ёсгүй"
        assert all(row[3] == 0 for row in snap1), "нэхэгдсэн алданги 0 хэвээр"
    finally:
        db.close()


def _snapshot(db, models, cid):
    db.expire_all()
    rows = (db.query(models.Invoice).filter_by(contract_id=cid)
            .order_by(models.Invoice.due_date, models.Invoice.no).all())
    return [(i.no, round(i.total, 2), round(i.paid, 2), round(i.penalty_booked or 0, 2),
             str(i.penalty_booked_until), i.status) for i in rows]


def test_voiding_the_later_charge_leaves_the_earlier_one_standing(client, as_role):
    """Хоёр нэхэлтээс СҮҮЛИЙНХИЙГ нь цуцлахад ЭХНИЙХ нь хэвээр үлдэнэ.

    · 5 хоногийн өмнөх огноогоор нэхэв → 990,000 × 0.5% × 5 = 24,750₮
    · өнөөдрийн огноогоор нэхэв       → дахин 5 хоног = 24,750₮ (нийт 49,500₮)
    · сүүлийнхийг нь ХҮЧИНГҮЙ         → 24,750₮ л үлдэнэ.
    """
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid, as_of=iso(5))
    _charge(client, h, cid, as_of=iso(0))
    assert _invoices(client, h, cid)[0]["penalty_due"] == 49_500

    rows = _charges(client, h, cid)
    assert len(rows) == 2
    later = max(rows, key=lambda r: r["as_of"])
    assert _void(client, h, later["id"], confirm=True).status_code == 200

    assert _invoices(client, h, cid)[0]["penalty_due"] == 24_750
    live = [r for r in _charges(client, h, cid) if not r["voided"]]
    assert [r["as_of"] for r in live] == [iso(5)]


def test_voiding_the_earlier_charge_keeps_the_surviving_frontier(client, as_role):
    """ЭХНИЙХИЙГ нь цуцлахад дүн БУУРАХГҮЙ — мөр нь ТҮЛХЭЦ, хөлдсөн дүн БИШ.

    Нэхэлт нь `as_of` огноог л хадгалдаг тул амьд үлдсэн сүүлчийн нэхэлт
    (өнөөдөр) нь ЦЭВЭР нэхэмжлэл дээр хугацаа хэтэрснээс хойших БҮХ 10
    хоногийг дахин нэхнэ: 990,000 × 0.5% × 10 = 49,500₮ хэвээр. Тиймээс
    цуцлалт нь ТООГ ТААМАГЛАХГҮЙ — RebuildModal жинхэнэ зөрүүг харуулна.
    """
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid, as_of=iso(5))
    _charge(client, h, cid, as_of=iso(0))
    rows = _charges(client, h, cid)
    earlier = min(rows, key=lambda r: r["as_of"])
    assert _void(client, h, earlier["id"], confirm=True).status_code == 200
    assert _invoices(client, h, cid)[0]["penalty_due"] == 49_500


def test_voided_charge_is_excluded_from_the_penalty_report(client, as_role):
    """Тайлангийн «нэхэгдсэн алданги» мөрөнд хүчингүй нэхэлт орохгүй."""
    h, cl_id, cid = _overdue(client, as_role)
    _charge(client, h, cid)
    otgoo = as_role("otgoo")

    def booked():
        rep = client.get(f"/api/reports?d_from={iso(60)}&d_to={iso(0)}", headers=otgoo)
        assert rep.status_code == 200, rep.text
        return rep.json()["pnl"]["detail"]["penalty_booked"]

    assert any(r["amount"] == 49_500 for r in booked()["rows"])

    chid = _charges(client, h, cid)[0]["id"]
    assert _void(client, h, chid, confirm=True).status_code == 200
    assert not any(r["amount"] == 49_500 for r in booked()["rows"])

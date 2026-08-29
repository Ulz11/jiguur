"""Материалын дэлгэрэнгүй — «энэ хэв ХААНА байна вэ?» гэсэн ганц хуудас.

Отгоо агуулахаас нэг материал дараад: агуулахад хэд, гадаа хэд, гадаа байгаа
нь ХЭНД (харилцагч, гэрээ, зэрэглэл, тариф, хэзээнээс) байгааг нэг дэлгэцээс
уншина. Дарга ч мөн адил — агуулах бол түүний талбай.

ХАМГААЛАХ ЁСТОЙ ТЭНЦЭЛ:
  · Гэрээ бүрийн «гадаа» тоо = `billing.lot_qty_on`-ийн падангийн үлдэгдэл,
    өөрөөр хэлбэл гэрээний дэлгэрэнгүйн материалын мөртэй ЯГ таарна.
  · Зэрэглэл бүрээр: агуулахад + гадаа + засварт = нийт эзэмшил (АКТАЛСАН нь
    хуваалтаас ГАДНА — компанийнх байхаа больсон). Энэ хуваалт нь тайлангийн
    `owned`-той ЯГ таарна: нэг тоог хоёр хуудас өөрөөр хэлэх ёсгүй.
  · Зэрэглэл бүрийн «гадаа» = нөөцийн хүснэгтийн `on_rent` (хоёр өөр замаар
    бодогдсон нэг тоо зөрвөл аль нэг нь худал).
  · Худалдсан бараа ГАДАА БИШ (буцаж ирэхгүй) — `contract_row.qty_out`-ийн
    дүрэмтэй ижил.
  · Баталгаажаагүй (pending) ачилт үлдэгдэл хөдөлгөхгүй ч ХАРАГДАНА.
"""
from datetime import date, timedelta

import pytest


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def _mat(client, headers, name: str = "Хэв хашмал 6012") -> dict:
    return next(m for m in client.get("/api/materials", headers=headers).json()
                if m["name"] == name)


def _detail(client, headers, mid: int) -> dict:
    r = client.get(f"/api/materials/{mid}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _by_no(d: dict) -> dict:
    return {(h["contract_no"], h["grade"]): h for h in d["holdings"]}


# ---------- Хуваарилалт: аль гэрээнд хэд байна ----------

def test_holdings_split_the_material_across_every_contract(client, as_role):
    """Нэг материал 3 гэрээнд гадаа байна — гурвуулаа мөрөө авна."""
    h = as_role("otgoo")
    d = _detail(client, h, _mat(client, h)["id"])
    rows = _by_no(d)
    # Алтан Гадас: 2131 гарч, 306 + 400 буцсан → 1425 (А)
    assert rows[("24/03", "А")]["qty"] == pytest.approx(1425)
    assert rows[("24/03", "А")]["client"] == "Алтан Гадас Констракшн"
    # Хөх Толгой: 1200 (А), Идэр Зам: 1100 (В)
    assert rows[("26/11", "А")]["qty"] == pytest.approx(1200)
    assert rows[("26/07", "В")]["qty"] == pytest.approx(1100)


def test_holding_qty_matches_the_contract_page_for_the_same_material(client, as_role):
    """Гэрээний дэлгэрэнгүй дээрх тоо ↔ материалын хуудсан дээрх тоо — ЯГ нэг.

    Хоёр дэлгэц дээр нэг гэрээний нэг материал өөр өөр тоо харуулбал аль нь ч
    итгэл хүлээхгүй.
    """
    h = as_role("otgoo")
    m = _mat(client, h)
    d = _detail(client, h, m["id"])
    for hold in d["holdings"]:
        c = client.get(f"/api/contracts/{hold['contract_id']}", headers=h).json()
        on_contract = sum(it["qty"] for it in c["items"]
                          if it["material_id"] == m["id"] and it["grade_id"] == hold["grade_id"])
        assert hold["qty"] == pytest.approx(on_contract), hold["contract_no"]


def test_holdings_carry_client_contract_rate_and_held_since(client, as_role):
    """Мөр бүр ХЭН, ЯМАР гэрээ, ЯМАР тариф, ХЭЗЭЭНЭЭС гэдгээ авч явна."""
    h = as_role("otgoo")
    d = _detail(client, h, _mat(client, h)["id"])
    row = _by_no(d)[("24/03", "А")]
    assert row["client_id"] > 0 and row["contract_id"] > 0
    assert row["rates"] == [330]                 # падангийн тариф — гэрээнийхтэй ижил
    assert row["since"] == iso(155)              # эхний нээлттэй падангийн огноо
    assert row["days"] == 155
    # Идэр Замын гэрээ 300₮-ийн тарифтай — тариф гэрээ БҮРИЙНХ, каталогийнх биш
    assert _by_no(d)[("26/07", "В")]["rates"] == [300]


def test_sold_goods_are_not_out(client, as_role):
    """Худалдсан бараа «гадаа» биш — буцаж ирэхгүй (26/06 нь худалдаа)."""
    h = as_role("otgoo")
    d = _detail(client, h, _mat(client, h)["id"])
    assert all(hold["contract_no"] != "26/06" for hold in d["holdings"])


def test_pending_shipment_is_not_out_but_is_visible_in_movements(client, as_role):
    """Баталгаажаагүй ачилт үлдэгдэлд ОРОХГҮЙ ч түүхэнд ХАРАГДАНА."""
    h = as_role("otgoo")
    d = _detail(client, h, _mat(client, h)["id"])
    assert all(hold["contract_no"] != "26/14" for hold in d["holdings"])
    pend = [mv for mv in d["movements"] if mv["contract_no"] == "26/14"]
    assert pend, "хүлээгдэж буй ачилт түүхээс алга болох ёсгүй"
    assert pend[0]["counted"] is False
    assert pend[0]["status"] == "pending"


# ---------- Тэнцэл ----------

def test_owned_partitions_into_on_hand_out_and_in_repair(client, as_role):
    """Зэрэглэл бүрээр: агуулахад + түрээсэнд + засварт = нийт эзэмшил.

    Засварт байгаа бараа КОМПАНИЙНХ хэвээр — зүгээр л түр ашиглагдахгүй байна.
    Түүнийг «нийт эзэмшил»-ээс гаргавал эзэмшил хаашаа ч хамаарахгүй алга
    болно (хуваалт бүтэн байхаа болино). Акталсан нь ХАРИН ГАДНА: тэр бараа
    компанийнх байхаа больсон тул хуваалтад ордоггүй, зөвхөн харагдана."""
    h = as_role("otgoo")
    d = _detail(client, h, _mat(client, h)["id"])
    out_by_grade: dict[int, float] = {}
    for hold in d["holdings"]:
        out_by_grade[hold["grade_id"]] = out_by_grade.get(hold["grade_id"], 0.0) + hold["qty"]
    assert d["grades"], "зэрэглэлийн мөр хоосон байж болохгүй"
    for g in d["grades"]:
        assert g["out"] == pytest.approx(out_by_grade.get(g["grade_id"], 0.0))
        assert g["total"] == pytest.approx(g["on_hand"] + g["out"] + g["in_repair"])
    t = d["totals"]
    assert t["on_hand"] == pytest.approx(sum(g["on_hand"] for g in d["grades"]))
    assert t["out"] == pytest.approx(sum(g["out"] for g in d["grades"]))
    assert t["in_repair"] == pytest.approx(sum(g["in_repair"] for g in d["grades"]))
    assert t["total"] == pytest.approx(t["on_hand"] + t["out"] + t["in_repair"])
    assert t["in_repair"] > 0, "seed-д засварт байгаа бараа байх ёстой — эс бөгөөс энэ тест хоосон"


def test_total_agrees_with_the_materials_report(client, as_role):
    """ХОЁР ГАДАРГУУ НЭГ ТООГ ХЭЛНЭ.

    Тайлангийн `owned` нь агуулахад+түрээсэнд+засварт гэж боддог байхад
    материалын дэлгэрэнгүйн `total` нь засвартыг орхиж байв: нэг материал
    хуудас солиход 8,310 ба 8,340 гэсэн хоёр өөр «нийт эзэмшил» харуулдаг.
    Аль нэгийг нь итгэвэл нөгөө нь худал болно."""
    h = as_role("otgoo")
    m = _mat(client, h)
    d = _detail(client, h, m["id"])
    rows = client.get("/api/reports/materials", headers=h).json()["rows"]
    rep = next(r for r in rows if r["material_id"] == m["id"])
    assert d["totals"]["total"] == pytest.approx(rep["owned"], abs=1)


def test_out_matches_the_stock_tables_on_rent(client, as_role):
    """Падангийн алхалтаар бодсон «гадаа» ↔ нөөцийн хүснэгтийн «түрээсэнд»."""
    h = as_role("otgoo")
    m = _mat(client, h)
    d = _detail(client, h, m["id"])
    stock = next(r for r in client.get("/api/stock", headers=h).json()["rows"] if r["id"] == m["id"])
    on_rent = {s["grade_id"]: s["on_rent"] for s in stock["stock"]}
    on_hand = {s["grade_id"]: s["on_hand"] for s in stock["stock"]}
    for g in d["grades"]:
        assert g["out"] == pytest.approx(on_rent.get(g["grade_id"], 0.0)), g["grade"]
        assert g["on_hand"] == pytest.approx(on_hand.get(g["grade_id"], 0.0)), g["grade"]


def test_balance_holds_after_a_return(client, as_role):
    """Буцаалт бүртгэсний дараа ч агуулахад + гадаа = нийт эзэмшил хэвээр."""
    h = as_role("otgoo")
    m = _mat(client, h)
    before = _detail(client, h, m["id"])
    row = _by_no(before)[("24/03", "А")]
    gid = row["grade_id"]
    r = client.post("/api/contracts/1/movements", headers=h, json={
        "type": "RETURN", "date": iso(0), "note": "тэнцлийн тест",
        "lines": [{"material_id": m["id"], "grade_id": gid, "qty": 25,
                   "return_grade_id": gid}]})
    assert r.status_code == 200, r.text

    after = _detail(client, h, m["id"])
    assert _by_no(after)[("24/03", "А")]["qty"] == pytest.approx(row["qty"] - 25)
    g_after = next(g for g in after["grades"] if g["grade_id"] == gid)
    assert g_after["total"] == pytest.approx(
        g_after["on_hand"] + g_after["out"] + g_after["in_repair"])
    # Буцсан бараа агуулахад орсон — нийт эзэмшил хөдлөөгүй
    g_before = next(g for g in before["grades"] if g["grade_id"] == gid)
    assert g_after["total"] == pytest.approx(g_before["total"])


# ---------- Сүүлийн хөдөлгөөн ----------

def test_movements_are_newest_first_and_signed(client, as_role):
    """Шинэ нь дээрээ; олголт ✚, буцаалт/акт − тэмдэгтэй."""
    h = as_role("otgoo")
    d = _detail(client, h, _mat(client, h)["id"])
    dates = [mv["date"] for mv in d["movements"]]
    assert dates == sorted(dates, reverse=True)
    for mv in d["movements"]:
        assert mv["delta"] == pytest.approx(mv["qty"] if mv["type"] == "ISSUE" else -mv["qty"])
        assert mv["contract_no"] and mv["client"] and mv["grade"]


def test_movements_are_capped_at_twenty_but_report_the_full_count(client, as_role):
    """Сүүлийн ~20 мөр — гэхдээ хэдээс нь гарсныг ХЭЛНЭ (тасарсан гэдэг нь мэдэгдэнэ)."""
    h = as_role("otgoo")
    m = _mat(client, h)
    grade_id = next(s["grade_id"] for s in m["stock"] if s["grade"] == "А")
    total_before = _detail(client, h, m["id"])["movements_total"]
    for i in range(20):
        r = client.post("/api/contracts/1/movements", headers=h, json={
            "type": "ISSUE", "date": iso(i), "note": f"хязгаарын тест {i}",
            "lines": [{"material_id": m["id"], "grade_id": grade_id, "qty": 5}]})
        assert r.status_code == 200, r.text

    d = _detail(client, h, m["id"])
    assert d["movements_total"] == total_before + 20
    assert len(d["movements"]) == 20
    dates = [mv["date"] for mv in d["movements"]]
    assert dates == sorted(dates, reverse=True)
    assert dates[0] == iso(0)


# ---------- Хоосон / байхгүй ----------

def test_missing_material_404(client, as_role):
    h = as_role("otgoo")
    assert client.get("/api/materials/999999", headers=h).status_code == 404


def test_untouched_material_returns_empty_distribution(client, as_role):
    """Хэзээ ч гараагүй материал — хоосон жагсаалт, 200 (алдаа биш)."""
    h = as_role("otgoo")
    m = _mat(client, h, "Тулаас В6")     # seed дээр нөөцгүй, гэрээнд ороогүй
    d = _detail(client, h, m["id"])
    assert d["holdings"] == [] and d["movements"] == []
    assert d["totals"]["out"] == 0


# ---------- Эрх ----------

def test_factory_sees_the_material_page_with_rates(client, as_role):
    """Агуулах бол даргын талбай — хуудас нээгдэж, тариф нь мөрөн дээрээ байна.

    Гэрээний дэлгэрэнгүйн материалын хүснэгт даргад тарифаа ХАРУУЛДАГ
    (ContractDetail-ийн `seesMoney` нь нэхэмжлэл/төлбөр/барьцааг л нуудаг) —
    энэ хуудас ЯГ тэр журмыг барина.
    """
    d = _detail(client, as_role("darga"), _mat(client, as_role("darga"))["id"])
    assert d["holdings"][0]["rates"]
    assert d["base_rate"] == 330


def test_login_required(client):
    assert client.get("/api/materials/1").status_code == 401

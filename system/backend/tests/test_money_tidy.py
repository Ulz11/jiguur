"""Мөнгө ба ҮЙЛДВЭРИЙН ДАРГА — хана биш, ЭМХ ЦЭГЦ.

⚠ ЭНЭ ФАЙЛ УРЬД НЬ ЭСРЭГИЙГ БАРЬДАГ БАЙВ (`test_money_wall.py`): даргын
хариунаас мөнгөний талбар бүр ХАСАГДСАН эсэхийг шалгадаг байсан.

ЭЗЭН 2026-09-д дүрмээ ЭРГҮҮЛЭВ: «энэ бол нууцлалын асуудал БИШ, ЭМХ
ЦЭГЦНИЙХ. Тэр санхүүгийн талаар асуухад хариулж чаддаг байх ЁСТОЙ — зүгээр
цэгцтэй байг.» Хана нь ЯГ ТҮҮНИЙГ болиулж байв: асуулт ирэхэд дарга
хариулах ЮМГҮЙ (`serializers.factory_contract_detail` талбарыг бүрмөсөн
хасдаг байсан тул дэлгэц дээр ч, DevTools дээр ч тоо алга).

Тиймээс ХОЁР ТУСДАА асуулт болж салав:

  · ХАРАГДАЦ (эмх цэгц) — frontend-ийнх. Даргын дэлгэц дээр мөнгө нь
    ажлынх нь агуулгын ХОЙНО, НЭГ хэлбэрийн, ХУМИГДСАН «Санхүү» задаргаа
    дотор зогсоно (`ui.tsx` `FinanceDisclosure`).
    Тэр талыг `tests/e2e/money/money-tidy.spec.ts` барина.

  · ЭРХ (юу ХӨДӨЛГӨЖ болох) — серверийнх, ХЭВЭЭР. Дарга мөнгө ХӨДӨЛГӨХГҮЙ:
    төлбөр, алданги, акт, тариф, хаалт бүгд 403.

Энэ файл серверийн ХОЁУЛАНГ нь барина: хариу нь БҮТЭН (тэр хариулж чадна)
БА эрх нь ХААЛТТАЙ (тэр хөдөлгөж чадахгүй).
"""
from datetime import date, timedelta

import pytest


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))

# Хэв хашмалын тариф 330, тулаас 110, труба 220 ₮/ш/хоног (seed, гэрээ №24/03).
RENT_RATES = {330, 110, 220}
SALE_PRICES = {58_000, 76_000}          # гэрээ №26/06 — худалдааны нэгж үнэ

RENT_CID, SALE_CID = 1, 5

# Гэрээний ТОЛГОЙ дээрх мөнгө
MONEY_TOP = ["balance", "penalty", "penalty_percent", "day_amount", "deposit",
             "deposit_status", "deposit_applied", "deposit_returned",
             "deposit_settled_date", "vat_percent"]
# Бүхэл бүлгээрээ санхүүгийнх
MONEY_BLOCKS = ["invoices", "payments"]
# Материалын мөр — тариф/нэгж үнэ/өдрийн дүн ба каталогийн үнэ
MONEY_ITEM = ["daily_rate", "unit_price", "day_amount", "repair_fee", "writeoff_price"]
# Хөдөлгөөний мөр — падангийн тариф, засвар/актын ДҮН
MONEY_LINE = ["rate", "repair_fee", "writeoff_fee"]
# Одоогийн циклийн хуримтлал
MONEY_CYCLE = ["accrued", "day_amount"]

FIN_ROLES = ("otgoo", "sanhuu")


def numbers(x) -> set:
    """JSON-ий БҮХ гүнээс тоон утга цуглуулна — талбарын нэрнээс үл хамааран."""
    out = set()
    if isinstance(x, dict):
        for v in x.values():
            out |= numbers(v)
    elif isinstance(x, list):
        for v in x:
            out |= numbers(v)
    elif isinstance(x, (int, float)) and not isinstance(x, bool):
        out.add(float(x))
    return out


def detail(client, h, cid=RENT_CID):
    r = client.get(f"/api/contracts/{cid}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- 1. Дарга АСУУЛТАД ХАРИУЛЖ ЧАДНА — хариу нь БҮТЭН ----------

def test_factory_contract_detail_carries_every_money_key(client, as_role):
    """Мөнгөний талбар бүр даргын хариунд БАЙНА.

    Урьдах хувилбар нь ЭНЭ ЖАГСААЛТААР «байхгүй»-г батaлдаг байв. Одоо ижил
    жагсаалт эсрэг талдаа ажиллана: түүнээс «энэ гэрээ хэдэн төгрөгтэй вэ»
    гэж асуухад тэр хариулах ёстой тул тоо нь хариунд ЗААВАЛ байна.
    """
    d = detail(client, as_role("darga"))
    for k in MONEY_TOP + MONEY_BLOCKS:
        assert k in d, f"даргад «{k}» ирсэнгүй — асуухад хариулах юмгүй болно"
    for it in d["items"]:
        for k in MONEY_ITEM:
            assert k in it, f"материалын мөрөнд «{k}» ирсэнгүй"
    for g in d["material_lines"]:
        for ln in g["lines"]:
            for k in MONEY_LINE:
                assert k in ln, f"дэвтрийн мөрөнд «{k}» ирсэнгүй"
    for mv in d["movements"]:
        for ln in mv["lines"]:
            for k in MONEY_LINE:
                assert k in ln, f"хөдөлгөөний мөрөнд «{k}» ирсэнгүй"
    if d.get("cycle"):
        for k in MONEY_CYCLE:
            assert k in d["cycle"], f"циклд «{k}» ирсэнгүй"


def test_factory_contract_detail_is_byte_for_byte_the_managers(client, as_role):
    """Даргын хариу нь менежерийнхтэй ЯГ ижил — рольд хамаарах салаа алга.

    Талбар нэрлээд шалгах нь дараагийн шинэ талбарыг барихгүй. Бүтэн хариуг
    тулгавал «шинэ мөнгөний талбар нэмэгдээд даргад ирсэнгүй» гэдэг ЧИМЭЭГҮЙ
    ялгаа ч энд унана.
    """
    for cid in (RENT_CID, SALE_CID):
        assert detail(client, as_role("darga"), cid) == detail(client, as_role("otgoo"), cid)


def test_factory_contract_detail_carries_the_tariff_numbers(client, as_role):
    """Талбарын нэрээр биш — УТГААР нь: 330/110/220 даргын хариунд БАЙНА.

    (Урьд нь ЭНЭ ГУРВАН ТОО «хаана ч байхгүй» гэдгийг баталдаг байв.)
    """
    darga = detail(client, as_role("darga"))
    otgoo = detail(client, as_role("otgoo"))
    assert RENT_RATES <= numbers(otgoo), "тестийн суурь буруу — менежерт тариф алга"
    assert RENT_RATES <= numbers(darga), "даргын хариунд тарифын тоо ирсэнгүй"


def test_factory_sale_contract_detail_carries_the_unit_price(client, as_role):
    """Худалдааны нэгж үнэ ч ирнэ — түрээсийн тарифтай ижил дүрэм."""
    darga = detail(client, as_role("darga"), SALE_CID)
    otgoo = detail(client, as_role("otgoo"), SALE_CID)
    assert SALE_PRICES <= numbers(otgoo), "тестийн суурь буруу — менежерт үнэ алга"
    assert SALE_PRICES <= numbers(darga), "даргын хариунд нэгж үнэ ирсэнгүй"
    assert all("unit_price" in it for it in darga["items"])


# ---------- 2. Даргын АЖЛЫН тоо — хэвээр (энэ хэсэг ХӨНДӨГДӨӨГҮЙ) ----------

def test_factory_keeps_quantities_grades_dates_and_ledger(client, as_role):
    """Тоолох, зэрэглэл тогтоох, хэзээ юу хөдөлснийг унших — бүгд хэвээр.

    Хана унасан нь «дата өөрчлөгдөв» гэсэн үг БИШ гэдгийг барина: түүний
    ажлын мөр бүр урьдын адил байрандаа.
    """
    darga = detail(client, as_role("darga"))
    otgoo = detail(client, as_role("otgoo"))

    assert darga["no"] == otgoo["no"] and darga["client"] == otgoo["client"]
    assert darga["start_date"] == otgoo["start_date"]
    assert darga["status"] == otgoo["status"] and darga["type"] == otgoo["type"]
    assert darga["qty_out"] == otgoo["qty_out"]

    assert [(i["material"], i["grade"], i["qty"]) for i in darga["items"]] \
        == [(i["material"], i["grade"], i["qty"]) for i in otgoo["items"]]

    # Хөдөлгөөний түүх — мөрийн тоо, огноо, тоо ширхэг нь бүтнээрээ
    assert len(darga["movements"]) == len(otgoo["movements"])
    for a, b in zip(darga["movements"], otgoo["movements"]):
        assert a["date"] == b["date"] and a["type"] == b["type"] and a["status"] == b["status"]
        assert [l["qty"] for l in a["lines"]] == [l["qty"] for l in b["lines"]]
        assert [l["repair_qty"] for l in a["lines"]] == [l["repair_qty"] for l in b["lines"]]
        assert [l["writeoff_qty"] for l in a["lines"]] == [l["writeoff_qty"] for l in b["lines"]]

    # Дэвтрийн бүтэц: үлдэгдэл, падангийн хамаарал (тоо, дугаар) хэвээр
    assert len(darga["material_lines"]) == len(otgoo["material_lines"])
    for a, b in zip(darga["material_lines"], otgoo["material_lines"]):
        assert a["held"] == b["held"] and a["grade"] == b["grade"]
        assert [(l["date"], l["qty"], l["delta"], l["counted"]) for l in a["lines"]] \
            == [(l["date"], l["qty"], l["delta"], l["counted"]) for l in b["lines"]]
    src = [s for g in darga["material_lines"] for l in g["lines"]
           for s in (l.get("sources") or [])]
    assert src, "тестийн суурь буруу — буцаалтын хамаарал алга"
    assert all("issue_line_id" in s and "qty" in s for s in src)

    # Циклийн явц нь ХУГАЦАА — түүнийг дарга үргэлж харна
    if otgoo.get("cycle"):
        assert darga["cycle"]["cycle_start"] == otgoo["cycle"]["cycle_start"]
        assert darga["cycle"]["days_done"] == otgoo["cycle"]["days_done"]
        assert darga["cycle"]["days_total"] == otgoo["cycle"]["days_total"]


# ---------- 3. ЭРХ — хана унасан ч дарга мөнгө ХӨДӨЛГӨХГҮЙ ----------
#
# Энэ бол шийдвэрийн НӨГӨӨ тал: «хариулж чаддаг» гэдэг нь «хийж чаддаг»
# гэсэн үг БИШ. Уншиж чадах бүхнийг нь ХӨДӨЛГӨЖ ч чадна гэж бодохгүйн тулд
# зураас нь ЭНД, нэг дор нэрлэгдэнэ.

def test_factory_still_cannot_move_any_money(client, as_role):
    """Уншина — ХӨДӨЛГӨХГҮЙ. Мөнгө үүсгэдэг зам бүр даргад 403."""
    h = as_role("darga")
    d = detail(client, h)
    cid = d["id"]

    paths = [
        ("POST", "/api/payments",
         {"client_id": d["client_id"], "date": iso(0), "amount": 1000, "method": "CASH"}),
        ("POST", f"/api/contracts/{cid}/book-penalty", {"as_of": iso(0)}),
        ("POST", f"/api/contracts/{cid}/akt", {"date": iso(0), "amount": 1000, "note": "Тээвэр"}),
        ("POST", f"/api/contracts/{cid}/rate-change",
         {"material_id": d["items"][0]["material_id"], "grade_id": d["items"][0]["grade_id"],
          "old_rate": d["items"][0]["daily_rate"], "new_rate": 999, "effective_from": iso(0)}),
    ]
    for method, path, body in paths:
        r = client.request(method, path, headers=h, json=body)
        assert r.status_code == 403, f"{path} даргад нээлттэй байна ({r.status_code})"

    # Хаалтын тооцоо нь МӨНГӨ — унших ч эрхгүй (сервер өөрөө хэлнэ)
    assert client.get(f"/api/contracts/{cid}/close-preview", headers=h).status_code == 403


# ---------- 4. Менежер, санхүүч: юу ч хөндөгдөөгүй ----------

@pytest.mark.parametrize("role", FIN_ROLES)
def test_manager_and_finance_contract_detail_unchanged(client, as_role, role):
    h = as_role(role)
    d = detail(client, h, RENT_CID)
    for k in MONEY_TOP + MONEY_BLOCKS:
        assert k in d, f"{role}: «{k}» алга болжээ"
    assert all(k in d["items"][0] for k in MONEY_ITEM)
    assert RENT_RATES <= numbers(d)
    assert SALE_PRICES <= numbers(detail(client, h, SALE_CID))

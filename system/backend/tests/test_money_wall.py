"""Мөнгөний хана — гэрээний дэлгэрэнгүй ҮЙЛДВЭРИЙН ДАРГАД.

«Системийн зураглал» §4: дарга ТООЛНО, ЗЭРЭГЛЭЛ ТОГТООНО. Үнэ бол түүний
ажил биш. Дэлгэц дээр нуух нь (ContractDetail `seesMoney`) хангалтгүй байв —
тариф, өдрийн дүн, хуримтлал, алданги, нэхэмжлэл бүгд түүний ТОКЕН руу
явсаар байсан: DevTools нээх, эсвэл сүлжээний хариуг харах хүн бүгдийг уншина.

Тиймээс зураас СЕРВЕР дээр татагдана: даргын хариунд мөнгөний талбар нь
0 биш — ОГТ БАЙХГҮЙ. Байхгүй нь эргэлзээгүй («0₮ гэрээ» гэж уншигдахгүй),
мөн frontend санамсаргүй дахин зурах юм ч байхгүй.

Тоо ширхэг, зэрэглэл, огноо, хөдөлгөөний түүх, дэвтрийн үлдэгдэл — ХЭВЭЭР.
Тэр бол даргын ажил.
"""

# Хэв хашмалын тариф 330, тулаас 110, труба 220 ₮/ш/хоног (seed, гэрээ №24/03).
# Эдгээр тоо даргын JSON-д ЯМАР Ч талбарт байж болохгүй — «rate» гэж нэрлэгдээгүй
# ч дүн авч явсан талбар үлдвэл энэ шүүлтүүр барина.
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
# Хөдөлгөөний мөр — падангийн тариф, засвар/актын ДҮН (ТОО нь үлдэнэ)
MONEY_LINE = ["rate", "repair_fee", "writeoff_fee"]
# Одоогийн циклийн хуримтлал (огноо, хоногийн явц нь үлдэнэ)
MONEY_CYCLE = ["accrued", "day_amount"]


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


# ---------- Дарга: мөнгө ОГТ ирэхгүй ----------

def test_factory_contract_detail_omits_every_money_key(client, as_role):
    d = detail(client, as_role("darga"))
    for k in MONEY_TOP + MONEY_BLOCKS:
        assert k not in d, f"даргад «{k}» явжээ"
    for it in d["items"]:
        for k in MONEY_ITEM:
            assert k not in it, f"материалын мөрөнд «{k}» явжээ"
    for g in d["material_lines"]:
        for ln in g["lines"]:
            for k in MONEY_LINE:
                assert k not in ln, f"дэвтрийн мөрөнд «{k}» явжээ"
            for s in ln.get("sources") or []:
                assert "rate" not in s, "падангийн хамаарал тарифаа авч явжээ"
    for mv in d["movements"]:
        for ln in mv["lines"]:
            for k in MONEY_LINE:
                assert k not in ln, f"хөдөлгөөний мөрөнд «{k}» явжээ"
    if d.get("cycle"):
        for k in MONEY_CYCLE:
            assert k not in d["cycle"], f"циклд «{k}» явжээ"


def test_factory_contract_detail_carries_no_tariff_number(client, as_role):
    """Талбарын нэрээр биш — УТГААР нь шалгана: 330/110/220 хаана ч байхгүй."""
    darga = detail(client, as_role("darga"))
    otgoo = detail(client, as_role("otgoo"))
    assert RENT_RATES <= numbers(otgoo), "тестийн суурь буруу — менежерт тариф алга"
    assert not (RENT_RATES & numbers(darga)), \
        f"даргын хариунд тарифын тоо үлджээ: {sorted(RENT_RATES & numbers(darga))}"


def test_factory_sale_contract_detail_carries_no_unit_price(client, as_role):
    """Худалдааны нэгж үнэ ч МӨНГӨ — түрээсийн тарифтай ижил дүрэм."""
    darga = detail(client, as_role("darga"), SALE_CID)
    otgoo = detail(client, as_role("otgoo"), SALE_CID)
    assert SALE_PRICES <= numbers(otgoo), "тестийн суурь буруу — менежерт үнэ алга"
    assert not (SALE_PRICES & numbers(darga)), \
        f"даргын хариунд нэгж үнэ үлджээ: {sorted(SALE_PRICES & numbers(darga))}"
    for it in darga["items"]:
        assert "unit_price" not in it


# ---------- Дарга: ажлаа хийх бүхэн ХЭВЭЭР ----------

def test_factory_keeps_quantities_grades_dates_and_ledger(client, as_role):
    """Тоолох, зэрэглэл тогтоох, хэзээ юу хөдөлснийг унших — бүгд хэвээр."""
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
        # Засвар/актын ТОО нь даргын ажил — ДҮН нь биш
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

    # Циклийн явц нь ХУГАЦАА — түүнийг дарга харна
    if otgoo.get("cycle"):
        assert darga["cycle"]["cycle_start"] == otgoo["cycle"]["cycle_start"]
        assert darga["cycle"]["days_done"] == otgoo["cycle"]["days_done"]
        assert darga["cycle"]["days_total"] == otgoo["cycle"]["days_total"]


# ---------- Менежер, санхүүч: юу ч хөндөгдөөгүй ----------

def test_manager_and_finance_contract_detail_unchanged(client, as_role):
    for role in ("otgoo", "sanhuu"):
        d = detail(client, as_role(role), RENT_CID)
        for k in MONEY_TOP + MONEY_BLOCKS:
            assert k in d, f"{role}: «{k}» алга болжээ"
        assert all(k in d["items"][0] for k in MONEY_ITEM)
        assert RENT_RATES <= numbers(d)
        s = detail(client, as_role(role), SALE_CID)
        assert SALE_PRICES <= numbers(s)

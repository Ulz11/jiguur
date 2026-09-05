"""ХАРИЛЦАГЧИЙН ДЭЛГЭЦ ЮУГ АСУУДАГ ВЭ — гурван талбар, гурван мухардмал хана.

Дэлгэц нь тоо БОДОХГҮЙ (H9 — нэг факт, нэг тоо): сервер юуг нэрлээгүй бол
хуудас түүнийг зохиох ёсгүй. Энэ файл нь харилцагчийн хуудсанд шинээр
хэрэгтэй болсон ГУРВАН талбарыг барина:

  1. `invoice.label`     — гараар бичсэн бичилтийн (`A-…`) ӨӨРИЙНХ нь шошго.
     Тэдгээр нэхэмжлэл нь хуучин үлдэгдлийн ЗОХИОМОЛ гэрээн дээр (`OB-{id}`)
     суудаг тул гэрээгээр нь таньвал БҮГД «Хуучин үлдэгдэл» гэж нэрлэгдэнэ:
     Бутангуудын «Өнө Ордтой тооцоо — 2026.06.22 акт» 139,648,000₮ нь
     «Хуучин үлдэгдэл · 2026-09-01 хүртэл» гэж харагдаж байв.

  2. `payment.allocated` / `unallocated` — ИЛҮҮ ТӨЛӨЛТ. Хурд групп
     78,165,000₮ илүү төлсөн атал хуудас нь «Авлага 0₮ · Хэвийн» гэж
     зогсоно: тэр мөнгө зөвхөн «Төлбөр» табын нэг мөр болж нуугдана.

  3. `POST /api/import/clients` → `added_names` / `skipped_names`. Хоёр тоо
     («12 нэмэгдэв, 3 алгасав») нь ХЭН алгасагдсаныг хэлдэггүй тул Отгоо
     эгч файлаа Excel дээр нээж, 200 мөр дундуур нүдээрээ хайж эхэлдэг.
"""
import io

from openpyxl import Workbook

from tests.test_features import iso, mk_contract


def _profile(client, h, cid):
    r = client.get(f"/api/clients/{cid}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- 1. Нэхэмжлэлийн шошго ----------

def test_entry_invoice_carries_its_own_label(client, as_role):
    """`A-…` нэхэмжлэл нь бичилтийн шошгоо АВЧ ЯВНА; түрээсийнх ХООСОН."""
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=100, days_ago=70)
    label = "Өнө Ордтой тооцоо — 2026.06.22 акт"
    r = client.post(f"/api/clients/{cl['id']}/entries", headers=h, json={
        "date": iso(0), "amount": 139_648_000, "kind": "transfer",
        "label": label, "note": "Шилжүүлэлт — хуучин системээс",
        "ref": "2026 тооцоо!R24 · Бутан-Өнөорд"})
    assert r.status_code == 200, r.text

    invs = _profile(client, h, cl["id"])["invoices"]
    entry_inv = next(i for i in invs if i["no"].startswith("A-"))
    assert entry_inv["label"] == label
    # Энэ мөр нь хуучин үлдэгдлийн ЗОХИОМОЛ гэрээн дээр сууна — дэлгэц
    # гэрээгээр нь таньж болохгүй гэдгийн баталгаа.
    assert entry_inv["contract_no"].startswith("OB-")

    rent = [i for i in invs if not i["no"].startswith(("A-", "OB-"))]
    assert rent, "түрээсийн нэхэмжлэл үүсээгүй байна"
    assert all(i["label"] == "" for i in rent), "түрээсийн нэрийг цикл нь өгнө"


# ---------- 2. Илүү төлөлт ----------

def test_payment_row_names_its_unallocated_part(client, as_role):
    """Хуваарилагдаагүй үлдэгдэл нь мөрөн дээрээ НЭРЛЭГДЭНЭ."""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=100, days_ago=70)
    prof = _profile(client, h, cl["id"])
    # Хуваарилалт нь ЗӨВХӨН нэхэмжлэгдсэн үлдэгдлийг хаана; явагдаж буй
    # циклийн хуримтлал нэхэмжлэл БОЛТЛОО хүлээнэ (H9b).
    billed = round(sum(i["outstanding"] for i in prof["invoices"]))
    assert billed > 0

    over = billed + 78_165_000
    r = client.post("/api/payments", headers=h, json={
        "client_id": cl["id"], "contract_id": c["id"], "date": iso(0),
        "amount": over, "method": "BANK", "barter_desc": "", "note": "илүү"})
    assert r.status_code == 200, r.text

    prof = _profile(client, h, cl["id"])
    row = next(p for p in prof["payments"] if round(p["amount"]) == over)
    assert row["allocated"] == billed
    assert row["unallocated"] == 78_165_000
    # ХОЁР талбар нь НЭГ баримтын хоёр тал — нийлбэр нь дүн (H9).
    assert row["allocated"] + row["unallocated"] == round(row["amount"])
    # …атал нэхэмжлэл бүр ХААГДСАН: дэлгэц дээр «Хэвийн» гэж бичигдэх аюул
    # ЯГ энд — 78 сая нь зөвхөн энэ мөрөнд амьдарна.
    assert all(i["outstanding"] == 0 for i in prof["invoices"])


def test_voided_payment_keeps_its_numbers(client, as_role):
    """Цуцлагдсан төлбөр мөрөндөө үлдэнэ — хуваарилалт нь суларна."""
    h = as_role("otgoo")
    cl, c, *_ = mk_contract(client, as_role, qty=100, days_ago=70)
    r = client.post("/api/payments", headers=h, json={
        "client_id": cl["id"], "contract_id": c["id"], "date": iso(0),
        "amount": 1_000_000, "method": "BANK", "barter_desc": "", "note": ""})
    pid = r.json()["id"]
    client.post(f"/api/payments/{pid}/void", headers=h, json={"reason": "буруу дүн"})

    row = next(p for p in _profile(client, h, cl["id"])["payments"] if p["id"] == pid)
    assert row["voided"] is True
    assert row["allocated"] == 0 and row["unallocated"] == 1_000_000


# ---------- 3. Импортын үр дүн ----------

def _xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.append(["Нэр", "Регистр", "Хариуцагч", "Утас"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def test_import_returns_the_names_not_only_counts(client, as_role):
    """ХЭН нэмэгдэж, ХЭН алгасагдсаныг хариу нь өөрөө хэлнэ."""
    h = as_role("otgoo")
    data = _xlsx([["Шинэ Түрээс ХХК", "1122334", "И.Тест", "9911-2233"],
                  ["Хоёр Дахь ХХК", "", "", ""],
                  ["Түмэн Хийц ХХК", "", "", ""],      # seed дээр БАЙГАА
                  ["", "", "", ""]])                    # хоосон мөр — тоологдохгүй
    r = client.post("/api/import/clients", headers=h,
                    files={"file": ("clients.xlsx", data, "application/vnd.openxml"
                                    "formats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["added_names"] == ["Шинэ Түрээс ХХК", "Хоёр Дахь ХХК"]
    assert j["skipped_names"] == ["Түмэн Хийц ХХК"]
    # Хуучин хос тоо ХЭВЭЭР — нэрсийнхээ уртаас гарна (нэг факт, нэг тоо).
    assert j["created"] == len(j["added_names"]) == 2
    assert j["skipped"] == len(j["skipped_names"]) == 1


def test_import_same_name_twice_in_one_file_is_skipped_by_name(client, as_role):
    """Нэг файл дотор давхардсан нэр — хоёр дахь нь нэрээрээ алгасагдана."""
    h = as_role("otgoo")
    data = _xlsx([["Давхар ХХК", "", "", ""], ["давхар ххк", "", "", ""]])
    j = client.post("/api/import/clients", headers=h,
                    files={"file": ("c.xlsx", data, "application/vnd.openxml"
                                    "formats-officedocument.spreadsheetml.sheet")}).json()
    assert j["added_names"] == ["Давхар ХХК"]
    assert j["skipped_names"] == ["давхар ххк"]

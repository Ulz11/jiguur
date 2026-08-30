"""Механизм (Автокран) — TDD. Бодит хэв маяг: өдрөөр (бүтэн/хагас), орлого
бэлэн/данс/бартер, дотоод ажил, зарлага (түлш, сэлбэг, жолооч) → машин бүрийн ашиг."""
from datetime import date, timedelta


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def test_machine_pnl_from_jobs_and_expenses(client, as_role):
    h = as_role("otgoo")
    m = client.post("/api/machines", headers=h, json={"name": "Тест кран 25т"}).json()
    assert m["name"] == "Тест кран 25т"
    # бүтэн өдөр 1.2 сая (данс) + хагас өдөр 600к (бэлэн) + дотоод ажил 300к
    for job in [
        {"date": iso(3), "entry": "job", "label": "Бүтэн өдөр", "client": "Түмэн Хийц",
         "amount": 1_200_000, "method": "BANK"},
        {"date": iso(2), "entry": "job", "label": "Хагас өдөр", "client": "Бат Бүтээц",
         "amount": 600_000, "method": "CASH"},
        {"date": iso(1), "entry": "job", "label": "Дотоод ажил", "client": "Жигүүр Зам",
         "amount": 300_000, "method": "INTERNAL"},
    ]:
        r = client.post(f"/api/machines/{m['id']}/logs", headers=h, json=job)
        assert r.status_code == 200, r.text
    # зарлага: түлш 200к
    r = client.post(f"/api/machines/{m['id']}/logs", headers=h, json={
        "date": iso(1), "entry": "expense", "label": "Түлш", "amount": 200_000})
    assert r.status_code == 200
    lst = client.get("/api/machines", headers=h).json()
    row = next(x for x in lst["machines"] if x["id"] == m["id"])
    # ДОТООД ажил (300к) ОРЛОГОД ОРОХГҮЙ — өөрийн агуулах руу нэхэмжлэл
    # явдаггүй тул тэр мөнгө гаднаас ирээгүй. Тусдаа тоогоор харагдана.
    assert row["income"] == 1_800_000
    assert row["internal"] == 300_000 and row["internal_count"] == 1
    assert row["expense"] == 200_000
    assert row["net"] == 1_600_000


def test_machine_log_validation(client, as_role):
    h = as_role("otgoo")
    m = client.post("/api/machines", headers=h, json={"name": "Тест кран Б"}).json()
    bad = client.post(f"/api/machines/{m['id']}/logs", headers=h, json={
        "date": iso(0), "entry": "job", "label": "Бүтэн өдөр", "amount": -100})
    assert bad.status_code == 400


def test_factory_can_log_but_not_create_machine(client, as_role):
    hd = as_role("darga")
    machines = client.get("/api/machines", headers=hd).json()["machines"]
    assert machines, "seed-д кран байх ёстой"
    r = client.post(f"/api/machines/{machines[0]['id']}/logs", headers=hd, json={
        "date": iso(0), "entry": "expense", "label": "Түлш", "amount": 150_000})
    assert r.status_code == 200
    assert client.post("/api/machines", headers=hd, json={"name": "X"}).status_code == 403


def test_factory_cannot_edit_delete_logs_or_touch_invoices(client, as_role):
    """Дарга БИЧНЭ, гэхдээ БҮРТГЭЛИЙГ ЗАСАХГҮЙ, УСТГАХГҮЙ, НЭХЭМЖЛЭХГҮЙ.

    Өнөөдрийн ажлаа бүртгэх нь түүний ажил (Системийн зураглал: ачилт/буцаалт/
    агуулах/механизм). Харин бичигдсэн дүнг эргүүлэн засах, устгах, түүнээс
    нэхэмжлэх баримт гаргах нь МӨНГӨНИЙ шийдвэр — гэрээний дэлгэрэнгүй дээр
    аль хэдийн татсан зураас (`seesMoney`) энд ч татагдана."""
    hm, hd = as_role("otgoo"), as_role("darga")
    m, l = _machine_with_job(client, hm, "Эрхийн кран")

    bad = client.patch(f"/api/machine-logs/{l['id']}", headers=hd, json={"amount": 1})
    assert bad.status_code == 403 and "эрх байхгүй" in bad.json()["detail"]
    assert client.delete(f"/api/machine-logs/{l['id']}", headers=hd).status_code == 403

    bad_inv = client.post(f"/api/machines/{m['id']}/invoices", headers=hd, json={
        "client": "Бат Бүтээц", "d_from": iso(30), "d_to": iso(0)})
    assert bad_inv.status_code == 403 and "эрх байхгүй" in bad_inv.json()["detail"]

    inv = client.post(f"/api/machines/{m['id']}/invoices", headers=hm, json={
        "client": "Бат Бүтээц", "d_from": iso(30), "d_to": iso(0)}).json()
    assert client.delete(f"/api/machine-invoices/{inv['id']}", headers=hd).status_code == 403
    # Санхүүч нь мөнгөний хүн — түүнд эдгээр хаалттай биш
    assert client.delete(f"/api/machine-invoices/{inv['id']}",
                         headers=as_role("sanhuu")).status_code == 200


def test_internal_work_is_not_machine_income(client, as_role):
    """ДОТООД ажил бол ОРЛОГО БИШ — өөрийн агуулах руу нэхэмжлэл явдаггүй.

    Нэхэмжлэх нь дотоодыг хасдаг байхад машины картын «Орлого» түүнийг
    нэмсээр байв: нэг машины ажил хоёр өөр дүнтэй харагдана. Дотоод ажил
    алга болох ёсгүй тул ӨӨРИЙН тоогоор тусад нь гарна."""
    h = as_role("otgoo")
    m = client.post("/api/machines", headers=h, json={"name": "Дотоодын кран"}).json()
    for job in [
        {"date": iso(3), "entry": "job", "label": "Бүтэн өдөр", "client": "Түмэн Хийц",
         "amount": 1_200_000, "method": "BANK"},
        {"date": iso(1), "entry": "job", "label": "Дотоод ажил", "client": "Жигүүр Зам",
         "amount": 300_000, "method": "INTERNAL"},
    ]:
        assert client.post(f"/api/machines/{m['id']}/logs", headers=h, json=job).status_code == 200

    row = next(x for x in client.get("/api/machines", headers=h).json()["machines"]
               if x["id"] == m["id"])
    assert row["income"] == 1_200_000, "дотоод ажил орлогод орох ёсгүй"
    assert row["internal"] == 300_000
    assert row["internal_count"] == 1
    assert row["net"] == 1_200_000

    # Нэхэмжлэхийн дүрэмтэй ЯГ таарна — хоёр газар нэг тоо
    inv = client.post(f"/api/machines/{m['id']}/invoices", headers=h, json={
        "client": "Түмэн Хийц", "d_from": iso(30), "d_to": iso(0)}).json()
    assert inv["total"] == row["income"]


# ---------- Машины насжилт: нэр/тэмдэглэл засах, зогсоох, сэргээх ----------

def test_patch_machine_name_and_note(client, as_role):
    h = as_role("otgoo")
    m = client.post("/api/machines", headers=h, json={"name": "Хуучин нэр"}).json()
    r = client.patch(f"/api/machines/{m['id']}", headers=h,
                     json={"name": "Автокран 16т", "note": "2024 онд авсан"})
    assert r.status_code == 200, r.text
    row = next(x for x in client.get("/api/machines", headers=h).json()["machines"]
               if x["id"] == m["id"])
    assert row["name"] == "Автокран 16т"
    assert row["note"] == "2024 онд авсан"


def test_retired_machine_keeps_history_but_rejects_new_logs(client, as_role):
    """Зогсоох нь УСТГАХ биш: түүх уншигдсан хэвээр, зөвхөн шинэ бичилт хаагдана."""
    h = as_role("otgoo")
    m = client.post("/api/machines", headers=h, json={"name": "Зогсох кран"}).json()
    job = {"date": iso(3), "entry": "job", "label": "Бүтэн өдөр", "client": "Түмэн Хийц",
           "amount": 900_000, "method": "BANK"}
    assert client.post(f"/api/machines/{m['id']}/logs", headers=h, json=job).status_code == 200

    r = client.patch(f"/api/machines/{m['id']}", headers=h, json={"active": 0})
    assert r.status_code == 200 and r.json()["active"] == 0

    bad = client.post(f"/api/machines/{m['id']}/logs", headers=h, json=job)
    assert bad.status_code == 400
    assert "Зогссон" in bad.json()["detail"]

    kept = client.get(f"/api/machines/{m['id']}/logs", headers=h).json()
    assert len(kept["logs"]) == 1 and kept["income"] == 900_000

    assert client.patch(f"/api/machines/{m['id']}", headers=h,
                        json={"active": 1}).json()["active"] == 1
    assert client.post(f"/api/machines/{m['id']}/logs", headers=h, json=job).status_code == 200


# ---------- Бичилтийн засвар/устгал ----------

def _machine_with_job(client, h, name="Засварын кран"):
    m = client.post("/api/machines", headers=h, json={"name": name}).json()
    l = client.post(f"/api/machines/{m['id']}/logs", headers=h, json={
        "date": iso(4), "entry": "job", "label": "Хагас өдөр", "client": "Бат Бүтээц",
        "amount": 600_000, "method": "CASH", "note": ""}).json()
    return m, l


def test_patch_machine_log_persists_and_audits(client, as_role):
    h = as_role("otgoo")
    m, l = _machine_with_job(client, h)
    r = client.patch(f"/api/machine-logs/{l['id']}", headers=h, json={
        "date": iso(2), "label": "Бүтэн өдөр", "client": "Түмэн Хийц",
        "amount": 1_200_000, "method": "BANK", "note": "Тохиролцсоноор"})
    assert r.status_code == 200, r.text

    got = client.get(f"/api/machines/{m['id']}/logs", headers=h).json()
    row = got["logs"][0]
    assert (row["date"], row["label"], row["client"]) == (iso(2), "Бүтэн өдөр", "Түмэн Хийц")
    assert row["amount"] == 1_200_000 and row["method"] == "BANK"
    assert row["note"] == "Тохиролцсоноор"
    assert got["income"] == 1_200_000

    trail = client.get("/api/audit?entity=machine_log", headers=h).json()
    assert any(a["action"] == "update" and a["entity_id"] == l["id"] for a in trail)


def test_delete_machine_log_removes_it_and_audits(client, as_role):
    h = as_role("otgoo")
    m, l = _machine_with_job(client, h, "Устгалын кран")
    assert client.delete(f"/api/machine-logs/{l['id']}", headers=h).status_code == 200

    got = client.get(f"/api/machines/{m['id']}/logs", headers=h).json()
    assert got["logs"] == [] and got["income"] == 0
    assert client.delete(f"/api/machine-logs/{l['id']}", headers=h).status_code == 404

    trail = client.get("/api/audit?entity=machine_log", headers=h).json()
    assert any(a["action"] == "delete" and a["entity_id"] == l["id"] for a in trail)


def test_machine_log_patch_validates_amount(client, as_role):
    h = as_role("otgoo")
    _, l = _machine_with_job(client, h, "Валидацийн кран")
    assert client.patch(f"/api/machine-logs/{l['id']}", headers=h,
                        json={"amount": 0}).status_code == 400


# ---------- Механизмын нэхэмжлэх (тусдаа баримт, авлагын хөдөлгүүрт ОРОХГҮЙ) ----------

def _invoice_machine(client, h):
    """Нэг харилцагчийн 2 ажил + өөр харилцагч + дотоод + зарлага + цонхны гадна."""
    m = client.post("/api/machines", headers=h, json={"name": "Нэхэмжлэхийн кран"}).json()
    rows = [
        {"date": "2026-05-01", "entry": "job", "label": "Бүтэн өдөр", "client": "Түмэн Хийц",
         "amount": 1_200_000, "method": "BANK"},                      # ✓ доод ирмэг
        {"date": "2026-05-31", "entry": "job", "label": "Хагас өдөр", "client": "Түмэн Хийц",
         "amount": 600_000, "method": "CASH"},                        # ✓ дээд ирмэг
        {"date": "2026-05-15", "entry": "job", "label": "Дотоод ажил", "client": "Түмэн Хийц",
         "amount": 300_000, "method": "INTERNAL"},                    # ✗ дотоод
        {"date": "2026-05-10", "entry": "job", "label": "Бүтэн өдөр", "client": "Бат Бүтээц",
         "amount": 900_000, "method": "BANK"},                        # ✗ өөр харилцагч
        {"date": "2026-05-12", "entry": "expense", "label": "Түлш", "client": "Түмэн Хийц",
         "amount": 400_000, "method": ""},                            # ✗ зарлага
        {"date": "2026-06-01", "entry": "job", "label": "Бүтэн өдөр", "client": "Түмэн Хийц",
         "amount": 800_000, "method": "BANK"},                        # ✗ цонхны гадна
    ]
    for r in rows:
        assert client.post(f"/api/machines/{m['id']}/logs", headers=h, json=r).status_code == 200
    return m


def test_machine_invoice_takes_only_that_clients_billable_jobs(client, as_role):
    """Зөвхөн ТЭР харилцагчийн, зөвхөн АЖЛЫН, дотоод БИШ мөрүүд — ирмэг оролцоно."""
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    r = client.post(f"/api/machines/{m['id']}/invoices", headers=h, json={
        "client": "Түмэн Хийц", "d_from": "2026-05-01", "d_to": "2026-05-31"})
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["total"] == 1_800_000          # 1.2 сая + 600к, дотоод/зарлага/бусад орохгүй
    assert inv["rows"] == 2
    assert inv["no"].startswith("M-")

    got = client.get(f"/api/machines/{m['id']}/logs", headers=h).json()
    assert [i["no"] for i in got["invoices"]] == [inv["no"]]
    assert got["invoices"][0]["grand_total"] == 1_800_000


def test_machine_invoice_window_excludes_outside_days(client, as_role):
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    r = client.post(f"/api/machines/{m['id']}/invoices", headers=h, json={
        "client": "Түмэн Хийц", "d_from": "2026-05-02", "d_to": "2026-05-30"})
    assert r.status_code == 400          # ирмэгийн 2 мөр хасагдвал юу ч үлдэхгүй
    assert "олдсонгүй" in r.json()["detail"]


def test_machine_invoice_numbering_increments_and_is_unique(client, as_role):
    """Дугаарлалт нь он/сар дотор урагшилна.

    Хоёр баримт нь ДАВХАЦААГҮЙ цонхтой (өмнө нь ЯГ ижил цонхоор хоёр удаа
    гаргадаг байсан — одоо тэр нь 409, доорх `…rejects_overlapping…` тест).
    """
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    a = client.post(f"/api/machines/{m['id']}/invoices", headers=h, json={
        "client": "Түмэн Хийц", "d_from": "2026-05-01", "d_to": "2026-05-15"}).json()
    b = client.post(f"/api/machines/{m['id']}/invoices", headers=h, json={
        "client": "Түмэн Хийц", "d_from": "2026-05-16", "d_to": "2026-05-31"}).json()
    assert a["no"] != b["no"]
    head_a, n_a = a["no"].rsplit("-", 1)
    head_b, n_b = b["no"].rsplit("-", 1)
    assert head_a == head_b and int(n_b) == int(n_a) + 1
    assert head_a.startswith("M-") and len(head_a) == len("M-26/05")


# ---------- Давхардсан баримтын хориг ----------
#
# «Үүсгэх» товчийг хоёр дарахад M-YY/MM-1 БА M-YY/MM-2 хоёр ЯГ ижил мөрүүд
# дээр төрдөг байв: кран нэг ажлаа хоёр удаа нэхэмжилнэ. Сервер огнооны
# дараалал, мөр байгаа эсэхийг л шалгадаг байсан — цонх нь ДАВХАЦАЖ байгааг
# хардаггүй. Давхардлыг ХЭНИЙ БАРИМТТАЙ давхацсаныг нэрлэж татгалзана.

def _mk(client, h, mid, c="Түмэн Хийц", f="2026-05-01", t="2026-05-31"):
    return client.post(f"/api/machines/{mid}/invoices", headers=h,
                       json={"client": c, "d_from": f, "d_to": t})


def test_machine_invoice_rejects_exact_duplicate_naming_the_existing_no(client, as_role):
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    first = _mk(client, h, m["id"]).json()
    r = _mk(client, h, m["id"])
    assert r.status_code == 409, r.text
    # Мэдэгдэл нь АЛЬ баримттай мөргөлдсөнийг хэлнэ — Отгоо очиж хардаг
    assert first["no"] in r.json()["detail"]
    assert client.get(f"/api/machines/{m['id']}/logs", headers=h).json()["invoices"] \
        == [{**{k: v for k, v in first.items() if k != "rows"}}]


def test_machine_invoice_rejects_partial_overlap(client, as_role):
    """Ирмэг дээр ЧУХАМ таарсан өдөр ч давхардал — [a,b] ба [b,c] нь b-г хуваана."""
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    first = _mk(client, h, m["id"], f="2026-05-01", t="2026-05-15").json()
    r = _mk(client, h, m["id"], f="2026-05-15", t="2026-05-31")
    assert r.status_code == 409 and first["no"] in r.json()["detail"]
    # Бүрэн залгисан цонх ч давхардал
    assert _mk(client, h, m["id"], f="2026-04-01", t="2026-06-30").status_code == 409


def test_machine_invoice_allows_adjacent_windows(client, as_role):
    """Зэрэгцээ (нэг ч өдөр хуваалцаагүй) цонх нь хэвийн — 15 ба 16 тусдаа."""
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    assert _mk(client, h, m["id"], f="2026-05-01", t="2026-05-15").status_code == 200
    assert _mk(client, h, m["id"], f="2026-05-16", t="2026-05-31").status_code == 200
    assert len(client.get(f"/api/machines/{m['id']}/logs", headers=h).json()["invoices"]) == 2


def test_machine_invoice_allows_same_window_for_another_client(client, as_role):
    """Давхардал нь МАШИН + ХАРИЛЦАГЧААР тодорхойлогдоно — хөрш нь чөлөөтэй."""
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    assert _mk(client, h, m["id"]).status_code == 200
    assert _mk(client, h, m["id"], c="Бат Бүтээц",
               f="2026-05-01", t="2026-05-31").status_code == 200
    assert len(client.get(f"/api/machines/{m['id']}/logs", headers=h).json()["invoices"]) == 2


def test_machine_invoice_duplicate_guard_is_per_machine(client, as_role):
    """Өөр машины ижил цонх нь өөр ажил — хоригт өртөхгүй."""
    h = as_role("otgoo")
    a = _invoice_machine(client, h)
    b = _invoice_machine(client, h)
    assert _mk(client, h, a["id"]).status_code == 200
    assert _mk(client, h, b["id"]).status_code == 200


def test_machine_invoice_pdf_and_delete(client, as_role):
    h = as_role("otgoo")
    m = _invoice_machine(client, h)
    inv = client.post(f"/api/machines/{m['id']}/invoices", headers=h, json={
        "client": "Түмэн Хийц", "d_from": "2026-05-01", "d_to": "2026-05-31"}).json()

    p = client.get(f"/api/machine-invoices/{inv['id']}/pdf", headers=h)
    assert p.status_code == 200 and p.content[:4] == b"%PDF"
    # `M-26/05-1`-ийн ташуу зураас файлын нэрэнд орвол зам болж эвдэрнэ
    assert "/" not in p.headers["Content-Disposition"]

    assert client.delete(f"/api/machine-invoices/{inv['id']}", headers=h).status_code == 200
    assert client.get(f"/api/machine-invoices/{inv['id']}/pdf", headers=h).status_code == 404
    assert client.get(f"/api/machines/{m['id']}/logs", headers=h).json()["invoices"] == []

    trail = client.get("/api/audit?entity=machine_invoice", headers=h).json()
    assert any(a["action"] == "delete" and a["entity_id"] == inv["id"] for a in trail)


def test_machine_invoice_does_not_enter_the_receivable_engine(client, as_role):
    """Механизм нь ТУСДАА орлогын урсгал — дашбоардын авлага хөдлөхгүй."""
    h = as_role("otgoo")
    before = client.get("/api/dashboard", headers=h).json()["kpi"]["receivable"]
    m = _invoice_machine(client, h)
    client.post(f"/api/machines/{m['id']}/invoices", headers=h, json={
        "client": "Түмэн Хийц", "d_from": "2026-05-01", "d_to": "2026-05-31"})
    assert client.get("/api/dashboard", headers=h).json()["kpi"]["receivable"] == before

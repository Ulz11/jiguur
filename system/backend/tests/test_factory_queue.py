"""Үйлдвэрийн даргын ажлын дараалал — гэрээний мөр дээрх «гадаа байгаа тоо»
болон «Ачилт хүлээгдэж буй» мөрийн хураангуй.

Дарга дашбоардаасаа «Буцаалт хүлээж буй гэрээ»-г хардаг. Мөр бүр дээр ХЭДЭН
ширхэг гадаа байгаа нь харагдахгүй бол тэр жагсаалт зүгээр л нэрсийн жагсаалт
болно — дарга талбай дээр юу тоолохоо мэдэхгүй. Тиймээс гэрээний жагсаалтын
мөр өөрөө гадаа байгаа тоогоо авч явна (нэг хүсэлт, N+1 биш).
"""
from datetime import date, timedelta


def iso(days_ago: int) -> str:
    return str(date.today() - timedelta(days=days_ago))


def _row(client, headers, cid: int):
    rows = client.get("/api/contracts", headers=headers).json()
    return next(r for r in rows if r["id"] == cid)


def test_contract_row_carries_qty_out(client, as_role):
    """Ачилт баталгаажсаны дараа гадаа байгаа тоо мөр дээр гарч, буцаалтаар буурна."""
    h = as_role("otgoo")
    darga = as_role("darga")
    cl = client.post("/api/clients", json={"name": "Гадаа тоо ХХК"}, headers=h).json()
    m = next(x for x in client.get("/api/materials", headers=h).json()
             if x["name"] == "Хэв хашмал 6012")
    st = next(s for s in m["stock"] if s["grade"] == "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(10),
        "penalty_percent": 0.5,
        "items": [{"material_id": m["id"], "grade_id": st["grade_id"],
                   "qty": 200, "daily_rate": 330}]}).json()["id"]

    # Хүлээгдэж буй ачилт — бараа хараахан гараагүй
    assert _row(client, darga, cid)["qty_out"] == 0

    mv = next(p for p in client.get("/api/dashboard", headers=darga).json()["pending_shipments"]
              if p["contract_id"] == cid)
    client.post(f"/api/movements/{mv['id']}/confirm", headers=darga)
    assert _row(client, darga, cid)["qty_out"] == 200

    client.post(f"/api/contracts/{cid}/movements", headers=darga, json={
        "type": "RETURN", "date": iso(2), "lines": [
            {"material_id": m["id"], "grade_id": st["grade_id"], "qty": 60,
             "return_grade_id": st["grade_id"]}]})
    assert _row(client, darga, cid)["qty_out"] == 140


def _mat(client, headers, name: str, grade: str):
    """(material_id, grade_id) — нэрээр нь каталогоос олно."""
    m = next(x for x in client.get("/api/materials", headers=headers).json()
             if x["name"] == name)
    return m["id"], next(s for s in m["stock"] if s["grade"] == grade)["grade_id"]


def _pending(client, headers, cid: int):
    return next(p for p in client.get("/api/dashboard", headers=headers).json()["pending_shipments"]
                if p["contract_id"] == cid)


def test_pending_shipment_summary_names_the_materials(client, as_role):
    """«Ачилт хүлээгдэж буй» мөр нь ЮУГ ачихыг хэлнэ — зөвхөн «×450» биш.

    Дарга «Ачсан ✓» дарахаасаа өмнө агуулахаас юу гаргахаа мэдэх ёстой.
    Тоо ширхэг дангаараа утгагүй: 450 нь хэв үү, труба уу?
    """
    h = as_role("otgoo")
    darga = as_role("darga")
    cl = client.post("/api/clients", json={"name": "Хураангуй ХХК"}, headers=h).json()
    m6012, g_b = _mat(client, h, "Хэв хашмал 6012", "В")
    t3, g_a = _mat(client, h, "Труба 3м", "А")
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(3),
        "penalty_percent": 0.5,
        "items": [{"material_id": m6012, "grade_id": g_b, "qty": 450, "daily_rate": 330},
                  {"material_id": t3, "grade_id": g_a, "qty": 300, "daily_rate": 200}]}).json()["id"]

    summary = _pending(client, darga, cid)["summary"]
    assert "Хэв хашмал 6012 (В) ×450" in summary
    assert "Труба 3м (А) ×300" in summary


def test_pending_shipment_summary_truncates_past_four_lines(client, as_role):
    """5 мөртэй ачилт — эхний 4 нэрлэгдэж, үлдсэн нь «… +1 мөр» болж хумигдана."""
    h = as_role("otgoo")
    darga = as_role("darga")
    cl = client.post("/api/clients", json={"name": "Урт ачилт ХХК"}, headers=h).json()
    names = ["Хэв хашмал 6012", "Хэв хашмал 5012", "Хэв хашмал 4512",
             "Хэв хашмал 4012", "Хэв хашмал 3012"]
    items = []
    for n in names:
        mid, gid = _mat(client, h, n, "А")
        items.append({"material_id": mid, "grade_id": gid, "qty": 10, "daily_rate": 330})
    cid = client.post("/api/contracts", headers=h, json={
        "client_id": cl["id"], "type": "rent", "start_date": iso(3),
        "penalty_percent": 0.5, "items": items}).json()["id"]

    summary = _pending(client, darga, cid)["summary"]
    assert "Хэв хашмал 4012 (А) ×10" in summary   # 4 дэх мөр хэвээрээ
    assert "Хэв хашмал 3012" not in summary       # 5 дахь нь хумигдсан
    assert summary.endswith("… +1 мөр")

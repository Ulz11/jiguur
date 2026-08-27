"""Үйлдвэрийн даргын ажлын дараалал — гэрээний мөр дээрх «гадаа байгаа тоо».

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

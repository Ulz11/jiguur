"""/api/audit НЬ ХАЙГДАНА — 200 мөрийн ард нуугдахаа болино.

«Хэн, юуг, хэзээ» гэсэн бүртгэл нь оршин байгаад л хангалтгүй: гурав хоногийн
өмнөх нэг өөрчлөлтийг олохын тулд Отгоо эгч мөрүүдийг нүдээрээ гүйлгэдэг
байв — 500 мөрийн дараа бүртгэл нь ХҮРЭХГҮЙ болно. Мөн ЦАГ нь UTC-гээр
харагддаг байсан: 06:00-д гүйсэн шөнийн гүйлт «22:00» гэж бичигдэнэ.
"""
from contextlib import contextmanager
from datetime import date, datetime, timedelta

from app import models


@contextmanager
def session():
    from app.db import get_db
    from app.main import app
    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    try:
        yield db
    finally:
        gen.close()


def seed_rows(rows: list[dict]) -> None:
    with session() as db:
        for r in rows:
            db.add(models.AuditLog(**r))
        db.commit()


def get(client, h, query: str = "") -> dict:
    r = client.get(f"/api/audit{query}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


WORLD = [
    dict(user_id=1, user_name="Ч.Отгонцэцэг", action="update", entity="contract",
         entity_id=1, detail="алдангийн хувь: 0 → 0.7",
         created_at=datetime(2026, 5, 10, 2, 0)),
    dict(user_id=2, user_name="Үйлдвэрийн дарга", action="stocktake", entity="stock",
         entity_id=None, detail="Хэв хашмал 6012 (А): 100 → 90",
         created_at=datetime(2026, 5, 11, 3, 0)),
    dict(user_id=None, user_name="Систем", action="cron", entity="invoice",
         entity_id=None, detail="Өдөр тутмын гүйлт: 0 шинэ нэхэмжлэл",
         created_at=datetime(2026, 5, 12, 22, 0)),   # орон нутгийн 5-13 06:00
]


# ---------- Хэлбэр ----------

def test_the_answer_carries_the_total_not_just_the_page(client, as_role):
    h = as_role("otgoo")
    seed_rows(WORLD)
    body = get(client, h, "?limit=2")
    assert set(body) == {"rows", "total"}
    assert len(body["rows"]) == 2
    assert body["total"] >= 3, "нийт нь ХУУДСААС үл хамааран бүх тоог хэлнэ"
    assert body["rows"][0]["id"] > body["rows"][1]["id"], "шинэ нь дээрээ"


def test_paging_walks_the_whole_list_without_repeating_a_row(client, as_role):
    h = as_role("otgoo")
    seed_rows(WORLD)
    total = get(client, h)["total"]
    seen, offset = [], 0
    while offset < total:
        page = get(client, h, f"?limit=2&offset={offset}")["rows"]
        assert page, "хуудас хоосон буцав"
        seen += [r["id"] for r in page]
        offset += 2
    assert len(seen) == len(set(seen)) == total


def test_the_limit_is_capped_so_one_request_cannot_pull_the_whole_book(client, as_role):
    h = as_role("otgoo")
    seed_rows([dict(WORLD[0], detail=f"мөр {i}") for i in range(60)])
    assert len(get(client, h, "?limit=99999")["rows"]) <= 500


# ---------- Шүүлтүүр ----------

def test_each_filter_narrows_the_list(client, as_role):
    h = as_role("otgoo")
    seed_rows(WORLD)

    by_entity = get(client, h, "?entity=stock")
    assert {r["entity"] for r in by_entity["rows"]} == {"stock"}
    assert by_entity["total"] == len(by_entity["rows"])

    by_action = get(client, h, "?action=cron")
    assert {r["action"] for r in by_action["rows"]} == {"cron"}

    by_user = get(client, h, "?user=дарга")
    assert by_user["total"] == 1
    assert by_user["rows"][0]["user_name"] == "Үйлдвэрийн дарга"

    by_text = get(client, h, "?q=алдангийн")
    assert by_text["total"] == 1
    assert "алдангийн хувь" in by_text["rows"][0]["detail"]

    both = get(client, h, "?entity=stock&action=cron")
    assert both["total"] == 0 and both["rows"] == []


def test_the_free_text_search_also_finds_the_person(client, as_role):
    h = as_role("otgoo")
    seed_rows(WORLD)
    assert get(client, h, "?q=Систем")["total"] == 1


# ---------- Огноо нь ОРОН НУТГИЙН өдөр ----------

def test_the_date_window_speaks_local_days_at_both_ends(client, as_role):
    """`from`/`to` хоёул ОРНО, өдөр нь Улаанбаатарын өдөр.

    22:00 UTC-д бичигдсэн мөр нь ЭНД 06:00 — маргаашийнх. Шүүлтүүр UTC-гээр
    ажиллавал өдөр тутмын гүйлт «өчигдрийнх» болж жагсаалтаас унана.
    """
    h = as_role("otgoo")
    seed_rows(WORLD)

    day = get(client, h, "?from=2026-05-13&to=2026-05-13")
    assert [r["action"] for r in day["rows"]] == ["cron"], \
        "22:00 UTC = маргаашийн 06:00 — орон нутгийн өдрөөрөө олдоно"
    assert get(client, h, "?from=2026-05-12&to=2026-05-12")["total"] == 0

    window = get(client, h, "?from=2026-05-10&to=2026-05-11")
    assert {r["action"] for r in window["rows"]} == {"update", "stocktake"}
    assert get(client, h, "?to=2026-05-10")["total"] == 1


# ---------- Цаг нь түүний цаг ----------

def test_every_row_carries_the_local_time_with_its_offset(client, as_role):
    h = as_role("otgoo")
    seed_rows(WORLD)
    row = next(r for r in get(client, h, "?action=cron")["rows"])
    assert row["local_at"].endswith("+08:00")
    assert row["local_at"].startswith("2026-05-13T06:00"), \
        "22:00 UTC → Улаанбаатарт 06:00"
    # `at` нь ХУУЧНААРАА (UTC) — хуучин уншигчид эвдрэхгүй
    assert row["at"] == "2026-05-12 22:00:00"


def test_a_fresh_row_reads_as_today_in_her_own_clock(client, as_role):
    h = as_role("otgoo")
    client.put("/api/settings", headers=h, json={"values": {"ndsh_percent": "13"}})
    row = get(client, h, "?entity=settings")["rows"][0]
    local = datetime.fromisoformat(row["local_at"])
    assert local.utcoffset() == timedelta(hours=8)
    assert abs(local.date() - date.today()) <= timedelta(days=1)


# ---------- Эрх ----------

def test_only_the_manager_may_read_the_book(client, as_role):
    assert client.get("/api/audit", headers=as_role("sanhuu")).status_code == 403
    assert client.get("/api/audit", headers=as_role("darga")).status_code == 403
    assert client.get("/api/audit", headers=as_role("otgoo")).status_code == 200

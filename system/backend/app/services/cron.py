"""Өдөр тутмын нэхэмжлэл — ХҮНГҮЙГЭЭР (Чадварын харьцуулалт H9).

Өнөөдрийг хүртэл нэхэмжлэл нь **хэн нэгэн хуудас нээх агшинд** л төрдөг байв:
`billing.ensure_invoices` 11 хүсэлтийн зам дээр сууж, GET бүр дээр дуудагддаг.
Отгоо эгч амралтаараа аппаа нээхгүй бол мөнгө БАЙХГҮЙ — авлага нь дутуу,
«Авлага цуглуулах» жагсаалт нь бодит байдлаас хоцорно. Түүний компьютерээс
нэхэх ганц шаардлага бол НЭГ тоо, ҮРГЭЛЖ ОДООХ.

**Гадны хамаарал нэмэхгүй** (нэг ажлын байрны компьютер, интернэтгүй ч ажиллана):
FastAPI-ийн `lifespan` дотор asyncio-ийн жижиг давхрага — `asyncio.sleep`-ийн
энгийн тоо бодолт. APScheduler/celery/redis аль нь ч ОРОХГҮЙ.

Гурван дүрэм:
  · **Паритет** — `generate_all` нь гэрээ бүр дээр `ensure_invoices` дуудсантай
    ЯГ ижил (`ensure_invoices` дотроо `apply_client_credit`-ыг мөн дууддаг).
    Cron өөрийн гэсэн «хувилбар» нэхэмжлэл ХЭЗЭЭ Ч төрүүлэхгүй.
  · **Тусгаарлалт** — гэрээ бүр өөрийн богино гүйлгээ. Нэг гэрээ унавал
    rollback хийгээд ДАРААГИЙНХ руугаа явна; давхрага хэзээ ч үхэхгүй
    (SQLite WAL дээр удаан барьсан гүйлгээ бичигчийг түгждэг).
  · **Чимээгүй байдал** — юу ч үүсээгүй гүйлт МӨР ҮЛДЭЭХГҮЙ. Audit-д зөвхөн
    ҮНЭХЭЭР мөнгө үүссэн өдөр «cron: N нэхэмжлэл үүсэв» гэсэн НЭГ мөр орно.
"""
import asyncio
import os
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from .. import models
from ..db import SessionLocal
from . import billing
from .audit import SYSTEM as AUDIT_SYSTEM, log as audit_log

#: Орон нутгийн цаг — ажил эхлэхээс өмнө. Отгоо 09:00-д нээхэд бэлэн байна.
CRON_HOUR = 6
#: Сервер асаад тогтворжих зай. Reload-ын үед дараалсан асалт мөргөлдөхгүй.
START_DELAY = 30.0

#: Тестийн орчинд (`conftest`) 1 болно — давхрага ОГТ асахгүй, суут детерминистик.
ENV_FLAG = "JIGUUR_NO_CRON"


def disabled() -> bool:
    """`JIGUUR_NO_CRON=1` — давхрага асахгүй (тест, миграци, засварын гүйлт)."""
    return os.environ.get(ENV_FLAG, "").strip() == "1"


# ---------- цагийн ЦЭВЭР тоо бодолт (унтахгүйгээр шалгагдана) ----------

def next_run_at(now: datetime, hour: int = CRON_HOUR) -> datetime:
    """`now`-оос ХОЙШХИ хамгийн ойрын `hour:00` (орон нутгийн цаг).

    Яг `hour:00:00` дээр зогсож байвал ДАРААГИЙН өдрийг заана — өдөрт нэг
    удаа гэдэг нь нэг удаа. Улаанбаатарт зуны цаг байхгүй тул энгийн
    `timedelta(days=1)` хангалттай.
    """
    run = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    return run if run > now else run + timedelta(days=1)


def seconds_until(now: datetime, hour: int = CRON_HOUR) -> float:
    """Дараагийн гүйлт хүртэлх секунд — үргэлж (0, 24ц] завсарт."""
    return (next_run_at(now, hour) - now).total_seconds()


# ---------- ганц эх сурвалж: cron БА гар товчлуур хоёул ЭНД ирнэ ----------

def generate_all(db: Session, today: date | None = None) -> dict:
    """Идэвхтэй гэрээ БҮРД `ensure_invoices` — хуудас нээхтэй ЯГ ижил зам.

    `ensure_invoices` нь append-only бөгөөд шинэ нэхэмжлэл гарвал дотроо
    `apply_client_credit`-ыг дууддаг тул урьдчилсан төлбөр энд ч мөн адил
    өөрөө хаагдана. Энэ функц ЛОГИК ДАВХАРДУУЛАХГҮЙ — зөвхөн алхана.

    Буцна: {"date", "created", "contracts": [гэрээний №…], "errors": [...]}
    """
    today = today or date.today()
    created = 0
    touched: list[str] = []
    errors: list[dict] = []
    contracts = (db.query(models.Contract)
                 .filter(models.Contract.status == "active")
                 .order_by(models.Contract.id).all())
    for c in contracts:
        try:
            made = billing.ensure_invoices(db, c, today)
        except Exception as e:                       # noqa: BLE001
            # Нэг гэрээний эвдрэл БҮХ гэрээг зогсоох ёсгүй. Гүйлгээг сулласны
            # дараа л дараагийнх руу явна — эс бөгөөс SQLite түгжээтэй үлдэнэ.
            db.rollback()
            errors.append({"contract_id": c.id, "no": c.no, "error": repr(e)})
            print(f"[cron] гэрээ №{c.no}: {e!r}")
            continue
        if made:
            created += len(made)
            touched.append(c.no)
    return {"date": str(today), "created": created,
            "contracts": touched, "errors": errors}


def run_once(today: date | None = None) -> dict:
    """Өөрийн Session-той нэг гүйлт (давхрагын нэг цохилт).

    Юу ч үүсээгүй бол ЮУ Ч БИЧИХГҮЙ: өдөр бүр «0 нэхэмжлэл» гэж audit
    дүүргэвэл жагсаалт нь харагдахаа болино.
    """
    db = SessionLocal()
    try:
        res = generate_all(db, today)
        if res["created"]:
            # ⚠ Мөрийн ЭХЭНД «cron:» гэж бичигддэг байв — /audit-ийн
            # «Дэлгэрэнгүй» багана нь Отгоо эгчийн НҮД, тэнд англи үг байх
            # ёсгүй. Серверийн лог (`print`) нь хөгжүүлэгчийнх тул «[cron]»
            # хэвээр.
            line = (f"Өдөр тутмын гүйлт: {res['created']} нэхэмжлэл үүсэв · "
                    f"{len(res['contracts'])} гэрээ ({', '.join(res['contracts'])}) · "
                    f"{res['date']}")
            print("[cron] " + line)
            audit_log(db, AUDIT_SYSTEM, "cron", "invoice", None, line)
        if res["errors"]:
            print(f"[cron] {len(res['errors'])} гэрээ алдаатай — давхрага үргэлжилнэ")
    finally:
        db.close()
    return res


# ---------- давхрага ----------

async def daily_loop(hour: int = CRON_HOUR, first_delay: float = START_DELAY) -> None:
    """Асаад ~30с, дараа нь өдөр бүр `hour:00`.

    DB-ийн ажил нь sync тул `to_thread` — event loop (өөрөөр хэлбэл сервер)
    хэзээ ч түгжигдэхгүй. `CancelledError` нь унтралт: чимээгүй гарна.
    Бусад алдаа НЭГ гүйлтийг л алдагдуулна — давхрага үргэлжилнэ.
    """
    delay = first_delay
    while True:
        try:
            await asyncio.sleep(delay)
            await asyncio.to_thread(run_once)
        except asyncio.CancelledError:
            raise
        except Exception as e:                       # noqa: BLE001
            print(f"[cron] давхрагын алдаа: {e!r}")
        delay = seconds_until(datetime.now(), hour)


def start() -> asyncio.Task | None:
    """Давхрагыг асаана. `JIGUUR_NO_CRON=1` бол `None` — юу ч төлөвлөгдөхгүй."""
    if disabled():
        print("[cron] JIGUUR_NO_CRON=1 — өдөр тутмын нэхэмжлэл унтраалттай")
        return None
    print(f"[cron] өдөр бүр {CRON_HOUR:02d}:00-д нэхэмжлэл шалгана")
    return asyncio.create_task(daily_loop(), name="jiguur-daily-invoices")


async def stop(task: asyncio.Task | None) -> None:
    """Унтрахад давхрага ҮЛДЭХГҮЙ — цуцлаад дуустал нь хүлээнэ."""
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

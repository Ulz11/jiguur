"""Ажлын өдөр — ҮРГЭЛЖ Улаанбаатарын цагаар.

`date.today()` нь ПРОЦЕССЫН цагийн бүсийг уншина. Отгоо эгчийн ширээн дээрх
компьютер дээр тэр нь Улаанбаатар — зөв. Харин Vercel-ийн сервер UTC-гээр
явдаг: орой 23:30 (UB) бол UTC-д ӨЧИГДӨР хэвээр. Тэр агшинд нэхэмжлэл нь
өчигдрийн огноогоор төрж, «өнөөдрийн авлага» нэг өдөр хоцорно — мөнгө
алдагдахгүй ч тоо нь Отгооны цаасан дэвтэртэй ЗӨРНӨ, тэр нь ижил хэмжээний
итгэл эвдэх алдаа.

Тиймээс бизнесийн ӨДӨР энэ модулиас ирнэ. `datetime.utcnow()` (хадгалагдах
техникийн тэмдэглэгээ) нь ХЭВЭЭР — тэр нь «хэзээ бичигдсэн» бөгөөд UTC-д
хадгалагдана; харуулах агшинд нь орон нутгийн цаг руу ИЛЭРХИЙ хөрвүүлнэ.

Тест хоёр аргаар өдрийг барина:
  · `JIGUUR_TODAY=2026-03-20` env — дэд процесс (subprocess) хүртэл дагана;
  · `clock.freeze(date(2026, 3, 20))` — нэг тестийн дотор, `freeze(None)`-оор суллана.
"""
import os
from contextlib import contextmanager
from datetime import date, datetime
from zoneinfo import ZoneInfo

#: Бизнесийн цагийн бүс. Улаанбаатарт зуны цаг байхгүй (UTC+8 тогтмол).
TZ = ZoneInfo("Asia/Ulaanbaatar")

#: `freeze()`-ээр тавигдсан огноо. None бол бодит цаг.
_FROZEN: date | None = None


def freeze(day: date | None) -> None:
    """Тестийн дэгээ: `today()` буцаах өдрийг тогтооно. `None` — суллана."""
    global _FROZEN
    _FROZEN = day


@contextmanager
def frozen(day: date):
    """`with clock.frozen(date(2026, 3, 20)): …` — гарахад өмнөх төлөв сэргэнэ."""
    prev = _FROZEN
    freeze(day)
    try:
        yield day
    finally:
        freeze(prev)


def _env_today() -> date | None:
    raw = os.environ.get("JIGUUR_TODAY", "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def now_local() -> datetime:
    """Улаанбаатарын ОДОО (tz-той). Хөлдөөсөн бол тэр өдрийн 00:00."""
    if _FROZEN is not None:
        return datetime.combine(_FROZEN, datetime.min.time(), tzinfo=TZ)
    env = _env_today()
    if env is not None:
        return datetime.combine(env, datetime.min.time(), tzinfo=TZ)
    return datetime.now(TZ)


def today() -> date:
    """Улаанбаатарын ӨНӨӨДӨР — бизнесийн бүх огноо эндээс."""
    if _FROZEN is not None:
        return _FROZEN
    env = _env_today()
    if env is not None:
        return env
    return datetime.now(TZ).date()

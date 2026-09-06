"""Жигүүр Зам — түрээс, худалдааны удирдлагын систем (backend).

⚠ ЭНЭ МОДУЛИЙГ ИМПОРТЛОХОД DB-Д ЮУ Ч БОЛОХГҮЙ. Урьд нь импортын мөчид
нөөцлөлт хийж, хүснэгт үүсгэж, seed бичдэг байв — тэр нь нэг ажлын байрны
компьютер дээр эв нийтэй боловч хоёр газар эвдэрдэг:
  · serverless (Vercel) — процесс бүр асахдаа DB рүү бичих гэж оролдох нь
    хүйтэн эхлэлийг удаашруулж, зэрэгцээ процессууд бие бие рүүгээ мөргөнө;
  · тест/скрипт — `import app.main` гэсэн ганц мөр БОДИТ jiguur.db-г нээж
    нөөцөлдөг байв.
Локал дээрх зан төлөв ХЭВЭЭР: `JIGUUR_AUTO_INIT=1` (run.bat, launch.json)
байвал ЭХЛЭХ агшинд (lifespan) яг тэр дөрвөн алхам ажиллана.
"""
import os
import sqlite3
import time
from contextlib import asynccontextmanager, closing

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import clock
from .db import Base, engine, SessionLocal, get_db, DATABASE_URL, IS_SQLITE, IS_SERVERLESS
from .schema import migrate_schema
from .seed import seed
from . import models
from . import auth as session_routes
from .services import cron
from .routers import (core, contracts, clients, payments, dashboard, files,
                      barter, loans, machines, salary, reports, features, notes)

VERSION = "1.0.0"

#: Локал/оффисын зан төлөв: асахад хүснэгт үүсгэж, seed бичнэ. Vercel дээр
#: ХЭЗЭЭ Ч тавигдахгүй — тэнд схемийг `alembic upgrade head` зохицуулна.
AUTO_INIT_FLAG = "JIGUUR_AUTO_INIT"
#: Өдөр тутмын asyncio давхрага — default УНТРААЛТТАЙ. Serverless дээр
#: утгагүй (процесс амьдардаггүй), локал дээр хүсвэл 1 болгоно.
CRON_LOOP_FLAG = "JIGUUR_CRON_LOOP"


def auto_init_enabled() -> bool:
    return os.environ.get(AUTO_INIT_FLAG, "").strip() == "1"


def cron_loop_enabled() -> bool:
    """Давхрага асах уу. `JIGUUR_NO_CRON=1` нь хуучин ЗОГСООХ дэгээ — дардаг."""
    if cron.disabled():
        return False
    return os.environ.get(CRON_LOOP_FLAG, "").strip() == "1"


# ---------- Автомат нөөцлөлт (зөвхөн ИЛЭРХИЙ асаалт дээр) ----------
def backup_db(keep: int = 14, src: str | None = None, bdir: str | None = None):
    """DB-г өөрийнх нь хажуугийн backups/ дотор хуулж, сүүлийн `keep`-ийг үлдээнэ.

    Нөөцийн хавтас DB файлаа дагана (dirname(src)/backups) — тестийн түр DB
    бодит backups/-ыг идэхгүй. JIGUUR_BACKUP_DIR env-ээр өөр газар заана.

    sqlite3-ийн backup API-г ашиглана: WAL (-wal) файлд сууж буй дата-г хуулбар руу
    шингээж бичдэг. Өмнө нь shutil.copy2 зөвхөн үндсэн файлыг хуулдаг тул
    нөөц бараг хоосон бүрхүүл болдог байв (үндсэн 4КБ ↔ WAL 770КБ).
    """
    if src is None:
        if not IS_SQLITE or ":memory:" in DATABASE_URL:
            return
        src = DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(src) or os.path.getsize(src) == 0:
        return
    bdir = bdir or os.environ.get("JIGUUR_BACKUP_DIR") or os.path.join(
        os.path.dirname(os.path.abspath(src)), "backups")
    os.makedirs(bdir, exist_ok=True)
    dst = os.path.join(bdir, f"jiguur-{clock.now_local():%Y%m%d-%H%M}.db")
    try:
        with closing(sqlite3.connect(src)) as s, closing(sqlite3.connect(dst)) as d:
            s.backup(d)
        files_ = sorted(f for f in os.listdir(bdir) if f.endswith(".db"))
        for old in files_[:-keep]:
            os.unlink(os.path.join(bdir, old))
    except (OSError, sqlite3.Error) as e:
        print("Нөөцлөлт амжилтгүй:", e)


def auto_init() -> None:
    """Оффисын асаалт: нөөц → хүснэгт → дутуу багана → seed.

    Яг өмнөх импортын үеийн дөрвөн алхам, гагцхүү одоо ИЛЭРХИЙ.
    """
    backup_db()
    Base.metadata.create_all(engine)   # ШИНЭ хүснэгтүүд
    migrate_schema(engine)             # хуучин хүснэгтийн ДУТУУ баганууд
    with SessionLocal() as db:
        seed(db)


@asynccontextmanager
async def lifespan(fastapi_app: FastAPI):
    """Асах/унтрах: (заавал бол) DB бэлтгэл, (хүсвэл) өдөр тутмын давхрага.

    Нэхэмжлэл нь урьд нь ЗӨВХӨН хэн нэгэн хуудас нээх агшинд төрдөг байв —
    Отгоо аппаа нээхгүй бол мөнгө байхгүй. Одоо хоёр зам бий:
      · оффисын сервер — `JIGUUR_CRON_LOOP=1`, өдөр бүр 06:00 (`services/cron.py`);
      · Vercel — `GET /api/cron/daily`, Vercel Cron өдөрт нэг удаа цохино.
    """
    if auto_init_enabled():
        auto_init()
    fastapi_app.state.cron_task = cron.start() if cron_loop_enabled() else None
    try:
        yield
    finally:
        await cron.stop(fastapi_app.state.cron_task)
        fastapi_app.state.cron_task = None


app = FastAPI(title="Жигүүр Систем", version=VERSION, docs_url="/api/docs",
              redoc_url=None, openapi_url="/api/openapi.json", lifespan=lifespan)

# Дотоод сүлжээнд ажиллахад origin хязгаарлалт хэрэггүй (Bearer token ашиглана);
# Vercel дээр frontend нь өөр домэйн дээр суувал JIGUUR_ALLOWED_ORIGINS-оор нэрлэнэ.
ALLOWED_ORIGINS = [o.strip() for o in
                   os.environ.get("JIGUUR_ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS,
                   allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ---------- Алдааны нэгдсэн хариу ----------
@app.middleware("http")
async def catch_errors(request: Request, call_next):
    t0 = time.time()
    try:
        response = await call_next(request)
    except Exception as e:  # noqa: BLE001
        print(f"[АЛДАА] {request.method} {request.url.path}: {e!r}")
        return JSONResponse(status_code=500,
                            content={"detail": "Дотоод алдаа гарлаа. Дахин оролдоно уу."})
    response.headers["X-Response-Time"] = f"{(time.time() - t0) * 1000:.0f}ms"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


# ⚠ СЕССИ нь core-оос ӨМНӨ. `app/auth.py` дахь `/api/auth/login` ба
# `/api/auth/me` нь `routers/core.py`-ийн ижил нэртэй хоёр цэгийг ДАРНА
# (FastAPI эхний таарсан замаа сонгоно): нэвтрэлт/гаралт нь /audit дээр
# мөрөө үлдээх ба `me` нь токены дуусах хугацаа, «нууц үгээ сольдоо юу»
# гэдгийг авч явна. Core дахь хуучин хоёрыг устгах нь тэр файлын эзний ажил.
app.include_router(session_routes.router)

for r in (core, contracts, clients, payments, dashboard, files,
          barter, loans, machines, salary, reports, features, notes):
    app.include_router(r.router)


@app.get("/api/health")
def health(db=Depends(get_db)):
    return {"ok": True, "app": "Жигүүр Систем", "version": VERSION,
            "clients": db.query(models.Client).count(),
            "contracts": db.query(models.Contract).count(),
            "db": "sqlite" if IS_SQLITE else "postgres"}


@app.get("/api/cron/daily")
def cron_daily(authorization: str = Header(default=""), db=Depends(get_db)):
    """Өдөр тутмын нэхэмжлэл — ГАДНААС цохигдоно (Vercel Cron).

    Serverless дээр процесс амьдардаггүй тул asyncio давхрага утгагүй.
    Vercel Cron нь `Authorization: Bearer $CRON_SECRET` явуулдаг; нууц үг
    тохируулаагүй бол цэг нь ОГТ нээгдэхгүй (503) — «хамгаалалтгүй ил
    цэг» гэдэг нь бүр ч дор.

    Хариу нь `run_once`-ийн Audit мөр ӨӨРӨӨ: Vercel-ийн лог дээр яг тэр
    өгүүлбэр харагдана, /audit дээр ч мөн адил.
    """
    secret = os.environ.get("CRON_SECRET", "").strip()
    if not secret:
        raise HTTPException(503, "CRON_SECRET тохируулаагүй байна")
    given = authorization.removeprefix("Bearer ").strip()
    if given != secret:
        raise HTTPException(401, "Зөвшөөрөлгүй")
    res = cron.run_once(db=db)
    return {"ok": True, "line": cron.run_line(res), **res}


# ---- Frontend (build хийсэн бол backend-ээс шууд serve хийнэ) ----
# Vercel дээр статикийг платформ өөрөө тараана — Python функц дотор mount
# хийвэл bundle хавдаж, catch-all нь 404-ийг ч барьж авна.
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    "frontend", "dist")
if os.path.isdir(DIST) and not IS_SERVERLESS:
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        full = os.path.normpath(os.path.join(DIST, path))
        if path and full.startswith(DIST) and os.path.isfile(full):
            return FileResponse(full)
        return FileResponse(os.path.join(DIST, "index.html"))

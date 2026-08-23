"""Жигүүр Зам — түрээс, худалдааны удирдлагын систем (backend)."""
import os
import shutil
import time
from datetime import datetime

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import Base, engine, SessionLocal, get_db, BASE_DIR, DATABASE_URL, IS_SQLITE
from .seed import seed
from . import models
from .routers import (core, contracts, clients, payments, dashboard, files,
                      barter, loans, machines, salary, reports, features)

VERSION = "1.0.0"

app = FastAPI(title="Жигүүр Систем", version=VERSION, docs_url="/api/docs",
              redoc_url=None, openapi_url="/api/openapi.json")

# Дотоод сүлжээнд ажиллана — origin хязгаарлалт хэрэггүй (Bearer token ашиглана).
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ---------- Автомат нөөцлөлт (сервер асах бүрд) ----------
def backup_db(keep: int = 14):
    """jiguur.db-г backups/ дотор өдрөөр хуулж, сүүлийн `keep`-ийг үлдээнэ."""
    if not IS_SQLITE or ":memory:" in DATABASE_URL:
        return
    src = DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(src) or os.path.getsize(src) == 0:
        return
    bdir = os.path.join(BASE_DIR, "backups")
    os.makedirs(bdir, exist_ok=True)
    dst = os.path.join(bdir, f"jiguur-{datetime.now():%Y%m%d-%H%M}.db")
    try:
        shutil.copy2(src, dst)
        files_ = sorted(f for f in os.listdir(bdir) if f.endswith(".db"))
        for old in files_[:-keep]:
            os.unlink(os.path.join(bdir, old))
    except OSError as e:
        print("Нөөцлөлт амжилтгүй:", e)


backup_db()
Base.metadata.create_all(engine)
with SessionLocal() as db:
    seed(db)


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


for r in (core, contracts, clients, payments, dashboard, files,
          barter, loans, machines, salary, reports, features):
    app.include_router(r.router)


@app.get("/api/health")
def health(db=Depends(get_db)):
    return {"ok": True, "app": "Жигүүр Систем", "version": VERSION,
            "clients": db.query(models.Client).count(),
            "contracts": db.query(models.Contract).count(),
            "db": "sqlite" if IS_SQLITE else "postgres"}


# ---- Frontend (build хийсэн бол backend-ээс шууд serve хийнэ) ----
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        full = os.path.normpath(os.path.join(DIST, path))
        if path and full.startswith(DIST) and os.path.isfile(full):
            return FileResponse(full)
        return FileResponse(os.path.join(DIST, "index.html"))

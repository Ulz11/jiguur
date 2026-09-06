"""Vercel-ийн ГАНЦ Python функц — бүх `/api/*` хүсэлт эндүүр орно.

Vercel-ийн Python runtime нь `/api` доторх `.py` файлын ДЭЭД ТҮВШНИЙ `app`
хувьсагчийг ASGI аппликейшн гэж ШУУД ачаална — mangum/adapter ХЭРЭГГҮЙ:
https://vercel.com/docs/functions/runtimes/python/api-directory
(«Each `.py` file must define one of these top-level names: `app` for an ASGI
or WSGI application».)

`api/index.py` нь өөрөө `/api` замд суудаг; `/api/clients` мэтийн бусад бүх
зам нь `vercel.json`-ы `rewrites` дүрмээр («/api/(.*)» → «/api/index») энэ
файл руу ирнэ.
"""

import os
import sys
from pathlib import Path

# ── 1. Backend-ийг импортлох боломжтой болгоно ───────────────────────────────
# `system/backend` нь суулгасан багц БИШ — sys.path руу гараар нэмнэ.
# Файлууд нь `vercel.json`-ы `functions.includeFiles` дүрмээр bundle дотор
# орж ирдэг (PDF-ийн үсгийн фонт: `system/backend/assets/fonts/*.ttf`).
BACKEND = Path(__file__).resolve().parent.parent / "system" / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# ── 2. Serverless-ийн үндсэн утгууд ──────────────────────────────────────────
# `VERCEL` тугийг платформ өөрөө тавьдаг; `vercel dev` эсвэл гар аргаар
# ачаалах үед ч ижил зан гаргахын тулд энд БАТАЛГААЖУУЛНА. Энэ туг нь:
#   · `db.py`     → холболтын pool-ыг serverless горимд тохируулна;
#   · `main.py`   → `frontend/dist` статикийг mount ХИЙХГҮЙ, SPA catch-all
#                   унтарна (статикийг Vercel өөрөө тараана).
os.environ.setdefault("VERCEL", "1")
os.environ.setdefault("JIGUUR_ENV", "prod")

# ── 3. Аппликейшн ────────────────────────────────────────────────────────────
# Импорт нь ГАЖ НӨЛӨӨГҮЙ: DATABASE_URL, JIGUUR_SECRET, CRON_SECRET зэргийг
# Vercel-ийн Environment Variables-ээс уншина (кодонд нууц үг байхгүй).
from app.main import app  # noqa: E402  (sys.path-ыг тохируулсны ДАРАА)

__all__ = ["app"]

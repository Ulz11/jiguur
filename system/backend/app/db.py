"""DB холболт — default SQLite, DATABASE_URL env-ээр Neon Postgres руу шилжинэ.

Хоёр орчин, НЭГ код:
  · Отгоогийн компьютер — SQLite файл, WAL, олон жилийн зан төлөв хэвээр;
  · Vercel + Neon — Postgres, процесс бүр хормын төдий амьдардаг тул
    холболтын сан (pool) БАРИХГҮЙ (`NullPool`), pgbouncer-ийн ард
    prepared statement УНТРААНА.

Engine-ийн тохиргоог `engine_options()` гэсэн ЦЭВЭР функц гаргаж өгнө:
холболт нээхгүйгээр тестлэгдэнэ — «Neon дээр яг ямар тохиргоотой ажиллах вэ»
гэсэн асуулт нь бодит Neon-гүйгээр хариултаа авна.
"""
import os
from urllib.parse import urlsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool, QueuePool

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_URL = f"sqlite:///{os.path.join(BASE_DIR, 'jiguur.db')}"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_URL)

#: Vercel (эсвэл өөр serverless) дээр ажиллаж байна уу — платформ өөрөө тавина.
IS_SERVERLESS = bool(os.environ.get("VERCEL"))

#: Локал хост гэж тооцох нэрс — эдгээрт SSL шаардахгүй.
LOCAL_HOSTS = {"", "localhost", "127.0.0.1", "::1", "0.0.0.0"}


def normalize_url(url: str) -> str:
    """Neon-ийн `postgresql://…` → `postgresql+psycopg://…` (psycopg 3).

    Neon/Vercel-ийн хуулж өгдөг мөр драйверээ заадаггүй тул SQLAlchemy нь
    psycopg2 хайж олохгүй унана. `postgres://` (heroku-гийн хуучин хэлбэр) ч
    мөн адил засагдана.
    """
    for old in ("postgresql+psycopg://", "postgresql+psycopg2://", "postgresql+asyncpg://"):
        if url.startswith(old):
            return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


def is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def engine_options(url: str, serverless: bool = False) -> dict:
    """URL → `create_engine`-ийн нэрлэсэн аргументууд. ЦЭВЭР функц.

    SQLite: өнөөдрийнхтэй ЯГ ижил (check_same_thread=False, timeout=20).

    Postgres:
      · `serverless` (Vercel) — `NullPool`. Функцын процесс хүсэлт бүрийн
        дараа хөлддөг тул сан барих нь холболтоо алдаж, дараагийн дуудалт
        «server closed the connection unexpectedly» гэж унана;
      · үгүй бол жижигхэн `QueuePool(pool_size=2)` — Neon-ийн үнэгүй
        төлөвлөгөө холболт цөөтэй, нэг сервер олон холболт барих ёсгүй;
      · `sslmode=require` — зөвхөн ГАДНЫ хост дээр (локал Postgres дээр
        SSL асаалгүй тул шаардвал холбогдохгүй);
      · `prepare_threshold=None` — URL-д `-pooler` байвал (Neon-ийн
        pgbouncer). Transaction pooling дээр prepared statement нь өөр
        холболт руу унаж «prepared statement … does not exist» өгдөг.
    """
    if is_sqlite(url):
        return {"connect_args": {"check_same_thread": False, "timeout": 20},
                "pool_pre_ping": True}

    host = (urlsplit(url).hostname or "").lower()
    connect_args: dict = {}
    if host not in LOCAL_HOSTS:
        connect_args["sslmode"] = "require"
    if "-pooler" in url:
        connect_args["prepare_threshold"] = None

    opts: dict = {"connect_args": connect_args}
    if serverless:
        opts["poolclass"] = NullPool
    else:
        opts["poolclass"] = QueuePool
        opts["pool_size"] = 2
        opts["max_overflow"] = 2
        opts["pool_recycle"] = 300
        opts["pool_pre_ping"] = True
    return opts


DATABASE_URL = normalize_url(DATABASE_URL)
IS_SQLITE = is_sqlite(DATABASE_URL)
engine = create_engine(DATABASE_URL, **engine_options(DATABASE_URL, IS_SERVERLESS))

if IS_SQLITE:
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _rec):
        """WAL — хэд хэдэн хүн зэрэг ажиллахад бичих/уншихыг зэрэгцүүлнэ.
        Ажлын хэсэг санах ойд → хурд; foreign_keys → бүрэн бүтэн байдал."""
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=20000")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

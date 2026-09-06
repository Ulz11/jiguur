"""Тестийн ГАНЦ engine хаалга — SQLite ба Postgres хоёулаа.

`TEST_DATABASE_URL` тавьсан бол БҮХ тест тэр сан дээр явна:

    TEST_DATABASE_URL=postgresql+psycopg://localhost/jiguur_test \
        ./.venv/bin/python -m pytest tests/ -q

Тавиагүй бол өнөөдрийнхтэй ЯГ ИЖИЛ: санах ойн / түр файлын SQLite.

Postgres дээр «тест бүрт шинэ сан» гэдэг нь боломжгүй удаан (CREATE DATABASE
секунд иднэ). Оронд нь: хүснэгтүүд СЕССИД НЭГ УДАА үүсээд, тест бүрийн өмнө
`TRUNCATE … RESTART IDENTITY CASCADE` — id-ууд 1-ээс эхлэх тул SQLite дээрх
«шинэ файл» -тай ялгаагүй болно (тестүүд id=1 гэж хүлээдэг газар олон).
"""
import os
import tempfile

from sqlalchemy import create_engine, text

#: Тохируулсан бол Postgres (эсвэл өөр сан) дээр гүйнэ.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()


def is_postgres() -> bool:
    return TEST_DATABASE_URL.startswith(("postgresql", "postgres://"))


def _normalize(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


#: Postgres дээр engine нь СЕССИД НЭГ — холболт бүрд шинэ pool барих нь
#: (тест 1054 ширхэг) сервер рүү мянган холболт нээнэ.
_PG_ENGINE = None


def _pg_engine():
    global _PG_ENGINE
    if _PG_ENGINE is None:
        from app.db import Base
        _PG_ENGINE = create_engine(_normalize(TEST_DATABASE_URL), pool_pre_ping=True,
                                   connect_args={"application_name": APP_MAIN})
        Base.metadata.create_all(_PG_ENGINE)
    return _PG_ENGINE


#: Хоёр engine-ийг сангийн талд ЯЛГАХ нэр — цэвэрлэгээ зөвхөн ӨӨРИЙНХӨӨ
#: холболтыг таслахын тулд (нөгөөгийнх нь тэр агшинд АМЬД байж болно).
APP_MAIN = "jiguur_test_main"
APP_ALT = "jiguur_test_alt"


def truncate_all(engine, schema: str | None = None) -> None:
    """Бүх хүснэгтийг хоослож, id тоологчийг 1 рүү буцаана.

    ⚠ ЭХЛЭЭД `dispose()`. `TRUNCATE` нь ACCESS EXCLUSIVE түгжээ шаарддаг тул
    өмнөх тестийн ХААГДААГҮЙ session (сангийн талд «idle in transaction»)
    түүнийг МӨНХӨД хүлээлгэнэ — гүйлт чимээгүй өлгөгдөнө. Тестүүд дотроо
    session-оо үргэлж хаадаггүй (олон нь `sessionmaker(...)()`-ыг шууд
    дуудаад орхидог) тул сангийн цэвэрлэгээ тэднээс ХАМААРАХГҮЙ байх ёстой:
    pool-оо унтраавал тэр холболтууд таслагдаж, гүйлгээ нь rollback болно.
    """
    from app.db import Base
    # 1) Өөрийн pool-оо унтраана — сул холболтууд хаагдана.
    engine.dispose()
    app_name = APP_ALT if schema else APP_MAIN
    prefix = f"{schema}." if schema else ""
    names = ", ".join(f'{prefix}"{t}"' for t in Base.metadata.tables)
    if not names:
        return
    with engine.begin() as conn:
        # 2) ХААГДААГҮЙ session-ууд (pool-оос гарсан, буцаж ирээгүй холболт)
        #    `dispose()`-д баригдахгүй — тэднийг НЭРЛЭЖ таслана. Энэ нь
        #    ЗӨВХӨН тестийн зориулалтын сан (`TEST_DATABASE_URL`) тул
        #    хэн нэгний ажлыг тасалж болохгүй.
        #    ⚠ ЗӨВХӨН ӨӨРИЙНХӨӨ engine-ийн (`application_name`) ба ЗӨВХӨН
        #    «idle in transaction» холболтыг — нөгөө engine нь тэр агшинд
        #    АМЬД ертөнц барьж байж болно (cron-ы паритетын тест).
        conn.execute(text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() AND pid <> pg_backend_pid() "
            "  AND application_name = :app AND state = 'idle in transaction'"),
            {"app": app_name})
        # 3) Түгжээ хүлээхгүй: дахин алдагдвал МӨНХӨД өлгөгдөхийн оронд
        #    ойлгомжтой алдаа өгнө.
        conn.execute(text("SET LOCAL lock_timeout = '15s'"))
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


def test_engine(path: str | None = None, **kw):
    """Тестийн engine. `path` нь SQLite ФАЙЛЫН зам (None → санах ой).

    Postgres дээр `path`-ыг ҮЛ ХЭРЭГСЭНЭ: нэг сан, тест бүрийн өмнө TRUNCATE.
    `dispose_after` нь дуудагчийн ажил (`engine.dispose()`), Postgres дээр
    нэгдсэн engine тул `dispose` нь юу ч эвдэхгүй — pool л сэргэнэ.
    """
    if TEST_DATABASE_URL:
        eng = _pg_engine()
        truncate_all(eng)
        return eng
    url = "sqlite://" if path is None else "sqlite:///" + str(path)
    kw.setdefault("connect_args", {"check_same_thread": False})
    return create_engine(url, **kw)


#: Хоёр дахь, БҮРЭН ТУСДАА ертөнц (паритетын тест хоёр санг зэрэг барина).
_ALT_ENGINE = None
ALT_SCHEMA = "jiguur_alt"


def alt_engine():
    """ХОЁР ДАХЬ бие даасан сан — үндсэнхтэйгээ ямар ч мөр хуваалцахгүй.

    SQLite дээр энэ нь ердөө санах ойн шинэ engine. Postgres дээр шинэ
    САН үүсгэх нь удаан тул тусдаа СХЕМ (`jiguur_alt`) хэрэглэнэ:
    `search_path` түүн рүү заасан холболт нь `public`-ийг огт хардаггүй
    тул тусгаарлалт нь сан үүсгэсэнтэй ижил.
    """
    global _ALT_ENGINE
    if not TEST_DATABASE_URL:
        return create_engine("sqlite://", connect_args={"check_same_thread": False})
    from app.db import Base
    if _ALT_ENGINE is None:
        with _pg_engine().begin() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {ALT_SCHEMA}"))
        _ALT_ENGINE = create_engine(
            _normalize(TEST_DATABASE_URL), pool_pre_ping=True,
            connect_args={"options": f"-csearch_path={ALT_SCHEMA}",
                          "application_name": APP_ALT})
        Base.metadata.create_all(_ALT_ENGINE)
    truncate_all(_ALT_ENGINE, schema=ALT_SCHEMA)
    return _ALT_ENGINE


def temp_sqlite_path(suffix: str = ".db") -> str:
    """Түр SQLite файл (Postgres горимд ч дуудагдаж болно — зөвхөн зам)."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    return path


def dispose(engine) -> None:
    """Postgres дээр НЭГДСЭН engine-ийг үхүүлэхгүй — pool-ыг л сэргээнэ."""
    if TEST_DATABASE_URL:
        return
    engine.dispose()

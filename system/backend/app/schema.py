"""SQLite-ийн схемийн автомат шинэчлэл.

Моделид нэмэгдсэн боловч DB дээр байхгүй баганыг `ALTER TABLE … ADD COLUMN`-оор
нөхнө. Хүснэгт бүхэлдээ дутуу бол энэ модулийн ажил БИШ — түүнийг
`Base.metadata.create_all` үүсгэнэ.

Дахин ажиллуулахад аюулгүй (idempotent): багана байгаа бол алгасна.

⚠ ЗӨВХӨН SQLite. Postgres дээр схемийг Alembic (`alembic/`) авч явна —
`python -m app.migrate --create` нь диалектаа хараад зөв замаа сонгоно.
Дата НӨХӨЛТ энэ файлаас гарсан: `app/schema_backfills.py`, `--backfill`.
"""
from sqlalchemy import inspect

from .db import Base

# Хуучин дуудагчид эвдрэхгүй — нөхөлтүүд `schema_backfills`-д нүүсэн.
from .schema_backfills import (BACKFILLS, backfill_deposit_events,  # noqa: F401
                               backfill_movement_line_rates,
                               backfill_penalty_charges, run_all as run_backfills)


def _default_sql(col) -> str:
    """Тогтмол анхны утгыг DEFAULT болгож буулгана.

    `datetime.utcnow` мэт дуудагдах default-ыг SQL руу буулгах боломжгүй — SQLAlchemy
    INSERT дээр өөрөө бөглөдөг тул хуучин мөрүүд NULL үлдэнэ.
    """
    d = col.default
    if d is None or not getattr(d, "is_scalar", False):
        return ""
    v = d.arg
    if isinstance(v, bool):
        v = int(v)
    if isinstance(v, str):
        return " DEFAULT '" + v.replace("'", "''") + "'"
    return f" DEFAULT {v}"


def migrate_schema(engine) -> list[str]:
    """Дутуу баганыг нөхөж, нэмсэн багануудынхаа нэрийг буцаана."""
    # Postgres дээр схемийг Alembic авч явна — энд юу ч хийхгүй.
    if engine.dialect.name != "sqlite":
        return []

    # `PRAGMA table_info` биш `inspect(engine)` — SQLAlchemy-ийн диалект
    # хөндлөн API. (Энэ функц SQLite-д л ажилладаг ч түүхий PRAGMA нь
    # «энэ файл зөвхөн SQLite мэднэ» гэсэн уяа болж үлддэг.)
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    added: list[str] = []
    with engine.begin() as conn:
        for name, table in Base.metadata.tables.items():
            if name not in existing:
                continue                      # хүснэгт байхгүй → create_all-ын ажил
            have = {c["name"] for c in insp.get_columns(name)}
            for col in table.columns:
                if col.name in have:
                    continue
                # NOT NULL нэмэхийг SQLite зөвшөөрдөггүй (хуучин мөрүүд зөрчих тул) —
                # багана үргэлж nullable-аар нэмэгдэж, DEFAULT-аар нь хуучин мөрүүд дүүрнэ.
                ddl = (f'ALTER TABLE "{name}" ADD COLUMN "{col.name}" '
                       f'{col.type.compile(dialect=engine.dialect)}{_default_sql(col)}')
                conn.exec_driver_sql(ddl)
                added.append(f"{name}.{col.name}")
                print(f"Схем шинэчлэв: {name}.{col.name}")
    return added

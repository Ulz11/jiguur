"""Схемийн автомат шинэчлэл — сервер асах бүрд ажиллана.

Alembic оруулахгүйгээр: моделид нэмэгдсэн боловч DB дээр байхгүй баганыг
`ALTER TABLE … ADD COLUMN`-оор нөхнө. Хүснэгт бүхэлдээ дутуу бол энэ модулийн
ажил БИШ — түүнийг `Base.metadata.create_all` үүсгэнэ.

Дахин ажиллуулахад аюулгүй (idempotent): багана байгаа бол алгасна.
"""
from .db import Base


def _has_tables(conn, *names) -> bool:
    for n in names:
        if not conn.exec_driver_sql(f'PRAGMA table_info("{n}")').fetchall():
            return False
    return True


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
    # Postgres дээр схемийн өөрчлөлтийг ГАРААР (psql) хийнэ — энд юу ч хийхгүй.
    if engine.dialect.name != "sqlite":
        return []

    added: list[str] = []
    with engine.begin() as conn:
        for name, table in Base.metadata.tables.items():
            rows = conn.exec_driver_sql(f'PRAGMA table_info("{name}")').fetchall()
            if not rows:
                continue                      # хүснэгт байхгүй → create_all-ын ажил
            have = {r[1] for r in rows}
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

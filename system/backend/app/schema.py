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


def backfill_movement_line_rates(engine):
    """Үе 1 (падан загвар): хуучин ОЛГОЛТЫН мөрүүдэд тарифыг тамгална.

    Гэрээний мөрөөс (contract_items) авна — түрээс бол daily_rate, худалдаа бол
    unit_price. `contract_items`-д давхардлыг хориглосон индекс байхгүй тул
    LIMIT 1. Зөвхөн `rate IS NULL` мөрүүдэд хүрнэ (idempotent); буцаалт/актын
    мөр тариф авч явдаггүй тул хөндөгдөхгүй.
    """
    with engine.begin() as conn:
        if not _has_tables(conn, "movement_lines", "movements", "contracts", "contract_items"):
            return
        conn.exec_driver_sql("""
            UPDATE movement_lines SET rate = (
                SELECT CASE WHEN c.type = 'sale' THEN ci.unit_price ELSE ci.daily_rate END
                  FROM movements m
                  JOIN contracts c ON c.id = m.contract_id
                  JOIN contract_items ci ON ci.contract_id = c.id
                       AND ci.material_id = movement_lines.material_id
                       AND ci.grade_id = movement_lines.grade_id
                 WHERE m.id = movement_lines.movement_id
                 LIMIT 1)
            WHERE rate IS NULL
              AND movement_id IN (SELECT id FROM movements WHERE type = 'ISSUE')
        """)


def backfill_penalty_charges(engine):
    """Үе M2 (алданги = хөшүүрэг): ХУУЧИН автомат нэхэлтүүдийг явдал болгоно.

    Алданги урьд нь төлбөр бүртгэх агшинд ӨӨРӨӨ номжиж байсан тул хуучин
    DB-үүдэд `penalty_booked_until` тавигдсан нэхэмжлэлүүд байна — гэвч
    ямар ч `PenaltyCharge` явдалгүй. Дахин бодолт (rebuild) одоо ЯВДЛААР
    replay хийдэг тул тэдгээрийг нөхөхгүй бол ЭХНИЙ засварын үед хуучин
    нэхэлтүүд ЧИМЭЭГҮЙ УСТАЖ, тэдгээрт төлөгдсөн мөнгө өөр тийш явна —
    «машин түүхийг дахин бичлээ» гэсэн итгэл эвдэх алдаа (H6).

    Гэрээ × огноо бүрд НЭГ явдал (тэр огноогоор нэхэгдсэн нэхэмжлэлүүдийн
    нийлбэр дүнтэй). Replay нь огноог нь дахин нэхдэг тул дүн нь баримт
    төдий — тухайн үед нэг ажиллагаагаар номжсоныг ойролцоолж сэргээнэ.
    Дахин ажиллуулахад аюулгүй: аль хэдийн явдалтай (гэрээ, огноо) хосыг
    алгасна.
    """
    with engine.begin() as conn:
        if not _has_tables(conn, "penalty_charges", "invoices", "contracts"):
            return
        # `created_at` нь тэр өдрийн 00:00 — replay-ийн эрэмбэд нэхэлт нь ТЭР
        # ӨДРИЙН төлбөрөөс ӨМНӨ орно. Хуучин автомат зан яг ийм байсан:
        # төлбөрийн POST дотор эхлээд номжиж, дараа нь хуваарилдаг байв.
        # `void_reason` / `voided_by` нь ИЛЭРХИЙ бичигдэнэ: шинэ хүснэгт
        # (`create_all`) дээр эдгээр нь NOT NULL — DEFAULT нь зөвхөн ALTER-ээр
        # нэмэгдсэн хуучин DB дээр байдаг тул түүхий INSERT өөрөө бөглөх ёстой.
        conn.exec_driver_sql("""
            INSERT INTO penalty_charges (contract_id, client_id, as_of, amount,
                                         user_name, created_at,
                                         void_reason, voided_by)
            SELECT i.contract_id, c.client_id, i.penalty_booked_until,
                   ROUND(SUM(i.penalty_booked), 2), '(хуучин системээс)',
                   i.penalty_booked_until || ' 00:00:00', '', ''
              FROM invoices i
              JOIN contracts c ON c.id = i.contract_id
             WHERE i.penalty_booked_until IS NOT NULL
             GROUP BY i.contract_id, c.client_id, i.penalty_booked_until
            HAVING NOT EXISTS (
                     SELECT 1 FROM penalty_charges pc
                      WHERE pc.contract_id = i.contract_id
                        AND pc.as_of = i.penalty_booked_until)
        """)


# Үе шат бүрийн дата нөхөлт энд бүртгэгдэнэ: fn(engine).
# ALTER-үүд дууссаны ДАРАА дарааллаараа ажиллана. Функц бүр өөрөө idempotent байх ёстой.
BACKFILLS: list = [backfill_movement_line_rates, backfill_penalty_charges]


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

    for fn in BACKFILLS:
        fn(engine)
    return added

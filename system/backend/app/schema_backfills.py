"""Дата нөхөлт — ХУУЧИН сангийн мөрүүдийг шинэ ойлголт руу зөөнө.

⚠ Эдгээр нь СХЕМИЙН ажил БИШ, ДАТА-гийн ажил. Урьд нь `migrate_schema`-ийн
сүүлд шууд наалдсан байсан тул сервер асах БҮРД бүх мөрийг сканддаг байв —
Postgres дээр (олон процесс зэрэг асдаг) энэ нь илүү аюултай: гурван том
UPDATE зэрэг явж бие бие рүүгээ түгжээ барина.

Одоо ИЛЭРХИЙ, ГАРААР: `python -m app.migrate --backfill`. Гурвуулаа
idempotent тул хэдэн ч удаа ажиллуулж болно.

Хоёр диалектад ажиллана. Ялгаа ердөө хоёр газар:
  · `date || ' 00:00:00'` (SQLite-ийн текст огноо) ↔ `CAST(x AS timestamp)`;
  · `ROUND(float, 2)` — Postgres-д ийм функц БАЙХГҮЙ, numeric руу хөрвүүлнэ.
"""
from sqlalchemy import inspect


def _has_tables(engine, *names) -> bool:
    insp = inspect(engine)
    return all(insp.has_table(n) for n in names)


def _midnight(engine, col: str) -> str:
    """`col` (DATE) → тэр өдрийн 00:00:00 гэсэн timestamp илэрхийлэл."""
    if engine.dialect.name == "sqlite":
        return f"{col} || ' 00:00:00'"
    return f"CAST({col} AS timestamp)"


def _round2(engine, expr: str) -> str:
    """Postgres-д `round(double precision, int)` байхгүй — numeric-ээр дамжина."""
    if engine.dialect.name == "sqlite":
        return f"ROUND({expr}, 2)"
    return f"ROUND(CAST({expr} AS numeric), 2)"


def backfill_movement_line_rates(engine):
    """Үе 1 (падан загвар): хуучин ОЛГОЛТЫН мөрүүдэд тарифыг тамгална.

    Гэрээний мөрөөс (contract_items) авна — түрээс бол daily_rate, худалдаа бол
    unit_price. `contract_items`-д давхардлыг хориглосон индекс байхгүй тул
    LIMIT 1. Зөвхөн `rate IS NULL` мөрүүдэд хүрнэ (idempotent); буцаалт/актын
    мөр тариф авч явдаггүй тул хөндөгдөхгүй.
    """
    if not _has_tables(engine, "movement_lines", "movements", "contracts", "contract_items"):
        return
    with engine.begin() as conn:
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
    if not _has_tables(engine, "penalty_charges", "invoices", "contracts"):
        return
    # `created_at` нь тэр өдрийн 00:00 — replay-ийн эрэмбэд нэхэлт нь ТЭР
    # ӨДРИЙН төлбөрөөс ӨМНӨ орно. Хуучин автомат зан яг ийм байсан:
    # төлбөрийн POST дотор эхлээд номжиж, дараа нь хуваарилдаг байв.
    # `void_reason` / `voided_by` нь ИЛЭРХИЙ бичигдэнэ: шинэ хүснэгт
    # (`create_all`) дээр эдгээр нь NOT NULL — DEFAULT нь зөвхөн ALTER-ээр
    # нэмэгдсэн хуучин DB дээр байдаг тул түүхий INSERT өөрөө бөглөх ёстой.
    made_at = _midnight(engine, "i.penalty_booked_until")
    total = _round2(engine, "SUM(i.penalty_booked)")
    with engine.begin() as conn:
        conn.exec_driver_sql(f"""
            INSERT INTO penalty_charges (contract_id, client_id, as_of, amount,
                                         user_name, created_at,
                                         void_reason, voided_by)
            SELECT i.contract_id, c.client_id, i.penalty_booked_until,
                   {total}, '(хуучин системээс)',
                   {made_at}, '', ''
              FROM invoices i
              JOIN contracts c ON c.id = i.contract_id
             WHERE i.penalty_booked_until IS NOT NULL
             GROUP BY i.contract_id, c.client_id, i.penalty_booked_until
            HAVING NOT EXISTS (
                     SELECT 1 FROM penalty_charges pc
                      WHERE pc.contract_id = i.contract_id
                        AND pc.as_of = i.penalty_booked_until)
        """)


def backfill_deposit_events(engine):
    """Үе H8 (барьцаа = гүйдэг дэвтэр): хуучин НЭГ НҮДИЙГ явдал болгоно.

    Урьд нь барьцаа нь `contracts.deposit` гэсэн ганц float байв. Дэвтэр
    (`deposit_events`) нээгдмэгц тэр тоо нь ЭХ СУРВАЛЖ байхаа болих тул
    нөхөхгүй бол хуучин DB дээрх БҮХ барьцаа ЧИМЭЭГҮЙ 0 болно.

    Гэрээ бүрд:
      · `deposit` (эсвэл суутгасан/буцаасан дүн) тэгээс ялгаатай бол
        БАЙРШУУЛАЛТ нэг мөр — гэрээний эхлэх өдрөөр, «хуучин системээс»;
      · хуучин системд аль хэдийн суутгасан/буцаасан бол тэдгээр нь ч
        мөрөө авна (тооцоо хийгдсэн гэрээний үлдэгдэл 0 хэвээр үлдэнэ).
        ⚠ Эдгээр `apply` мөр нь ТӨЛБӨР ТӨРҮҮЛЭХГҮЙ: тэр төлбөр хуучин
        `settle-deposit` замаар аль хэдийн бичигдсэн — давхарлавал авлага
        хоёр дахин буурна.
      · явдалгүй үлдсэн гэрээний төлөв `none` болно — «байршуулаагүй» (№55)
        ба «0 байршуулсан» хоёр ЯЛГААТАЙ.

    Дахин ажиллуулахад аюулгүй: явдалтай гэрээг алгасна.
    """
    if not _has_tables(engine, "deposit_events", "contracts"):
        return
    start_at = _midnight(engine, "c.start_date")
    settled_at = _midnight(engine, "COALESCE(c.deposit_settled_date, c.start_date)")
    with engine.begin() as conn:
        # Хуучин `deposit` нь БАЙРШУУЛСАН дүн байв — тооцоо хийгдсэн ч
        # хэзээ ч буурдаггүй (`settle-deposit` зөвхөн applied/returned бичдэг).
        # Тиймээс байршуулалт нь ЯГ тэр тоо; суутгал/буцаалт нь доор хасна.
        conn.exec_driver_sql(f"""
            INSERT INTO deposit_events (contract_id, date, kind, amount, note,
                                        user_name, created_at,
                                        void_reason, voided_by)
            SELECT c.id, c.start_date, 'lodge', COALESCE(c.deposit,0),
                   'хуучин системээс', '(хуучин системээс)',
                   {start_at}, '', ''
              FROM contracts c
             WHERE COALESCE(c.deposit,0) <> 0
               AND NOT EXISTS (SELECT 1 FROM deposit_events e WHERE e.contract_id = c.id)
        """)
        for kind, col in (("apply", "deposit_applied"), ("return", "deposit_returned")):
            conn.exec_driver_sql(f"""
                INSERT INTO deposit_events (contract_id, date, kind, amount, note,
                                            user_name, created_at,
                                            void_reason, voided_by)
                SELECT c.id, COALESCE(c.deposit_settled_date, c.start_date), '{kind}',
                       c.{col}, 'хуучин системээс', '(хуучин системээс)',
                       {settled_at}, '', ''
                  FROM contracts c
                 WHERE COALESCE(c.{col},0) > 0
                   AND NOT EXISTS (SELECT 1 FROM deposit_events e
                                    WHERE e.contract_id = c.id AND e.kind = '{kind}')
            """)
        # Кэш баганууд ДЭВТЭРТЭЙГЭЭ тэнцэнэ (services/deposit.py::recompute-ийн
        # SQL хувилбар) — эс бөгөөс дараагийн бичилт хүртэл хуучин тоо зогсоно.
        live = "e.contract_id = contracts.id AND e.voided_at IS NULL"
        conn.exec_driver_sql(f"""
            UPDATE contracts SET
              deposit = COALESCE((SELECT SUM(CASE WHEN e.kind IN ('lodge','topup')
                                                  THEN e.amount ELSE -e.amount END)
                                    FROM deposit_events e WHERE {live}), 0),
              deposit_applied = COALESCE((SELECT SUM(e.amount) FROM deposit_events e
                                           WHERE {live} AND e.kind = 'apply'), 0),
              deposit_returned = COALESCE((SELECT SUM(e.amount) FROM deposit_events e
                                            WHERE {live} AND e.kind = 'return'), 0)
             WHERE EXISTS (SELECT 1 FROM deposit_events e WHERE e.contract_id = contracts.id)
        """)
        conn.exec_driver_sql(f"""
            UPDATE contracts
               SET deposit_status = CASE WHEN deposit > 0.005 THEN 'held' ELSE 'settled' END
             WHERE EXISTS (SELECT 1 FROM deposit_events e WHERE {live})
        """)
        # Явдалгүй гэрээ = «байршуулаагүй». Хуучин анхны утга `held` байсан тул
        # барьцаагүй гэрээ бүр «барьцаа хүлээж байна» гэж уншигдаж байв.
        conn.exec_driver_sql(f"""
            UPDATE contracts SET deposit_status = 'none'
             WHERE deposit_status <> 'none'
               AND NOT EXISTS (SELECT 1 FROM deposit_events e WHERE {live})
        """)


#: Үе шат бүрийн дата нөхөлт энд бүртгэгдэнэ: fn(engine).
#: Дарааллаараа ажиллана. Функц бүр өөрөө idempotent байх ёстой.
BACKFILLS: list = [backfill_movement_line_rates, backfill_penalty_charges,
                   backfill_deposit_events]


def run_all(engine) -> list[str]:
    """Бүх нөхөлтийг дарааллаар нь ажиллуулж, нэрсийг нь буцаана."""
    done: list[str] = []
    for fn in BACKFILLS:
        fn(engine)
        done.append(fn.__name__)
    return done

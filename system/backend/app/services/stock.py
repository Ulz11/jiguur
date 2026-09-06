"""АГУУЛАХЫН ҮЛДЭГДЭЛ — залруулгын ГАНЦ хаалга ба ашиглалтын ГАНЦ томьёо.

Хоёр гоожилтыг нэг дор хаана:

1. **Залруулга нь ДАРЖ БИЧИЛТ байв.** `POST /api/stock/adjust` ба
   `POST /api/stock/stocktake` хоёул `Stock.on_hand`-ыг шууд тогтоодог:
   өмнөх тоо, шалтгаан, хэн нь хаана ч үлдэхгүй. Отгоо эгчийн агуулахад
   «144ш хаачив?» гэдэг нь маргааны сэдэв тул хариулт нь МӨР байх ёстой
   (`models.StockAdjustment`, H1 — устгалын оронд бичилт).

2. **Ашиглалт ГУРВАН газар ГУРВАН томьёогоор бодогдож байв** — дашбоард
   (бүх нөөц), агуулахын KPI (бүх нөөц, харин хүснэгт нь зөвхөн ИДЭВХТЭЙ
   материалыг жагсаадаг), аналитик (идэвхтэй материалын мөрүүд). Нэг
   дэлгэц дээр 62%, нөгөө дээр 58% гарвал аль нь ч итгэл хүлээхээ болино
   (H9 «нэг факт, нэг тоо»). Одоо гурвуулаа `utilization`-ыг дууддаг.
"""
from datetime import date, datetime

from sqlalchemy.orm import Session

from .. import clock
from .. import models
from . import audit as audit_svc

#: Ширхэгийн тэгш байдлын хязгаар — хөвөгч таслалын үлдэгдэл зөрүү БИШ.
EPS = 0.0005

#: Залруулга ХААНААС ирэв (`models.StockAdjustment.source`).
#: `repair`/`barter` нь ХАРААХАН бичигддэггүй — тэр хоёр зам өнөөдөр өөрсдийн
#: тооцоогоор явдаг; толь нь бэлэн байна.
SOURCES = ("stocktake", "adjust", "repair", "barter")

#: Төлөвийн зөрчил (409) — дуудагч мессежийг ТААХГҮЙ, эндээс тулгана.
ALREADY_VOID = "Энэ залруулга аль хэдийн хүчингүй болсон байна"


def _material(db: Session, m) -> models.Material:
    """Модель эсвэл id — хоёуланг нь хүлээж авна (route-ууд id-тай ирдэг)."""
    obj = m if isinstance(m, models.Material) else db.get(models.Material, m)
    if obj is None:
        raise ValueError("Материал олдсонгүй")
    return obj


def _grade(db: Session, g) -> models.Grade:
    obj = g if isinstance(g, models.Grade) else db.get(models.Grade, g)
    if obj is None:
        raise ValueError("Зэрэглэл олдсонгүй")
    return obj


def row(db: Session, material_id: int, grade_id: int) -> models.Stock:
    """Нөөцийн мөр — байхгүй бол ҮҮСГЭНЭ («хэзээ ч хөдлөөгүй» = 0)."""
    st = db.query(models.Stock).filter_by(material_id=material_id,
                                          grade_id=grade_id).first()
    if st is None:
        st = models.Stock(material_id=material_id, grade_id=grade_id,
                          on_hand=0, on_rent=0, in_repair=0, written_off=0)
        db.add(st)
        db.flush()
    return st


def label(m: models.Material, g: models.Grade) -> str:
    """«Хэв хашмал 6012 (А)» — бүртгэлийн мөр бүр ижил нэрээр ярина."""
    return f"{m.name} ({g.code})"


def line_text(adj: models.StockAdjustment, m: models.Material, g: models.Grade) -> str:
    """«Хэв хашмал 6012 (А): 2044 → 1900 (−144)» — НЭГ мөрийн бүтэн өгүүлбэр."""
    return f"{label(m, g)}: {adj.before:g} → {adj.after:g} ({adj.diff:+g})"


def conflict_message(m: models.Material, expected: float, actual: float) -> str:
    """Хуудас ХАРСАН тоо ↔ агуулахын ОДООГИЙН тоо зөрөх үеийн ганц өгүүлбэр."""
    return (f"{m.name}: үлдэгдэл өөрчлөгдсөн байна "
            f"({expected:g} → {actual:g}) — дахин ачаална уу")


def adjust(db: Session, material, grade, counted: float, *, user,
           note: str = "", source: str = "adjust", batch: str | None = None,
           day: date | None = None,
           log_audit: bool = True) -> models.StockAdjustment | None:
    """Үлдэгдлийг `counted` болгож ТОГТООХ — мөр, аудиттайгаа.

    Буцна: үүссэн бичилт, эсвэл ЗӨРҮҮГҮЙ бол `None` (юу ч бичихгүй —
    «зөрүүгүй» гэдэг нь тооллогын багцын мөрөнд хэлэгдэнэ, ширхэг бүрд биш).

    `log_audit=False` нь ЗӨВХӨН тооллогод: тэнд 20 мөр нь НЭГ явдал тул
    бүртгэлд НЭГ мөр (бүх зөрүүтэйгээ) орно — 20 тусдаа мөр биш.
    """
    if source not in SOURCES:
        raise ValueError("Залруулгын эх сурвалж буруу")
    if counted is None or counted < 0:
        raise ValueError("Тоо сөрөг байж болохгүй")
    m = _material(db, material)
    g = _grade(db, grade)
    st = row(db, m.id, g.id)
    before = st.on_hand or 0.0
    diff = counted - before
    if abs(diff) < EPS:
        return None                       # ЗӨРҮҮГҮЙ — дарж бичих зүйл алга
    adj = models.StockAdjustment(
        material_id=m.id, grade_id=g.id, date=day or clock.today(),
        before=before, after=counted, diff=diff, note=note or "",
        source=source, stocktake_batch=batch,
        user_name=getattr(user, "name", "") or "")
    st.on_hand = counted
    db.add(adj)
    db.commit()
    if log_audit:
        audit_svc.log(db, user, "adjust", "stock_adjustment", adj.id,
                      f"{adj.date} · {line_text(adj, m, g)} · "
                      f"{audit_svc.value_mn(source)}"
                      + (f" · {note}" if note else ""))
    return adj


def void_adjustment(db: Session, adj: models.StockAdjustment, reason: str,
                    user) -> models.StockAdjustment:
    """Залруулгыг ХҮЧИНГҮЙ болгоно — мөр үлдэж, ЭСРЭГ зөрүү нь буцна (H1).

    Устгал БИШ: «144ш дутсан» гэсэн бичилт андуурч хийгдсэн бол тэр мөр
    шалтгаантайгаа үлдэж, үлдэгдэл нь хуучин тоо руугаа эргэнэ.
    """
    if adj.voided_at is not None:
        raise ValueError(ALREADY_VOID)
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Цуцлах шалтгаан заавал бичигдэнэ")
    st = row(db, adj.material_id, adj.grade_id)
    back = (st.on_hand or 0.0) - adj.diff
    if back < -EPS:
        raise ValueError("Буцаахад үлдэгдэл сөрөг болно")
    st.on_hand = max(back, 0.0)
    adj.voided_at = datetime.utcnow()
    adj.void_reason = reason
    adj.voided_by = getattr(user, "name", "") or ""
    db.commit()
    m, g = _material(db, adj.material_id), _grade(db, adj.grade_id)
    audit_svc.log(db, user, "void", "stock_adjustment", adj.id,
                  f"{adj.date} · {line_text(adj, m, g)} — ХҮЧИНГҮЙ: {reason} · "
                  f"үлдэгдэл {st.on_hand:g}")
    return adj


def adjustments_of(db: Session, material_id: int | None = None,
                   limit: int = 200) -> list[models.StockAdjustment]:
    """Залруулгын түүх — шинэ нь дээрээ. Хүчингүй нь ч ХАРАГДАНА (H1)."""
    q = db.query(models.StockAdjustment)
    if material_id:
        q = q.filter(models.StockAdjustment.material_id == material_id)
    return q.order_by(models.StockAdjustment.date.desc(),
                      models.StockAdjustment.id.desc()).limit(limit).all()


def serialize(adj: models.StockAdjustment, mname: str = "", gcode: str = "") -> dict:
    return {"id": adj.id, "material_id": adj.material_id, "material": mname,
            "grade_id": adj.grade_id, "grade": gcode, "date": str(adj.date),
            "before": adj.before, "after": adj.after, "diff": adj.diff,
            "note": adj.note or "", "source": adj.source,
            "source_mn": audit_svc.value_mn(adj.source),
            "batch": adj.stocktake_batch, "user_name": adj.user_name,
            "voided": adj.voided_at is not None,
            "void_reason": adj.void_reason or "",
            "voided_by": adj.voided_by or ""}


# ---------------- Ашиглалт: ГАНЦ томьёо ----------------

def stocks(db: Session, active_only: bool = False) -> list[models.Stock]:
    """Нөөцийн мөрүүд. `active_only` нь ХҮСНЭГТИЙН мөрүүдтэй тэнцүүлнэ:
    агуулахын хуудас зөвхөн идэвхтэй материалыг жагсаадаг тул KPI нь мөн
    тэднээс л нийлэх ёстой (эс бөгөөс дүн нь хүснэгтээсээ их гарна)."""
    rows = db.query(models.Stock).all()
    if not active_only:
        return rows
    live = {r[0] for r in db.query(models.Material.id)
            .filter(models.Material.active == 1).all()}
    return [s for s in rows if s.material_id in live]


def utilization(db: Session, active_only: bool = False) -> float:
    """Ашиглалт % = түрээсэнд ÷ (агуулахад + түрээсэнд).

    ЗАСВАРТ байгаа нь хуваарьт ОРОХГҮЙ (түрээслэх боломжгүй бараа) —
    дашбоард, агуулах, аналитик гурвуулаа ЭНЭ мөрөөс тоогоо авна.
    """
    rows = stocks(db, active_only)
    hand = sum(s.on_hand or 0 for s in rows)
    rent = sum(s.on_rent or 0 for s in rows)
    pool = hand + rent
    return round(rent / pool * 100, 1) if pool else 0.0


def totals(db: Session, active_only: bool = False) -> dict:
    """Агуулахын KPI — хүснэгтийн мөрүүдтэй ЯГ ижил олонлогоос."""
    rows = stocks(db, active_only)
    return {"on_hand": sum(s.on_hand or 0 for s in rows),
            "on_rent": sum(s.on_rent or 0 for s in rows),
            "in_repair": sum(s.in_repair or 0 for s in rows),
            "utilization": utilization(db, active_only)}

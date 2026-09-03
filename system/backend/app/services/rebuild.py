"""Нэхэмжлэл ДАХИН БОДОХ — "мөнгө дагана" зарчим.

Отгоо Numbers дээрээ хэдэн сарын өмнөх алдааг засаад бүх мөр өөрөө шинэчлэгддэг
байсан. Систем ч мөн адил байх ёстой: хөдөлгөөний тоо/тариф/огноо, гэрээний
эхлэл эсвэл циклийн урт өөрчлөгдвөл ТУХАЙН ГЭРЭЭНИЙ гаргаж болох нэхэмжлэлүүд
устаж, шинээр бодогдоод, харилцагчийн бүх төлбөр огноогоор нь дахин
хуваарилагдана.

ХАТУУ ХИЛ:
- `ensure_invoices` ЗӨВХӨН НЭМДЭГ (append-only) бөгөөс олон GET зам дээр
  ажилладаг. Дахин бодолт нь ЗӨВХӨН эндээс, зөвхөн засварын endpoint-оос.
- АЛДАНГИ дахин бодолтоос ӨӨРӨӨ ТӨРӨХГҮЙ. Нэхэлт нь Отгоогийн ил шийдвэр
  (`PenaltyCharge` явдал) тул replay нь ЗӨВХӨН бүртгэгдсэн явдлуудыг, тэдний
  ОГНООГООР нь дахин нэхнэ — хөлдсөн дүнг нь буцааж тавихгүй (тоо ширхэг
  засагдвал алданги нь ч засагдана). Явдалгүй гэрээнд алданги 0 хэвээр.
  ХҮЧИНГҮЙ болсон нэхэлт нь энэ жагсаалтаас ХАСАГДАНА — алдангийг «буцаах»
  гэдэг нь хасалт биш, ЭНЭ ДАХИН ДЕРИВАЦИ (H1-ийн тэгш хэм).
- "OB-" (үлдэгдэл шилжүүлэлт) нэхэмжлэл нь ГАРААР хийгдсэн, өгөгдлөөс
  гаргаж болохгүй тул ХЭЗЭЭ Ч устгагдахгүй.
- `payment_allocations`-д FK cascade БАЙХГҮЙ — хуваарилалтыг ГАРААР эхэлж
  устгана, эс бөгөөс өнчин мөр үлдэж авлага гажина.
"""
import re
from datetime import date, datetime
from sqlalchemy.orm import Session
from .. import models
from . import billing

# `created_at` нь хуучин мөрөнд NULL байж болно (схем нэмэгдэхээс өмнөх дата) —
# эрэмбэ нурахын оронд ХАМГИЙН ЭХЭНД тавина.
_EPOCH = datetime.min


def _key(contract: models.Contract, cycle_start: date, cycle_end: date, no: str):
    return billing.spec_key(contract, cycle_start, cycle_end, no)


def _key_label(contract: models.Contract, key) -> str:
    return key if contract.type == "sale" else f"{key[0]} – {key[1]}"


def _derivable(contract: models.Contract, inv: models.Invoice, spec_keys: set) -> bool:
    """Энэ нэхэмжлэл гэрээний өгөгдлөөс ГАРГАЖ БОЛОХ уу?

    Хоёр давхар шалгуур (бүсэлхий + тэвш): дугаар нь `R-`/`S-{гэрээний №}-{n}`
    хэлбэртэй эсвэл түүний өвөрмөц түлхүүр шинэ жагсаалтад байгаа. "OB-" ямар
    ч тохиолдолд ҮГҮЙ — тэр нь гараар үүсгэсэн, дахин бодогдох боломжгүй.
    """
    if inv.no.startswith("OB-"):
        return False
    pat = re.compile(r"^[RS]-" + re.escape(contract.no) + r"-\d+$")
    if pat.match(inv.no):
        return True
    return _key(contract, inv.cycle_start, inv.cycle_end, inv.no) in spec_keys


def rebuild_contract_invoices(db: Session, contract: models.Contract,
                              today: date | None = None) -> dict:
    """Гэрээний нэхэмжлэлүүдийг устгаж дахин үүсгээд төлбөрүүдийг replay хийнэ.

    Буцна: {created, deleted, warnings, diffs} — diffs нь хуучин/шинэ дүнгийн
    зэрэгцүүлэлт (алга болсон цикл new_total=0, шинээр төрсөн цикл old_total=0).
    """
    today = today or date.today()
    if contract.no.startswith("OB-"):
        raise ValueError("Үлдэгдэл шилжүүлэлтийн (OB) гэрээг дахин бодох боломжгүй — "
                         "энэ нэхэмжлэл хуучин системээс гараар шилжсэн")

    # ⚠ ЯАГААД ТҮГЖЭЭ ЭНД БАЙХ ЁСТОЙ ВЭ — ДАВХАРДСАН НЭХЭМЖЛЭЛ.
    #
    # Доорх 2-р алхам нэхэмжлэлүүдийг УСТГААД `commit()` хийнэ, 3-р алхам
    # шинээр үүсгээд `commit()` хийнэ. Тэр ХОЁР commit-ийн хооронд гэрээ нь
    # DB дээр нэхэмжлэлГҮЙ харагдана. FastAPI-ийн sync endpoint-ууд
    # threadpool дээр ЗЭРЭГ гүйдэг тул яг тэр агшинд өөр урсгал дээрх ямар ч
    # GET (`/api/contracts/:id`, `/api/clients`, дашбоард, авлага цуглуулах…)
    # `billing.ensure_invoices`-оо дуудна: тэр нь түгжээг СУЛ олж авч, «энэ
    # цикл алга» гэж УНШААД дахин үүсгэнэ. Дараа нь 3-р алхам бас үүсгэж, ЯГ
    # ИЖИЛ дугаартай, ижил циклтэй ХОЁР мөр үлдэнэ — тэр циклийн АВЛАГА ХОЁР
    # ДАХИН нэмэгдэнэ (E2E: 198,000₮ гэж амласан гэрээ 396,000₮ болов).
    #
    # Иймд «устга → дахин үүсгэ» нь `ensure_invoices`-ийн «унш → бич»-тэй ЯГ
    # ижил түгжээний дор, ХУВААГДАШГҮЙ явна. Дахин бодолт нь Отгоогийн ГАРААР
    # хийдэг ховор засвар тул түгжээг бүтэн ажлын турш барих нь хямд.
    with billing.contract_invoice_lock(contract.id):
        return _rebuild_locked(db, contract, today)


def _rebuild_locked(db: Session, contract: models.Contract, today: date) -> dict:
    """`rebuild_contract_invoices`-ийн их бие — гэрээний түгжээний ДОТОР."""
    specs = billing.derivable_invoice_specs(contract, today)
    spec_keys = {_key(contract, s["cycle_start"], s["cycle_end"], s["no"]) for s in specs}

    doomed = [i for i in contract.invoices if _derivable(contract, i, spec_keys)]
    doomed_ids = [i.id for i in doomed]

    # 1) ХУУЧИН БАЙДЛЫГ ГЭРЭЛ ЗУРАГЛАХ (устгахаас өмнө — дараа нь оройтоно)
    old: dict = {}
    for inv in doomed:
        old[_key(contract, inv.cycle_start, inv.cycle_end, inv.no)] = {
            "no": inv.no, "cycle_start": inv.cycle_start, "cycle_end": inv.cycle_end,
            "total": inv.total, "paid": inv.paid}

    alloc_snap: list[dict] = []
    if doomed_ids:
        rows = (db.query(models.PaymentAllocation)
                .filter(models.PaymentAllocation.invoice_id.in_(doomed_ids))
                .order_by(models.PaymentAllocation.id).all())
        by_id = {i.id: i for i in doomed}
        for a in rows:
            inv = by_id[a.invoice_id]
            alloc_snap.append({
                "payment_id": a.payment_id, "part": a.part, "manual": a.manual,
                "amount": a.amount,
                "key": _key(contract, inv.cycle_start, inv.cycle_end, inv.no)})

        # 2) УСТГАХ — эхлээд хуваарилалт (FK cascade байхгүй), дараа нь нэхэмжлэл
        (db.query(models.PaymentAllocation)
         .filter(models.PaymentAllocation.invoice_id.in_(doomed_ids))
         .delete(synchronize_session=False))
        (db.query(models.Invoice).filter(models.Invoice.id.in_(doomed_ids))
         .delete(synchronize_session=False))
        db.commit()
        db.expire_all()

    # 3) ДАХИН ҮҮСГЭХ — бүх spec шинээр (алданги 0-оос эхэлнэ)
    for sp in specs:
        db.add(models.Invoice(contract_id=contract.id, **sp))
    db.commit()
    db.expire_all()

    new_by_key = {_key(contract, i.cycle_start, i.cycle_end, i.no): i
                  for i in contract.invoices
                  if not i.no.startswith("OB-")}

    # 4) ЦАГИЙН ШУГАМЫГ REPLAY — АЛДАНГИЙН НЭХЭЛТ ба ТӨЛБӨР ХОЛИЛДОНО.
    #
    # Алданги одоо ӨӨРӨӨ номжихоо больж, зөвхөн Отгоогийн ИЛ шийдвэрээр
    # нэхэгдэнэ (H2). Гэтэл дахин бодолт нэхэмжлэлүүдийг УСТГАЖ шинээр
    # төрүүлдэг — шинэ нэхэмжлэл 0 алдангитай төрнө. Тиймээс өнгөрсөн
    # нэхэлтүүдийг `PenaltyCharge` явдлаар нь ДАХИН тоглуулна.
    #
    # ХӨЛДСӨН ДҮНГ нь буцааж тавихгүй, ОГНООГ нь дахин нэхнэ: тоо ширхэг
    # засагдвал алданги нь ч засагдах ёстой («мөнгө дагана»). Хоёр төрлийн
    # явдал НЭГ дараалалд нийлнэ:
    #   1) бизнесийн ОГНОО (төлбөрийн огноо / нэхэлтийн `as_of`) — гол түлхүүр:
    #      хойшлуулж бичсэн төлбөр хуучин нэхэмжлэлдээ очих ёстой;
    #   2) БИЧИГДСЭН агшин (`created_at`) — нэг өдрийн доторх жинхэнэ дараалал:
    #      өглөө төлбөр бүртгээд, үдээс хойш алданги нэхсэн бол алданги нь
    #      ҮЛДЭГДЛЭЭР нь бодогдох ёстой (эсрэгээр биш);
    #   3) төрөл ба id — тэнцвэл ч үр дүн ТОГТМОЛ байх баталгаа.
    #
    # Нэхэлт нь ЗӨВХӨН энэ гэрээнд (`contract_id`) хамаарна — өөр гэрээний
    # алдангийг нэг гэрээ дахин бодох нь хөндөж болохгүй. `record=False`:
    # replay нь ШИНЭ шийдвэр биш, хуучныг нь давтаж байна.
    #
    # ХҮЧИНГҮЙ болсон төлбөр энд ОРОХГҮЙ: replay нь хуваарилалтыг тэглээд шинээр
    # хийдэг тул цуцлагдсан төлбөр орвол сулласан алдаа засвар хийх бүрд ӨӨРӨӨ
    # амилж, «цуцалсан мөнгө буцаад ирлээ» гэсэн итгэл эвдэх алдаа болно.
    warnings: list[str] = []
    payments = (db.query(models.Payment).filter_by(client_id=contract.client_id)
                .filter(billing.LIVE_PAYMENT)
                .order_by(models.Payment.date, models.Payment.id).all())
    # ХҮЧИНГҮЙ болсон НЭХЭЛТ ч энд ОРОХГҮЙ (`contract_penalty_charges` нь
    # анхныхаараа зөвхөн амьдыг өгнө). Цуцлалт нь `penalty_booked`-ыг ГАРААР
    # хасдаггүй — энэ replay-ээс хасагдсанаараа л дахин деривацлагдана.
    charges = billing.contract_penalty_charges(db, contract.id)
    timeline = ([(p.date, p.created_at or _EPOCH, 1, p.id, "pay", p) for p in payments]
                + [(ch.as_of, ch.created_at or _EPOCH, 0, ch.id, "book", ch) for ch in charges])
    timeline.sort(key=lambda t: t[:4])
    for *_, kind, obj in timeline:
        if kind == "book":
            billing.book_penalties(db, contract.client_id, obj.as_of,
                                   contract_id=contract.id, record=False)
            continue
        p = obj
        # ӨӨР гэрээнд үлдсэн хуваарилалтууд хэвээр — зөвхөн СУЛАРСАН үлдэгдлийг
        # дахин хуваарилна.
        remain = billing.payment_unallocated(p)
        if remain <= 0.005:
            continue
        remain -= _replay_manual(db, contract, p, remain, alloc_snap, new_by_key, warnings)
        if remain > 0.005:
            billing._fill_invoices(db, p, remain)
        db.commit()
    db.expire_all()

    # 5) ЗӨРҮҮ (diffs) — хуучин ↔ шинэ
    new_state = {k: {"no": i.no, "cycle_start": i.cycle_start, "cycle_end": i.cycle_end,
                     "total": i.total, "paid": i.paid}
                 for k, i in new_by_key.items()}
    diffs = []
    for key in sorted(set(old) | set(new_state), key=lambda k: str(k)):
        o, n = old.get(key), new_state.get(key)
        ref = n or o
        diffs.append({"no": ref["no"], "cycle_start": str(ref["cycle_start"]),
                      "cycle_end": str(ref["cycle_end"]),
                      "old_total": round(o["total"], 2) if o else 0.0,
                      "new_total": round(n["total"], 2) if n else 0.0,
                      "paid_delta": round((n["paid"] if n else 0.0)
                                          - (o["paid"] if o else 0.0), 2)})
    return {"created": len(specs), "deleted": len(doomed),
            "warnings": warnings, "diffs": diffs}


def _replay_manual(db: Session, contract: models.Contract, p: models.Payment,
                   remain: float, alloc_snap: list[dict], new_by_key: dict,
                   warnings: list[str]) -> float:
    """Тухайн төлбөрийн ГАРААР чиглүүлсэн хуваарилалтуудыг сэргээнэ.

    Циклийн түлхүүрээр таарна (дугаар нь өөрчлөгдсөн ч цикл нь хэвээр бол
    мөнгө нь тэр нэхэмжлэлдээ үлдэнэ). Алга болсон эсвэл хумигдсан мөр бүрд
    анхааруулга үлдээж, үлдсэн нь автомат журмаар хаагдана.
    """
    wanted: dict = {}
    order: list = []
    for a in alloc_snap:
        if a["payment_id"] != p.id or not a["manual"]:
            continue
        if a["key"] not in wanted:
            wanted[a["key"]] = 0.0
            order.append(a["key"])
        wanted[a["key"]] += a["amount"]

    used = 0.0
    for key in order:
        want = wanted[key]
        inv = new_by_key.get(key)
        if inv is None:
            warnings.append(f"Гараар хуваарилсан нэхэмжлэл ({_key_label(contract, key)}) "
                            f"алга болсон — {want:,.0f}₮ автоматаар хуваарилагдав")
            continue
        due = billing.invoice_outstanding(inv) + billing.invoice_penalty_due(inv)
        take = min(want, due, remain - used)
        if take <= 0.005:
            warnings.append(f"Гараар хуваарилсан {want:,.0f}₮ ({_key_label(contract, key)}) "
                            f"багтсангүй — автоматаар хуваарилагдав")
            continue
        if take < want - 0.005:
            warnings.append(f"Гараар хуваарилсан {want:,.0f}₮ ({_key_label(contract, key)}) "
                            f"{take:,.0f}₮ болж хумигдав")
        used += billing._fill_one(db, p, inv, take, manual=1)
    return used


# ---------- Урьдчилан харах (dry-run) ----------

class _DryRun:
    """`commit`-ыг `flush` болгож, төгсгөлд нь БҮГДИЙГ буцаана.

    Дахин бодолтын гинжин хэлхээ (book_penalties, _fill_invoices, өөрөө)
    дотроо олон удаа commit хийдэг. Урьдчилан харахад ганц ч мөр DB-д
    ҮЛДЭХ ЁСГҮЙ тул тухайн session дээр commit-ыг түр flush болгож, эцэст нь
    rollback хийнэ — бүх ажил нэг л транзакцид багтана.
    """

    def __init__(self, db: Session):
        self.db = db

    def __enter__(self):
        self.db.commit = self.db.flush        # instance-ийн түр атрибут
        return self.db

    def __exit__(self, *exc):
        try:
            del self.db.commit                # класын жинхэнэ commit сэргэнэ
        except AttributeError:
            pass
        self.db.rollback()
        self.db.expire_all()
        return False


def preview_rebuild(db: Session, contract: models.Contract, today: date | None = None,
                    mutate=None) -> dict:
    """Засварыг ХИЙГЭЭД дахин бодоод, юу болохыг харуулаад БҮГДИЙГ буцаана.

    `mutate` — session дотор ORM өөрчлөлт хийх функц (огноо солих, тоо солих…).
    DB-д ямар ч өөрчлөлт ҮЛДЭХГҮЙ: нэхэмжлэлийн тоо, дүн, хуваарилалт бүгд
    дуудахын өмнөх байдалдаа эргэж очно.
    """
    today = today or date.today()
    with _DryRun(db):
        if mutate is not None:
            mutate()
        db.flush()
        res = rebuild_contract_invoices(db, contract, today)
        return {"created": res["created"], "deleted": res["deleted"],
                "diffs": res["diffs"], "warnings": res["warnings"]}

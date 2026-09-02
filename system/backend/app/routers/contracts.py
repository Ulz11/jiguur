"""Гэрээ, хөдөлгөөн, нэхэмжлэл."""
import re
from datetime import date, datetime
from datetime import date as _date_t
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas, serializers, auth
from ..services import billing, pdfappendix, pdfgen
from ..services import audit
from ..services import rebuild as rebuild_svc

router = APIRouter(prefix="/api")


def _maps(db: Session):
    gmap = {g.id: g.code for g in db.query(models.Grade).all()}
    mmap = {m.id: m.name for m in db.query(models.Material).all()}
    return gmap, mmap


def _safe(name: str) -> str:
    """Файлын нэрэнд оруулж болох тэмдэгт л үлдээнэ (R-25/01-3 → R-25-01-3)."""
    return re.sub(r"[^0-9A-Za-z._-]+", "-", name).strip("-") or "file"


CYCLE_MODE_ERR = "Тооцооны мөчлөг «30 хоног» эсвэл «Календарь сар» байна"
# «Худалдаа болгох» (H7) нь ЗӨВХӨН түрээсийн гэрээнд утгатай — худалдааны
# гэрээнд ачилт нь өөрөө худалдаа бөгөөс өөрийн нэхэмжлэлтэй.
SALE_ONLY_RENT_ERR = ("«Худалдаа болгох» нь зөвхөн ТҮРЭЭСИЙН гэрээнд бүртгэгдэнэ — "
                      "худалдааны гэрээнд олголт нь өөрөө худалдаа")


@router.get("/contracts")
def list_contracts(scope: str = "all", db: Session = Depends(get_db),
                   user=Depends(auth.current_user)):
    today = date.today()
    q = db.query(models.Contract)
    if scope in ("rent", "sale"):
        q = q.filter(models.Contract.type == scope)
    rows = []
    for c in q.order_by(models.Contract.created_at.desc()).all():
        billing.ensure_invoices(db, c, today)
        rows.append(serializers.contract_row(c, today))
    return rows


@router.post("/contracts")
def create_contract(body: schemas.ContractIn, db: Session = Depends(get_db),
                    user=Depends(auth.require_roles("manager"))):
    client = db.get(models.Client, body.client_id)
    if not client:
        raise HTTPException(404, "Харилцагч олдсонгүй")
    no = body.no.strip()
    if not no:
        year = str(body.start_date.year)[2:]
        cnt = db.query(models.Contract).count() + 1
        while db.query(models.Contract).filter_by(no=f"{year}/{cnt:02d}").first():
            cnt += 1
        no = f"{year}/{cnt:02d}"
    if db.query(models.Contract).filter_by(no=no).first():
        raise HTTPException(400, f"№{no} дугаартай гэрээ аль хэдийн байна")
    # нөөц хүрэлцэх эсэхийг шалгана
    for it in body.items:
        st = db.query(models.Stock).filter_by(material_id=it.material_id, grade_id=it.grade_id).first()
        if not st or st.on_hand < it.qty:
            m = db.get(models.Material, it.material_id)
            raise HTTPException(400, f"{m.name if m else '?'} — агуулахад хүрэлцэхгүй "
                                     f"(байгаа: {st.on_hand if st else 0:g}, хүссэн: {it.qty:g})")
    if body.cycle_mode not in billing.CYCLE_MODES:
        raise HTTPException(400, CYCLE_MODE_ERR)
    c = models.Contract(no=no, client_id=body.client_id, type=body.type,
                        start_date=body.start_date, end_date=body.end_date,
                        cycle_days=body.cycle_days, cycle_mode=body.cycle_mode,
                        penalty_percent=body.penalty_percent,
                        deposit=body.deposit, vat_percent=body.vat_percent, note=body.note)
    db.add(c)
    db.flush()
    for it in body.items:
        db.add(models.ContractItem(contract_id=c.id, material_id=it.material_id,
                                   grade_id=it.grade_id, daily_rate=it.daily_rate,
                                   unit_price=it.unit_price))
    # Ачилтын хүсэлт — дарга баталгаажуулсны дараа нөөц хөдөлнө, тооцоо эхэлнэ
    mv = models.Movement(contract_id=c.id, type="ISSUE", date=body.start_date,
                         status="pending", note="Гэрээний эхний ачилт")
    db.add(mv)
    db.flush()
    for it in body.items:
        # Падан: эхний ачилтын мөр бүр гэрээнд тохирсон тарифаа өөртөө авч явна
        db.add(models.MovementLine(movement_id=mv.id, material_id=it.material_id,
                                   grade_id=it.grade_id, qty=it.qty,
                                   rate=it.unit_price if c.type == "sale" else it.daily_rate))
    db.commit()
    audit.log(db, user, "create", "contract", c.id,
              f"№{c.no} · {client.name} · {'түрээс' if c.type == 'rent' else 'худалдаа'} · "
              f"{len(body.items)} мөр")
    return {"id": c.id, "no": c.no}


def _live_items(db: Session, c: models.Contract, today: date, gmap: dict, mmap: dict):
    """Материалын хүснэгт — ПАДАНГААР бүлэглэсэн мөрүүд.

    Бүлэглэх түлхүүр: (материал, зэрэглэл, ПАДАНГИЙН ТӨРӨЛХИЙН ТАРИФ). Иймд нэг
    материал өөр өөр тарифаар гарсан бол ХОЁР мөр болж харагдана (Отгоогийн
    Numbers дэвтэр шиг). Талбарын нэрс хэвээр — UI өөрчлөлтгүй уншина.

    ХАРАГДАХ тариф нь ӨНӨӨДРИЙН ХҮЧИНТЭЙ утга (`resolve_rate`) — тарифын
    өөрчлөлт (R3 / H6) хүчин төгөлдөр болсны дараа хүснэгт ШИНЭ тарифаа
    харуулна. Бүлэглэл нь ТӨРӨЛХИЙН тарифаар үлдэх нь чухал: `old_rate`-ийн
    хүрээ (падангийн ҮЕ) тэр тоогоор л заагддаг, тиймээс мөр нь `orig_rate`-ээ
    хамт авч явна — дараагийн өөрчлөлт ЯГ тэр үеийг заана.
    """
    order = {(it.material_id, it.grade_id): i for i, it in enumerate(c.items)}
    sale = c.type == "sale"
    groups: dict[tuple, dict] = {}
    for lot in billing.lot_qty_on(c, today):
        key = (lot["material_id"], lot["grade_id"], lot["rate"])
        row = groups.get(key)
        if row is None:
            row = groups[key] = {"qty": 0.0, "rate": lot["rate"], "date": lot["date"],
                                 "material_id": lot["material_id"], "grade_id": lot["grade_id"]}
        row["qty"] += lot["qty_left"]
        row["date"] = min(row["date"], lot["date"])
    # огт олгогдоогүй (эсвэл хүлээгдэж буй) гэрээний мөр 0-оор харагдана
    for it in c.items:
        if not any(k[0] == it.material_id and k[1] == it.grade_id for k in groups):
            groups[(it.material_id, it.grade_id, None)] = {
                "qty": 0.0, "rate": it.unit_price if sale else it.daily_rate,
                "date": c.start_date, "material_id": it.material_id, "grade_id": it.grade_id}

    live = []
    for row in sorted(groups.values(), key=lambda r: (
            order.get((r["material_id"], r["grade_id"]), 999), r["date"], r["rate"])):
        it = next((x for x in c.items if x.material_id == row["material_id"]
                   and x.grade_id == row["grade_id"]), None)
        mat = db.get(models.Material, row["material_id"])
        price = db.query(models.MaterialGradePrice).filter_by(
            material_id=row["material_id"], grade_id=row["grade_id"]).first()
        orig = row["rate"]
        eff = billing.resolve_rate(c, row["material_id"], row["grade_id"], orig, today)
        daily_rate = eff if not sale else (it.daily_rate if it else 0)
        unit_price = eff if sale else (it.unit_price if it else 0)
        live.append({"material_id": row["material_id"], "material": mmap.get(row["material_id"]),
                     "grade_id": row["grade_id"], "grade": gmap.get(row["grade_id"]),
                     "qty": row["qty"], "daily_rate": daily_rate, "unit_price": unit_price,
                     # Дараагийн өөрчлөлтийн ХҮРЭЭ энэ тоогоор заагдана
                     "orig_rate": orig,
                     "day_amount": round(row["qty"] * daily_rate),
                     "repair_fee": mat.repair_fee if mat else 0,
                     "writeoff_price": price.nb_price if price else 0,
                     # ХУДАЛДАХ ҮНЭ (R32-ийн хоёр дахь шатлал) — «Худалдаа
                     # болгох» цонх үржвэрээ ЭНДЭЭС гаргана (H7).
                     "sale_price": price.sale_price if price else 0})
    return live


@router.get("/contracts/{cid}")
def contract_detail(cid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    today = date.today()
    billing.ensure_invoices(db, c, today)
    db.refresh(c)
    gmap, mmap = _maps(db)
    live = _live_items(db, c, today, gmap, mmap)
    out = {**serializers.contract_row(c, today),
           # `cycle_mode` нь `contract_row`-оос ирнэ (жагсаалт ба дэлгэрэнгүй
           # НЭГ эх сурвалжтай) — энд дахин бичихгүй.
           "vat_percent": c.vat_percent, "cycle_days": c.cycle_days,
           "items": live,
           # Материалын мөр бүрийн доор задардаг хөдөлгөөний дэвтэр (зөвхөн унших)
           "material_lines": serializers.material_lines(c, gmap, mmap, today),
           "movements": [serializers.movement(m, gmap, mmap)
                         for m in sorted(c.movements, key=lambda m: (m.date, m.id), reverse=True)],
           "invoices": [serializers.invoice(i, today)
                        for i in sorted(c.invoices, key=lambda i: i.due_date, reverse=True)],
           # Чөлөөт актын бичилт (R12 / H4) — хүчингүй болсон нь ч ХАРАГДАНА
           "akt_entries": [serializers.akt_entry(a)
                           for a in sorted(c.akt_entries,
                                           key=lambda a: (a.date, a.id), reverse=True)],
           # Тарифын дахин тохиролт (R3 / H6) — хүчингүй болсон нь ч ХАРАГДАНА
           "rate_changes": [serializers.rate_change(rc, gmap, mmap)
                            for rc in sorted(c.rate_changes,
                                             key=lambda r: (r.effective_from, r.id),
                                             reverse=True)],
           # Алданги НЭХСЭН явдлууд (R25 / H2) — «гаргасан шийдвэрүүдийнх нь
           # жагсаалт» ХАРАГДАХ ёстой. `live_only=False`: хүчингүй болсон нь ч
           # мөрөндөө үлдэнэ (H1) — хэдийг өршөөснөө тэр эндээс уншина.
           "penalty_charges": [serializers.penalty_charge(pc) for pc in
                               reversed(billing.contract_penalty_charges(
                                   db, c.id, live_only=False))],
           # «Хэзээнээс» сонголтын ГУРВАН огноо — UI таамаглахгүй, СЕРВЕР хэлнэ
           "cycle_bounds": {"contract_start": str(c.start_date),
                            "current_start": str(billing.this_cycle_start(c, today)),
                            "next_start": str(billing.next_cycle_start(c, today))},
           "payments": [serializers.payment(p) for p in
                        db.query(models.Payment).filter_by(contract_id=c.id).order_by(models.Payment.date.desc()).all()]}
    # Үйлдвэрийн дарга — тоо, зэрэглэл, огнооны хүн. Мөнгө нь дэлгэц дээр
    # нуугдаад зогсохгүй, түүний ТОКЕН руу огт явахгүй (serializers-ийн тайлбар).
    if user.role == "factory":
        return serializers.factory_contract_detail(out)
    return out


from pydantic import BaseModel as _BM


class ContractPatch(_BM):
    penalty_percent: float | None = None
    deposit: float | None = None
    vat_percent: float | None = None
    note: str | None = None
    end_date: date | None = None
    clear_end_date: bool = False
    # Тооцоог бүхэлд нь хөдөлгөх талбарууд — зөвхөн менежер, дахин бодолттой
    start_date: date | None = None
    cycle_days: int | None = None
    # "days" | "month" — цонхны ХЭЛБЭР солих нь эхлэх огноо солихтой ижил
    # хүндийн засвар: БҮХ цикл шинээр зурагдана (R5 / H3).
    cycle_mode: str | None = None
    confirm: bool = False


class MovementPatch(_BM):
    # `date` талбарын нэр нь `date` төрлийг далдалдаг тул alias-аар зарлана
    date: _date_t | None = None
    note: str | None = None
    confirm: bool = False


class MovementLinePatch(_BM):
    qty: float | None = None
    rate: float | None = None
    # ---- БУЦААЛТЫН дэлгэрэнгүй (H1/H5: «зэрэглэл/засвар/актын хуваарь мөнхийн») ----
    # Дарга талбай дээр «энэ 40ш В зэрэглэл» гэж шийдээд бичдэг; маргааш нь
    # засварт орох нь 5ш байсныг олж мэднэ. Хөдөлгөөн устгагддаггүй тул
    # ХЯНАЛТТАЙ ЗАСВАР байх ёстой — эс бөгөөс тэр мөр мөнхийн худал болно.
    # `0` = ТЭГЛЭХ (зэрэглэл: гарсан зэрэглэлдээ, падан: авто-FIFO руу).
    return_grade_id: int | None = None
    repair_qty: float | None = None
    writeoff_qty: float | None = None
    issue_line_id: int | None = None
    # ГАР ХОНОГ (H5): 0 нь ЖИНХЭНЭ утга («тэр өдөр нь тоологдохгүй») тул
    # бусад талбарын «0 = цэвэрлэх» дүрэм энд ажиллахгүй. Цэвэрлэх нь ИЛЭРХИЙ
    # `null` — `model_fields_set`-ээр «явуулаагүй»-гээс ялгагдана.
    billed_days_override: int | None = None
    confirm: bool = False


DETAIL_FIELDS = ("return_grade_id", "repair_qty", "writeoff_qty", "issue_line_id")


TIMELINE_ERR = "Хөдөлгөөний он цагийн дараалал зөрчигдөнө — үлдэгдэл сөрөг болно"


def _timeline_ok(c: models.Contract, affected: set,
                 mv_dates: dict | None = None, line_qty: dict | None = None) -> bool:
    """Санал болгож буй засварын дараа үлдэгдэл ХЭЗЭЭ Ч сөрөг болохгүй эсэх.

    Хамаарах (материал, зэрэглэл) бүрээр баталгаажсан хөдөлгөөнүүдийн огноот
    өөрчлөлтийг дарааллаар нь нэмж явна. Ямар нэг үе шатанд 0-ээс доош унавал
    тэр засвар бодит биш — 400.
    """
    mv_dates = mv_dates or {}
    line_qty = line_qty or {}
    evs: dict[tuple, list] = {}
    for m in c.movements:
        if m.status != "done":
            continue
        d = mv_dates.get(m.id, m.date)
        for ln in m.lines:
            key = (ln.material_id, ln.grade_id)
            if key not in affected:
                continue
            q = line_qty.get(ln.id, ln.qty)
            evs.setdefault(key, []).append(
                (d, m.id, ln.id or 0, (1 if m.type == "ISSUE" else -1) * q))
    for lst in evs.values():
        lst.sort(key=lambda e: e[:3])
        run = 0.0
        for _d, _m, _l, dq in lst:
            run += dq
            if run < -0.001:
                return False
    return True


def _touches_invoiced(c: models.Contract, days: list[date]) -> bool:
    """Заасан огноонууд НЭХЭМЖЛЭГДСЭН тооцоонд нөлөөлөх үү?

    Бараа гарсан/буцсан огноо нь ТҮҮНЭЭС ХОЙШ дуусах бүх циклийн ш×хоногийг
    өөрчилдөг тул `cycle_end > огноо` бүхэн нөлөөлнө. Худалдааны нэхэмжлэл
    (цикл нь нэг өдөр) тухайн өдрөөрөө таарна.
    """
    wins = [(i.cycle_start, i.cycle_end) for i in c.invoices if not i.no.startswith("OB-")]
    for d in days:
        for cs, ce in wins:
            if ce > d or (cs == ce and cs == d):
                return True
    return False


def _recompute_fees(db: Session, mv: models.Movement, ln: models.MovementLine):
    """Буцаалт/акт/ХУДАЛДААНЫ мөрийн дүнг каталогоос ДАХИН бодно —
    `add_movement`-тэй яг ижил томьёогоор."""
    price = db.query(models.MaterialGradePrice).filter_by(
        material_id=ln.material_id, grade_id=ln.grade_id).first()
    if mv.type == "RETURN":
        m = db.get(models.Material, ln.material_id)
        ln.repair_fee = ln.repair_qty * (m.repair_fee if m else 0)
        ln.writeoff_fee = ln.writeoff_qty * (price.nb_price if price else 0)
    elif mv.type == "WRITEOFF":
        ln.writeoff_fee = ln.qty * (price.nb_price if price else 0)
    elif mv.type == "SALE":
        # Тоог засахад дүн нь ДАГАНА — эс бөгөөс «40ш зарав» гэсэн мөр
        # 60ш-ийн мөнгө авч явна (H1-ийн хяналттай засвар).
        ln.sale_fee = ln.qty * (price.sale_price if price else 0)


def _apply_movement_edit(db: Session, mv: models.Movement, new_date=None, note=None,
                         line: models.MovementLine | None = None,
                         qty: float | None = None, rate: float | None = None,
                         detail: dict | None = None):
    """Хөдөлгөөнийг зас: нөөцөөс БУЦААЖ хас → утга сольж → дахин тусга.

    `detail` — буцаалтын мөрийн зэрэглэл/засвар/акт/падан. Нөөцийн толин
    тусгал ХУУЧИН утгаараа буцаж, ШИНЭ утгаараа дахин тавигдана: тиймээс
    буцаж ирсэн зэрэглэл солиход бараа хуучин зэрэглэлээс хасагдаж, шинэ рүү
    нэмэгдэнэ — гараар нөхөх юм үлдэхгүй.
    """
    done = mv.status == "done"
    if done:
        billing.unapply_movement_stock(db, mv)
    if new_date is not None:
        mv.date = new_date
    if note is not None:
        mv.note = note
    if line is not None:
        if qty is not None:
            line.qty = qty
        if rate is not None:
            line.rate = rate
        for k, v in (detail or {}).items():
            setattr(line, k, v)
        _recompute_fees(db, mv, line)
    if done:
        billing.apply_movement_stock(db, mv)


def _gated(db: Session, user, c: models.Contract, mutate, days: list[date],
           confirm: bool, label: str):
    """Засварын хаалга: нэхэмжлэгдээгүй бол чөлөөтэй, тэгэхгүй бол
    баталгаажуулалт хүсэж (хуурай ажиллагаа) эсвэл дахин бодоно.

    Буцна: (rebuilt | None, preview_response | None).
    """
    today = date.today()
    if not _touches_invoiced(c, days):
        mutate()
        db.commit()
        return None, None
    if not confirm:
        res = rebuild_svc.preview_rebuild(db, c, today, mutate)
        return None, {"rebuild_required": True, "diffs": res["diffs"],
                      "warnings": res["warnings"]}
    mutate()
    db.commit()
    out = rebuild_svc.rebuild_contract_invoices(db, c, today)
    audit.log(db, user, "rebuild", "invoice", c.id,
              f"№{c.no}: {label} · {out['deleted']} нэхэмжлэл устгаж "
              f"{out['created']} шинээр бодов"
              + ("; " + " · ".join(out["warnings"]) if out["warnings"] else ""))
    return out, None


class ItemPatch(_BM):
    material_id: int
    grade_id: int
    daily_rate: float | None = None
    unit_price: float | None = None
    # Аль ПАДАНГИЙН тарифыг засаж байгаа: зөвхөн энэ тарифтай (эсвэл тамгалагдаагүй)
    # олголтын мөрүүд шинэчлэгдэнэ. Заагаагүй бол — бүгд (хуучин зан төлөв).
    old_rate: float | None = None
    # Энэ зам одоо БҮХ ТҮҮХЭНД үйлчлэх тарифын өөрчлөлт болов — нэхэмжлэгдсэн
    # циклд хүрвэл дахин бодолтын хаалгаар л (H6).
    confirm: bool = False


@router.patch("/contracts/{cid}")
def patch_contract(cid: int, body: ContractPatch, db: Session = Depends(get_db),
                   user=Depends(auth.require_roles("manager", "finance"))):
    """Inline засвар — гэрээний нөхцөлүүд.

    `start_date` / `cycle_days` / `cycle_mode` нь БҮХ тооцоог хөдөлгөнө:
    нэхэмжлэлтэй гэрээнд эхлээд зөрүүг харуулж (rebuild_required), `confirm`
    ирсэн үед л дахин бодно. Гурвуулаа ЦОНХНЫ хэлбэрийг л өөрчилдөг тул нэг
    хаалганаас орно — «горим солих» нь «огноо солих»-оос аюулгүй биш.
    """
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    data = body.model_dump(exclude_unset=True)
    data.pop("clear_end_date", None)
    confirm = bool(data.pop("confirm", False))
    heavy = {k: data.pop(k) for k in ("start_date", "cycle_days", "cycle_mode")
             if data.get(k) is not None}
    if heavy and getattr(user, "role", "") != "manager":
        raise HTTPException(403, "Гэрээний эхлэх огноо, мөчлөгийг зөвхөн менежер өөрчилнө")
    if heavy.get("cycle_days") is not None and heavy["cycle_days"] < 1:
        raise HTTPException(400, "Циклийн хоног 1-ээс бага байж болохгүй")
    if heavy.get("cycle_mode") is not None and heavy["cycle_mode"] not in billing.CYCLE_MODES:
        raise HTTPException(400, CYCLE_MODE_ERR)
    fields = {**data, **heavy}
    before = {k: getattr(c, k) for k in fields}

    def mutate():
        for k, v in data.items():
            setattr(c, k, v)
        if body.clear_end_date:
            c.end_date = None
        for k, v in heavy.items():
            setattr(c, k, v)

    if heavy:
        rebuilt, preview = _gated(db, user, c, mutate, [date.min], confirm,
                                  "гэрээний огноо/мөчлөг")
        if preview:
            return preview
        audit.log(db, user, "update", "contract", c.id,
                  f"№{c.no}: " + (audit.changes_text(before, fields) or "clear_end_date"))
        row = serializers.contract_row(c, date.today())
        return {**row, "rebuilt": rebuilt} if rebuilt else row

    mutate()
    db.commit()
    audit.log(db, user, "update", "contract", c.id,
              f"№{c.no}: " + (audit.changes_text(before, fields) or "clear_end_date"))
    return serializers.contract_row(c, date.today())


@router.patch("/movements/{mid}")
def patch_movement(mid: int, body: MovementPatch, db: Session = Depends(get_db),
                   user=Depends(auth.require_roles("manager", "factory"))):
    """Хөдөлгөөний огноо / тэмдэглэлийг засна (огноог зөвхөн менежер)."""
    mv = db.get(models.Movement, mid)
    if not mv:
        raise HTTPException(404, "Хөдөлгөөн олдсонгүй")
    c = mv.contract
    new_date = body.date if body.date is not None else mv.date
    moved = new_date != mv.date
    if moved and getattr(user, "role", "") != "manager":
        raise HTTPException(403, "Хөдөлгөөний огноог зөвхөн менежер өөрчилнө")
    if moved and mv.status == "done":
        keys = {(ln.material_id, ln.grade_id) for ln in mv.lines}
        if not _timeline_ok(c, keys, mv_dates={mv.id: new_date}):
            raise HTTPException(400, TIMELINE_ERR)
    before = {"date": mv.date, "note": mv.note}
    after = {"date": new_date, "note": body.note if body.note is not None else mv.note}
    gmap, mmap = _maps(db)
    # Хүлээгдэж буй ачилт тооцоо ч, нөөц ч хөдөлгөөгүй тул үргэлж чөлөөтэй.
    days = [mv.date, new_date] if mv.status == "done" else []

    def mutate():
        _apply_movement_edit(db, mv, new_date=body.date, note=body.note)

    rebuilt, preview = _gated(db, user, c, mutate, days, body.confirm,
                              f"хөдөлгөөн #{mv.id}")
    if preview:
        return preview
    audit.log(db, user, "update", "movement", mv.id,
              f"№{c.no}: " + (audit.changes_text(before, after) or "өөрчлөлтгүй"))
    db.refresh(mv)
    out = serializers.movement(mv, gmap, mmap)
    return {**out, "rebuilt": rebuilt} if rebuilt else out


def _check_pin(db: Session, c: models.Contract, mv_date: date, material_id: int,
               grade_id: int, line_id: int | None, pin: int):
    """Падан-заалт (`issue_line_id`) нягтлал.

    Заалт нь `_lots`-д зөвхөн НЭЭЛТТЭЙ, ижил (материал, зэрэглэл)-тэй, тухайн
    өдрөөс ӨМНӨ гарсан падан дээр л үйлчилдэг — заалт нь чимээгүй үл тоогдвол
    Отгоо «заасан ч хөдөлсөнгүй» гэж дүгнэнэ. Тиймээс тэр нөхцлүүдийг энд
    ИЛЭРХИЙ монголоор татгалзана.

    Мөр өөрөө хараахан ҮҮСЭЭГҮЙ (бүртгэх агшин) бол `line_id=None` — тэр
    тохиолдолд «өөрийн хасалт» гэж байхгүй. Засвар ба бүртгэлт ХОЁУЛАА энэ
    ганц хаалгаар орно: UI одооноос заалтаа бүртгэх агшинд илгээдэг тул хоёр
    зам хоёр өөр дүрэмтэй байвал нэг нь чимээгүй уначихна.
    """
    src = db.get(models.MovementLine, pin)
    if not src:
        raise HTTPException(400, "Заасан падан олдсонгүй")
    smv = src.movement
    if smv.type != "ISSUE":
        raise HTTPException(400, "Заасан мөр олголтын мөр биш — падан болохгүй")
    if smv.contract_id != c.id:
        raise HTTPException(400, "Заасан падан энэ гэрээнийх биш")
    if not billing.movement_active(smv):
        raise HTTPException(400, "Заасан падан баталгаажаагүй эсвэл хүчингүй болсон")
    if src.material_id != material_id or src.grade_id != grade_id:
        raise HTTPException(400, "Заасан падан өөр материал/зэрэглэлийнх")
    if smv.date > mv_date:
        raise HTTPException(400, "Заасан падан буцаалтын өдрөөс хойш гарсан")
    # Хоосон падан руу заах нь утгагүй. ЭНЭ мөрийн өөрийнх нь хассан тоог
    # буцааж нэмнэ — эс бөгөөс өөрийнхөө хаасан паданг «хоосон» гэж уншина.
    lot = next((l for l in billing._lots(c) if l["line_id"] == src.id), None)
    if lot is not None:
        mine = sum(t["qty"] for t in lot["takes"] if t["line_id"] == line_id)
        if lot["left"] + mine <= 0.0001:
            raise HTTPException(400, "Заасан падан хоосон — өөр падан сонгоно уу")


# ГАР ХОНОГ (H5/R8): «Хоёр тал 12 хоног гэж гарын үсэг зурсан бол 12 нь
# хэлцлийн баримт». Тэгвэл бичсэн тоо нь ЯГ тэрээрээ нэхэгдэх, эс бөгөөс
# ЧАНГА татгалзах хоёрын нэг л байх ёстой — гуравдахь зам (чимээгүй багасгах)
# нь яг H5-ийн урьдчилан сэргийлэх гэсэн зөрчил өөрөө.
#
# Хязгаарыг хөдөлгүүр ӨӨРӨӨ хэлнэ (`billing.max_billed_days` → `override_cap`):
# буцаалт хасагдах падангуудын хамгийн жижиг цонх. Циклийн уртаар шалгадаг
# байсан нь дунд циклд гарсан падангийн үед ЗӨРДӨГ — зөвшөөрөгдсөн 12 нь
# хавсралт дээр 10 болж хэвлэгддэг байв.
def _check_billed_days(c: models.Contract, day: date, material_id: int, grade_id: int,
                       qty: float, days: int, *, pin: int | None = None,
                       line_id: int | None = None, prior: list[dict] = ()):
    if days < 0:
        raise HTTPException(400, "Хоног сөрөг байж болохгүй")
    cap = billing.max_billed_days(c, day, material_id, grade_id, qty,
                                  pin=pin, line_id=line_id, prior=prior)
    if cap is not None and days > cap:
        raise HTTPException(400, f"Гар хоног {cap} хоногоос их байж болохгүй — "
                                 f"тэр падангаас буцсан хэсэг энэ циклд ихдээ "
                                 f"{cap} хоног гадаа байсан")


@router.patch("/movement-lines/{lid}")
def patch_movement_line(lid: int, body: MovementLinePatch, db: Session = Depends(get_db),
                        user=Depends(auth.require_roles("manager"))):
    """Хөдөлгөөний мөрийн тоо / тариф / БУЦААЛТЫН ДЭЛГЭРЭНГҮЙГ засна.

    Падан загварын гол засвар. Буцаалтын мөрөнд нэмж: буцаж ирсэн зэрэглэл,
    засварт/актад орсон тоо, аль падангаас хасагдахыг заах пин. Дүн нь ХЭЗЭЭ Ч
    гараар бичигдэхгүй — каталогоос үүсгэх үеийнхтэй ижил томьёогоор дахин
    бодогдоно; нөөц нь толиндоо буцаж, нэхэмжлэгдсэн бол дахин бодолтын
    хаалгаар дамжина.
    """
    ln = db.get(models.MovementLine, lid)
    if not ln:
        raise HTTPException(404, "Мөр олдсонгүй")
    mv = ln.movement
    c = mv.contract
    if body.qty is not None and body.qty <= 0:
        raise HTTPException(400, "Тоо 0-ээс их байх ёстой")
    if body.rate is not None:
        if body.rate < 0:
            raise HTTPException(400, "Тариф сөрөг байж болохгүй")
        if mv.type != "ISSUE":
            raise HTTPException(400, "Тариф зөвхөн олголтын мөрд тавигдана")

    # ---- буцаалтын дэлгэрэнгүй ----
    detail = {k: getattr(body, k) for k in DETAIL_FIELDS
              if getattr(body, k) is not None}
    if "billed_days_override" in body.model_fields_set:
        detail["billed_days_override"] = body.billed_days_override
    if detail and mv.type != "RETURN":
        raise HTTPException(400, "Буцаалтын дэлгэрэнгүйг зөвхөн буцаалтын мөрд засна")
    for k in ("repair_qty", "writeoff_qty"):
        if detail.get(k) is not None and detail[k] < 0:
            raise HTTPException(400, "Засвар, актын тоо сөрөг байж болохгүй")
    if detail.get("return_grade_id") and not db.get(models.Grade, detail["return_grade_id"]):
        raise HTTPException(400, "Зэрэглэл олдсонгүй")
    if detail.get("issue_line_id"):
        _check_pin(db, c, mv.date, ln.material_id, ln.grade_id, ln.id,
                   detail["issue_line_id"])
    # `0` = ТЭГЛЭХ (авто-FIFO / гарсан зэрэглэлдээ) — NULL болгож хадгална
    for k in ("return_grade_id", "issue_line_id"):
        if detail.get(k) == 0:
            detail[k] = None

    new_qty = body.qty if body.qty is not None else ln.qty
    new_rep = detail.get("repair_qty", ln.repair_qty)
    new_wo = detail.get("writeoff_qty", ln.writeoff_qty)
    if mv.type == "RETURN" and new_rep + new_wo > new_qty + 0.001:
        raise HTTPException(400, "Засвар + акт нь буцаалтын тооноос их байна")
    # Гар хоногийг ШИНЭ тоо/заалтаар нь шалгана. ТОО ба ЗААЛТ нь өөрсдөө
    # хязгаарыг хөдөлгөдөг (буцаалт өөр падан руу халина) тул хоногоо
    # хөндөөгүй засвар дээр ч ХАДГАЛАГДСАН тоог дахин шалгана — эс бөгөөс
    # чимээгүй хумилт хаалганы араар буцаж орно.
    if "billed_days_override" in detail:
        ov_days = detail["billed_days_override"]            # `None` = ТЭГЛЭХ
    else:
        ov_days = ln.billed_days_override if mv.type == "RETURN" else None
    if ov_days is not None:
        new_pin = detail["issue_line_id"] if "issue_line_id" in detail else ln.issue_line_id
        _check_billed_days(c, mv.date, ln.material_id, ln.grade_id, new_qty,
                           ov_days, pin=new_pin, line_id=ln.id)
    if mv.status == "done" and body.qty is not None:
        if not _timeline_ok(c, {(ln.material_id, ln.grade_id)}, line_qty={ln.id: new_qty}):
            raise HTTPException(400, TIMELINE_ERR)
        if mv.type == "ISSUE" and new_qty > ln.qty:
            st = db.query(models.Stock).filter_by(material_id=ln.material_id,
                                                  grade_id=ln.grade_id).first()
            if not st or st.on_hand < new_qty - ln.qty:
                raise HTTPException(400, "Агуулахад хүрэлцэхгүй")
    before = {"qty": ln.qty, "rate": ln.rate,
              **{k: getattr(ln, k) for k in detail}}
    after = {"qty": new_qty, "rate": body.rate if body.rate is not None else ln.rate,
             **detail}
    gmap, mmap = _maps(db)
    days = [mv.date] if mv.status == "done" else []

    def mutate():
        _apply_movement_edit(db, mv, line=ln, qty=body.qty, rate=body.rate, detail=detail)

    rebuilt, preview = _gated(db, user, c, mutate, days, body.confirm,
                              f"хөдөлгөөн #{mv.id} мөр #{lid}")
    if preview:
        return preview
    audit.log(db, user, "update", "movement", mv.id,
              f"№{c.no} мөр #{lid}: " + (audit.changes_text(before, after) or "өөрчлөлтгүй"))
    db.refresh(mv)
    out = serializers.movement(mv, gmap, mmap)
    return {**out, "rebuilt": rebuilt} if rebuilt else out


class MovementVoidIn(_BM):
    reason: str = ""
    confirm: bool = False


@router.post("/movements/{mid}/void")
def void_movement(mid: int, body: MovementVoidIn, db: Session = Depends(get_db),
                  user=Depends(auth.require_roles("manager"))):
    """Хөдөлгөөнийг ХҮЧИНГҮЙ болгоно — устгахгүй, нөөцийн толийг нь буцаана.

    «Буруу гэрээнд олгосон падан ХЭЗЭЭ Ч ЗОГСОХГҮЙ түрээс тооцно»
    (Чадварын харьцуулалт §3 H1). Хөдөлгөөн устгагддаггүй тул засварын
    ганц зам нь энэ.

    Гурван бодит байдал, гурван зам:
      · ХҮЛЭЭГДЭЖ БУЙ — нөөц ч, тооцоо ч хөдлөөгүй: зүгээр л тэмдэглэнэ
        (үйлдвэрийн жагсаалтаас гарна).
      · ОЛГОЛТ — дараагийн буцаалт энэ падангаас хассан бол ТАТГАЛЗАНА
        (эс бөгөөс тэр буцаалт эх үүсвэргүй үлдэж, үлдэгдэл сөрөг болно).
      · БУЦААЛТ / АКТ — бараа дахин ТҮРЭЭСЭНД гарна; хооронд нь дахин
        олгогдсон байвал агуулахаас хасах юм үлдээгүй тул ТАТГАЛЗАНА.

    Нэхэмжлэгдсэн цонхонд байсан бол засварын ЯГ тэр хаалгаар (`_gated`)
    дамжина: эхлээд зөрүүг харуулж, `confirm` ирсэн үед л дахин бодно.
    """
    mv = db.get(models.Movement, mid)
    if not mv:
        raise HTTPException(404, "Хөдөлгөөн олдсонгүй")
    if mv.voided_at is not None:
        raise HTTPException(409, "Энэ хөдөлгөөн аль хэдийн хүчингүй болсон байна")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")
    c = mv.contract
    done = mv.status == "done"
    if done:
        if mv.type == "ISSUE" and billing.lot_consumers(c, mv.id):
            raise HTTPException(409, billing.LOT_CONSUMED_ERR)
        blocked = billing.reversal_block(db, mv)
        if blocked:
            raise HTTPException(409, blocked)

    gmap, mmap = _maps(db)
    days = [mv.date] if done else []

    def mutate():
        # Нөөцийг ЭХЛЭЭД буцаана — `_apply_movement_edit`-тэй ижил дараалал:
        # хасах юмаа хасчихаад дараа нь тэмдэглэнэ.
        if mv.status == "done":
            billing.unapply_movement_stock(db, mv)
        mv.voided_at = datetime.utcnow()
        mv.void_reason = reason
        mv.voided_by = getattr(user, "name", "") or ""

    rebuilt, preview = _gated(db, user, c, mutate, days, body.confirm,
                              f"хөдөлгөөн #{mv.id} хүчингүй болгов")
    if preview:
        return preview
    qty = sum(ln.qty for ln in mv.lines)
    audit.log(db, user, "void", "movement", mv.id,
              f"№{c.no} · {mv.date} · {mv.type} {qty:g}ш — ХҮЧИНГҮЙ: {reason}")
    db.refresh(mv)
    out = serializers.movement(mv, gmap, mmap)
    return {**out, "rebuilt": rebuilt} if rebuilt else out


# ---------------- ЧӨЛӨӨТ АКТ БИЧИЛТ (R12 / түр R15 / H4) ----------------
#
# Отгоо эгчийн «акт» бол эвдрэлийн хөлс биш, ХЭЛЭЛЦЭЭРИЙН гарын үсэгтэй
# баримт: тээвэр, цэвэрлэгээ, кран дуудлага нэг циклд эвхэгддэг, БАС
# хөнгөлөлт байдаг («нийт актнаас 15% хасч тооцлоо»). Систем нь хөдөлгөөнөөс
# гарсан засвар/актын хөлсийг л боддог байсан тул эхний акт-хэлэлцээр гарын
# үсэгтэй цаас үлдээгээд, хавсралт нь таарахаа больдог байв.
#
# Бүх гурван зам (бичих, засах, хүчингүй болгох) НЭГ хаалгаар: нэхэмжлэгдээгүй
# цонхонд чөлөөтэй, нэхэмжлэгдсэн цонхонд `_gated` — эхлээд зөрүү, дараа нь
# баталгаажуулалт.

class AktIn(_BM):
    date: _date_t
    amount: float                    # + нэмэгдэл, − хөнгөлөлт
    note: str = ""
    confirm: bool = False


class AktPatch(_BM):
    date: _date_t | None = None
    amount: float | None = None
    note: str | None = None
    confirm: bool = False


class AktVoidIn(_BM):
    reason: str = ""
    confirm: bool = False


AKT_NOTE_ERR = ("Актын тэмдэглэл заавал бичигдэнэ — «юуны төлөө» гэдэг нь "
                "гарын үсэгтэй мөрөндөө байх ёстой")
AKT_RENT_ONLY_ERR = ("Актын бичилт зөвхөн ТҮРЭЭСИЙН гэрээнд бичигдэнэ — "
                     "худалдааны гэрээнд тооцооны цикл байхгүй")
AKT_ZERO_ERR = "Актын дүн 0 байж болохгүй"
AKT_BEFORE_START_ERR = "Огноо гэрээний эхлэлээс өмнө байна"
AKT_VOIDED_ERR = "Энэ актын бичилт аль хэдийн хүчингүй болсон байна"

akt_roles = auth.require_roles("manager", "finance")


def _akt_note(raw: str | None) -> str:
    note = (raw or "").strip()
    if not note:
        raise HTTPException(400, AKT_NOTE_ERR)
    return note


def _akt_check(c: models.Contract, d: date, amount: float, *, drop_id: int | None = None):
    """Санал болгож буй бичилтийн ЕРӨНХИЙ шалгуурууд — бичих, засах хоёуланд."""
    if d < c.start_date:
        raise HTTPException(400, AKT_BEFORE_START_ERR)
    if abs(amount) < 0.005:
        raise HTTPException(400, AKT_ZERO_ERR)
    if billing.akt_negative_windows(c, drop_id=drop_id, add=(d, amount)):
        raise HTTPException(400, billing.AKT_NEGATIVE_ERR)


def _akt_out(a: models.AktEntry, rebuilt):
    out = serializers.akt_entry(a)
    return {**out, "rebuilt": rebuilt} if rebuilt else out


def _akt_label(a: models.AktEntry) -> str:
    return f"{a.date} · {a.amount:+,.0f}₮ · {a.note}"


@router.post("/contracts/{cid}/akt")
def add_akt(cid: int, body: AktIn, db: Session = Depends(get_db), user=Depends(akt_roles)):
    """Гэрээнд чөлөөт акт бичнэ — эерэг нэмэгдэл, сөрөг хөнгөлөлт."""
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    if c.type != "rent":
        raise HTTPException(400, AKT_RENT_ONLY_ERR)
    note = _akt_note(body.note)
    _akt_check(c, body.date, body.amount)

    box: dict = {}

    def mutate():
        a = models.AktEntry(contract_id=c.id, date=body.date,
                            amount=body.amount, note=note)
        # relationship-д нэмнэ — эс бөгөөс тухайн session дотор ачаалагдсан
        # `c.akt_entries` хуучирч, дахин бодолт актыг ХАРАХГҮЙ өнгөрнө.
        c.akt_entries.append(a)
        box["a"] = a

    rebuilt, preview = _gated(db, user, c, mutate, [body.date], body.confirm,
                              f"акт {body.amount:+,.0f}₮ бичив")
    if preview:
        return preview
    a = box["a"]
    audit.log(db, user, "create", "akt", a.id, f"№{c.no} · {_akt_label(a)}")
    return _akt_out(a, rebuilt)


@router.patch("/akt/{aid}")
def patch_akt(aid: int, body: AktPatch, db: Session = Depends(get_db),
              user=Depends(akt_roles)):
    """Актын огноо / дүн / тэмдэглэлийг засна — хэлэлцээр дахин тохирогддог."""
    a = db.get(models.AktEntry, aid)
    if not a:
        raise HTTPException(404, "Актын бичилт олдсонгүй")
    if a.voided_at is not None:
        raise HTTPException(409, AKT_VOIDED_ERR)
    c = a.contract
    new_date = body.date or a.date
    new_amount = a.amount if body.amount is None else body.amount
    new_note = a.note if body.note is None else _akt_note(body.note)
    _akt_check(c, new_date, new_amount, drop_id=a.id)
    before = _akt_label(a)
    # Огноо хөдөлбөл ХОЁР цонх хөндөгдөнө — хуучин нь ч дахин бодогдоно
    days = sorted({a.date, new_date})

    def mutate():
        a.date, a.amount, a.note = new_date, new_amount, new_note

    rebuilt, preview = _gated(db, user, c, mutate, days, body.confirm, "актын бичилт зассан")
    if preview:
        return preview
    audit.log(db, user, "update", "akt", a.id,
              f"№{c.no} · {before} → {_akt_label(a)}")
    return _akt_out(a, rebuilt)


@router.post("/akt/{aid}/void")
def void_akt(aid: int, body: AktVoidIn, db: Session = Depends(get_db),
             user=Depends(akt_roles)):
    """Актын бичилтийг ХҮЧИНГҮЙ болгоно — устгахгүй, тооцооноос гаргана (H1).

    Мөр нь жагсаалтад ХҮЧИНГҮЙ тэмдэгтэй, шалтгаантайгаа үлдэнэ; нэхэмжлэл,
    хавсралт, акт-PDF-ийн аль нь ч түүнийг дахин хэвлэхгүй.
    """
    a = db.get(models.AktEntry, aid)
    if not a:
        raise HTTPException(404, "Актын бичилт олдсонгүй")
    if a.voided_at is not None:
        raise HTTPException(409, AKT_VOIDED_ERR)
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")
    c = a.contract
    # Нэмэгдэл гарахад тэр циклд үлдсэн хөнгөлөлт нүцгэн үлдэж болно
    if billing.akt_negative_windows(c, drop_id=a.id):
        raise HTTPException(400, billing.AKT_NEGATIVE_ERR)
    label = _akt_label(a)

    def mutate():
        a.voided_at = datetime.utcnow()
        a.void_reason = reason
        a.voided_by = getattr(user, "name", "") or ""

    rebuilt, preview = _gated(db, user, c, mutate, [a.date], body.confirm,
                              "актын бичилт хүчингүй болгов")
    if preview:
        return preview
    audit.log(db, user, "void", "akt", a.id,
              f"№{c.no} · {label} — ХҮЧИНГҮЙ: {reason}")
    return _akt_out(a, rebuilt)


# ---------- ТАРИФЫН ДАХИН ТОХИРОЛТ (R3 / H6) ----------
#
# Отгоо эгчийн семантик нэг мөр: ШИНЭ ТАРИФ ДАРААГИЙН ЦИКЛЭЭС. Гарын үсэг
# зурсан өнгөрсөн нь ХЭВЭЭР. Урьд нь `PATCH /items` нь падангийн тарифыг
# ЧИМЭЭГҮЙ дарж бичээд дахин бодолт хийдэггүй байсан тул нэхэмжлэгдсэн
# циклүүд хуучин дүнгээ хэдэн сар авч яваад, огт хамаагүй засварын үед гэнэт
# үсэрдэг байв — «машин санамсаргүй түүх дахин бичлээ». Одоо тариф нь ЯВДАЛ:
# хэзээнээс, юунаас юу болов; өнгөрсөн рүү хүрвэл ЯГ ТЭР хаалгаар (`_gated`).

class RateChangeIn(_BM):
    material_id: int
    grade_id: int
    # Аль ПАДАНГИЙН ҮЕИЙГ заасан бэ — заагаагүй бол материал+зэрэглэлийн бүгд
    old_rate: float | None = None
    new_rate: float
    # Заагаагүй бол ДАРААГИЙН циклийн эхлэл (Отгоогийн анхны утга)
    effective_from: _date_t | None = None
    note: str = ""
    confirm: bool = False


class RateChangeVoidIn(_BM):
    reason: str = ""
    confirm: bool = False


RATE_RENT_ONLY_ERR = ("Тарифын өөрчлөлт зөвхөн ТҮРЭЭСИЙН гэрээнд — худалдааны "
                      "гэрээнд тооцооны цикл байхгүй")
RATE_NEGATIVE_ERR = "Тариф сөрөг байж болохгүй"
RATE_VOIDED_ERR = "Энэ тарифын өөрчлөлт аль хэдийн хүчингүй болсон байна"


def _rate_effective_from(c: models.Contract, raw: date | None) -> date:
    """«Хэзээнээс» — заагаагүй бол дараагийн цикл; заасан бол ХИЛ байх ёстой.

    Цонхны дунд орсон огноо нь нэг циклийг хоёр тарифтай болгоно: хавсралтын
    мөрүүд хагарч, «нэг цикл — нэг тариф» гэсэн 20 жилийн хэлбэр эвдэрнэ.
    """
    if raw is None:
        return billing.next_cycle_start(c, date.today())
    if not billing.is_cycle_boundary(c, raw):
        win = billing.cycle_of(c, raw)
        hint = f"{win[0]} эсвэл {win[1]}" if win else str(c.start_date)
        raise HTTPException(400, f"«Хэзээнээс» нь циклийн ЭХЛЭЛ байх ёстой — {hint}")
    return raw


def _rate_label(rc: models.RateChange, mname: str) -> str:
    old = f"{rc.old_rate:,.0f}₮" if rc.old_rate is not None else "бүх тариф"
    return f"{mname}: {old} → {rc.new_rate:,.0f}₮ · {rc.effective_from}-ээс"


@router.post("/contracts/{cid}/rate-change")
def add_rate_change(cid: int, body: RateChangeIn, db: Session = Depends(get_db),
                    user=Depends(auth.require_roles("manager"))):
    """Тарифыг ХЭЗЭЭНЭЭС нь дахин тохирно (Мөнхболд 300 → 350 → 450)."""
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    if c.type != "rent":
        raise HTTPException(400, RATE_RENT_ONLY_ERR)
    if body.new_rate < 0:
        raise HTTPException(400, RATE_NEGATIVE_ERR)
    eff = _rate_effective_from(c, body.effective_from)
    m = db.get(models.Material, body.material_id)
    if not m:
        raise HTTPException(404, "Материал олдсонгүй")

    box: dict = {}

    def mutate():
        rc = models.RateChange(contract_id=c.id, material_id=body.material_id,
                               grade_id=body.grade_id, old_rate=body.old_rate,
                               new_rate=body.new_rate, effective_from=eff,
                               note=(body.note or "").strip())
        # relationship-д нэмнэ — эс бөгөөс тухайн session дотор ачаалагдсан
        # `c.rate_changes` хуучирч, дахин бодолт өөрчлөлтийг ХАРАХГҮЙ өнгөрнө.
        c.rate_changes.append(rc)
        box["rc"] = rc

    rebuilt, preview = _gated(db, user, c, mutate, [eff], body.confirm,
                              f"тариф → {body.new_rate:,.0f}₮ ({eff}-ээс)")
    if preview:
        return preview
    rc = box["rc"]
    audit.log(db, user, "create", "rate_change", rc.id,
              f"№{c.no} · {_rate_label(rc, m.name)}"
              + (f" · {rc.note}" if rc.note else ""))
    gmap, mmap = _maps(db)
    return {**serializers.rate_change(rc, gmap, mmap), "ok": True,
            "rebuilt": rebuilt}


@router.post("/rate-changes/{rid}/void")
def void_rate_change(rid: int, body: RateChangeVoidIn, db: Session = Depends(get_db),
                     user=Depends(auth.require_roles("manager"))):
    """Тарифын өөрчлөлтийг ХҮЧИНГҮЙ болгоно — устгахгүй, тооцооноос гаргана (H1).

    Падангийн ТӨРӨЛХИЙН тариф хэвээр байдаг тул буцах газар үргэлж бий:
    хүчингүй болгосон агшинд тариф нь өөрөө хуучин утгадаа эргэж очно.
    """
    rc = db.get(models.RateChange, rid)
    if not rc:
        raise HTTPException(404, "Тарифын өөрчлөлт олдсонгүй")
    if rc.voided_at is not None:
        raise HTTPException(409, RATE_VOIDED_ERR)
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")
    c = rc.contract
    m = db.get(models.Material, rc.material_id)
    label = _rate_label(rc, m.name if m else "?")

    def mutate():
        rc.voided_at = datetime.utcnow()
        rc.void_reason = reason
        rc.voided_by = getattr(user, "name", "") or ""

    rebuilt, preview = _gated(db, user, c, mutate, [rc.effective_from], body.confirm,
                              "тарифын өөрчлөлт хүчингүй болгов")
    if preview:
        return preview
    audit.log(db, user, "void", "rate_change", rc.id,
              f"№{c.no} · {label} — ХҮЧИНГҮЙ: {reason}")
    gmap, mmap = _maps(db)
    return {**serializers.rate_change(rc, gmap, mmap), "ok": True, "rebuilt": rebuilt}


# ---------- АЛДАНГИЙН НЭХЭЛТ ХҮЧИНГҮЙ БОЛГОХ (R25 / H2 · H1-ийн тэгш хэм) ----------
#
# Алданги бол Отгоо эгчийн ХӨШҮҮРЭГ — 20 жилийн Excel-д ганц ч удаа нэхэгдээгүй.
# Хөшүүрэг гэдэг нь ТАТАГДААД СУЛАРДАГ гэсэн үг: андуурч нэхэх, эсвэл нэхээд
# утсаар ярьж байгаад өршөөх нь ХЭВИЙН тохиолдол, онцгой нь биш. Систем дээр
# төлбөр, хөдөлгөөн, акт, тариф, бартерын хөрөнгө бүгд хүчингүй болдог байхад
# мөнгө ҮҮСГЭДЭГ цорын ганц үйлдэл нь буцаагддаггүй байв.
#
# ⚠ ЦУЦЛАЛТ НЬ ХАСАЛТ БИШ, ДАХИН ДЕРИВАЦИ. `penalty_booked`-ыг ГАРААР хасах нь
# буруу: нэхэлт нь ЯВДАЛ бөгөөс rebuild нь энэ гэрээний явдлууд + харилцагчийн
# амьд төлбөрүүдийг НЭГ цагийн шугам болгож дахин тоглуулдаг. Тиймээс явдлыг
# хүчингүй гэж тэмдэглээд, replay-ээс хасаад (`LIVE_CHARGE`), дахин бодуулна —
# `penalty_booked`, `penalty_booked_until`, хуваарилалт бүгд өөрсдөө зөв утгаа
# олно. Тэр нэхэлтэд явсан төлбөр нь ижил replay-ээр үндсэн өр рүү буцаж очно.

class PenaltyChargeVoidIn(_BM):
    reason: str = ""
    confirm: bool = False


CHARGE_VOIDED_ERR = "Энэ алдангийн нэхэлт аль хэдийн хүчингүй болсон байна"


@router.post("/penalty-charges/{chid}/void")
def void_penalty_charge(chid: int, body: PenaltyChargeVoidIn, db: Session = Depends(get_db),
                        user=Depends(auth.require_roles("manager", "finance"))):
    """Нэхсэн алдангийг ХҮЧИНГҮЙ болгоно — устгахгүй, тооцооноос гаргана.

    Хаалга нь бусад цуцлалттай ЯГ ижил (`_gated`): нэхэлт нь ЗӨВХӨН
    нэхэмжлэгдсэн, хугацаа хэтэрсэн цонхон дээр л боломжтой тул цуцлалт нь
    ҮРГЭЛЖ түүхэнд хүрнэ — эхлээд цикл бүрийн хуучин→шинэ зөрүү, дараа нь
    `confirm` ирэхэд л бичилт.
    """
    pc = db.get(models.PenaltyCharge, chid)
    if not pc:
        raise HTTPException(404, "Алдангийн нэхэлт олдсонгүй")
    if pc.voided_at is not None:
        raise HTTPException(409, CHARGE_VOIDED_ERR)
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")
    c = pc.contract
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    label = f"{pc.as_of} өдрөөр {pc.amount:,.0f}₮"

    def mutate():
        pc.voided_at = datetime.utcnow()
        pc.void_reason = reason
        pc.voided_by = getattr(user, "name", "") or ""

    # `date.min` — «БҮХ цонхонд хамаарна». Нэхэлтийн `as_of` нь сүүлийн циклийн
    # ТӨГСГӨЛӨӨС ХОЙШ байх нь энгийн (хугацаа хэтэрсэн үед л нэхнэ) тул түүгээр
    # шалгавал `_touches_invoiced` ХУДАЛ «хүрэхгүй» гэж хариулаад цуцлалт
    # дахин бодолтгүй өнгөрч, `penalty_booked` нэхэмжлэл дээрээ ҮЛДЭНЭ.
    rebuilt, preview = _gated(db, user, c, mutate, [date.min], body.confirm,
                              "алдангийн нэхэлт хүчингүй болгов")
    if preview:
        return preview
    audit.log(db, user, "void", "penalty_charge", pc.id,
              f"№{c.no} · {c.client.name} · {label} — ХҮЧИНГҮЙ: {reason}")
    return {**serializers.penalty_charge(pc), "ok": True, "rebuilt": rebuilt}


@router.patch("/contracts/{cid}/items")
def patch_item(cid: int, body: ItemPatch, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager"))):
    """Inline засвар — тариф/нэгж үнэ. БҮХ ТҮҮХЭНД үйлчилнэ (хуучин зам).

    Хуучин үйлчлүүлэгчидтэй тохирохын тулд endpoint нь үлдсэн ч ҮР ДҮН нь
    одоо ЯВДЛААР явна: гэрээний эхлэлээс хүчинтэй `RateChange` үүсч, падангийн
    тариф ХЭВЭЭР үлдэнэ (дарж бичихээ болив). Нэхэмжлэгдсэн цикл хөндөгдвөл
    дахин бодолтын хаалга — «чимээгүй ухраах» зам ҮХЛЭЭ (H6).
    """
    it = db.query(models.ContractItem).filter_by(
        contract_id=cid, material_id=body.material_id, grade_id=body.grade_id).first()
    if not it:
        raise HTTPException(404, "Гэрээний мөр олдсонгүй")
    if body.daily_rate is not None and body.daily_rate < 0:
        raise HTTPException(400, RATE_NEGATIVE_ERR)
    c = it.contract
    sale = c.type == "sale"
    new_rate = body.unit_price if sale else body.daily_rate
    if new_rate is None:
        return {"ok": True, "daily_rate": it.daily_rate, "unit_price": it.unit_price}
    cur = it.unit_price if sale else it.daily_rate

    def mutate():
        # 1) ЯВДАЛ — гэрээний эхлэлээс (бүх түүхэнд), заасан ҮЕ дээр л
        c.rate_changes.append(models.RateChange(
            contract_id=c.id, material_id=body.material_id, grade_id=body.grade_id,
            old_rate=body.old_rate, new_rate=new_rate,
            effective_from=c.start_date, note="Гэрээний тариф — бүх түүхэнд"))
        # 2) Гэрээний үндсэн тариф — ШИНЭ олголт үүгээр тамгалагдана
        if body.old_rate is None or abs(cur - body.old_rate) < 0.005:
            if body.daily_rate is not None:
                it.daily_rate = body.daily_rate
            if body.unit_price is not None:
                it.unit_price = body.unit_price

    rebuilt, preview = _gated(db, user, c, mutate, [c.start_date], body.confirm,
                              f"тариф → {new_rate:,.0f}₮ (бүх түүхэнд)")
    if preview:
        return preview
    m = db.get(models.Material, body.material_id)
    audit.log(db, user, "update", "contract_item", cid,
              f"{m.name if m else '?'}: тариф/үнэ → {new_rate:,.0f}₮ · бүх түүхэнд")
    return {"ok": True, "daily_rate": it.daily_rate, "unit_price": it.unit_price,
            "rebuilt": rebuilt}


@router.post("/contracts/{cid}/movements")
def add_movement(cid: int, body: schemas.MovementIn, db: Session = Depends(get_db),
                 user=Depends(auth.require_roles("manager", "factory"))):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    if body.type not in billing.MOVEMENT_TYPES:
        raise HTTPException(400, "Буруу төрөл")
    # ХУДАЛДАА БОЛГОВ (H7) нь ТҮРЭЭСИЙН гэрээний гарц. Худалдааны гэрээнд
    # ачилт нь өөрөө худалдаа бөгөөс мөр бүр өөрийн нэхэмжлэлтэй
    # (`derivable_invoice_specs` → `S-…`); тэнд SALE бичих нь нэг барааг ХОЁР
    # УДАА (олголтоор нь ба худалдаагаар нь) нэхэх байсан.
    if body.type == "SALE" and c.type != "rent":
        raise HTTPException(400, SALE_ONLY_RENT_ERR)
    status = "pending" if body.type == "ISSUE" else "done"
    # ---- ЭХЛЭЭД БҮГДИЙГ НЯГТАЛНА, дараа нь мөр үүснэ ----
    # Хөдөлгөөнөө урьдчилж үүсгэвэл хагас бүтсэн мөрүүд нь хуваарилалтын
    # тооцоонд (`billing.consumed_lots`) орж, гар хоногийн хязгаарыг өөрөө
    # хөдөлгөнө. Тиймээс нягтлал нь БҮХЭЛДЭЭ DB-д хүрэхээс өмнө болно.
    if body.type in ("RETURN", "SALE"):
        prior: list[dict] = []
        for ln in body.lines:
            out = billing.qty_on(c, ln.material_id, ln.grade_id, body.date)
            if ln.qty > out + 0.001:
                raise HTTPException(400, f"Түрээсэнд байгаагаас их "
                                         f"{'худалдаа' if body.type == 'SALE' else 'буцаалт'} "
                                         f"(гадаа: {out:g})")
            # Заалт ба гар хоног нь одоо БҮРТГЭХ АГШИНД ирдэг (UI илгээнэ) —
            # засварын замтай ЯГ ижил хаалгаар нягтлагдана.
            if ln.issue_line_id:
                _check_pin(db, c, body.date, ln.material_id, ln.grade_id, None,
                           ln.issue_line_id)
            if ln.billed_days_override is not None and body.type == "RETURN":
                _check_billed_days(c, body.date, ln.material_id, ln.grade_id, ln.qty,
                                   ln.billed_days_override, pin=ln.issue_line_id,
                                   prior=prior)
            prior.append(billing.draft_line(body.date, ln.material_id, ln.grade_id,
                                            ln.qty, ln.issue_line_id))
    mv = models.Movement(contract_id=cid, type=body.type, date=body.date,
                         note=body.note, status=status)
    db.add(mv)
    db.flush()
    defaults = billing.default_rates(c)
    marks: list[str] = []
    for ln in body.lines:
        rate = None
        if body.type == "ISSUE":
            # Падан: хүсэлтийн тариф, эс бөгөөс гэрээний мөрийн тариф тамгална
            rate = ln.rate if ln.rate is not None else defaults.get((ln.material_id, ln.grade_id))
            st = db.query(models.Stock).filter_by(material_id=ln.material_id, grade_id=ln.grade_id).first()
            if not st or st.on_hand < ln.qty:
                raise HTTPException(400, "Агуулахад хүрэлцэхгүй")
        repair_fee = writeoff_fee = sale_fee = 0.0
        if body.type == "RETURN":
            m = db.get(models.Material, ln.material_id)
            repair_fee = ln.repair_qty * (m.repair_fee if m else 0)
            price = db.query(models.MaterialGradePrice).filter_by(
                material_id=ln.material_id, grade_id=ln.grade_id).first()
            writeoff_fee = ln.writeoff_qty * (price.nb_price if price else 0)
            # ГАР ХОНОГ ба ПАДАН-ЗААЛТ бол хоёулаа МӨНГӨНИЙ шийдвэр (H5) —
            # тохирсон АГШИНДАА audit-д буух ёстой, зөвхөн хожмын засвартаа биш.
            name = m.name if m else f"#{ln.material_id}"
            if ln.billed_days_override is not None:
                marks.append(f"{name}: гар хоног {ln.billed_days_override}")
            if ln.issue_line_id:
                marks.append(f"{name}: падан #{ln.issue_line_id}")
        if body.type == "WRITEOFF":
            price = db.query(models.MaterialGradePrice).filter_by(
                material_id=ln.material_id, grade_id=ln.grade_id).first()
            writeoff_fee = ln.qty * (price.nb_price if price else 0)
        if body.type == "SALE":
            # ХУДАЛДАХ ҮНЭ (`sale_price`) — актын НБҮнэ БИШ. Хоёр шатлалт
            # үнэлгээ (R32) яг энэ ялгаанд зориулагдсан: акт бол нөхөн үнэ,
            # худалдаа бол зарах үнэ. Дүн нь ХЭЗЭЭ Ч гараар ирэхгүй.
            price = db.query(models.MaterialGradePrice).filter_by(
                material_id=ln.material_id, grade_id=ln.grade_id).first()
            sale_fee = ln.qty * (price.sale_price if price else 0)
        db.add(models.MovementLine(movement_id=mv.id, material_id=ln.material_id,
                                   grade_id=ln.grade_id, qty=ln.qty, rate=rate,
                                   issue_line_id=ln.issue_line_id,
                                   return_grade_id=ln.return_grade_id,
                                   billed_days_override=(ln.billed_days_override
                                                         if body.type == "RETURN" else None),
                                   repair_qty=ln.repair_qty, repair_fee=repair_fee,
                                   writeoff_qty=ln.writeoff_qty, writeoff_fee=writeoff_fee,
                                   sale_fee=sale_fee))
    db.commit()
    db.refresh(mv)
    qty = sum(ln.qty for ln in body.lines)
    audit.log(db, user, "create", "movement", mv.id,
              f"№{c.no} · {mv.date} · {mv.type} {qty:g}ш"
              + (f" ({mv.status})" if mv.status != "done" else "")
              + ("".join(f" · {x}" for x in marks))
              + (f" · {mv.note}" if mv.note else ""))
    if status == "done":
        billing.apply_movement_stock(db, mv)
    return {"id": mv.id, "status": mv.status}


@router.post("/movements/{mid}/confirm")
def confirm_movement(mid: int, db: Session = Depends(get_db),
                     user=Depends(auth.require_roles("manager", "factory"))):
    """Дарга ачилтыг баталгаажуулна — нөөц хөдөлж, тооцоо эхэлнэ."""
    mv = db.get(models.Movement, mid)
    if not mv:
        raise HTTPException(404, "Олдсонгүй")
    if mv.voided_at is not None:
        raise HTTPException(409, "Энэ ачилт хүчингүй болсон — баталгаажуулах боломжгүй")
    if mv.status == "done":
        return {"ok": True}
    for ln in mv.lines:
        st = db.query(models.Stock).filter_by(material_id=ln.material_id, grade_id=ln.grade_id).first()
        if not st or st.on_hand < ln.qty:
            raise HTTPException(400, "Агуулахад хүрэлцэхгүй байна — тооллого шалгана уу")
    mv.status = "done"
    db.commit()
    billing.apply_movement_stock(db, mv)
    return {"ok": True}


@router.post("/contracts/{cid}/extend")
def extend(cid: int, body: schemas.ExtendIn, db: Session = Depends(get_db),
           user=Depends(auth.require_roles("manager"))):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    c.end_date = body.end_date
    db.commit()
    return {"ok": True, "end_date": str(c.end_date)}


# ---------- ХААЛТ (H7) ----------
#
# Отгоо эгчийн ёслол: гадаа үлдсэнийг шийд (буцаалт эсвэл ДУТАГДУУЛСАН
# НБҮнээр) → эцсийн ТАСАРХАЙ циклээ нэх → барьцаагаа суутгаж/буцааж цэвэрлэ →
# «хаав» гэж бич. Урьд нь систем нь зөвхөн СҮҮЛЧИЙН товчийг мэддэг байсан:
# эцсийн хагас цикл нэхэмжлэл болдоггүй, ёслолыг чиглүүлэх юу ч байхгүй.

class CloseIn(_BM):
    """`close_date` заагаагүй бол ӨНӨӨДӨР — хуучин нэг товчийн зам хэвээр."""
    close_date: _date_t | None = None


CLOSE_GOODS_ERR = "Түрээсэнд бараа байсаар байна — эхлээд буцаалт бүртгэнэ үү"


def _outstanding_rows(db: Session, c: models.Contract, today: date,
                      gmap: dict, mmap: dict) -> list[dict]:
    """Гадаа үлдсэн бараа — материал/зэрэглэл бүрээр, ХОЁР ҮНЭТЭЙГЭЭ.

    Хаалтын wizard-ийн (a) алхам ЭНЭ мөрүүд дээр зогсоно. Мөр бүрд ГУРВАН
    гарц бий (§3 H7): ирсэн бол «Буцаалт бүртгэх», ирээгүй бол
    «Дутагдуулсан» (НБҮнээр), харилцагч ӨӨРТӨӨ АВЧ ҮЛДСЭН бол «Худалдаа
    болгох» (худалдах үнээр).

    `writeoff_amount` ба `sale_amount` нь тэр гурван шийдвэрийн ХОЁР өөр ₮ —
    хоёуланг нь ХАРАХГҮЙГЭЭР сонгох нь сохроор гарын үсэг зурахтай адил
    (R13 + R32: SKU бүр ХОЁР шатлалт үнэтэй).
    """
    agg: dict[tuple[int, int], float] = {}
    for lot in billing.lot_qty_on(c, today):
        if lot["qty_left"] <= 0.0001:
            continue
        key = (lot["material_id"], lot["grade_id"])
        agg[key] = agg.get(key, 0.0) + lot["qty_left"]
    rows = []
    for (mid, gid), qty in sorted(agg.items()):
        price = db.query(models.MaterialGradePrice).filter_by(
            material_id=mid, grade_id=gid).first()
        nb = price.nb_price if price else 0
        sale = price.sale_price if price else 0
        rows.append({"material_id": mid, "material": mmap.get(mid, "?"),
                     "grade_id": gid, "grade": gmap.get(gid, ""),
                     "qty": round(qty, 3), "nb_price": nb,
                     "writeoff_amount": round(qty * nb),
                     "sale_price": sale,
                     "sale_amount": round(qty * sale)})
    return rows


def _close_date_error(c: models.Contract, cd: date, today: date) -> str | None:
    """Хаах огнооны шалгуурууд — 400 ба wizard-ийн урьдчилсан анхааруулга НЭГ эх."""
    if cd > today:
        return "Хаах огноо ирээдүйд байж болохгүй"
    if cd < c.start_date:
        return f"Хаах огноо гэрээний эхлэлээс ({c.start_date}) өмнө байж болохгүй"
    last = billing.last_movement_day(c)
    if last is not None and cd < last:
        return (f"Хаах огноо сүүлийн хөдөлгөөнөөс ({last}) өмнө байж болохгүй — "
                f"тэр буцаалт хаалтын дараа болсон болж хувирна")
    return None


@router.get("/contracts/{cid}/close-preview")
def close_preview(cid: int, close_date: _date_t | None = None,
                  db: Session = Depends(get_db),
                  user=Depends(auth.require_roles("manager", "finance"))):
    """Хаалтын wizard-ийн ГУРВАН асуултын хариу — DB-д юу ч бичихгүй.

    (a) гадаа юу үлдэв, (b) эцсийн тасархай нэхэмжлэл хэд болох ба юу
    төлөгдөөгүй үлдэх, (c) барьцаа цэвэрлэгдсэн үү.

    ЭЦСИЙН ДҮНГИЙН МЕХАНИЗМ: `derivable_invoice_specs(..., close_date=)` —
    жинхэнэ хаалт ЯГ ТЭР функцээр нэхэмжлэлээ гаргадаг тул урьдчилсан тоо ба
    хаасны дараах цаас ХОЁР ӨӨР кодоос гарах боломжгүй. Гэрээнд хүрэхгүй:
    функц нь цэвэр (pure), `close_date` нь зөвхөн параметр.
    """
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    today = date.today()
    billing.ensure_invoices(db, c, today)
    db.refresh(c)
    gmap, mmap = _maps(db)
    cd = close_date or today
    err = _close_date_error(c, cd, today)
    out_rows = _outstanding_rows(db, c, today, gmap, mmap) if c.type == "rent" else []

    have = {billing.spec_key(c, i.cycle_start, i.cycle_end, i.no) for i in c.invoices}
    finals = []
    if c.type == "rent" and err is None:
        for sp in billing.derivable_invoice_specs(c, today, close_date=cd):
            if billing.spec_key(c, sp["cycle_start"], sp["cycle_end"], sp["no"]) in have:
                continue
            finals.append({"no": sp["no"], "cycle_start": str(sp["cycle_start"]),
                           "cycle_end": str(sp["cycle_end"]),
                           "label": billing.cycle_label(sp["cycle_start"], sp["cycle_end"]),
                           "rent_amount": round(sp["rent_amount"]),
                           "charge_amount": round(sp["charge_amount"]),
                           "vat_amount": round(sp["vat_amount"]),
                           "total": round(sp["total"])})

    b = billing.contract_balance(c, today)
    return {"close_date": str(cd), "close_error": err,
            "can_close": err is None and not out_rows,
            "last_movement": (str(billing.last_movement_day(c))
                              if billing.last_movement_day(c) else None),
            "outstanding": out_rows,
            "final_invoices": finals,
            # Нэхэмжлэгдсэн ба хуримтлагдсан — гэрээний мөрийн `balance`-тай НЭГ тоо
            "unpaid": round(b["outstanding"]),
            "balance": round(b["outstanding"] + b["accruing"]),
            "penalty_booked": round(b["penalty_booked"]),
            "penalty_unbooked": round(b["penalty_unbooked"]),
            "deposit": {"amount": c.deposit, "status": c.deposit_status,
                        "settled": c.deposit_status == "settled",
                        "applied": c.deposit_applied, "returned": c.deposit_returned}}


@router.post("/contracts/{cid}/close")
def close(cid: int, body: CloseIn | None = None, db: Session = Depends(get_db),
          user=Depends(auth.require_roles("manager"))):
    """Гэрээг ХААНА — хаасан огноогоор эцсийн тасархай нэхэмжлэл ТӨРНӨ (H7)."""
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    today = date.today()
    out_qty = [billing.qty_on(c, it.material_id, it.grade_id, today) for it in c.items]
    if c.type == "rent" and any(q > 0.001 for q in out_qty):
        raise HTTPException(400, CLOSE_GOODS_ERR)
    cd = (body.close_date if body and body.close_date else None) or today
    err = _close_date_error(c, cd, today)
    if err:
        raise HTTPException(400, err)
    c.status = "closed"
    c.closed_date = cd
    db.commit()
    # Эцсийн тасархай цикл ЭНД цаас болно — «нэхээд хаана» гэсэн дараалал
    created = billing.ensure_invoices(db, c, today)
    audit.log(db, user, "close", "contract", c.id,
              f"№{c.no} · {cd}-нд хаав"
              + (f" · эцсийн нэхэмжлэл {len(created)}" if created else ""))
    return {"ok": True, "closed_date": str(cd),
            "invoices": [serializers.invoice(i, today) for i in created]}


@router.post("/contracts/{cid}/generate-invoices")
def gen_invoices(cid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    created = billing.ensure_invoices(db, c)
    return {"created": len(created)}


@router.get("/invoices/{iid}/pdf")
def invoice_pdf(iid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Олдсонгүй")
    gmap, mmap = _maps(db)
    pdf = pdfgen.invoice_pdf(db, inv, gmap, mmap)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="invoice-{_safe(inv.no)}.pdf"'})


@router.get("/invoices/{iid}/appendix-pdf")
def invoice_appendix_pdf(iid: int, db: Session = Depends(get_db),
                         user=Depends(auth.current_user)):
    """Нэхэмжлэлийн ТҮРЭЭСИЙН ТООЦООНЫ ХАВСРАЛТ — зурвас бүрээр задалсан хуудас."""
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Олдсонгүй")
    # Худалдааны нэхэмжлэл (мөн шилжилтийн OB- нэхэмжлэл) нь хоосон цонхтой
    # (cycle_end == cycle_start) тул хоногоор задлах юм үгүй.
    if inv.contract.type != "rent" or inv.cycle_end <= inv.cycle_start:
        raise HTTPException(400, "Энэ нэхэмжлэлд түрээсийн хавсралт гаргах боломжгүй")
    gmap, mmap = _maps(db)
    pdf = pdfappendix.invoice_appendix_pdf(db, inv, gmap, mmap)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="havsralt-{_safe(inv.no)}.pdf"'})


@router.get("/contracts/{cid}/pdf")
def contract_pdf(cid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    """Гэрээний бүрэн хувилбар — хэвлэж гарын үсэг зурна."""
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    gmap, mmap = _maps(db)
    pdf = pdfgen.contract_pdf(db, c, gmap, mmap)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="geree-{_safe(c.no)}.pdf"'})


@router.get("/contracts/{cid}/act-pdf")
def act_pdf(cid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    billing.ensure_invoices(db, c)
    db.refresh(c)
    gmap, mmap = _maps(db)
    pdf = pdfgen.act_pdf(db, c, gmap, mmap)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="act-{_safe(c.no)}.pdf"'})


@router.get("/contracts/{cid}/cycle-appendix-pdf")
def cycle_appendix_pdf(cid: int, db: Session = Depends(get_db),
                       user=Depends(auth.current_user)):
    """ЯВАГДАЖ БУЙ циклийн хавсралт — нэхэмжлэл хараахан үүсээгүй байхад.

    Дээрх `act-pdf`-ээс ЯЛГААТАЙ нь `ensure_invoices`-ыг ЗОРИУДААР дуудахгүй:
    `current_cycle_accrual` нь огноо ба хөдөлгөөнөөс шууд бодогддог тул энэ зам
    үнэхээр УНШИХ хэвээр үлдэнэ.
    """
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    gmap, mmap = _maps(db)
    pdf = pdfappendix.cycle_appendix_pdf(db, c, gmap, mmap)
    if pdf is None:
        raise HTTPException(400, "Явагдаж буй цикл алга")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="havsralt-{_safe(c.no)}-idevhtei.pdf"'})

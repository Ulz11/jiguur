"""Гэрээ, хөдөлгөөн, нэхэмжлэл."""
import re
from datetime import date
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
    c = models.Contract(no=no, client_id=body.client_id, type=body.type,
                        start_date=body.start_date, end_date=body.end_date,
                        cycle_days=body.cycle_days, penalty_percent=body.penalty_percent,
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

    Бүлэглэх түлхүүр: (материал, зэрэглэл, ТАРИФ). Иймд нэг материал өөр өөр
    тарифаар гарсан бол ХОЁР мөр болж харагдана (Отгоогийн Numbers дэвтэр шиг).
    Талбарын нэрс хэвээр — UI өөрчлөлтгүй уншина.
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
        daily_rate = row["rate"] if not sale else (it.daily_rate if it else 0)
        unit_price = row["rate"] if sale else (it.unit_price if it else 0)
        live.append({"material_id": row["material_id"], "material": mmap.get(row["material_id"]),
                     "grade_id": row["grade_id"], "grade": gmap.get(row["grade_id"]),
                     "qty": row["qty"], "daily_rate": daily_rate, "unit_price": unit_price,
                     "day_amount": round(row["qty"] * daily_rate),
                     "repair_fee": mat.repair_fee if mat else 0,
                     "writeoff_price": price.nb_price if price else 0})
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
    return {**serializers.contract_row(c, today),
            "vat_percent": c.vat_percent, "cycle_days": c.cycle_days,
            "items": live,
            # Материалын мөр бүрийн доор задардаг хөдөлгөөний дэвтэр (зөвхөн унших)
            "material_lines": serializers.material_lines(c, gmap, mmap, today),
            "movements": [serializers.movement(m, gmap, mmap)
                          for m in sorted(c.movements, key=lambda m: (m.date, m.id), reverse=True)],
            "invoices": [serializers.invoice(i, today)
                         for i in sorted(c.invoices, key=lambda i: i.due_date, reverse=True)],
            "payments": [serializers.payment(p) for p in
                         db.query(models.Payment).filter_by(contract_id=c.id).order_by(models.Payment.date.desc()).all()]}


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
    confirm: bool = False


class MovementPatch(_BM):
    # `date` талбарын нэр нь `date` төрлийг далдалдаг тул alias-аар зарлана
    date: _date_t | None = None
    note: str | None = None
    confirm: bool = False


class MovementLinePatch(_BM):
    qty: float | None = None
    rate: float | None = None
    confirm: bool = False


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
    """Буцаалт/актын мөрийн засвар, актын дүнг каталогоос ДАХИН бодно —
    `add_movement`-тэй яг ижил томьёогоор."""
    price = db.query(models.MaterialGradePrice).filter_by(
        material_id=ln.material_id, grade_id=ln.grade_id).first()
    if mv.type == "RETURN":
        m = db.get(models.Material, ln.material_id)
        ln.repair_fee = ln.repair_qty * (m.repair_fee if m else 0)
        ln.writeoff_fee = ln.writeoff_qty * (price.nb_price if price else 0)
    elif mv.type == "WRITEOFF":
        ln.writeoff_fee = ln.qty * (price.nb_price if price else 0)


def _apply_movement_edit(db: Session, mv: models.Movement, new_date=None, note=None,
                         line: models.MovementLine | None = None,
                         qty: float | None = None, rate: float | None = None):
    """Хөдөлгөөнийг зас: нөөцөөс БУЦААЖ хас → утга сольж → дахин тусга."""
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


@router.patch("/contracts/{cid}")
def patch_contract(cid: int, body: ContractPatch, db: Session = Depends(get_db),
                   user=Depends(auth.require_roles("manager", "finance"))):
    """Inline засвар — гэрээний нөхцөлүүд.

    `start_date` / `cycle_days` нь БҮХ тооцоог хөдөлгөнө: нэхэмжлэлтэй гэрээнд
    эхлээд зөрүүг харуулж (rebuild_required), `confirm` ирсэн үед л дахин бодно.
    """
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    data = body.model_dump(exclude_unset=True)
    data.pop("clear_end_date", None)
    confirm = bool(data.pop("confirm", False))
    heavy = {k: data.pop(k) for k in ("start_date", "cycle_days")
             if data.get(k) is not None}
    if heavy and getattr(user, "role", "") != "manager":
        raise HTTPException(403, "Гэрээний эхлэх огноо, циклийг зөвхөн менежер өөрчилнө")
    if heavy.get("cycle_days") is not None and heavy["cycle_days"] < 1:
        raise HTTPException(400, "Циклийн хоног 1-ээс бага байж болохгүй")
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
                                  "гэрээний огноо/цикл")
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


@router.patch("/movement-lines/{lid}")
def patch_movement_line(lid: int, body: MovementLinePatch, db: Session = Depends(get_db),
                        user=Depends(auth.require_roles("manager"))):
    """Хөдөлгөөний мөрийн тоо / тарифыг засна (падан загварын гол засвар)."""
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
    new_qty = body.qty if body.qty is not None else ln.qty
    if mv.type == "RETURN" and ln.repair_qty + ln.writeoff_qty > new_qty + 0.001:
        raise HTTPException(400, "Засвар + акт нь буцаалтын тооноос их байна")
    if mv.status == "done" and body.qty is not None:
        if not _timeline_ok(c, {(ln.material_id, ln.grade_id)}, line_qty={ln.id: new_qty}):
            raise HTTPException(400, TIMELINE_ERR)
        if mv.type == "ISSUE" and new_qty > ln.qty:
            st = db.query(models.Stock).filter_by(material_id=ln.material_id,
                                                  grade_id=ln.grade_id).first()
            if not st or st.on_hand < new_qty - ln.qty:
                raise HTTPException(400, "Агуулахад хүрэлцэхгүй")
    before = {"qty": ln.qty, "rate": ln.rate}
    after = {"qty": new_qty, "rate": body.rate if body.rate is not None else ln.rate}
    gmap, mmap = _maps(db)
    days = [mv.date] if mv.status == "done" else []

    def mutate():
        _apply_movement_edit(db, mv, line=ln, qty=body.qty, rate=body.rate)

    rebuilt, preview = _gated(db, user, c, mutate, days, body.confirm,
                              f"хөдөлгөөн #{mv.id} мөр #{lid}")
    if preview:
        return preview
    audit.log(db, user, "update", "movement", mv.id,
              f"№{c.no} мөр #{lid}: " + (audit.changes_text(before, after) or "өөрчлөлтгүй"))
    db.refresh(mv)
    out = serializers.movement(mv, gmap, mmap)
    return {**out, "rebuilt": rebuilt} if rebuilt else out


@router.patch("/contracts/{cid}/items")
def patch_item(cid: int, body: ItemPatch, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager"))):
    """Inline засвар — тариф/нэгж үнэ. Одоогийн циклээс шинэ утгаар бодогдоно."""
    it = db.query(models.ContractItem).filter_by(
        contract_id=cid, material_id=body.material_id, grade_id=body.grade_id).first()
    if not it:
        raise HTTPException(404, "Гэрээний мөр олдсонгүй")
    if body.daily_rate is not None and body.daily_rate < 0:
        raise HTTPException(400, "Тариф сөрөг байж болохгүй")
    sale = it.contract.type == "sale"
    new_rate = body.unit_price if sale else body.daily_rate

    # 1) Тухайн тарифтай ПАДАНГУУД шинэчлэгдэнэ (тамгалагдаагүй мөрүүд ч мөн адил).
    if new_rate is not None:
        lines = (db.query(models.MovementLine).join(models.Movement)
                 .filter(models.Movement.contract_id == cid,
                         models.Movement.type == "ISSUE",
                         models.MovementLine.material_id == body.material_id,
                         models.MovementLine.grade_id == body.grade_id).all())
        for ln in lines:
            if (body.old_rate is None or ln.rate is None
                    or abs(ln.rate - body.old_rate) < 0.005):
                ln.rate = new_rate

    # 2) Гэрээний үндсэн тариф — зөвхөн ТҮҮНИЙ тарифыг заасан үед солигдоно.
    cur = it.unit_price if sale else it.daily_rate
    if body.old_rate is None or abs(cur - body.old_rate) < 0.005:
        if body.daily_rate is not None:
            it.daily_rate = body.daily_rate
        if body.unit_price is not None:
            it.unit_price = body.unit_price
    db.commit()
    m = db.get(models.Material, body.material_id)
    audit.log(db, user, "update", "contract_item", cid,
              f"{m.name if m else '?'}: тариф/үнэ → "
              f"{body.daily_rate if body.daily_rate is not None else body.unit_price:,.0f}₮")
    return {"ok": True, "daily_rate": it.daily_rate, "unit_price": it.unit_price}


@router.post("/contracts/{cid}/movements")
def add_movement(cid: int, body: schemas.MovementIn, db: Session = Depends(get_db),
                 user=Depends(auth.require_roles("manager", "factory"))):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    if body.type not in ("ISSUE", "RETURN", "WRITEOFF"):
        raise HTTPException(400, "Буруу төрөл")
    status = "pending" if body.type == "ISSUE" else "done"
    mv = models.Movement(contract_id=cid, type=body.type, date=body.date,
                         note=body.note, status=status)
    db.add(mv)
    db.flush()
    defaults = billing.default_rates(c)
    for ln in body.lines:
        rate = None
        if body.type == "ISSUE":
            # Падан: хүсэлтийн тариф, эс бөгөөс гэрээний мөрийн тариф тамгална
            rate = ln.rate if ln.rate is not None else defaults.get((ln.material_id, ln.grade_id))
            st = db.query(models.Stock).filter_by(material_id=ln.material_id, grade_id=ln.grade_id).first()
            if not st or st.on_hand < ln.qty:
                raise HTTPException(400, "Агуулахад хүрэлцэхгүй")
        repair_fee = writeoff_fee = 0.0
        if body.type == "RETURN":
            out = billing.qty_on(c, ln.material_id, ln.grade_id, body.date)
            if ln.qty > out + 0.001:
                raise HTTPException(400, f"Түрээсэнд байгаагаас их буцаалт (гадаа: {out:g})")
            m = db.get(models.Material, ln.material_id)
            repair_fee = ln.repair_qty * (m.repair_fee if m else 0)
            price = db.query(models.MaterialGradePrice).filter_by(
                material_id=ln.material_id, grade_id=ln.grade_id).first()
            writeoff_fee = ln.writeoff_qty * (price.nb_price if price else 0)
        if body.type == "WRITEOFF":
            price = db.query(models.MaterialGradePrice).filter_by(
                material_id=ln.material_id, grade_id=ln.grade_id).first()
            writeoff_fee = ln.qty * (price.nb_price if price else 0)
        db.add(models.MovementLine(movement_id=mv.id, material_id=ln.material_id,
                                   grade_id=ln.grade_id, qty=ln.qty, rate=rate,
                                   issue_line_id=ln.issue_line_id,
                                   return_grade_id=ln.return_grade_id,
                                   repair_qty=ln.repair_qty, repair_fee=repair_fee,
                                   writeoff_qty=ln.writeoff_qty, writeoff_fee=writeoff_fee))
    db.commit()
    db.refresh(mv)
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


@router.post("/contracts/{cid}/close")
def close(cid: int, db: Session = Depends(get_db), user=Depends(auth.require_roles("manager"))):
    c = db.get(models.Contract, cid)
    if not c:
        raise HTTPException(404, "Гэрээ олдсонгүй")
    today = date.today()
    out_qty = [billing.qty_on(c, it.material_id, it.grade_id, today) for it in c.items]
    if c.type == "rent" and any(q > 0.001 for q in out_qty):
        raise HTTPException(400, "Түрээсэнд бараа байсаар байна — эхлээд буцаалт бүртгэнэ үү")
    c.status = "closed"
    db.commit()
    return {"ok": True}


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

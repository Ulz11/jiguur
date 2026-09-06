"""Auth, каталог, зэрэглэл, агуулах, тохиргоо."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import ordering
from .. import clock
from ..db import get_db
from .. import models, schemas, serializers, auth
from ..services import audit as audit_svc
from ..services import stock as stock_svc

router = APIRouter(prefix="/api")
#: Агуулах бол ҮЙЛДВЭРИЙН ДАРГЫН талбай — залруулга нь түүний ба менежерийнх.
warehouse = auth.require_roles("manager", "factory")


# ---------- AUTH ----------
# `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout` нь `app/auth.py`-ийн
# router дээр (main.py-д ЭНЭ router-оос ӨМНӨ бүртгэгдэнэ). Урьд нь энд давхар
# `login`/`me` байсан — сүүдэрт орсон, хэзээ ч дуудагддаггүй код байв.
@router.post("/auth/change-password")
def change_password(body: schemas.ChangePasswordIn, db: Session = Depends(get_db),
                    user: models.User = Depends(auth.current_user)):
    if not auth.verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Одоогийн нууц үг буруу байна")
    if len(body.new_password.strip()) < 4:
        raise HTTPException(400, "Шинэ нууц үг дор хаяж 4 тэмдэгт байх ёстой")
    user.password_hash = auth.hash_password(body.new_password)
    db.commit()
    # ⚠ НУУЦ ҮГ БҮРТГЭЛД ОРОХГҮЙ — хуучин ч, шинэ ч, уртаараа ч үгүй.
    # Бүртгэгдэх ганц баримт: ХЭН, ХЭЗЭЭ өөрийнхөө нууц үгийг сольсон.
    audit_svc.log(db, user, "password", "user", user.id,
                  f"{user.name} өөрийн нууц үгээ сольсон")
    return {"ok": True}


# ---------- ЗЭРЭГЛЭЛ (динамик) ----------
@router.get("/grades")
def grades(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    return [serializers.grade(g) for g in db.query(models.Grade)
            .order_by(models.Grade.sort, models.Grade.id).all()]


@router.post("/grades")
def add_grade(body: schemas.GradeIn, db: Session = Depends(get_db),
              user=Depends(auth.require_roles("manager"))):
    if db.query(models.Grade).filter_by(code=body.code).first():
        raise HTTPException(400, "Ийм кодтой зэрэглэл байна")
    g = models.Grade(code=body.code, name=body.name, sort=body.sort)
    db.add(g)
    db.commit()
    audit_svc.log(db, user, "create", "grade", g.id,
                  f"шинэ зэрэглэл «{g.code}» — {g.name}")
    return serializers.grade(g)


@router.put("/grades/{gid}")
def edit_grade(gid: int, body: schemas.GradeIn, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager"))):
    g = db.get(models.Grade, gid)
    if not g:
        raise HTTPException(404, "Олдсонгүй")
    # Зэрэглэлийн КОД нь хөдөлгөөн, падан, нэхэмжлэл бүр дээр хэвлэгддэг тул
    # түүний өөрчлөлт нь «жижиг засвар» БИШ — юунаас юу болсныг мөр хэлнэ.
    before = {"code": g.code, "name": g.name, "sort": g.sort}
    g.code, g.name, g.sort = body.code, body.name, body.sort
    db.commit()
    after = {"code": g.code, "name": g.name, "sort": g.sort}
    audit_svc.log(db, user, "update", "grade", g.id,
                  f"зэрэглэл «{g.code}» — "
                  + (audit_svc.changes_text(before, after) or "өөрчлөлтгүй"))
    return serializers.grade(g)


# ---------- КАТАЛОГ ----------
@router.get("/materials")
def materials(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    stocks = db.query(models.Stock).all()
    return [serializers.material(m, stocks)
            for m in ordering.by_fields(
                db.query(models.Material).filter_by(active=1).all(), "category", "name")]


@router.get("/materials/{mid}")
def material_page(mid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    """Нэг материалын дэлгэрэнгүй — агуулахад хэд, гадаа хэн дээр хэд байна.

    ЭРХ: бүх ролид нээлттэй (`/api/stock`, `/api/contracts/{id}`-тэй ижил).
    Агуулах бол ҮЙЛДВЭРИЙН ДАРГЫН талбай — тэр өдөр бүр энэ хуудсыг унших хүн.
    Тариф нь мөрөн дээрээ үлдэнэ: гэрээний дэлгэрэнгүйн материалын хүснэгт ч
    даргад тарифаа харуулдаг (нуудаг нь нэхэмжлэл, төлбөр, барьцаа, авлага).
    """
    m = db.get(models.Material, mid)
    if not m:
        raise HTTPException(404, "Материал олдсонгүй")
    # Зөвхөн ЭНЭ материалыг хөдөлгөсөн гэрээнүүд — падангийн алхалт гэрээ бүрийн
    # бүх хөдөлгөөнийг уншдаг тул хамааралгүй гэрээг оруулах шалтгаангүй.
    cids = {r[0] for r in db.query(models.Movement.contract_id)
            .join(models.MovementLine, models.MovementLine.movement_id == models.Movement.id)
            .filter(models.MovementLine.material_id == mid).distinct().all()}
    contracts = (db.query(models.Contract).filter(models.Contract.id.in_(cids))
                 .order_by(models.Contract.start_date, models.Contract.id).all()
                 if cids else [])
    return serializers.material_detail(
        m, contracts,
        db.query(models.Stock).filter_by(material_id=mid).all(),
        db.query(models.Grade).order_by(models.Grade.sort, models.Grade.id).all(),
        clock.today(),
        # Тооллого/залруулга нь ХӨДӨЛГӨӨНТЭЙ нэг түүхэнд: «тоо яагаад
        # өөрчлөгдөв» гэсэн асуулт нэг жагсаалтаас хариултаа авна.
        adjustments=stock_svc.adjustments_of(db, mid))


@router.post("/materials")
def add_material(body: schemas.MaterialIn, db: Session = Depends(get_db),
                 user=Depends(auth.require_roles("manager"))):
    m = models.Material(name=body.name, category=body.category, code=body.code,
                        unit=body.unit, base_rate=body.base_rate, repair_fee=body.repair_fee)
    db.add(m)
    db.flush()
    for p in body.prices:
        db.add(models.MaterialGradePrice(material_id=m.id, grade_id=p.grade_id,
                                         nb_price=p.nb_price, sale_price=p.sale_price))
    db.commit()
    audit_svc.log(db, user, "create", "material", m.id,
                  f"шинэ материал «{m.name}» · {m.category} · "
                  f"суурь тариф {m.base_rate:,.0f}₮ · үнэтэй зэрэглэл {len(body.prices)}")
    return serializers.material(m)


@router.put("/materials/{mid}")
def edit_material(mid: int, body: schemas.MaterialIn, db: Session = Depends(get_db),
                  user=Depends(auth.require_roles("manager"))):
    m = db.get(models.Material, mid)
    if not m:
        raise HTTPException(404, "Олдсонгүй")
    fields = ("name", "category", "code", "unit", "base_rate", "repair_fee")
    before = {k: getattr(m, k) for k in fields}
    m.name, m.category, m.code = body.name, body.category, body.code
    m.unit, m.base_rate, m.repair_fee = body.unit, body.base_rate, body.repair_fee
    # ҮНЭ бол ГЭРЭЭНИЙ мөр биш ч актын (НБҮнэ) ба худалдааны суурь — өөрчлөлт
    # нь дараагийн акт бүр дээр мөнгө хөдөлгөнө, тиймээс мөр бүрээрээ бичигдэнэ.
    gcode = {g.id: g.code for g in db.query(models.Grade).all()}
    existing = {p.grade_id: p for p in m.prices}
    price_marks: list[str] = []
    for p in body.prices:
        g = gcode.get(p.grade_id, "?")
        old = existing.get(p.grade_id)
        if old is None:
            db.add(models.MaterialGradePrice(material_id=m.id, grade_id=p.grade_id,
                                             nb_price=p.nb_price, sale_price=p.sale_price))
            price_marks.append(f"{g}: шинэ үнэ (НБ {p.nb_price:,.0f}₮ · "
                               f"худалдах {p.sale_price:,.0f}₮)")
            continue
        if abs((old.nb_price or 0) - p.nb_price) > 0.005:
            price_marks.append(f"{g} НБҮнэ: {old.nb_price:,.0f}₮ → {p.nb_price:,.0f}₮")
        if abs((old.sale_price or 0) - p.sale_price) > 0.005:
            price_marks.append(f"{g} худалдах үнэ: {old.sale_price:,.0f}₮ → "
                               f"{p.sale_price:,.0f}₮")
        old.nb_price, old.sale_price = p.nb_price, p.sale_price
    db.commit()
    after = {k: getattr(m, k) for k in fields}
    changes = " · ".join(x for x in (audit_svc.changes_text(before, after),
                                     " · ".join(price_marks)) if x)
    audit_svc.log(db, user, "update", "material", m.id,
                  f"материал «{m.name}» — " + (changes or "өөрчлөлтгүй"))
    return serializers.material(m)


# ---------- АГУУЛАХ ----------
@router.get("/stock")
def stock(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    """Агуулахын хүснэгт ба ТҮҮНИЙ ДЭЭД ТАЛЫН тоонууд.

    ⚠ KPI нь ХҮСНЭГТИЙН МӨРҮҮДЭЭС нийлнэ. Урьд нь дүн нь БҮХ нөөцийн мөрөөс
    (идэвхгүй болсон материал ч оролцоод) бодогддог байсан бол хүснэгт нь
    зөвхөн идэвхтэйг жагсаадаг: «нийт 12,400ш» гэсэн тоо доорх мөрүүдээ
    хэдэн ч удаа нэмээд гардаггүй. Ашиглалт нь `services/stock.py`-ийн
    ГАНЦ томьёогоор — дашбоард, аналитиктай нэг тоо (H9).
    """
    stocks = db.query(models.Stock).all()
    mats = ordering.by_fields(db.query(models.Material).filter_by(active=1).all(),
                              "category", "name")
    rows = [serializers.material(m, stocks) for m in mats]
    return {"rows": rows, "totals": stock_svc.totals(db, active_only=True)}


@router.post("/stock/adjust")
def stock_adjust(body: schemas.StockAdjustIn, db: Session = Depends(get_db),
                 user=Depends(warehouse)):
    """Ганц мөрийн залруулга — үлдэгдлийг тогтоож, БИЧИЛТ үлдээнэ.

    Хуучин зан төлөв (`on_hand`-ыг дарж бичих) нь `services/stock.py`-ийн
    хаалгаар явна: өмнөх тоо, зөрүү, шалтгаан, хэн — бүгд мөрөндөө үлдэнэ.
    Зөрүүгүй бол ЮУ Ч бичигдэхгүй (`adjustment: null`) — хоосон мөр нь
    түүхийг шингэлж, жагсаалтыг уншигдахгүй болгодог.
    """
    try:
        adj = stock_svc.adjust(db, body.material_id, body.grade_id, body.on_hand,
                               user=user, note=body.note, source="adjust",
                               day=body.date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    st = stock_svc.row(db, body.material_id, body.grade_id)
    return {"ok": True, "on_hand": st.on_hand,
            "adjustment": stock_svc.serialize(adj) if adj else None}


@router.get("/stock/adjustments")
def stock_adjustments(material_id: int | None = None, limit: int = 200,
                      db: Session = Depends(get_db), user=Depends(auth.current_user)):
    """Залруулгын түүх — материалын дэлгэрэнгүй хуудасны «Тооллого» багана."""
    rows = stock_svc.adjustments_of(db, material_id, min(max(limit, 1), 500))
    mats = {m.id: m.name for m in db.query(models.Material).all()}
    grades = {g.id: g.code for g in db.query(models.Grade).all()}
    return [stock_svc.serialize(a, mats.get(a.material_id, ""),
                                grades.get(a.grade_id, "")) for a in rows]


class AdjustVoidIn(BaseModel):
    reason: str = ""


@router.post("/stock/adjustments/{aid}/void")
def void_stock_adjustment(aid: int, body: AdjustVoidIn, db: Session = Depends(get_db),
                          user=Depends(warehouse)):
    """Андуурч хийсэн залруулгыг буцаана — мөр нь шалтгаантайгаа ҮЛДЭНЭ (H1)."""
    adj = db.get(models.StockAdjustment, aid)
    if not adj:
        raise HTTPException(404, "Залруулга олдсонгүй")
    try:
        stock_svc.void_adjustment(db, adj, body.reason, user)
    except ValueError as e:
        # «аль хэдийн хүчингүй» нь 409 (төлөвийн зөрчил), бусад нь 400
        code = 409 if str(e) == stock_svc.ALREADY_VOID else 400
        raise HTTPException(code, str(e)) from e
    st = stock_svc.row(db, adj.material_id, adj.grade_id)
    return {"ok": True, "on_hand": st.on_hand, "adjustment": stock_svc.serialize(adj)}


@router.post("/stock/repair-done")
def repair_done(body: schemas.RepairDoneIn, db: Session = Depends(get_db),
                user=Depends(warehouse)):
    """Засвар дууссан — засвараас агуулах руу."""
    st = db.query(models.Stock).filter_by(material_id=body.material_id, grade_id=body.grade_id).first()
    if not st or st.in_repair < body.qty:
        raise HTTPException(400, "Засварт байгаа тооноос их байна")
    st.in_repair -= body.qty
    st.on_hand += body.qty
    db.commit()
    m = db.get(models.Material, body.material_id)
    g = db.get(models.Grade, body.grade_id)
    audit_svc.log(db, user, "repair_done", "stock", body.material_id,
                  f"{stock_svc.label(m, g) if m and g else '?'}: "
                  f"засвараас {body.qty:g}ш агуулахад орлоо · "
                  f"засварт {st.in_repair:g}ш үлдэв · агуулахад {st.on_hand:g}ш")
    return {"ok": True}


# ---------- ТОХИРГОО ----------
@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    return {s.key: s.value for s in db.query(models.Setting).all()}


@router.put("/settings")
def put_settings(body: schemas.SettingsIn, db: Session = Depends(get_db),
                 user=Depends(auth.require_roles("manager"))):
    before: dict[str, str] = {}
    after: dict[str, str] = {}
    for k, v in body.values.items():
        s = db.get(models.Setting, k)
        before[k] = s.value if s else None
        after[k] = v
        if s:
            s.value = v
        else:
            db.add(models.Setting(key=k, value=v))
    db.commit()
    # Тохиргоо нь ЧИМЭЭГҮЙ мөнгө хөдөлгөдөг (алдангийн суурь хувь, НДШ) —
    # «хэн, хэзээ, юуг юу болгосон» гэдэг нь заавал үлдэнэ.
    audit_svc.log(db, user, "update", "settings", None,
                  audit_svc.changes_text(before, after) or "өөрчлөлтгүй")
    return {"ok": True}

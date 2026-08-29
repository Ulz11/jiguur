"""Auth, каталог, зэрэглэл, агуулах, тохиргоо."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, schemas, serializers, auth

router = APIRouter(prefix="/api")


# ---------- AUTH ----------
@router.post("/auth/login")
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(username=body.username.strip().lower()).first()
    if not user or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Нэвтрэх нэр эсвэл нууц үг буруу байна")
    return {"token": auth.create_token(user),
            "user": {"id": user.id, "name": user.name, "role": user.role, "username": user.username}}


@router.get("/auth/me")
def me(user: models.User = Depends(auth.current_user)):
    return {"id": user.id, "name": user.name, "role": user.role, "username": user.username}


@router.post("/auth/change-password")
def change_password(body: schemas.ChangePasswordIn, db: Session = Depends(get_db),
                    user: models.User = Depends(auth.current_user)):
    if not auth.verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Одоогийн нууц үг буруу байна")
    if len(body.new_password.strip()) < 4:
        raise HTTPException(400, "Шинэ нууц үг дор хаяж 4 тэмдэгт байх ёстой")
    user.password_hash = auth.hash_password(body.new_password)
    db.commit()
    return {"ok": True}


# ---------- ЗЭРЭГЛЭЛ (динамик) ----------
@router.get("/grades")
def grades(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    return [serializers.grade(g) for g in db.query(models.Grade).order_by(models.Grade.sort).all()]


@router.post("/grades")
def add_grade(body: schemas.GradeIn, db: Session = Depends(get_db),
              user=Depends(auth.require_roles("manager"))):
    if db.query(models.Grade).filter_by(code=body.code).first():
        raise HTTPException(400, "Ийм кодтой зэрэглэл байна")
    g = models.Grade(code=body.code, name=body.name, sort=body.sort)
    db.add(g)
    db.commit()
    return serializers.grade(g)


@router.put("/grades/{gid}")
def edit_grade(gid: int, body: schemas.GradeIn, db: Session = Depends(get_db),
               user=Depends(auth.require_roles("manager"))):
    g = db.get(models.Grade, gid)
    if not g:
        raise HTTPException(404, "Олдсонгүй")
    g.code, g.name, g.sort = body.code, body.name, body.sort
    db.commit()
    return serializers.grade(g)


# ---------- КАТАЛОГ ----------
@router.get("/materials")
def materials(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    stocks = db.query(models.Stock).all()
    return [serializers.material(m, stocks)
            for m in db.query(models.Material).filter_by(active=1).order_by(models.Material.category, models.Material.name).all()]


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
                 .order_by(models.Contract.start_date).all() if cids else [])
    return serializers.material_detail(
        m, contracts,
        db.query(models.Stock).filter_by(material_id=mid).all(),
        db.query(models.Grade).order_by(models.Grade.sort).all(),
        date.today())


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
    return serializers.material(m)


@router.put("/materials/{mid}")
def edit_material(mid: int, body: schemas.MaterialIn, db: Session = Depends(get_db),
                  user=Depends(auth.require_roles("manager"))):
    m = db.get(models.Material, mid)
    if not m:
        raise HTTPException(404, "Олдсонгүй")
    m.name, m.category, m.code = body.name, body.category, body.code
    m.unit, m.base_rate, m.repair_fee = body.unit, body.base_rate, body.repair_fee
    existing = {p.grade_id: p for p in m.prices}
    for p in body.prices:
        if p.grade_id in existing:
            existing[p.grade_id].nb_price = p.nb_price
            existing[p.grade_id].sale_price = p.sale_price
        else:
            db.add(models.MaterialGradePrice(material_id=m.id, grade_id=p.grade_id,
                                             nb_price=p.nb_price, sale_price=p.sale_price))
    db.commit()
    return serializers.material(m)


# ---------- АГУУЛАХ ----------
@router.get("/stock")
def stock(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    stocks = db.query(models.Stock).all()
    mats = db.query(models.Material).filter_by(active=1).order_by(models.Material.category, models.Material.name).all()
    rows = [serializers.material(m, stocks) for m in mats]
    tot_hand = sum(s.on_hand for s in stocks)
    tot_rent = sum(s.on_rent for s in stocks)
    tot_repair = sum(s.in_repair for s in stocks)
    util = tot_rent / (tot_hand + tot_rent) * 100 if (tot_hand + tot_rent) else 0
    return {"rows": rows, "totals": {"on_hand": tot_hand, "on_rent": tot_rent,
                                     "in_repair": tot_repair, "utilization": round(util, 1)}}


@router.post("/stock/adjust")
def stock_adjust(body: schemas.StockAdjustIn, db: Session = Depends(get_db),
                 user=Depends(auth.require_roles("manager", "factory"))):
    """Тооллогын залруулга — агуулахын үлдэгдлийг шууд тогтооно."""
    st = db.query(models.Stock).filter_by(material_id=body.material_id, grade_id=body.grade_id).first()
    if not st:
        st = models.Stock(material_id=body.material_id, grade_id=body.grade_id)
        db.add(st)
    st.on_hand = body.on_hand
    db.commit()
    return {"ok": True}


@router.post("/stock/repair-done")
def repair_done(body: schemas.RepairDoneIn, db: Session = Depends(get_db),
                user=Depends(auth.require_roles("manager", "factory"))):
    """Засвар дууссан — засвараас агуулах руу."""
    st = db.query(models.Stock).filter_by(material_id=body.material_id, grade_id=body.grade_id).first()
    if not st or st.in_repair < body.qty:
        raise HTTPException(400, "Засварт байгаа тооноос их байна")
    st.in_repair -= body.qty
    st.on_hand += body.qty
    db.commit()
    return {"ok": True}


# ---------- ТОХИРГОО ----------
@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(auth.current_user)):
    return {s.key: s.value for s in db.query(models.Setting).all()}


@router.put("/settings")
def put_settings(body: schemas.SettingsIn, db: Session = Depends(get_db),
                 user=Depends(auth.require_roles("manager"))):
    for k, v in body.values.items():
        s = db.get(models.Setting, k)
        if s:
            s.value = v
        else:
            db.add(models.Setting(key=k, value=v))
    db.commit()
    return {"ok": True}

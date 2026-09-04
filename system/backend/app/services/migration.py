"""Бодит дата шилжүүлэлт (Numbers → систем).

- Хуучин авлага = "Үлдэгдэл шилжүүлэлт" (OB) гэрээн дээрх нэг нэхэмжлэл.
  due = шилжүүлсэн огноо тул өнгөрсний алданги дахин бодогдохгүй, одооноос хойш бодогдоно.
- Сөрөг үлдэгдэл = хуваарилагдаагүй кредит төлбөр.
- load_data() idempotent — нэр давхардвал алгасна.
"""
import json
from datetime import date
from sqlalchemy.orm import Session
from .. import models
from . import deposit as deposit_svc


def account_contract(db: Session, client: models.Client, as_of: date | None = None,
                     note: str = "") -> models.Contract:
    """ХАРИЛЦАГЧИЙН ДАНС — `OB-{id}` синтетик гэрээ. Байхгүй бол үүсгэнэ.

    Энэ гэрээ нь ЗӨВХӨН эхний үлдэгдлийнх БИШ: түрээсийн МӨЧЛӨГТ ХАМААРАХГҮЙ
    бүх бичилт (хуучин үлдэгдэл, олгосон зээл, ажилчдын цалин, кран, харилцагч
    хоорондын шилжүүлэг — P1-16/H11) энд суудаг. Түүнийг ингэж сонгосон нь
    санаатай: `rebuild_contract_invoices` нь OB гэрээнд ХЭЗЭЭ Ч хүрдэггүй,
    `derivable_invoice_specs` нь түүнд юу ч гаргадаггүй тул ГАРААР үүсгэсэн
    нэхэмжлэл эндээс хэзээ ч арчигдахгүй. Алданги 0 — шилжүүлсэн үлдэгдэлд
    автомат хөшүүрэг зэвсэглэхгүй (H2).
    """
    no = f"OB-{client.id}"
    c = db.query(models.Contract).filter_by(no=no).first()
    if c is not None:
        return c
    c = models.Contract(no=no, client_id=client.id, type="rent",
                        start_date=as_of or date.today(), cycle_days=30,
                        penalty_percent=0, status="active",
                        note=note or "Харилцагчийн данс — түрээсийн мөчлөгт хамаарахгүй бичилтүүд")
    db.add(c)
    db.flush()
    return c


def create_opening_balance(db: Session, client: models.Client, amount: float,
                           as_of: date, deposit: float = 0):
    if abs(amount) < 0.5 and deposit <= 0:
        return None
    credit = None
    if amount < 0:
        # Сөрөг үлдэгдэл = «илүү» (R18) → хуваарилагдаагүй кредит төлбөр.
        credit = models.Payment(client_id=client.id, date=as_of, amount=abs(amount),
                                method="BANK",
                                note="Эхний үлдэгдэл — илүү төлөлт (кредит)")
        db.add(credit)
        if deposit <= 0:
            db.commit()
            return None
        # Барьцаа нь балансын ГАДНА (R21) — үлдэгдэл сөрөг байсан ч
        # байршуулсан барьцаа хэвээрээ. Гэрээг зөвхөн барьцааг АВЧ ЯВАХ
        # зорилгоор нээнэ; нэхэмжлэл үүсэхгүй.
    # penalty 0: шилжүүлсэн хуучин үлдэгдэлд автомат алданги тооцохгүй
    # (шаардлагатай бол гэрээ дээр нь гараар асаана)
    c = account_contract(
        db, client, as_of,
        note="Үлдэгдэл шилжүүлэлт — хуучин системээс"
             + (" (илүү төлөлттэй, барьцаа хадгалав)" if credit is not None else ""))
    if deposit:
        # Барьцаа нь дэвтрийн ЭХНИЙ мөр болж орно (H8) — «байршуулаагүй»
        # (явдалгүй) ба «0 байршуулсан» хоёр цаашид ялгагдана.
        deposit_svc.set_lodged(db, c, deposit, "Шилжүүлэлт")
    inv = None
    if amount > 0:
        inv = models.Invoice(contract_id=c.id, no=f"OB-{client.id}",
                             cycle_start=as_of, cycle_end=as_of, due_date=as_of,
                             rent_amount=amount, charge_amount=0, vat_amount=0,
                             total=amount,
                             detail_json=json.dumps({"note": "Хуучин системийн үлдэгдэл"}))
        db.add(inv)
    db.commit()
    return inv


def create_active_contract(db: Session, client: models.Client, no: str, as_of: date,
                           items: list[dict], note: str = "", vat_percent: float = 0,
                           warnings: list | None = None):
    """Явж байгаа түрээсийн гэрээг шилжүүлнэ.

    Бараа нь аль хэдийн түрээсэнд гарчихсан тул агуулахын үлдэгдлээс ХАСАХГҮЙ —
    on_rent-д шууд нэмнэ. Тооцоо (30 хоногийн цикл) шилжсэн өдрөөс эхэлж явна;
    өмнөх бүх тооцоо OB үлдэгдэлд аль хэдийн орсон.
    """
    if db.query(models.Contract).filter_by(no=no).first():
        return None
    # penalty 0: тэр амьдралдаа алданги нэхээгүй — шилжүүлэлт хөшүүргийг
    # ЗЭВСЭГЛЭХГҮЙ (P0-10 «алданги=0», H2). Гэрээ дээр нь гараар асаана.
    c = models.Contract(no=no, client_id=client.id, type="rent", start_date=as_of,
                        cycle_days=30, penalty_percent=0, status="active",
                        vat_percent=vat_percent,
                        note=note or "Идэвхтэй гэрээ — хуучин системээс шилжүүлэв")
    db.add(c)
    db.flush()
    mv = models.Movement(contract_id=c.id, type="ISSUE", date=as_of, status="done",
                         note="Шилжүүлэлт — түрээсэнд байгаа үлдэгдэл")
    db.add(mv)
    db.flush()
    for it in items:
        m = db.query(models.Material).filter_by(name=it["material"]).first()
        if not m:
            if warnings is not None:
                warnings.append(f"№{no}: материал каталогт алга — {it['material']} "
                                f"({it['qty']:g}ш алгасав)")
            continue
        g = _grade(db, it.get("grade", "А"))
        db.add(models.ContractItem(contract_id=c.id, material_id=m.id, grade_id=g.id,
                                   daily_rate=float(it["daily_rate"])))
        # Падан: шилжүүлсэн үлдэгдэл ч гэсэн өөрийн тарифтайгаа орж ирнэ
        db.add(models.MovementLine(movement_id=mv.id, material_id=m.id, grade_id=g.id,
                                   qty=float(it["qty"]), rate=float(it["daily_rate"])))
        st = db.query(models.Stock).filter_by(material_id=m.id, grade_id=g.id).first()
        if not st:
            st = models.Stock(material_id=m.id, grade_id=g.id)
            db.add(st)
        st.on_rent = (st.on_rent or 0) + float(it["qty"])  # агуулахаас хасахгүй — аль хэдийн гадаа
    db.commit()
    return c


def _grade(db: Session, code: str) -> models.Grade:
    g = db.query(models.Grade).filter_by(code=code).first()
    if not g:
        g = models.Grade(code=code, name=code, sort=90)
        db.add(g)
        db.flush()
    return g


def load_data(db: Session, data: dict) -> dict:
    """real_data.json-г DB руу. Буцна: тоолол + warnings."""
    as_of = date.fromisoformat(data.get("as_of") or str(date.today()))
    counts = {"clients": 0, "stock": 0, "loans": 0, "barter": 0, "contracts": 0, "skipped": 0}
    warnings: list[str] = []

    # ---- Харилцагч + эхний үлдэгдэл ----
    existing = {c.name.strip().lower() for c in db.query(models.Client).all()}
    for row in data.get("clients", []):
        name = row["name"].strip()
        if not name or name.lower() in existing:
            counts["skipped"] += 1
            continue
        cl = models.Client(name=name, reg=str(row.get("reg", "")),
                           person=row.get("person", ""), phone=row.get("phone", ""),
                           note=row.get("note", ""))
        db.add(cl)
        db.flush()
        existing.add(name.lower())
        create_opening_balance(db, cl, float(row.get("balance", 0)), as_of,
                               deposit=float(row.get("deposit", 0)))
        counts["clients"] += 1

    # ---- Нөөц (тооллогоор — үнэмлэхүй утга) ----
    for row in data.get("stock", []):
        m = db.query(models.Material).filter_by(name=row["material"]).first()
        if not m:
            warnings.append(f"Материал олдсонгүй: {row['material']}")
            continue
        g = _grade(db, row["grade"])
        st = db.query(models.Stock).filter_by(material_id=m.id, grade_id=g.id).first()
        if not st:
            st = models.Stock(material_id=m.id, grade_id=g.id)
            db.add(st)
        st.on_hand = float(row["on_hand"])
        counts["stock"] += 1

    # ---- Зээл ----
    loan_names = {l.name for l in db.query(models.Loan).all()}
    for row in data.get("loans", []):
        if row["name"] in loan_names:
            counts["skipped"] += 1
            continue
        db.add(models.Loan(name=row["name"], kind=row.get("kind", "bank"),
                           principal=float(row["principal"]),
                           monthly_rate=float(row.get("monthly_rate", 0)),
                           start_date=date.fromisoformat(row.get("start_date") or str(as_of)),
                           note=row.get("note", "")))
        loan_names.add(row["name"])
        counts["loans"] += 1

    # ---- Бартер хөрөнгө ----
    existing_assets = {(a.name, str(a.date_in)) for a in db.query(models.BarterAsset).all()}
    for row in data.get("barter", []):
        d_in = row.get("date_in") or str(as_of)
        if (row["name"], d_in) in existing_assets:
            counts["skipped"] += 1
            continue
        sold_amount = float(row.get("sold_amount") or 0)
        db.add(models.BarterAsset(
            type=row.get("type", "Бусад"), name=row["name"], detail=row.get("detail", ""),
            date_in=date.fromisoformat(d_in), value_in=float(row.get("value_in", 0)),
            asking_price=float(row.get("asking_price") or 0),
            status="sold" if sold_amount > 0 else "held",
            sold_date=as_of if sold_amount > 0 else None,
            sold_amount=sold_amount, note=row.get("note", "")))
        existing_assets.add((row["name"], d_in))
        counts["barter"] += 1

    db.commit()

    # ---- Идэвхтэй гэрээнүүд (клиент sheet-үүдээс задалсан) ----
    for row in data.get("contracts", []):
        cl = db.query(models.Client).filter(models.Client.name == row["client"]).first()
        if not cl:
            warnings.append(f"Гэрээний харилцагч олдсонгүй: {row['client']}")
            continue
        c = create_active_contract(db, cl, row["no"], as_of, row["items"],
                                   note=row.get("note", ""),
                                   vat_percent=float(row.get("vat_percent", 0)),
                                   warnings=warnings)
        if c is None:
            counts["skipped"] += 1
        else:
            counts["contracts"] += 1

    counts["warnings"] = warnings
    return counts

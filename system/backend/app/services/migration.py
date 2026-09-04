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
                           warnings: list | None = None, *,
                           start_date: date | None = None, cycle_mode: str = "days",
                           sites: list[dict] | None = None):
    """Явж байгаа түрээсийн гэрээг шилжүүлнэ.

    Бараа нь аль хэдийн түрээсэнд гарчихсан тул агуулахын үлдэгдлээс ХАСАХГҮЙ —
    on_rent-д шууд нэмнэ. Тооцоо шилжсэн өдрөөс эхэлж явна; өмнөх бүх тооцоо
    OB үлдэгдэлд аль хэдийн орсон.

    `start_date` нь ГЭРЭЭНИЙ ЖИНХЭНЭ ОГНОО (Марч 2022.3.1) — `as_of` БИШ.
    Хөдөлгүүр үүнийг тэвчинэ: олголт нь `as_of`-т буудаг тул түүнээс өмнөх
    циклүүд БҮГД тэг хуримтлалтай бөгөөд `derivable_invoice_specs` тэдгээрийг
    алгасдаг (`rent == 0 and charge == 0 → continue`). Циклийн дугаар нь
    огнооноос гардаг тул том боловч ТОГТВОРТОЙ.

    `sites` нь НЭГ олголтыг ТАЛБАЙ тус бүрийн падан болгож хуваана (№88, 97):
    Блүүмийн 4,294ш нь `технологи · архангай · дарь эх` гурав болно, авлага
    нь НЭГ хэвээр. Талбайн нийлбэр нь `items`-ийн нийлбэртэй ТЭНЦЭНЭ.
    """
    if db.query(models.Contract).filter_by(no=no).first():
        return None
    # penalty 0: тэр амьдралдаа алданги нэхээгүй — шилжүүлэлт хөшүүргийг
    # ЗЭВСЭГЛЭХГҮЙ (P0-10 «алданги=0», H2). Гэрээ дээр нь гараар асаана.
    c = models.Contract(no=no, client_id=client.id, type="rent",
                        start_date=start_date or as_of,
                        cycle_days=30, cycle_mode=cycle_mode or "days",
                        penalty_percent=0, status="active",
                        vat_percent=vat_percent,
                        note=note or "Идэвхтэй гэрээ — хуучин системээс шилжүүлэв")
    db.add(c)
    db.flush()
    groups = [{"site": s.get("site", ""), "items": s["items"]} for s in (sites or [])
              if s.get("items")] or [{"site": "", "items": items}]
    rates: dict[tuple, float] = {}
    for g in groups:
        mv = models.Movement(contract_id=c.id, type="ISSUE", date=as_of, status="done",
                             site=g["site"],
                             note="Шилжүүлэлт — түрээсэнд байгаа үлдэгдэл"
                                  + (f" ({g['site']})" if g["site"] else ""))
        db.add(mv)
        db.flush()
        for it in g["items"]:
            m = db.query(models.Material).filter_by(name=it["material"]).first()
            if not m:
                if warnings is not None:
                    warnings.append(f"№{no}: материал каталогт алга — {it['material']} "
                                    f"({it['qty']:g}ш алгасав)")
                continue
            gr = _grade(db, it.get("grade", "А"))
            rate = float(it["daily_rate"])
            if (m.id, gr.id) not in rates:      # гэрээний мөр SKU тус бүрд НЭГ
                rates[(m.id, gr.id)] = rate
                db.add(models.ContractItem(contract_id=c.id, material_id=m.id,
                                           grade_id=gr.id, daily_rate=rate))
            # Падан: шилжүүлсэн үлдэгдэл ч гэсэн өөрийн тарифтайгаа орж ирнэ
            db.add(models.MovementLine(movement_id=mv.id, material_id=m.id,
                                       grade_id=gr.id, qty=float(it["qty"]), rate=rate))
            st = db.query(models.Stock).filter_by(material_id=m.id, grade_id=gr.id).first()
            if not st:
                st = models.Stock(material_id=m.id, grade_id=gr.id)
                db.add(st)
            # агуулахаас хасахгүй — аль хэдийн гадаа
            st.on_rent = (st.on_rent or 0) + float(it["qty"])
    db.commit()
    return c


def _grade(db: Session, code: str) -> models.Grade:
    g = db.query(models.Grade).filter_by(code=code).first()
    if not g:
        g = models.Grade(code=code, name=code, sort=90)
        db.add(g)
        db.flush()
    return g


def _note(db: Session, entity: str, entity_id: int, row: dict, as_of: date):
    """Захын тэмдэглэл (P1-22). ШАР нүд → `flag=True` — «энэ рүү эргэж хар»."""
    text = (row.get("text") or "").strip()
    if not text:
        return None
    try:
        day = date.fromisoformat(row.get("date") or str(as_of))
    except ValueError:
        day = as_of
    n = models.Note(entity_type=entity, entity_id=entity_id, date=day, text=text,
                    flag=bool(row.get("flag")), author="Шилжүүлэлт",
                    void_reason="", voided_by="")
    db.add(n)
    return n


def load_data(db: Session, data: dict) -> dict:
    """real_data.json-г DB руу. Буцна: тоолол + warnings."""
    from . import entries as entries_svc      # тойрог импортоос зайлсхийв
    as_of = date.fromisoformat(data.get("as_of") or str(date.today()))
    counts = {"clients": 0, "stock": 0, "loans": 0, "barter": 0, "contracts": 0,
              "skipped": 0, "materials": 0, "contacts": 0, "entries": 0, "notes": 0,
              "deposit_events": 0, "agreed": 0, "sites": 0}
    warnings: list[str] = []

    # ---- Каталогийн НҮХ: дэвтэрт бий, каталогт алга байсан материалууд ----
    # ЧИМЭЭГҮЙ ХАЯХГҮЙ (E3): Өнө Ордын «Труба 1м» 278ш яг эндээс унадаг байв.
    for row in data.get("catalog", []):
        if db.query(models.Material).filter_by(name=row["name"]).first():
            counts["skipped"] += 1
            continue
        m = models.Material(name=row["name"], category=row.get("category", "Бусад"),
                            base_rate=float(row.get("base_rate", 0) or 0),
                            repair_fee=float(row.get("repair_fee", 0) or 0))
        db.add(m)
        db.flush()
        counts["materials"] += 1
        if not row.get("base_rate"):
            warnings.append(f"Каталогт нээв: «{row['name']}» — ТАРИФ 0 "
                            f"({row.get('note', '')}) — ТЭР тогтооно")
            _note(db, "material", m.id,
                  {"text": f"Каталогт шилжүүлэлтээр нээв — тариф тогтоогоогүй "
                           f"({row.get('note', '')})", "flag": True}, as_of)
            counts["notes"] += 1
    db.commit()

    # ---- Барьцаа АЛЬ гэрээн дээр амьдрах вэ (H9 «нэг факт, нэг тоо») ----
    # Түүний хуудсан дээрх барьцааны ГИНЖ нь ТҮРЭЭСИЙН гэрээнийх. Тэр гэрээ
    # дэвтрээ авч явбал ДАНСНЫ (`OB-`) гэрээнд дахин байршуулах нь барьцааг
    # ХОЁР ДАХИН харуулна (Зулаа 27,735,000 → 55,470,000).
    dep_on_contract = {c["client"] for c in data.get("contracts", [])
                       if c.get("deposit_events")}

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
        # ТҮРЭЭС БИШ бичилт (H11) нь самбарын мөрөөс ГАРААД өөрийн баримт болно
        # — эс тэгвэл нэг мөнгө хоёр удаа: OB-д нэг, бичилтэд нэг.
        extra = sum(float(e.get("amount", 0)) for e in row.get("entries", []))
        balance = float(row.get("balance", 0)) - extra
        deposit = 0.0 if name in dep_on_contract else float(row.get("deposit", 0))
        if name in dep_on_contract and row.get("deposit"):
            warnings.append(f"«{name}»: барьцаа {float(row['deposit']):,.0f}₮ нь "
                            f"ТҮРЭЭСИЙН гэрээний дэвтэрт бичигдэв (дансны гэрээнд "
                            f"давхардуулаагүй)")
        ob = create_opening_balance(db, cl, balance, as_of, deposit=deposit)
        counts["clients"] += 1

        # ГАРЫН ҮСЭГТНҮҮД (№72, 73) — тэр ЗАХИРАЛ руу залгадаггүй, НЯРАВ руу
        for p in row.get("contacts", []):
            if not (p.get("name") or "").strip():
                continue
            db.add(models.ClientContact(client_id=cl.id, name=p["name"].strip(),
                                        role=p.get("role", ""), phone=p.get("phone", ""),
                                        phone2=p.get("phone2", ""),
                                        note=p.get("ref", ""), active=True))
            counts["contacts"] += 1
        if not cl.person and row.get("contacts"):
            cl.person = row["contacts"][0]["name"]
            cl.phone = cl.phone or row["contacts"][0].get("phone", "")

        # ТҮРЭЭС БИШ БИЧИЛТ (H11) — самбарын Үлдэгдэлд ОРООГҮЙ мөнгө л энд орно
        for e in row.get("entries", []):
            try:
                day = date.fromisoformat(e.get("date") or str(as_of))
            except ValueError:
                day = as_of
            try:
                entries_svc.create_entry(db, cl, day, float(e["amount"]),
                                         e.get("kind", "adjustment"), e["label"],
                                         note="Шилжүүлэлт — хуучин системээс",
                                         ref=e.get("ref", ""), user_name="Шилжүүлэлт")
                counts["entries"] += 1
            except ValueError as ex:
                warnings.append(f"«{name}» бичилт нэмэгдсэнгүй: {ex}")

        for n in row.get("notes", []):
            if _note(db, "client", cl.id, n, as_of) is not None:
                counts["notes"] += 1

        # «ТООЦОО НИЙЛСЭН» огноо → эхний үлдэгдлийн нэхэмжлэлийн ТӨЛӨВ (№69)
        ag = row.get("agreed")
        if ag and ob is not None:
            try:
                ob.agreed_at = date.fromisoformat(ag["date"])
            except (ValueError, KeyError, TypeError):
                ob.agreed_at = as_of
            ob.agreed_by = (ag.get("by") or "")[:100]
            counts["agreed"] += 1
        db.commit()

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
        start = as_of
        if row.get("start_date"):
            try:
                start = date.fromisoformat(row["start_date"])
            except ValueError:
                warnings.append(f"№{row['no']}: гэрээний огноо уншигдсангүй "
                                f"«{row['start_date']}» — {as_of} болов")
        c = create_active_contract(db, cl, row["no"], as_of, row["items"],
                                   note=row.get("note", ""),
                                   vat_percent=float(row.get("vat_percent", 0)),
                                   warnings=warnings, start_date=start,
                                   cycle_mode=row.get("cycle_mode", "days"),
                                   sites=row.get("sites"))
        if c is None:
            counts["skipped"] += 1
            continue
        counts["contracts"] += 1
        counts["sites"] += len(row.get("sites") or [])

        # ---- БАРЬЦААНЫ ГҮЙДЭГ ДЭВТЭР (H8) ----
        # ⚠ `apply` нь ТӨЛБӨР ТӨРҮҮЛЭХГҮЙ (`payment_id=None`): самбарын
        # `Үлдэгдэл` тэр суутгалыг АЛЬ ХЭДИЙН цэвэрлэсэн. Синтетик төлбөр
        # үүсгэвэл авлага ХОЁР ДАХИН буурна (давхар тооцоолол).
        for ev in row.get("deposit_events", []):
            try:
                day = date.fromisoformat(ev.get("date") or str(as_of))
            except ValueError:
                day = as_of
            if ev.get("kind") not in deposit_svc.KINDS or float(ev["amount"]) <= 0:
                warnings.append(f"№{c.no}: барьцааны бичилт алгасав — {ev}")
                continue
            db.add(models.DepositEvent(contract_id=c.id, date=day, kind=ev["kind"],
                                       amount=round(float(ev["amount"]), 2),
                                       note=ev.get("note", ""), payment_id=None,
                                       user_name="Шилжүүлэлт"))
            counts["deposit_events"] += 1
        db.commit()
        db.refresh(c)
        deposit_svc.recompute(db, c)

        for n in row.get("notes", []):
            if _note(db, "contract", c.id, n, as_of) is not None:
                counts["notes"] += 1
        db.commit()

    counts["warnings"] = warnings
    return counts

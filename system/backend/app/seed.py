"""Mock data — бодит Numbers файлын бүтцээр (нэрс зохиомол).

MVP бүрэн дуусмагц бодит датаг Numbers файлуудаас импортлоно.
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from . import models
from .auth import hash_password
from .services import billing


def seed_base(db: Session):
    """Суурь: хэрэглэгчид, зэрэглэл, каталог, тохиргоо — mock ЧҮ демо дата ороогүй.
    Бодит дата руу шилжихэд (app/migrate.py) энэ + real_data.json л хэрэглэгдэнэ."""
    if db.query(models.User).count():
        return

    # ---- Хэрэглэгчид ----
    db.add_all([
        models.User(username="otgoo", password_hash=hash_password("1234"), name="Ч.Отгонцэцэг", role="manager"),
        models.User(username="darga", password_hash=hash_password("1234"), name="Үйлдвэрийн дарга", role="factory"),
        models.User(username="sanhuu", password_hash=hash_password("1234"), name="Санхүүч", role="finance"),
    ])

    # ---- Зэрэглэл (динамик — менежер өөрчилж болно) ----
    g_new = models.Grade(code="шинэ", name="Шинэ", sort=0)
    g_a = models.Grade(code="А", name="А зэрэглэл", sort=1)
    g_b = models.Grade(code="В", name="В зэрэглэл", sort=2)
    db.add_all([g_new, g_a, g_b])
    db.flush()

    _seed_catalog(db, g_new, g_a, g_b, with_stock=False)

    db.add_all([
        models.Setting(key="company_name", value="Жигүүр Зам ХХК"),
        models.Setting(key="penalty_default", value="0.5"),
        models.Setting(key="cycle_days_default", value="30"),
        models.Setting(key="ndsh_percent", value="11.5"),
    ])
    db.commit()


def seed(db: Session):
    if db.query(models.User).count():
        return

    # ---- Хэрэглэгчид ----
    db.add_all([
        models.User(username="otgoo", password_hash=hash_password("1234"), name="Ч.Отгонцэцэг", role="manager"),
        models.User(username="darga", password_hash=hash_password("1234"), name="Үйлдвэрийн дарга", role="factory"),
        models.User(username="sanhuu", password_hash=hash_password("1234"), name="Санхүүч", role="finance"),
    ])

    # ---- Зэрэглэл (динамик — менежер өөрчилж болно) ----
    g_new = models.Grade(code="шинэ", name="Шинэ", sort=0)
    g_a = models.Grade(code="А", name="А зэрэглэл", sort=1)
    g_b = models.Grade(code="В", name="В зэрэглэл", sort=2)
    db.add_all([g_new, g_a, g_b])
    db.flush()

    mats = _seed_catalog(db, g_new, g_a, g_b, with_stock=True)
    _seed_demo(db, mats, g_new, g_a, g_b)


def _seed_catalog(db: Session, g_new, g_a, g_b, with_stock: bool):
    """Каталог (бодит кодууд, ойролцоо үнэ).
    (нэр, категори, тариф, засварын фикс, {зэрэглэл: (НБҮнэ, худалдах)}, {зэрэглэл: демо үлдэгдэл})"""
    cat = [
        ("Хэв хашмал 6012", "Хэв", 330, 15000, {g_new: (79500, 79500), g_a: (69500, 58000), g_b: (48000, 48000)}, {g_new: 1000, g_a: 6000, g_b: 2558}),
        ("Хэв хашмал 5012", "Хэв", 330, 15000, {g_a: (80000, 76000), g_b: (65000, 65000)}, {g_b: 132}),
        ("Хэв хашмал 4512", "Хэв", 330, 12000, {g_a: (60000, 56000), g_b: (47000, 47000)}, {g_a: 1440, g_b: 521}),
        ("Хэв хашмал 4012", "Хэв", 330, 12000, {g_a: (75000, 56000), g_b: (46000, 46000)}, {g_a: 891, g_b: 746}),
        ("Хэв хашмал 3012", "Хэв", 330, 10000, {g_a: (58000, 55000), g_b: (45000, 45000)}, {g_a: 1739, g_b: 924}),
        ("Хэв хашмал 2012", "Хэв", 330, 10000, {g_new: (65000, 65000), g_a: (55000, 50000), g_b: (45000, 45000)}, {g_a: 1285, g_b: 83}),
        ("Хэв хашмал 1010", "Хэв", 330, 8000, {g_new: (62000, 62000), g_a: (55000, 50000), g_b: (45000, 45000)}, {g_new: 1006, g_a: 31, g_b: 182}),
        ("Хэв хашмал 1015", "Хэв", 330, 8000, {g_new: (65000, 65000), g_a: (57000, 57000), g_b: (50000, 50000)}, {g_new: 400, g_a: 130}),
        ("Хэв хашмал 1020", "Хэв", 330, 8000, {g_new: (68000, 68000), g_a: (59000, 59000), g_b: (52000, 52000)}, {g_new: 190, g_a: 36}),
        ("Хэв хашмал 1515", "Хэв", 330, 8000, {g_new: (70000, 70000), g_b: (59000, 55000)}, {g_new: 184, g_b: 277}),
        ("Хэв хашмал 1200", "Хэв", 330, 8000, {g_a: (30000, 30000), g_b: (27000, 27000)}, {g_a: 91}),
        ("Хэв хашмал 2400", "Хэв", 330, 10000, {g_new: (70000, 70000), g_b: (55000, 50000)}, {g_new: 200, g_b: 126}),
        ("Тулаас В2", "Тулаас", 110, 6000, {g_new: (56000, 55000), g_a: (50000, 45000), g_b: (38000, 38000)}, {g_new: 22350, g_a: 3235, g_b: 6105}),
        ("Тулаас В4", "Тулаас", 220, 6000, {g_new: (62000, 60500), g_a: (55000, 52000), g_b: (52000, 50000)}, {g_new: 1950, g_a: 2008, g_b: 5820}),
        ("Тулаас В5", "Тулаас", 250, 6000, {g_new: (75000, 75000)}, {g_new: 975}),
        ("Тулаас В6", "Тулаас", 300, 6000, {g_new: (65000, 65000), g_a: (60000, 60000)}, {}),
        ("Труба 6м", "Труба", 220, 5000, {g_a: (82500, 82500), g_b: (70000, 70000)}, {g_a: 1420, g_b: 673}),
        ("Труба 4м", "Труба", 200, 5000, {g_a: (55000, 55000), g_b: (50000, 50000)}, {g_a: 900, g_b: 400}),
        ("Труба 3м", "Труба", 200, 5000, {g_a: (42000, 42000), g_b: (40000, 40000)}, {g_a: 800, g_b: 763}),
        ("Труба 2м", "Труба", 150, 4000, {g_a: (28000, 28000), g_b: (25000, 25000)}, {g_a: 300, g_b: 294}),
    ]
    mats: dict[str, models.Material] = {}
    for name, category, rate, repair, prices, stock in cat:
        m = models.Material(name=name, category=category, base_rate=rate, repair_fee=repair)
        db.add(m)
        db.flush()
        mats[name] = m
        for g, (nb, sale) in prices.items():
            db.add(models.MaterialGradePrice(material_id=m.id, grade_id=g.id, nb_price=nb, sale_price=sale))
        if with_stock:
            for g, q in stock.items():
                db.add(models.Stock(material_id=m.id, grade_id=g.id, on_hand=q))
    db.flush()
    return mats


def _seed_demo(db: Session, mats, g_new, g_a, g_b):
    """Демо: харилцагч, гэрээ, төлбөр, бартер, зээл, механизм, ажилчид."""

    # ---- Харилцагчид (зохиомол нэрс) ----
    def client(name, reg, person, phone, note=""):
        c = models.Client(name=name, reg=reg, person=person, phone=phone, note=note)
        db.add(c)
        db.flush()
        return c

    altan = client("Алтан Гадас Констракшн", "2734519", "Н.Манлай", "9900-3777",
                   "Том захиалгатай, төлбөр удаашралтай — бартераар хаах хандлагатай.")
    tumen = client("Түмэн Хийц ХХК", "5518203", "Б.Сараа", "8810-2244")
    huh = client("Хөх Толгой Майнинг", "3390127", "Д.Тэмүүжин", "9911-5566")
    ider = client("Идэр Зам ХХК", "4482910", "Г.Уянга", "8810-3130")
    bat = client("Бат Бүтээц ХХК", "6120458", "С.Болд", "9908-7712")

    today = date.today()

    def contract(no, cl, ctype, start, items, end=None, deposit=0, penalty=0.5):
        c = models.Contract(no=no, client_id=cl.id, type=ctype, start_date=start,
                            end_date=end, deposit=deposit, penalty_percent=penalty)
        db.add(c)
        db.flush()
        for (m, g, rate, price) in items:
            db.add(models.ContractItem(contract_id=c.id, material_id=m.id, grade_id=g.id,
                                       daily_rate=rate, unit_price=price))
        db.flush()
        return c

    def move(c, mtype, d, lines, status="done", note=""):
        mv = models.Movement(contract_id=c.id, type=mtype, date=d, status=status, note=note)
        db.add(mv)
        db.flush()
        # Падан: олголтын мөр бүр гэрээний тарифаа өөртөө авч явна
        rates = {(i.material_id, i.grade_id): (i.unit_price if c.type == "sale" else i.daily_rate)
                 for i in c.items}
        for ln in lines:
            row = dict(ln)
            if mtype == "ISSUE" and row.get("rate") is None:
                row["rate"] = rates.get((row["material_id"], row["grade_id"]))
            db.add(models.MovementLine(movement_id=mv.id, **row))
        db.flush()
        db.refresh(mv)
        if status == "done":
            billing.apply_movement_stock(db, mv)
        return mv

    def pay(cl, c, d, amount, method, barter="", note=""):
        p = models.Payment(client_id=cl.id, contract_id=c.id if c else None, date=d,
                           amount=amount, method=method, barter_desc=barter, note=note)
        db.add(p)
        db.commit()
        billing.allocate_payment(db, p)
        return p

    m6012, m5012, mB2, mB4, mT6, mT3 = (mats["Хэв хашмал 6012"], mats["Хэв хашмал 5012"],
                                        mats["Тулаас В2"], mats["Тулаас В4"],
                                        mats["Труба 6м"], mats["Труба 3м"])

    # ---- Гэрээ 1: Алтан Гадас — том түрээс, бартер төлбөр, хэтэрсэн авлага ----
    c1 = contract("24/03", altan, "rent", today - timedelta(days=155),
                  [(m6012, g_a, 330, 0), (m5012, g_b, 330, 0), (mB2, g_new, 110, 0), (mT6, g_a, 220, 0)])
    move(c1, "ISSUE", c1.start_date, [
        dict(material_id=m6012.id, grade_id=g_a.id, qty=2131),
        dict(material_id=m5012.id, grade_id=g_b.id, qty=120),
        dict(material_id=mB2.id, grade_id=g_new.id, qty=783),
        dict(material_id=mT6.id, grade_id=g_a.id, qty=60)], note="Эхний ачилт")
    # маргааш нь 306ш буцаав — 1 хоногийн пропорц (бодит Блүүмийн кейс)
    move(c1, "RETURN", c1.start_date + timedelta(days=1),
         [dict(material_id=m6012.id, grade_id=g_a.id, qty=306, return_grade_id=g_a.id)],
         note="Илүү гарсан тул буцаав")
    # дундуур нэмэлт
    move(c1, "ISSUE", today - timedelta(days=100),
         [dict(material_id=mB2.id, grade_id=g_new.id, qty=200)], note="Нэмэлт олголт")
    # буцаалт: зарим нь В болов, засвар + акт
    move(c1, "RETURN", today - timedelta(days=70), [
        dict(material_id=m6012.id, grade_id=g_a.id, qty=400, return_grade_id=g_b.id,
             repair_qty=30, writeoff_qty=18)], note="Хэсэгчилсэн буцаалт — 30ш засварт, 18ш акт")
    # засвар/актын хураамжийг гараар бодож шинэчилнэ (router логиктой ижил)
    ret = [mv for mv in c1.movements if mv.type == "RETURN"][-1]
    for ln in ret.lines:
        ln.repair_fee = ln.repair_qty * m6012.repair_fee
        price = db.query(models.MaterialGradePrice).filter_by(material_id=m6012.id, grade_id=g_a.id).first()
        ln.writeoff_fee = ln.writeoff_qty * price.nb_price
    db.commit()
    billing.ensure_invoices(db, c1, today)
    db.refresh(c1)
    pay(altan, c1, today - timedelta(days=115), 31_000_000, "BANK")
    pay(altan, c1, today - timedelta(days=80), 35_000_000, "BARTER", "Автомашин 9957УКК",
        "Машиныг 35 саяар үнэлж төлбөрт авав")
    pay(altan, c1, today - timedelta(days=20), 20_000_000, "CASH")

    # ---- Гэрээ 2: Идэр Зам — хэтэрсэн ----
    c2 = contract("26/07", ider, "rent", today - timedelta(days=160),
                  [(m6012, g_b, 300, 0), (mT3, g_a, 200, 0)])
    move(c2, "ISSUE", c2.start_date, [
        dict(material_id=m6012.id, grade_id=g_b.id, qty=1100),
        dict(material_id=mT3.id, grade_id=g_a.id, qty=250)])
    billing.ensure_invoices(db, c2, today)
    db.refresh(c2)
    pay(ider, c2, today - timedelta(days=130), 12_330_000, "BANK")
    pay(ider, c2, today - timedelta(days=95), 12_330_000, "BANK")
    pay(ider, c2, today - timedelta(days=60), 12_000_000, "CASH")

    # ---- Гэрээ 3: Хөх Толгой — дуусах дөхсөн, барьцаатай ----
    c3 = contract("26/11", huh, "rent", today - timedelta(days=110),
                  [(m6012, g_a, 330, 0), (mB4, g_new, 220, 0)],
                  end=today + timedelta(days=3), deposit=21_000_000)
    move(c3, "ISSUE", c3.start_date, [
        dict(material_id=m6012.id, grade_id=g_a.id, qty=1200),
        dict(material_id=mB4.id, grade_id=g_new.id, qty=900)])
    billing.ensure_invoices(db, c3, today)
    db.refresh(c3)
    pay(huh, c3, today - timedelta(days=75), 18_500_000, "BANK")
    pay(huh, c3, today - timedelta(days=45), 18_500_000, "BANK")
    pay(huh, c3, today - timedelta(days=12), 18_500_000, "CASH")

    # ---- Гэрээ 4: Түмэн Хийц — шинэ, ачилт хүлээгдэж буй ----
    c4 = contract("26/14", tumen, "rent", today - timedelta(days=1),
                  [(m6012, g_a, 330, 0), (mB2, g_new, 110, 0)], deposit=10_000_000)
    move(c4, "ISSUE", c4.start_date, [
        dict(material_id=m6012.id, grade_id=g_a.id, qty=450),
        dict(material_id=mB2.id, grade_id=g_new.id, qty=300)],
        status="pending", note="Гэрээний эхний ачилт")

    # ---- Гэрээ 5: Хөх Толгой — худалдаа (бартер + бэлэн холимог төлбөр) ----
    c5 = contract("26/06", huh, "sale", today - timedelta(days=54),
                  [(m6012, g_a, 0, 58000), (m5012, g_a, 0, 76000)])
    move(c5, "ISSUE", c5.start_date, [
        dict(material_id=m6012.id, grade_id=g_a.id, qty=1200),
        dict(material_id=m5012.id, grade_id=g_a.id, qty=86)])
    billing.ensure_invoices(db, c5, today)
    db.refresh(c5)
    pay(huh, c5, today - timedelta(days=50), 40_000_000, "BARTER", "Орон сууц 31.51м² Баянбүрд",
        "Байрыг 40 саяар үнэлж төлбөрт авав")
    pay(huh, c5, today - timedelta(days=47), 10_000_000, "CASH")
    pay(huh, c5, today - timedelta(days=15), 20_000_000, "BANK")

    # ---- Гэрээ 6: Бат Бүтээц — жижиг түрээс, хэвийн ----
    c6 = contract("25/09", bat, "rent", today - timedelta(days=85),
                  [(mT3, g_b, 200, 0), (mB2, g_a, 110, 0)], deposit=6_000_000)
    move(c6, "ISSUE", c6.start_date, [
        dict(material_id=mT3.id, grade_id=g_b.id, qty=400),
        dict(material_id=mB2.id, grade_id=g_a.id, qty=600)])
    billing.ensure_invoices(db, c6, today)
    db.refresh(c6)
    pay(bat, c6, today - timedelta(days=50), 4_500_000, "BANK")
    pay(bat, c6, today - timedelta(days=18), 4_500_000, "CASH")

    # ---- Бартер хөрөнгө (2 хадгалагдаж буй, 1 нь алдагдалтай зарагдсан) ----
    db.add_all([
        models.BarterAsset(client_id=altan.id, type="Машин", name="Автомашин 9957УКК",
            date_in=today - timedelta(days=80), value_in=35_000_000, asking_price=36_000_000,
            note="№24/03 гэрээний төлбөрт орж ирсэн"),
        models.BarterAsset(client_id=huh.id, type="Байр", name="Орон сууц 31.51м² · Баянбүрд",
            detail="1 тоот · 4.5 сая/м²", date_in=today - timedelta(days=50),
            value_in=40_000_000, asking_price=45_000_000,
            note="№26/06 худалдааны төлбөрт орж ирсэн"),
        models.BarterAsset(type="Машин", name="Land Cruiser J300", detail="0314УНҮ · 2022 он",
            date_in=today - timedelta(days=120), value_in=250_000_000, asking_price=250_000_000,
            status="sold", sold_date=today - timedelta(days=30),
            sold_amount=240_000_000, sold_to="Хувь хүн", note="Зах зээл унасан үед зарав"),
    ])

    # ---- Зээл, өглөг (бодит хэв маягаар — нэрс банкных, хувь хүн нь зохиомол) ----
    loans = [
        models.Loan(name="Хаан банк — шугам №1", kind="bank", principal=800_000_000,
                    monthly_rate=1.6, start_date=today - timedelta(days=520)),
        models.Loan(name="Хаан банк — шугам №2", kind="bank", principal=1_500_000_000,
                    monthly_rate=1.55, start_date=today - timedelta(days=330)),
        models.Loan(name="Хас банк", kind="bank", principal=300_000_000,
                    monthly_rate=1.6, start_date=today - timedelta(days=110)),
        models.Loan(name="Чандмань санхүү", kind="private", principal=530_000_000,
                    monthly_rate=2.0, start_date=today - timedelta(days=100)),
        models.Loan(name="Хувь зээлдүүлэгч А.", kind="private", principal=2_000_000_000,
                    monthly_rate=3.0, start_date=today - timedelta(days=210)),
    ]
    db.add_all(loans)
    db.flush()
    # сүүлийн 3 сарын хүүгийн төлөлтүүд (жишээ)
    for l in loans[:3]:
        for k in (1, 2, 3):
            db.add(models.LoanPayment(loan_id=l.id, date=today - timedelta(days=30 * k),
                                      amount=l.principal * l.monthly_rate / 100, part="interest"))
    db.flush()

    # ---- Механизм: Автокран (бодит log-ийн хэв маягаар) ----
    kran = models.Machine(name="Автокран 25т", note="Худалдаж авсан 2025 он")
    db.add(kran)
    db.flush()
    kran_logs = [
        (35, "job", "Бүтэн өдөр", "Билгүүн Барилга", 1_200_000, "BARTER"),
        (30, "job", "Бүтэн өдөр", "Түмэн Хийц", 1_200_000, "BANK"),
        (26, "job", "Хагас өдөр", "Бат Бүтээц", 600_000, "CASH"),
        (22, "job", "Дотоод ажил", "Жигүүр Зам — материал буулгах", 300_000, "INTERNAL"),
        (18, "job", "Бүтэн өдөр", "Хөх Толгой", 1_000_000, "BANK"),
        (14, "expense", "Түлш", "", 800_000, ""),
        (12, "job", "Хагас өдөр", "Идэр Зам", 500_000, "CASH"),
        (8, "job", "Дотоод ажил", "Жигүүр Зам — хэв ачих", 300_000, "INTERNAL"),
        (5, "expense", "Жолоочийн цалин", "", 1_500_000, ""),
        (3, "expense", "Сэлбэг — краны гинж", "", 460_000, ""),
        (2, "job", "Бүтэн өдөр", "Түмэн Хийц", 1_200_000, "BANK"),
    ]
    for days, entry, label, cl_name, amt, method in kran_logs:
        db.add(models.MachineLog(machine_id=kran.id, date=today - timedelta(days=days),
                                 entry=entry, label=label, client=cl_name,
                                 amount=amt, method=method))
    db.flush()

    # ---- Ажилчид (зохиомол нэрс) ----
    emps = [
        models.Employee(name="Ч.Отгонцэцэг", role_title="Менежер", type="main",
                        monthly_salary=3_000_000, ndsh=1),
        models.Employee(name="Б.Дарга", role_title="Үйлдвэрийн дарга", type="main",
                        monthly_salary=2_800_000, ndsh=1),
        models.Employee(name="С.Санхүүч", role_title="Санхүүч", type="contract",
                        monthly_salary=2_200_000, ndsh=1),
        models.Employee(name="Б.Батирээдүй", role_title="Краны жолооч", type="contract",
                        monthly_salary=1_500_000, ndsh=0),
        models.Employee(name="Д.Ганбат", role_title="Засварчин", type="daily", daily_rate=80_000),
        models.Employee(name="Т.Мөнхөө", role_title="Туслах ажилтан", type="daily", daily_rate=70_000),
    ]
    db.add_all(emps)
    db.flush()
    # Өнгөрсөн сарын 2 хагасын бодолт — олгогдсон
    prev = (today.replace(day=1) - timedelta(days=1))
    period = f"{prev.year}-{prev.month:02d}"
    for half, daily_days in ((1, {emps[4].id: 11, emps[5].id: 9}), (2, {emps[4].id: 12, emps[5].id: 10})):
        run = models.SalaryRun(period=period, half=half, paid=1,
                               paid_date=prev.replace(day=15 if half == 1 else prev.day))
        db.add(run)
        db.flush()
        for e in emps:
            if e.type in ("main", "contract"):
                base, days = e.monthly_salary / 2, 0.0
            else:
                days = float(daily_days.get(e.id, 0))
                base = days * e.daily_rate
            if base <= 0:
                continue
            nd = base * 0.115 if e.ndsh else 0.0
            db.add(models.SalaryItem(run_id=run.id, employee_id=e.id, base=base,
                                     days=days, ndsh_amount=nd, net=base - nd))
    db.flush()

    # ---- Тохиргоо ----
    db.add_all([
        models.Setting(key="company_name", value="Жигүүр Зам ХХК"),
        models.Setting(key="penalty_default", value="0.5"),
        models.Setting(key="cycle_days_default", value="30"),
        models.Setting(key="ndsh_percent", value="11.5"),
    ])
    db.commit()

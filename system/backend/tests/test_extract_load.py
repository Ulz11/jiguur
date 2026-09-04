"""ТОП-10 ШИЛЖҮҮЛЭЛТ — `load_data` ЗУРГААН ШИНЭ БАЙРЫГ дүүргэж байна уу.

Задлагчийн цэвэр функцүүд `test_extract_top10.py`-д шалгагдана; энд тэдгээрийн
гаралт DB рүү орох ЗАМ шалгагдана:

  · гэрээний ЖИНХЭНЭ огноо (Марч 2022.3.1) — хөдөлгүүр хий нэхэмжлэл гаргахгүй
  · КАЛЕНДАРЬ САРЫН горим (Грэйт — 31 хоногийн сар ×31/30)
  · барьцааны явдлын дэвтэр — `apply` нь ТӨЛБӨР ТӨРҮҮЛЭХГҮЙ (давхар тооцоогүй)
  · харилцагчийн ГАРЫН ҮСЭГТНҮҮД, ТҮРЭЭС БИШ бичилт, ЗАХЫН ТЭМДЭГЛЭЛ
  · «Тооцоо нийлсэн» огноо, ТАЛБАЙН задаргаа, каталогийн нүх
  · алданги ҮРГЭЛЖ 0 (H2)
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.db import Base

AS_OF = "2026-09-01"


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def _data(**over):
    """Топ-10-ын хэлбэртэй хамгийн бага багц."""
    base = {
        "as_of": AS_OF,
        "clients_mode": "top10",
        "catalog": [{"name": "Труба 1м", "category": "Труба", "base_rate": 110,
                     "repair_fee": 4000, "note": "ӨнөОрд-8!AQ27 = 110₮"},
                    {"name": "Труба 5м", "category": "Труба", "base_rate": 0,
                     "repair_fee": 0, "note": "тариф олдсонгүй"}],
        "clients": [],
        "stock": [], "loans": [], "barter": [], "contracts": [],
    }
    base.update(over)
    return base


def _client(name, **over):
    row = {"name": name, "balance": 0, "deposit": 0, "note": ""}
    row.update(over)
    return row


def _contract(client, no, **over):
    row = {"client": client, "no": no, "vat_percent": 0, "note": "",
           "items": [{"material": "Труба 1м", "grade": "А", "qty": 278,
                      "daily_rate": 110}]}
    row.update(over)
    return row


# ═════════════════════════════════ каталогийн НҮХ (E3)

def test_catalog_gap_material_is_created_and_then_loads(db):
    """«Труба 1м» урьд нь каталогт байхгүй тул 278ш ЧИМЭЭГҮЙ унадаг байв."""
    from app.services import migration as M

    r = M.load_data(db, _data(clients=[_client("Өнө Орд ХХК яармаг")],
                              contracts=[_contract("Өнө Орд ХХК яармаг", "25.19")]))
    assert r["materials"] == 2
    m = db.query(models.Material).filter_by(name="Труба 1м").first()
    assert m is not None and m.base_rate == 110
    st = db.query(models.Stock).filter_by(material_id=m.id).first()
    assert st.on_rent == 278                     # ачаалагдав, унасангүй
    assert not any("каталогт алга" in w for w in r["warnings"])


def test_rateless_new_material_raises_a_flag_not_a_guess(db):
    """«Труба 5м» — тариф ХААНААС Ч олдоогүй. 0-оор нээгээд ТУГ өргөнө."""
    from app.services import migration as M

    r = M.load_data(db, _data())
    m = db.query(models.Material).filter_by(name="Труба 5м").first()
    assert m.base_rate == 0
    n = db.query(models.Note).filter_by(entity_type="material", entity_id=m.id).all()
    assert len(n) == 1 and n[0].flag is True
    assert any("Труба 5м" in w for w in r["warnings"])


# ═════════════════════════════════ ГЭРЭЭНИЙ ЖИНХЭНЭ ОГНОО

def test_contract_keeps_its_real_start_date_four_years_before_as_of(db):
    """Марч констракшн — 2022.3.1. Урьд нь дөрвөн жилийн харилцаа `as_of`-оос
    эхэлдэг байв."""
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client("Марч констракшн")],
                          contracts=[_contract("Марч констракшн", "02",
                                               start_date="2022-03-01")]))
    c = db.query(models.Contract).filter_by(no="02").first()
    assert c.start_date == date(2022, 3, 1)
    assert c.penalty_percent == 0


def test_a_start_date_years_early_yields_no_phantom_invoices(db):
    """Тэг хуримтлалтай цикл нэхэмжлэл ТӨРҮҮЛДЭГГҮЙ (`derivable_invoice_specs`
    нь `rent == 0 and charge == 0` мөрийг алгасдаг), гэхдээ ЦИКЛИЙН ДУГААР нь
    огнооноос гарах тул ТОГТВОРТОЙ."""
    from app.services import billing, migration as M

    M.load_data(db, _data(clients=[_client("Марч констракшн")],
                          contracts=[_contract("Марч констракшн", "02",
                                               start_date="2022-03-01")]))
    c = db.query(models.Contract).filter_by(no="02").first()
    as_of = date.fromisoformat(AS_OF)
    specs = billing.derivable_invoice_specs(c, today=as_of)
    assert specs == []                       # олголт нь as_of-т — өмнө нь ЮУ Ч алга

    # …нэг цикл өнгөрөхөд ЯГ НЭГ нэхэмжлэл, дугаар нь огнооны индексээр
    later = billing.cycle_of(c, as_of)[1]
    specs = billing.derivable_invoice_specs(c, today=later)
    assert len(specs) == 1
    idx = billing.cycle_index(c, specs[0]["cycle_start"])
    assert specs[0]["no"] == f"R-02-{idx}"
    assert idx > 50                          # том — гэхдээ тогтвортой
    assert specs[0]["cycle_start"] <= as_of < specs[0]["cycle_end"]
    # ХОЁР ДАХЬ дуудалт ЯГ ижил дугаар өгнө (байрлалаас биш огнооноос)
    assert billing.derivable_invoice_specs(c, today=later)[0]["no"] == specs[0]["no"]


def test_missing_header_date_falls_back_to_as_of(db):
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client("Зулаа")],
                          contracts=[_contract("Зулаа", "25/03", start_date=None)]))
    c = db.query(models.Contract).filter_by(no="25/03").first()
    assert c.start_date == date.fromisoformat(AS_OF)


# ═════════════════════════════════ КАЛЕНДАРЬ САР (R5 / H3)

def test_great_mining_loads_as_a_calendar_month_contract(db):
    """31 хоногтой сар ×31/30 нэхэгдэнэ — урьд нь сар бүр 1,363,320₮ дутуу."""
    from app.services import billing, migration as M

    M.load_data(db, _data(
        clients=[_client("Грэйт Майнинг")],
        contracts=[_contract("Грэйт Майнинг", "25/04", start_date="2025-05-08",
                             cycle_mode="month")]))
    c = db.query(models.Contract).filter_by(no="25/04").first()
    assert c.cycle_mode == "month"
    assert billing.cycle_mode(c) == "month"
    cs, ce = billing.cycle_window(c, 0)
    assert (cs, ce) == (date(2025, 5, 8), date(2025, 6, 8))


def test_days_mode_stays_the_default(db):
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client("Марч констракшн")],
                          contracts=[_contract("Марч констракшн", "02")]))
    assert db.query(models.Contract).filter_by(no="02").first().cycle_mode == "days"


# ═════════════════════════════════ БАРЬЦААНЫ ДЭВТЭР (H8)

def test_deposit_chain_becomes_five_events_and_books_no_payment(db):
    """Зулаагийн `«=20000000-8265000+3000000+3000000+10000000»`.

    ⚠ `apply` нь ТӨЛБӨР ҮҮСГЭХГҮЙ: самбарын `Үлдэгдэл` тэр суутгалыг АЛЬ
    ХЭДИЙН цэвэрлэсэн тул синтетик төлбөр нь авлагыг ХОЁР ДАХИН бууруулна."""
    from app.services import deposit as D, migration as M

    events = [{"kind": "lodge", "amount": 20_000_000, "date": AS_OF, "note": "x"},
              {"kind": "apply", "amount": 8_265_000, "date": AS_OF, "note": "x"},
              {"kind": "topup", "amount": 3_000_000, "date": AS_OF, "note": "x"},
              {"kind": "topup", "amount": 3_000_000, "date": AS_OF, "note": "x"},
              {"kind": "topup", "amount": 10_000_000, "date": AS_OF, "note": "x"}]
    r = M.load_data(db, _data(
        clients=[_client("Зулаа", balance=857_200, deposit=27_735_000)],
        contracts=[_contract("Зулаа", "25/03", deposit_events=events)]))
    assert r["deposit_events"] == 5
    # …ба ДАНСНЫ гэрээнд ДАВХАРДААГҮЙ (H9): барьцаа нэг л газар амьдарна
    ob = db.query(models.Contract).filter(models.Contract.no.like("OB-%")).one()
    assert ob.deposit == 0 and ob.deposit_status == "none"
    c = db.query(models.Contract).filter_by(no="25/03").first()
    db.refresh(c)
    t = D.totals(c)
    assert t["balance"] == 27_735_000
    assert t["applied"] == 8_265_000
    assert t["status"] == "held"
    assert [e.kind for e in D.live_events(c)] == \
        ["lodge", "apply", "topup", "topup", "topup"]
    # ХАМГИЙН ЧУХАЛ: суутгал нь ТӨЛБӨР төрүүлээгүй
    assert all(e.payment_id is None for e in D.live_events(c))
    assert db.query(models.Payment).count() == 0


def test_not_lodged_is_not_zero(db):
    """Бутангууд-7!G72 = `'байршуулаагүй'` — 0 БИШ, ЯВДАЛ ОГТ БОЛООГҮЙ (№55)."""
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client("Бутангууд")],
                          contracts=[_contract("Бутангууд", "25.19",
                                               deposit_events=[],
                                               deposit_status="none")]))
    c = db.query(models.Contract).filter_by(no="25.19").first()
    assert c.deposit == 0
    assert c.deposit_status == "none"
    assert c.deposit_events == []


# ═════════════════════════════════ ГАРЫН ҮСЭГТНҮҮД (№72, 73)

def test_signature_block_becomes_contacts_and_the_first_one_fills_the_client(db):
    """Тэр ЗАХИРАЛ руу залгадаггүй — НЯРАВ руу залгадаг тул `role` нь чимэг биш."""
    from app.services import migration as M

    people = [{"name": "Н.Батцоож", "role": "Төслийн менежер", "phone": "96590908",
               "phone2": "", "ref": "Бутангууд-7!AF39"},
              {"name": "Н.Соль", "role": "Нярав", "phone": "99966285", "phone2": ""},
              {"name": "С.Лхагвасүрэн", "role": "Захирал", "phone": "99113579",
               "phone2": ""}]
    r = M.load_data(db, _data(clients=[_client("Бутангууд", contacts=people)]))
    assert r["contacts"] == 3
    cl = db.query(models.Client).filter_by(name="Бутангууд").first()
    assert {c.role for c in cl.contacts} == {"Төслийн менежер", "Нярав", "Захирал"}
    assert cl.person == "Н.Батцоож" and cl.phone == "96590908"
    assert all(c.active for c in cl.contacts)


def test_two_phones_in_one_cell_are_kept_apart(db):
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client(
        "Ашид Донж Билгүүн",
        contacts=[{"name": "Б.Дарханбаяр", "role": "Захирал",
                   "phone": "88111935", "phone2": "99991491"}])]))
    p = db.query(models.ClientContact).first()
    assert (p.phone, p.phone2) == ("88111935", "99991491")


def test_written_person_is_not_overwritten_by_the_signature_block(db):
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client(
        "Зулаа", person="О.Зулаа", phone="99205311",
        contacts=[{"name": "Хэн нэгэн", "role": "", "phone": "11111111",
                   "phone2": ""}])]))
    cl = db.query(models.Client).filter_by(name="Зулаа").first()
    assert cl.person == "О.Зулаа" and cl.phone == "99205311"
    assert len(cl.contacts) == 1


# ═════════════════════════════════ ТҮРЭЭС БИШ БИЧИЛТ (H11)

def test_inter_party_netting_becomes_one_client_entry(db):
    """WB3!R24 = 139,648,000₮ — Бутангуудын `Үлдэгдэл` мөрөнд ОРООГҮЙ тул
    энэ бол ЦОРЫН ГАНЦ нэмэлт мөнгө."""
    from app.services import billing, migration as M

    entry = {"kind": "transfer", "amount": 139_648_000, "date": AS_OF,
             "label": "Өнө Ордтой тооцоо — 2026.06.22 акт",
             "ref": "2026 тооцоо!R24 · Бутан-Өнөорд"}
    # Самбар нь Бутангуудын ХОЁР мөрийг (R8 + R24) нэг үлдэгдэлд нийлүүлдэг.
    # Бичилт нь R24-ийг ӨӨРИЙН баримт болгож ГАРГАЖ АВНА — нийт дүн ХЭВЭЭР.
    r = M.load_data(db, _data(clients=[
        _client("Бутангууд", balance=474_981_564, entries=[entry])]))
    assert r["entries"] == 1
    cl = db.query(models.Client).filter_by(name="Бутангууд").first()
    e = db.query(models.ClientEntry).one()
    assert e.kind == "transfer" and e.amount == 139_648_000
    assert "Өнө Орд" in e.label
    db.refresh(cl)
    ob = db.query(models.Invoice).filter_by(no=f"OB-{cl.id}").one()
    assert ob.total == 335_333_564                # R8 — бичилт нь ХАСАГДСАН
    assert round(billing.client_receivable(cl, date.fromisoformat(AS_OF))["total"]) \
        == 474_981_564                            # 335.3 + 139.6 — ДАВХАРДААГҮЙ


def test_crane_and_payroll_stay_notes_not_entries(db):
    """Кран/цалин/зээл нь самбарын `Үлдэгдэлд` АЛЬ ХЭДИЙН орсон — тэмдэглэл
    болно, авлагыг ДАХИН хөдөлгөхгүй (давхар тооцоог хориглов)."""
    from app.services import billing, migration as M

    notes = [{"text": "Түрээс БИШ мөр: Авто кран түрээс 6.1-6.30 — 10,000,000₮ "
                      "· АшидДонж-11!P30", "date": AS_OF, "flag": True}]
    M.load_data(db, _data(
        clients=[_client("Ашид Донж Билгүүн", balance=347_995_550)],
        contracts=[_contract("Ашид Донж Билгүүн", "26/02", notes=notes)]))
    cl = db.query(models.Client).filter_by(name="Ашид Донж Билгүүн").first()
    db.refresh(cl)
    r = billing.client_receivable(cl, date.fromisoformat(AS_OF))
    assert round(r["invoiced"]) == 347_995_550          # самбарын Үлдэгдэл ЯГ ХЭВЭЭР
    assert r["uninvoiced"] > 0                          # шинэ хуримтлал л нэмэгдэв
    assert db.query(models.ClientEntry).count() == 0
    kept = db.query(models.Note).filter_by(entity_type="contract").all()
    assert len(kept) == 1 and "Авто кран" in kept[0].text and kept[0].flag is True


# ═════════════════════════════════ ЗАХЫН ТЭМДЭГЛЭЛ ба ШАР ТУГ (P1-22)

def test_notes_land_on_the_contract_with_their_yellow_flag(db):
    from app.services import migration as M, notes as N

    rows = [{"text": "7.06нд тооцов · ГрэйтМайнинг-5!H30", "date": "2026-07-06",
             "flag": False},
            {"text": "ШАР нүд: 35,000,000 — «бартер» · Блүүт тооцоо!G8",
             "date": AS_OF, "flag": True}]
    r = M.load_data(db, _data(clients=[_client("Грэйт Майнинг")],
                              contracts=[_contract("Грэйт Майнинг", "25/04",
                                                   notes=rows)]))
    assert r["notes"] == 3            # 2 гэрээний + 1 каталогийн тариф-туг
    c = db.query(models.Contract).filter_by(no="25/04").first()
    got = N.notes_of(db, "contract", c.id)
    assert len(got) == 2
    assert [g["flag"] for g in got].count(True) == 1
    assert any(g["date"] == "2026-07-06" for g in got)
    assert all(g["author"] == "Шилжүүлэлт" for g in got)


def test_client_level_decision_notes(db):
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client(
        "Бутангууд",
        notes=[{"text": "ШИЙДВЭР ХЭРЭГТЭЙ — 124,648,000₮ · Бутан-Өнөорд!G32",
                "date": AS_OF, "flag": True}])]))
    cl = db.query(models.Client).filter_by(name="Бутангууд").first()
    n = db.query(models.Note).filter_by(entity_type="client", entity_id=cl.id).all()
    assert len(n) == 1 and n[0].flag is True


# ═════════════════════════════════ «ТООЦОО НИЙЛСЭН» (№69)

def test_agreed_date_lands_on_the_opening_balance_invoice(db):
    """Блүүт тооцоо!H4 = 2026.07.20 — ХОЁР ТАЛ гарын үсгээр баталсан."""
    from app.services import migration as M

    r = M.load_data(db, _data(clients=[_client(
        "Блүүм технологи", balance=392_791_500,
        agreed={"date": "2026-07-20", "by": "Блүүт тооцоо — тооцоо нийлсэн баримт"})]))
    assert r["agreed"] == 1
    cl = db.query(models.Client).filter_by(name="Блүүм технологи").first()
    inv = db.query(models.Invoice).filter_by(no=f"OB-{cl.id}").one()
    assert inv.agreed_at == date(2026, 7, 20)
    assert "Блүүт тооцоо" in inv.agreed_by


def test_without_a_date_the_invoice_stays_unagreed(db):
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client("Марч констракшн", balance=111_658_360)]))
    assert db.query(models.Invoice).one().agreed_at is None


# ═════════════════════════════════ ТАЛБАЙН ЗАДАРГАА (№88, 97)

def test_three_sites_become_three_movements_that_sum_to_the_sheet(db):
    """Блүүмийн 4,294ш = технологи + архангай + дарь эх; АВЛАГА нь НЭГ."""
    from app.services import migration as M

    items = [{"material": "Труба 1м", "grade": "А", "qty": 4294, "daily_rate": 110}]
    sites = [{"site": "БЛҮҮМ технологи",
              "items": [{"material": "Труба 1м", "grade": "А", "qty": 2044,
                         "daily_rate": 110}]},
             {"site": "БЛҮҮМ архангай",
              "items": [{"material": "Труба 1м", "grade": "А", "qty": 326,
                         "daily_rate": 110}]},
             {"site": "Блүүм дарь эх",
              "items": [{"material": "Труба 1м", "grade": "А", "qty": 1924,
                         "daily_rate": 110}]}]
    r = M.load_data(db, _data(
        clients=[_client("Блүүм технологи")],
        contracts=[_contract("Блүүм технологи", "24/03", items=items, sites=sites)]))
    assert r["sites"] == 3
    c = db.query(models.Contract).filter_by(no="24/03").first()
    mvs = sorted(c.movements, key=lambda m: m.site)
    assert [m.site for m in mvs] == ["БЛҮҮМ архангай", "БЛҮҮМ технологи",
                                     "Блүүм дарь эх"]
    assert sum(l.qty for m in mvs for l in m.lines) == 4294
    m = db.query(models.Material).filter_by(name="Труба 1м").first()
    st = db.query(models.Stock).filter_by(material_id=m.id).first()
    assert st.on_rent == 4294
    assert len(c.items) == 1                 # SKU тус бүрд НЭГ гэрээний мөр


def test_no_sites_is_one_unlabelled_movement(db):
    from app.services import migration as M

    M.load_data(db, _data(clients=[_client("Зулаа")],
                          contracts=[_contract("Зулаа", "25/03")]))
    c = db.query(models.Contract).filter_by(no="25/03").first()
    assert len(c.movements) == 1 and c.movements[0].site == ""


# ═════════════════════════════════ ХАРИЛЦАГЧИЙН ШҮҮЛТҮҮР ба алданги

def test_every_migrated_contract_has_zero_penalty(db):
    """H2 — тэр амьдралдаа алданги нэхээгүй; систем түүний нэрийн өмнөөс
    хөшүүрэг ЗЭВСЭГЛЭХГҮЙ."""
    from app.services import migration as M

    M.load_data(db, _data(
        clients=[_client("Зулаа", balance=857_200, deposit=27_735_000),
                 _client("Хурд групп", balance=-78_165_000)],
        contracts=[_contract("Зулаа", "25/03", start_date="2025-03-15")]))
    assert db.query(models.Contract).count() >= 2
    for c in db.query(models.Contract).all():
        assert c.penalty_percent == 0, c.no


def test_credit_client_from_the_reversed_formula_owes_nothing(db):
    """Хурд групп — J32 «=+I32-H32». Кредит; авлага 0."""
    from app.services import billing, migration as M

    M.load_data(db, _data(clients=[_client("Хурд групп", balance=-78_165_000)]))
    cl = db.query(models.Client).filter_by(name="Хурд групп").first()
    db.refresh(cl)
    assert billing.client_receivable(cl, date.fromisoformat(AS_OF))["total"] == 0
    p = db.query(models.Payment).one()
    assert p.amount == 78_165_000 and "илүү" in p.note


def test_load_is_idempotent(db):
    from app.services import migration as M

    payload = _data(clients=[_client("Зулаа", balance=857_200)],
                    contracts=[_contract("Зулаа", "25/03")])
    M.load_data(db, payload)
    again = M.load_data(db, payload)
    assert again["clients"] == 0 and again["contracts"] == 0
    assert db.query(models.Client).count() == 1
    assert db.query(models.Contract).filter_by(no="25/03").count() == 1

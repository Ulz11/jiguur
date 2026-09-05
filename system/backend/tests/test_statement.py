"""ТООЦООНЫ ХУУЛГА — харилцагчийн Excel хуудсыг орлох баримт.

Отгоо эгчийн дэвтэрт харилцагч бүр өөрийн хуудастай: дээр нь өмнөх үлдэгдэл,
доогуур нь өдөр өдрөөр нэмэгдсэн түрээс ба орж ирсэн төлбөр, хажууд нь мөр
бүрийн дараах үлдэгдэл. Тэр хуудсыг харилцагч руу явуулж «ийм байна» гэдэг.

ХОЁР зүйлийг ЭНЭ файл хамгаална:
  1. мөрийн арифметик (үлдэгдэл = өмнөх + нэмэгдсэн − төлсөн) — гараар шалгагдана;
  2. ёроолын тоо нь ДЭЛГЭЦИЙН «Авлагын үлдэгдэл»-тэй ЯГ таарна (H9b). Зөрвөл
     тоог «засах» биш, аль нь зөв болохыг эхлээд шийднэ.

`build_statement` нь зурдаггүй, `render_statement` нь боддоггүй — тиймээс мөрийн
логик HTTP-гүйгээр тестлэгдэнэ. Төсөлд PDF-ээс текст задлах сан суулгаагүй тул
зурсан үр дүнг `%PDF` тэмдэг ба `pages_count`-оор шалгана (`test_appendix`-тэй ижил).
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.db import Base
from app.services import billing, entries as entries_svc, migration, pdfstatement
from tests.test_billing import mv, setup_contract
from tests.test_features import iso, mk_contract


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


# ---------- түүхтэй харилцагч (нэг газар, олон тест) ----------

def bloom(db, until=date(2026, 5, 25)):
    """БЛҮҮМИЙН хуудас: хуучин үлдэгдэл, хоёр циклийн түрээс, төлбөр,
    тооцоогоор хаасан кредит, БАС цуцлагдсан нэг төлбөр.

    Огноонууд тогтмол (2026.3.20-оос) тул тоонууд нь давтагдана: 100ш × 330₮ ×
    30 хоног = 990,000₮ нэг цикл.
    """
    c, m, ga, gb = setup_contract(db)
    cl = db.get(models.Client, c.client_id)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])

    # 1) ХУУЧИН ҮЛДЭГДЭЛ — дансны (`OB-`) гэрээн дээрх ганц нэхэмжлэл.
    migration.create_opening_balance(db, cl, 2_000_000, date(2026, 3, 1),
                                     ob_date=date(2026, 3, 1))
    # 2) ХОЁР цикл — 4.19 ба 5.19-нд нэхэмжлэгдэнэ.
    billing.ensure_invoices(db, c, until)

    # 3) ТӨЛБӨР — 4.25-нд 1,500,000₮ данснаас.
    p = models.Payment(client_id=cl.id, contract_id=c.id, date=date(2026, 4, 25),
                       amount=1_500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)

    # 4) ЦУЦЛАГДСАН төлбөр — тооцоонд ОРОХГҮЙ (мөр нь дэлгэцэн дээр үлдэнэ).
    bad = models.Payment(client_id=cl.id, contract_id=c.id, date=date(2026, 4, 26),
                         amount=777_000, method="CASH", note="андуурч бичив")
    db.add(bad)
    db.commit()
    billing.allocate_payment(db, bad)
    billing.void_payment(db, bad, "Хоёр дахин бичигдсэн")

    # 5) ТҮРЭЭС БИШ бичилт (H11), сөрөг — CREDIT төлбөр болж материалчлагдана.
    entries_svc.create_entry(db, cl, date(2026, 5, 20), -300_000, "adjustment",
                             "Кран хөлсийг тооцоогоор хаав")
    db.expire_all()
    return db.get(models.Client, cl.id), c


# ---------- 1. МӨРҮҮД ----------

def test_the_statement_lists_every_live_event_in_date_order(db):
    """Хуучин үлдэгдэл · хоёр циклийн түрээс · төлбөр · тооцоогоор хаасан кредит —
    ТАВАН мөр, огнооны дарааллаар. ЦУЦЛАГДСАН төлбөр энд БАЙХГҮЙ: хуулга бол
    тооцоо, цуцлагдсан мөнгө тоологдох ёсгүй."""
    cl, c = bloom(db)

    st = pdfstatement.build_statement(db, cl, date(2026, 1, 1), date(2026, 5, 25))

    assert [(str(r.date), r.debit, r.credit) for r in st.rows] == [
        ("2026-03-01", 2_000_000, 0),
        ("2026-04-19", 990_000, 0),
        ("2026-04-25", 0, 1_500_000),
        ("2026-05-19", 990_000, 0),
        ("2026-05-20", 0, 300_000)]
    assert st.rows[0].text == "Хуучин үлдэгдэл — 2026-03-01 хүртэл"
    assert st.rows[1].text == "Түрээс 2026-03-20 – 2026-04-18 · гэрээ №24/03"
    assert st.rows[2].text == "Төлбөр — Данс"
    assert st.rows[4].text == "Төлбөр — Тооцоогоор хаасан Кран хөлсийг тооцоогоор хаав"
    assert not any("777" in r.text for r in st.rows), "цуцлагдсан төлбөр хуулгад орсон"
    assert st.opening == 0, "1.1-ний өмнө юу ч болоогүй"


def test_the_running_balance_is_addable_by_hand(db):
    """Мөр бүрд `үлдэгдэл = өмнөх + нэмэгдсэн − төлсөн`. Отгоо эгч баганаа
    нэмж хасаад ёроолын тоог ГАРГАЖ чадах ёстой — эс бөгөөс цаас нь итгэл
    хүлээхгүй."""
    cl, c = bloom(db)

    st = pdfstatement.build_statement(db, cl, date(2026, 1, 1), date(2026, 5, 25))

    assert [r.balance for r in st.rows] == [
        2_000_000, 2_990_000, 1_490_000, 2_480_000, 2_180_000]
    run = st.opening
    for r in st.rows:
        run = round(run + r.debit - r.credit, 2)
        assert r.balance == run
    assert st.closing == 2_180_000
    # Өнгөрсөн хугацааны хуулга дээр «явагдаж буй цикл» гэж юу ч байхгүй.
    assert st.accrual == 0 and st.total == st.closing


def test_the_period_moves_the_opening_line_not_the_arithmetic(db):
    """4.20-оос эхэлсэн хуулга дээр ӨМНӨХ гурван мөр нь НЭГ тоо болж
    («2026-04-20 өдрийн үлдэгдэл») толгой дээр зогсоно. Ёроолын тоо
    ХӨДӨЛӨХГҮЙ — хугацаа нь ХАРАГДАЦ, тооцоо биш."""
    cl, c = bloom(db)
    whole = pdfstatement.build_statement(db, cl, date(2026, 1, 1), date(2026, 5, 25))

    part = pdfstatement.build_statement(db, cl, date(2026, 4, 20), date(2026, 5, 25))

    assert part.opening == 2_990_000, "4.19 хүртэлх бүх явдал эхний үлдэгдэлд"
    assert [str(r.date) for r in part.rows] == ["2026-04-25", "2026-05-19", "2026-05-20"]
    assert part.rows[0].balance == 1_490_000
    assert part.closing == whole.closing == 2_180_000


def test_a_penalty_charge_is_a_row_but_never_a_number(db):
    """АЛДАНГИ нь авлага БИШ (H2 — хоёр дахь нүүр). Нэхсэн явдал нь мөр болж
    он цагийн дарааллаа эзэлнэ, дүн нь утган дотроо явна, ҮЛДЭГДЭЛ нь
    ХӨДӨЛӨХГҮЙ. Тоон баганад оруулбал цаасны ёроол дэлгэцээсээ салах болно."""
    cl, c = bloom(db)
    billing.charge_contract_penalty(db, c, date(2026, 5, 21), "Ч.Отгонцэцэг")
    db.expire_all()
    cl = db.get(models.Client, cl.id)

    st = pdfstatement.build_statement(db, cl, date(2026, 1, 1), date(2026, 5, 25))

    pen = [r for r in st.rows if r.kind == "penalty"]
    assert len(pen) == 1
    assert pen[0].debit == 0 and pen[0].credit == 0
    assert pen[0].penalty > 0
    assert "авлагын үлдэгдэлд ОРООГҮЙ" in pen[0].text
    assert pen[0].balance == 2_180_000, "алданги үлдэгдлийг хөдөлгөв"
    assert st.closing == 2_180_000
    assert st.penalty_charged == pen[0].penalty


# ---------- 2. ЁРООЛЫН ТОО = ДЭЛГЭЦИЙН ТОО ----------

def test_the_last_number_equals_the_receivable_on_the_screen(db):
    """ЗӨРҮҮГИЙН ДОХИОЛОЛ. Цаасны сүүлийн тоо нь `client_receivable`-ийн НИЙТ
    дүн — өөрөөр хэлбэл харилцагчийн картан дээрх «Авлагын үлдэгдэл». Хоёр
    газар хоёр өөр тоо гарвал шилжилтийн шалтгаан бүхэлдээ унана (H9b).

    Явагдаж буй цикл нь БАРИМТ БОЛООГҮЙ тул хуулгын мөрүүдийн дунд зогсохгүй —
    ёроолд ӨӨРИЙН мөртэй («Нэхэмжлэгдээгүй түрээс»), нийлбэр нь дэлгэцтэй таарна.
    """
    today = date.today()
    c, m, ga, gb = setup_contract(db, start=today - timedelta(days=70))
    cl = db.get(models.Client, c.client_id)
    mv(db, c, "ISSUE", today - timedelta(days=70),
       [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    billing.ensure_invoices(db, c, today)
    p = models.Payment(client_id=cl.id, contract_id=c.id,
                       date=today - timedelta(days=5), amount=400_000, method="CASH")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.expire_all()
    cl = db.get(models.Client, cl.id)

    st = pdfstatement.build_statement(db, cl, today - timedelta(days=90), today)
    screen = billing.client_receivable(cl, today)

    assert st.accrual > 0, "70 хоногийн дараа явагдаж буй цикл заавал байна"
    assert st.closing == pytest.approx(screen["invoiced"], abs=0.5)
    assert st.accrual == pytest.approx(screen["uninvoiced"], abs=0.5)
    assert st.total == pytest.approx(screen["total"], abs=0.5)
    assert st.total == pytest.approx(st.closing + st.accrual, abs=0.5)


def test_a_payment_that_paid_a_penalty_still_balances(db):
    """Алдангид явсан мөнгө нь АВЛАГЫГ бууруулдаггүй тул «Төлсөн» баганад
    орохгүй — гэвч НУУГДАХГҮЙ: мөрийн утган дээр «нийт …₮ — алдангид …₮»
    гэж нэрлэгдэнэ. Ингэснээр багана нэмэгдэж, ёроол нь дэлгэцтэйгээ таарна."""
    cl, c = bloom(db)
    billing.charge_contract_penalty(db, c, date(2026, 5, 21), "Ч.Отгонцэцэг")
    p = models.Payment(client_id=cl.id, contract_id=c.id, date=date(2026, 5, 22),
                       amount=2_500_000, method="BANK")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)
    db.expire_all()
    cl = db.get(models.Client, cl.id)

    st = pdfstatement.build_statement(db, cl, date(2026, 1, 1), date(2026, 5, 25))
    row = next(r for r in st.rows if r.date == date(2026, 5, 22))

    assert row.credit < 2_500_000, "бүх мөнгө авлагад суусангүй (алданги хаагдав)"
    assert "алдангид" in row.text and "нийт" in row.text
    assert st.closing == pytest.approx(
        billing.client_receivable(cl, date(2026, 5, 25))["invoiced"], abs=0.5)


# ---------- 3. ЗУРАГДАНА ----------

def test_render_statement_produces_a_pdf(db):
    """Бодит өгөгдлөөр зурсан хуулга нь PDF болж гарна (кирилл, ₮ тэмдэг нь
    `pdflayout`-ийн глифийн хамгаалалтаар өнгөрнө)."""
    cl, c = bloom(db)
    st = pdfstatement.build_statement(db, cl, date(2026, 1, 1), date(2026, 5, 25))

    out = pdfstatement.render_statement(db, st)

    assert out[:4] == b"%PDF"
    assert len(out) > 1000
    assert pdfstatement._render(st, {"name": "Жигүүр Зам ХХК"}).pages_count >= 1


def test_a_long_statement_spills_onto_a_second_page():
    """60 мөртэй хуулга хоёр дахь хуудас руу ЗӨВ тасарна (баганы толгой нь
    `on_new_page`-ээр дахин зурагдана — түүний баталгаа `test_pdflayout`-д).

    DB хэрэггүй: мөрүүдийг ШУУД байгуулна."""
    rows = [pdfstatement.StatementRow(date=date(2026, 3, 1) + timedelta(days=i),
                                      text=f"Түрээс 2026-03-{i % 28 + 1:02d} · гэрээ №24/{i:02d}",
                                      debit=990_000, balance=990_000 * (i + 1))
            for i in range(60)]
    st = pdfstatement.Statement(client_name="БЛҮҮМ технологи", d_from=date(2026, 3, 1),
                                d_to=date(2026, 5, 25), opening=0.0, rows=rows,
                                closing=rows[-1].balance, accrual=0.0,
                                total=rows[-1].balance)

    pdf = pdfstatement._render(st, {"name": "Жигүүр Зам ХХК"})

    assert pdf.pages_count >= 2
    assert bytes(pdf.output())[:4] == b"%PDF"


# ---------- 4. ХААЛГА ----------

def test_the_route_returns_a_pdf_with_a_clean_filename(client, as_role):
    """Файлын нэрэнд `/` БАЙХГҮЙ: гэрээний дугаар «25/01» хэлбэртэй тул
    огноо/нэр шууд орвол Content-Disposition эвдэрнэ."""
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=100, days_ago=70)

    r = client.get(f"/api/clients/{cl['id']}/statement-pdf", headers=h)

    assert r.status_code == 200, r.text
    assert r.content[:4] == b"%PDF"
    cd = r.headers["content-disposition"]
    name = cd.split('filename="')[1].rstrip('"')
    assert "/" not in name and name.endswith(".pdf")


def test_the_route_accepts_a_period(client, as_role):
    h = as_role("otgoo")
    cl, *_ = mk_contract(client, as_role, qty=100, days_ago=70)

    r = client.get(f"/api/clients/{cl['id']}/statement-pdf"
                   f"?from={iso(40)}&to={iso(0)}", headers=h)

    assert r.status_code == 200, r.text
    assert r.content[:4] == b"%PDF"
    # Урвуу хугацаа — тоо биш, асуулт: 400.
    bad = client.get(f"/api/clients/{cl['id']}/statement-pdf"
                     f"?from={iso(0)}&to={iso(40)}", headers=h)
    assert bad.status_code == 400


def test_finance_may_print_it_but_the_factory_boss_may_not(client, as_role):
    """Мөнгөний баримт — эрхийн зураас `require_roles` дээр хэвээр."""
    cl, *_ = mk_contract(client, as_role, qty=100, days_ago=70)
    path = f"/api/clients/{cl['id']}/statement-pdf"

    assert client.get(path, headers=as_role("sanhuu")).status_code == 200
    denied = client.get(path, headers=as_role("darga"))
    assert denied.status_code == 403
    assert "Энэ үйлдлийг хийх эрх байхгүй" in denied.json()["detail"]


def test_a_missing_client_is_404(client, as_role):
    assert client.get("/api/clients/999999/statement-pdf",
                      headers=as_role("otgoo")).status_code == 404

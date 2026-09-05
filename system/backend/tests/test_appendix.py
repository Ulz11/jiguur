"""Түрээсийн тооцооны хавсралт — харилцагч ЯГ ЮУГ хэдэн хоног барьсныг харуулах хуудас.

`build_appendix` нь DB хүлээж авдаггүй (харилцагчийн нэр гэрээнээс, материал/зэрэглэлийн
нэр gmap/mmap-аас гарна) тул мөрийн логикийг HTTP client-гүйгээр шалгана. Төсөлд PDF-ээс
текст задлах сан суулгаагүй тул зурсан үр дүнг `%PDF` тэмдэг ба хуудасны тоогоор шалгана.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.services import billing, pdfappendix, pdflayout
from tests.test_billing import setup_contract, mv


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def maps(m, ga, gb):
    """Роутерийн `_maps(db)`-ийн тестийн хувилбар: id → харагдах нэр."""
    return {ga.id: "А", gb.id: "В"}, {m.id: "Хэв хашмал 6012"}


def issue_240(db):
    """3.20-нд 240ш гарч, 4.1-нд 30ш буцсан — циклийн дундуур ирсэн буцаалт."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=240)])
    mv(db, c, "RETURN", date(2026, 4, 1), [dict(material_id=m.id, grade_id=ga.id, qty=30,
                                                return_grade_id=gb.id)])
    return c, m, ga, gb


def test_build_appendix_rows_match_the_segments(db):
    """Хавсралтын мөр бүр нэг ЗУРВАС: 240ш×12 хоног, дараа нь 210ш×18 хоног.
    Нэхэмжлэл дээр нэг мөр болж нийлдэг зүйл энд ХАРАГДАХААР задарна — харилцагч
    "яагаад ийм дүн гарав" гэдгээ өөрөө нийлүүлж чадна."""
    c, m, ga, gb = issue_240(db)
    gmap, mmap = maps(m, ga, gb)

    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))

    assert [(r.qty, r.days, r.amount) for r in ap.rows] == [
        (240, 12, 950_400), (210, 18, 1_247_400)]
    assert ap.subtotal == pytest.approx(2_197_800)
    assert all(r.material == "Хэв хашмал 6012" and r.grade == "А" for r in ap.rows)
    assert (ap.rows[0].seg_from, ap.rows[0].seg_to) == (date(2026, 3, 20), date(2026, 4, 1))
    assert (ap.rows[1].seg_from, ap.rows[1].seg_to) == (date(2026, 4, 1), date(2026, 4, 19))
    assert ap.client_name == "БЛҮҮМ технологи"
    assert ap.contract_no == "24/03"
    assert (ap.period_start, ap.period_end) == (date(2026, 3, 20), date(2026, 4, 19))


def test_build_appendix_totals_match_the_generated_invoice(db):
    """ЗӨРҮҮГИЙН ДОХИОЛОЛ. Хавсралт нь `inv.total`-ыг УНШИХГҮЙ, өөрөө ГАРГАНА
    (Σзурвас + төлбөр → НӨАТ → нийт) — `derivable_invoice_specs`-тэй ИЖИЛ
    томьёогоор. Засварлаагүй гэрээн дээр хоёр тоо ЯГ таарах ёстой; энэ тест
    унавал нэхэмжлэл ба хавсралт хоёр салсан гэсэн үг тул тоог "засах" биш,
    аль нь зөв болохыг эхлээд шийднэ."""
    c, m, ga, gb = issue_240(db)
    c.vat_percent = 10
    db.commit()
    gmap, mmap = maps(m, ga, gb)
    billing.ensure_invoices(db, c, date(2026, 4, 19))
    db.refresh(c)
    inv = c.invoices[0]

    ap = pdfappendix.build_appendix(c, gmap, mmap, inv.cycle_start, inv.cycle_end,
                                    due_date=inv.due_date)

    assert ap.subtotal == pytest.approx(2_197_800)
    assert ap.vat == pytest.approx(219_780)
    assert ap.total == pytest.approx(2_417_580)
    assert abs(ap.total - inv.total) < 0.5, "хавсралт нэхэмжлэлээсээ салжээ"
    assert ap.due_date == inv.due_date


def test_build_appendix_includes_repair_and_writeoff_charges(db):
    """Засвар/актын төлбөр нэхэмжлэлийн нийт дүнд ОРДОГ тул хавсралтад ч заавал
    мөр болж гарна — эс бөгөөс Дэд дүн нэхэмжлэлтэйгээ нийлэхгүй."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=240)])
    mv(db, c, "RETURN", date(2026, 4, 1), [dict(material_id=m.id, grade_id=ga.id, qty=30,
                                                return_grade_id=gb.id, repair_qty=2,
                                                repair_fee=30000)])
    gmap, mmap = maps(m, ga, gb)

    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))

    charges = [r for r in ap.rows if r.note]
    assert len(charges) == 1
    assert charges[0].note == "Засвар (2026-04-01)"
    assert charges[0].amount == pytest.approx(30_000)
    assert ap.subtotal == pytest.approx(2_227_800)


def test_build_appendix_is_empty_for_a_window_with_no_movements(db):
    """Гэрээ эхлэхээс ӨМНӨХ цонхонд юу ч тооцогдохгүй — хоосон хавсралт нь
    алдаа биш, зөв хариулт."""
    c, m, ga, gb = issue_240(db)
    gmap, mmap = maps(m, ga, gb)

    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 1, 1), date(2026, 2, 1))

    assert ap.rows == []
    assert ap.subtotal == pytest.approx(0)
    assert ap.total == pytest.approx(0)


def test_row_lines_date_only_the_segments_that_split_the_period(db):
    """Огнооны дэд мөр нь ЗӨВХӨН тасархайн төлөө. Нэг материал 12 ба 18 хоногийн
    ХОЁР мөр болж гарахад харилцагч аль мөр нь аль хугацаа болохыг ялгах аргагүй
    болно — тэр хоёрт л огноо нэмнэ. Цонхоо БҮТНЭЭР эзэлсэн мөрд нэмэхгүй:
    түүний огноо толгой дээрх тооцооны хугацаатай яг давхцана."""
    c, m, ga, gb = issue_240(db)
    gmap, mmap = maps(m, ga, gb)
    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))
    doc = pdflayout.start_doc()

    lines = [pdfappendix._row_lines(doc, r, ap) for r in ap.rows]

    # ШОШГЫН ФОРМАТ (M5/R4): зурвасын дэд мөр ч БАГТААМЖТАЙ — 12 хоногийн
    # зурвас «3.20 – 3.31» гэж уншигдана (урьд нь «3.20 – 4.01» гэж 13 хоног
    # мэт харагддаг байв). Зурвасын ӨГӨГДӨЛ (seg_to) ХЭВЭЭР.
    assert lines[0] == ["Хэв хашмал 6012", "2026-03-20 – 2026-03-31"]
    assert lines[1] == ["Хэв хашмал 6012", "2026-04-01 – 2026-04-18"]
    assert (ap.rows[0].seg_to, ap.rows[1].seg_to) == (date(2026, 4, 1), date(2026, 4, 19))
    # ганц зурвас — дэд мөргүй
    solo = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 1))
    assert [pdfappendix._row_lines(doc, r, solo) for r in solo.rows] == [["Хэв хашмал 6012"]]


def test_the_period_sub_line_is_dropped_when_the_row_covers_the_whole_period(db):
    """ХОЁР МӨР, НЭГ Л ОГНОО. 3.20-нд гарсан падан циклийг БҮТНЭЭР эзэлнэ,
    4.1-нд нэмж гарсан нь зөвхөн сүүлийн 18 хоногийг эзэлнэ.

    Урьд нь дэд мөр нь «энэ бүлэгт хэдэн мөр байна» гэдгээр шийдэгддэг байсан
    тул хоёулаа огноотой гарч, эхнийх нь толгой дээрх тооцооны хугацааг ҮГЧЛЭН
    давтдаг байв. Одоо толгойгоосоо ЗӨРСӨН мөр л огноогоо авч явна."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    mv(db, c, "ISSUE", date(2026, 4, 1), [dict(material_id=m.id, grade_id=ga.id, qty=40)])
    gmap, mmap = maps(m, ga, gb)
    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))
    doc = pdflayout.start_doc()

    assert [(r.qty, r.days) for r in ap.rows] == [(100, 30), (40, 18)]
    assert [pdfappendix._row_lines(doc, r, ap) for r in ap.rows] == [
        ["Хэв хашмал 6012"],
        ["Хэв хашмал 6012", "2026-04-01 – 2026-04-18"]]


# ---------- падан бол дотоод бүртгэл: НЭГ материал — НЭГ мөр ----------

def test_identical_lots_of_one_material_collapse_into_a_single_row(db):
    """ГУРВАН ТАЛБАЙ дээр нэг өдөр гарсан нэг материал НЭГ мөр болно.

    Шилжсэн гэрээн дээр Отгоо эгчийн хуудсан дээр «Хэв хашмал 6012 · 1,079»,
    «… · 10», «… · 736» гэсэн гурван мөр гардаг байв — түүний өөрийнх нь
    дэвтэр дээр НЭГ мөр. Падангийн хуваарь бол манай ДОТООД бүртгэл: тариф,
    хоног, огноо нь ижил байхад цаасан дээр гарах шалтгаангүй."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [
        dict(material_id=m.id, grade_id=ga.id, qty=1079),
        dict(material_id=m.id, grade_id=ga.id, qty=10),
        dict(material_id=m.id, grade_id=ga.id, qty=736)])
    gmap, mmap = maps(m, ga, gb)

    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))

    assert [(r.qty, r.days, r.rate) for r in ap.rows] == [(1825, 30, 330)]
    assert ap.rows[0].amount == pytest.approx(1825 * 330 * 30)
    # ТЭНЦЭЛ: нийлүүлэлт нь зөвхөн ХАРАГДАЦ — хөдөлгүүрийн дүн хэвээр.
    assert ap.subtotal == pytest.approx(
        billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))[0])
    # Цонхоо бүтнээр эзэлсэн ганц мөр — огнооны дэд мөргүй.
    doc = pdflayout.start_doc()
    assert pdfappendix._row_lines(doc, ap.rows[0], ap) == ["Хэв хашмал 6012"]


def test_a_mid_cycle_return_still_splits_the_lot_it_touched(db):
    """Нийлүүлэлт нь ЗУРВАСЫГ ИДЭХГҮЙ. Гурван ижил падангийн ЭХНИЙХЭЭС нь
    циклийн дундуур 825ш буцахад тэр падан ҮНЭХЭЭР хоёр хуваагдана
    (1,079ш×12 хоног → 254ш×18 хоног) ба хоёулаа огноотой хэвлэгдэнэ.
    ХӨНДӨГДӨӨГҮЙ хоёр падан хэвээрээ нэг мөр (746ш×30 хоног), огноогүй —
    түүний хугацаа толгой дээрх тооцооны хугацаа мөн."""
    c, m, ga, gb = setup_contract(db)
    mv(db, c, "ISSUE", date(2026, 3, 20), [
        dict(material_id=m.id, grade_id=ga.id, qty=1079),
        dict(material_id=m.id, grade_id=ga.id, qty=10),
        dict(material_id=m.id, grade_id=ga.id, qty=736)])
    mv(db, c, "RETURN", date(2026, 4, 1), [dict(material_id=m.id, grade_id=ga.id, qty=825,
                                                return_grade_id=ga.id)])
    gmap, mmap = maps(m, ga, gb)

    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))

    assert [(r.qty, r.days) for r in ap.rows] == [(1079, 12), (746, 30), (254, 18)]
    assert ap.subtotal == pytest.approx(
        billing.accrue_rent(c, date(2026, 3, 20), date(2026, 4, 19))[0])
    doc = pdflayout.start_doc()
    assert [pdfappendix._row_lines(doc, r, ap) for r in ap.rows] == [
        ["Хэв хашмал 6012", "2026-03-20 – 2026-03-31"],
        ["Хэв хашмал 6012"],
        ["Хэв хашмал 6012", "2026-04-01 – 2026-04-18"]]


def test_merge_keeps_the_hand_agreed_day_mark_apart(db):
    """ГАР ХОНОГ (H5) нь чимээгүй нийлэхгүй: од нь «хоёр тал тохирсон» гэсэн
    тэмдэг тул тэмдэггүй мөртэй нэг мөр болбол тэр баримт алдагдана."""
    rows = [pdfappendix.AppendixRow(material="Хэв хашмал 6012", grade="А", qty=100,
                                    rate=330, days=30, amount=100 * 330 * 30),
            pdfappendix.AppendixRow(material="Хэв хашмал 6012", grade="А", qty=40,
                                    rate=330, days=30, amount=40 * 330 * 30,
                                    override=True)]

    merged = pdfappendix.merge_rows(rows)

    assert [(r.qty, r.override) for r in merged] == [(100, False), (40, True)]


def test_render_appendix_produces_a_pdf(db):
    """Бодит өгөгдлөөр зурсан хавсралт нь PDF файл болж гарна (кирилл фонт,
    ₮ тэмдэг зэрэг нь `pdflayout`-ийн глифийн хамгаалалтаар өнгөрнө)."""
    c, m, ga, gb = issue_240(db)
    gmap, mmap = maps(m, ga, gb)
    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19),
                                    due_date=date(2026, 4, 19), label="R-24/03-1")

    out = pdfappendix.render_appendix(db, ap)

    assert out[:4] == b"%PDF"
    assert len(out) > 1000


def test_render_appendix_spills_onto_a_second_page():
    """Урт хавсралт хоёр дахь хуудас руу ЗӨВ тасарна.

    ⚠ ШУДАРГА ХЯЗГААР: төсөлд PDF-ээс текст задлах сан суулгаагүй тул энэ тест
    хоёрдугаар хуудсан дээр баганы ТОЛГОЙ дахин зурагдсаныг БАТЛАЖ ЧАДАХГҮЙ —
    зөвхөн хуудас нэмэгдсэнийг шалгана. Толгойн баталгааг
    `tests/test_pdflayout.py::test_ensure_space_redraws_the_table_header_on_the_new_page`
    (`on_new_page` дуудагдсаныг тагнадаг) хариуцна.

    DB хэрэггүй: мөрүүдийг ШУУД байгуулна — зурагчийг тооцооны хөдөлгүүрээс
    салгаж, 80 мөр гаргахын тулд 80 хөдөлгөөн бичих шаардлагагүй болгов."""
    rows = [pdfappendix.AppendixRow(material=f"Хэв хашмал 60{i:02d}", grade="А", qty=100 + i,
                                    rate=330, days=30, amount=(100 + i) * 330 * 30)
            for i in range(80)]
    ap = pdfappendix.Appendix(client_name="БЛҮҮМ технологи", contract_no="24/03",
                              period_start=date(2026, 3, 20), period_end=date(2026, 4, 19),
                              due_date=date(2026, 4, 19), label=None, rows=rows,
                              subtotal=sum(r.amount for r in rows), vat=0.0,
                              total=sum(r.amount for r in rows))

    pdf = pdfappendix._render(ap, {"name": "Жигүүр Зам ХХК"})

    assert pdf.pages_count >= 2
    assert bytes(pdf.output())[:4] == b"%PDF"


def test_render_appendix_draws_a_full_column_grid(db):
    """Хавсралт нь зөвхөн хөндлөн `rule` биш, БҮРЭН нүдний тор зурна: багана
    бүрийн (COL_GRADE, COL_QTY, COL_RATE, COL_DAYS, COL_TOTAL) x-координат дээр
    БОСОО зураас гарах ёстой — pdfgen-ийн `border=1` хүснэгттэй ижил харагдац.
    Урьд нь зөвхөн хөндлөн зураас байсан тул энэ тест улаанаар эхэлнэ."""
    import re
    c, m, ga, gb = issue_240(db)
    gmap, mmap = maps(m, ga, gb)
    ap = pdfappendix.build_appendix(c, gmap, mmap, date(2026, 3, 20), date(2026, 4, 19))

    pdf = pdfappendix._render(ap, {"name": "Жигүүр Зам ХХК"})

    content = b"".join(bytes(p.contents) for p in pdf.pages.values())
    for x in (pdfappendix.COL_GRADE, pdfappendix.COL_QTY, pdfappendix.COL_RATE,
              pdfappendix.COL_DAYS, pdfappendix.COL_TOTAL):
        # Босоо зураас = ижил x-тэй хоёр цэг: "X.00 <ya> m X.00 <yb> l"
        pat = (rf"{x}\.00 [0-9.]+ m {x}\.00 [0-9.]+ l").encode()
        assert re.search(pat, content), f"багана x={x} дээр босоо зураас алга"


def test_cycle_appendix_returns_none_without_a_live_cycle(db):
    """Худалдааны гэрээнд явагдаж буй цикл БАЙХГҮЙ тул хавсралт ч гарахгүй —
    роутер энэ `None`-ыг 400 болгож буцаана (алдаа шидэхийн оронд)."""
    c, m, ga, gb = setup_contract(db, ctype="sale")
    mv(db, c, "ISSUE", date(2026, 3, 20), [dict(material_id=m.id, grade_id=ga.id, qty=100)])
    gmap, mmap = maps(m, ga, gb)

    assert pdfappendix.cycle_appendix_pdf(db, c, gmap, mmap, date(2026, 4, 1)) is None

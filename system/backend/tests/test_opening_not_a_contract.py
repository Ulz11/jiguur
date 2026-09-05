"""ХУУЧИН ҮЛДЭГДЭЛ нь «Идэвхтэй гэрээ» гэсэн тоонд ОРОХГҮЙ.

Excel-ээс шилжсэн үлдэгдэл бүр `OB-{харилцагчийн дугаар}` нэртэй ЗОХИОМОЛ
гэрээ болж сууна — тэр нь хөдөлгүүрийн шийдэл: төлбөр хуваарилах, авлага
тоолох гинж бүхэлдээ гэрээ→нэхэмжлэл гэсэн замаар явдаг.

Гэвч Отгоо эгч ийм гэрээнд гарын үсэг зурж байгаагүй. Харилцагчийн
жагсаалт дээр «Идэвхтэй гэрээ: 2» гэж харвал тэр байхгүй хоёр дахь гэрээг
хайж эхэлнэ — тэр хайлт нь хэзээ ч хариултгүй. Тоо нь ЖИНХЭНЭ гэрээг л
тоолно.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app import models, serializers
from app.services import billing
from app.services import migration as M


def _session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def _real_contract(db, cl, no="24/03"):
    """Жинхэнэ түрээсийн гэрээ — материалгүй ч «идэвхтэй» гэж тоологдоно."""
    c = models.Contract(client_id=cl.id, no=no, type="rent", status="active",
                        start_date=date.today() - timedelta(days=400),
                        cycle_days=30, penalty_percent=0.5)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_opening_balance_is_not_counted_as_active_contract():
    db = _session()
    cl = models.Client(name="Блүүм технологи")
    db.add(cl)
    db.commit()

    _real_contract(db, cl)
    M.create_opening_balance(db, cl, 392_791_500, date.today())
    db.refresh(cl)

    assert len(cl.contracts) == 2, "тестийн суурь буруу — хуучин үлдэгдэл үүсээгүй"
    r = billing.client_receivable(cl, date.today())
    assert r["active_contracts"] == 1, (
        "«Идэвхтэй гэрээ» тоонд хуучин үлдэгдэл орж ирлээ — нэг гэрээтэй "
        "харилцагч жагсаалт дээр 2 гэж харагдана")

    # Жагсаалтын мөр (харилцагчийн хуудас, дашбоардын хуваарь ч эндээс уншина)
    row = serializers.client_row(cl, date.today())
    assert row["active_contracts"] == 1
    # Үлдэгдэл нь ХЭВЭЭР — тоолол өөрчлөгдсөн ч МӨНГӨ алга болоогүй
    assert row["receivable"] == 392_791_500
    db.close()


def test_opening_only_client_shows_zero_contracts():
    """Зөвхөн хуучин үлдэгдэлтэй харилцагч — «0 гэрээ», гэхдээ авлагатай."""
    db = _session()
    cl = models.Client(name="Зулаа")
    db.add(cl)
    db.commit()
    M.create_opening_balance(db, cl, 857_200, date.today())
    db.refresh(cl)

    row = serializers.client_row(cl, date.today())
    assert row["active_contracts"] == 0
    assert row["receivable"] == 857_200
    db.close()


def test_opening_contract_row_is_flagged_opening():
    """Гэрээний мөр өөрөө «opening» гэж ирнэ — дэлгэц үүгээр нэрээ сольдог."""
    db = _session()
    cl = models.Client(name="Бутангууд")
    db.add(cl)
    db.commit()
    real = _real_contract(db, cl, no="25.19")
    M.create_opening_balance(db, cl, 1_000_000, date.today())
    db.refresh(cl)

    states = {serializers.contract_row(c, date.today())["state"] for c in cl.contracts}
    assert "opening" in states
    assert serializers.contract_row(real, date.today())["state"] != "opening"
    db.close()

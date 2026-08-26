"""Seed датаны бүрэн бүтэн байдал — агуулахын үлдэгдэл сөрөг байж болохгүй."""
import os
import tempfile

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app import models
from app.seed import seed


def _seeded_session():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine("sqlite:///" + path, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    seed(s)
    return s, engine, path


def test_seed_leaves_no_negative_stock():
    """Демо seed-ийн дараа аль ч (материал, зэрэглэл)-ийн үлдэгдэл сөрөг байж
    болохгүй. Регресс: 5012 материалын А зэрэглэлийг нөөцлөлгүйгээр 86ш зарж
    байсан тул on_hand = −86 болдог байв."""
    s, engine, path = _seeded_session()
    try:
        mats = {m.id: m.name for m in s.query(models.Material).all()}
        grades = {g.id: g.code for g in s.query(models.Grade).all()}
        bad = [(mats.get(st.material_id, st.material_id), grades.get(st.grade_id, st.grade_id),
                st.on_hand, st.on_rent, st.in_repair, st.written_off)
               for st in s.query(models.Stock).all()
               if min(st.on_hand, st.on_rent, st.in_repair, st.written_off) < 0]
        assert bad == [], f"Сөрөг үлдэгдэлтэй нөөц (материал, зэрэглэл, on_hand, on_rent, in_repair, written_off): {bad}"
    finally:
        s.close()
        engine.dispose()
        os.unlink(path)

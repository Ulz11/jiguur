"""ХАРИЛЦАГЧИЙН ГАРЫН ҮСЭГТНҮҮД — дүрмүүд нэг дор (№72, 73).

Гурван дэлгэц (профайл, «Авлага цуглуулах», холбоо барих карт) НЭГ л
эрэмбийг, НЭГ л хэлбэрийг уншина: эс бөгөөс «хэнд залгах вэ» гэсэн асуулт
дэлгэц бүр дээр өөр хариу авна.
"""
from sqlalchemy.orm import Session

from .. import models


def serialize(c: models.ClientContact) -> dict:
    return {"id": c.id, "client_id": c.client_id, "name": c.name,
            "role": c.role or "", "phone": c.phone or "",
            "phone2": c.phone2 or "", "note": c.note or "",
            "active": bool(c.active)}


def _order(rows: list[models.ClientContact]) -> list[models.ClientContact]:
    """ИДЭВХТЭЙ нь дээрээ, дараа нь бүртгэсэн дарааллаараа.

    Ажлаас гарсан хүн жагсаалтаас АЛГА БОЛОХГҮЙ (устгал байхгүй) — гэвч
    залгах хүнээ хайж буй хүнд тэр саад болох ёсгүй.
    """
    return sorted(rows, key=lambda c: (0 if c.active else 1, c.id))


def contacts_of(db: Session, client_id: int, active_only: bool = False) -> list[dict]:
    q = db.query(models.ClientContact).filter_by(client_id=client_id)
    if active_only:
        q = q.filter(models.ClientContact.active.is_(True))
    return [serialize(c) for c in _order(q.all())]


def detail(c: models.ClientContact) -> str:
    """Аудитын мөрөнд орох тайлбар — «Нярав Н.Соль · 99966285»."""
    parts = [p for p in (c.role, c.name) if p]
    phones = " / ".join(p for p in (c.phone, c.phone2) if p)
    return " ".join(parts) + (f" · {phones}" if phones else "")

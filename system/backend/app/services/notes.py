"""ЗАХЫН ТЭМДЭГЛЭЛ БА ШАР ТУГ — дүрмүүд нэг дор (P1-22 / №111, 112).

`Note` нь ЯМАР Ч объектод наалддаг тул «аль объект бол», «түүний нэр юу вэ»,
«хаашаа аваачих вэ» гэсэн гурван асуулт ЭНД, нэг л удаа хариулагдана. Хуудас
болон дашбоард нь зөвхөн зурна.
"""
from datetime import date, datetime

from sqlalchemy.orm import Session

from .. import models

#: Тэмдэглэл наалдаж болох объектууд. Энэ багц нь ХААЛТТАЙ: танихгүй төрөл
#: ирвэл 400 — «хаашаа ч аваачдаггүй тэмдэглэл» нь тэмдэглэл биш.
ENTITY_TYPES = ("client", "contract", "invoice", "movement", "material")

#: Үйлдвэрийн даргын дэвтэр. «ирээгүй», «хагас ирсэн» гэдгийг ТАЛБАЙ ДЭЭР
#: анзаардаг нь ТЭР — гэрээ ба хөдөлгөөн дээр бичих зам түүнд нээлттэй.
#: Харилцагч · нэхэмжлэл · материал нь мөнгө/каталогийн дэвтэр тул хаалттай.
FACTORY_TYPES = ("contract", "movement")

#: Аудитын мөрөнд орох үг (`audit.value_mn`-тэй нэг эх сурвалж).
ENTITY_MN: dict[str, str] = {
    "client": "харилцагч", "contract": "гэрээ", "invoice": "нэхэмжлэл",
    "movement": "хөдөлгөөн", "material": "материал",
}

_MODEL = {
    "client": models.Client, "contract": models.Contract,
    "invoice": models.Invoice, "movement": models.Movement,
    "material": models.Material,
}

_MV_MN = {"ISSUE": "Ачилт", "RETURN": "Буцаалт",
          "WRITEOFF": "Акт", "SALE": "Худалдаа болгов"}


def entity(db: Session, entity_type: str, entity_id: int):
    """Тэмдэглэл наалдах мөр — байхгүй бол `None` (дуудагч 404 хэлнэ)."""
    model = _MODEL.get(entity_type)
    return db.get(model, entity_id) if model else None


def entity_name(obj, entity_type: str) -> str:
    """Дэлгэц дээр гарах НЭР — «энэ туг ЮУН дээр байна вэ».

    Хөдөлгөөн, нэхэмжлэлд өөрсдийн хуудас байхгүй тул нэр нь гэрээгээ авч
    явна: «Гэрээ №26/07-3 · 2026-07-04 · Буцаалт» гэж уншигдана.
    """
    if obj is None:
        return "—"
    if entity_type == "client":
        return obj.name
    if entity_type == "material":
        return obj.name
    if entity_type == "contract":
        return f"Гэрээ №{obj.no} · {obj.client.name}"
    if entity_type == "invoice":
        return f"Нэхэмжлэл {obj.no}"
    if entity_type == "movement":
        return (f"Гэрээ №{obj.contract.no} · {obj.date} · "
                f"{_MV_MN.get(obj.type, obj.type)}")
    return str(getattr(obj, "name", obj))


def entity_keys(obj, entity_type: str) -> dict:
    """Холбоос угсрах ТҮЛХҮҮРҮҮД — `notificationHref`-ийн журмаар.

    Хөдөлгөөн, нэхэмжлэл нь ГЭРЭЭНИЙ хуудсан дээр амьдардаг тул тэдгээрийн
    туг нь `contract_id`-гаа авч явахгүй бол холбоос нь хоосон буудна.
    """
    keys: dict = {"contract_id": None, "client_id": None}
    if obj is None:
        return keys
    if entity_type == "contract":
        keys["contract_id"] = obj.id
        keys["client_id"] = obj.client_id
    elif entity_type == "client":
        keys["client_id"] = obj.id
    elif entity_type in ("invoice", "movement"):
        keys["contract_id"] = obj.contract_id
        keys["client_id"] = obj.contract.client_id if obj.contract else None
    return keys


def serialize(n: models.Note) -> dict:
    return {"id": n.id, "entity_type": n.entity_type, "entity_id": n.entity_id,
            "date": str(n.date), "text": n.text, "flag": bool(n.flag),
            "author": n.author or "",
            "created_at": str(n.created_at)[:19] if n.created_at else None,
            "voided": n.voided_at is not None,
            "void_reason": n.void_reason or "",
            "voided_by": n.voided_by or ""}


def _order(rows: list[models.Note]) -> list[models.Note]:
    """ХАМГИЙН ШИНЭ нь ДЭЭРЭЭ — тэр сүүлийн шийдвэрээ эхэлж хардаг."""
    return sorted(rows, key=lambda n: (n.date, n.id), reverse=True)


def notes_of(db: Session, entity_type: str, entity_id: int) -> list[dict]:
    """Тухайн объектын БҮХ тэмдэглэл — ХҮЧИНГҮЙ болсон нь ч ХАРАГДАНА (H1)."""
    rows = db.query(models.Note).filter_by(entity_type=entity_type,
                                           entity_id=entity_id).all()
    return [serialize(n) for n in _order(rows)]


def create(db: Session, entity_type: str, entity_id: int, day: date, text: str,
           flag: bool, author: str) -> models.Note:
    n = models.Note(entity_type=entity_type, entity_id=entity_id, date=day,
                    text=text.strip(), flag=bool(flag), author=author,
                    void_reason="", voided_by="")
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def void(db: Session, n: models.Note, reason: str, by: str) -> models.Note:
    """Цуцлалт нь УСТГАЛ БИШ: мөр нь шалтгаантайгаа үлдэж, тугнаас л гарна."""
    n.voided_at = datetime.utcnow()
    n.void_reason = reason
    n.voided_by = by
    db.commit()
    db.refresh(n)
    return n


def flagged(db: Session, limit: int = 40) -> list[dict]:
    """ШАР НҮДНҮҮД НЭГ ДЭЛГЭЦЭН ДЭЭР — дашбоардын «Анхаарах» самбар.

    Отгоо эгч Excel дээрээ шар нүдээ ХУУДАС ХУУДСААР нь хайдаг: арван
    харилцагчийн хуудсыг нээж яваад л «энэ рүү эргэж хар»-аа олдог. Энд
    тэдгээр нь огноогоороо, шинэ нь дээрээ, хаанаас гарсныгаа хэлж зогсоно.
    """
    rows = _order([n for n in db.query(models.Note)
                   .filter(models.Note.flag.is_(True),
                           models.Note.voided_at.is_(None)).all()])
    out: list[dict] = []
    for n in rows[:limit]:
        obj = entity(db, n.entity_type, n.entity_id)
        out.append({**serialize(n),
                    "entity_name": entity_name(obj, n.entity_type),
                    **entity_keys(obj, n.entity_type)})
    return out

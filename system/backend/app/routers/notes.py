"""ЗАХЫН ТЭМДЭГЛЭЛ БА ШАР ТУГ (P1-22) — `Note` давхаргын хаалгууд.

⚠ `PATCH /api/notes/{id}` нь ЭНД БАЙХГҮЙ. Тэр хаяг дээр `routers/features.py`
аль хэдийн суусан (авлагын амлалтын ТӨЛӨВ — `CollectionNote`), тиймээс хоёр
дахь ижил зам бүртгэвэл нэг нь ЧИМЭЭГҮЙ хучигдана. Тэр ганц хаалга нь
биеийнхээ хэлбэрээр («status» ирсэн үү) салаалж, шинэ давхаргынхыг доорх
`patch_entity_note`-д дамжуулна.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models, auth
from ..services import audit as audit_svc
from ..services import notes as notes_svc

router = APIRouter(prefix="/api")


class NoteIn(BaseModel):
    entity_type: str
    entity_id: int
    date: date
    text: str
    flag: bool = False


class NoteVoidIn(BaseModel):
    reason: str = ""


def _require_write(user, entity_type: str) -> None:
    """Бичих эрх. Үйлдвэрийн дарга нь ГЭРЭЭ ба ХӨДӨЛГӨӨН дээр л бичнэ:
    «ирээгүй» гэдгийг талбай дээр анзаардаг нь тэр. Харилцагч · нэхэмжлэл ·
    материал нь мөнгө/каталогийн дэвтэр тул түүнд хаалттай."""
    role = getattr(user, "role", "")
    if role in ("manager", "finance"):
        return
    if role == "factory" and entity_type in notes_svc.FACTORY_TYPES:
        return
    raise HTTPException(403, "Энэ үйлдлийг хийх эрх байхгүй")


def _check_type(entity_type: str) -> None:
    if entity_type not in notes_svc.ENTITY_TYPES:
        raise HTTPException(400, "Тэмдэглэл наалдах объектын төрөл буруу")


def _note_or_404(db: Session, nid: int) -> models.Note:
    n = db.get(models.Note, nid)
    if not n:
        raise HTTPException(404, "Тэмдэглэл олдсонгүй")
    return n


def _detail(db: Session, n: models.Note, tail: str = "") -> str:
    obj = notes_svc.entity(db, n.entity_type, n.entity_id)
    return (f"{notes_svc.ENTITY_MN.get(n.entity_type, n.entity_type)} · "
            f"{notes_svc.entity_name(obj, n.entity_type)} · {n.date} · "
            f"«{n.text}»" + (" ⚑" if n.flag else "") + tail)


@router.get("/notes")
def list_notes(entity_type: str, entity_id: int, db: Session = Depends(get_db),
               user=Depends(auth.current_user)):
    """Тухайн объектын тэмдэглэлүүд — шинэ нь дээрээ, хүчингүй нь ч ХАРАГДАНА.

    Унших нь БҮХ ролид нээлттэй: тэмдэглэл нь мөнгө биш, ХАМТЫН САНАХ ОЙ.
    Дарга «ирээгүй» гэж бичсэнээ дараа өдөр нь дахин уншиж чаддаг байх ёстой.
    """
    _check_type(entity_type)
    return notes_svc.notes_of(db, entity_type, entity_id)


@router.post("/notes")
def add_note_entry(body: NoteIn, db: Session = Depends(get_db),
                   user=Depends(auth.current_user)):
    _check_type(body.entity_type)
    _require_write(user, body.entity_type)
    if not body.text.strip():
        raise HTTPException(400, "Тэмдэглэлийн текст заавал бичигдэнэ")
    if notes_svc.entity(db, body.entity_type, body.entity_id) is None:
        raise HTTPException(404, "Тэмдэглэл наалдах мөр олдсонгүй")
    n = notes_svc.create(db, body.entity_type, body.entity_id, body.date,
                         body.text, body.flag, getattr(user, "name", "") or "")
    audit_svc.log(db, user, "create", "note", n.id, _detail(db, n))
    return notes_svc.serialize(n)


def patch_entity_note(nid: int, text: str | None, flag: bool | None,
                      day: date | None, db: Session, user) -> dict:
    """`PATCH /api/notes/{id}`-ийн ШИНЭ салаа (features.py-аас дуудагдана)."""
    n = _note_or_404(db, nid)
    _require_write(user, n.entity_type)
    if n.voided_at is not None:
        raise HTTPException(409, "Хүчингүй болсон тэмдэглэл засагдахгүй")
    # Туг нь True/False биш ҮГЭЭР бүртгэгдэнэ («анхаарах ⚑» / «энгийн»)
    before = {"text": n.text, "flag": audit_svc.FLAG_MN[bool(n.flag)], "date": n.date}
    if text is not None:
        if not text.strip():
            raise HTTPException(400, "Тэмдэглэлийн текст заавал бичигдэнэ")
        n.text = text.strip()
    if flag is not None:
        n.flag = bool(flag)
    if day is not None:
        n.date = day
    db.commit()
    db.refresh(n)
    after = {"text": n.text, "flag": audit_svc.FLAG_MN[bool(n.flag)], "date": n.date}
    audit_svc.log(db, user, "update", "note", n.id,
                  _detail(db, n, " — " + (audit_svc.changes_text(before, after)
                                          or "өөрчлөлтгүй")))
    return notes_svc.serialize(n)


@router.post("/notes/{nid}/void")
def void_note(nid: int, body: NoteVoidIn, db: Session = Depends(get_db),
              user=Depends(auth.current_user)):
    n = _note_or_404(db, nid)
    _require_write(user, n.entity_type)
    if n.voided_at is not None:
        raise HTTPException(409, "Энэ тэмдэглэл аль хэдийн хүчингүй болсон байна")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Цуцлах шалтгаан заавал бичигдэнэ")
    notes_svc.void(db, n, reason, getattr(user, "name", "") or "")
    audit_svc.log(db, user, "void", "note", n.id,
                  _detail(db, n, f" — ХҮЧИНГҮЙ: {reason}"))
    return notes_svc.serialize(n)

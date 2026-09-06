"""Файл хавсралт — гэрээ, харилцагч, төлбөр дээр.

⚠ Файл нь САНД сууна (`Attachment.data`), диск дээр БИШ. Хуучин
`backend/uploads/` хавтас нь нэг компьютерын дэлхийд ажилладаг байв;
serverless дээр диск нь хүсэлт бүрийн дараа арчигддаг тул тэнд хадгалсан
зураг маргааш нь БАЙХГҮЙ болно. Нэг сан → нэг нөөц → нэг үнэн.

Хуучин мөрүүд (`data IS NULL`, `path` бөглөгдсөн) дискнээсээ уншигдсаар
байна — шилжилтийн үед нэг ч хавсралт «олдсонгүй» болохгүй.
"""
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models, serializers, auth

router = APIRouter(prefix="/api")
ALLOWED_ENTITIES = {"contract", "client", "payment"}
#: Vercel-ийн хүсэлт/хариултын биеийн дээд хэмжээ нь 4.5MB — 4MB нь түүний
#: дотор тухтай сууна (base64 биш, түүхий байт). Хуучин 25MB нь диск дээр
#: боломжтой байсан ч сүлжээгээр ХЭЗЭЭ Ч гарч чадахгүй байв.
MAX_SIZE = 4 * 1024 * 1024
MAX_SIZE_MSG = "Файл 4MB-ээс их байна — Vercel-ийн хязгаар"
# Зөвшөөрөгдсөн өргөтгөлүүд — .exe гэх мэт гүйцэтгэх файл хориотой
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic",
               ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".zip"}


# ⚠ /files/dl/... нь /files/{entity_type}/{entity_id}-ээс ӨМНӨ тодорхойлогдоно,
# эс бөгөөс "dl"-ийг entity_type гэж уншаад файл татах ажиллахгүй.
@router.get("/files/dl/{fid}")
def download(fid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    a = db.get(models.Attachment, fid)
    if not a:
        raise HTTPException(404, "Файл олдсонгүй")
    if a.data is not None:
        return Response(content=a.data,
                        media_type=a.mime or "application/octet-stream",
                        headers={"Content-Disposition":
                                 f'attachment; filename="{_ascii_name(a.filename)}"'})
    # Хуучин мөр — диск дээрх файл
    if a.path and os.path.exists(a.path):
        return FileResponse(a.path, filename=a.filename)
    raise HTTPException(404, "Файл олдсонгүй")


def _ascii_name(name: str) -> str:
    """Content-Disposition-д зөвхөн latin-1 багтана — кирилл нэрийг хамгаална."""
    try:
        name.encode("latin-1")
        return name.replace('"', "")
    except UnicodeEncodeError:
        return "file" + os.path.splitext(name)[1]


@router.post("/files/{entity_type}/{entity_id}")
async def upload(entity_type: str, entity_id: int, file: UploadFile,
                 db: Session = Depends(get_db), user=Depends(auth.current_user)):
    if entity_type not in ALLOWED_ENTITIES:
        raise HTTPException(400, "Буруу төрөл")
    name_in = os.path.basename(file.filename or "file")
    ext = os.path.splitext(name_in)[1].lower()[:10]
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"«{ext or '?'}» өргөтгөлтэй файл зөвшөөрөгдөхгүй. "
                                 "PDF, зураг, Word, Excel файл хавсаргана уу.")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(400, MAX_SIZE_MSG)
    if not data:
        raise HTTPException(400, "Файл хоосон байна")
    a = models.Attachment(entity_type=entity_type, entity_id=entity_id,
                          filename=name_in, path=None, data=data,
                          mime=file.content_type or "application/octet-stream",
                          size=len(data))
    db.add(a)
    db.commit()
    return serializers.attachment(a)


@router.get("/files/{entity_type}/{entity_id}")
def list_files(entity_type: str, entity_id: int, db: Session = Depends(get_db),
               user=Depends(auth.current_user)):
    if entity_type not in ALLOWED_ENTITIES:
        raise HTTPException(404, "Олдсонгүй")
    # ⚠ `data` баганыг ТАТАХГҮЙ: жагсаалт нь 20 файлын БҮХ байтыг санах ойд
    # оруулах ёсгүй (Vercel-ийн 1024MB-ийн дотор 20 × 4MB нь аюултай ойр).
    rows = (db.query(models.Attachment)
            .filter_by(entity_type=entity_type, entity_id=entity_id)
            .order_by(models.Attachment.id).all())
    return [serializers.attachment(a) for a in rows]


@router.delete("/files/{fid}")
def delete_file(fid: int, db: Session = Depends(get_db),
                user=Depends(auth.require_roles("manager", "finance"))):
    a = db.get(models.Attachment, fid)
    if not a:
        raise HTTPException(404, "Олдсонгүй")
    if a.path:                       # хуучин мөр — дискнээс ч арилгана
        try:
            os.unlink(a.path)
        except OSError:
            pass
    db.delete(a)
    db.commit()
    return {"ok": True}

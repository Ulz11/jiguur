"""Файл хавсралт — гэрээ, харилцагч, төлбөр дээр."""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..db import get_db, BASE_DIR
from .. import models, serializers, auth

router = APIRouter(prefix="/api")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_ENTITIES = {"contract", "client", "payment"}
MAX_SIZE = 25 * 1024 * 1024
# Зөвшөөрөгдсөн өргөтгөлүүд — .exe гэх мэт гүйцэтгэх файл хориотой
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic",
               ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".zip"}


# ⚠ /files/dl/... нь /files/{entity_type}/{entity_id}-ээс ӨМНӨ тодорхойлогдоно,
# эс бөгөөс "dl"-ийг entity_type гэж уншаад файл татах ажиллахгүй.
@router.get("/files/dl/{fid}")
def download(fid: int, db: Session = Depends(get_db), user=Depends(auth.current_user)):
    a = db.get(models.Attachment, fid)
    if not a or not os.path.exists(a.path):
        raise HTTPException(404, "Файл олдсонгүй")
    return FileResponse(a.path, filename=a.filename)


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
        raise HTTPException(400, "Файл 25MB-ээс их байна")
    if not data:
        raise HTTPException(400, "Файл хоосон байна")
    path = os.path.join(UPLOAD_DIR, uuid.uuid4().hex + ext)
    with open(path, "wb") as f:
        f.write(data)
    a = models.Attachment(entity_type=entity_type, entity_id=entity_id,
                          filename=name_in, path=path, size=len(data))
    db.add(a)
    db.commit()
    return serializers.attachment(a)


@router.get("/files/{entity_type}/{entity_id}")
def list_files(entity_type: str, entity_id: int, db: Session = Depends(get_db),
               user=Depends(auth.current_user)):
    if entity_type not in ALLOWED_ENTITIES:
        raise HTTPException(404, "Олдсонгүй")
    rows = db.query(models.Attachment).filter_by(entity_type=entity_type,
                                                 entity_id=entity_id).all()
    return [serializers.attachment(a) for a in rows]


@router.delete("/files/{fid}")
def delete_file(fid: int, db: Session = Depends(get_db),
                user=Depends(auth.require_roles("manager", "finance"))):
    a = db.get(models.Attachment, fid)
    if not a:
        raise HTTPException(404, "Олдсонгүй")
    try:
        os.unlink(a.path)
    except OSError:
        pass
    db.delete(a)
    db.commit()
    return {"ok": True}

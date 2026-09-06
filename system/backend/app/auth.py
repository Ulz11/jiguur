"""Хөнгөн auth: PBKDF2 нууц үг + HMAC-signed token (гадны dependency-гүй).

Мөн СЕССИЙН цэгүүд өөрсдөө энд сууна (`router`): нэвтрэх · би хэн бэ ·
сунгах · гарах. Тэдгээр нь нэг л ойлголтын дөрвөн тал тул нэг файлд —
токен зурдаг, шалгадаг код нь тэднээс хэдэн зуун мөрийн цаана байх учиргүй.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .db import get_db
from . import models
from .services.audit import log as audit_log


def is_production() -> bool:
    """Vercel (эсвэл ил зарласан prod) дээр ажиллаж байна уу."""
    return bool(os.environ.get("VERCEL")) or \
        os.environ.get("JIGUUR_ENV", "").strip().lower() == "prod"


def _load_secret() -> str:
    """JIGUUR_SECRET env байвал түүнийг; үгүй бол backend/.secret файлд
    санамсаргүй түлхүүр үүсгэж хадгална (сервер дахин асахад токен хүчинтэй хэвээр).

    ⚠ PROD дээр (Vercel) файлын нөөц зам БАЙХГҮЙ: serverless FS нь түр
    зуурынх — процесс бүр өөр өөр түлхүүр үүсгэж, нэвтэрсэн хүн дараагийн
    хүсэлт дээрээ хаягдана. Бүр дор нь: хуучин `jiguur-fallback-secret` гэсэн
    ТОГТМОЛ мөр рүү унавал ХЭН Ч токен зурж чадна. Тиймээс prod дээр
    JIGUUR_SECRET нь ЗААВАЛ — байхгүй бол ажиллахаас татгалзана.
    """
    env = os.environ.get("JIGUUR_SECRET")
    if env:
        return env
    if is_production():
        raise RuntimeError(
            "JIGUUR_SECRET тохируулаагүй байна. Vercel дээр (эсвэл JIGUUR_ENV=prod) "
            "энэ нь ЗААВАЛ шаардлагатай: токен гарын үсгийн түлхүүр. "
            "Vercel → Settings → Environment Variables дотор JIGUUR_SECRET нэмнэ үү "
            "(ж: python -c \"import os;print(os.urandom(32).hex())\").")
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, ".secret")
    try:
        if os.path.exists(path):
            with open(path) as f:
                val = f.read().strip()
                if val:
                    return val
        val = os.urandom(32).hex()
        with open(path, "w") as f:
            f.write(val)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        return val
    except OSError:
        return "jiguur-fallback-secret"


#: Түлхүүрийг ЭХНИЙ ХЭРЭГЛЭЭ дээр уншина — импорт нь файл ч бичихгүй,
#: унах ч үгүй (Vercel-ийн build алхам JIGUUR_SECRET-гүй байж болно).
_SECRET_CACHE: str | None = None


def secret() -> str:
    global _SECRET_CACHE
    if _SECRET_CACHE is None:
        _SECRET_CACHE = _load_secret()
    return _SECRET_CACHE


def reset_secret_cache() -> None:
    """Тест env сольсны дараа дуудна."""
    global _SECRET_CACHE
    _SECRET_CACHE = None


TOKEN_TTL = 60 * 60 * 12  # 12 цаг
#: Токеныг хэдэн секунд ашигласны дараа СУНГАХ вэ. 12 цаг гэдэг нь ажлын
#: өдрөөс богино: Отгоо эгч 09:00-д нэвтрээд 21:00-д тайлангаа хэвлэж
#: байхад дундуур нь гардаг байв. Одоо дэлгэц 1 цаг тутам чимээгүй сунгана.
REFRESH_AFTER = 60 * 60  # 1 цаг
#: Үйлдвэрийн анхны нууц үг (`app/seed.py`) — солиогүй бол сануулна.
SEED_PASSWORD = "1234"


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 100_000)
    return salt.hex() + ":" + dk.hex()


def verify_password(pw: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split(":")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt_hex), 100_000)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def _sign(data: bytes) -> str:
    return hmac.new(secret().encode(), data, hashlib.sha256).hexdigest()


def create_token(user: models.User) -> str:
    payload = {"uid": user.id, "role": user.role, "name": user.name, "exp": int(time.time()) + TOKEN_TTL}
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    return raw + "." + _sign(raw.encode())


def decode_token(token: str) -> dict:
    try:
        raw, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(sig, _sign(raw.encode())):
            raise ValueError("bad sig")
        payload = json.loads(base64.urlsafe_b64decode(raw))
        if payload["exp"] < time.time():
            raise ValueError("expired")
        return payload
    except Exception:
        raise HTTPException(401, "Нэвтрэлт хүчингүй байна — дахин нэвтэрнэ үү")


def current_token(authorization: str = Header(default="")) -> dict:
    """Толгойн Bearer токеныг задалж БУЦААНА (`exp` нь дэлгэцэд хэрэгтэй)."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Нэвтрээгүй байна")
    return decode_token(authorization[7:])


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> models.User:
    payload = current_token(authorization)
    user = db.get(models.User, payload["uid"])
    if not user:
        raise HTTPException(401, "Хэрэглэгч олдсонгүй")
    return user


def rotate_token(user: models.User) -> str:
    """ШИНЭ 12 цагийн токен. Нууц үг солих (`routers/core.py`) зэрэг хуучин
    токеныг хүчингүй болгомоор газруудад дуудна — тэнд шинэ токен буцаавал
    хэрэглэгч дундаас нь унахгүй."""
    return create_token(user)


def expires_at(payload: dict) -> str:
    """Токен ХЭЗЭЭ дуусахыг ISO цагаар — дэлгэц «45 минут үлдлээ» гэж чадна."""
    return datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc).isoformat()


def is_seed_password(user: models.User) -> bool:
    """Нууц үг нь ҮЙЛДВЭРИЙН АНХНЫХ хэвээр юу («1234»).

    Гурван хэрэглэгч бүгд ижил, бүгдэд нь мэдэгддэг нууц үгтэй суусаар байвал
    /audit-ийн «Хэн» багана утгагүй: хэн ч хэний ч нэрээр орж болно. Дэлгэц
    үүнийг мэдэж байж л сануулга харуулж чадна.
    """
    return verify_password(SEED_PASSWORD, user.password_hash)


#: Ролийн МОНГОЛ нэр — 403-ын мөр дээр гарна.
ROLE_MN = {"manager": "менежер", "finance": "санхүү", "factory": "үйлдвэрийн дарга"}

#: Татгалзлын мөрийн ЭХЛЭЛ — хуучин текст ХЭВЭЭР (дэлгэц, тест үүгээр таньдаг).
DENIED = "Энэ үйлдлийг хийх эрх байхгүй"


def roles_text(roles) -> str:
    """('manager', 'finance') → 'менежер, санхүү'. Танихгүй роль ӨӨРӨӨРӨӨ."""
    return ", ".join(ROLE_MN.get(r, r) for r in roles)


def denied(*roles) -> HTTPException:
    """ТАТГАЛЗЛЫН МӨР — ГАНЦ газраас.

    `require_roles`-оор хийгдээгүй, ГАРААР шалгадаг хаалгууд (тэмдэглэл,
    механизмын мөр, буцаалтын засвар — тэдгээрийн эрх нь ролиос гадна
    объектоос хамаардаг) урьд нь `HTTPException(403, "Энэ үйлдлийг хийх эрх
    байхгүй")` гэж бичдэг байв: ЯГ ижил өгүүлбэр, гэхдээ «тэгвэл хэн хийх вэ?»
    гэсэн хариугүй. Одоо бүгд энэ нэг хаалганаас гарна.
    """
    return HTTPException(403, f"{DENIED} — зөвхөн {roles_text(roles)}")


def require_roles(*roles):
    """Рольын хаалт. Татгалзал нь ХЭН хийж болохыг НЭРЛЭНЭ.

    «Энэ үйлдлийг хийх эрх байхгүй» гэдэг нь Отгоо эгчид асуулт үлдээдэг:
    «тэгвэл хэн хийх вэ?» Тэр асуултын хариу нь дэлгэцэн дээр байхгүй бол
    хүн утас руу гүйнэ. Мөрийн ЭХЛЭЛ хуучин хэвээр — уншигч нь ижил өгүүлбэр
    хайж олно, зөвхөн төгсгөлд нь нэр нэмэгдэв.
    """
    def dep(user: models.User = Depends(current_user)) -> models.User:
        if user.role not in roles:
            raise denied(*roles)
        return user
    return dep


# ---------------------------------------------------------------------------
# СЕССИЙН ЦЭГҮҮД
#
# ⚠ КООРДИНАЦ: `routers/core.py` дотор `POST /api/auth/login` ба
# `GET /api/auth/me` хоёр ХЭВЭЭР байгаа. Энэ router нь main.py дээр
# core-оос ӨМНӨ бүртгэгддэг тул ЭДГЭЭР нь хүчинтэй (FastAPI эхний
# таарсан замаа сонгоно) — core дахь хоёр функц одоо ХҮРЭХГҮЙ КОД.
# Нөгөө агент тэр хоёрыг устгах хүртэл давхардал үлдэнэ; `change-password`
# нь тэнд ХЭВЭЭР үлдэх ба хэрэгтэй бол `auth.rotate_token(user)`-оор шинэ
# токен буцааж болно.
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api")


class LoginIn(BaseModel):
    username: str
    password: str


def _user_out(user: models.User) -> dict:
    return {"id": user.id, "name": user.name, "role": user.role,
            "username": user.username}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(username=body.username.strip().lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Нэвтрэх нэр эсвэл нууц үг буруу байна")
    token = create_token(user)
    # НЭВТРЭЛТ нь /audit-ийн ЭХНИЙ мөр: «энэ өдөр систем дээр хэн байсан бэ»
    # гэдэг асуултын хариу. Урьд нь огт бичигддэггүй байсан тул бүртгэл нь
    # зөвхөн ӨӨРЧЛӨЛТӨӨС эхэлдэг — хэн орсныг мэдэх арга байхгүй байв.
    audit_log(db, user, "login", "session", user.id,
              f"{user.name} · {ROLE_MN.get(user.role, user.role)} · Нэвтрэв")
    return {"token": token, "user": _user_out(user),
            "expires_at": expires_at(decode_token(token)),
            "must_change_password": is_seed_password(user)}


@router.get("/auth/me")
def me(user: models.User = Depends(current_user),
       payload: dict = Depends(current_token)):
    """Би хэн бэ + СЕССИ хэр удаан амьд + нууц үгээ солих ёстой юу."""
    return {**_user_out(user),
            "token_expires_at": expires_at(payload),
            "must_change_password": is_seed_password(user)}


@router.post("/auth/refresh")
def refresh(user: models.User = Depends(current_user),
            payload: dict = Depends(current_token)):
    """ГУЛСДАГ ХУГАЦАА: хүчинтэй боловч 1 цагаас дээш насласан токеныг
    шинэ 12 цагийн токеноор солино.

    Хэрэглэж байгаа хүн дундуур нь гарах ёсгүй; хэрэглээгүй сесси нь 12
    цагийн дараа өөрөө унтарна. 1 цагийн хаалт нь хүсэлт бүрд шинэ токен
    зурахаас сэргийлнэ (дэлгэц үүнийг давтамжтай дууддаг).
    """
    age = TOKEN_TTL - (int(payload["exp"]) - int(time.time()))
    if age < REFRESH_AFTER:
        return {"token": None, "refreshed": False,
                "token_expires_at": expires_at(payload)}
    token = rotate_token(user)
    return {"token": token, "refreshed": True,
            "token_expires_at": expires_at(decode_token(token))}


@router.post("/auth/logout")
def logout(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Гарлаа. Токен нь ГАРЫН ҮСЭГТЭЙ тул сервер талд «цуцлагдахгүй» —
    дэлгэц түүнийгээ хаяна. Бидний хийх зүйл нь МӨРӨӨ үлдээх: /audit дээр
    «хэн хэдэн цагт гарав» гэдэг нь нэвтрэлттэй ижил үнэ цэнэтэй."""
    audit_log(db, user, "logout", "session", user.id,
              f"{user.name} · {ROLE_MN.get(user.role, user.role)} · Гарав")
    return {"ok": True}

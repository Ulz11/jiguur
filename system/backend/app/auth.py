"""Хөнгөн auth: PBKDF2 нууц үг + HMAC-signed token (гадны dependency-гүй)."""
import base64
import hashlib
import hmac
import json
import os
import time
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from .db import get_db
from . import models

def _load_secret() -> str:
    """JIGUUR_SECRET env байвал түүнийг; үгүй бол backend/.secret файлд
    санамсаргүй түлхүүр үүсгэж хадгална (сервер дахин асахад токен хүчинтэй хэвээр)."""
    env = os.environ.get("JIGUUR_SECRET")
    if env:
        return env
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


SECRET = _load_secret()
TOKEN_TTL = 60 * 60 * 12  # 12 цаг


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
    return hmac.new(SECRET.encode(), data, hashlib.sha256).hexdigest()


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


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> models.User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Нэвтрээгүй байна")
    payload = decode_token(authorization[7:])
    user = db.get(models.User, payload["uid"])
    if not user:
        raise HTTPException(401, "Хэрэглэгч олдсонгүй")
    return user


def require_roles(*roles):
    def dep(user: models.User = Depends(current_user)) -> models.User:
        if user.role not in roles:
            raise HTTPException(403, "Энэ үйлдлийг хийх эрх байхгүй")
        return user
    return dep

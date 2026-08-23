"""Audit log — хэн, юуг, хэзээ өөрчилснийг бүртгэнэ."""
from sqlalchemy.orm import Session
from .. import models


def log(db: Session, user, action: str, entity: str, entity_id=None, detail: str = ""):
    """Аудит бичилт нэмнэ. Гол урсгалыг хэзээ ч тасалдуулахгүй."""
    try:
        db.add(models.AuditLog(
            user_id=getattr(user, "id", None),
            user_name=getattr(user, "name", "") or "",
            action=action, entity=entity, entity_id=entity_id,
            detail=detail[:1000]))
        db.commit()
    except Exception as e:  # noqa: BLE001
        print("[audit] бичиж чадсангүй:", e)


def changes_text(before: dict, after: dict) -> str:
    """{'penalty_percent': 0.5} → 'penalty_percent: 0.5 → 0.7' гэсэн текст."""
    parts = []
    for k, new in after.items():
        old = before.get(k)
        if old != new:
            parts.append(f"{k}: {old} → {new}")
    return " · ".join(parts)

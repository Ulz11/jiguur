"""Audit log — хэн, юуг, хэзээ өөрчилснийг бүртгэнэ."""
from sqlalchemy.orm import Session
from .. import models


class _SystemActor:
    """Хүнгүй гүйдэг замын «хэн» — `services/cron.py`.

    ⚠ Өмнө нь cron нь `user=None` дамжуулдаг байсан: `user_name` хоосон мөр
    болж, /audit дээр «—» гэж зурагддаг байв. Отгоо эгчийн хувьд «—» гэдэг нь
    хариулт БИШ, асуулт: «энэ нэхэмжлэлийг ХЭН үүсгэсэн юм бэ?» Тэр асуулт нь
    түүнийг дэвтэр рүүгээ буцаадаг. Хүн биш бол ХҮН БИШ гэж хэлнэ.

    `id` нь None хэвээр — `user_id` гадны түлхүүр тул хуурамч мөр заахгүй.
    """
    id = None
    name = "Систем"


#: Cron/автомат зам энэ биетээр гарын үсэг зурна (`audit.SYSTEM`).
SYSTEM = _SystemActor()


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


# ---------------------------------------------------------------------------
# /audit-ийн «Дэлгэрэнгүй» багана нь ОТГОО ЭГЧИЙН НҮД.
#
# Тэнд урьд нь DB-ийн түүхий утга шууд бичигддэг байв: «RETURN 8ш (pending)»,
# «penalty_percent: 0.5 → 0.7», «харилцагч #4: call · залгав». Тэр мөрүүд нь
# түүний хувьд алдаа биш, ХООСОН НҮД — юу болсныг тааж чадахгүй тул бүхэл
# бүртгэлийг уншихаа болино. Хоёр толь нь тэр гоожилтыг НЭГ газраас хаана.
# ---------------------------------------------------------------------------

#: ENUM/төлөвийн утга → түүний үг. Эх сурвалж нь ХУУДСУУД өөрсдөө:
#: `lib/movement.ts` MOVEMENT_NAMES · `ui.tsx` StatePill · `payments.METHOD_MN` ·
#: `Collections.tsx` KINDS. Нэг ойлголт — нэг үг (UI-ЗАРЧИМ §3).
VALUES_MN: dict[str, str] = {
    # хөдөлгөөний төрөл
    "ISSUE": "ачилт", "RETURN": "буцаалт", "WRITEOFF": "акт", "SALE": "худалдаа болгов",
    # хөдөлгөөний төлөв
    "pending": "хүлээгдэж буй", "done": "хийгдсэн",
    # төлбөрийн/зарлагын хэлбэр
    "CASH": "бэлэн", "BANK": "данс", "BARTER": "бартер", "INTERNAL": "дотоод",
    # авлагын тэмдэглэлийн төрөл
    "call": "утсаар", "visit": "уулзсан", "message": "мессеж", "other": "бусад",
    # амлалтын төлөв
    "open": "нээлттэй", "kept": "амлалтаа биелүүлсэн", "broken": "амлалт зөрчсөн",
    # гэрээний төрөл ба циклийн хэлбэр
    "rent": "түрээс", "sale": "худалдаа",
    "days": "хоногоор", "month": "календарь сараар",
    # барьцааны дэвтрийн явдал (H8) — `services/deposit.py` KIND_MN-тэй нэг үг
    "lodge": "байршуулав", "topup": "нэмж байршуулав",
    "apply": "авлагад суутгав", "return": "буцаав",
    # харилцагчийн ТҮРЭЭС БИШ бичилт (H11) — `services/entries.py` KIND_MN
    "advance": "олгосон зээл", "service": "үйлчилгээ",
    "transfer": "шилжүүлэг", "adjustment": "залруулга",
    # бичилтээс төрсөн кредит төлбөр
    "CREDIT": "бичилтийн кредит",
}

#: Захын тэмдэглэлийн ШАР ТУГ (P1-22). ⚠ `VALUES_MN`-д ОРУУЛАХГҮЙ: Python-д
#: `True == 1` тул тэнд тавибал машины `active: 1` гэсэн мөр «анхаарах ⚑»
#: гэж уншигдана. Туг нь ӨӨРИЙН толиор явна.
FLAG_MN: dict[bool, str] = {True: "анхаарах ⚑", False: "энгийн"}

#: DB-ийн талбарын нэр → түүний үг (`changes_text` дээр).
FIELDS_MN: dict[str, str] = {
    # захын тэмдэглэл (P1-22)
    "text": "тэмдэглэл", "flag": "анхаарах тэмдэг",
    # гэрээ
    "penalty_percent": "алдангийн хувь", "deposit": "барьцаа",
    "vat_percent": "НӨАТ-ын хувь", "note": "тэмдэглэл",
    "start_date": "эхлэх огноо", "end_date": "дуусах огноо",
    "cycle_days": "циклийн хоног", "cycle_mode": "циклийн хэлбэр",
    # хөдөлгөөн ба түүний мөр
    "date": "огноо", "qty": "тоо", "rate": "тариф",
    "return_grade_id": "буцаж ирсэн зэрэглэл", "repair_qty": "засварын тоо",
    "writeoff_qty": "актын тоо", "issue_line_id": "холбогдсон падан",
    "billed_days_override": "гар хоног", "days_confirmed": "хоногийг баталсан",
    # механизм ба түүний бичилт
    "name": "нэр", "active": "идэвхтэй эсэх", "label": "ажлын нэр",
    "client": "харилцагч", "amount": "дүн", "method": "хэлбэр",
}


def value_mn(v) -> str:
    """Түүхий утгыг түүний үгээр. Танихгүй бол ӨӨРӨӨРӨӨ (хоосон нүд үлдэхгүй)."""
    return VALUES_MN.get(v, "—" if v is None or v == "" else str(v))


def field_mn(k: str) -> str:
    """Талбарын нэрийг түүний үгээр. Танихгүй бол ӨӨРӨӨРӨӨ."""
    return FIELDS_MN.get(k, k)


def changes_text(before: dict, after: dict) -> str:
    """{'penalty_percent': 0.5} → 'алдангийн хувь: 0.5 → 0.7' гэсэн текст.

    Талбарын нэр БА утга хоёул орчуулагдана: «cycle_mode: days → month» нь
    «циклийн хэлбэр: хоногоор → календарь сараар» болно.
    """
    parts = []
    for k, new in after.items():
        old = before.get(k)
        if old != new:
            parts.append(f"{field_mn(k)}: {value_mn(old)} → {value_mn(new)}")
    return " · ".join(parts)

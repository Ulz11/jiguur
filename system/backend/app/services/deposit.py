"""БАРЬЦААНЫ ГҮЙДЭГ ДЭВТЭР (Чадварын харьцуулалт H8 · P1-11).

Отгоо эгчийн хуудсан дээр барьцаа нь НЭГ НҮД биш, ГИНЖ:

    Зулаа-3!G30 = «=20000000-8265000+3000000+3000000+10000000» = 27,735,000₮

Тэр гинжний гишүүн бүр нь ШИЙДВЭР: байршуулав · суутгав · нэмж байршуулав.
`Contract.deposit` гэсэн ганц float нь тэднээс зөвхөн ҮР ДҮНГ барьдаг байв —
«аль нь буцаагдсан, аль нь суутгагдсан» гэдэг алга болох тул гэрээний хаалт
нь ХУДАЛ болно.

Мөн барьцааны нүдэнд «байршуулаагүй» гэж БИЧИГДСЭН хуудас бий
(Бутангууд-7!G72, ӨнөОрд-8!G58…). Тэр нь 0 БИШ — ЯВДАЛ ОГТ БОЛООГҮЙ (№55).
Дэвтэр нь тэр ялгааг өөрөө зөөнө: явдалгүй гэрээний төлөв `none`.

ЭХ СУРВАЛЖ нэг: `deposit_events`. `Contract.deposit` / `deposit_applied` /
`deposit_returned` / `deposit_status` нь бичилт бүрийн дараа ДАХИН бодогдох
КЭШ (`recompute`) — тиймээс өнөөдрийн бүх уншигч (serializers, PDF, дашбоард,
хаалтын wizard) ЯГ хэвээрээ ажиллана. Хоёр дахь эх сурвалж ҮҮСЭХГҮЙ (H9).
"""
from datetime import date, datetime

from sqlalchemy.orm import Session

from .. import models
from . import billing

#: Дэвтрийн дөрвөн үйл явдал.
KINDS = ("lodge", "topup", "apply", "return")
#: Барьцааг ӨСГӨДӨГ / БУУРУУЛДАГ явдлууд.
ADD_KINDS = ("lodge", "topup")
SUB_KINDS = ("apply", "return")

KIND_MN = {"lodge": "Байршуулав", "topup": "Нэмж байршуулав",
           "apply": "Авлагад суутгав", "return": "Буцаав"}

#: Хүчингүй болсон явдлыг ХАСАХ ганц шүүлтүүр (`billing.LIVE_PAYMENT`-ийн ах дүү).
LIVE_EVENT = models.DepositEvent.voided_at.is_(None)

NOT_LODGED = "Энэ гэрээнд барьцаа байршуулаагүй байна — эхлээд «Байршуулах» бичилт хийнэ"
TOO_MUCH = "Барьцааны үлдэгдлээс их байна (үлдэгдэл {0:,.0f}₮)"


def event_active(ev: models.DepositEvent) -> bool:
    return getattr(ev, "voided_at", None) is None


def live_events(contract: models.Contract) -> list[models.DepositEvent]:
    """Тоологдох явдлууд, ОГНООНЫ дарааллаар (гинжний уншигдах дараалал)."""
    return sorted((e for e in contract.deposit_events if event_active(e)),
                  key=lambda e: (e.date, e.id))


def all_events(contract: models.Contract) -> list[models.DepositEvent]:
    """Дэвтэр БҮХЭЛДЭЭ — хүчингүй болсон мөр ч ХАРАГДСААР үлдэнэ (H1)."""
    return sorted(contract.deposit_events, key=lambda e: (e.date, e.id))


def signed(ev: models.DepositEvent) -> float:
    return ev.amount if ev.kind in ADD_KINDS else -ev.amount


def totals(contract: models.Contract) -> dict:
    """Дэвтрийн нийлбэрүүд — ЭНЭ бол барьцааны цорын ганц тодорхойлолт."""
    rows = live_events(contract)
    lodged = sum(e.amount for e in rows if e.kind in ADD_KINDS)
    applied = sum(e.amount for e in rows if e.kind == "apply")
    returned = sum(e.amount for e in rows if e.kind == "return")
    balance = round(lodged - applied - returned, 2)
    if not rows:
        status, settled_date = "none", None
    elif balance > 0.005:
        status, settled_date = "held", None
    else:
        status = "settled"
        subs = [e for e in rows if e.kind in SUB_KINDS]
        settled_date = subs[-1].date if subs else rows[-1].date
    return {"balance": balance, "lodged": round(lodged, 2), "applied": round(applied, 2),
            "returned": round(returned, 2), "status": status,
            "settled_date": settled_date}


def balance(contract: models.Contract) -> float:
    return totals(contract)["balance"]


def recompute(db: Session, contract: models.Contract) -> dict:
    """Кэш баганууд дэвтэртэйгээ дахин тэнцэнэ. Бичилт бүрийн ДАРАА дуудагдана."""
    t = totals(contract)
    contract.deposit = t["balance"]
    contract.deposit_applied = t["applied"]
    contract.deposit_returned = t["returned"]
    contract.deposit_status = t["status"]
    contract.deposit_settled_date = t["settled_date"]
    db.commit()
    return t


# ---------- бичилт ----------

def _synthetic_payment(db: Session, contract: models.Contract, day: date,
                       amount: float) -> models.Payment:
    """Суутгал нь ЖИНХЭНЭ төлбөрийн бичилт болно — `settle-deposit`-тэй ЯГ ижил.

    ⚠ АЛДАНГИ ЭНД НЭХЭГДЭХГҮЙ (H2): барьцааны тооцоо нь МӨНГӨ хөдөлгөх үйлдэл,
    алданги нэхэх ШИЙДВЭР биш. `principal_only=True` — «6 сая суутгав» гэвэл
    авлага ЯГ 6 саяар буурна.
    """
    p = models.Payment(client_id=contract.client_id, contract_id=contract.id, date=day,
                       amount=amount, method="BANK",
                       note=f"Барьцаанаас суутгав (гэрээ №{contract.no})")
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p, principal_only=True)
    return p


def add_event(db: Session, contract: models.Contract, kind: str, day: date,
              amount: float, note: str = "", user_name: str = "") -> models.DepositEvent:
    """Дэвтэрт нэг мөр нэмээд кэшийг дахин бодно. Алдааг `ValueError`-оор хэлнэ."""
    if kind not in KINDS:
        raise ValueError("Барьцааны бичилтийн төрөл буруу")
    if amount is None or amount <= 0:
        raise ValueError("Дүн 0-ээс их байх ёстой")
    amount = round(float(amount), 2)
    have = balance(contract)
    if kind == "topup" and not live_events(contract):
        raise ValueError(NOT_LODGED)
    if kind in SUB_KINDS:
        if not live_events(contract):
            raise ValueError(NOT_LODGED)
        if amount > have + 0.01:
            raise ValueError(TOO_MUCH.format(have))
    ev = models.DepositEvent(contract_id=contract.id, date=day, kind=kind, amount=amount,
                             note=note or "", user_name=user_name or "")
    db.add(ev)
    db.commit()
    if kind == "apply":
        ev.payment_id = _synthetic_payment(db, contract, day, amount).id
        db.commit()
    db.refresh(contract)
    recompute(db, contract)
    return ev


def void_event(db: Session, ev: models.DepositEvent, reason: str,
               user_name: str = "") -> dict:
    """Явдлыг ХҮЧИНГҮЙ болгоно — мөрийг нь УСТГАХГҮЙ (H1).

    `apply` бол түүний төрүүлсэн төлбөр НЭГЭН ЗЭРЭГ, өнөөдрийн `void_payment`
    замаараа цуцлагдана: хуваарилалт суларч, авлага яг тэр дүнгээр буцаж ирнэ.
    """
    released: list[dict] = []
    if ev.payment_id:
        p = db.get(models.Payment, ev.payment_id)
        if p is not None and p.voided_at is None:
            released = billing.void_payment(
                db, p, f"Барьцааны суутгал хүчингүй болов: {reason}", user_name)
    ev.voided_at = datetime.utcnow()
    ev.void_reason = reason
    ev.voided_by = user_name or ""
    db.commit()
    contract = ev.contract or db.get(models.Contract, ev.contract_id)
    db.refresh(contract)
    t = recompute(db, contract)
    return {"released": released, **t}


def set_lodged(db: Session, contract: models.Contract, amount: float,
               user_name: str = "") -> models.DepositEvent | None:
    """Гэрээн дээр БИЧСЭН барьцааг дэвтэрт буулгана (гэрээ үүсгэх, дарж засах).

    Дэвтэр нь ХООСОН (эсвэл зөвхөн нэг автомат байршуулалттай) үед энэ нь
    тэр байршуулалтыг л зурна. Дэвтэрт ЖИНХЭНЭ түүх бичигдсэн бол (нэмэлт,
    суутгал, буцаалт) дүнг ШУУД засах нь тэр түүхийг ЧИМЭЭГҮЙ худал болгоно —
    тиймээс татгалзаж, бичилтээр өөрчлүүлнэ.
    """
    rows = live_events(contract)
    amount = round(float(amount or 0), 2)
    if len(rows) > 1 or (rows and rows[0].kind != "lodge"):
        raise ValueError("Барьцааны дэвтэрт бичилт хийгдсэн — дүнг «Нэмэх / Суутгах / "
                         "Буцаах» бичилтээр өөрчилнө")
    if rows:
        ev = rows[0]
        if amount <= 0:
            ev.voided_at = datetime.utcnow()
            ev.void_reason = "Барьцаа 0 болгов"
            ev.voided_by = user_name or ""
            db.commit()
            recompute(db, contract)
            return None
        ev.amount = amount
        db.commit()
        recompute(db, contract)
        return ev
    if amount <= 0:
        recompute(db, contract)
        return None
    return add_event(db, contract, "lodge", contract.start_date, amount,
                     note="Гэрээнд бичсэн барьцаа", user_name=user_name)


# ---------- харагдац ----------

def serialize(ev: models.DepositEvent, balance_after: float | None = None) -> dict:
    return {"id": ev.id, "contract_id": ev.contract_id, "date": str(ev.date),
            "kind": ev.kind, "kind_mn": KIND_MN.get(ev.kind, ev.kind),
            "amount": ev.amount, "note": ev.note or "",
            "payment_id": ev.payment_id, "user_name": ev.user_name or "",
            "balance_after": balance_after,
            "voided": ev.voided_at is not None,
            "void_reason": ev.void_reason or "", "voided_by": ev.voided_by or "",
            "voided_at": str(ev.voided_at)[:19] if ev.voided_at else None}


def ledger(contract: models.Contract) -> dict:
    """Дэвтэр + нийлбэрүүд — GET, гэрээний дэлгэрэнгүй ХОЁУЛАА эндээс уншина.

    Мөр бүр ӨӨРИЙНХӨӨ дараах үлдэгдлийг авч явна: Отгоо гинжээ уншихдаа
    «энэ бичилтийн дараа хэд үлдсэн бэ» гэдгийг нүдээрээ дагадаг.
    """
    run = 0.0
    rows = []
    for ev in all_events(contract):
        if event_active(ev):
            run = round(run + signed(ev), 2)
            rows.append(serialize(ev, run))
        else:
            rows.append(serialize(ev, None))
    t = totals(contract)
    return {"events": rows, "balance": t["balance"], "lodged": t["lodged"],
            "applied": t["applied"], "returned": t["returned"], "status": t["status"],
            "settled_date": str(t["settled_date"]) if t["settled_date"] else None}

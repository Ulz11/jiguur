"""ХАРИЛЦАГЧИЙН ДАНСАН ДЭЭРХ, ТҮРЭЭС БИШ БИЧИЛТ (Чадварын харьцуулалт H11 · P1-16).

Отгоо эгчийн хуудсууд дээр харилцагчийн данс нь зөвхөн түрээсийнх БИШ:

  · `Бутан-Өнөорд!C23` «2025 онд Бутангууд ХХК-д бэлэн мөнгө зээлсэн нийт
    дүн» G23 = 164,492,000₮ — ОЛГОСОН зээл (`Loan` нь ӨГЛӨГ, эсрэг тал);
  · `C28` «Бутангууд констракшн ххк-ын ажилчдын цалинд» G28 = 2,800,000₮;
  · `АшидДонж-11!L30` «Авто кран түрээс» 10,000,000₮/сар — самбарын сарын
    нүд нь `«=65472000+10000000»` (түрээс + кран);
  · WB3!R24 = 139,648,000₮ — Бутангууд ↔ Өнө Ордын хоорондын тооцоо. Хуудсыг
    Өнө Ордын талаас Жигүүр Замын ӨӨРИЙН захирлууд гарын үсэг зурсан тул энэ
    нь хоёр талт шилжүүлэг БИШ, Бутангуудын данс дээрх ХОЛБООТОЙ ТАЛЫН ДЕБИТ.

ЭДГЭЭР НЬ ШИНЭ ҮЛДЭГДЛИЙН ЭХ СУРВАЛЖ БИШ (H9 «нэг факт, нэг тоо»). Бичилт
бүр АВЛАГЫН ХУУЧИН ЗАМААР материалчлагдана:

    amount > 0  →  дансны гэрээн (`OB-{client_id}`) дээр `A-{client_id}-{n}`
                   нэхэмжлэл (цикл нь нэг өдөр, алданги 0);
    amount < 0  →  `CREDIT` төлбөр — хамгийн хуучин нэхэмжлэлээс эхэлж
                   жирийн журмаараа хуваарилагдана.

Дансны гэрээ нь ЗОРИУДААР `OB-` угтвартай: `rebuild_contract_invoices` тэнд
ХЭЗЭЭ Ч хүрдэггүй, `derivable_invoice_specs` түүнд юу ч гаргадаггүй тул
гараар үүсгэсэн эдгээр нэхэмжлэл дахин бодолтоор арчигдахгүй.
"""
import json
import re
from datetime import date, datetime

from sqlalchemy.orm import Session

from .. import models
from . import billing
from .migration import account_contract

#: Дөрвөн төрөл — Отгоогийн үгээр.
KINDS = ("advance", "service", "transfer", "adjustment")
KIND_MN = {"advance": "Олгосон зээл", "service": "Үйлчилгээ",
           "transfer": "Шилжүүлэг", "adjustment": "Залруулга"}

#: Хүчингүй болсон бичилтийг ХАСАХ ганц шүүлтүүр.
LIVE_ENTRY = models.ClientEntry.voided_at.is_(None)

LABEL_REQUIRED = ("Шошго заавал бичигдэнэ — «164,492,000₮» гэсэн тоо дангаараа "
                  "ямар ч асуултад хариулдаггүй")
ZERO = "Дүн 0 байж болохгүй"
BAD_KIND = "Бичилтийн төрөл буруу"

_NO_RE = re.compile(r"^A-(\d+)-(\d+)$")


def entry_active(e: models.ClientEntry) -> bool:
    return getattr(e, "voided_at", None) is None


def next_invoice_no(db: Session, contract: models.Contract, client_id: int) -> str:
    """`A-{client_id}-{n}` — дараагийн ЧӨЛӨӨТ дугаар.

    ХАМГИЙН ИХ дугаараас цааш явна (тоолуураас БИШ): цуцлагдсан мөр
    жагсаалтад үлддэг тул тоолол нь мөргөлдөнө («хүчингүй болсон нэхэмжлэлийн
    дугаар дахин ашиглагдав» гэдэг нь баримтын түүхийг эвдэнэ).
    """
    top = 0
    for (no,) in db.query(models.Invoice.no).filter(
            models.Invoice.contract_id == contract.id).all():
        m = _NO_RE.match(no or "")
        if m and int(m.group(1)) == client_id:
            top = max(top, int(m.group(2)))
    return f"A-{client_id}-{top + 1}"


def create_entry(db: Session, client: models.Client, day: date, amount: float,
                 kind: str, label: str, note: str = "", ref: str = "",
                 user_name: str = "") -> models.ClientEntry:
    """Бичилт + түүний материалчлал. Алдааг `ValueError`-оор хэлнэ."""
    if kind not in KINDS:
        raise ValueError(BAD_KIND)
    label = (label or "").strip()
    if not label:
        raise ValueError(LABEL_REQUIRED)
    amount = round(float(amount or 0), 2)
    if abs(amount) < 0.005:
        raise ValueError(ZERO)

    e = models.ClientEntry(client_id=client.id, date=day, amount=amount, kind=kind,
                           label=label, note=note or "", ref=ref or "",
                           user_name=user_name or "")
    db.add(e)
    db.commit()

    if amount > 0:
        _debit(db, client, e, day)
    else:
        _credit(db, client, e, day)
    return e


def _debit(db: Session, client: models.Client, e: models.ClientEntry, day: date) -> None:
    """Дебит → дансны гэрээн дээр нэхэмжлэл.

    ⚠ Гэрээний ТҮГЖЭЭ (`contract_invoice_lock`) ЗААВАЛ: нэхэмжлэл үүсгэдэг
    БҮХ зам түүнийг барина, эс бөгөөс зэрэгцээ `ensure_invoices` ба энэ
    бичилт хоёр нэг агшинд дугаар уншиж, ижил дугаартай хоёр мөр төрнө.
    """
    c = account_contract(db, client, day)
    db.commit()
    with billing.contract_invoice_lock(c.id):
        inv = models.Invoice(
            contract_id=c.id, no=next_invoice_no(db, c, client.id),
            cycle_start=day, cycle_end=day, due_date=day,
            rent_amount=e.amount, charge_amount=0, vat_amount=0, total=e.amount,
            client_entry_id=e.id,
            # Баримт нь «юуны төлөө» гэдгээ ӨӨРТӨӨ авч явна — PDF, дэлгэц
            # хоёул эндээс уншина (OB-нэхэмжлэлийн `{"note": …}`-ийн ах дүү).
            detail_json=json.dumps({"note": e.label, "kind": e.kind,
                                    "kind_mn": KIND_MN[e.kind], "label": e.label,
                                    "ref": e.ref, "entry_note": e.note},
                                   ensure_ascii=False))
        db.add(inv)
        db.commit()
    # Урьдчилж төлсөн мөнгө байвал шинэ нэхэмжлэлд ӨӨРӨӨ суух ёстой —
    # `ensure_invoices`-тэй ЯГ ижил зан төлөв.
    billing.apply_client_credit(db, client.id)


def _credit(db: Session, client: models.Client, e: models.ClientEntry, day: date) -> None:
    """Кредит → төлбөр. Хуваарилалт нь ЖИРИЙН журмаараа (хамгийн хуучнаас).

    `contract_id` нь ХООСОН: кредит нь харилцагчийн БҮХ нэхэмжлэлд хамаарна
    (дансны гэрээнд түгжвэл түрээсийн өр нь хаагдахгүй үлдэнэ).
    """
    p = models.Payment(client_id=client.id, contract_id=None, date=day,
                       amount=abs(e.amount), method="CREDIT", note=e.label,
                       client_entry_id=e.id)
    db.add(p)
    db.commit()
    billing.allocate_payment(db, p)


def void_entry(db: Session, e: models.ClientEntry, reason: str,
               user_name: str = "") -> dict:
    """Бичлэгийг ХҮЧИНГҮЙ болгоно — тэгш хэмтэй: төрсөн баримт нь ч хамт.

    Дебит бол нэхэмжлэл нь ХҮЧИНГҮЙ тэмдэгтэй үлдэж (устахгүй, H1) авлагаас
    гарна; кредит бол төлбөр нь өнөөдрийн `void_payment` замаараа цуцлагдана.
    """
    released: list[dict] = []
    inv = (db.query(models.Invoice).filter_by(client_entry_id=e.id)
           .filter(billing.LIVE_INVOICE).first())
    if inv is not None:
        released = billing.void_invoice(
            db, inv, f"Харилцагчийн бичилт хүчингүй болов: {reason}", user_name)
    p = (db.query(models.Payment).filter_by(client_entry_id=e.id)
         .filter(billing.LIVE_PAYMENT).first())
    if p is not None:
        released = billing.void_payment(
            db, p, f"Харилцагчийн бичилт хүчингүй болов: {reason}", user_name)
    e.voided_at = datetime.utcnow()
    e.void_reason = reason
    e.voided_by = user_name or ""
    db.commit()
    return {"released": released}


# ---------- харагдац ----------

def _doc(db: Session, e: models.ClientEntry) -> tuple[str | None, int | None, int | None]:
    """Бичилтийн төрүүлсэн баримт: (нэхэмжлэлийн №, нэхэмжлэлийн id, төлбөрийн id)."""
    inv = db.query(models.Invoice).filter_by(client_entry_id=e.id).first()
    p = db.query(models.Payment).filter_by(client_entry_id=e.id).first()
    return (inv.no if inv else None, inv.id if inv else None, p.id if p else None)


def serialize(db: Session, e: models.ClientEntry) -> dict:
    no, inv_id, pay_id = _doc(db, e)
    return {"id": e.id, "client_id": e.client_id, "date": str(e.date),
            "amount": e.amount, "kind": e.kind, "kind_mn": KIND_MN.get(e.kind, e.kind),
            "label": e.label, "note": e.note or "", "ref": e.ref or "",
            "user_name": e.user_name or "",
            "invoice_no": no, "invoice_id": inv_id, "payment_id": pay_id,
            "voided": e.voided_at is not None,
            "void_reason": e.void_reason or "", "voided_by": e.voided_by or "",
            "voided_at": str(e.voided_at)[:19] if e.voided_at else None}


def entries_of(db: Session, client_id: int) -> list[dict]:
    """Харилцагчийн бүх бичилт — ХҮЧИНГҮЙ болсон нь ч ХАРАГДАНА (H1)."""
    rows = (db.query(models.ClientEntry).filter_by(client_id=client_id)
            .order_by(models.ClientEntry.date.desc(), models.ClientEntry.id.desc()).all())
    return [serialize(db, e) for e in rows]

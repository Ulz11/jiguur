"""Жигүүр Зам — дата модель.

Гэрээ бол системийн зүрх: хөдөлгөөн (Movement) бүр нэг л удаа бүртгэгдэж,
нөөц, түрээсийн тооцоо, нэхэмжлэл, авлага бүгд үүнээс урсана.
"""
from datetime import date, datetime
from sqlalchemy import (String, Integer, Float, Date, DateTime, ForeignKey,
                        Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


# ---------- Хэрэглэгч ----------
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))  # manager | factory | finance


# ---------- Каталог ----------
class Grade(Base):
    """Зэрэглэл — динамик: менежер нэмж/өөрчилж болно (шинэ, А, В, С...)."""
    __tablename__ = "grades"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(50))
    sort: Mapped[int] = mapped_column(Integer, default=0)


class Material(Base):
    __tablename__ = "materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))          # ж: Хэв хашмал 6012
    category: Mapped[str] = mapped_column(String(50))       # Хэв / Тулаас / Труба / Механизм
    code: Mapped[str] = mapped_column(String(30), default="")
    unit: Mapped[str] = mapped_column(String(10), default="ш")
    base_rate: Mapped[float] = mapped_column(Float, default=0)   # суурь тариф ₮/ш/хоног
    repair_fee: Mapped[float] = mapped_column(Float, default=0)  # засварын фикс үнэ ₮/ш
    active: Mapped[int] = mapped_column(Integer, default=1)

    prices: Mapped[list["MaterialGradePrice"]] = relationship(back_populates="material")


class MaterialGradePrice(Base):
    """Зэрэглэл бүрийн НБҮнэ болон худалдах үнэ."""
    __tablename__ = "material_grade_prices"
    __table_args__ = (UniqueConstraint("material_id", "grade_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    grade_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    nb_price: Mapped[float] = mapped_column(Float, default=0)    # НБҮнэ (актын үнэ)
    sale_price: Mapped[float] = mapped_column(Float, default=0)  # худалдах үнэ

    material: Mapped["Material"] = relationship(back_populates="prices")
    grade: Mapped["Grade"] = relationship()


class Stock(Base):
    """Амьд үлдэгдэл — материал+зэрэглэл бүрээр."""
    __tablename__ = "stocks"
    __table_args__ = (UniqueConstraint("material_id", "grade_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    grade_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    on_hand: Mapped[float] = mapped_column(Float, default=0)     # агуулахад
    on_rent: Mapped[float] = mapped_column(Float, default=0)     # түрээсэнд
    in_repair: Mapped[float] = mapped_column(Float, default=0)   # засварт
    written_off: Mapped[float] = mapped_column(Float, default=0) # акталсан

    material: Mapped["Material"] = relationship()
    grade: Mapped["Grade"] = relationship()


# ---------- Харилцагч ----------
class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    reg: Mapped[str] = mapped_column(String(20), default="")
    person: Mapped[str] = mapped_column(String(100), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    contracts: Mapped[list["Contract"]] = relationship(back_populates="client")


# ---------- Гэрээ ----------
class Contract(Base):
    __tablename__ = "contracts"
    id: Mapped[int] = mapped_column(primary_key=True)
    no: Mapped[str] = mapped_column(String(30), unique=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    type: Mapped[str] = mapped_column(String(10))            # rent | sale
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cycle_days: Mapped[int] = mapped_column(Integer, default=30)
    # Тооцооны мөчлөгийн ХЭЛБЭР: "days" (анхны — cycle_days хоногт зангидсан)
    # эсвэл "month" (КАЛЕНДАРЬ САР: зангилаа нь эхлэх огнооны ӨДӨР, хоног нь
    # тухайн сарын жинхэнэ урт тул 31 хоногтой сар ×31/30 нэхэгдэнэ — R5/H3).
    # "month" үед `cycle_days` тооцоонд ОГТ оролцохгүй.
    cycle_mode: Mapped[str] = mapped_column(String(10), default="days")
    # %/хоног. Анхны утга 0 — алданги нь Отгоогийн ХӨШҮҮРЭГ, машины автомат
    # төлбөр биш (R25 / H2). Зэвсэглэх нь гэрээ бүрд ГАРААР хийгдэх шийдвэр.
    penalty_percent: Mapped[float] = mapped_column(Float, default=0)
    deposit: Mapped[float] = mapped_column(Float, default=0)
    # Барьцааны мөчлөг: held → returned / applied / settled (хэсэгчлэн хоёулаа)
    deposit_status: Mapped[str] = mapped_column(String(12), default="held")
    deposit_returned: Mapped[float] = mapped_column(Float, default=0)
    deposit_applied: Mapped[float] = mapped_column(Float, default=0)
    deposit_settled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    vat_percent: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(15), default="active")  # active | closed
    # ХААСАН ӨДӨР (H7). `status="closed"` дангаараа тоолуурыг зогсоодоггүй байв:
    # эцсийн ТАСАРХАЙ цикл хэзээ ч нэхэмжлэл болдоггүй, хаалт нь Отгоогийн
    # зан үйлийг (эцсийн тооцоо → барьцаа → хаав) дагадаггүй байсан. Огноо нь
    # эцсийн цонхны ТӨГСГӨЛИЙГ тодорхойлно: [циклийн эхлэл, closed_date + 1).
    # NULL (хуучин хаагдсан гэрээ) бол зан төлөв ЯГ ХЭВЭЭР — stub төрөхгүй.
    closed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped["Client"] = relationship(back_populates="contracts")
    items: Mapped[list["ContractItem"]] = relationship(back_populates="contract")
    movements: Mapped[list["Movement"]] = relationship(back_populates="contract")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="contract")
    # Чөлөөт актын бичилтүүд (R12 / H4) — циклд эвхэгдэж нэхэмжлэл болно
    akt_entries: Mapped[list["AktEntry"]] = relationship(back_populates="contract")
    # Тарифын дахин тохиролт (R3 / H6) — «шинэ тариф ДАРААГИЙН ЦИКЛЭЭС»
    rate_changes: Mapped[list["RateChange"]] = relationship(back_populates="contract")


class ContractItem(Base):
    """Гэрээний мөр — тухайн материал+зэрэглэлийн тохирсон тариф/үнэ."""
    __tablename__ = "contract_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    grade_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    daily_rate: Mapped[float] = mapped_column(Float, default=0)   # түрээс ₮/ш/хоног
    unit_price: Mapped[float] = mapped_column(Float, default=0)   # худалдааны нэгж үнэ

    contract: Mapped["Contract"] = relationship(back_populates="items")
    material: Mapped["Material"] = relationship()
    grade: Mapped["Grade"] = relationship()


class Movement(Base):
    """Бараа хөдөлгөөн: ISSUE (ачилт/нэмэлт), RETURN (буцаалт), WRITEOFF (акт),
    SALE (ХУДАЛДАА БОЛГОВ — гадаа байсан бараа буцаж ирэлгүй зарагдав, H7).

    ISSUE нь ПАДАН төрүүлдэг, бусад ГУРАВ нь падангаас ХАСДАГ. SALE нь
    бүтцээрээ WRITEOFF-тэй ах дүү (гадаа байхдаа паркаас гарна) ч үнийн
    суурь нь `sale_price` (актынх нь `nb_price`) бөгөөс УТГА нь өөр.
    """
    __tablename__ = "movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    type: Mapped[str] = mapped_column(String(12))  # ISSUE | RETURN | WRITEOFF | SALE
    date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="done")  # pending | done (ачилт дарга баталгаажуулна)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # ---- ХҮЧИНГҮЙ (void) — «буруу гэрээнд олгосон падан хэзээ ч зогсохгүй» ----
    # Төлбөртэй ЯГ ижил журам: мөр устахгүй, зөвхөн тооцооноос гарна. Нөөцийн
    # толин тусгал нь `unapply_movement_stock`-оор ЯГ буцаагдаж, нэхэмжлэгдсэн
    # цонхонд байсан бол дахин бодолтын хаалгаар (RebuildModal) дамжина.
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_by: Mapped[str] = mapped_column(String(100), default="")

    contract: Mapped["Contract"] = relationship(back_populates="movements")
    lines: Mapped[list["MovementLine"]] = relationship(back_populates="movement")


class MovementLine(Base):
    __tablename__ = "movement_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    movement_id: Mapped[int] = mapped_column(ForeignKey("movements.id"))
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    grade_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))          # гарсан зэрэглэл
    qty: Mapped[float] = mapped_column(Float)
    # Падан (lot) загвар: олголт бүр өөрийн тарифаа мөнхөд хадгална. NULL бол
    # гэрээний мөрийн (ContractItem) тариф руу унана — хуучин мөрүүдийн зан төлөв.
    rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Буцаалт/акт аль паданг хаасныг ЗААЖ өгч болно; NULL бол FIFO-гоор өөрөө олно.
    issue_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("movement_lines.id"), nullable=True)
    return_grade_id: Mapped[int | None] = mapped_column(ForeignKey("grades.id"), nullable=True)  # буцаж ирэхдээ ямар зэрэглэл болсон (дарга тогтооно)
    # ГАР ХОНОГ (H5/R8): хоёр тал хавсралт дээр ГАРЫН ҮСЭГ зурсан хоног. NULL бол
    # машины тоо (авто). Тоо нь мөнгө биш — тухайн буцаалт хаасан ПАДАНГИЙН
    # хоногийг тэр буцаалт буусан ЦИКЛ дотор л орлуулна (`billing._lot_segments`).
    billed_days_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # ЭНЭ ТООГ ТЭР ХАРААД БАТАЛСАН (H5-ийн сүүлчийн миль). `billed_days_override`
    # нь «бичигдсэн тоо»; энэ нь «ЭЗЭН нь тэр тоог, хоёр тоог зэрэг харсныхаа
    # дараа сонгосон» гэсэн ТАМГА. Тамгатай мөрийн хоногийг хөдөлгүүр ХЭЗЭЭ Ч
    # хумихгүй (`billing._lot_segments`, `return_attribution`) — `override_cap`
    # нь тэр мөрд ЗӨВЛӨХ болно: тоог нь боддог, зөрүүг нь хэлдэг, ГЭХДЭЭ дардаггүй.
    # Тамгагүй мөр өнөөдрийнхөөрөө: бичих агшинд шалгагдаж, хумилт нь тор хэвээр.
    # 0/1 (Boolean БИШ: энэ загварт логик утга бүр бүхэл тоо, миграторын
    # `DEFAULT 0` нь хуучин мөрүүдийг «баталгаажаагүй» гэж зөв дүүргэнэ).
    days_confirmed: Mapped[int] = mapped_column(Integer, default=0)
    repair_qty: Mapped[float] = mapped_column(Float, default=0)     # засварт орсон тоо
    repair_fee: Mapped[float] = mapped_column(Float, default=0)     # клиентэд тооцох засварын дүн
    writeoff_qty: Mapped[float] = mapped_column(Float, default=0)   # акталсан тоо
    writeoff_fee: Mapped[float] = mapped_column(Float, default=0)   # актын дүн (НБҮнээр)
    # ХУДАЛДАА БОЛГОВ (H7): SALE хөдөлгөөний мөрийн дүн — qty × ХУДАЛДАХ ҮНЭ.
    # `writeoff_fee`-г дахин ашиглаагүй нь санаатай: тэр багана «НБҮнээр» гэж
    # нэрлэгдсэн бөгөөс тайлан, PDF, дэлгэц гурвуулаа түүнийг АКТ гэж уншдаг.
    # Худалдааг тэнд хийвэл дүн нь актын халаас руу чимээгүй орно.
    # `sale_qty` БАЙХГҮЙ: SALE мөрийн БҮХ тоо зарагдсан (WRITEOFF-той ижил
    # журам) — дэд тоо нь зөвхөн буцаалтын мөрөнд утгатай.
    sale_fee: Mapped[float] = mapped_column(Float, default=0)       # худалдааны дүн (худалдах үнээр)

    movement: Mapped["Movement"] = relationship(back_populates="lines")
    material: Mapped["Material"] = relationship(foreign_keys=[material_id])
    grade: Mapped["Grade"] = relationship(foreign_keys=[grade_id])


# ---------- Санхүү ----------
class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    no: Mapped[str] = mapped_column(String(30))
    cycle_start: Mapped[date] = mapped_column(Date)
    cycle_end: Mapped[date] = mapped_column(Date)      # цикл [start, end) — end = дараагийн эхлэл
    due_date: Mapped[date] = mapped_column(Date)
    rent_amount: Mapped[float] = mapped_column(Float, default=0)
    charge_amount: Mapped[float] = mapped_column(Float, default=0)  # засвар + акт
    vat_amount: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    paid: Mapped[float] = mapped_column(Float, default=0)
    # Алданги БҮРТГЭГДЭНЭ (booked): төлбөр бүртгэх агшинд тухайн өдрөөр хөлдөнө —
    # дараа нь хэсэгчилсэн төлөлт өнгөрсний алдангийг устгахгүй.
    penalty_booked: Mapped[float] = mapped_column(Float, default=0)
    penalty_paid: Mapped[float] = mapped_column(Float, default=0)
    penalty_booked_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="open")  # open|partial|paid|penalty
    detail_json: Mapped[str] = mapped_column(Text, default="[]")     # мөрүүдийн задаргаа
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    contract: Mapped["Contract"] = relationship(back_populates="invoices")


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id"), nullable=True)
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(10))  # CASH | BANK | BARTER
    barter_desc: Mapped[str] = mapped_column(String(200), default="")  # ж: Автомашин 9957УКК
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # ---- ХҮЧИНГҮЙ (void) — устгалын ОРОНД ----
    # Буруу бичсэн төлбөр мөнхөд үлдэх нь Отгоог Excel рүү буцаадаг №1 шалтгаан
    # (Чадварын харьцуулалт H1). Мөр нь УСТАХГҮЙ: хуваарилалт нь суларч,
    # тооцоо нь түүнийг хараагүй мэт ажиллана, харин жагсаалтад ХҮЧИНГҮЙ
    # тэмдэгтэй, шалтгаан, хэн/хэзээ цуцалсантайгаа хамт ХАРАГДСААР үлдэнэ.
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_by: Mapped[str] = mapped_column(String(100), default="")

    client: Mapped["Client"] = relationship()
    contract: Mapped["Contract"] = relationship()
    allocations: Mapped[list["PaymentAllocation"]] = relationship(back_populates="payment")


class PaymentAllocation(Base):
    """Нэг төлбөрийг нэхэмжлэлүүдэд хуваарилах (хамгийн хуучнаас эхэлж автоматаар)."""
    __tablename__ = "payment_allocations"
    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"))
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    amount: Mapped[float] = mapped_column(Float)
    part: Mapped[str] = mapped_column(String(10), default="principal")  # principal | penalty
    manual: Mapped[int] = mapped_column(Integer, default=0)  # 1 = гараар чиглүүлсэн

    payment: Mapped["Payment"] = relationship(back_populates="allocations")
    invoice: Mapped["Invoice"] = relationship()


class PenaltyCharge(Base):
    """Алданги НЭХСЭН явдал — Отгоо эгчийн ИЛ ШИЙДВЭР, машины дүгнэлт БИШ.

    20 жилийн Excel-д алданги ГАНЦ УДАА ч тооцоогдоогүй: хуудас бүр дээр
    «гэрээний 4.2-т зааснаар алданга тооцно» гэж ЗАРЛАГДСАН боловч хэзээ ч
    нэхэгдээгүй — тэр бол төлбөр биш, ХЭЛЭЛЦЭЭРИЙН ХӨШҮҮРЭГ (Чадварын
    харьцуулалт R25 / H2). Систем нь төлбөр бүртгэх агшинд чимээгүйхэн
    номжиж, өршөөсөн харилцагчийн мөнгийг бүртгэхэд өр нь ӨСГӨДӨГ байв.

    Одоо алданги нэхэгдэх ГАНЦ зам нь энэ мөр: «Алданги нэхэх» товч дарагдсан
    агшин, сонгосон огноогоор.

    Мөр нь ТҮЛХЭЦийг (`as_of` огноо) хадгална — ҮР ДҮНГ (`amount`) зөвхөн
    баримт болгож. Дахин бодолт (rebuild) нэхэмжлэлүүдийг устгаад шинээр
    төрүүлдэг тул хөлдсөн дүнг буцааж тавих нь БУРУУ: тоо ширхэг засагдвал
    алданги нь ч засагдах ёстой. Replay эдгээр огноогоор ДАХИН нэхнэ.

    ХҮЧИНГҮЙ (void) нь төлбөр, хөдөлгөөн, акт, тарифын өөрчлөлттэй ЯГ ижил
    журмаар (H1). Хөшүүрэг гэдэг нь ТАТАГДААД СУЛАРДАГ гэсэн үг: андуурч
    нэхсэн, эсвэл нэхээд утсаар ярьж байгаад өршөөсөн нь ХЭВИЙН тохиолдол.
    Цуцлалт нь ХАСАЛТ БИШ — replay-ээс хасагдаад дахин бодогдоно: тэгэхэд
    `penalty_booked`, `penalty_booked_until`, хуваарилалт бүгд өөрсдөө
    зөв утгаа олно (`penalty_booked`-ыг ГАРААР хасах нь буруу).
    """
    __tablename__ = "penalty_charges"
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    as_of: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float, default=0)
    user_name: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_by: Mapped[str] = mapped_column(String(100), default="")

    contract: Mapped["Contract"] = relationship()


class RateChange(Base):
    """ТАРИФЫН ДАХИН ТОХИРОЛТ — «шинэ тариф ДАРААГИЙН ЦИКЛЭЭС» (R3 / H6).

    Отгоо эгчийн Excel-д тариф циклүүдийн хооронд дахин тохирогддог: Мөнхболд
    300 → 350 → 450. Түүний семантик нэг мөр — ШИНЭ ҮНЭ ДАРААГИЙН ЦИКЛЭЭС,
    гарын үсэг зурсан ӨНГӨРСӨН нь ХЭВЭЭР.

    Систем нь урьд нь `PATCH /contracts/{id}/items`-ээр падангийн тарифыг
    УХРААЖ дарж бичдэг байв — дахин бодолтгүй. Нэхэмжлэгдсэн циклүүд хуучин
    дүнгээ хэдэн сар авч яваад, огт хамаагүй засварын үед гэнэт үсэрдэг:
    «машин санамсаргүй гарын үсэгтэй түүхийг дахин бичлээ». Одоо тариф нь
    МӨР БИШ ЯВДАЛ: хэзээнээс, юунаас юу болов, ямар тохиролцооны дор.

    `effective_from` нь ЗААВАЛ тухайн гэрээний циклийн ХИЛ (валидаци) — иймд
    нэг цонх дотор тариф хоёр болох боломжгүй бөгөөд зурвасууд хагалагдахгүй.

    `old_rate` нь ПАДАНГИЙН ҮЕИЙГ (generation) заана: 330₮-ийн падан ба
    300₮-ийн падан зэрэгцэж байвал зөвхөн заасан нь хөдөлнө. NULL бол тухайн
    материал+зэрэглэлийн БҮГД.

    ХҮЧИНГҮЙ (void) нь төлбөр, хөдөлгөөн, актынхтай ЯГ ижил журмаар (H1):
    мөр устахгүй, тооцоо түүнийг хараагүй мэт ажиллана, дэлгэц дээр
    шалтгаантайгаа үлдэнэ.
    """
    __tablename__ = "rate_changes"
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    grade_id: Mapped[int] = mapped_column(ForeignKey("grades.id"))
    old_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    new_rate: Mapped[float] = mapped_column(Float, default=0)
    effective_from: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_by: Mapped[str] = mapped_column(String(100), default="")

    contract: Mapped["Contract"] = relationship(back_populates="rate_changes")
    material: Mapped["Material"] = relationship()
    grade: Mapped["Grade"] = relationship()


class AktEntry(Base):
    """ЧӨЛӨӨТ АКТ БИЧИЛТ — хоёр талын гарын үсэгтэй хэлэлцээрийн мөр (R12 / H4).

    Отгоо эгчийн «акт» бол эвдрэлийн хөлс биш, ХЭЛЭЛЦЭЭРИЙН БАРИМТ: тээвэр,
    цэвэрлэгээ, кран дуудлага нэг циклд эвхэгддэг
    (`=1730000+350000+1163500+1206500`), БАС хөнгөлөлт байдаг — «нийт актнаас
    15% хасч тооцлоо» (×0.85). Систем нь хөдөлгөөнөөс гарсан засвар/актын
    хөлсийг л боддог байсан тул «акт» гэдэг үгийн НӨГӨӨ ХАГАСТ нүд алга байв:
    эхний хэлэлцээр гарын үсэгтэй цаас үлдээгээд, хавсралт нь таарахаа больдог.

    ТЭМДЭГ УТГАТАЙ: эерэг = НЭМЭГДЭЛ, сөрөг = ХӨНГӨЛӨЛТ. Хоёулаа нэг мөрийн
    хэлбэртэй — тэр Excel дээрээ ч нэг нүдэнд хоёуланг нь бичдэг.

    `note` ЗААВАЛ: энэ бол гарын үсэгтэй баримт, «юуны төлөө» гэдэг нь мөрөндөө
    байх ёстой. Хоосон тэмдэглэлтэй мөр нь маргааш нь тайлагдахгүй мөнгө болно.

    ХҮЧИНГҮЙ (void) нь төлбөр, хөдөлгөөнтэй ЯГ ижил журмаар (H1): мөр устахгүй,
    тооцоо түүнийг хараагүй мэт ажиллана, дэлгэц дээр шалтгаантайгаа үлдэнэ.
    """
    __tablename__ = "akt_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float, default=0)   # + нэмэгдэл, − хөнгөлөлт
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[str] = mapped_column(Text, default="")
    voided_by: Mapped[str] = mapped_column(String(100), default="")

    contract: Mapped["Contract"] = relationship(back_populates="akt_entries")


# ---------- Бартер ----------
class BarterAsset(Base):
    """Бартераар орж ирсэн хөрөнгө: машин, байр, материал, кран…
    Орж ирсэн үнэ ↔ зарсан үнийн зөрүү = хэрэгжсэн ашиг/алдагдал."""
    __tablename__ = "barter_assets"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(20), default="Бусад")  # Машин | Байр | Материал | Бусад
    name: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")           # улсын дугаар, м², хаяг…
    date_in: Mapped[date] = mapped_column(Date)
    value_in: Mapped[float] = mapped_column(Float, default=0)       # тохирсон (орж ирсэн) үнэ
    asking_price: Mapped[float] = mapped_column(Float, default=0)   # зарах санал үнэ
    status: Mapped[str] = mapped_column(String(12), default="held") # held | sold | stocked
    sold_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sold_amount: Mapped[float] = mapped_column(Float, default=0)
    sold_to: Mapped[str] = mapped_column(String(150), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped["Client"] = relationship()


# ---------- Зээл / Өглөг ----------
class Loan(Base):
    """Банк болон хувь зээлдүүлэгчийн зээл. Сарын хүү = үлдэгдэл × rate%."""
    __tablename__ = "loans"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    kind: Mapped[str] = mapped_column(String(20), default="bank")  # bank | private | credit
    principal: Mapped[float] = mapped_column(Float)
    monthly_rate: Mapped[float] = mapped_column(Float)             # %/сар
    start_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="active")  # active | closed
    # Гэрээгээр тохирсон САРЫН ТӨЛӨЛТ (үндсэн+хүү нийлсэн дүн). 0 = тохироогүй →
    # ойрын төлөлтийн тооцоо хуучин конвенцоороо сарын хүүг харуулна.
    monthly_payment: Mapped[float] = mapped_column(Float, default=0)

    payments: Mapped[list["LoanPayment"]] = relationship(back_populates="loan")


class LoanPayment(Base):
    __tablename__ = "loan_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id"))
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float)
    # interest | principal | topup («topup» = НЭМЭЛТ ОЛГОЛТ, үлдэгдлийг ӨСГӨНӨ)
    part: Mapped[str] = mapped_column(String(10), default="interest")
    note: Mapped[str] = mapped_column(Text, default="")

    loan: Mapped["Loan"] = relationship(back_populates="payments")


# ---------- Механизм ----------
class Machine(Base):
    """Автокран, ачааны машин гэх мэт — өдрийн ажлын log-той тусдаа орлогын урсгал."""
    __tablename__ = "machines"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    note: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[int] = mapped_column(Integer, default=1)

    logs: Mapped[list["MachineLog"]] = relationship(back_populates="machine")


class MachineLog(Base):
    __tablename__ = "machine_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id"))
    date: Mapped[date] = mapped_column(Date)
    entry: Mapped[str] = mapped_column(String(10))            # job | expense
    label: Mapped[str] = mapped_column(String(50), default="")  # Бүтэн өдөр/Хагас/Дотоод · Түлш/Сэлбэг/Жолооч
    client: Mapped[str] = mapped_column(String(150), default="")
    amount: Mapped[float] = mapped_column(Float, default=0)
    method: Mapped[str] = mapped_column(String(10), default="")  # CASH|BANK|BARTER|INTERNAL (job үед)
    note: Mapped[str] = mapped_column(Text, default="")

    machine: Mapped["Machine"] = relationship(back_populates="logs")


class MachineInvoice(Base):
    """Механизмын нэхэмжлэх — ТУСДАА БАРИМТ, авлагын хөдөлгүүрт ОРОХГҮЙ.

    `Invoice` нь гэрээтэй заавал холбогддог (`contract_id` NOT NULL) ба
    төлбөр хуваарилах хөдөлгүүр (services/billing) түүн дээр ажилладаг.
    Механизм нь гэрээгүй, тусдаа орлогын урсгал: төлбөрийн бодит байдал нь
    log мөрийн `method` талбар дээр аль хэдийн бүртгэгддэг. Тиймээс энэ нь
    ХЭВЛЭХИЙН тулд хадгалагдсан баримт — авлага үүсгэхгүй, устгаж болно.

    Дугаар: `M-YY/MM-N` — N нь тухайн он/сар дотор нэмэгдэнэ.
    """
    __tablename__ = "machine_invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id"))
    no: Mapped[str] = mapped_column(String(30), unique=True)
    client: Mapped[str] = mapped_column(String(150), default="")
    d_from: Mapped[date] = mapped_column(Date)
    d_to: Mapped[date] = mapped_column(Date)      # цонх [d_from, d_to] — ХОЁР ирмэг ОРНО
    total: Mapped[float] = mapped_column(Float, default=0)        # дэд дүн (НӨАТ-гүй)
    vat: Mapped[float] = mapped_column(Float, default=0)
    grand_total: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    machine: Mapped["Machine"] = relationship()


# ---------- Цалин ----------
class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    role_title: Mapped[str] = mapped_column(String(100), default="")
    type: Mapped[str] = mapped_column(String(10))              # main | contract | daily
    monthly_salary: Mapped[float] = mapped_column(Float, default=0)
    daily_rate: Mapped[float] = mapped_column(Float, default=0)
    ndsh: Mapped[int] = mapped_column(Integer, default=0)      # НДШ суутгах эсэх
    active: Mapped[int] = mapped_column(Integer, default=1)


class SalaryRun(Base):
    """Нэг удаагийн цалингийн бодолт — сарын 1 эсвэл 2 дахь хагас."""
    __tablename__ = "salary_runs"
    __table_args__ = (UniqueConstraint("period", "half"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    period: Mapped[str] = mapped_column(String(7))             # YYYY-MM
    half: Mapped[int] = mapped_column(Integer)                 # 1 | 2
    paid: Mapped[int] = mapped_column(Integer, default=0)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    items: Mapped[list["SalaryItem"]] = relationship(back_populates="run")


class SalaryItem(Base):
    __tablename__ = "salary_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("salary_runs.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    base: Mapped[float] = mapped_column(Float)                 # бодогдсон дүн
    days: Mapped[float] = mapped_column(Float, default=0)      # өдрийн ажилтанд
    ndsh_amount: Mapped[float] = mapped_column(Float, default=0)
    net: Mapped[float] = mapped_column(Float)                  # гарт олгох

    run: Mapped["SalaryRun"] = relationship(back_populates="items")
    employee: Mapped["Employee"] = relationship()


# ---------- Авлага цуглуулалт ----------
class CollectionNote(Base):
    """Харилцагчтай хийсэн холбоо барилт, амлалт — авлага цуглуулах ажлын урсгал."""
    __tablename__ = "collection_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(12), default="call")   # call | visit | message | other
    note: Mapped[str] = mapped_column(Text, default="")
    promise_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    promise_amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | kept | broken
    user_name: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped["Client"] = relationship()


# ---------- Audit log ----------
class AuditLog(Base):
    """Хэн, юуг, хэзээ өөрчилсөн — өөрчлөгдөшгүй бүртгэл."""
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_name: Mapped[str] = mapped_column(String(100), default="")
    action: Mapped[str] = mapped_column(String(40))          # create | update | delete | confirm | pay …
    entity: Mapped[str] = mapped_column(String(40))          # contract | payment | stock …
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ---------- Бусад ----------
class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20))  # contract | client | payment
    entity_id: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(500))
    size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")

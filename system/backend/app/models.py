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
    penalty_percent: Mapped[float] = mapped_column(Float, default=0.5)  # %/хоног
    deposit: Mapped[float] = mapped_column(Float, default=0)
    # Барьцааны мөчлөг: held → returned / applied / settled (хэсэгчлэн хоёулаа)
    deposit_status: Mapped[str] = mapped_column(String(12), default="held")
    deposit_returned: Mapped[float] = mapped_column(Float, default=0)
    deposit_applied: Mapped[float] = mapped_column(Float, default=0)
    deposit_settled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    vat_percent: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(15), default="active")  # active | closed
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    client: Mapped["Client"] = relationship(back_populates="contracts")
    items: Mapped[list["ContractItem"]] = relationship(back_populates="contract")
    movements: Mapped[list["Movement"]] = relationship(back_populates="contract")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="contract")


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
    """Бараа хөдөлгөөн: ISSUE (ачилт/нэмэлт), RETURN (буцаалт), WRITEOFF (акт)."""
    __tablename__ = "movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    type: Mapped[str] = mapped_column(String(12))  # ISSUE | RETURN | WRITEOFF
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
    repair_qty: Mapped[float] = mapped_column(Float, default=0)     # засварт орсон тоо
    repair_fee: Mapped[float] = mapped_column(Float, default=0)     # клиентэд тооцох засварын дүн
    writeoff_qty: Mapped[float] = mapped_column(Float, default=0)   # акталсан тоо
    writeoff_fee: Mapped[float] = mapped_column(Float, default=0)   # актын дүн (НБҮнээр)

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

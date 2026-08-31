"""POST/PUT body-ийн схемүүд."""
from datetime import date
from pydantic import BaseModel


class LoginIn(BaseModel):
    username: str
    password: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


class GradeIn(BaseModel):
    code: str
    name: str
    sort: int = 0


class PriceIn(BaseModel):
    grade_id: int
    nb_price: float = 0
    sale_price: float = 0


class MaterialIn(BaseModel):
    name: str
    category: str = "Хэв"
    code: str = ""
    unit: str = "ш"
    base_rate: float = 0
    repair_fee: float = 0
    prices: list[PriceIn] = []


class StockAdjustIn(BaseModel):
    material_id: int
    grade_id: int
    on_hand: float


class RepairDoneIn(BaseModel):
    material_id: int
    grade_id: int
    qty: float


class ClientIn(BaseModel):
    name: str
    reg: str = ""
    person: str = ""
    phone: str = ""
    note: str = ""


class ContractItemIn(BaseModel):
    material_id: int
    grade_id: int
    qty: float
    daily_rate: float = 0
    unit_price: float = 0


class ContractIn(BaseModel):
    client_id: int
    type: str = "rent"           # rent | sale
    no: str = ""
    start_date: date
    end_date: date | None = None
    cycle_days: int = 30
    # 0 = алданги автоматаар нэхэгдэхгүй (гараар нэхэж болно) — R25 / H2
    penalty_percent: float = 0
    deposit: float = 0
    vat_percent: float = 0
    note: str = ""
    items: list[ContractItemIn]


class MovementLineIn(BaseModel):
    material_id: int
    grade_id: int
    qty: float
    rate: float | None = None          # олголтын тариф/нэгж үнэ (падан)
    issue_line_id: int | None = None   # буцаалт аль паданг хааж буй
    return_grade_id: int | None = None
    repair_qty: float = 0
    writeoff_qty: float = 0


class MovementIn(BaseModel):
    type: str                    # ISSUE | RETURN | WRITEOFF
    date: date
    note: str = ""
    lines: list[MovementLineIn]


class ExtendIn(BaseModel):
    end_date: date


class AllocationIn(BaseModel):
    """Гараар чиглүүлсэн хуваарилалт — тухайн нэхэмжлэлд хэдэн төгрөг явуулах вэ."""
    invoice_id: int
    amount: float


class PaymentIn(BaseModel):
    client_id: int
    contract_id: int | None = None
    date: date
    amount: float
    method: str = "BANK"         # CASH | BANK | BARTER
    barter_desc: str = ""
    note: str = ""
    # байхгүй (None) бол автомат хуваарилалт — хуучин зан төлөв хэвээр
    allocations: list[AllocationIn] | None = None


class SettingsIn(BaseModel):
    values: dict[str, str]

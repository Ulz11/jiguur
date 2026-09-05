/* БАРЬЦААНЫ ГҮЙДЭГ ДЭВТЭР — цонхны цэвэр дүрмүүд (H8 / P1-11).
 *
 * Зулаа-3!G30 = «=20000000-8265000+3000000+3000000+10000000» = 27,735,000₮:
 * барьцаа нь нэг тоо БИШ, ТАВАН ШИЙДВЭР. Дэлгэц нь дөрвөн үйлдлээр бичнэ —
 * Байршуулах · Нэмэх · Суутгах · Буцаах — тул «аль товч хэзээ гарч ирэх вэ»,
 * «дараа нь үлдэгдэл хэд болох вэ», «энэ үйлдэл МӨНГӨ хөдөлгөх үү» гэсэн
 * гурван асуулт хуудсанд биш, ЭНД, тесттэйгээ хамт амьдарна.
 */

export type DepositKind = "lodge" | "topup" | "apply" | "return";

export type DepositEvent = {
  id: number;
  date: string;
  kind: DepositKind | string;
  kind_mn?: string;
  amount: number;
  note?: string;
  payment_id?: number | null;
  balance_after?: number | null;
  voided?: boolean;
  void_reason?: string;
  voided_by?: string;
  voided_at?: string | null;
};

export type DepositLedger = {
  events: DepositEvent[];
  balance: number;
  lodged: number;
  applied: number;
  returned: number;
  status: string;          // none | held | settled
  settled_date?: string | null;
};

/** Товчны нэр нь ҮЙЛ ҮГЭЭР эхэлнэ (UI-ЗАРЧИМ §3). */
export const DEPOSIT_ACTIONS: { kind: DepositKind; button: string; title: string }[] = [
  { kind: "lodge", button: "Байршуулах", title: "Барьцаа байршуулах" },
  { kind: "topup", button: "Нэмэх", title: "Барьцаа нэмж байршуулах" },
  { kind: "apply", button: "Суутгах", title: "Барьцаанаас авлагад суутгах" },
  { kind: "return", button: "Буцаах", title: "Барьцааг харилцагчид буцаах" },
];

const KIND_MN: Record<string, string> = {
  lodge: "Байршуулав", topup: "Нэмж байршуулав",
  apply: "Авлагад суутгав", return: "Буцаав",
};

export function depositKindLabel(kind: string): string {
  // Танихгүй бичилт нь ТҮҮХИЙ түлхүүрээ зурахгүй (англи үг = хоосон нүд).
  return KIND_MN[kind] ?? "Бусад";
}

/** Дэвтрийн мөр үлдэгдлийг ӨСГӨХ (+1) эсвэл БУУРУУЛАХ (−1) эсэх. */
export function depositSign(kind: string): 1 | -1 {
  return kind === "apply" || kind === "return" ? -1 : 1;
}

/** МӨНГӨ ХӨДӨЛДӨГ үү? Суутгал нь авлагыг, буцаалт нь кассыг хөдөлгөнө —
 *  хоёулаа `ConfirmModal` + Receipt-ээр л явна (UI-ЗАРЧИМ §4). Байршуулалт,
 *  нэмэлт нь БҮРТГЭЛ: мөнгө нь аль хэдийн ирсэн, бичилт нь баримт. */
export function depositMovesMoney(kind: string): boolean {
  return kind === "apply" || kind === "return";
}

/** Тухайн үйлдлийн ДЭЭД хязгаар. Хасах үйлдэл барьцааны үлдэгдлээс хэтрэхгүй;
 *  нэмэх үйлдэлд таазгүй. */
export function depositLimit(kind: string, balance: number): number | null {
  return depositSign(kind) < 0 ? Math.max(balance, 0) : null;
}

/** Бичилтийн ДАРААХ үлдэгдэл — Receipt дээрх «болох гэж буй» тоо. */
export function depositAfter(balance: number, kind: string, amount: number): number {
  return balance + depositSign(kind) * (Number.isFinite(amount) ? amount : 0);
}

/** Оруулсан дүн зөв үү? Буцна: алдааны ӨГҮҮЛБЭР (эсвэл хоосон). */
export function depositError(kind: string, amount: number, balance: number): string {
  if (!(amount > 0)) return "Дүн 0-ээс их байх ёстой";
  const cap = depositLimit(kind, balance);
  if (cap !== null && amount > cap + 0.01) {
    return `Барьцааны үлдэгдлээс их байна (үлдэгдэл ${Math.round(cap).toLocaleString("en-US")}₮)`;
  }
  return "";
}

/** Аль товчнууд гарах вэ. Явдалгүй гэрээнд ЗӨВХӨН «Байршуулах» — түүнээс өмнө
 *  «Суутгах» гарах нь байхгүй мөнгийг зарцуулахыг санал болгож байгаа хэрэг.
 *  Байршуулсан бол «Байршуулах» дахин гарахгүй: хоёр дахь нь НЭМЭЛТ (topup). */
export function depositActions(ledger: Pick<DepositLedger, "status" | "balance">):
    typeof DEPOSIT_ACTIONS {
  if (ledger.status === "none") return DEPOSIT_ACTIONS.filter((a) => a.kind === "lodge");
  if (ledger.balance <= 0) return DEPOSIT_ACTIONS.filter((a) => a.kind === "topup");
  return DEPOSIT_ACTIONS.filter((a) => a.kind !== "lodge");
}

/** Төлвийн ҮГ. «Байршуулаагүй» нь «0₮» БИШ — үйл явдал огт болоогүй (№55).
 *  Өнгө дангаараа утга зөөхгүй тул үг нь pill дотроо явна. */
export function depositStatusText(ledger: Pick<DepositLedger, "status" | "balance">):
    { label: string; pill: string } {
  if (ledger.status === "none") return { label: "Байршуулаагүй", pill: "pill-grey" };
  if (ledger.status === "settled") return { label: "Тооцоо хийгдсэн", pill: "pill-green" };
  return { label: "Барьцаанд байгаа", pill: "pill-amber" };
}

/** Мөрний дүн нь тэмдэгтэйгээ уншигдана: «+3,000,000₮» / «−8,265,000₮». */
export function depositAmountText(ev: Pick<DepositEvent, "kind" | "amount">,
                                  fmtMoney: (v: number) => string): string {
  return (depositSign(ev.kind) > 0 ? "+" : "−") + fmtMoney(ev.amount);
}

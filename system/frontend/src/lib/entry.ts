/* ХАРИЛЦАГЧИЙН ТҮРЭЭС БИШ БИЧИЛТ — цонхны цэвэр дүрмүүд (H11 / P1-16).
 *
 * Отгоо эгч ХАСАХ ТЭМДЭГ БИЧДЭГГҮЙ. Түүний хуудсан дээр «өгсөн» ба «авсан»
 * нь ХОЁР БАГАНА, нэг баганад суусан сөрөг тоо биш. Тиймээс цонх нь
 * «Дебит / Кредит» гэсэн сонголт өгч, ТЭМДГИЙГ өөрөө зөөнө — DB-д хадгалагдах
 * дүн нь тэмдэгтэй (`+` бол харилцагч илүү өртэй, `−` бол түүнд кредит).
 *
 * Дүрмүүд ЭНД, тесттэйгээ: хуудас нь зөвхөн зурна.
 */

export type EntryKind = "advance" | "service" | "transfer" | "adjustment";
export type EntryMode = "debit" | "credit";

export type ClientEntry = {
  id: number;
  date: string;
  amount: number;              // ТЭМДЭГТЭЙ
  kind: EntryKind | string;
  kind_mn?: string;
  label: string;
  note?: string;
  ref?: string;
  invoice_no?: string | null;
  payment_id?: number | null;
  voided?: boolean;
  void_reason?: string;
  voided_by?: string;
  voided_at?: string | null;
};

/** Дөрвөн төрөл — Отгоогийн үгээр (сонголтын дараалал нь давтамжаараа). */
export const ENTRY_KINDS: [EntryKind, string][] = [
  ["advance", "Олгосон зээл"],
  ["service", "Үйлчилгээ"],
  ["transfer", "Шилжүүлэг"],
  ["adjustment", "Залруулга"],
];

const KIND_MN: Record<string, string> = Object.fromEntries(ENTRY_KINDS);

export function entryKindLabel(kind: string): string {
  // Танихгүй төрөл нь ТҮҮХИЙ түлхүүрээ зурдаг байв — Отгоо эгчийн нүдэнд
  // «adjustment» гэдэг нь хоосон нүд. Монгол үг рүү зөөлөн унана.
  return KIND_MN[kind] ?? "Бусад";
}

/** Төрлийн pill — UI-ЗАРЧИМ §4-ийн шатнаас. Өнгө дангаараа утга зөөхгүй тул
 *  дэргэд нь ҮРГЭЛЖ төрлийн ҮГ явна. */
export function entryKindPill(kind: string): string {
  return kind === "advance" ? "pill-violet"
       : kind === "service" ? "pill-blue"
       : kind === "transfer" ? "pill-amber"
       : "pill-grey";
}

/** «Дебит / Кредит» сонголт → тэмдэг. Тэр хасах тэмдэг ХЭЗЭЭ Ч бичихгүй. */
export function entrySign(mode: EntryMode): 1 | -1 {
  return mode === "credit" ? -1 : 1;
}

/** Бичих дүн (үргэлж эерэг) + сонголт → DB-д очих ТЭМДЭГТЭЙ дүн. */
export function signedAmount(mode: EntryMode, amount: number): number {
  return entrySign(mode) * (Number.isFinite(amount) ? Math.abs(amount) : 0);
}

/** Сонголтын нэр — товч, шошго, баримтын мөр гуравт ИЖИЛ үг. */
export function entryModeLabel(mode: EntryMode): string {
  return mode === "credit" ? "Кредит — авлага буурна" : "Дебит — авлага нэмэгдэнэ";
}

/** Мөрийн дүн ТЭМДЭГТЭЙГЭЭ уншигдана: «+164,492,000₮» / «−500,000₮». */
export function entryAmountText(amount: number, fmtMoney: (v: number) => string): string {
  return (amount < 0 ? "−" : "+") + fmtMoney(Math.abs(amount));
}

/** Бичилтийн ДАРААХ авлага — Receipt дээрх «болох гэж буй» тоо. */
export function receivableAfter(receivable: number, signed: number): number {
  return receivable + signed;
}

/** Маягтын алдаа — ӨГҮҮЛБЭРЭЭР. Хоосон бол бичиж болно. */
export function entryError(label: string, amount: number): string {
  if (!(amount > 0)) return "Дүн 0-ээс их байх ёстой";
  if (!label.trim()) return "Юуны төлөө вэ — шошгыг заавал бичнэ";
  return "";
}

/** Мөрийн ХОЁРДОГЧ мөр: эх сурвалж ба тэмдэглэл нэг өгүүлбэр болно. */
export function entrySubText(e: Pick<ClientEntry, "ref" | "note" | "invoice_no">): string {
  return [e.invoice_no ? `№${e.invoice_no}` : "", e.ref, e.note]
    .filter((x) => x && String(x).trim()).join(" · ");
}

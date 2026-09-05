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

/** Сонголтын нэр — товч, шошго, баримтын мөр гуравт ИЖИЛ үг.
 *
 *  ⚠ «Дебит» / «Кредит» гэсэн ХОС үг ЭНД БАЙХГҮЙ. Отгоо эгч нягтлан биш:
 *  түүний хуудсан дээр «өгсөн» ба «авсан» гэсэн хоёр багана л байдаг. Хоёр
 *  сонголт хоёулаа «Д»-ээр эхэлж, зөвхөн дараагийн үгээрээ ялгарах нь нэг
 *  агшин хараад сонгоход БУРУУ товч дарах эрсдэл. Одоо тэмдэг нь эхэндээ
 *  (+ / −), араас нь ХЭН хийхийг нь хэлнэ: «тэр төлнө» / «бид хасна». */
export function entryModeLabel(mode: EntryMode): string {
  return mode === "credit"
    ? "− Авлага буурна (бид хасна)"
    : "+ Авлага нэмэгдэнэ (тэр төлнө)";
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

/* ---------- МАШИНЫ ТЭМДЭГЛЭГЭЭ ДЭЛГЭЦЭН ДЭЭР ГАРАХГҮЙ ----------
 *
 * Шилжүүлэг бичилт бүр дээр ХОЁР зүйл үлдээсэн:
 *
 *   ref  = «2026 тооцоо!R24 · Бутан-Өнөорд»   ← Excel-ийн НҮДНИЙ хаяг
 *   note = «Шилжүүлэлт — хуучин системээс»    ← хэрэгслийн өөрийнх нь тэмдэг
 *
 * Хоёул нь ХӨГЖҮҮЛЭГЧИЙН мэдээлэл: аль нүднээс ирснийг Отгоо эгч хэзээ ч
 * асуухгүй («2026 тооцоо!R24» гэдгийг тэр өөрөө уншиж чадахгүй ч), «хуучин
 * системээс» гэдэг нь бүх мөрөнд ижил тул юуг ч ялгахгүй. Тэдгээр мөр нь
 * шошгоны доор 12px-ээр зогсоод, ЖИНХЭНЭ тэмдэглэл байх байрлалыг эзэлнэ.
 *
 * Өгөгдөл нь ХЭВЭЭР (устгал байхгүй, audit-д ч хэрэгтэй) — зөвхөн ХАРАГДАХАА
 * болино. `ref` нь БҮРЭН, `note` нь машины тэмдэг байвал.
 */

/** Тэмдэглэл нь ХЭРЭГСЛИЙН тэмдэг үү (шилжүүлэгч өөрийгөө нэрлэсэн мөр). */
export function isMigrationNote(note: string | null | undefined): boolean {
  const s = (note || "").trim();
  if (!s) return false;
  return /хуучин\s+систем/i.test(s);
}

/** Дэлгэц дээр гарах ТЭМДЭГЛЭЛ — машины тэмдэг бол ХООСОН. */
export function entryNoteText(note: string | null | undefined): string {
  return isMigrationNote(note) ? "" : (note || "").trim();
}

/** Мөрийн ХОЁРДОГЧ мөр: нэхэмжлэлийн № ба ЖИНХЭНЭ тэмдэглэл.
 *
 *  `ref` (эх сурвалж) нь ЭНД ОРОХГҮЙ — тэр нь миграцийн ул мөр, түүний
 *  мэдээлэл биш. Гараар бичсэн «акт №7» ч гэсэн: түүнийг Отгоо ӨӨРӨӨ
 *  «Юуны төлөө» талбартаа бичдэг (шошго нь мөрийн гарчиг). */
export function entrySubText(e: Pick<ClientEntry, "ref" | "note" | "invoice_no">): string {
  return [e.invoice_no ? `№${e.invoice_no}` : "", entryNoteText(e.note)]
    .filter((x) => x && String(x).trim()).join(" · ");
}

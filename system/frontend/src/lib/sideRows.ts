import { fmt } from "./num";

/* ХАЖУУГИЙН ХУУДСУУДЫН МӨРИЙН ЛОГИК — DOM-гүй, сүлжээгүй.
 *
 * Зээлийн «хоцорсон», цалингийн НДШ хувь, бартерын «орж ирсэн үнэ», механизмын
 * нэхэмжлэлийн урьдчилсан харагдац — дөрвүүлээ ижил өвчинтэй байв: тоо нь
 * СЕРВЕР дээр байгаа атлаа дэлгэц дээр ГАРААГҮЙ, эсвэл дэлгэц өөрөө дахин
 * бодож серверээс ЗӨРСӨН. Тооны үг нь энд, тестийн доор амьдарна.
 */

const tug = (n: number) => fmt(n) + "₮";

/* ══════ ЗЭЭЛ ══════ */

/** «Төлөлт хоцорсон · 12 хоног» — мөр дээрх УЛААН пилийн үг. */
export function overdueText(daysLate: number): string {
  return `Төлөлт хоцорсон · ${Math.max(Math.round(daysLate), 0)} хоног`;
}

/** Хэдэн зээл хоцорсныг ТОЛГОЙ дээр. 0 бол «хоцролт алга» — хоосон биш. */
export function overdueHeroText(count: number): string {
  return count > 0 ? `${count} зээлийн төлөлт хоцорсон` : "хоцорсон төлөлт алга";
}

/** Мөр нь хоцорсон уу (сервер шийднэ; дэлгэц дахин бодохгүй). */
export function isOverdue(row: { overdue?: boolean; status?: string }): boolean {
  return !!row.overdue && row.status !== "closed";
}

/** Төлөлтийн дараах үлдэгдэл — «хүү» нь үндсэн дүнг ХӨНДӨХГҮЙ. */
export function balanceAfterPay(balance: number, part: string, amount: number): number {
  if (part === "principal") return Math.max(balance - amount, 0);
  if (part === "topup") return balance + amount;
  return balance;
}

/* ══════ ЦАЛИН ══════ */

/** «НДШ суутгана (11.5%)» — хувь нь ТОХИРГООНООС, хатуу бичихгүй. */
export function ndshLabel(pct: number | null | undefined): string {
  const p = Number(pct);
  return Number.isFinite(p) && p > 0
    ? `НДШ суутгана (${trimPct(p)}%)`
    : "НДШ суутгана";
}

/** «11.50» → «11.5», «11» → «11» — хувь дээр хоосон тэг өлгөхгүй. */
export function trimPct(p: number): string {
  return String(Math.round(p * 100) / 100);
}

/** Бодолт устгагдах уу — ОЛГОСОН бол хаалттай (сервер ч 400 буцаана). */
export function runDeletable(run: { paid?: boolean | number }): boolean {
  return !run.paid;
}

/** Олгосон бодолтын товч дээр гарах ШАЛТГААН (`title`). */
export const PAID_RUN_LOCKED = "Олгосон бодолтыг устгах боломжгүй";

/* ══════ БАРТЕР ══════ */

/** Сервер: «Орж ирсэн үнэ 0-ээс их байх ёстой» (400). Тэр өгүүлбэрийг
 *  цонх нь ИЛГЭЭХЭЭС ӨМНӨ, талбарынхаа доор хэлнэ. */
export const VALUE_IN_REQUIRED = "Орж ирсэн үнэ 0-ээс их байх ёстой";

export function valueInError(parsed: number, raw: string): string {
  if (raw.trim() === "") return VALUE_IN_REQUIRED;
  return parsed > 0 ? "" : VALUE_IN_REQUIRED;
}

/* ══════ МЕХАНИЗМ ══════ */

export type PreviewRow = {
  label: string; sub?: string; value: string;
  accent?: "money" | "danger" | "violet" | "dim";
};

export type InvoicePreview = {
  no?: string; client?: string; d_from?: string; d_to?: string;
  rows?: number; lines?: { date: string; label?: string; method?: string; amount: number }[];
  total?: number; vat?: number; vat_percent?: number; grand_total?: number;
  overlap_no?: string | null; warning?: string;
};

const METHOD_MN: Record<string, string> = {
  CASH: "Бэлэн", BANK: "Данс", BARTER: "Бартер", INTERNAL: "Дотоод",
};
export const methodMn = (m: string | undefined) => (m && METHOD_MN[m]) || "—";

/** Урьдчилсан харагдацын баримт — СЕРВЕРИЙН тоогоор, дэлгэц дахин бодохгүй.
 *
 *  Урьд нь цонх нь `lib/machine.ts`-ээр өөрөө бодож «1,800,000₮» гэж амлаад,
 *  сервер өөр НӨАТ%-аар өөр тоо хэвлэдэг байв. Одоо `dry_run: true` нь
 *  БАРИМТ дээр гарах ЯГ тэр тоог урьдчилж буцаана. */
export function previewRows(p: InvoicePreview, maxLines = 6): PreviewRow[] {
  const lines = p.lines || [];
  const rows: PreviewRow[] = lines.slice(0, maxLines).map((l) => ({
    label: `${l.date} · ${l.label || "Ажил"}`,
    sub: methodMn(l.method),
    value: tug(l.amount),
  }));
  if (lines.length > maxLines) {
    const rest = lines.slice(maxLines).reduce((s, l) => s + l.amount, 0);
    rows.push({ label: `… бас ${lines.length - maxLines} мөр`, value: tug(rest), accent: "dim" });
  }
  // НӨАТ 0 бол мөр нэмэхгүй — байхгүй татварыг «0₮» гэж зарлах нь чимээ.
  if ((p.vat || 0) > 0) {
    rows.push({ label: "Мөрүүдийн дүн", value: tug(p.total || 0), accent: "dim" });
    rows.push({ label: `НӨАТ ${trimPct(p.vat_percent || 0)}%`, value: tug(p.vat || 0), accent: "dim" });
  }
  return rows;
}

export function previewTotal(p: InvoicePreview): PreviewRow {
  return {
    label: `${p.rows ?? (p.lines || []).length} мөр · Нийт`,
    value: tug(p.grand_total || 0),
    accent: "money",
  };
}

/** Урьдчилсан харагдац «Үүсгэх»-ийг зөвшөөрөх үү. Мөр байхгүй, эсвэл
 *  хугацаа нь өөр баримттай ДАВХАЦСАН бол — үгүй (сервер 400/409 буцаана). */
export function previewBlocked(p: InvoicePreview): boolean {
  return !!p.overlap_no || (p.rows ?? (p.lines || []).length) === 0;
}

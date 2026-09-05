/* АГУУЛАХЫН ЗАЛРУУЛГА БА ТООЛЛОГЫН ЦЭВЭР ЛОГИК.
 *
 * «144ш хаачив?» гэдэг нь агуулахын хамгийн үнэтэй асуулт. Урьд нь хариулт
 * НЬ БАЙХГҮЙ байв: `POST /api/stock/adjust` нь `on_hand`-ыг дарж бичээд явдаг,
 * хэн, хэзээ, ЯАГААД гэдэг нь хаана ч үлддэггүй. Одоо бичилт бүр мөр болж
 * (`stock_adjustments`) үлдэнэ — тэр мөрийг УНШИХ үг нь энд.
 */
import { fmt } from "./num";

/* ---------- Залруулгын баримт ---------- */

/** «34 → 7 · −27ш» — залруулга нь ХОЁР тоог хамт хэлнэ.
 *
 *  Ганц тоо («одоо 7ш») нь өөрчлөлтийг ХЭЛДЭГГҮЙ: Отгоо өмнөх тоог санахгүй
 *  тул зөрүүг өөрөө бодож чадахгүй (`lib/outcome.ts`-ийн `dayShift` журам). */
export function adjustReceipt(before: number, after: number): string {
  return `${fmt(before)} → ${fmt(after)} · ${signed(after - before)}ш`;
}

/** Тэмдэгтэй тоо: «−27» / «+27» / «0». Хасах нь ЭНГИЙН ЗУРААС (-) биш
 *  ТИПОГРАФЫН хасах (−) — 12px дээр зураас нь тэмдэг мэт биш, тасалдал мэт
 *  уншигдана (Материалын түүх, `lib/outcome.ts` хоёул үүнийг барьдаг). */
export function signed(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;
}

/** Залруулга нь ЮУ хийхийг НЭРЛЭНЭ — «хадгалах» гэдэг үг юу ч хэлдэггүй. */
export function adjustEffect(diff: number): string {
  if (Math.round(diff) === 0) return "Зөрүүгүй — юу ч өөрчлөгдөхгүй";
  return diff > 0 ? "Агуулахад нэмэгдэнэ" : "Агуулахаас хасагдана";
}

/** Шалтгаангүй залруулга нь МӨРӨӨ ХООСОН үлдээнэ: сар хагасын дараа тэр мөр
 *  «−27ш, шалтгаан алга» гэж уншигдаж, дахин асуулт төрүүлнэ. Тиймээс ЗААВАЛ. */
export const REASON_REQUIRED = "Шалтгаан бичнэ үү — залруулга мөр болж үлдэнэ";

export function adjustReasonError(reason: string): string {
  return reason.trim() ? "" : REASON_REQUIRED;
}

/* ---------- Түүхийн мөр ---------- */

export type HistoryRow = {
  row?: string; type?: string; kind?: string;
  date?: string; qty?: number; delta?: number;
  before?: number; after?: number;
  user_name?: string; note?: string;
  voided?: boolean; void_reason?: string; voided_by?: string;
};

/** Залруулгын мөрийн бүтэн уншилт:
 *  «Тооллого −27ш (Б.Дарга, 2026-09-06) — эвдэрсэн хэв актлав»
 *
 *  Тоо нь ТЭМДЭГТЭЙГЭЭ: «27ш» гэдэг нь нэмэгдсэн үү, хасагдсан уу гэдгийг
 *  хэлдэггүй — атал тэр хоёр нь эсрэг талын хариулт. */
export function adjustmentLine(r: HistoryRow): string {
  const amount = `${signed(r.delta ?? 0)}ш`;
  const who = [r.user_name?.trim(), r.date].filter(Boolean).join(", ");
  const head = [r.kind || "Залруулга", amount].join(" ") + (who ? ` (${who})` : "");
  const why = r.note?.trim();
  return why ? `${head} — ${why}` : head;
}

/** Хүчингүй болсон мөрийн ТАЙЛБАР: «ХҮЧИНГҮЙ · шалтгаан · хэн».
 *
 *  Мөр нь ЖАГСААЛТААС ГАРАХГҮЙ (H1) — устгал нь «энэ падан хаачив?» гэсэн
 *  хариултгүй асуулт үлдээдэг. Зөвхөн тооцооноос гарсныг ил хэлнэ. */
export const VOID_MARK = "ХҮЧИНГҮЙ";

export function voidLine(r: HistoryRow): string {
  if (!r.voided) return "";
  return [VOID_MARK, r.void_reason?.trim(), r.voided_by?.trim()]
    .filter((x): x is string => !!x && x !== "").join(" · ");
}

/** Энэ мөр ЗАЛРУУЛГА уу (хөдөлгөөн БИШ). Хуучин сервер `row` талбаргүй
 *  хариу буцаадаг тул `type`-аар ч танина. */
export function isAdjustment(r: HistoryRow): boolean {
  return r.row === "adjustment" || r.type === "ADJUST";
}

/* ---------- Тооллогын зөрчил (409) ---------- */

/** Серверийн 409 өгүүлбэр нь МАТЕРИАЛААРАА эхэлдэг:
 *  «Хөндлөвч: үлдэгдэл өөрчлөгдсөн байна (2044 → 2051) — дахин ачаална уу».
 *  Тэр нэрийг салгаж авбал зурвасыг ЯГ тэр мөрөн дээр буулгаж болно —
 *  хуудасны дээд талын улаан тууз нь «АЛЬ мөр вэ?» гэсэн асуулт үлдээдэг. */
export function conflictMaterial(message: string): string {
  const i = String(message || "").indexOf(":");
  if (i <= 0) return "";
  const name = message.slice(0, i).trim();
  /* «үлдэгдэл өөрчлөгдсөн» гэсэн үггүй мөр нь өөр алдаа — материал нэрлээгүй. */
  return message.includes("үлдэгдэл өөрчлөгдсөн") ? name : "";
}

/** Тооллого дууссаны ҮР ДҮН — «N мөр залруулагдав» нь ХИЙГДСЭН АЖИЛ.
 *  Зөрүүгүй тооллого ч ажил: «зөрүүгүй» гэдэг нь хамгийн үнэтэй хариулт. */
export function stocktakeOutcome(lines: number, adjusted: number, diffTotal: number): string {
  const parts = [`${fmt(lines)} мөр тоологдов`];
  if (adjusted > 0) {
    parts.push(`${fmt(adjusted)} мөр залруулагдав`, `${signed(diffTotal)}ш`);
  } else {
    parts.push("зөрүүгүй");
  }
  return `Тооллого хадгалагдлаа — ${parts.join(" · ")}`;
}

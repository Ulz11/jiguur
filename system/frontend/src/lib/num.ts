/* Хэрэглэгчийн ГАРААР бичсэн тоог (мөнгө, тариф, хувь, тоо ширхэг) тоо
 * болгон уншдаг ГАНЦ газар.
 *
 * Отгоо мөнгөө Excel-ээс хуулж тавьдаг: "6,000,000" эсвэл "6 000 000".
 * Энгийн `parseFloat("6,000,000")` нь эхний тасалахад зогсоод 6 болчихдог —
 * дүн ЧИМЭЭГҮЙ алдагддаг. Тиймээс мянгатын тусгаарлагчийг эхлээд арилгана.
 *
 * ДҮРЭМ (энэ системд):
 *   • таслал ба зай  = МЯНГАТЫН тусгаарлагч  →  "1,5" нь 1.5 биш, 15
 *   • цэг            = АРАВТЫН тусгаарлагч   →  "1.55" → 1.55, "0.5" → 0.5
 * Алдангийн хувь ("0.5"), тариф ("1.25") зэрэг бутархайг цэгээр бичнэ.
 */

/** Мянгатын тусгаарлагч болж болох бүх тэмдэгт: таслал, энгийн зай,
 *  хуулж тавихад ордог NBSP (U+00A0) ба нарийн NBSP (U+202F). */
const SEPARATORS = /[,\s  ]/g;

export function parseMoney(s: string | number | null | undefined): number {
  if (typeof s === "number") return Number.isFinite(s) ? s : 0;
  if (s === null || s === undefined) return 0;
  const n = parseFloat(String(s).replace(SEPARATORS, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Бичиж байх үед мянгатыг бүлэглэнэ: "6000000" → "6,000,000".
 *  Хэрэглэгч бичиж дуусаагүй байхад нь саад болохгүй: "1234." → "1,234."
 *  Хоосныг 0 болгохгүй — placeholder нь харагдсаар байх ёстой. */
export function formatMoneyInput(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const raw = String(s).replace(SEPARATORS, "");
  if (raw === "") return "";
  const m = raw.match(/^(-?)(\d*)(\.\d*)?/);
  if (!m) return "";
  const [, sign, int = "", frac = ""] = m;
  if (!int && !frac) return "";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + grouped + frac;
}

/**
 * Дэлгэц дээрх ₮-г тоо болгоно.
 *
 * Систем нэг тоог ХОЁР нягтралаар үзүүлдэг (UI-ЗАРЧИМ): харцанд «24.3 сая»
 * (`sayaFmt`), нарийн дүн нь `title`-д эсвэл доор нь «24,276,060₮» (`money`).
 * Дэлгэц хоорондын ТУЛГАЛТ нь нарийн дүнгээр л утгатай — «24.3 сая» ба
 * «24.4 сая» хоёр ижил дугуйлагдаж, 100,000₮ зөрүү нуугдана.
 */
const TUGRIK = /-?[\d ,\s]*\d(?:[.,]\d+)?\s*₮/g;

/**
 * ДУГУЙЛСАН харагдац — тестийн ӨӨРИЙН арифметик.
 *
 * `lib/num.ts`-ийн `sayaFmt`-ыг ДУУДАХГҮЙ, дахин бичнэ: аппын функцийг
 * дуудвал дүрэм өөрөө эвдэрсэн байхад хоёр тал хамт «ногоон» болно
 * (`support/dates.ts`-ийн ижил шалтгаан). Гурван шат — бүтэн → сая → тэрбум.
 */
export function sayaText(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000)
    return `${(n / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })} тэрбум`;
  if (abs >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })} сая`;
  return Math.round(n).toLocaleString('en-US');
}

/** Бүтэн төгрөгийн харагдац: 1234.6 → «1,235». */
export const fullText = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * Тухайн бичиг ДУГУЙЛСАН уу, бүтэн үү — «нягтралын шат».
 *
 * Отгоо эгчийн нүдэнд «12.3 сая₮» ба «12,330,000₮» хоёр нь ХОЁР ӨӨР
 * ХЭМЖҮҮР: нэгийг нөгөөгөөс хасах гэж оролдвол утгагүй тоо гарна. Тиймээс
 * НЭГ хайрцагт байгаа толгой ба дэд мөр нь ижил шатанд байх ёстой.
 */
export function scaleOf(text: string): 'сая' | 'бүтэн' {
  return /(сая|тэрбум)/.test(text) ? 'сая' : 'бүтэн';
}

/** «Одоогийн цикл — 3,787,080₮» → 3787080 · «≈24,276,060₮» → 24276060 */
export function parseTugrik(raw: string | null | undefined, label = 'дүн'): number {
  if (raw === null || raw === undefined) throw new Error(`${label}: ₮ утга огт алга`);
  const matches = raw.match(TUGRIK);
  if (!matches?.length) throw new Error(`${label}: «${raw}» дотроос ₮ уншигдсангүй`);
  /* Сүүлийнхийг авна: «Одоогийн цикл — X₮» маягийн угтвартай мөрд тоо нь
     ард нь зогсдог; ганц тоотой мөрд ялгаагүй. */
  const n = Number(matches[matches.length - 1].replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`${label}: «${raw}» тоо болж хувирсангүй`);
  return n;
}

/**
 * Дэлгэц дээрх ₮-г тоо болгоно.
 *
 * Систем нэг тоог ХОЁР нягтралаар үзүүлдэг (UI-ЗАРЧИМ): харцанд «24.3 сая»
 * (`sayaFmt`), нарийн дүн нь `title`-д эсвэл доор нь «24,276,060₮» (`money`).
 * Дэлгэц хоорондын ТУЛГАЛТ нь нарийн дүнгээр л утгатай — «24.3 сая» ба
 * «24.4 сая» хоёр ижил дугуйлагдаж, 100,000₮ зөрүү нуугдана.
 */
const TUGRIK = /-?[\d ,\s]*\d(?:[.,]\d+)?\s*₮/g;

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

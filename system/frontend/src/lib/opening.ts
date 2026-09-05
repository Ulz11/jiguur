/* ХУУЧИН ҮЛДЭГДЭЛ — систем дотор гэрээ, ДЭЛГЭЦ ДЭЭР бол ГЭРЭЭ БИШ.
 *
 * Excel-ээс шилжсэн үлдэгдэл бүр `OB-{харилцагчийн дугаар}` нэртэй ЗОХИОМОЛ
 * гэрээ болж, дотроо ганц `OB-…` нэхэмжлэлтэй сууна. Энэ нь ХӨДӨЛГҮҮРИЙН
 * шийдэл: төлбөр хуваарилах, авлага тоолох гинж бүхэлдээ гэрээ→нэхэмжлэл
 * гэсэн замаар явдаг тул үлдэгдлийг тэр зам руу оруулах хамгийн хямд арга нь
 * гэрээ дүр эсгэх байв.
 *
 * Гэвч Отгоо эгч «№OB-2» гэсэн юмыг хэзээ ч гарын үсэг зурч байгаагүй. Тэр
 * мөрийг хараад «энэ ямар гэрээ вэ, би мэдэхгүй» гэж эргэлзэнэ — арван
 * харилцагчийн ЯГ ТАЛ нь ийм мөртэй. Тиймээс дугаар нь дэлгэц дээр ГАРАХГҮЙ:
 * түүний өөрийнх нь үг («хуучин үлдэгдэл») л гарна.
 *
 * Толь нь ЭНД, тесттэйгээ — арван хуудсанд `no.startsWith("OB-")` гэсэн мөр
 * тарвал маргааш нэг нь мартагдана.
 */

/** Дэлгэц дээрх НЭР — бүх хуудас энэ нэг үгийг хэлнэ. */
export const OPENING_LABEL = "Хуучин үлдэгдэл";

/** Серверийн тэмдэг: хуучин үлдэгдлийн гэрээ/нэхэмжлэлийн дугаар `OB-`-ээр
 *  эхэлдэг (`serializers.contract_row` мөн ЯГ үүгээр `state: "opening"`
 *  гэж шийддэг). */
export function isOpeningNo(no: string | null | undefined): boolean {
  return !!no && no.trim().startsWith("OB-");
}

/** Гэрээний мөр — дугаараар нь ч, серверийн төлөвөөр нь ч танина.
 *  (Жагсаалт `state` авч явдаг, дэлгэрэнгүй хоёуланг нь.) */
export function isOpeningRow(
  row: { no?: string | null; state?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  return row.state === "opening" || isOpeningNo(row.no);
}

/** «№24/03» — хуучин үлдэгдэл бол дугааргүй, ҮГЭЭРЭЭ. */
export function contractNoLabel(no: string | null | undefined): string {
  return isOpeningNo(no) ? OPENING_LABEL : `№${(no || "").trim()}`;
}

/** «Гэрээ №24/03» — толгойн, холбоосны бүтэн нэр. */
export function contractTitle(no: string | null | undefined): string {
  return isOpeningNo(no) ? OPENING_LABEL : `Гэрээ №${(no || "").trim()}`;
}

/** Хуучин үлдэгдэл ХЭЗЭЭ хүртэлх тоо вэ. Огноогүй бол мөр огт гарахгүй —
 *  хий «— хүртэл» гэдэг нь мэдээлэл дутуу мэт уншигдана. */
export function openingUntil(date: string | null | undefined): string {
  const d = (date || "").trim();
  return d ? `${d} хүртэл` : "";
}

/** ЖИНХЭНЭ гэрээнүүд — хуучин үлдэгдэл орохгүй. */
export function realContracts<T extends { no?: string | null; state?: string | null }>(
  rows: T[] | null | undefined,
): T[] {
  return (rows || []).filter((r) => !isOpeningRow(r));
}

/** «Гэрээ» гэсэн тоо — нэг жинхэнэ гэрээтэй харилцагч 2 гэж харагдахаа болино. */
export function contractCount(
  rows: { no?: string | null; state?: string | null }[] | null | undefined,
): number {
  return realContracts(rows).length;
}

/** «Хамтран ажилласан: 2024-04-04-с». ГЭРЭЭГҮЙ бол ХООСОН — мөр нь огт гарахгүй.
 *
 *  Урьд нь харилцагчийн БҮРТГЭГДСЭН огноог хэлдэг байв — шилжүүлсэн
 *  харилцагч бүрд тэр нь ачаалсан өдөр (2026-09-04) тул арван жилийн
 *  түншлэл «өнөөдөр эхэлсэн» гэж харагдана. Үнэн нь хамгийн хуучин
 *  ГЭРЭЭНИЙ эхлэл; хуучин үлдэгдлийн зохиомол гэрээ мөн л ачаалсан
 *  өдрөөрөө сууна тул тооцоонд орохгүй.
 *
 *  ГЭРЭЭ ОГТ БАЙХГҮЙ бол бүртгэсэн огноо руу УНАХГҮЙ (2026-09): дөнгөж
 *  бүртгүүлсэн харилцагч дээр «Хамтран ажилласан: 2026-09-05-с» гэж
 *  бичих нь ХАМТРАН АЖИЛЛАСАН гэсэн үгийн утгыг өөрийг нь худал болгоно —
 *  тэдэнтэй хараахан ямар ч ажил хийгээгүй. Хоосон мөр нь ХУДАЛ мөрнөөс
 *  дээр: дуудагч тал түүнийг огт зурахгүй. */
export function partnerSince(
  contracts: { no?: string | null; state?: string | null; start_date?: string | null }[]
    | null | undefined,
): string {
  const dates = realContracts(contracts)
    .map((c) => (c.start_date || "").trim())
    .filter(Boolean)
    .sort();
  return dates[0] || "";
}

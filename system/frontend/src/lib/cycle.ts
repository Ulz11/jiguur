/* ЦИКЛИЙН ОГНОО — ТҮҮНИЙ уншилтаар (M5 / R4).
 *
 * Хөдөлгүүр бүхэлдээ ХАГАС НЭЭЛТТЭЙ цонхоор ажилладаг: [2026-03-15, 2026-04-14)
 * бол зайгүй, давхцалгүй 30 хоног. Отгоогийн дэвтэр дээрх шошго харин
 * БАГТААМЖТАЙ: «3.15-4.13» — 4.13 нь циклд ОРНО.
 *
 * Цонхны төгсгөлийг ЯГ хэвээр харуулбал төгсгөл нь ҮРГЭЛЖ нэг хоногоор хожуу
 * уншигдана; 20 жил тоо уншсан нүд үүнийг «машин нэг хоног нэмчихлээ» гэж
 * уншина — гарын үсэг зурахаас нь ӨМНӨ.
 *
 * ӨГӨГДӨЛ НЬ ХЭВЭЭР: DB, тооцоо, нэхэмжлэлийн түлхүүр, rebuild бүгд хагас
 * нээлттэй цонхоороо явна. Энэ файл нь ЗӨВХӨН дүрслэлийн хил — серверийн
 * `billing.cycle_label`-ийн толь (нэг дүрэм, хоёр тал).
 */
import { isoOf, parseIso } from "./calendar";

/** Хагас нээлттэй цонхны СҮҮЛЧИЙН хоног: «2026-04-14» → «2026-04-13».
 *
 *  «Хасах нэг» бүх frontend дээр ЭНЭ ганц мөрөнд амьдарна. */
export function cycleLastDay(endIso: string): string {
  const { year, month, day } = parseIso(endIso);
  const d = new Date(year, month - 1, day - 1);      // ЛОКАЛ огноо
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Цонхны БАГТААМЖТАЙ шошго: «2026-03-15 – 2026-04-13».
 *
 *  Хоосон/нэг хоногийн цонхонд урвуу муж хэвлэхгүй — төгсгөл нь эхлэлээсээ
 *  хойш зогсоно (худалдаа, OB нэхэмжлэлийн цикл нь нэг өдөр). */
export function cycleLabel(startIso: string, endIso: string): string {
  if (!startIso) return "";
  if (!endIso) return startIso;
  const last = cycleLastDay(endIso);
  return `${startIso} – ${last < startIso ? startIso : last}`;
}

/** Гэрээний жагсаалтын нарийн баганад — сар-өдөр төдий, ижил дүрмээр. */
export function cycleShortLabel(startIso: string, endIso: string): string {
  return cycleLabel(startIso, endIso).replace(/\d{4}-/g, "");
}

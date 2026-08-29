/* «Хэзээ» гэдгийг хүн ХОНОГООР боддог.
 *
 * Хүлээгдэж буй төлбөрийн жагсаалт дээр «2026-09-14» гэсэн огноо ганцаараа
 * «удахгүй юу, дараа сар уу» гэдгийг хэлдэггүй — Отгоо мөнгөө төлөвлөхдөө
 * «хэдэн хоногийн дараа» гэдгийг хардаг. Энэ файл нь тэр хөрвүүлэлтийн ЦЭВЭР
 * логик: React-гүй, сүлжээгүй, детерминистик.
 *
 * Огноог lib/calendar.ts-ийн адилаар ЛОКАЛ Date-ээр уншина —
 * `new Date("YYYY-MM-DD")` нь UTC-гээр уншдаг тул нэг хоногийн хазайлт өгдөг.
 */
import { isoOf, parseIso } from "./calendar";

const DAY_MS = 86_400_000;

/** Хоёр ISO огнооны хоорондох хоногийн зөрүү (to − from).
 *  Цагийн шилжилттэй өдрүүд 23/25 цаг болдог тул бөөрөнхийлж авна. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  const ms = new Date(b.year, b.month - 1, b.day).getTime()
           - new Date(a.year, a.month - 1, a.day).getTime();
  return Math.round(ms / DAY_MS);
}

/** Хүлээгдэж буй огноо хэзээ болохыг хүний үгээр: «өнөөдөр», «маргааш»,
 *  «16 хоногийн дараа». Огноо өнгөрсөн бол «2 хоног хэтэрсэн». */
export function dueLabel(expectedIso: string, todayIsoStr: string): string {
  const d = daysBetween(todayIsoStr, expectedIso);
  if (d < 0) return `${-d} хоног хэтэрсэн`;
  if (d === 0) return "өнөөдөр";
  if (d === 1) return "маргааш";
  return `${d} хоногийн дараа`;
}

/** Өнөөдрийн огноо ISO мөрөөр — ЛОКАЛ цагаар (`toISOString()` нь UTC тул
 *  оройн цагаар нэг хоног урагшилдаг). */
export function todayIso(now: Date = new Date()): string {
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

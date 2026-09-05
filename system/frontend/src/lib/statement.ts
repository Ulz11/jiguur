/* ТООЦООНЫ ХУУЛГА — ХУГАЦААГ СОНГОХ ЦЭВЭР ДҮРЭМ.
 *
 * Отгоо эгч харилцагч бүрийнхээ хуудсыг ГАРААР хэвлэж, тооцоо нийлэхээр
 * очдог. Систем дотор тэр хуудас байгаа ч түүнийг цаас болгож гаргах товч
 * байгаагүй — тэр Excel рүүгээ буцна.
 *
 * Хугацаа нь ГУРВАН бэлэн сонголт + гараар заах: тэр «2026-01-01»-ээс
 * «2026-09-05» гэж хоёр огноо бичихийг хүсэхгүй, ихэнхдээ «бүгдийг» эсвэл
 * «энэ сар» гэдэг. Гараар заах нь ҮЛДЭНЭ (тооцоо нийлэх үе нь дурын байдаг).
 *
 * Огноо нь ЛОКАЛ хуанлигаар (`lib/calendar`) — `toISOString()` нь UTC тул
 * UTC+8-д орой 8 цагаас хойш маргаашийн огноог өгнө.
 */
import { isoOf, parseIso } from "./calendar";

export type StatementChoice = "all" | "month" | "quarter" | "custom";

/** Сонголтын нэрс — цонх энэ дарааллаар зурна. */
export const STATEMENT_CHOICES: [StatementChoice, string][] = [
  ["all", "Бүх хугацаа"],
  ["month", "Энэ сар"],
  ["quarter", "Сүүлийн 3 сар"],
  ["custom", "Огноо заах"],
];

export type StatementRange = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** Сарын урд руу — «2026-09-05», 2 → «2026-07-05». Өдөр нь тухайн сард
 *  байхгүй бол (3-31 → 2-р сар) тэр сарын СҮҮЛЧИЙН өдөр дээр зогсоно. */
function backMonths(iso: string, months: number): string {
  const { year, month, day } = parseIso(iso);
  const zero = year * 12 + (month - 1) - months;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad(m)}-${pad(Math.min(day, last))}`;
}

/** Сонголт → хамрах хугацаа. `from` хоосон = «эхнээс нь» (сервер өөрөө
 *  хамгийн эртний явдлыг олно), `to` хоосон = өнөөдөр хүртэл. */
export function statementRange(choice: StatementChoice, today: string,
                               custom?: Partial<StatementRange>): StatementRange {
  if (choice === "all") return { from: "", to: "" };
  if (choice === "month") {
    const { year, month } = parseIso(today);
    return { from: isoOf(year, month, 1), to: today };
  }
  if (choice === "quarter") return { from: backMonths(today, 3), to: today };
  return { from: (custom?.from || "").trim(), to: (custom?.to || "").trim() };
}

/** Маягтын алдаа — ӨГҮҮЛБЭРЭЭР. Хоосон бол хэвлэж болно. */
export function statementError(r: StatementRange): string {
  if (r.from && r.to && r.from > r.to) {
    return "Эхлэх огноо дуусах огнооноос хойш байна";
  }
  return "";
}

/** Хугацааны ХҮНИЙ уншилт — цонхны баримт дээр гарна. */
export function statementRangeText(r: StatementRange): string {
  if (!r.from && !r.to) return "Бүх хугацаа — эхний бичилтээс өнөөдрийг хүртэл";
  if (!r.from) return `${r.to} хүртэл`;
  if (!r.to) return `${r.from}-наас өнөөдрийг хүртэл`;
  return `${r.from} – ${r.to}`;
}

/** Серверийн хаяг. Хоосон талбар нь query-д ОГТ ОРОХГҮЙ — «from=» гэсэн
 *  хоосон утга нь сервер дээр 422 болно. */
export function statementUrl(clientId: number, r: StatementRange): string {
  const q = new URLSearchParams();
  if (r.from) q.set("from", r.from);
  if (r.to) q.set("to", r.to);
  const s = q.toString();
  return `/api/clients/${clientId}/statement-pdf${s ? `?${s}` : ""}`;
}

/* Хуанлийн цэвэр логик (React-гүй, хамааралгүй, детерминистик).
 * Долоо хоног ДАВАА гарагаас эхэлнэ (Монгол ёсоор): Да Мя Лх Пү Ба Бя Ня.
 * Огноог "YYYY-MM-DD" тэмдэгт мөрөөс задлаад ЛОКАЛ Date-ээр уншина —
 * new Date("YYYY-MM-DD") нь UTC-гээр уншдаг тул хэрэглэхгүй (нэг хоногийн хазайлт). */

export type TLEvent = { date: string; kind: string; title: string; sub: string };

/** month нь 1-12 (хүн уншдаг дугаар). */
export type YearMonth = { year: number; month: number };

export type DayCell = {
  day: number | null; // жагсаалтын хоосон нүд бол null
  inMonth: boolean;
  iso: string; // "YYYY-MM-DD"; хоосон нүд бол ""
  events: TLEvent[];
  counts: Record<string, number>; // төрөл бүрийн тоо
};

export type MonthGrid = {
  year: number;
  month: number; // 1-12
  weeks: DayCell[][]; // мөр бүр яг 7 нүд, Даваа-аас эхэлнэ
};

const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** "YYYY-MM-DD" → {year, month, day} (цагийн бүсгүй, зүгээр л задлана). */
export function parseIso(iso: string): YearMonth & { day: number } {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  return { year: y, month: m, day: d };
}

/** getDay() 0=Ням..6=Бямба → Даваа-аас эхлэх индекс 0=Да..6=Ня. */
function mondayIndex(year: number, month: number, day: number): number {
  const wd = new Date(year, month - 1, day).getDay(); // ЛОКАЛ огноо
  return (wd + 6) % 7;
}

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Эвент бүхий ялгаатай он-сарууд, өсөхөөр эрэмбэлсэн. */
export function monthsWithEvents(events: TLEvent[]): YearMonth[] {
  const seen = new Set<string>();
  const out: YearMonth[] = [];
  for (const e of events) {
    if (!e.date) continue;
    const { year, month } = parseIso(e.date);
    const key = `${year}-${pad(month)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ year, month });
    }
  }
  out.sort((a, b) => (a.year - b.year) || (a.month - b.month));
  return out;
}

/** Эвент бүхий хамгийн сүүлийн (ойрын) сар; байхгүй бол null. */
export function latestMonth(events: TLEvent[]): YearMonth | null {
  const ms = monthsWithEvents(events);
  return ms.length ? ms[ms.length - 1] : null;
}

/** ХУАНЛИ ЯМАР САР ДЭЭР НЭЭГДЭХ ВЭ — ӨНӨӨДРИЙН сар.
 *
 *  Урьд нь `latestMonth(events)` байв: Бутангуудын сүүлчийн бичилт 6-р сард
 *  тул хуудас нь 9-р сарын 5-нд ч 6-р сарыг нээж зогсоно. Отгоо тэр агшинд
 *  төлбөр бүртгэвэл ТЭР ТӨЛБӨР ХАРАГДАХГҮЙ — өнөөдрийн цэг нүднээс гурван
 *  сарын цаана байна. «Дараад юу ч болсонгүй» гэсэн мэдрэмж ЯГ эндээс.
 *
 *  Хуанли нь ТҮҮХИЙН архив биш, ажлын дэвтэр: өнөөдрөөс эхэлж, хойшоо ‹ ›
 *  товчоор явна. */
export function seedMonth(todayIso: string): YearMonth {
  const { year, month } = parseIso(todayIso);
  return { year, month };
}

/** ЭВЕНТҮҮД ӨӨРЧЛӨГДСӨН ҮҮ гэдгийн ГАРЫН ҮСЭГ — тоо + хамгийн сүүлийн огноо.
 *
 *  Хуудас 60 секунд тутам өөрөө шинэчлэгддэг (`useLive`). Тэр шинэчлэлт бүр
 *  дээр сонгосон өдрийг нь хөдөлгөвөл Отгоо 6-р сарыг уншиж байхад дэлгэц нь
 *  доороос нь татагдана. Тиймээс ЯГ ижил өгөгдөл ирвэл ЮУ Ч болохгүй; ШИНЭ
 *  явдал ирсэн үед л (гарын үсэг солигдоно) хуанли өнөөдөр рүүгээ эргэнэ. */
export function eventsKey(events: TLEvent[]): string {
  let latest = "";
  let n = 0;
  for (const e of events) {
    if (!e.date) continue;
    n += 1;
    if (e.date > latest) latest = e.date;
  }
  return `${n}:${latest}`;
}

/** Тухайн сарын дотор эвенттэй хамгийн сүүлийн өдөр (iso), байхгүй бол null.
 *  Нээх үед сонгогдох анхны өдрийг тодорхойлоход хэрэглэнэ. */
export function latestDayInMonth(events: TLEvent[], year: number, month: number): string | null {
  let best: string | null = null;
  for (const e of events) {
    if (!e.date) continue;
    const p = parseIso(e.date);
    if (p.year === year && p.month === month) {
      if (best === null || e.date > best) best = e.date;
    }
  }
  return best;
}

/** Тухайн өдрийн (iso) эвентүүд. */
export function eventsOn(events: TLEvent[], iso: string): TLEvent[] {
  return events.filter((e) => e.date === iso);
}

/** Он-сарын нэмэх/хасах (навигацид). */
export function addMonth(ym: YearMonth, delta: number): YearMonth {
  const zero = (ym.year * 12 + (ym.month - 1)) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/** Рендерт бэлэн сарын тор: мөр = долоо хоног, нүд = өдөр.
 *  Эхэнд/сүүлд эгнүүлэх хоосон нүднүүдтэй. Даваа-аас эхэлнэ. */
export function buildMonthGrid(events: TLEvent[], year: number, month: number): MonthGrid {
  // Эвентүүдийг өдрөөр нь бүлэглэх (зөвхөн тухайн сарынхыг)
  const byDay = new Map<string, TLEvent[]>();
  for (const e of events) {
    if (!e.date) continue;
    const p = parseIso(e.date);
    if (p.year !== year || p.month !== month) continue;
    const arr = byDay.get(e.date);
    if (arr) arr.push(e);
    else byDay.set(e.date, [e]);
  }

  const lead = mondayIndex(year, month, 1); // эхний хоосон нүдний тоо
  const total = daysInMonth(year, month);

  const cells: DayCell[] = [];
  const blank = (): DayCell => ({ day: null, inMonth: false, iso: "", events: [], counts: {} });
  for (let i = 0; i < lead; i++) cells.push(blank());
  for (let d = 1; d <= total; d++) {
    const iso = isoOf(year, month, d);
    const dayEvents = byDay.get(iso) || [];
    const counts: Record<string, number> = {};
    for (const e of dayEvents) counts[e.kind] = (counts[e.kind] || 0) + 1;
    cells.push({ day: d, inMonth: true, iso, events: dayEvents, counts });
  }
  while (cells.length % 7 !== 0) cells.push(blank());

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { year, month, weeks };
}

/** Хуанлийн нүдний дуудагдах нэр.
 *
 *  Тор дотор өдөр бүр өнгөт цэгээр л ярьдаг — цэг ХАРАХ хүнд зориулагдсан.
 *  Дэлгэц уншигчаар явж буй хүнд нүд бүр «8-р сарын 25 · 2 үйл явдал
 *  (төлбөр 1, ачилт 1)» гэж бүтнээр нь хэлж өгнө.
 *
 *  @param counts төрөл→тоо (buildMonthGrid-ийн DayCell.counts)
 *  @param labels төрлийн код→монгол нэр. Байхгүй кодыг өөрөөр нь дуудна —
 *         шинэ төрөл нэмэгдэхэд чимээгүй алга болохоос сэргийлнэ. */
export function dayCellLabel(
  iso: string,
  counts: Record<string, number>,
  labels: Record<string, string>,
): string {
  const { month, day } = parseIso(iso);
  const head = `${month}-р сарын ${day}`;
  const parts = Object.keys(counts)
    .filter((k) => counts[k] > 0)
    .map((k) => `${labels[k] || k} ${counts[k]}`);
  if (parts.length === 0) return `${head} · үйл явдалгүй`;
  const total = Object.keys(counts).reduce((s, k) => s + (counts[k] > 0 ? counts[k] : 0), 0);
  return `${head} · ${total} үйл явдал (${parts.join(", ")})`;
}

/** Долоо хоногийн толгойн богино нэрс (Даваа-аас). */
export const WEEKDAYS_MN = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"] as const;

/** "2026 оны 4-р сар" гэх мэт сарын гарчиг. */
export const monthLabelMN = (year: number, month: number) => `${year} оны ${month}-р сар`;

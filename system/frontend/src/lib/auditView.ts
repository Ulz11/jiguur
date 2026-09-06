import { addDays } from "./schedule";

/* ҮЙЛДЛИЙН БҮРТГЭЛИЙН ШҮҮЛТ — ЦЭВЭР ЛОГИК.
 *
 * Хуудас нь `/api/audit?limit=300` гэсэн ГАНЦ хүсэлт явуулж, буцаж ирсэн
 * 300 мөрөө өөрөө шүүдэг байв. Гурван зүйл эндээс эвдэрсэн:
 *
 *   1. Сервер 500 мөрийг санал болгодог мөртөө 300-аар тасалдаг тул гурав
 *      хоногийн өмнөх өөрчлөлт нь БАЙГАА боловч ХҮРЭХГҮЙ (`offset`, `total`
 *      хоёр огт ашиглагдаагүй).
 *   2. Шүүлтүүрийн товч нь АЧААЛАГДСАН мөрүүдээс төрдөг: сүүлийн 300 мөрөнд
 *      «Бартер» байхгүй бол тэр товч огт гарахгүй — Отгоо эгч «бартерын
 *      түүх алга» гэж уншина. Толь нь дүүрэн байхад.
 *   3. Огнооны цонх БАЙХГҮЙ: «өнгөрсөн долоо хоногт хэн юу зассан бэ»
 *      гэсэн асуулт нүдээр гүйлгэхээс өөр хариугүй.
 *
 * Одоо шүүлт СЕРВЕР дээр болно. Энэ файл нь тэр хүсэлтийн бүтэц ба огнооны
 * форматыг барина — DOM-гүй, сүлжээгүй тул тестээр бүрэн барьцаалагдана.
 */

/** Анхдагч цонх: СҮҮЛИЙН 30 ХОНОГ (өнөөдөр ч мөн ОРНО). */
export const DEFAULT_DAYS = 30;

/** Нэг хуудсанд татах мөрийн тоо — серверийн дээд хязгаар нь 500. */
export const PAGE = 200;

export type AuditFilter = {
  from: string;
  to: string;
  action: string;
  entity: string;
  /** Хэн — серверт `user` нэрээр очно (хэсэгчилсэн тулгалт). */
  who: string;
  q: string;
  offset: number;
};

/** «Сүүлийн 30 хоног» — хоёр үзүүр нь хоёулаа ОРНО (сервер ч ижилхэн). */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -(DEFAULT_DAYS - 1)), to: today };
}

export function defaultFilter(today: string): AuditFilter {
  return { ...defaultRange(today), action: "", entity: "", who: "", q: "", offset: 0 };
}

/** Шүүлт нь АНХДАГЧААСАА хөдөлсөн үү — «Бүгдийг арилгах» товч хэрэгтэй юу. */
export function filterTouched(f: AuditFilter, today: string): boolean {
  const d = defaultFilter(today);
  return f.from !== d.from || f.to !== d.to || !!f.action || !!f.entity
      || !!f.who.trim() || !!f.q.trim();
}

/** `/api/audit?…` — ХООСОН талбар огт явахгүй (сервер хоосон мөрөөр шүүхгүй
 *  ч URL нь уншигдахуйц үлдэнэ).
 *
 *  `mine` — «Миний бүртгэл» (`/api/audit/mine`, бүх рольд нээлттэй). Тэр
 *  хаалга нь дуудагчийнхаа мөрийг л мэддэг тул «Хэн» шүүлт утгагүй: огт
 *  явуулахгүй (сервер ч түүнийг үл тоох боловч URL нь худал амлахгүй). */
export function auditQuery(f: AuditFilter, mine = false): string {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.action) p.set("action", f.action);
  if (f.entity) p.set("entity", f.entity);
  if (!mine && f.who.trim()) p.set("user", f.who.trim());
  if (f.q.trim()) p.set("q", f.q.trim());
  p.set("limit", String(PAGE));
  if (f.offset > 0) p.set("offset", String(f.offset));
  return `/api/audit${mine ? "/mine" : ""}?${p.toString()}`;
}

/**
 * «2026-09-06T14:03:22+08:00» → «2026-09-06 14:03».
 *
 * Серверийн `local_at` нь АЛЬ ХЭДИЙН Улаанбаатарын цаг (`+08:00`) тул
 * `new Date(...)` рүү оруулж дахин хөрвүүлэх ЁСГҮЙ: тестийн хөтөч өөр
 * бүсэд байвал 06:00-д гүйсэн cron нь 22:00 гэж харагдана. Мөрийг нь
 * ЗҮГЭЭР ЛЕ огтолно — цаг нь тэр мөрөнд аль хэдийн бичигдсэн.
 *
 * ⚠ «T» ба «+08:00» нь ЛАТИН тул дэлгэц дээр ХЭЗЭЭ Ч түүхийгээрээ гарахгүй
 *   (`her/mongolian.spec.ts`).
 */
export function localStamp(localAt: string | null | undefined, fallback = ""): string {
  const raw = (localAt || "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(raw);
  if (m) return `${m[1]} ${m[2]}`;
  // Хуучин мөр (`local_at` байхгүй) — `at` нь «2026-09-06 14:03:22» хэлбэртэй.
  const f = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec((fallback || "").trim());
  return f ? `${f[1]} ${f[2]}` : (raw || fallback || "—");
}

/** ЯГ ЭНЭ ӨДӨР хийгдсэн үү — өнөөдрийн мөрийг «14:03» гэж богиносгохгүй,
 *  зөвхөн ЯЛГАНА (өдөр нь мөрөн дээр ҮРГЭЛЖ үлдэнэ: Отгоо огноогүй цагийг
 *  «хэзээ билээ» гэж асуудаг). */
export function isToday(stamp: string, today: string): boolean {
  return stamp.slice(0, 10) === today;
}

export type Paging = { shown: number; total: number; hasMore: boolean; nextOffset: number };

export function paging(shown: number, total: number): Paging {
  const hasMore = shown < total;
  return { shown, total, hasMore, nextOffset: shown };
}

/** «1–200 / 1,431 бичилт» — Отгоо хаана явааг нь МӨРӨӨР хэлнэ. */
export function pagingLabel(p: Paging): string {
  const n = p.total.toLocaleString("en-US");
  if (p.total === 0) return "0 бичилт";
  return `${p.shown.toLocaleString("en-US")} / ${n} бичилт`;
}

/** Хоосон төлөв нь ХУГАЦААГАА нэрлэнэ — «алга» гэдэг дангаараа мухардмал. */
export function emptyText(f: AuditFilter): string {
  return `${f.from} – ${f.to}`;
}

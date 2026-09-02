/* ЧӨЛӨӨТ АКТ — тэмдэг, шошго, буух цикл. Нэг л газар шийдэгдэнэ.
 *
 * Отгоо эгчийн «акт» бол эвдрэлийн хөлс биш, ХЭЛЭЛЦЭЭРИЙН гарын үсэгтэй
 * баримт: тээвэр, цэвэрлэгээ, кран дуудлага нэг циклд эвхэгддэг, БАС
 * хөнгөлөлт байдаг («нийт актнаас 15% хасч тооцлоо» — Чадварын харьцуулалт
 * R12 / H4).
 *
 * ТЭМДЭГ НЬ СОНГОЛТ, бичих зүйл БИШ: тэр Excel дээрээ хасах тэмдэг бичдэггүй,
 * «хасч тооцлоо» гэж ҮГЭЭР бичдэг. Тиймээс маягт дээр Нэмэгдэл/Хөнгөлөлт гэсэн
 * хоёр товч + ЭЕРЭГ дүн байна; тэмдгийг энэ файл тавина. Буцааж уншихдаа ч
 * ижил: сөрөг дүн бол хөнгөлөлт.
 *
 * ЦЭВЭР логик: React-гүй, сүлжээгүй, детерминистик.
 */
import { isoOf, parseIso } from "./calendar";
import { cycleLabel } from "./cycle";
import { fmt, parseMoney } from "./num";
import { daysBetween } from "./schedule";
import { isVoided, type Voidable } from "./void";

export type AktKind = "charge" | "discount";

/** Маягтын хоёр товч — эрэмбэ нь утгатай: НЭМЭГДЭЛ нь түгээмэл тохиолдол. */
export const AKT_KINDS: [AktKind, string][] = [
  ["charge", "Нэмэгдэл (+)"],
  ["discount", "Хөнгөлөлт (−)"],
];

/** Сонголт + бичсэн тоо → ХАДГАЛАГДАХ дүн. Сонголт нь тэмдгийг ЭЗЭМШИНЭ:
 *  хэрэглэгч санамсаргүй хасах бичсэн ч «Нэмэгдэл» нь нэмэгдэл хэвээр. */
export function aktSigned(kind: AktKind, raw: string | number): number {
  const n = Math.abs(parseMoney(raw));
  return kind === "discount" ? -n : n;
}

/** Хадгалагдсан дүн → сонголт (мөр засах цонхны эхний утга). */
export function aktKind(amount: number): AktKind {
  return amount < 0 ? "discount" : "charge";
}

/** Мөрөн дээрх дүн: тэмдэг нь дүнгийнхээ ӨМНӨ зогсоно.
 *  Хасах нь ЖИНХЭНЭ хасах тэмдэг (U+2212) — зураас биш, нүдэнд тодорхой. */
export function aktAmountText(amount: number): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${fmt(Math.abs(amount))}₮`;
}

/** ХҮЧИНТЭЙ актын бичилтүүдийн Σ — нэмэгдэл ба хөнгөлөлт НЭГ тэмдэгт дүнд.
 *
 *  Отгоо эгчийн өөрийнх нь дүрэм («нийт актнаас 15% хасч тооцлоо ×0.85») энэ
 *  тоог СУУРЬ болгодог. Тэр «нийт акт» гэсэн тоо дэлгэц дээр ч, цаасан дээр ч
 *  байхгүй байсан тул мөр бүрийг нүдээрээ нэмэхээс өөр арга үлддэггүй байв.
 *
 *  ХҮЧИНГҮЙ мөр Σ-д ОРОХГҮЙ: цуцлалт бол устгал биш — мөр нь түүхэндээ
 *  зурагдсан хэвээр үлдэж, зөвхөн ТООЦООНООС гарна (`lib/void.ts`-ийн дүрэм). */
export function aktTotal(rows: (Voidable & { amount: number })[] | null | undefined): number {
  return (rows || []).reduce((s, r) => (isVoided(r) ? s : s + (r.amount || 0)), 0);
}

/** Нэхэмжлэл, хавсралт, акт-PDF дээр гарах шошго — СЕРВЕРИЙНХТЭЙ ижил үг
 *  (`billing.akt_charges_in`). Дэлгэц ба цаас хоёр зөрвөл аль нь үнэн бэ
 *  гэсэн асуулт төрнө. */
export function aktLabel(note: string): string {
  return `Акт: ${note}`;
}

/* ---------- Мөр АЛЬ циклд унах вэ ---------- */

export type AktContract = {
  start_date?: string | null;
  cycle_mode?: string | null;
  cycle_days?: number | null;
};

export type AktWindow = { start: string; end: string };

const shiftDays = (iso: string, n: number): string => {
  const { year, month, day } = parseIso(iso);
  const d = new Date(year, month - 1, day + n);      // ЛОКАЛ огноо
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

/** `anchor`-оос n сарын дараах ЗАНГИЛАА — сарын уртад хумигдана.
 *  Хумилт ХАДГАЛАГДАХГҮЙ (үргэлж anchor-оос бодогдоно) тул зангилаа
 *  боломжтой газраа ЭРГЭЖ очно: 1.31 → 2.28 → 3.31 (сервертэй ижил дүрэм). */
const addMonths = (anchor: string, n: number): string => {
  const { year, month, day } = parseIso(anchor);
  const m0 = month - 1 + n;
  const y = year + Math.floor(m0 / 12);
  const m = ((m0 % 12) + 12) % 12 + 1;
  const last = new Date(y, m, 0).getDate();
  return isoOf(y, m, Math.min(day, last));
};

/** Огноо буух ХАГАС НЭЭЛТТЭЙ цонх [start, end). Гэрээний эхлэлээс өмнө — null.
 *  Серверийн `billing.cycle_of`-ийн толь: маягт дээрх амьд мөрд зориулав
 *  (жагсаалтын мөрүүд цонхоо СЕРВЕРЭЭС авдаг). */
export function aktCycle(c: AktContract, dateIso: string): AktWindow | null {
  const start = (c.start_date || "").trim();
  const d = (dateIso || "").trim();
  if (!start || !d || daysBetween(start, d) < 0) return null;

  if ((c.cycle_mode || "days") === "month") {
    const a = parseIso(start);
    const b = parseIso(d);
    let n = (b.year - a.year) * 12 + b.month - a.month;
    for (let i = 0; i < 4; i++) {                   // хумилтын хазайлт ≤ 1 алхам
      n = Math.max(n, 0);
      const s = addMonths(start, n);
      const e = addMonths(start, n + 1);
      if (daysBetween(s, d) < 0) { n -= 1; continue; }
      if (daysBetween(e, d) >= 0) { n += 1; continue; }
      return { start: s, end: e };
    }
    return null;
  }

  const step = c.cycle_days && c.cycle_days > 0 ? c.cycle_days : 30;
  const n = Math.floor(daysBetween(start, d) / step);
  return { start: shiftDays(start, n * step), end: shiftDays(start, (n + 1) * step) };
}

/** Циклийн нэр — НЭХЭМЖЛЭЛИЙН мөртэй ижил хэлбэр (`invoiceLabel`), тул
 *  Отгоо актын мөрөө нэхэмжлэлийнхээ мөртэй нүдээрээ тулгана. */
export function aktCycleLabel(w: AktWindow | null | undefined): string {
  return w ? cycleLabel(w.start, w.end) : "—";
}

/** Маягт дээрх АМЬД мөр: бичиж буй огноо хаашаа буухыг ХАДГАЛАХААС ӨМНӨ хэлнэ. */
export function aktLandingText(c: AktContract, dateIso: string): string {
  if (!(dateIso || "").trim()) return "";
  const w = aktCycle(c, dateIso);
  if (!w) return "Огноо гэрээний эхлэлээс өмнө байна — цикл олдохгүй";
  return `Энэ бичилт ${aktCycleLabel(w)} циклд орно`;
}

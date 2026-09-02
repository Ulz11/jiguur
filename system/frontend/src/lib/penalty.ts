/* АЛДАНГИ — хоёр нүүр, нэг л газар тодорхойлогдоно.
 *
 * Отгоо эгч 20 жилийн Excel-дээ алданги ГАНЦ УДАА ч тооцоогүй: хуудас бүр
 * дээр «гэрээний 4.2-т зааснаар алданга тооцно» гэж ЗАРЛАГДСАН боловч хэзээ
 * ч нэхэгдээгүй. Тэр бол төлбөр биш — утсаар ярихад хэрэглэдэг ХӨШҮҮРЭГ
 * (Чадварын харьцуулалт R25 / H2).
 *
 * Тиймээс дэлгэц бүр дээр алданги ХОЁР тоо болж задарна:
 *   · НЭХЭГДСЭН   — Отгоо ил нэхсэн. Мөнгө: төлбөр үүнийг хаана.
 *   · НЭХЭГДЭЭГҮЙ — зөвхөн тооцоолол. Хэдийг өршөөж байгаагаа тэр АНХ УДАА
 *                   харна; хөшүүрэг нь сулрахгүй, ХҮЧТЭЙ болно.
 * Хоёрыг нэг тоо болгож нийлүүлбэл «машин өр зохиов» гэж уншигдана.
 *
 * Энэ файл нь ЦЭВЭР логик: React-гүй, сүлжээгүй, детерминистик.
 */
import { daysBetween } from "./schedule";
import type { Voidable } from "./void";

export type PenaltySplit = {
  /** Ил нэхэгдсэн — төлөгдөнө */
  booked: number;
  /** Зөвхөн тооцоолол — төлөгдөхгүй */
  unbooked: number;
  /** Хоёулангийнх нь нийлбэр (нэг тоо хэрэгтэй ховор газарт) */
  total: number;
  /** Дэлгэц дээр нэхэгдээгүй мөрийг харуулах ёстой юу */
  showUnbooked: boolean;
};

/** Серверийн `penalty` (нийт) ба `penalty_due`/`penalty_booked` (нэхэгдсэн)
 *  хоёрыг дэлгэцийн хоёр мөр болгоно. Дугуйлалтын сөрөг үлдэгдэл гарахгүй. */
export function penaltySplit(total: number | undefined,
                             booked: number | undefined): PenaltySplit {
  const t = Math.max(total || 0, 0);
  const b = Math.min(Math.max(booked || 0, 0), t);
  const u = Math.max(t - b, 0);
  return { booked: b, unbooked: u, total: t, showUnbooked: u > 0.5 };
}

/** Нэхэгдээгүй тоог УНШИХАД алдангийн шошго — ганц эх сурвалж, нэг үг. */
export const UNCHARGED = "нэхэгдээгүй";

/* ---------- «Алданги нэхэх» баримтын урьдчилсан тооцоо ----------
 *
 * Серверийн `billing._book_invoices`-ийн ТОЛЬ. Модал дээрх `as_of` талбарыг
 * Отгоо өөрчилж болдог тул тоог нь сервер рүү очилгүйгээр дахин бодох
 * ёстой — тэр дараа нь ЯГ энэ мөрүүдийг батална.
 */
export type PenaltyInvoice = {
  id: number;
  no: string;
  outstanding: number;
  due_date: string;
  /** Алданги хаанаас хойш бодогдох вэ (= max(хугацаа, сүүлд нэхсэн өдөр)) */
  penalty_since?: string;
  cycle_start?: string;
  cycle_end?: string;
};

export type PenaltyChargeRow = {
  id: number;
  no: string;
  days: number;
  amount: number;
  cycle_start?: string;
  cycle_end?: string;
};

/** `asOf` өдрөөр нэхэгдэх мөрүүд. Хоосон бол нэхэх зүйл алга. */
export function penaltyChargeRows(invoices: PenaltyInvoice[] | undefined,
                                  percent: number, asOf: string): PenaltyChargeRow[] {
  if (!(percent > 0) || !asOf) return [];
  const rows: PenaltyChargeRow[] = [];
  for (const inv of invoices || []) {
    const out = inv.outstanding || 0;
    if (out <= 0.005) continue;                      // үндсэн дүн хаагдсан → өсөхгүй
    if (daysBetween(inv.due_date, asOf) <= 0) continue;  // хугацаа хэтрээгүй
    const since = inv.penalty_since || inv.due_date;
    const days = daysBetween(since, asOf);
    if (days <= 0) continue;                         // ХОЙШОО явахгүй (аль хэдийн нэхсэн)
    rows.push({ id: inv.id, no: inv.no, days,
                amount: (out * percent / 100) * days,
                cycle_start: inv.cycle_start, cycle_end: inv.cycle_end });
  }
  return rows;
}

export function penaltyChargeTotal(rows: PenaltyChargeRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

/* ---------- НЭХЭЛТИЙН ТҮҮХ ба түүнийг БУЦААХ (R25 / H2 · H1) ----------
 *
 * Нэхэлт бүр ЯВДАЛ болж үлддэг байсан ч дэлгэц дээр ХЭЗЭЭ Ч гардаггүй байв —
 * «гаргасан шийдвэрүүдийнх нь жагсаалт бичигдээд үзүүлэгддэггүй». Одоо
 * гэрээний хуудсанд мөр мөрөөрөө гарч, менежер/санхүүч түүнийг ХҮЧИНГҮЙ
 * болгож чадна: хөшүүрэг гэдэг нь ТАТАГДААД СУЛАРДАГ гэсэн үг.
 */
export type PenaltyChargeEvent = Voidable & {
  id: number;
  /** Ямар өдрөөр нэхсэн — ТҮЛХЭЦ (дүн нь зөвхөн баримт) */
  as_of: string;
  amount: number;
  user_name?: string;
  created_at?: string | null;
};

/** Хүчинтэй (цуцлагдаагүй) нэхэлтүүд — `aktTotal`-ийн ах дүү дүрэм. */
export function liveCharges(rows: PenaltyChargeEvent[] | undefined | null):
    PenaltyChargeEvent[] {
  return (rows || []).filter((r) => !r.voided);
}

/** Хүчинтэй нэхэлтүүдийн НИЙЛБЭР — цуцлагдсан мөр орохгүй. */
export function chargedTotal(rows: PenaltyChargeEvent[] | undefined | null): number {
  return liveCharges(rows).reduce((s, r) => s + (r.amount || 0), 0);
}

/** Мөрийн дуудагдах нэр: «2026-08-31 өдрөөр нэхсэн алданги». */
export function chargeLabel(ch: PenaltyChargeEvent): string {
  return `${ch.as_of} өдрөөр нэхсэн алданги`;
}

/** Энэ мөрийг цуцлахад нэхэлтийн ХИЛ нь ӨӨР амьд нэхэлтээр баригдсаар үлдэх үү?
 *
 *  Нэхэлт нь ОГНООГ хадгалдаг, хөлдсөн дүнг биш: сервер тал цуцалсны дараа
 *  амьд үлдсэн явдлуудыг ДАХИН тоглуулна. Тиймээс хожуу нэхэлт амьд байвал
 *  тэр нь цэвэрлэгдсэн нэхэмжлэл дээр хугацаа хэтэрснээс хойших БҮХ хоногийг
 *  дахин нэхэж, нэхэгдсэн дүн БУУРАХГҮЙ байж болно. Цонх үүнийг ДАРАХААС
 *  ӨМНӨ хэлэх ёстой — «дарлаа, юу ч болсонгүй» гэж уншигдахгүйн тулд. */
export function laterLiveCharge(rows: PenaltyChargeEvent[] | undefined | null,
                                ch: PenaltyChargeEvent): PenaltyChargeEvent | undefined {
  return liveCharges(rows)
    .filter((r) => r.id !== ch.id && r.as_of > ch.as_of)
    .sort((a, b) => (a.as_of < b.as_of ? -1 : a.as_of > b.as_of ? 1 : 0))
    .pop();
}

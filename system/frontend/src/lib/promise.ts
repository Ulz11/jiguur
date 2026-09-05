/* АМЛАЛТ · ХОЛБОО БАРЬСАН ТҮҮХ — ХОЁР ДЭЛГЭЦИЙН НЭГ ДЭВТЭР.
 *
 * Отгоо эгч харилцагч руу залгаад «Даваа гарагт 5 сая шилжүүлнэ» гэсэн
 * амлалт авдаг. Тэр мөрийг «Авлага цуглуулах» дээрээс бичдэг ч ХАРИЛЦАГЧИЙН
 * хуудсан дээр тэр түүх ОГТ гардаггүй байв (сервер нь `notes`-оо илгээж
 * байсан атал хуудас нь зурдаггүй). Тиймээс тэр харилцагчийн хуудас нээгээд
 * «энэ хүн юу гэж байсан билээ» гэдгээ мэдэхийн тулд өөр дэлгэц рүү явна.
 *
 * Дүрмүүд нь ЭНД, тесттэйгээ: хоёр хуудас ЯГ ижил үг, ижил төлөв харуулна.
 */

export type CollectionNote = {
  id: number;
  date: string;
  kind: string;
  note: string;
  promise_date?: string | null;
  promise_amount?: number;
  status?: string;
  user_name?: string;
};

/** Холбогдсон хэлбэр — «Авлага цуглуулах» цонхтой ИЖИЛ дараалал, ижил үг. */
export const PROMISE_KINDS: [string, string][] = [
  ["call", "Утсаар"], ["visit", "Уулзсан"], ["message", "Мессеж"], ["other", "Бусад"],
];

const KIND_MN: Record<string, string> = Object.fromEntries(PROMISE_KINDS);

/** Танихгүй хэлбэр нь ТҮҮХИЙ түлхүүрээ зурахгүй — зөөлөн унана. */
export function promiseKindLabel(kind: string | null | undefined): string {
  return KIND_MN[(kind || "").trim()] ?? "Бусад";
}

export type PromiseState = { cls: string; label: string } | null;

/** Мөрийн ТӨЛӨВ. Амлалтгүй дуудлага дээр `null` — хий шошго нэмэхгүй
 *  (чимээгүй байдал нь «зүгээр л ярьсан» гэсэн анхны төлөв).
 *
 *  · `kept`   → «Биелсэн»           (мөнгө орсон)
 *  · `broken` → «Зөрчсөн»           (хаагдсан, биелээгүй)
 *  · нээлттэй, огноо нь өнгөрсөн → «Хугацаа хэтэрсэн»
 *  · нээлттэй, ирээдүйд           → «Амласан» */
export function promiseState(n: CollectionNote, today: string): PromiseState {
  const date = (n.promise_date || "").trim();
  const amount = n.promise_amount || 0;
  if (!date && amount <= 0) return null;
  if (n.status === "kept") return { cls: "pill-green", label: "Биелсэн" };
  if (n.status === "broken") return { cls: "pill-red", label: "Зөрчсөн" };
  if (date && date < today) return { cls: "pill-red", label: "Хугацаа хэтэрсэн" };
  return { cls: "pill-amber", label: "Амласан" };
}

/** «2026-09-08-нд 5,000,000₮» — амлалтын мөр. Амлалтгүй бол ХООСОН. */
export function promiseLine(n: CollectionNote, fmtMoney: (v: number) => string): string {
  const date = (n.promise_date || "").trim();
  const amount = n.promise_amount || 0;
  if (!date && amount <= 0) return "";
  if (!date) return fmtMoney(amount);
  return amount > 0 ? `${date}-нд ${fmtMoney(amount)}` : `${date}-нд`;
}

/** «2026-09-05 · Утсаар · Ч.Отгонцэцэг» — мөрийн толгой.
 *  Зохиогчгүй мөр (шилжүүлэг) дээр тусгаарлагч дангаараа үлдэхгүй. */
export function promiseHead(n: CollectionNote): string {
  return [n.date, promiseKindLabel(n.kind), (n.user_name || "").trim()]
    .filter((s) => s && s.trim()).join(" · ");
}

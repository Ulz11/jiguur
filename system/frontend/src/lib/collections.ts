/* АВЛАГА ЦУГЛУУЛАХ ХУУДАСНЫ ЦЭВЭР ЛОГИК.
 *
 * Хоёр зүйл энд амьдарна:
 *
 * 1. ШҮҮЛТҮҮР БА ЭРЭМБЭ НЬ ХАЯГАН ДЭЭР. Урьд нь `useState`-д сууж байсан:
 *    Отгоо «Амлалт зөрчсөн» гэж шүүгээд нэг харилцагч руу орж, буцах товч
 *    дарахад ЖАГСААЛТ БҮГД болж эргэн ирдэг — тэр дөнгөж хаана байснаа
 *    алдана. Хаяг дээр байвал буцах товч, хавчуурга, дахин ачаалалт гурвуулаа
 *    ямар ч нэмэлт кодгүй ажиллана (`lib/links.ts`-ийн гэрээний шүүлтүүртэй
 *    ЯГ ижил журам).
 *
 * 2. АМЛАЛТЫН ТӨЛӨВ. Амлалт хаагдахгүй бол «Амлалт зөрчсөн» тоолуур ХЭЗЭЭ Ч
 *    буурахгүй: төлбөр нь орсон ч мөр нь нээлттэй хэвээр тоологдоод,
 *    дашбоардын улаан мэдэгдэл үүрд үлдэнэ.
 */
import type { SortDir, SortState } from "./sort";

/* ---------- Шүүлтүүр ---------- */

export const COLLECTION_FILTERS = ["all", "nocontact", "late", "promised", "old"] as const;
export type CollectionFilter = (typeof COLLECTION_FILTERS)[number];

/** Хаягнаас уншсан шүүлтүүр — танихгүй үг «бүгд» рүү унана (буруу линк
 *  Отгоод хоосон хүснэгт үзүүлэх ёсгүй). */
export function collectionFilterFrom(raw: string | null | undefined): CollectionFilter {
  return (COLLECTION_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as CollectionFilter) : "all";
}

/* ---------- Эрэмбэ ---------- */

export const COLLECTION_SORTS = ["overdue", "oldest"] as const;
export type CollectionSortKey = (typeof COLLECTION_SORTS)[number];

/** Анхны эрэмбэ = хамгийн их хэтэрсэн нь дээрээ. Энэ жагсаалт «хэнд эхэлж
 *  залгах вэ» гэсэн НЭГ асуултад хариулдаг тул эрэмбэ хоосон байж болохгүй. */
export const DEFAULT_SORT: SortState<CollectionSortKey> = { key: "overdue", dir: "desc" };

/** «oldest-asc» → {key:"oldest", dir:"asc"}. Танихгүй бол анхны эрэмбэ. */
export function collectionSortFrom(raw: string | null | undefined): SortState<CollectionSortKey> {
  const [key, dir] = String(raw ?? "").split("-");
  if (!(COLLECTION_SORTS as readonly string[]).includes(key)) return DEFAULT_SORT;
  return { key: key as CollectionSortKey, dir: dir === "asc" ? "asc" : "desc" };
}

/** Эрэмбийг хаягийн үг болгоно. Анхны эрэмбэ нь ХООСОН — тохиргоогүй хаяг
 *  бохирдохгүй (`scopeHref`-ийн журам). */
export function sortParam(s: SortState<CollectionSortKey>): string {
  return s.key === DEFAULT_SORT.key && s.dir === DEFAULT_SORT.dir ? "" : `${s.key}-${s.dir}`;
}

/** Хуудасны хаяг — шүүлтүүр ба эрэмбийг хоёуланг нь авч явна. */
export function collectionsHref(state: CollectionFilter,
                                sort: SortState<CollectionSortKey>): string {
  const p = new URLSearchParams();
  if (state !== "all") p.set("state", state);
  const so = sortParam(sort);
  if (so) p.set("sort", so);
  const q = p.toString();
  return q ? `/collections?${q}` : "/collections";
}

/* ---------- Амлалтын төлөв ---------- */

export type PromiseStatus = "open" | "kept" | "broken";

/** Мөрөн дээрх төлөвийн ТЭМДЭГ — [үг, пилийн анги]. Нээлттэй амлалт нь
 *  төлөвгүй (болзоо нь өөрөө мөрөн дээр бичигдсэн) тул хоосон. */
export function promiseStatusPill(status: string | null | undefined): [string, string] | null {
  if (status === "kept") return ["Биелсэн ✓", "pill-green"];
  if (status === "broken") return ["Зөрчсөн", "pill-red"];
  return null;
}

/** Хаах товчнууд — зөвхөн НЭЭЛТТЭЙ амлалт дээр гарна.
 *
 *  Хаагдсан амлалтыг дахин хаах утгагүй; нээх нь /audit-аар явна. */
export function canClosePromise(row: { promise_id?: number | null;
                                       promise_status?: string | null }): boolean {
  return !!row.promise_id && (row.promise_status ?? "open") === "open";
}

/** Төлөв солих үйлдлийн ҮР ДҮНГИЙН өгүүлбэр — toast нь юу болсныг хэлнэ. */
export function promiseDoneText(client: string, status: PromiseStatus): string {
  const word = status === "kept" ? "биелсэн" : status === "broken" ? "зөрчсөн" : "нээлттэй";
  return `${client} — амлалт «${word}» болж хаагдлаа`;
}

/** Эрэмбийн ГАРЧГИЙН тайлбар — `aria-label`-д. */
export function sortAria(label: string, cur: SortState<CollectionSortKey>,
                         key: CollectionSortKey): string {
  if (cur.key !== key) return `${label} — эрэмбэлэх`;
  const dir: SortDir = cur.dir === "desc" ? "asc" : "desc";
  return `${label} — ${dir === "asc" ? "багаас их рүү" : "ихээс бага руу"} эрэмбэлэх`;
}

/* ХАРИЛЦАГЧ НЭМЭХ · УСТГАХ — ХОЁР МУХАРДМАЛ ХАНЫГ НЭЭХ.
 *
 * 1. ДАВХАРДАЛ. «+ Шинэ харилцагч» дээр байгаа нэр бичихэд сервер 409-ээр
 *    «Энэ нэртэй харилцагч аль хэдийн бүртгэлтэй: Бутангууд (№4)» гэдэг.
 *    Тэр өгүүлбэр 3.2 секундын toast болж өнгөрдөг тул Отгоо цонхон дотроо
 *    юу болсныг мэдэхгүй үлдэнэ — бөглөсөн зүйл нь хэвээр, товч нь дахин
 *    дарагдана. Сервер `existing_id`-г нь хэлж байхад «тэр хүн хаана байна»
 *    гэдгийг харуулахгүй байх нь бүр ч дор: тэр гараар хайж эхэлнэ.
 *
 * 2. УСТГАЛ. Андуурч бичсэн нэр, хоёр дахин оруулсан мөр нь жагсаалтыг
 *    мөнхөд бохирдуулна. H1 «устгал байхгүй» нь ТҮҮХИЙГ хамгаалдаг дүрэм —
 *    түүхгүй мөрөнд хамаарахгүй. Хаалга нь сервер дээр НАРИЙН (`_attached`);
 *    дэлгэц нь тэр дүрмийн ТОЛЬ — товч нь наалдсан зүйлтэй харилцагч дээр
 *    ОГТ гарахгүй (дарж болдоггүй товч бол хамгийн муу төрлийн эвдрэл).
 *
 * Цэвэр логик (React-гүй, сүлжээгүй): дэлгэц нь зөвхөн зурна.
 */

export type DuplicateInfo = {
  /** Серверийн ӨӨРИЙНХ нь өгүүлбэр — дэлгэц дээр ЯГ энэ гарна. */
  msg: string;
  existingId: number;
  existingName: string;
};

/** Серверийн бүтэцтэй 409-ийг уншина (`clients._duplicate_409`).
 *
 *  `api()` нь алдааны биетийг `err.detail` дээр үлдээдэг. Бүтэцгүй алдаа
 *  (сүлжээ, 500, энгийн мөр) бол `null` — дуудагч тал хуучин замаараа
 *  toast гаргана. */
export function duplicateInfo(e: unknown): DuplicateInfo | null {
  const d = (e as { detail?: unknown } | null)?.detail as
    { msg?: unknown; existing_id?: unknown; existing_name?: unknown } | undefined;
  if (!d || typeof d !== "object") return null;
  const id = Number(d.existing_id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const msg = typeof d.msg === "string" ? d.msg.trim() : "";
  if (!msg) return null;
  return { msg, existingId: id, existingName: String(d.existing_name || "").trim() };
}

/** «Бутангууд руу очих» — холбоосын нэр. Нэргүй бол дугаараараа. */
export function duplicateLinkText(info: DuplicateInfo): string {
  return `${info.existingName || `№${info.existingId}`} руу очих`;
}

export type ClientAttachments = {
  contracts?: unknown[] | null;
  payments?: unknown[] | null;
  entries?: unknown[] | null;
  files?: unknown[] | null;
  notes?: unknown[] | null;
  barter?: unknown[] | null;
};

const LISTS: (keyof ClientAttachments)[] =
  ["contracts", "payments", "entries", "files", "notes", "barter"];

/** ХООСОН ХАРИЛЦАГЧ уу — ганц ч наалдсан мөргүй.
 *
 *  ⚠ Хуучин үлдэгдлийн ЗОХИОМОЛ гэрээ ч ТООЛОГДОНО (серверийн `_attached`
 *  бүх гэрээг тоолдог): дэлгэц сервертэй ижил хариу өгөх ёстой, эс бөгөөс
 *  Отгоо товч дараад татгалзал хүлээж авна. */
export function canDeleteClient(d: ClientAttachments | null | undefined): boolean {
  if (!d) return false;
  return LISTS.every((k) => ((d[k] as unknown[] | null | undefined) || []).length === 0);
}

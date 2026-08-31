/* ХАДГАЛАЛТ ЧИМЭЭГҮЙ УНАХГҮЙ (Чадварын харьцуулалт H10).
 *
 * `InlineEdit` нь татгалзсан хадгалалтыг (403, валидаци, сүлжээ) залгидаг
 * байв: Отгоо эгч залруулгаа бичээд ✓ дарахад ЮУ Ч болохгүй, тоо нь хуучнаараа
 * үлдэнэ. Дэлгэц дээр болж буйг анзаардаггүй, машинд аль хэдийн итгэлгүй
 * хүнд «машин бичсэнийг минь алдлаа» гэдэг бол ЭЦСИЙН шийдвэр — тэр Excel рүү
 * буцна.
 *
 * Тиймээс татгалзал нь ГУРВАН мөрөөр гарна:
 *   1. талбар засварын горимд ҮЛДЭНЭ, бичсэн утга нь байрандаа;
 *   2. яг тэр талбарын доор улаан хүрээ + богино шалтгаан;
 *   3. тэндээс явахад «{талбар} хадгалагдсангүй — {шалтгаан}» гэсэн ӨӨРӨӨ
 *      арилдаггүй мэдэгдэл (`toast(..., "err")` нь ✕ дартал зогсдог).
 *
 * Энэ файл нь ЦЭВЭР логик: React-гүй, DOM-гүй, детерминистик.
 */
import { FALLBACK_ERROR } from "./errors";

/** Ганц үйл үг — бүх зам эндээс уншина. */
export const NOT_SAVED = "хадгалагдсангүй";

/** Талбарын доорх мөрийн дээд урт (тэмдэгт). Бүтэн бичиг нь toast дээр. */
const INLINE_MAX = 72;
/** Мэдэгдэл дэх талбарын нэрний дээд урт. */
const LABEL_MAX = 36;

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/** `catch (e)` дотор барьсан ЮУ Ч БАЙСАН уншигдах мөр болгоно. */
export function saveErrorOf(e: unknown): string {
  const raw = typeof e === "string" ? e : (e as any)?.message;
  const msg = typeof raw === "string" ? raw.trim() : "";
  return msg || FALLBACK_ERROR;
}

/** Талбарын ДООРХ богино мөр — нэг мөр, тасалсан. */
export function inlineErrorText(reason: string, max: number = INLINE_MAX): string {
  return clip((reason || FALLBACK_ERROR).replace(/\s+/g, " ").trim(), max);
}

/** Тэндээс явахад үлдэх БАЙНГЫН мэдэгдэл: ЮУ хадгалагдаагүйг НЭРЛЭНЭ.
 *
 *  Талбарын нэр нь `InlineEdit`-ийн `label` — «Тариф», «Хүү», «Хэв хашмал
 *  6012 (А) · 2026-03-20 — тариф» г.м. Нэргүй бол «Өөрчлөлт» гэж ерөнхийлнө:
 *  «алдаа гарлаа» гэсэн ганц мөрөөс ХАМААГҮЙ дээр.
 */
export function unsavedToast(label: string | undefined, reason: string): string {
  const name = clip((label || "").replace(/\s+/g, " ").trim(), LABEL_MAX);
  const what = name || "Өөрчлөлт";
  return `${what} ${NOT_SAVED} — ${reason.trim() || FALLBACK_ERROR}`;
}

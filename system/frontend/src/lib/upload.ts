/* ФАЙЛ ХЭТЭРХИЙ ТОМ — ҮҮНИЙГ СЕРВЕР РҮҮ ЯВУУЛАХААС ӨМНӨ ХЭЛНЭ.
 *
 * Vercel-ийн функц рүү орох биетийн ДЭЭД ХЭМЖЭЭ нь 4.5 MB
 * (https://vercel.com/docs/functions/limitations#request-body-size —
 * хэтэрвэл 413 `FUNCTION_PAYLOAD_TOO_LARGE`). Тэр 413 нь браузер дээр ГАНЦ
 * «Алдаа гарлаа» болж хувирна: Отгоо утсаараа авсан 7 MB зургаа гурав дахин
 * илгээж үзээд ойлгохгүй.
 *
 * Тиймээс хаалгыг ЭНД тавина — файл сонгомогц, сүлжээ хөндөхөөс ӨМНӨ. Дээд
 * хэмжээг 4 MB болгож (4.5 биш) тавьсан нь: `multipart/form-data` нь
 * файлын дээр хилийн мөр, толгой нэмдэг тул яг 4.5 MB файл нь 4.5 MB-аас
 * ИЛҮҮ болж хүрдэг.
 *
 * Цэвэр логик — vitest шууд гүйлгэнэ. */

/** Хавсралтын дээд хэмжээ — 4 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Хавсаргаж болох төрлүүд (файл сонгох цонхонд шүүлтүүр болно). */
export const ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.webp,.xlsx,.xls,.docx,.doc";

/** Байтыг хүн уншихаар: 4718592 → «4.5 MB». */
export function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "") + " MB";
}

/**
 * Файл хэтэрсэн үү. Хэтэрсэн бол ЮУ ХИЙХИЙГ хэлсэн өгүүлбэр, үгүй бол `null`.
 * (`null` = «зөвшөөрөв» — дуудагч тал `if (msg) { toast(msg); return; }`.)
 */
export function oversizeMessage(bytes: number, max: number = MAX_UPLOAD_BYTES): string | null {
  if (bytes <= max) return null;
  return `Файл хэтэрхий том (${mb(bytes)}). Дээд хэмжээ ${mb(max)} — ` +
         `зургаа жижигрүүлэх эсвэл PDF-ээ хувааж хавсаргана уу.`;
}

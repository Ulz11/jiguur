/* Тайлангийн ХУГАЦААНЫ СОНГОЛТ — сараар (3/6/12) эсвэл дурын огнооны завсраар.
 *
 * Дүрэм: огнооны горимд хоёр огноо БҮРЭН, зөв дарааллаар бөглөгдөх хүртэл
 * юу ч татагдахгүй — хагас бөглөсөн муж рүү хүсэлт явуулбал сервер 400 өгч,
 * дэлгэц дээрх тоо алга болно. Бөглөж дуусаагүйг зэмлэхгүй: алдааны үг
 * зөвхөн УРВУУ мужид л гарна.
 */

export type RangeMode = "months" | "range";

/** Хоёр огноо бүрэн бөгөөд зөв дараалалтай юу. ISO мөр үсгээрээ эрэмбэлэгдэнэ. */
export function rangeReady(from: string, to: string): boolean {
  return !!from && !!to && from <= to;
}

/** Хоёулаа бөглөгдсөн атлаа урвуу үед л алдааны үг — бусад нь чимээгүй. */
export function rangeError(from: string, to: string): string {
  return from && to && from > to ? "Эхлэх огноо дуусахаасаа хойно байна" : "";
}

/** Тайлан татах query. Огнооны горимд муж бэлэн биш бол "" — татахгүй гэсэн дохио. */
export function reportQuery(mode: RangeMode, months: number, from: string, to: string): string {
  if (mode === "range") {
    return rangeReady(from, to) ? `d_from=${from}&d_to=${to}` : "";
  }
  return `months=${months}`;
}

/** ХАГАС бөглөсөн муж дээрх ЧИМЭЭГҮЙ ЗОГСОЛТ.
 *
 *  «Огноогоор» дараад эхлэх огноогоо сонгоод зогсоход хуудас юу ч хийхгүй:
 *  тоо нь өмнөх мужийнхаа хэвээр зогсож байдаг тул Отгоо тэднийг ШИНЭ мужийн
 *  хариу гэж уншина. Алдаа биш — гэхдээ ЮУ ХҮЛЭЭЖ байгааг нь хэлэх ёстой.
 *  Урвуу муж дээр `rangeError` өөрөө ярина тул энд дуугарахгүй. */
export function rangeHint(mode: RangeMode, from: string, to: string): string {
  if (mode !== "range") return "";
  if (rangeError(from, to)) return "";          // өөр алдаа ярьж байна
  if (rangeReady(from, to)) return "";
  if (!from && !to) return "Эхлэх ба дуусах огноогоо сонгоно уу — сонгох хүртэл доорх тоо өмнөх хугацаанийх.";
  return from
    ? "Дуусах огноогоо сонгоно уу — сонгох хүртэл доорх тоо өмнөх хугацаанийх."
    : "Эхлэх огноогоо сонгоно уу — сонгох хүртэл доорх тоо өмнөх хугацаанийх.";
}

/** МӨНГӨН УРСГАЛЫН ЦОНХ — гарчиг дээрээ ил.
 *
 *  «Мөнгөн урсгал — сүүлийн 6 сар» гэсэн ХАТУУ гарчиг нь ХУДАЛ болдог байв:
 *  тайланг 7-р сараар шүүхэд график нь тэр мужаар зурагдана, гарчиг нь
 *  «сүүлийн 6 сар» гэж хэвээр зогсоно. Хүсэлт тайрагдсан үед сервер өөрөө
 *  тайлбар (`range_note`) илгээдэг — тэр үг нь дэлгэцийн зохиолоос ДЭЭР. */
export function cashflowTitle(s: {
  range_applied?: boolean; from?: string; to?: string;
  range_note?: string; months_count?: number;
} | null | undefined): string {
  const head = "Мөнгөн урсгал";
  if (!s) return head;
  /* Тайрагдсан хүсэлт: серверийн өгүүлбэр нь ШАЛТГААНАА ч хэлдэг. */
  if (s.range_applied === false && s.range_note) return `${head} — ${s.range_note}`;
  if (s.from && s.to) return `${head} — ${s.from} – ${s.to}`;
  return s.months_count ? `${head} — сүүлийн ${s.months_count} сар` : head;
}

/** Excel-ийн ЖИНХЭНЭ файлын нэр (сервер `Content-Disposition`-оор ийм нэрээр
 *  илгээнэ). Товч дээр ЯГ ЭНЭ нэр бичигдэнэ: Отгоо татсан файлаа «Downloads»
 *  дотроос нэрээр нь хайдаг — «jiguur-tailan.xlsx» гэж амлаад «tailan.xlsx»
 *  буулгавал тэр файл алга болсонтой адил. */
export const REPORT_FILE = "tailan.xlsx";

/** Татагдсаны ҮР ДҮН — файлын нэртэйгээ (toast нь 3.2 секундэд арилна). */
export function downloadOutcome(file: string = REPORT_FILE): string {
  return `Excel татагдлаа — ${file}`;
}

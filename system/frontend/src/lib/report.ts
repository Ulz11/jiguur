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

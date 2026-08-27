/* Гарын фокусын цэвэр логик — модалын "фокусын хавх"-ын тархи.
 *
 * Модал нээгдэхэд Tab дарж яваа хүн ард нь үлдсэн хуудас руу гарч алга болох
 * ёсгүй: сүүлийн товчноос Tab дарвал эхний рүү, эхнийхээс Shift+Tab дарвал
 * сүүлийн рүү эргэнэ. Энэ файл ЯГ ЭНЭ шийдвэрийг л гаргана (DOM-гүй, цэвэр),
 * ui.tsx нь буцаасан индексээр нь фокусыг зөөнө. */

/** Гараар очиж болох элементүүдийн CSS сонгогч.
 *  `[disabled]` ба `tabindex="-1"` нь ЖАГСААЛТААС гарна — идэвхгүй товч дээр
 *  фокус хавчигдвал хүн гацна. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]",
].join(",");

/** Сонгогчид таарсан ч фокус авах ЁСГҮЙ элементийг шүүнэ.
 *  `hidden`, `aria-hidden`, `tabindex="-1"` — гурвуулаа "алгасах" гэсэн үг. */
export function isTabbable(el: {
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
}): boolean {
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const ti = el.getAttribute("tabindex");
  if (ti !== null && parseInt(ti, 10) < 0) return false;
  return true;
}

/** Тухайн мөчид `root` дотор гараар очиж болох элементүүд, DOM-ийн дарааллаар.
 *  Модал нээгдсэн хойно ч агуулга нь өөрчлөгддөг (талбар задарна, товч
 *  идэвхгүй болно) тул жагсаалтыг ХАДГАЛАХГҮЙ, Tab дарах бүрд дахин уншина. */
export function tabbablesIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isTabbable);
}

/** Tab дарахад фокус ХААШАА очих ёстойг тооцоолно.
 *
 *  @param count    модал доторх фокус авч чадах элементийн тоо
 *  @param current  одоо фокустай элементийн индекс; модалын гадна бол -1
 *  @param backward Shift+Tab эсэх
 *  @returns очих индекс, эсвэл null — "хөтөч өөрөө зөөг" (модал дотор
 *           энгийн шилжилт хийгдэнэ, бид хөндлөнгөөс оролцох шаардлагагүй).
 *
 *  Зөвхөн ХАВХНЫ ЗАХ дээр л null биш утга буцаана. */
export function trapNext(count: number, current: number, backward: boolean): number | null {
  // Юу ч байхгүй бол зөөх газар алга — дуудагч тал самбар дээрээ фокус барина.
  if (count <= 0) return null;
  // Ганц элемент: аль ч зүг рүү Tab дарсан өөр дээрээ л үлдэнэ.
  if (count === 1) return 0;
  // Фокус модалын гадна байна (жишээ нь хаягийн мөрөөс буцаж ирэв) — буцааж татна.
  if (current < 0 || current >= count) return backward ? count - 1 : 0;
  if (backward && current === 0) return count - 1;
  if (!backward && current === count - 1) return 0;
  return null;
}

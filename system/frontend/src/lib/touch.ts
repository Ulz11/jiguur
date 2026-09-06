/* ХҮРЭХ ТАЛБАЙГ ТӨХӨӨРӨМЖ ШИЙДНЭ, РОЛЬ БИШ.
 *
 * Дашбоардын «Ачсан ✓» нь `role === "factory"` үед 52px (`tap-lg`), бусад
 * үед 36px байв. Гэвч 52px гэдэг нь ДАРГЫН эрхийн тухай биш — ХУРУУНЫ тухай
 * шийдвэр (`docs/UI-ЗАРЧИМ.md` §4: `--target-lg` = «хуруу, планшет»). Отгоо
 * эгч iPad-аараа ачилт баталгаажуулахад ЯГ тэр хуруугаараа 36px-ийн товч
 * ононо; дарга ширээний компьютер дээр сууж байхад 52px нь зөвхөн зай иднэ.
 *
 * `pointer: coarse` нь ҮНДСЭН заагч төхөөрөмж нь бүдүүн (хуруу) эсэхийг
 * хэлнэ — дэлгэцийн ӨРГӨН биш (768px цонхтой ширээний хөтөч нь хуруугүй).
 *
 * Цэвэр функц: `matchMedia`-г параметрээр авна тул DOM-гүй шалгагдана.
 */
export const COARSE = "(pointer: coarse)";

type MatchMedia = (q: string) => { matches: boolean };

function browserMatchMedia(): MatchMedia | undefined {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? (q: string) => window.matchMedia(q)
    : undefined;
}

/** Үндсэн заагч нь ХУРУУ юу. Мэдэх аргагүй бол ХУДАЛ — 52px нь тодорхой
 *  шалтгаантай үед л гарна, таамгаар биш. */
export function isTouchDevice(mm: MatchMedia | undefined = browserMatchMedia()): boolean {
  try {
    return !!mm?.(COARSE).matches;
  } catch {
    return false;
  }
}

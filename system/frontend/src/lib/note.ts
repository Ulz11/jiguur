/* ЗАХЫН ТЭМДЭГЛЭЛ БА ШАР ТУГ — давхаргын цэвэр дүрмүүд (P1-22 / №111, 112).
 *
 * Отгоо эгчийн хуудсан дээр шийдвэр нь тоон ДОТОР биш, тооны ХАЖУУД сууна:
 * «7.06нд тооцов», «нөат шивсэн», «модонд», «хаав», «ирээгүй». Шар нүд
 * (`FFFFFF00`) нь «энэ рүү эргэж хар» гэсэн ӨГҮҮЛБЭР.
 *
 * Системд эдгээрийн байр нь `Contract.note` / `Client.note` гэсэн ГАНЦ Text
 * байв: гурав нь нэгэнд нурж, огноогүй, зохиогчгүй болно. Одоо мөр бүр
 * өөрийн огноо, зохиогч, тугтай — тэдгээрийг ЭРЭМБЭЛЭХ ба ТООЛОХ дүрэм нь
 * хуудсанд биш, энд, тесттэйгээ амьдарна.
 */

export type Note = {
  id: number;
  date: string;
  text: string;
  flag: boolean;
  author?: string;
  entity_type?: string;
  entity_id?: number;
  voided?: boolean;
  void_reason?: string;
  voided_by?: string;
  voided_at?: string | null;
};

/** Дашбоардын «Анхаарах» самбарын мөр — тэмдэглэл дээрээ ХААНАХЫГ авч явна. */
export type FlaggedNote = Note & {
  entity_name?: string;
  contract_id?: number | null;
  client_id?: number | null;
};

/** СҮҮЛИЙН ШИЙДВЭР ДЭЭРЭЭ: огноо буурахаар, нэг өдөрт сүүлд бичигдсэн нь дээрээ.
 *
 *  Өгөгдсөн массивыг ХӨНДӨХГҮЙ — `d.notes` нь серверийн хариу тул байрандаа
 *  эрэмбэлбэл дараагийн рендер өөр дараалал үзүүлж болно. */
export function orderNotes<T extends { id: number; date: string }>(
  notes: T[] | null | undefined,
): T[] {
  return [...(notes || [])].sort(
    (a, b) => (a.date === b.date ? b.id - a.id : (a.date < b.date ? 1 : -1)));
}

/** ЗУРВАСЫН ДАРААЛАЛ — анхаарах ⚑ нь ДЭЭРЭЭ, дараа нь сүүлийн шийдвэр.
 *
 *  Зурвас нь таван мөрөөр хумигддаг болсон тул «энэ рүү эргэж хар» гэсэн мөр
 *  тэр таванд ЗААВАЛ багтах ёстой: тугтай мөр зургаа дахь байрандаа нуугдвал
 *  туг нь утгаа алдана. Эрэмбэ нь ТОГТВОРТОЙ — бүлэг дотроо огнооны дараалал
 *  хэвээр (`orderNotes`). */
export function rankNotes<T extends { id: number; date: string; flag?: boolean;
                                      voided?: boolean }>(
  notes: T[] | null | undefined,
): T[] {
  const rank = (n: T) => (n.flag && !n.voided ? 0 : 1);
  return orderNotes(notes).sort((a, b) => rank(a) - rank(b));
}

/** ХУМИГДСАН ЖАГСААЛТ — «бүгдийг харах» хүртэл хэдэн мөр гарах вэ.
 *
 *  Отгоогийн гэрээ бүр 30–48 тэмдэглэлтэй: тэдгээр нь баганаа бүтнээрээ
 *  эзэлж, «Төлбөрүүд», «Барьцаа», гэрээ хаах товч гурвыг 1800px доош
 *  түлхдэг байв. Мөр нь алга болохгүй — НЭГ товчийн ард зогсоно. */
export function capRows<T>(rows: T[] | null | undefined, cap: number, expanded: boolean):
    { shown: T[]; total: number; hidden: number } {
  const all = rows || [];
  const shown = expanded || all.length <= cap ? all : all.slice(0, cap);
  return { shown, total: all.length, hidden: all.length - shown.length };
}

/** Зурвасын анхдагч хязгаар — гэрээ, харилцагч, хөдөлгөөн ГУРВУУЛАА ижил. */
export const NOTE_CAP = 5;
/** Дашбоардын «Анхаарах» самбар нь бүх харилцагчийн тугийг цуглуулдаг тул
 *  арай өгөөмөр — гэхдээ хуудасны талыг эзлэхээ болино. */
export const FLAGGED_CAP = 8;

/** «Бүгдийг харах (30)» — тоо нь ХЭДИЙГ нээхийг хэлнэ, хэд нуугдсаныг биш:
 *  дарахаасаа өмнө «за, гучин мөр байна» гэдгээ мэдэж байх нь чухал. */
export function showAllLabel(total: number): string {
  return `Бүгдийг харах (${total})`;
}

/** Хумигдсан толгойн ХОЁР тоо: хэдэн мөр байна, хэд нь ⚑.
 *
 *  ХҮЧИНГҮЙ болсон туг нь «анхаарах» БИШ (цуцлалт нь тугийг унтраана) — гэвч
 *  мөр нь дэвтэрт үлддэг тул нийт тоонд ХЭВЭЭР орно (H1). */
export function noteSummary(notes: Note[] | null | undefined):
    { count: number; flagged: number } {
  const rows = notes || [];
  return {
    count: rows.length,
    flagged: rows.filter((n) => n.flag && !n.voided).length,
  };
}

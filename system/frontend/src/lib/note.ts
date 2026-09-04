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

/* Механизмын нэхэмжлэхэд ЯМАР мөр орохыг шийддэг ГАНЦ газар (frontend тал).
 *
 * Сервер тал (`routers/machines.py` → `billable_jobs`) ЯГ ижил дүрэмтэй.
 * Урьдчилсан харагдац нь тэр дүрмээс зөрвөл Отгоо дэлгэц дээр «2 мөр ·
 * 1,800,000₮» гэж хараад «Үүсгэх» дарахад баримт дээр өөр тоо хэвлэгдэнэ —
 * ямар ч алдааны мэдэгдэлгүйгээр. Тиймээс дүрэм нь энд ЦЭВЭР функц болж,
 * тестээр серверийн эсрэг барьцаалагдана.
 *
 * ДҮРЭМ:
 *   · зөвхөн АЖИЛ (`entry === "job"`) — зарлага харилцагчийн хэрэг биш;
 *   · ДОТООД ажил (`INTERNAL`) хасагдана — өөрийн агуулах руу нэхэмжлэхгүй;
 *   · харилцагчийн нэр нь ЧӨЛӨӨТ текст тул хоёр талын зайг хасаж жишнэ;
 *   · цонх [from, to] — ХОЁР ирмэг ОРНО (огноо нь ISO мөр тул шууд жишигдэнэ).
 */

export type MachineLogRow = {
  id: number;
  date: string;
  entry: string;
  label: string;
  client: string;
  amount: number;
  method: string;
};

export function billableJobs(
  logs: MachineLogRow[],
  client: string,
  from: string,
  to: string,
): MachineLogRow[] {
  const key = client.trim();
  // Гурвын аль нэг нь дутуу байхад «бүх мөр» биш, ХООСОН буцаана: маягт
  // бөглөж дуусаагүй байхад дүн харагдвал хэрэглэгч түүнийг амлалт гэж уншина.
  if (!key || !from || !to) return [];
  return logs
    .filter((l) => l.entry === "job" && l.method !== "INTERNAL"
      && l.client.trim() === key && from <= l.date && l.date <= to)
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
}

export function billTotal(rows: MachineLogRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

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

/** Баримтын нийт — серверийн `create_invoice`-тэй ЯГ ижил томьёо.
 *
 *  Урьдчилсан харагдац `billTotal`-ыг «Нийт» гэж бичдэг байсан бол сервер
 *  `grand_total = total + total × НӨАТ% / 100` гэж бичдэг. Жигүүр Зам одоогоор
 *  НӨАТ-гүй (тохиргооны `vat_percent` = 0) тул хоёр тоо санамсаргүй таарч
 *  байв: тохиргоог асаамагц дэлгэц дээрх амлалт баримт дээр эвдэрнэ.
 *
 *  НӨАТ% нь ТОХИРГООНООС ирнэ (`/api/settings` — сервер ч мөн адил
 *  `routers/machines.py::_vat_percent`). Уншигдаагүй/гажсан утга нь 0 болж
 *  унана: тоо хэзээ ч NaN болж дэлгэц дээр гарахгүй.
 */
export function invoiceTotals(rows: MachineLogRow[], vatPercent = 0) {
  const total = billTotal(rows);
  const pct = Number.isFinite(vatPercent) && vatPercent > 0 ? vatPercent : 0;
  const vat = (total * pct) / 100;
  return { total, vat, grand: total + vat };
}

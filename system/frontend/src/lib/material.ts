/* Материалын хуудасны цэвэр туслахууд — «энэ хэв ХААНА байна вэ?».
 *
 * Хуваарилалтын хүснэгт нь ЗЭРЭГЛЭЛЭЭР задардаг: Отгоо «А зэрэглэлийн хэв
 * хаана байна» гэж асуудаг болохоос «хэв хаана байна» гэж асуудаггүй — А ба В
 * бол хоёр өөр бараа, тариф нь ч өөр. Тиймээс сервер илгээсэн мөрүүдийг
 * зэрэглэлээр нь бүлэглэж, бүлэг бүрд нь дүн гаргана.
 *
 * Тарифыг МАССИВ болгож авч ирдэг: нэг гэрээ нэг материалыг хоёр өөр тарифаар
 * барьж болно (дундуур нь үнэ солигдвол падан бүр өөрийн тарифаа мөнхөд
 * хадгална). «330₮» гэж ганцхан тоо бичих нь тэр тохиолдолд ХУДАЛ болно.
 */

export type Holding = {
  contract_id: number;
  contract_no: string;
  client_id: number;
  client: string;
  grade_id: number;
  grade: string;
  qty: number;
  /** Баталгаажаагүй ачилтын ширхэг — `qty`-д ХЭЗЭЭ Ч нийлэхгүй тусдаа тоо.
   *  Падан болоогүй бараа «гадаа байгаа» биш, гэхдээ ирж байгаа нь мэдэгдэнэ. */
  pending: number;
  rates: number[];
  since: string;
  days: number;
  [k: string]: unknown;
};

export type GradeSection = {
  grade_id: number;
  grade: string;
  /** Тухайн зэрэглэлийн гадаа байгаа нийт тоо */
  qty: number;
  rows: Holding[];
};

/** Гадаа байгаа падангуудын тариф — давхардлыг хасаж, өсөхөөр нь эгнүүлнэ. */
export function rateLabel(rates: number[] | null | undefined,
                          fmt: (n: number) => string = String): string {
  const uniq = [...new Set((rates || []).filter((r) => Number.isFinite(r)))].sort((a, b) => a - b);
  if (uniq.length === 0) return "—";
  return uniq.map(fmt).join(" · ") + "₮";
}

/** Хуваарилалтын мөрүүдийг ЗЭРЭГЛЭЛЭЭР бүлэглэнэ.
 *
 *  Серверийн эрэмбийг ХЭВЭЭР үлдээнэ (шинэ → А → В, дотор нь тооны буурахаар):
 *  бүлэг нь эхлээд тааралдсан дарааллаараа, мөр нь ирсэн дарааллаараа. */
export function holdingSections(holdings: Holding[]): GradeSection[] {
  const out: GradeSection[] = [];
  const byGrade = new Map<number, GradeSection>();
  for (const h of holdings) {
    let sec = byGrade.get(h.grade_id);
    if (!sec) {
      sec = { grade_id: h.grade_id, grade: h.grade, qty: 0, rows: [] };
      byGrade.set(h.grade_id, sec);
      out.push(sec);
    }
    sec.rows.push(h);
    sec.qty += h.qty;
  }
  return out;
}

/** «хэзээнээс гадаа байна» — хоногийн тоог хүн уншихаар. */
export function daysLabel(days: number): string {
  if (!Number.isFinite(days) || days < 0) return "—";
  if (days === 0) return "өнөөдөр гарсан";
  return `${Math.round(days)} хоног`;
}

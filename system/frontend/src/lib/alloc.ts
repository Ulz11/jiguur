import { isOpeningNo } from "./opening";

export type InvoiceLike = {
  id: number; no: string; outstanding: number; due_date: string;
  /** Бүртгэгдсэн (booked) алдангийн үлдэгдэл — үүнийг л төлбөр хааж чадна. */
  penalty_due?: number;
  /** Аль гэрээн дээр сууж байгаа вэ (`OB-…` = харилцагчийн ДАНС). */
  contract_no?: string;
  /** Хүчингүй болсон нэхэмжлэл — мөр нь үлддэг, тооцооноос гардаг (H1). */
  voided?: boolean;
};

/** ТӨЛБӨР ХААЖ БОЛОХ нэхэмжлэлүүд — НЭГ харилцагч, НЭГ дараалал.
 *
 *  Гэрээний хуудсан дээрх «Төлбөр бүртгэх» нь ЗӨВХӨН тэр гэрээний
 *  нэхэмжлэлүүдийг мэддэг байв. Гэтэл харилцагчийн ХУУЧИН ҮЛДЭГДЭЛ нь
 *  түүний ДАНСНЫ гэрээн дээр (`OB-{id}`) сууна: 1.5 сая₮ өртэй хүнээс
 *  мөнгө орж ирэхэд баримт нь «Илүү — кредит болно» гэж бичдэг байсан —
 *  Отгоо хуучин өр хаагдсан эсэхийг ХАРААГҮЙ хэвээр цонхоо хаана.
 *
 *  ЯГ ХАМРАХ ХҮРЭЭ: харилцагчийн ДАНСНЫ гэрээ (`OB-…`) дээрх мөрүүд л
 *  нэмэгдэнэ — өөр ЖИНХЭНЭ гэрээний нэхэмжлэл ОРОХГҮЙ (тэр нь өөрийн
 *  хуудастай, өөрийн «Төлбөр бүртгэх» товчтой). Дараалал нь төлөх
 *  хугацаагаар: хамгийн хуучин өр эхэлж хаагдана. */
export function payCandidates(own: InvoiceLike[],
                              client: InvoiceLike[] | null | undefined): InvoiceLike[] {
  const seen = new Set(own.map((i) => i.id));
  const extra = (client || []).filter((i) =>
    !seen.has(i.id)
    && !i.voided
    && (isOpeningNo(i.contract_no) || isOpeningNo(i.no))
    && (i.outstanding > 0 || (i.penalty_due || 0) > 0));
  if (!extra.length) return own;
  return [...own, ...extra].sort(
    (a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id));
}
/** `part` байхгүй мөр = ҮНДСЭН төлбөр; "penalty" = тухайн нэхэмжлэлийн алданги. */
export type AllocRow = { id: number; no: string; take: number; part?: "penalty" };

/** Backend-ийн хуваарилалтын дүрмийн урьдчилсан харагдац: хамгийн хуучин
 *  нэхэмжлэлээс эхэлж, нэхэмжлэл БҮРИЙГ БҮТНЭЭР хаана (үндсэн дүн → түүний
 *  бүртгэгдсэн алданги), дараа нь дараагийнх руу. Илүү нь кредит (remainder). */
export function allocationPreview(amount: number, invoices: InvoiceLike[]): { rows: AllocRow[]; remainder: number } {
  if (!amount || amount <= 0) return { rows: [], remainder: 0 };
  const rows: AllocRow[] = [];
  let remain = amount;
  const sorted = [...invoices]
    .filter((i) => i.outstanding > 0 || (i.penalty_due || 0) > 0)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id));
  for (const inv of sorted) {
    if (remain <= 0) break;
    const take = Math.min(Math.max(inv.outstanding, 0), remain);
    if (take > 0) {
      rows.push({ id: inv.id, no: inv.no, take });
      remain -= take;
    }
    const due = Math.min(inv.penalty_due || 0, remain);
    if (due > 0) {
      rows.push({ id: inv.id, no: inv.no, take: due, part: "penalty" });
      remain -= due;
    }
  }
  return { rows, remainder: remain };
}

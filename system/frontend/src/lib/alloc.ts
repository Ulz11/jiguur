export type InvoiceLike = {
  id: number; no: string; outstanding: number; due_date: string;
  /** Бүртгэгдсэн (booked) алдангийн үлдэгдэл — үүнийг л төлбөр хааж чадна. */
  penalty_due?: number;
};
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

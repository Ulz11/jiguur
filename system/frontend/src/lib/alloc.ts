export type InvoiceLike = { id: number; no: string; outstanding: number; due_date: string };
export type AllocRow = { id: number; no: string; take: number };

/** Backend-ийн хуваарилалтын дүрмийн урьдчилсан харагдац:
 *  хамгийн хуучин нэхэмжлэлээс эхэлж хаана, илүү нь кредит (remainder). */
export function allocationPreview(amount: number, invoices: InvoiceLike[]): { rows: AllocRow[]; remainder: number } {
  if (!amount || amount <= 0) return { rows: [], remainder: 0 };
  const rows: AllocRow[] = [];
  let remain = amount;
  const sorted = [...invoices]
    .filter((i) => i.outstanding > 0)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id));
  for (const inv of sorted) {
    if (remain <= 0) break;
    const take = Math.min(inv.outstanding, remain);
    rows.push({ id: inv.id, no: inv.no, take });
    remain -= take;
  }
  return { rows, remainder: remain };
}

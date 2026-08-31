/* ХҮЧИНГҮЙ (void) — харагдацын НЭГ дүрэм.
 *
 * Систем засварыг УСТГАЛААР биш ЦУЦЛАЛТААР хийдэг (Чадварын харьцуулалт H1):
 * буруу бичилт мөрөндөө үлдэж, дэргэдээ зөв нь зогсоно. Тиймээс «хүчингүй»
 * гэдгийг ХЭЛЭХ дүрэм нь дэлгэц болгонд өөр байж болохгүй — Отгоо гэрээний
 * хуудсан дээр зурагдсан мөрийг харилцагчийн хуудсан дээр хэвийн харвал аль
 * нь үнэн бэ гэж эргэлзэнэ.
 *
 * Зураас, бүдэгрэлт нь ЧИМЭГ: утга нь дэргэдэх «ХҮЧИНГҮЙ» pill ба title-д
 * бичигдсэн шалтгаанд байна (UI-ЗАРЧИМ §4 — өнгө дангаараа утга зөөхгүй).
 */

export type Voidable = {
  voided?: boolean;
  void_reason?: string;
  voided_by?: string;
  voided_at?: string | null;
};

export type Allocation = {
  invoice_id: number;
  invoice_no: string;
  amount: number;
  part: string;          // principal | penalty
};

export function isVoided(r: Voidable | undefined | null): boolean {
  return !!r?.voided;
}

/** Мөрийн tooltip: «ХҮЧИНГҮЙ: шалтгаан · хэн · хэзээ».
 *  Хүчинтэй мөрөнд `undefined` — хий tooltip хулганы доор гарахгүй. */
export function voidTitle(r: Voidable | undefined | null): string | undefined {
  if (!isVoided(r)) return undefined;
  const parts = [r!.void_reason, r!.voided_by, r!.voided_at].filter(Boolean);
  return parts.length ? `ХҮЧИНГҮЙ: ${parts.join(" · ")}` : "ХҮЧИНГҮЙ";
}

/** Мөрийн нэмэлт класс. Зураас нь УЛААН — «энэ бичилт тоологдохгүй». */
export function voidRowClass(r: Voidable | undefined | null): string {
  return isVoided(r) ? "opacity-60 line-through decoration-danger/60" : "";
}

export type ReleaseRow = { key: string; label: string; sub?: string; amount: number };

/** Цуцлахад АЛЬ нэхэмжлэлээс ХЭД суларахыг баримтын мөр болгоно.
 *
 *  Үндсэн дүн ба алдангийг НИЙЛҮҮЛЭХГҮЙ: тэдгээр хоёр өөр өр бөгөөд Отгоо
 *  «алданги буцаж нээгдэв үү» гэдгээ тусад нь харах ёстой. */
export function releaseRows(allocs: Allocation[] | undefined | null): ReleaseRow[] {
  const out: ReleaseRow[] = [];
  const byKey = new Map<string, ReleaseRow>();
  for (const a of allocs || []) {
    const key = `${a.invoice_id}-${a.part}`;
    const found = byKey.get(key);
    if (found) { found.amount += a.amount; continue; }
    const row: ReleaseRow = {
      key,
      label: `№${a.invoice_no}`,
      sub: a.part === "penalty" ? "алданги" : undefined,
      amount: a.amount,
    };
    byKey.set(key, row);
    out.push(row);
  }
  return out;
}

export function releasedTotal(allocs: Allocation[] | undefined | null): number {
  return (allocs || []).reduce((s, a) => s + a.amount, 0);
}

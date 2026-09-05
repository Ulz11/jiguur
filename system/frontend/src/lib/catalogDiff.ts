import { fmt } from "./num";
import type { GradePriceRow, MaterialForm } from "./catalog";

/* КАТАЛОГИЙН ЦОНХ НЬ МӨНГӨ ХӨДӨЛГӨДӨГ — ГЭТЭЛ БАРИМТГҮЙ БАЙВ.
 *
 * «Суурь тариф» нь ШИНЭ гэрээний өдрийн дүнг, «НБҮнэ» нь дутагдуулсан
 * гарцын актыг, «Худалдах үнэ» нь «Худалдаа болгох» гарцыг тодорхойлно.
 * Отгоо тэр гурван талбарыг ямар ч баримтгүйгээр дардаг байсан: 110-ийг
 * 1100 болгож бичсэн ч цонх «Хадгалагдлаа» гэдэг ганц үг хэлнэ.
 *
 * Систем дээрх бусад мөнгөн үйлдэл бүр ХАДГАЛАХЫН ӨМНӨ ХОЁР тоог зэрэгцүүлж
 * харуулдаг (UI-ЗАРЧИМ §3). Каталог ч ялгаагүй: «Тариф 110₮ → 150₮».
 */

export type DiffRow = { label: string; value: string; accent?: "money" | "danger" | "dim" };

const tug = (n: number) => fmt(n) + "₮";

/** «110₮ → 150₮» — ХОЁР тоог хамт (ганц тоо өөрчлөлтийг хэлдэггүй). */
export function shift(before: number, after: number): string {
  return `${tug(before)} → ${tug(after)}`;
}

/**
 * Хадгалахаас ӨМНӨ юу өөрчлөгдөхийг мөрөөр нь.
 *
 * ЗӨВХӨН хөдөлсөн тоо гарна: хөдлөөгүй мөрийг «110₮ → 110₮» гэж зурвал
 * баримт нь чимээ болж, ЖИНХЭНЭ өөрчлөлт тэр дунд алга болно.
 */
export function materialDiff(before: Omit<MaterialForm, "prices">,
                             beforePrices: GradePriceRow[],
                             after: MaterialForm): DiffRow[] {
  const rows: DiffRow[] = [];
  if (before.base_rate !== after.base_rate) {
    rows.push({ label: "Тариф", value: shift(before.base_rate, after.base_rate),
                accent: after.base_rate >= before.base_rate ? "money" : "danger" });
  }
  if (before.repair_fee !== after.repair_fee) {
    rows.push({ label: "Засварын фикс", value: shift(before.repair_fee, after.repair_fee),
                accent: after.repair_fee >= before.repair_fee ? "money" : "danger" });
  }
  after.prices.forEach((p, i) => {
    const b = beforePrices[i];
    if (!b || b.grade_id !== p.grade_id) return;
    if (b.nb_price !== p.nb_price) {
      rows.push({ label: `${p.grade} — НБҮнэ`, value: shift(b.nb_price, p.nb_price), accent: "dim" });
    }
    if (b.sale_price !== p.sale_price) {
      rows.push({ label: `${p.grade} — худалдах үнэ`, value: shift(b.sale_price, p.sale_price),
                  accent: "dim" });
    }
  });
  return rows;
}

/** Зэрэглэлийн цонхны өөрчлөлт — мөнгө биш ч ЯГ ижил журам (юуг юу болгов). */
export function gradeDiff(before: { code: string; name: string; sort: number },
                          after: { code: string; name: string; sort: number }): DiffRow[] {
  const rows: DiffRow[] = [];
  const pair = (label: string, b: string, a: string) => {
    if (b !== a) rows.push({ label, value: `${b || "хоосон"} → ${a || "хоосон"}`, accent: "dim" });
  };
  pair("Код", before.code, after.code);
  pair("Нэр", before.name, after.name);
  pair("Эрэмбэ", String(before.sort), String(after.sort));
  return rows;
}

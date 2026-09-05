import { describe, it, expect } from "vitest";
import { gradeDiff, materialDiff, shift } from "./catalogDiff";
import type { GradePriceRow } from "./catalog";

const P = (grade_id: number, grade: string, nb: number, sale: number): GradePriceRow =>
  ({ grade_id, grade, nb_price: nb, sale_price: sale });

const BASE = { name: "Хэв хашмал 2020", category: "Хэв", base_rate: 110, repair_fee: 5_000 };
const PRICES = [P(1, "Шинэ", 12_000, 15_000), P(2, "С", 8_000, 9_000)];

describe("хоёр тоо зэрэгцэнэ", () => {
  it("ганц тоо БИШ — «110₮ → 150₮»", () => {
    expect(shift(110, 150)).toBe("110₮ → 150₮");
  });
});

describe("материалын өөрчлөлтийн баримт", () => {
  it("тариф хөдлөхөд ЯГ тэр мөр гарна", () => {
    const rows = materialDiff(BASE, PRICES, { ...BASE, base_rate: 150, prices: PRICES });
    expect(rows).toEqual([{ label: "Тариф", value: "110₮ → 150₮", accent: "money" }]);
  });

  it("тариф БУУРАХ нь өөр өнгөтэй — түрээсийн орлого унана", () => {
    const rows = materialDiff(BASE, PRICES, { ...BASE, base_rate: 90, prices: PRICES });
    expect(rows[0].accent).toBe("danger");
  });

  it("юу ч хөдлөөгүй бол баримт ОГТ гарахгүй — чимээ болохгүй", () => {
    expect(materialDiff(BASE, PRICES, { ...BASE, prices: PRICES })).toEqual([]);
    // нэр солих нь МӨНГӨ хөдөлгөхгүй тул баримтад орохгүй
    expect(materialDiff(BASE, PRICES, { ...BASE, name: "Өөр нэр", prices: PRICES })).toEqual([]);
  });

  it("зэрэглэлийн үнэ — аль зэрэглэлийнх болохоо үүрнэ", () => {
    const after = [P(1, "Шинэ", 13_000, 15_000), P(2, "С", 8_000, 9_500)];
    const rows = materialDiff(BASE, PRICES, { ...BASE, prices: after });
    expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Шинэ — НБҮнэ: 12,000₮ → 13,000₮",
      "С — худалдах үнэ: 9,000₮ → 9,500₮",
    ]);
  });

  it("тариф, засварын фикс, үнэ — бүгд нэг баримт дээр", () => {
    const after = [P(1, "Шинэ", 13_000, 15_000), P(2, "С", 8_000, 9_000)];
    const rows = materialDiff(BASE, PRICES,
      { ...BASE, base_rate: 150, repair_fee: 6_000, prices: after });
    expect(rows.map((r) => r.label))
      .toEqual(["Тариф", "Засварын фикс", "Шинэ — НБҮнэ"]);
  });

  it("шинэ зэрэглэл нэмэгдсэн (өмнөх мөр байхгүй) үед унахгүй", () => {
    const after = [...PRICES, P(3, "В", 7_000, 0)];
    expect(materialDiff(BASE, PRICES, { ...BASE, prices: after })).toEqual([]);
  });
});

describe("зэрэглэлийн цонх", () => {
  it("юуг юу болгосныг нэрлэнэ", () => {
    const rows = gradeDiff({ code: "С", name: "С зэрэглэл", sort: 3 },
                           { code: "С", name: "Хуучин", sort: 4 });
    expect(rows.map((r) => `${r.label}: ${r.value}`))
      .toEqual(["Нэр: С зэрэглэл → Хуучин", "Эрэмбэ: 3 → 4"]);
  });
  it("хоосон утга нь «хоосон» гэж нэрлэгдэнэ", () => {
    expect(gradeDiff({ code: "", name: "", sort: 0 }, { code: "С", name: "", sort: 0 }))
      .toEqual([{ label: "Код", value: "хоосон → С", accent: "dim" }]);
  });
});

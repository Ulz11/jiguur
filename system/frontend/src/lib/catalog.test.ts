import { describe, it, expect } from "vitest";
import { materialBase, gradePriceRows, pricesDirty, materialPayload } from "./catalog";

/* Каталогийн цонх нь ХОЁР хуудаснаас (Тохиргоо, Агуулах) нээгддэг болсон тул
 * доторх тооцоо нь «нэг дэлгэц дээр ажиллаж байна» гэдгээр батлагдахаа больсон.
 * Энэ цонх МӨНГӨ тээнэ: НБҮнэ нь дутагдуулсан гарцыг, худалдах үнэ нь
 * «Худалдаа болгох»-ыг нэхдэг. Тиймээс дүрэм бүр энд тоогоор баригдана. */

const GRADES = [
  { id: 1, code: "Шинэ" },
  { id: 2, code: "А" },
  { id: 3, code: "В" },
];

describe("materialBase", () => {
  it("шинэ материал нь «Хэв» категори, тэглэсэн үнээр нээгдэнэ", () => {
    expect(materialBase({})).toEqual({ name: "", category: "Хэв", base_rate: 0, repair_fee: 0 });
  });

  it("байгаа материалын утгууд хэвээрээ суудаг", () => {
    expect(materialBase({ name: "Хэв хашмал 2020", category: "Труба",
                          base_rate: 330, repair_fee: 12_000 }))
      .toEqual({ name: "Хэв хашмал 2020", category: "Труба", base_rate: 330, repair_fee: 12_000 });
  });

  it("0 нь «утга байхгүй» БИШ — үнэгүй материалыг анхдагч руу татахгүй", () => {
    expect(materialBase({ name: "Тулаас", base_rate: 0, repair_fee: 0 }).base_rate).toBe(0);
  });
});

describe("gradePriceRows", () => {
  it("зэрэглэл БҮРД мөр гарна — үнэгүй нь 0-оор НЭЭЛТТЭЙ", () => {
    expect(gradePriceRows(GRADES, {})).toEqual([
      { grade_id: 1, grade: "Шинэ", nb_price: 0, sale_price: 0 },
      { grade_id: 2, grade: "А", nb_price: 0, sale_price: 0 },
      { grade_id: 3, grade: "В", nb_price: 0, sale_price: 0 },
    ]);
  });

  it("байгаа үнэ өөрийн зэрэглэлийн мөрөнд суудаг", () => {
    const m = { prices: [{ grade_id: 2, grade: "А", nb_price: 58_000, sale_price: 69_500 }] };
    expect(gradePriceRows(GRADES, m)).toEqual([
      { grade_id: 1, grade: "Шинэ", nb_price: 0, sale_price: 0 },
      { grade_id: 2, grade: "А", nb_price: 58_000, sale_price: 69_500 },
      { grade_id: 3, grade: "В", nb_price: 0, sale_price: 0 },
    ]);
  });

  /* ЭНЭ БОЛ «байгаа материал дээр шинэ төрөл нэмэх» гэдгийн бүх механизм. */
  it("ШИНЭ зэрэглэл нэмэгдмэгц байгаа материал дээр хоосон мөр болж гарч ирнэ", () => {
    const m = { prices: [{ grade_id: 2, grade: "А", nb_price: 58_000, sale_price: 69_500 }] };
    const withNew = gradePriceRows([...GRADES, { id: 9, code: "С" }], m);
    expect(withNew).toHaveLength(4);
    expect(withNew[3]).toEqual({ grade_id: 9, grade: "С", nb_price: 0, sale_price: 0 });
    /* Байсан үнэ нь хөдлөөгүй — шинэ зэрэглэл нь хуучин үнийг гутаахгүй. */
    expect(withNew[1].nb_price).toBe(58_000);
  });

  it("серверийн эрэмбийг ХЭВЭЭР үлдээнэ — хоёр хаалга нэг дараалал үзүүлнэ", () => {
    const shuffled = [{ id: 3, code: "В" }, { id: 1, code: "Шинэ" }, { id: 2, code: "А" }];
    expect(gradePriceRows(shuffled, {}).map((p) => p.grade)).toEqual(["В", "Шинэ", "А"]);
  });

  it("зэрэглэл огт байхгүй бол мөр ч байхгүй (унахгүй)", () => {
    expect(gradePriceRows([], { prices: [{ grade_id: 2, nb_price: 1 }] })).toEqual([]);
  });
});

describe("pricesDirty", () => {
  it("хөндөөгүй мөрүүд цэвэрхэн — дэмий асуухгүй", () => {
    const rows = gradePriceRows(GRADES, {});
    expect(pricesDirty(rows, gradePriceRows(GRADES, {}))).toBe(false);
  });

  it("ГАНЦ зэрэглэлийн НБҮнэ бөглөхөд бохир — бөглөсөн зүйл чимээгүй устахгүй", () => {
    const before = gradePriceRows(GRADES, {});
    const after = before.map((p, i) => (i === 1 ? { ...p, nb_price: 58_000 } : p));
    expect(pricesDirty(before, after)).toBe(true);
  });

  it("худалдах үнэ дангаараа ч бохир", () => {
    const before = gradePriceRows(GRADES, {});
    const after = before.map((p, i) => (i === 2 ? { ...p, sale_price: 1 } : p));
    expect(pricesDirty(before, after)).toBe(true);
  });

  it("мөрийн тоо өөрчлөгдвөл бохир (цонх нээлттэй байхад зэрэглэл нэмэгдсэн)", () => {
    expect(pricesDirty(gradePriceRows(GRADES, {}),
                       gradePriceRows([...GRADES, { id: 9, code: "С" }], {}))).toBe(true);
  });
});

describe("materialPayload", () => {
  const form = (over: Partial<any> = {}) => ({
    name: "Хэв хашмал 2020", category: "Хэв", base_rate: 330, repair_fee: 12_000,
    prices: gradePriceRows(GRADES, {}), ...over,
  });

  it("үнэ өгөөгүй зэрэглэлийн мөр СЕРВЕР РҮҮ ЯВАХГҮЙ — каталог худал дүүрэхгүй", () => {
    const body = materialPayload({}, form());
    expect(body.prices).toEqual([]);
  });

  it("үнэ бичсэн мөр л явна — `grade` код нь биетэй хамт явахгүй", () => {
    const prices = gradePriceRows(GRADES, {})
      .map((p, i) => (i === 1 ? { ...p, nb_price: 58_000, sale_price: 69_500 } : p));
    expect(materialPayload({}, form({ prices })).prices)
      .toEqual([{ grade_id: 2, nb_price: 58_000, sale_price: 69_500 }]);
  });

  it("зөвхөн НБҮнэ (эсвэл зөвхөн худалдах үнэ) бичсэн мөр ч явна", () => {
    const onlyNb = gradePriceRows(GRADES, {}).map((p, i) => (i === 0 ? { ...p, nb_price: 5 } : p));
    expect(materialPayload({}, form({ prices: onlyNb })).prices)
      .toEqual([{ grade_id: 1, nb_price: 5, sale_price: 0 }]);
    const onlySale = gradePriceRows(GRADES, {}).map((p, i) => (i === 0 ? { ...p, sale_price: 5 } : p));
    expect(materialPayload({}, form({ prices: onlySale })).prices)
      .toEqual([{ grade_id: 1, nb_price: 0, sale_price: 5 }]);
  });

  /* Цонх дээр `code`/`unit` талбар БАЙХГҮЙ. Гэвч `PUT /api/materials/{id}` нь
     тэднийг ШУУД бичдэг ба `MaterialIn` дээр анхдагч нь `""`/`"ш"`. Дагуулж
     явуулахгүй бол ҮНЭ ЗАСАХ бүрд материалын код арчигдана. */
  it("`code`, `unit`-ыг ХЭВЭЭР зөөнө — үнэ засахад код арчигдахгүй", () => {
    const body = materialPayload({ id: 4, code: "HH-2020", unit: "м" }, form());
    expect(body.code).toBe("HH-2020");
    expect(body.unit).toBe("м");
  });

  it("шинэ материал дээр `code` хоосон, `unit` нь «ш»", () => {
    const body = materialPayload({}, form());
    expect(body.code).toBe("");
    expect(body.unit).toBe("ш");
  });

  it("нэр, категори, тариф, засварын фикс нь маягтаас — материалаас БИШ", () => {
    const body = materialPayload({ id: 4, name: "Хуучин нэр", category: "Труба",
                                   base_rate: 1, repair_fee: 2 }, form());
    expect(body).toMatchObject({ name: "Хэв хашмал 2020", category: "Хэв",
                                 base_rate: 330, repair_fee: 12_000 });
  });
});

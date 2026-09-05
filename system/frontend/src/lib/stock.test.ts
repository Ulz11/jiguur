import { describe, it, expect } from "vitest";
import { REASON_REQUIRED, VOID_MARK, adjustEffect, adjustReasonError, adjustReceipt,
         adjustmentLine, conflictMaterial, isAdjustment, stocktakeOutcome,
         voidLine } from "./stock";

/* «144ш хаачив?» гэдэг нь агуулахын хамгийн үнэтэй асуулт. Хариулт нь мөр
   мөрөндөө байх ёстой: хэн, хэзээ, ХЭДЭЭС ХЭД, ЯАГААД. */

describe("залруулгын баримт", () => {
  it("ХОЁР тоог хамт хэлнэ — ганц тоо өөрчлөлтийг хэлдэггүй", () => {
    expect(adjustReceipt(34, 7)).toBe("34 → 7 · −27ш");
    expect(adjustReceipt(7, 34)).toBe("7 → 34 · +27ш");
  });

  it("зөрүүгүй залруулга ч ХОЁР тоогоо хэлнэ", () => {
    expect(adjustReceipt(34, 34)).toBe("34 → 34 · 0ш");
  });

  it("үйлдэл нь ЮУ болохыг НЭРЛЭНЭ — «хадгалах» юу ч хэлдэггүй", () => {
    expect(adjustEffect(-27)).toBe("Агуулахаас хасагдана");
    expect(adjustEffect(27)).toBe("Агуулахад нэмэгдэнэ");
    expect(adjustEffect(0)).toBe("Зөрүүгүй — юу ч өөрчлөгдөхгүй");
  });

  it("шалтгаан нь ЗААВАЛ — мөр нь сар хагасын дараа уншигдах ёстой", () => {
    expect(adjustReasonError("")).toBe(REASON_REQUIRED);
    expect(adjustReasonError("   ")).toBe(REASON_REQUIRED);
    expect(adjustReasonError("эвдэрсэн хэв актлав")).toBe("");
  });
});

describe("түүхийн мөрийн уншилт", () => {
  it("залруулга нь ТЭМДЭГТЭЙ тоо, хэн, хэзээ, яагаад — бүгдээрээ", () => {
    expect(adjustmentLine({ kind: "Тооллого", delta: -27, user_name: "Б.Дарга",
                            date: "2026-09-06", note: "эвдэрсэн хэв актлав" }))
      .toBe("Тооллого −27ш (Б.Дарга, 2026-09-06) — эвдэрсэн хэв актлав");
  });

  it("нэмэгдсэн залруулга нь «+»-тэй — 27ш нь хоёр өөр хариулт", () => {
    expect(adjustmentLine({ kind: "Залруулга", delta: 27, user_name: "Отгоо",
                            date: "2026-09-06" }))
      .toBe("Залруулга +27ш (Отгоо, 2026-09-06)");
  });

  it("шалтгаангүй хуучин мөр ч уншигдана", () => {
    expect(adjustmentLine({ kind: "Тооллого", delta: -3, date: "2026-01-05" }))
      .toBe("Тооллого −3ш (2026-01-05)");
  });

  it("төрлөө хэлээгүй мөр «Залруулга» болно — хоосон үг гарахгүй", () => {
    expect(adjustmentLine({ delta: -3 })).toBe("Залруулга −3ш");
  });

  it("залруулгыг хөдөлгөөнөөс ялгана (хуучин payload дээр ч)", () => {
    expect(isAdjustment({ row: "adjustment" })).toBe(true);
    expect(isAdjustment({ type: "ADJUST" })).toBe(true);
    expect(isAdjustment({ row: "movement", type: "ISSUE" })).toBe(false);
  });
});

/* ХҮЧИНГҮЙ мөр ЖАГСААЛТААС ГАРАХГҮЙ (H1): «энэ падан хаачив?» гэсэн асуулт
   хариултгүй үлдэх нь устгалын хамгийн муу үр дагавар. */
describe("хүчингүй мөрийн тайлбар", () => {
  it("тэмдэг, шалтгаан, хэн — гурвуулаа мөрөн дээр", () => {
    expect(voidLine({ voided: true, void_reason: "буруу гэрээнд бичсэн",
                      voided_by: "Отгоо" }))
      .toBe("ХҮЧИНГҮЙ · буруу гэрээнд бичсэн · Отгоо");
    expect(VOID_MARK).toBe("ХҮЧИНГҮЙ");
  });

  it("шалтгаангүй ч тэмдэг нь гарна", () => {
    expect(voidLine({ voided: true })).toBe("ХҮЧИНГҮЙ");
  });

  it("хүчинтэй мөр дээр юу ч гарахгүй", () => {
    expect(voidLine({ voided: false, void_reason: "x" })).toBe("");
    expect(voidLine({})).toBe("");
  });
});

/* Тооллого утсан дээр цагаар үргэлжилдэг; тэр хооронд ачилт бүртгэгдвэл
   серверийн тоо өөр болно. 409 нь ЯГ АЛЬ мөр зөрснийг хэлдэг. */
describe("тооллогын зөрчил", () => {
  it("серверийн өгүүлбэрээс МАТЕРИАЛЫГ салгаж авна — зурвас мөрөн дээрээ буух", () => {
    expect(conflictMaterial(
      "Хөндлөвч: үлдэгдэл өөрчлөгдсөн байна (2044 → 2051) — дахин ачаална уу"))
      .toBe("Хөндлөвч");
  });

  it("өөр төрлийн алдаа мөр нэрлэхгүй — худал мөрөнд буулгахаас дээр", () => {
    expect(conflictMaterial("Мөр оруулна уу")).toBe("");
    expect(conflictMaterial("Материал эсвэл зэрэглэл олдсонгүй")).toBe("");
    expect(conflictMaterial("")).toBe("");
  });
});

describe("тооллогын үр дүн", () => {
  it("залруулагдсан мөр, нийт зөрүү хоёул тоогоороо", () => {
    expect(stocktakeOutcome(215, 14, -27))
      .toBe("Тооллого хадгалагдлаа — 215 мөр тоологдов · 14 мөр залруулагдав · −27ш");
  });

  it("ЗӨРҮҮГҮЙ тооллого ч ХИЙГДСЭН АЖИЛ — мөр нь алга болохгүй", () => {
    expect(stocktakeOutcome(215, 0, 0))
      .toBe("Тооллого хадгалагдлаа — 215 мөр тоологдов · зөрүүгүй");
  });
});

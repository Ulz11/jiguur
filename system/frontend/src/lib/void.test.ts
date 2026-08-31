import { describe, it, expect } from "vitest";
import { isVoided, voidTitle, voidRowClass, releaseRows, releasedTotal } from "./void";

/* Цуцлалт бол УСТГАЛ БИШ. Хоёр мөр хоёулаа үлдэх ёстой тул харагдацын дүрэм
   бас нэг л газраас гарна: юу зурагдсан, юу бүдэгрсэн, title-д юу бичигдэх.
   Өнгө/зураас дангаараа утга зөөхгүй — дэргэдээ «ХҮЧИНГҮЙ» гэсэн ҮГТЭЙ явна
   (UI-ЗАРЧИМ §4 «Өнгө дангаараа утга зөөхгүй»). */

describe("isVoided", () => {
  it("тугийг нь шууд уншина", () => {
    expect(isVoided({ voided: true })).toBe(true);
    expect(isVoided({ voided: false })).toBe(false);
  });

  it("талбар огт байхгүй хуучин мөрийг ХҮЧИНТЭЙ гэж үзнэ", () => {
    expect(isVoided({})).toBe(false);
    expect(isVoided(undefined)).toBe(false);
  });
});

describe("voidTitle", () => {
  it("шалтгаан, хэн, хэзээг нэг мөрөнд эвлүүлнэ", () => {
    expect(voidTitle({ voided: true, void_reason: "Дүнг буруу бичсэн",
                       voided_by: "Отгоо", voided_at: "2026-08-31 09:14:02" }))
      .toBe("ХҮЧИНГҮЙ: Дүнг буруу бичсэн · Отгоо · 2026-08-31 09:14:02");
  });

  it("шалтгаангүй бол ч ХҮЧИНГҮЙ гэдгээ хэлнэ", () => {
    expect(voidTitle({ voided: true })).toBe("ХҮЧИНГҮЙ");
  });

  it("хүчинтэй мөрөнд title үүсгэхгүй (хий tooltip гаргахгүй)", () => {
    expect(voidTitle({ voided: false, void_reason: "" })).toBeUndefined();
  });
});

describe("voidRowClass", () => {
  it("хүчингүй мөрийг бүдэгрүүлж зурна", () => {
    expect(voidRowClass({ voided: true })).toBe("opacity-60 line-through decoration-danger/60");
  });

  it("хүчинтэй мөрөнд юу ч нэмэхгүй", () => {
    expect(voidRowClass({ voided: false })).toBe("");
  });
});

describe("releaseRows", () => {
  const allocs = [
    { invoice_id: 4, invoice_no: "R-24/03-1", amount: 990_000, part: "principal" },
    { invoice_id: 4, invoice_no: "R-24/03-1", amount: 49_500, part: "penalty" },
    { invoice_id: 5, invoice_no: "R-24/03-2", amount: 10_000, part: "principal" },
  ];

  it("нэхэмжлэл бүрээр, үндсэн/алдангийг ТУСДАА мөр болгоно", () => {
    expect(releaseRows(allocs)).toEqual([
      { key: "4-principal", label: "№R-24/03-1", sub: undefined, amount: 990_000 },
      { key: "4-penalty", label: "№R-24/03-1", sub: "алданги", amount: 49_500 },
      { key: "5-principal", label: "№R-24/03-2", sub: undefined, amount: 10_000 },
    ]);
  });

  it("нэг нэхэмжлэлд хоёр хуваарилалт орсныг НЭГТГЭНЭ", () => {
    expect(releaseRows([
      { invoice_id: 4, invoice_no: "R-1", amount: 100, part: "principal" },
      { invoice_id: 4, invoice_no: "R-1", amount: 250, part: "principal" },
    ])).toEqual([{ key: "4-principal", label: "№R-1", sub: undefined, amount: 350 }]);
  });

  it("хуваарилагдаагүй төлбөр — хоосон жагсаалт", () => {
    expect(releaseRows([])).toEqual([]);
    expect(releaseRows(undefined)).toEqual([]);
  });
});

describe("releasedTotal", () => {
  it("суларах нийт дүнг нэмнэ", () => {
    expect(releasedTotal([
      { invoice_id: 1, invoice_no: "A", amount: 990_000, part: "principal" },
      { invoice_id: 1, invoice_no: "A", amount: 49_500, part: "penalty" },
    ])).toBe(1_039_500);
  });

  it("хоосон дээр 0", () => {
    expect(releasedTotal(undefined)).toBe(0);
  });
});

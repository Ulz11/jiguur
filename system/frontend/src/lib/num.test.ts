import { describe, it, expect } from "vitest";
import { parseMoney, formatMoneyInput } from "./num";

/* Отгоо Excel-ээс мөнгө хуулж тавьдаг: "6,000,000" эсвэл "6 000 000".
 * Хуучин `parseFloat("6,000,000")` нь ЧИМЭЭГҮЙ 6₮ болгож байсан — тэр алдааг
 * энд битүүмжилнэ.
 *
 * ДҮРЭМ: таслал бол МЯНГАТЫН тусгаарлагч (аравтынх БИШ). Аравтыг зөвхөн
 * цэгээр бичнэ: "1.55" → 1.55. Тиймээс "1,5" → 15 (мянгатын хэлбэр гэж үзнэ),
 * "0.5" → 0.5 (алдангийн хувь ингэж бичигдэнэ).
 */
describe("parseMoney", () => {
  it("таслалтай мянгатыг бүтнээр нь уншина", () => {
    expect(parseMoney("6,000,000")).toBe(6_000_000);
  });

  it("зайгаар тусгаарласан мянгатыг уншина", () => {
    expect(parseMoney("6 000 000")).toBe(6_000_000);
    expect(parseMoney("6 000 000")).toBe(6_000_000); // NBSP — хуулж тавихад ордог
  });

  it("хоосон / байхгүй утга 0 болно", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("   ")).toBe(0);
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney(undefined)).toBe(0);
  });

  it("таслал бол мянгатын тусгаарлагч — аравтынх БИШ", () => {
    expect(parseMoney("1,5")).toBe(15);
    expect(parseMoney("1,500")).toBe(1500);
  });

  it("цэгээр бичсэн аравт хэвээр үлдэнэ", () => {
    expect(parseMoney("1.55")).toBe(1.55);
    expect(parseMoney("0.5")).toBe(0.5);
    expect(parseMoney("1,234.56")).toBe(1234.56);
  });

  it("сөрөг дүн, ₮ тэмдэг, тоо биш утгыг тэвчинэ", () => {
    expect(parseMoney("-1,200")).toBe(-1200);
    expect(parseMoney("6,000,000₮")).toBe(6_000_000);
    expect(parseMoney("огт тоо биш")).toBe(0);
    expect(parseMoney("-")).toBe(0);
  });

  it("тоог шууд дамжуулж болно", () => {
    expect(parseMoney(1500)).toBe(1500);
    expect(parseMoney(NaN)).toBe(0);
  });
});

describe("formatMoneyInput", () => {
  it("бичиж байхад мянгатыг бүлэглэнэ", () => {
    expect(formatMoneyInput("6000000")).toBe("6,000,000");
    expect(formatMoneyInput("1234")).toBe("1,234");
    expect(formatMoneyInput("999")).toBe("999");
  });

  it("аль хэдийн бүлэглэсэн утгыг дахин бүлэглэхгүй", () => {
    expect(formatMoneyInput("6,000,000")).toBe("6,000,000");
    expect(formatMoneyInput("6 000 000")).toBe("6,000,000");
  });

  it("хоосон нь хоосон хэвээр — 0 болгож хэрэглэгчийг гайхшруулахгүй", () => {
    expect(formatMoneyInput("")).toBe("");
    expect(formatMoneyInput("огт тоо биш")).toBe("");
  });

  it("аравтын цэгийг бичиж дуустал нь хүлээнэ", () => {
    expect(formatMoneyInput("1234.")).toBe("1,234.");
    expect(formatMoneyInput("1234.5")).toBe("1,234.5");
    expect(formatMoneyInput("-1234")).toBe("-1,234");
  });

  it("форматлаад буцааж уншихад дүн өөрчлөгдөхгүй (round-trip)", () => {
    for (const raw of ["6000000", "6,000,000", "6 000 000", "0", "1234.56", "-1200", ""]) {
      expect(parseMoney(formatMoneyInput(raw))).toBe(parseMoney(raw));
    }
  });
});

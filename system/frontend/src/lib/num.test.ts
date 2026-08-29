import { describe, it, expect } from "vitest";
import { parseMoney, formatMoneyInput, fmt, sayaFmt } from "./num";

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

/* Товч мөнгө: KPI карт дээр бүтэн ₮ нь дэлгэц эзэлдэг тул «сая»-гаар богиносгоно.
 * Гэхдээ «сая» дээр зогсох нь ТЭРБУМЫН хэмжээний тоог уншигдахаа болиулна:
 * компанийн нийт өглөг «5,130 сая₮» гэж гарч байв — бизнес өөрөө «5.1 тэрбум»
 * гэж ярьдаг, төслийн баримт бичиг ч тэгж бичдэг. Хүн уншиж чадахгүй байгаа
 * тоо нь богино байгаад ямар ч ач холбогдолгүй. */
describe("sayaFmt", () => {
  it("сая хүрэхгүй тоог бүтнээр нь бичнэ", () => {
    expect(sayaFmt(0)).toBe("0");
    expect(sayaFmt(999_999)).toBe("999,999");
    expect(sayaFmt(-450_000)).toBe("-450,000");
  });

  it("саяас тэрбум хүртэлх тоог «сая»-гаар богиносгоно", () => {
    expect(sayaFmt(1_000_000)).toBe("1 сая");
    expect(sayaFmt(5_130_000)).toBe("5.1 сая");
    expect(sayaFmt(253_929_480)).toBe("253.9 сая");
    expect(sayaFmt(999_900_000)).toBe("999.9 сая");
  });

  it("тэрбумаас дээш тоог «тэрбум»-аар уншуулна — 5,130 сая гэж бичихгүй", () => {
    expect(sayaFmt(5_130_000_000)).toBe("5.13 тэрбум");
    expect(sayaFmt(1_000_000_000)).toBe("1 тэрбум");
    expect(sayaFmt(-2_500_000_000)).toBe("-2.5 тэрбум");
  });

  it("заагийн дээр саяас тэрбум руу шилжинэ", () => {
    expect(sayaFmt(999_999_999)).toBe("1,000 сая");   // «сая»-гийн хамгийн дээд
    expect(sayaFmt(1_000_000_000)).toBe("1 тэрбум");
  });
});

describe("fmt", () => {
  it("мянгатыг бүлэглэж, бутархайг бөөрөнхийлнө", () => {
    expect(fmt(1234)).toBe("1,234");
    expect(fmt(1234.6)).toBe("1,235");
    expect(fmt(0)).toBe("0");
  });
});

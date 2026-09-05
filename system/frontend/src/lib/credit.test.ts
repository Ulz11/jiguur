import { describe, it, expect } from "vitest";
import { clientState, creditLine, exactBelow, unallocatedCredit } from "./credit";

const money = (v: number) => `${Math.round(v).toLocaleString("en-US")}₮`;

/* ХУРД ГРУПП — 78,165,000₮ илүү төлсөн. Дэлгэц нь «Авлага 0₮ · Хэвийн» гэж
   зогсдог байв: 78 сая нь «Төлбөр» табын нэг мөр болж нуугдана. */

describe("unallocatedCredit", () => {
  it("хуваарилагдаагүй үлдэгдлүүдийг нэгтгэнэ", () => {
    expect(unallocatedCredit([
      { amount: 100_000_000, allocated: 21_835_000 },
      { amount: 5_000_000, allocated: 5_000_000 },
    ])).toBe(78_165_000);
  });

  it("ХҮЧИНГҮЙ болсон төлбөр кредит үүсгэхгүй", () => {
    expect(unallocatedCredit([
      { amount: 78_165_000, allocated: 0, voided: true },
    ])).toBe(0);
  });

  it("`allocated` ирээгүй бол БҮГД суусан гэж үзнэ — хий кредит зохиохгүй", () => {
    expect(unallocatedCredit([{ amount: 5_000_000 }])).toBe(0);
    expect(unallocatedCredit(null)).toBe(0);
  });

  it("хэт хуваарилагдсан мөр (сөрөг үлдэгдэл) нийлбэрийг бууруулахгүй", () => {
    expect(unallocatedCredit([
      { amount: 1_000, allocated: 5_000 },
      { amount: 3_000, allocated: 0 },
    ])).toBe(3_000);
  });
});

describe("creditLine", () => {
  it("БҮТЭН төгрөгөөр бичиж, дараа нь юу болохыг хэлнэ", () => {
    expect(creditLine(78_165_000, money))
      .toBe("Илүү төлөлт (кредит): 78,165,000₮ — дараагийн нэхэмжлэлээс хасагдана");
  });

  it("кредитгүй бол мөр огт гарахгүй", () => {
    expect(creditLine(0, money)).toBe("");
    expect(creditLine(0.4, money)).toBe("");
  });
});

describe("clientState — толгойн пил", () => {
  it("хэтэрсэн өр бүхнээс түрүүнд", () => {
    expect(clientState(500_000, true, 0).label).toBe("Хэтэрсэн өртэй");
  });

  it("үлдэгдэлтэй бол кредит хамаагүй", () => {
    expect(clientState(500_000, false, 100).label).toBe("Үлдэгдэлтэй");
  });

  it("авлага тэг атал кредиттэй бол «Хэвийн» БИШ", () => {
    expect(clientState(0, false, 78_165_000))
      .toEqual({ cls: "pill-green", label: "Кредиттэй" });
  });

  it("юу ч байхгүй бол хэвийн", () => {
    expect(clientState(0, false, 0)).toEqual({ cls: "pill-green", label: "Хэвийн" });
  });
});

/* «0₮» гэсэн мөр ХОЁР удаа дараалж зогсдог байв (дугуйлсан + бүтэн). */
describe("exactBelow — давхардсан тоо гарахгүй", () => {
  it("ижил хоёр тоо бол хоёр дахь мөр унана", () => {
    expect(exactBelow("0₮", "0₮")).toBe("");
  });
  it("ялгаатай бол бүтэн дүн үлдэнэ", () => {
    expect(exactBelow("78.2 сая₮", "78,165,000₮")).toBe("78,165,000₮");
  });
  it("бүтэн дүн огт ирээгүй бол хоосон", () => {
    expect(exactBelow("3", undefined)).toBe("");
  });
});

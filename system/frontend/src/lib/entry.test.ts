import { describe, it, expect } from "vitest";
import {
  ENTRY_KINDS, entryAmountText, entryError, entryKindLabel, entryKindPill,
  entryModeLabel, entrySign, entrySubText, receivableAfter, signedAmount,
} from "./entry";

const money = (v: number) => `${Math.round(v).toLocaleString("en-US")}₮`;

/* Бутан-Өнөорд!G23 = 164,492,000₮ «2025 онд бэлэн мөнгө зээлсэн»;
   C28 = 2,800,000₮ «ажилчдын цалинд»; WB3!R24 = 139,648,000₮ Өнө Ордтой
   хийсэн тооцоо. Эдгээр нь харилцагчийн ДАНСАН дээрх түрээс биш бичилтүүд
   (H11) — доорх дүрмүүд нь тэдгээрийг дэлгэц дээр буруу тэмдэгтэй
   уншуулахгүй байх ганц хамгаалалт. */

describe("Дебит / Кредит сонголт", () => {
  it("тэмдгийг СОНГОЛТ зөөнө — тэр хасах тэмдэг бичихгүй", () => {
    expect(entrySign("debit")).toBe(1);
    expect(entrySign("credit")).toBe(-1);
  });

  it("бичсэн дүн үргэлж эерэг — тэмдэг нь сонголтоос гарна", () => {
    expect(signedAmount("debit", 164_492_000)).toBe(164_492_000);
    expect(signedAmount("credit", 500_000)).toBe(-500_000);
    // Санамсаргүй хасах тэмдэг бичсэн ч сонголт л шийднэ
    expect(signedAmount("debit", -164_492_000)).toBe(164_492_000);
    expect(signedAmount("credit", -500_000)).toBe(-500_000);
  });

  it("сонголт бүр авлага ХААШАА хөдлөхийг ӨГҮҮЛБЭРЭЭР хэлнэ", () => {
    expect(entryModeLabel("debit")).toBe("Дебит — авлага нэмэгдэнэ");
    expect(entryModeLabel("credit")).toBe("Кредит — авлага буурна");
  });

  it("хоосон/утгагүй оролт 0 болно — NaN дэлгэц рүү гарахгүй", () => {
    expect(signedAmount("debit", NaN)).toBe(0);
    expect(signedAmount("credit", NaN)).toBe(-0);
  });
});

describe("авлагын хөдөлгөөн", () => {
  it("Бутангуудын 164,492,000₮ зээл авлагыг ЯГ тэр дүнгээр өсгөнө", () => {
    expect(receivableAfter(335_333_564, signedAmount("debit", 164_492_000)))
      .toBe(499_825_564);
  });
  it("кредит бичилт авлагыг ЯГ тэр дүнгээр бууруулна", () => {
    expect(receivableAfter(1_000_000, signedAmount("credit", 400_000))).toBe(600_000);
  });
  it("дүн нь тэмдэгтэйгээ уншигдана", () => {
    expect(entryAmountText(164_492_000, money)).toBe("+164,492,000₮");
    expect(entryAmountText(-500_000, money)).toBe("−500,000₮");
  });
});

describe("төрлийн толь", () => {
  it("дөрвүүлээ монгол нэртэй, дараалал нь тогтмол", () => {
    expect(ENTRY_KINDS.map(([k]) => k))
      .toEqual(["advance", "service", "transfer", "adjustment"]);
    expect(ENTRY_KINDS.map(([, l]) => l))
      .toEqual(["Олгосон зээл", "Үйлчилгээ", "Шилжүүлэг", "Залруулга"]);
  });

  it("танихгүй төрөл чимээгүй алга болохгүй — өөрөө гарна", () => {
    expect(entryKindLabel("хачин")).toBe("хачин");
    expect(entryKindPill("хачин")).toBe("pill-grey");
  });

  it("өнгө нь UI-ЗАРЧИМ §4-ийн шатнаас гарна", () => {
    const SCALE = new Set(["pill-violet", "pill-blue", "pill-amber", "pill-grey"]);
    for (const [k] of ENTRY_KINDS) expect(SCALE.has(entryKindPill(k))).toBe(true);
  });
});

describe("маягтын алдаа", () => {
  it("шошго ЗААВАЛ — «164,492,000₮» гэсэн тоо дангаараа юу ч хэлэхгүй", () => {
    expect(entryError("   ", 164_492_000)).toBe("Юуны төлөө вэ — шошгыг заавал бичнэ");
    expect(entryError("2025 онд бэлэн мөнгө зээлсэн", 164_492_000)).toBe("");
  });
  it("0 дүн бичилт биш", () => {
    expect(entryError("зээл", 0)).toBe("Дүн 0-ээс их байх ёстой");
  });
});

describe("мөрийн хоёрдогч мөр", () => {
  it("баримтын №, эх сурвалж, тэмдэглэл нэг өгүүлбэр болно", () => {
    expect(entrySubText({ invoice_no: "A-4-1", ref: "Бутан-Өнөорд!G23", note: "актаар" }))
      .toBe("№A-4-1 · Бутан-Өнөорд!G23 · актаар");
  });
  it("хоосон хэсэг нь тусгаарлагчаа авч явахгүй", () => {
    expect(entrySubText({ invoice_no: null, ref: "", note: "" })).toBe("");
    expect(entrySubText({ invoice_no: null, ref: "акт №7", note: "" })).toBe("акт №7");
  });
});

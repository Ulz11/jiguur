import { describe, it, expect } from "vitest";
import {
  balanceShift, barterSavedOutcome, barterSellOutcome, barterToStockOutcome,
  employeeOutcome, invoiceCreatedOutcome, loanAddedOutcome, loanClosedOutcome,
  loanPayDeletedOutcome, loanPayOutcome, loanReopenedOutcome, loanStatusOutcome,
  salaryPaidOutcome, salaryRunDeletedOutcome, salaryRunOutcome,
  settingChange, settingsSavedOutcome,
} from "./outcomeSide";

/* Зурвасын ДҮРЭМ (`lib/outcome.ts`-тэй ижил): ганц тоо нь өөрчлөлтийг
   ХЭЛДЭГГҮЙ. Отгоо өмнөх тоог санахгүй тул «одоо 2.03 тэрбум» гэдэг нь
   «өссөн үү, буурсан уу» гэсэн асуултыг хариулахгүй. */

describe("үлдэгдлийн шилжилт", () => {
  it("ХОЁР тоог хамт хэлнэ", () => {
    expect(balanceShift(2_040_000_000, 2_030_000_000))
      .toBe("үлдэгдэл 2,040,000,000₮ → 2,030,000,000₮");
  });
  it("тоо хөдлөөгүй бол мөр ОГТ гарахгүй", () => {
    expect(balanceShift(500_000, 500_000)).toBe("");
    expect(balanceShift(500_000.2, 500_000.1)).toBe("");
  });
});

describe("зээл", () => {
  it("хүүгийн төлөлт — дүн, огноо, үлдэгдлийн шилжилт", () => {
    expect(loanPayOutcome({ name: "Хаан банк", amount: 4_800_000, part: "interest",
                            date: "2026-09-06", before: 300_000_000, after: 300_000_000 }).text)
      .toBe("Төлөлт бүртгэгдлээ — Хаан банк · 4,800,000₮ хүү · 2026-09-06");
  });

  it("үндсэн төлөлт нь үлдэгдлийг хөдөлгөнө", () => {
    expect(loanPayOutcome({ name: "Хаан банк", amount: 10_000_000, part: "principal",
                            date: "2026-09-06", before: 300_000_000, after: 290_000_000 }).text)
      .toContain("үлдэгдэл 300,000,000₮ → 290,000,000₮");
  });

  it("СЕРВЕР зээлийг хаасныг зурвас ҮҮРНЭ — мөр жагсаалтаас чимээгүй алга болохгүй", () => {
    const o = loanPayOutcome({ name: "Болд ах", amount: 5_000_000, part: "principal",
                               date: "2026-09-06", before: 5_000_000, after: 0, closed: true });
    expect(o.text).toContain("зээл хаагдлаа — үлдэгдэл 0");
  });

  it("нэмэлт олголт нь ТӨЛӨЛТ БИШ гэдгээ гарчгаараа хэлнэ", () => {
    expect(loanPayOutcome({ name: "Болд ах", amount: 2_000_000, part: "topup",
                            date: "2026-09-06", before: 5_000_000, after: 7_000_000 }).text)
      .toMatch(/^Нэмэлт олголт бүртгэгдлээ —/);
  });

  it("автомат хаалт ба сэргээлт нь ганцаараа зогсоно", () => {
    expect(loanClosedOutcome("Хаан банк").text).toBe("Зээл хаагдлаа — үлдэгдэл 0 — Хаан банк");
    expect(loanReopenedOutcome("Хаан банк", 4_000_000).text)
      .toBe("Зээл сэргэлээ — Хаан банк · үлдэгдэл 4,000,000₮ болсон тул нээгдэв");
  });

  it("төлөлт устгах нь сэргээлтээ хэлнэ", () => {
    const o = loanPayDeletedOutcome({ name: "Болд ах", amount: 5_000_000, part: "principal",
                                      date: "2026-09-01", before: 0, after: 5_000_000,
                                      reopened: true });
    expect(o.text).toContain("Төлөлт устгагдлаа");
    expect(o.text).toContain("зээл сэргэлээ");
  });

  it("гараар хаах/сэргээх", () => {
    expect(loanStatusOutcome("Хаан банк", true, 0).text).toContain("сарын дарамтаас хасагдав");
    expect(loanStatusOutcome("Хаан банк", false, 1_000_000).text)
      .toContain("сарын хүү дахин тооцогдоно");
  });

  it("шинэ зээл", () => {
    expect(loanAddedOutcome("Хаан банк — шугам №3", 250_000_000, 1.6).text)
      .toBe("Зээл бүртгэгдлээ — Хаан банк — шугам №3 · 250,000,000₮ · 1.6%/сар");
  });
});

describe("цалин", () => {
  it("бодолт — үе, хүний тоо, гарт олгох", () => {
    expect(salaryRunOutcome({ period: "2026-09", half: 1, people: 14, net: 5_950_000 }).text)
      .toBe("Бодолт үүслээ — 2026-09 · 1-р хагас · 14 хүн · гарт олгох 5,950,000₮");
  });
  it("олголт — огноотойгоо", () => {
    expect(salaryPaidOutcome({ period: "2026-08", half: 2, net: 5_950_000, date: "2026-09-06" }).text)
      .toContain("2026-09-06");
  });
  it("устгал — дахин бодож болно гэдгийг хэлнэ", () => {
    expect(salaryRunDeletedOutcome({ period: "2026-09", half: 1, people: 14, net: 5_950_000 }).text)
      .toContain("дахин бодож болно");
  });
  it("ажилтны гурван үйлдэл — гурван гарчиг", () => {
    expect(employeeOutcome("add", { name: "Б.Дорж" }).text).toMatch(/^Ажилтан бүртгэгдлээ/);
    expect(employeeOutcome("off", { name: "Б.Дорж" }).text).toMatch(/^Ажилтан жагсаалтаас хасагдлаа/);
    expect(employeeOutcome("on", { name: "Б.Дорж", roleTitle: "нярав" }).text)
      .toBe("Ажилтан жагсаалтад буцлаа — Б.Дорж · нярав");
  });
});

describe("бартер", () => {
  it("борлуулалт — ашиг/алдагдлаа НЭРЛЭНЭ", () => {
    expect(barterSellOutcome({ name: "Автомашин 1234УБА", amount: 18_000_000,
                               valueIn: 15_000_000, date: "2026-09-06" }).text)
      .toContain("ашиг +3,000,000₮");
    expect(barterSellOutcome({ name: "Байр", amount: 10_000_000,
                               valueIn: 15_000_000, date: "2026-09-06" }).text)
      .toContain("алдагдал −5,000,000₮");
  });
  it("бүртгэл ба засвар — өөр гарчигтай", () => {
    expect(barterSavedOutcome(false, { name: "Байр", valueIn: 15_000_000, dateIn: "2026-09-01" }).text)
      .toMatch(/^Хөрөнгө бүртгэгдлээ/);
    expect(barterSavedOutcome(true, { name: "Байр", valueIn: 15_000_000, dateIn: "2026-09-01" }).text)
      .toMatch(/^Хөрөнгө засагдлаа/);
  });
  it("нөөцөд оруулах — материал, зэрэглэл, ширхэг", () => {
    expect(barterToStockOutcome({ name: "Хэв", material: "Хэв хашмал 2020",
                                  grade: "С", qty: 120 }).text)
      .toBe("Агуулахын нөөцөд орлоо — Хэв · Хэв хашмал 2020 (С) · 120ш");
  });
});

describe("механизмын нэхэмжлэл", () => {
  it("№, харилцагч, мөр, дүн", () => {
    expect(invoiceCreatedOutcome({ no: "M-26/09-1", client: "Түмэн хийц",
                                   rows: 7, grandTotal: 4_620_000 }).text)
      .toBe("Нэхэмжлэл үүслээ — №M-26/09-1 · Түмэн хийц · 7 мөр · 4,620,000₮");
  });
});

describe("тохиргоо", () => {
  it("юуг юу болгосныг нэрлэнэ", () => {
    expect(settingChange("Механизмын НӨАТ", "0", "10")).toBe("Механизмын НӨАТ 0 → 10");
    expect(settingChange("Механизмын НӨАТ", "10", "10")).toBe("");
  });
  it("өөрчлөлтгүй хадгалалт ч чимээгүй өнгөрөхгүй", () => {
    expect(settingsSavedOutcome([]).text).toBe("Тохиргоо хадгалагдлаа — өөрчлөлтгүй");
    expect(settingsSavedOutcome(["Механизмын НӨАТ 0 → 10", ""]).text)
      .toBe("Тохиргоо хадгалагдлаа — Механизмын НӨАТ 0 → 10");
  });
});

import { describe, it, expect } from "vitest";
import {
  PAID_RUN_LOCKED, VALUE_IN_REQUIRED, balanceAfterPay, isOverdue, methodMn,
  ndshLabel, overdueHeroText, overdueText, previewBlocked, previewRows,
  previewTotal, runDeletable, trimPct, valueInError,
} from "./sideRows";

describe("зээлийн хоцролт", () => {
  it("пилийн үг нь ХЭДЭН ХОНОГ болохыг хэлнэ — өнгө дангаараа утга зөөхгүй", () => {
    expect(overdueText(12)).toBe("Төлөлт хоцорсон · 12 хоног");
  });
  it("сөрөг хоног гарахгүй", () => {
    expect(overdueText(-3)).toBe("Төлөлт хоцорсон · 0 хоног");
  });
  it("толгойн тоо 0 байхад ч ӨГҮҮЛБЭР үлдэнэ", () => {
    expect(overdueHeroText(3)).toBe("3 зээлийн төлөлт хоцорсон");
    expect(overdueHeroText(0)).toBe("хоцорсон төлөлт алга");
  });
  it("хаагдсан зээл дээр хоцролт гарахгүй", () => {
    expect(isOverdue({ overdue: true, status: "active" })).toBe(true);
    expect(isOverdue({ overdue: true, status: "closed" })).toBe(false);
    expect(isOverdue({ overdue: false, status: "active" })).toBe(false);
  });
  it("хүү нь үлдэгдлийг ХӨНДӨХГҮЙ, үндсэн нь буулгана, олголт нь нэмнэ", () => {
    expect(balanceAfterPay(1_000_000, "interest", 50_000)).toBe(1_000_000);
    expect(balanceAfterPay(1_000_000, "principal", 400_000)).toBe(600_000);
    expect(balanceAfterPay(1_000_000, "principal", 5_000_000)).toBe(0);
    expect(balanceAfterPay(1_000_000, "topup", 500_000)).toBe(1_500_000);
  });
});

describe("цалингийн НДШ", () => {
  it("хувь нь ТОХИРГООНООС ирнэ — 11.5 гэж хатуу бичихгүй", () => {
    expect(ndshLabel(11.5)).toBe("НДШ суутгана (11.5%)");
    expect(ndshLabel(13)).toBe("НДШ суутгана (13%)");
  });
  it("хувь мэдэгдэхгүй бол тоо ХУДЛААР гарахгүй", () => {
    expect(ndshLabel(0)).toBe("НДШ суутгана");
    expect(ndshLabel(null)).toBe("НДШ суутгана");
  });
  it("хоосон тэг өлгөхгүй", () => {
    expect(trimPct(11.5)).toBe("11.5");
    expect(trimPct(11)).toBe("11");
    expect(trimPct(11.004)).toBe("11");
  });
  it("ОЛГОСОН бодолт устгагдахгүй — сервертэй нэг үг", () => {
    expect(runDeletable({ paid: false })).toBe(true);
    expect(runDeletable({ paid: true })).toBe(false);
    expect(PAID_RUN_LOCKED).toBe("Олгосон бодолтыг устгах боломжгүй");
  });
});

describe("бартерын орж ирсэн үнэ", () => {
  it("СЕРВЕРИЙН өгүүлбэрийг илгээхээс ӨМНӨ хэлнэ", () => {
    expect(valueInError(0, "0")).toBe(VALUE_IN_REQUIRED);
    expect(valueInError(0, "")).toBe(VALUE_IN_REQUIRED);
    expect(valueInError(-5, "-5")).toBe(VALUE_IN_REQUIRED);
  });
  it("эерэг дүн дээр чимээгүй", () => {
    expect(valueInError(15_000_000, "15,000,000")).toBe("");
  });
});

describe("механизмын урьдчилсан баримт", () => {
  const base = {
    no: "M-26/09-1", client: "Түмэн хийц", rows: 3,
    lines: [
      { date: "2026-09-01", label: "Бүтэн өдөр", method: "BANK", amount: 1_000_000 },
      { date: "2026-09-02", label: "Хагас өдөр", method: "CASH", amount: 500_000 },
      { date: "2026-09-03", label: "Бүтэн өдөр", method: "BANK", amount: 1_000_000 },
    ],
    total: 2_500_000, vat: 250_000, vat_percent: 10, grand_total: 2_750_000,
    overlap_no: null, warning: "",
  };

  it("мөр бүр огноо · төрөл · хэлбэрээ үүрнэ", () => {
    const rows = previewRows(base);
    expect(rows[0]).toEqual({ label: "2026-09-01 · Бүтэн өдөр", sub: "Данс",
                              value: "1,000,000₮" });
  });

  it("НӨАТ нь СЕРВЕРИЙН хувиар — дэлгэц дахин бодохгүй", () => {
    const rows = previewRows(base);
    expect(rows.map((r) => r.label)).toContain("НӨАТ 10%");
    expect(rows.find((r) => r.label === "НӨАТ 10%")!.value).toBe("250,000₮");
    expect(previewTotal(base)).toEqual({ label: "3 мөр · Нийт", value: "2,750,000₮",
                                        accent: "money" });
  });

  it("НӨАТ 0 бол мөр огт нэмэгдэхгүй — байхгүй татварыг зарлахгүй", () => {
    const rows = previewRows({ ...base, vat: 0, vat_percent: 0, grand_total: 2_500_000 });
    expect(rows.some((r) => r.label.startsWith("НӨАТ"))).toBe(false);
  });

  it("зургаагаас олон мөрийг эвхэж, үлдсэн дүнг нь хэлнэ", () => {
    const lines = Array.from({ length: 9 }, (_, i) => ({
      date: `2026-09-0${i + 1}`, label: "Бүтэн өдөр", method: "BANK", amount: 100_000 }));
    const rows = previewRows({ ...base, rows: 9, lines, total: 900_000, vat: 0, grand_total: 900_000 });
    expect(rows).toHaveLength(7);
    expect(rows[6]).toEqual({ label: "… бас 3 мөр", value: "300,000₮", accent: "dim" });
  });

  it("хугацаа ДАВХАЦСАН бол үүсгэх зам хаагдана (сервер 409)", () => {
    expect(previewBlocked(base)).toBe(false);
    expect(previewBlocked({ ...base, overlap_no: "M-26/09-1" })).toBe(true);
    expect(previewBlocked({ ...base, rows: 0, lines: [] })).toBe(true);
  });

  it("төлбөрийн хэлбэр монголоор — танихгүй түлхүүр «—»", () => {
    expect(methodMn("BARTER")).toBe("Бартер");
    expect(methodMn("XYZ")).toBe("—");
    expect(methodMn(undefined)).toBe("—");
  });
});

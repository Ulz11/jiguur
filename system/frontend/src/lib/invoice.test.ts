import { describe, it, expect } from "vitest";
import { invoiceLabel } from "./invoice";

// Нэг нэхэмжлэлийг хоёр өөр нэрээр дуудвал Отгоо тэднийг хоёр өөр объект гэж
// уншина. Тиймээс нэр нь НЭГ дүрмээс гарна: түрээсийнх — үе, бусад нь — №.

describe("invoiceLabel", () => {
  it("түрээсийн нэхэмжлэлийг үеээр нь нэрлэж, дугаарыг хоёрдогч болгоно", () => {
    expect(invoiceLabel({ no: "R-24/03-4", cycle_start: "2026-07-20", cycle_end: "2026-08-19" }))
      .toEqual({ title: "2026-07-20 – 2026-08-19", sub: "№R-24/03-4" });
  });

  it("худалдааны нэхэмжлэлд үе байхгүй (цикл = нэг өдөр) тул № нь өөрөө нэр", () => {
    expect(invoiceLabel({ no: "S-26/15-3", cycle_start: "2026-05-04", cycle_end: "2026-05-04" }))
      .toEqual({ title: "№S-26/15-3" });
  });

  it("хуучин үлдэгдлийн (OB) нэхэмжлэлийг «2026-01-01 – 2026-01-01» гэж нэрлэхгүй", () => {
    expect(invoiceLabel({ no: "OB-5", cycle_start: "2026-01-01", cycle_end: "2026-01-01" }))
      .toEqual({ title: "№OB-5" });
  });

  it("үеийн огноо алга бол № рүү унана", () => {
    expect(invoiceLabel({ no: "R-9" })).toEqual({ title: "№R-9" });
  });
});

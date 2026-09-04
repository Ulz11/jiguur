import { describe, it, expect } from "vitest";
import { agreedMark, agreedTitle, invoiceLabel, isAgreed } from "./invoice";

// Нэг нэхэмжлэлийг хоёр өөр нэрээр дуудвал Отгоо тэднийг хоёр өөр объект гэж
// уншина. Тиймээс нэр нь НЭГ дүрмээс гарна: түрээсийнх — үе, бусад нь — №.

describe("invoiceLabel", () => {
  /* ШОШГЫН ФОРМАТ (M5/R4): цонх нь [7.20, 8.19) хэвээр ирдэг, НЭР нь
     БАГТААМЖТАЙ гарна — «7.20 – 8.18» = 30 хоног. Урьд нь 31 хоног мэт
     уншигдаж, Отгоо «машин нэг хоног нэмчихлээ» гэж дүгнэдэг байв. */
  it("түрээсийн нэхэмжлэлийг үеээр нь нэрлэж, дугаарыг хоёрдогч болгоно", () => {
    expect(invoiceLabel({ no: "R-24/03-4", cycle_start: "2026-07-20", cycle_end: "2026-08-19" }))
      .toEqual({ title: "2026-07-20 – 2026-08-18", sub: "№R-24/03-4" });
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

describe("«Тооцоо нийлсэн» тэмдэг", () => {
  it("огноо ба гарын үсэгтний нэрийг НЭГ өгүүлбэр болгоно", () => {
    expect(agreedMark({ agreed_at: "2026-07-20", agreed_by: "Н.Манлай" }))
      .toBe("Тооцоо нийлсэн 2026-07-20 · Н.Манлай");
  });

  it("гарын үсэгтэн бичигдээгүй бол огноо ганцаараа зогсоно", () => {
    expect(agreedMark({ agreed_at: "2026-07-20", agreed_by: "" }))
      .toBe("Тооцоо нийлсэн 2026-07-20");
  });

  it("тэмдэглэгээгүй нэхэмжлэл ХООСОН — хий шошго нэмэхгүй", () => {
    expect(agreedMark({ agreed_at: null, agreed_by: "" })).toBe("");
    expect(agreedMark(undefined)).toBe("");
    expect(isAgreed({ agreed_at: null })).toBe(false);
    expect(isAgreed({ agreed_at: "2026-07-20" })).toBe(true);
  });

  it("tooltip нь зөвхөн батлагдсан мөрөнд гарна", () => {
    expect(agreedTitle({ agreed_at: null })).toBeUndefined();
    expect(agreedTitle({ agreed_at: "2026-07-20", agreed_by: "Н.Манлай" }))
      .toBe("Тооцоо нийлсэн 2026-07-20 · Н.Манлай");
  });
});

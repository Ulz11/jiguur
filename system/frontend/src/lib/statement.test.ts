import { describe, it, expect } from "vitest";
import { STATEMENT_CHOICES, statementError, statementRange, statementRangeText,
         statementUrl } from "./statement";

/* Отгоо эгч тооцоо нийлэхээр очихдоо цаас барьж явдаг. Хугацааг гурван
   бэлэн товчоор сонгоно; гараар заах нь үлдэнэ (тооцоо нийлэх үе нь дурын). */

describe("statementRange", () => {
  it("«Бүх хугацаа» нь хоёр талаа СЕРВЕРТ үлдээнэ", () => {
    expect(statementRange("all", "2026-09-05")).toEqual({ from: "", to: "" });
  });

  it("«Энэ сар» нь сарын нэгнээс өнөөдрийг хүртэл", () => {
    expect(statementRange("month", "2026-09-05"))
      .toEqual({ from: "2026-09-01", to: "2026-09-05" });
  });

  it("«Сүүлийн 3 сар» нь гурван сарын өмнөх ЯГ тэр өдрөөс", () => {
    expect(statementRange("quarter", "2026-09-05"))
      .toEqual({ from: "2026-06-05", to: "2026-09-05" });
  });

  it("оны хил дамжина", () => {
    expect(statementRange("quarter", "2026-01-15").from).toBe("2025-10-15");
  });

  it("богино сар руу унахад сүүлчийн өдөр дээр зогсоно", () => {
    expect(statementRange("quarter", "2026-05-31").from).toBe("2026-02-28");
  });

  it("«Огноо заах» нь бичсэн хоёр огноог л дамжуулна", () => {
    expect(statementRange("custom", "2026-09-05",
                          { from: "2026-01-01", to: "2026-06-30" }))
      .toEqual({ from: "2026-01-01", to: "2026-06-30" });
    expect(statementRange("custom", "2026-09-05")).toEqual({ from: "", to: "" });
  });

  it("дөрвөн сонголт, дараалал нь тогтмол", () => {
    expect(STATEMENT_CHOICES.map(([v]) => v))
      .toEqual(["all", "month", "quarter", "custom"]);
  });
});

describe("statementError", () => {
  it("урвуу муж — ӨГҮҮЛБЭРЭЭР", () => {
    expect(statementError({ from: "2026-09-01", to: "2026-01-01" }))
      .toBe("Эхлэх огноо дуусах огнооноос хойш байна");
  });
  it("нэг тал нь хоосон бол алдаа биш", () => {
    expect(statementError({ from: "", to: "" })).toBe("");
    expect(statementError({ from: "2026-01-01", to: "" })).toBe("");
  });
});

describe("statementRangeText — цонх дээрх хүний уншилт", () => {
  it("бүх хугацаа өөрийгөө нэрлэнэ", () => {
    expect(statementRangeText({ from: "", to: "" }))
      .toBe("Бүх хугацаа — эхний бичилтээс өнөөдрийг хүртэл");
  });
  it("хоёр огноотой бол мужаараа", () => {
    expect(statementRangeText({ from: "2026-06-05", to: "2026-09-05" }))
      .toBe("2026-06-05 – 2026-09-05");
  });
});

describe("statementUrl", () => {
  it("хоосон талбар query-д ОРОХГҮЙ", () => {
    expect(statementUrl(4, { from: "", to: "" }))
      .toBe("/api/clients/4/statement-pdf");
  });
  it("хоёр огноо хоёулаа орно", () => {
    expect(statementUrl(4, { from: "2026-06-05", to: "2026-09-05" }))
      .toBe("/api/clients/4/statement-pdf?from=2026-06-05&to=2026-09-05");
  });
  it("нэг тал нь бол ганцаараа", () => {
    expect(statementUrl(7, { from: "", to: "2026-09-05" }))
      .toBe("/api/clients/7/statement-pdf?to=2026-09-05");
  });
});

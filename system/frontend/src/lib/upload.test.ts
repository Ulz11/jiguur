import { describe, it, expect } from "vitest";
import { MAX_UPLOAD_BYTES, ATTACH_ACCEPT, mb, oversizeMessage } from "./upload";

const MB = 1024 * 1024;

describe("дээд хэмжээ", () => {
  it("4 MB — Vercel-ийн 4.5 MB-ийн хаалганаас ДООГУУР (multipart нь толгой нэмнэ)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(4 * MB);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * MB);
  });

  it("файл сонгох цонх нь зураг, PDF, Excel-ийг санал болгоно", () => {
    for (const ext of [".pdf", ".jpg", ".png", ".xlsx"]) {
      expect(ATTACH_ACCEPT).toContain(ext);
    }
  });
});

describe("mb", () => {
  it("бүхэл тоог сүүлийн тэггүй бичнэ", () => {
    expect(mb(4 * MB)).toBe("4 MB");
  });
  it("бутархайг нэг оронгоор", () => {
    expect(mb(6.25 * MB)).toBe("6.3 MB");
  });
});

describe("oversizeMessage", () => {
  it("багтаж байвал ЮУ Ч ХЭЛЭХГҮЙ", () => {
    expect(oversizeMessage(0)).toBeNull();
    expect(oversizeMessage(1)).toBeNull();
    expect(oversizeMessage(MAX_UPLOAD_BYTES)).toBeNull();     // яг хилийн утга — зөвшөөрнө
  });

  it("хэтэрсэн бол ХЭР ТОМ, ХЭД БАЙХ ЁСТОЙ, ЮУ ХИЙХ гурвыг нь хэлнэ", () => {
    const msg = oversizeMessage(6.2 * MB)!;
    expect(msg).toContain("6.2 MB");
    expect(msg).toContain("4 MB");
    expect(msg).toContain("жижигрүүлэх");
  });

  it("дээд хэмжээг дуудагч тал өөрчилж болно", () => {
    expect(oversizeMessage(2 * MB, 1 * MB)).toContain("1 MB");
    expect(oversizeMessage(2 * MB, 3 * MB)).toBeNull();
  });
});

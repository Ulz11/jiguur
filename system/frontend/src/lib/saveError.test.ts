import { describe, it, expect } from "vitest";
import { inlineErrorText, unsavedToast, saveErrorOf, NOT_SAVED } from "./saveError";

describe("saveErrorOf — юу ч барьж авсан бай, УНШИГДАХ мөр гарна", () => {
  it("Error-ийн мессежийг авна", () => {
    expect(saveErrorOf(new Error("Энэ гэрээ хаагдсан"))).toBe("Энэ гэрээ хаагдсан");
  });
  it("мессежгүй бол ерөнхий мөр — ХООСОН хэзээ ч биш", () => {
    expect(saveErrorOf(new Error(""))).toBe("Алдаа гарлаа");
    expect(saveErrorOf(undefined)).toBe("Алдаа гарлаа");
    expect(saveErrorOf({})).toBe("Алдаа гарлаа");
  });
  it("шууд мөр шидсэн ч ажиллана", () => {
    expect(saveErrorOf("Эрх хүрэхгүй")).toBe("Эрх хүрэхгүй");
  });
  it("зайг цэвэрлэнэ", () => {
    expect(saveErrorOf(new Error("  Эрх хүрэхгүй  "))).toBe("Эрх хүрэхгүй");
  });
});

describe("inlineErrorText — талбарын доорх БОГИНО мөр", () => {
  it("богино мессежийг хэвээр нь үлдээнэ", () => {
    expect(inlineErrorText("Эрх хүрэхгүй")).toBe("Эрх хүрэхгүй");
  });
  it("урт мессежийг таслаад «…» тавина — нүд нь бүрэн toast дээр", () => {
    const long = "а".repeat(120);
    const out = inlineErrorText(long);
    expect(out.length).toBeLessThanOrEqual(73);
    expect(out.endsWith("…")).toBe(true);
  });
  it("олон мөрийг НЭГ мөр болгоно (422 нь «; »-ээр залгагддаг)", () => {
    expect(inlineErrorText("нэг\nхоёр")).toBe("нэг хоёр");
  });
});

describe("unsavedToast — «Хадгалагдсангүй» гэдгийг ТАЛБАРААР нь нэрлэнэ", () => {
  it("талбарын нэр + шалтгаан", () => {
    expect(unsavedToast("Тариф", "Эрх хүрэхгүй"))
      .toBe("Тариф хадгалагдсангүй — Эрх хүрэхгүй");
  });

  it("нэргүй талбар ч гэсэн ЮУ болсныг хэлнэ", () => {
    expect(unsavedToast(undefined, "Эрх хүрэхгүй"))
      .toBe(`Өөрчлөлт ${NOT_SAVED} — Эрх хүрэхгүй`);
  });

  it("урт нэрийг таслана — toast нь дэлгэц дүүргэхгүй", () => {
    const t = unsavedToast("Хэв хашмал 6012 (А) · 2026-03-20 — тарифын шинэ утга", "Эрх хүрэхгүй");
    expect(t).toContain("…");
    expect(t).toContain(NOT_SAVED);
    expect(t).toContain("Эрх хүрэхгүй");
  });

  it("шалтгаан хоосон байсан ч ерөнхий мөр гарна", () => {
    expect(unsavedToast("Тариф", "")).toBe("Тариф хадгалагдсангүй — Алдаа гарлаа");
  });

  it("талбарын нэрний хажуугийн зай/цэгийг цэвэрлэнэ", () => {
    expect(unsavedToast("  Хүү ", "Буруу утга")).toBe("Хүү хадгалагдсангүй — Буруу утга");
  });
});

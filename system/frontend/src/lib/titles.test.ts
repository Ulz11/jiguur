import { describe, it, expect } from "vitest";
import { pageTitle, shellTitle, NOT_FOUND_TITLE } from "./titles";

// Гарчиг нь табын нэр БОЛОН дээд мөрийн байршлыг хоёуланг нь тэжээдэг.
// Динамик зам (/contracts/42) таарахгүй байвал хамгийн гүн дэлгэц дээр
// «Жигүүр Зам · Жигүүр Зам» гэсэн таб, хоосон байршил үлддэг.

describe("pageTitle", () => {
  it("тогтмол замуудыг хэвээр нь буцаана", () => {
    expect(pageTitle("/")).toBe("Удирдлагын төв");
    expect(pageTitle("/contracts")).toBe("Гэрээнүүд");
    expect(pageTitle("/warehouse/stocktake")).toBe("Тооллого");
  });

  it("гэрээний дэлгэрэнгүйг дугаараар нь танина", () => {
    expect(pageTitle("/contracts/42")).toBe("Гэрээний дэлгэрэнгүй");
  });

  it("харилцагчийн хуудсыг дугаараар нь танина", () => {
    expect(pageTitle("/clients/7")).toBe("Харилцагчийн хуудас");
  });

  it("материалын дэлгэрэнгүйг дугаараар нь танина", () => {
    expect(pageTitle("/warehouse/materials/1")).toBe("Материалын дэлгэрэнгүй");
    // Тооллого нь дугааргүй тул тогтмол гарчигаа хэвээр барина
    expect(pageTitle("/warehouse/stocktake")).toBe("Тооллого");
  });

  it("«Шинэ гэрээ» нь дугаартай зам биш — тогтмол гарчигаа хадгална", () => {
    expect(pageTitle("/contracts/new")).toBe("Шинэ гэрээ");
  });

  it("танихгүй зам хоосон буцаана (дуудагч тал нөөц нэрээ тавина)", () => {
    expect(pageTitle("/hongololt")).toBe("");
  });
});

/* 404 нь ГАРЧИГГҮЙ хуудас байв: таб нь «Жигүүр Зам · Жигүүр Зам», дээд
   мөрийн байршил хоосон. Отгоо буруу хаяг дээр зогсож байгаагаа мэдэхгүй. */
describe("shellTitle", () => {
  it("танигдсан зам дээр pageTitle-тэй ижил", () => {
    expect(shellTitle("/reports")).toBe("Тайлан");
    expect(shellTitle("/contracts/42")).toBe("Гэрээний дэлгэрэнгүй");
  });

  it("танихгүй зам дээр НЭРТЭЙ — дээд мөр, таб хоосорохгүй", () => {
    expect(shellTitle("/hongololt")).toBe(NOT_FOUND_TITLE);
    expect(NOT_FOUND_TITLE).toBe("Хуудас олдсонгүй");
  });
});

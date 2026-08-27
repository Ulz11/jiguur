import { describe, it, expect } from "vitest";
import { pageTitle } from "./titles";

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

  it("«Шинэ гэрээ» нь дугаартай зам биш — тогтмол гарчигаа хадгална", () => {
    expect(pageTitle("/contracts/new")).toBe("Шинэ гэрээ");
  });

  it("танихгүй зам хоосон буцаана (дуудагч тал нөөц нэрээ тавина)", () => {
    expect(pageTitle("/hongololt")).toBe("");
  });
});

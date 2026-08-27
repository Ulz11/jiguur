import { describe, it, expect } from "vitest";
import { errorMessage, FALLBACK_ERROR } from "./errors";

/* FastAPI 422 бол `detail` нь МАССИВ буцаадаг. Хуучин `msg = j.detail` нь
 * массивыг Error(...) руу шидээд toast дээр "[object Object]" болж
 * харагддаг байсан — хэрэглэгч юу буруу болсныг мэдэхгүй.
 */
describe("errorMessage", () => {
  it("422-ийн массив detail-ийг уншиж болохоор нэгтгэнэ", () => {
    expect(errorMessage({ detail: [
      { loc: ["body", "deposit"], msg: "Input should be a valid number", type: "float_parsing" },
      { loc: ["body", "no"], msg: "Field required", type: "missing" },
    ] })).toBe("Input should be a valid number; Field required");
  });

  it("энгийн мөр detail-ийг хэвээр нь өгнө", () => {
    expect(errorMessage({ detail: "Гэрээ аль хэдийн хаагдсан" })).toBe("Гэрээ аль хэдийн хаагдсан");
  });

  it("detail байхгүй бол монгол суурь мессеж", () => {
    expect(errorMessage({})).toBe(FALLBACK_ERROR);
    expect(errorMessage(null)).toBe(FALLBACK_ERROR);
    expect(errorMessage(undefined)).toBe(FALLBACK_ERROR);
    expect(errorMessage({ detail: "" })).toBe(FALLBACK_ERROR);
    expect(errorMessage({ detail: [] })).toBe(FALLBACK_ERROR);
  });

  it("хоосон биш ч танихгүй хэлбэр гарвал юу ч алдалгүй мөр буцаана", () => {
    expect(errorMessage({ detail: { msg: "Нэг объект" } })).toBe("Нэг объект");
    expect(errorMessage({ detail: ["зүгээр мөр", 42] })).toBe("зүгээр мөр; 42");
    expect(typeof errorMessage({ detail: { code: 7 } })).toBe("string");
  });

  it("массив дотор msg-гүй мөр байвал үлдсэнийг нь алдагдуулахгүй", () => {
    expect(errorMessage({ detail: [{ type: "missing" }, { msg: "Field required" }] }))
      .toContain("Field required");
  });
});

import { describe, it, expect } from "vitest";
import { canDeleteClient, duplicateInfo, duplicateLinkText } from "./clientAdmin";

/** `api()`-ийн шидэх алдаа: хүн уншихаар мөр + серверийн ТҮҮХИЙ биет. */
function apiError(detail: unknown): Error {
  const e = new Error("Энэ нэртэй харилцагч аль хэдийн бүртгэлтэй: Бутангууд (№4)");
  (e as any).detail = detail;
  return e;
}

describe("duplicateInfo — 409-ийн бүтэцтэй хариу", () => {
  it("өгүүлбэр ба ХААНА байгааг нь хоёуланг гаргана", () => {
    expect(duplicateInfo(apiError({
      msg: "Энэ нэртэй харилцагч аль хэдийн бүртгэлтэй: Бутангууд (№4)",
      existing_id: 4, existing_name: "Бутангууд", field: "name",
    }))).toEqual({
      msg: "Энэ нэртэй харилцагч аль хэдийн бүртгэлтэй: Бутангууд (№4)",
      existingId: 4, existingName: "Бутангууд",
    });
  });

  it("бүтэцгүй алдаа (сүлжээ, 500, энгийн мөр) — null, хуучин зам", () => {
    expect(duplicateInfo(new Error("Алдаа гарлаа"))).toBeNull();
    expect(duplicateInfo(apiError("Олдсонгүй"))).toBeNull();
    expect(duplicateInfo(apiError({ msg: "дутуу", existing_id: 0 }))).toBeNull();
    expect(duplicateInfo(apiError({ existing_id: 4 }))).toBeNull();
    expect(duplicateInfo(null)).toBeNull();
  });

  it("холбоосын нэр нь харилцагчийн НЭР — байхгүй бол дугаараараа", () => {
    expect(duplicateLinkText({ msg: "…", existingId: 4, existingName: "Бутангууд" }))
      .toBe("Бутангууд руу очих");
    expect(duplicateLinkText({ msg: "…", existingId: 4, existingName: "" }))
      .toBe("№4 руу очих");
  });
});

/* Устгал нь ЗӨВХӨН хоосон мөрөнд. Дэлгэцийн шалгалт нь серверийн
   `_attached`-ийн ТОЛЬ — ижил хариу өгөх ёстой. */
describe("canDeleteClient", () => {
  const empty = { contracts: [], payments: [], entries: [], files: [],
                  notes: [], barter: [] };

  it("ганц ч мөргүй харилцагчийг устгаж болно", () => {
    expect(canDeleteClient(empty)).toBe(true);
  });

  it("хуучин үлдэгдлийн ЗОХИОМОЛ гэрээ ч хаалгыг хаана", () => {
    expect(canDeleteClient({ ...empty, contracts: [{ no: "OB-4" }] })).toBe(false);
  });

  it("төлбөр, бичилт, файл, тэмдэглэл, бартер тус бүр хаалгыг хаана", () => {
    for (const k of ["payments", "entries", "files", "notes", "barter"] as const) {
      expect(canDeleteClient({ ...empty, [k]: [{ id: 1 }] }), k).toBe(false);
    }
  });

  it("талбар нь огт ирээгүй бол хоосонтой адил", () => {
    expect(canDeleteClient({})).toBe(true);
    expect(canDeleteClient(null)).toBe(false);
  });
});

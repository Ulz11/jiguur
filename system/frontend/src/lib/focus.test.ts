import { describe, it, expect } from "vitest";
import { trapNext, isTabbable, FOCUSABLE_SELECTOR } from "./focus";

/** Атрибутын жижигхэн хуурамч элемент — DOM-гүйгээр isTabbable-ыг шалгана. */
const el = (attrs: Record<string, string>) => ({
  hasAttribute: (n: string) => n in attrs,
  getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
});

describe("trapNext — модалын фокусын хавх", () => {
  it("сүүлийн элементээс Tab дарвал эхний рүү эргэнэ", () => {
    expect(trapNext(4, 3, false)).toBe(0);
  });

  it("эхний элементээс Shift+Tab дарвал сүүлийн рүү эргэнэ", () => {
    expect(trapNext(4, 0, true)).toBe(3);
  });

  it("дунд нь явж байхад хөндлөнгөөс оролцохгүй — хөтөч өөрөө зөөнө", () => {
    expect(trapNext(4, 1, false)).toBeNull();
    expect(trapNext(4, 2, true)).toBeNull();
  });

  it("захын биш чиглэл рүү явахад ч оролцохгүй", () => {
    // Эхнийхээс УРАГШ, сүүлийнхээс ХОЙШ — эдгээр нь хавхнаас гарахгүй.
    expect(trapNext(4, 0, false)).toBeNull();
    expect(trapNext(4, 3, true)).toBeNull();
  });

  it("фокус модалын гадна байвал буцааж татна", () => {
    expect(trapNext(4, -1, false)).toBe(0);
    expect(trapNext(4, -1, true)).toBe(3);
    // Индекс жагсаалтаас хальсан (элемент устсан) тохиолдол ч мөн адил
    expect(trapNext(4, 9, false)).toBe(0);
  });

  it("ганц товчтой модалд фокус тэр товчин дээрээ үлдэнэ", () => {
    expect(trapNext(1, 0, false)).toBe(0);
    expect(trapNext(1, 0, true)).toBe(0);
  });

  it("фокус авах юмгүй бол null — дуудагч тал самбар дээрээ барина", () => {
    expect(trapNext(0, -1, false)).toBeNull();
    expect(trapNext(0, 0, true)).toBeNull();
  });
});

describe("isTabbable", () => {
  it("энгийн товч фокус авна", () => {
    expect(isTabbable(el({}))).toBe(true);
    expect(isTabbable(el({ tabindex: "0" }))).toBe(true);
  });

  it("нуугдсан болон туслах технологид нуусан элементийг алгасана", () => {
    expect(isTabbable(el({ hidden: "" }))).toBe(false);
    expect(isTabbable(el({ "aria-hidden": "true" }))).toBe(false);
  });

  it("tabindex=-1 нь «Tab-аар бүү оч» гэсэн үг", () => {
    expect(isTabbable(el({ tabindex: "-1" }))).toBe(false);
  });

  it("aria-hidden=false нь нуугаагүй гэсэн үг", () => {
    expect(isTabbable(el({ "aria-hidden": "false" }))).toBe(true);
  });
});

describe("FOCUSABLE_SELECTOR", () => {
  it("идэвхгүй товч, талбарыг сонгохгүй", () => {
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("input:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("select:not([disabled])");
  });

  it("модалд байдаг бүх төрлийн удирдлагыг хамарна", () => {
    for (const tag of ["a[href]", "textarea", "summary", "[tabindex]"]) {
      expect(FOCUSABLE_SELECTOR).toContain(tag);
    }
  });
});

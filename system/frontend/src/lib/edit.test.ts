import { describe, it, expect } from "vitest";
import { editKeyAction } from "./edit";

/* Хоёр алхамт засварын ГАРЫН зам. Хэмжсэн байдал: утга бичээд Enter →
   «Хадгалах уу?» гарч ирнэ, дахин Enter дарахад ЮУ Ч болохгүй байв — хүн
   Tab дарж ✓ чип олох ёстой болдог. Алхам хоёул хэвээр, хоёр дахь Enter
   нь тэр чипийг дарна. */

describe("editKeyAction — дарж засахын товчлуурын шийдвэр", () => {
  it("засварын горимд Enter нь БАТАЛГААЖУУЛАХЫГ асууна (шууд хадгалахгүй)", () => {
    expect(editKeyAction("Enter", "edit")).toBe("ask");
  });

  it("баталгаажуулах горимд ХОЁР дахь Enter нь хадгална", () => {
    expect(editKeyAction("Enter", "confirm")).toBe("commit");
  });

  it("сервер рүү явж байхад Enter давхар илгээхгүй", () => {
    expect(editKeyAction("Enter", "confirm", true)).toBe("none");
  });

  it("Escape нь ХОЁУЛАН горимд цуцална — буцах замгүй үлдэхгүй", () => {
    expect(editKeyAction("Escape", "edit")).toBe("cancel");
    expect(editKeyAction("Escape", "confirm")).toBe("cancel");
    expect(editKeyAction("Escape", "confirm", true)).toBe("cancel");
  });

  it("бусад товчлуур бичихэд саад болохгүй", () => {
    for (const k of ["a", "0", "Tab", " ", "ArrowDown", "Backspace"]) {
      expect(editKeyAction(k, "edit")).toBe("none");
      expect(editKeyAction(k, "confirm")).toBe("none");
    }
  });

  it("харах горимд товчлуур нь энгийн товчных — хөндлөнгөөс орохгүй", () => {
    expect(editKeyAction("Enter", "view")).toBe("none");
    expect(editKeyAction("Escape", "view")).toBe("none");
  });
});

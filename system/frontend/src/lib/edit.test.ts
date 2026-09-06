import { describe, it, expect } from "vitest";
import { canEditMachineLog, canEditMovementDate, canEditRate,
         canEditReturnDetail, editKeyAction } from "./edit";

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

/* ХЭН ЮУГ ЗАСАХ ВЭ — эдгээр нь СЕРВЕРИЙН хаалгуудын толь. Зөрвөл дэлгэц
   дээр «үргэлж 403 болдог товч» (эсвэл байх ёстой атлаа байхгүй товч)
   төрнө: дарга талбай дээр тоогоо бичээд улаан зурвас уншина. */

describe("буцаалтын мөрийг хэн засах вэ", () => {
  it("дарга нь БУЦААЛТЫН мөрөө засна — тэр л бүртгэсэн", () => {
    expect(canEditReturnDetail("factory", "RETURN")).toBe(true);
  });

  it("дарга ОЛГОЛТЫН мөрд хүрэхгүй — падан, тариф нь мөнгөний ертөнц", () => {
    for (const t of ["ISSUE", "WRITEOFF", "SALE"]) {
      expect(canEditReturnDetail("factory", t), t).toBe(false);
    }
  });

  it("менежер бүх мөрийг засна", () => {
    for (const t of ["ISSUE", "RETURN", "WRITEOFF", "SALE"]) {
      expect(canEditReturnDetail("manager", t), t).toBe(true);
    }
  });

  it("санхүүч хөдөлгөөн засдаггүй (сервер ч 403)", () => {
    expect(canEditReturnDetail("finance", "RETURN")).toBe(false);
    expect(canEditReturnDetail(undefined, "RETURN")).toBe(false);
  });

  it("ТАРИФ нь ЗӨВХӨН менежерийнх", () => {
    expect(canEditRate("manager")).toBe(true);
    expect(canEditRate("factory")).toBe(false);
    expect(canEditRate("finance")).toBe(false);
  });
});

describe("хөдөлгөөний огноог хэн засах вэ", () => {
  it("өнөөдөр ӨӨРӨӨ бүртгэсэн бол дарга огноогоо зөв болгоно", () => {
    expect(canEditMovementDate("factory", true)).toBe(true);
  });

  it("бусдын (эсвэл өчигдрийн) мөр дээр даргад товч ГАРАХГҮЙ", () => {
    expect(canEditMovementDate("factory", false)).toBe(false);
  });

  it("менежер үргэлж — санхүүч хэзээ ч", () => {
    expect(canEditMovementDate("manager", false)).toBe(true);
    expect(canEditMovementDate("finance", true)).toBe(false);
  });
});

describe("механизмын бүртгэлийн мөрийг хэн засах вэ", () => {
  it("өнөөдөр өөрөө бичсэн мөрөө дарга засна, устгана", () => {
    expect(canEditMachineLog("factory", true)).toBe(true);
  });

  it("өчигдрийнх нь ашгийн тооцоонд орсон — мөнгөний эздийнх", () => {
    expect(canEditMachineLog("factory", false)).toBe(false);
  });

  it("менежер, санхүүч бүх мөрөнд", () => {
    expect(canEditMachineLog("manager", false)).toBe(true);
    expect(canEditMachineLog("finance", false)).toBe(true);
  });
});

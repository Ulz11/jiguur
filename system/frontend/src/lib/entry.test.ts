import { describe, it, expect } from "vitest";
import {
  ENTRY_KINDS, entryAmountText, entryError, entryKindLabel, entryKindPill,
  entryModeLabel, entryNoteText, entrySign, entrySubText, isMigrationNote,
  receivableAfter, signedAmount,
} from "./entry";

const money = (v: number) => `${Math.round(v).toLocaleString("en-US")}₮`;

/* Бутан-Өнөорд!G23 = 164,492,000₮ «2025 онд бэлэн мөнгө зээлсэн»;
   C28 = 2,800,000₮ «ажилчдын цалинд»; WB3!R24 = 139,648,000₮ Өнө Ордтой
   хийсэн тооцоо. Эдгээр нь харилцагчийн ДАНСАН дээрх түрээс биш бичилтүүд
   (H11) — доорх дүрмүүд нь тэдгээрийг дэлгэц дээр буруу тэмдэгтэй
   уншуулахгүй байх ганц хамгаалалт. */

describe("Дебит / Кредит сонголт", () => {
  it("тэмдгийг СОНГОЛТ зөөнө — тэр хасах тэмдэг бичихгүй", () => {
    expect(entrySign("debit")).toBe(1);
    expect(entrySign("credit")).toBe(-1);
  });

  it("бичсэн дүн үргэлж эерэг — тэмдэг нь сонголтоос гарна", () => {
    expect(signedAmount("debit", 164_492_000)).toBe(164_492_000);
    expect(signedAmount("credit", 500_000)).toBe(-500_000);
    // Санамсаргүй хасах тэмдэг бичсэн ч сонголт л шийднэ
    expect(signedAmount("debit", -164_492_000)).toBe(164_492_000);
    expect(signedAmount("credit", -500_000)).toBe(-500_000);
  });

  /* ӨРГӨТГӨВ (2026-09): «Дебит»/«Кредит» гэсэн нягтлангийн хос үг УНАВ.
     Хоёулаа «Д»-ээр эхэлж, зөвхөн хоёр дахь үгээрээ ялгарах нь нэг агшин
     хараад БУРУУ товч дарах эрсдэл. Тэмдэг нь эхэндээ, ХЭН хийх нь араас нь. */
  it("сонголт бүр авлага ХААШАА хөдлөх ба ХЭН хийхийг хэлнэ", () => {
    expect(entryModeLabel("debit")).toBe("+ Авлага нэмэгдэнэ (тэр төлнө)");
    expect(entryModeLabel("credit")).toBe("− Авлага буурна (бид хасна)");
  });

  it("хоёр сонголт эхний тэмдгээрээ ялгарна (нэг агшин хараад таних)", () => {
    expect(entryModeLabel("debit")[0]).not.toBe(entryModeLabel("credit")[0]);
  });

  it("хоосон/утгагүй оролт 0 болно — NaN дэлгэц рүү гарахгүй", () => {
    expect(signedAmount("debit", NaN)).toBe(0);
    expect(signedAmount("credit", NaN)).toBe(-0);
  });
});

describe("авлагын хөдөлгөөн", () => {
  it("Бутангуудын 164,492,000₮ зээл авлагыг ЯГ тэр дүнгээр өсгөнө", () => {
    expect(receivableAfter(335_333_564, signedAmount("debit", 164_492_000)))
      .toBe(499_825_564);
  });
  it("кредит бичилт авлагыг ЯГ тэр дүнгээр бууруулна", () => {
    expect(receivableAfter(1_000_000, signedAmount("credit", 400_000))).toBe(600_000);
  });
  it("дүн нь тэмдэгтэйгээ уншигдана", () => {
    expect(entryAmountText(164_492_000, money)).toBe("+164,492,000₮");
    expect(entryAmountText(-500_000, money)).toBe("−500,000₮");
  });
});

describe("төрлийн толь", () => {
  it("дөрвүүлээ монгол нэртэй, дараалал нь тогтмол", () => {
    expect(ENTRY_KINDS.map(([k]) => k))
      .toEqual(["advance", "service", "transfer", "adjustment"]);
    expect(ENTRY_KINDS.map(([, l]) => l))
      .toEqual(["Олгосон зээл", "Үйлчилгээ", "Шилжүүлэг", "Залруулга"]);
  });

  it("танихгүй төрөл чимээгүй алга болохгүй — өөрөө гарна", () => {
    // ЧАНГАРУУЛСАН (2026-09): түүхий түлхүүр зурагдахаа болив — серверийн
    // шинэ төрөл нь «adjustment» гэж англиар гарах ёсгүй.
    expect(entryKindLabel("хачин")).toBe("Бусад");
    expect(entryKindPill("хачин")).toBe("pill-grey");
  });

  it("өнгө нь UI-ЗАРЧИМ §4-ийн шатнаас гарна", () => {
    const SCALE = new Set(["pill-violet", "pill-blue", "pill-amber", "pill-grey"]);
    for (const [k] of ENTRY_KINDS) expect(SCALE.has(entryKindPill(k))).toBe(true);
  });
});

describe("маягтын алдаа", () => {
  it("шошго ЗААВАЛ — «164,492,000₮» гэсэн тоо дангаараа юу ч хэлэхгүй", () => {
    expect(entryError("   ", 164_492_000)).toBe("Юуны төлөө вэ — шошгыг заавал бичнэ");
    expect(entryError("2025 онд бэлэн мөнгө зээлсэн", 164_492_000)).toBe("");
  });
  it("0 дүн бичилт биш", () => {
    expect(entryError("зээл", 0)).toBe("Дүн 0-ээс их байх ёстой");
  });
});

/* ЧАНГАРУУЛАВ (2026-09): `ref` нь ЭХ СУРВАЛЖ — Excel-ийн нүдний хаяг
   («2026 тооцоо!R24 · Бутан-Өнөорд»). Түүнийг шошгын доор 12px-ээр бичих
   нь Отгоо эгчийн дэлгэц дээр МАШИНЫ хэл гаргаж, жинхэнэ тэмдэглэл байх
   мөрийг эзэлж байв. Өгөгдөл нь хэвээр, ХАРАГДАХАА л болив. */
describe("мөрийн хоёрдогч мөр", () => {
  it("баримтын № ба ЖИНХЭНЭ тэмдэглэл гарна — эх сурвалж ГАРАХГҮЙ", () => {
    expect(entrySubText({ invoice_no: "A-4-1", ref: "Бутан-Өнөорд!G23", note: "актаар" }))
      .toBe("№A-4-1 · актаар");
  });
  it("шилжүүлэгчийн ӨӨРИЙНХ нь тэмдэг мөр болж гарахгүй", () => {
    expect(entrySubText({ invoice_no: "A-4-1", ref: "2026 тооцоо!R24 · Бутан-Өнөорд",
                          note: "Шилжүүлэлт — хуучин системээс" })).toBe("№A-4-1");
    expect(isMigrationNote("Шилжүүлэлт — хуучин системээс")).toBe(true);
    expect(isMigrationNote("хуучин системээс — WB3!R24")).toBe(true);
    expect(isMigrationNote("Өнө Ордоос ирсэн акт")).toBe(false);
    expect(isMigrationNote("")).toBe(false);
    expect(entryNoteText("Шилжүүлэлт — хуучин системээс")).toBe("");
    expect(entryNoteText("  Өнө Ордоос ирсэн акт  ")).toBe("Өнө Ордоос ирсэн акт");
  });
  it("хоосон хэсэг нь тусгаарлагчаа авч явахгүй", () => {
    expect(entrySubText({ invoice_no: null, ref: "", note: "" })).toBe("");
    expect(entrySubText({ invoice_no: null, ref: "акт №7", note: "" })).toBe("");
    expect(entrySubText({ invoice_no: null, ref: "", note: "актаар" })).toBe("актаар");
  });
});

import { describe, it, expect } from "vitest";
import { contactNote, preferredContact, isReconciler, isSheetRef, contactRolePill,
         telHref, type Contact } from "./contact";

/** Бутангууд-7!E79:H81 — ГУРВАН гарын үсэгтэн, хуудсан дээрх дарааллаараа. */
const BUTAN: Contact[] = [
  { name: "Н.Батцоож", role: "Төслийн менежер", phone: "96590908", active: true },
  { name: "Н.Соль", role: "Нярав", phone: "99966285", active: true },
  { name: "С.Лхагвасүрэн", role: "Захирал", phone: "99113579", active: true },
];

describe("preferredContact — тэр ЗАХИРАЛ руу залгадаггүй", () => {
  it("НЯРАВ нь менежер, захирлаас урьтана — тооцоо нийлдэг хүн тэр", () => {
    expect(preferredContact(BUTAN)?.name).toBe("Н.Соль");
  });

  it("нярав байхгүй бол МЕНЕЖЕР — «Талбайн менежер Ч.Амаржаргал»", () => {
    expect(preferredContact([
      { name: "Б.Дарханбаяр", role: "Захирал", phone: "88111935" },
      { name: "Ч.Амаржаргал", role: "Талбайн менежер", phone: "94066667" },
    ])?.name).toBe("Ч.Амаржаргал");
  });

  it("зөвхөн захиралтай бол ХООСОН — хуудсан дээрх үндсэн хос үлдэнэ", () => {
    expect(preferredContact([
      { name: "С.Лхагвасүрэн", role: "Захирал", phone: "99113579" },
    ])).toBeNull();
    expect(preferredContact([])).toBeNull();
    expect(preferredContact(null)).toBeNull();
  });

  it("УТАСГҮЙ нярав нь залгах жагсаалтад юу ч нэмэхгүй — дараагийнх руу", () => {
    expect(preferredContact([
      { name: "Н.Соль", role: "нярав", phone: "" },
      { name: "Н.Батцоож", role: "Төслийн менежер", phone: "96590908" },
    ])?.name).toBe("Н.Батцоож");
  });

  it("ИДЭВХГҮЙ болсон хүн рүү залгуулахгүй", () => {
    expect(preferredContact([
      { name: "Н.Соль", role: "Нярав", phone: "99966285", active: false },
      { name: "Н.Батцоож", role: "Төслийн менежер", phone: "96590908", active: true },
    ])?.name).toBe("Н.Батцоож");
  });

  it("албан тушаал нь ЖИЖИГ үсгээр ч, дунд нь ч танигдана", () => {
    // Хуудсан дээр `'нярав'`, `'Нярав :'`, `'Ерөнхий нярав'` гэж бүгд таарна
    expect(preferredContact([{ name: "А", role: "ерөнхий НЯРАВ", phone: "9" }])?.name).toBe("А");
    expect(preferredContact([{ name: "Б", role: "Жигүүр Замын менежер", phone: "9" }])?.name).toBe("Б");
  });

  it("нэг албан тушаалтай хоёр хүн бол ЭХНИЙ нь (хуудсан дээрх дараалал)", () => {
    expect(preferredContact([
      { name: "Нэг", role: "Нярав", phone: "1" },
      { name: "Хоёр", role: "Нярав", phone: "2" },
    ])?.name).toBe("Нэг");
  });
});

describe("isReconciler / contactRolePill", () => {
  it("тооцоо нийлдэг хүнийг албан тушаалаар нь таньдаг", () => {
    expect(isReconciler("Нярав")).toBe(true);
    expect(isReconciler("Төслийн менежер")).toBe(true);
    expect(isReconciler("Захирал")).toBe(false);
    expect(isReconciler("")).toBe(false);
    expect(isReconciler(undefined)).toBe(false);
  });

  it("пил нь §4-ийн шатнаас — гол холбоо брэнд, бусад нь саарал", () => {
    expect(contactRolePill("Нярав")).toBe("pill-blue");
    expect(contactRolePill("Захирал")).toBe("pill-grey");
  });
});

describe("telHref — дарахад залгадаг дугаар", () => {
  it("зай, зураасыг хаяна", () => {
    expect(telHref("9911-2233")).toBe("tel:99112233");
    expect(telHref("8811 1935")).toBe("tel:88111935");
  });

  it("улсын код (+) үлдэнэ", () => {
    expect(telHref("+976 99966285")).toBe("tel:+97699966285");
  });
});

/* Тэмдэглэл нь БИЧИГДЭЭД хэзээ ч гардаггүй байв — шилжүүлэг тэнд Excel-ийн
   нүдний хаяг («БЛҮҮМ-2!O39») хадгалсан тул. Машины хаяг нуугдаж, хүний
   бичсэн үг нэрийнхээ доор гарна. */
describe("contactNote — нэрийн доорх мөр", () => {
  it("Excel-ийн нүдний хаяг дэлгэц дээр гарахгүй", () => {
    expect(isSheetRef("БЛҮҮМ-2!O39")).toBe(true);
    expect(contactNote("БЛҮҮМ-2!O39")).toBe("");
    expect(contactNote("Бутангууд-7!E79")).toBe("");
  });

  it("хүний бичсэн тэмдэглэл ҮЛДЭНЭ", () => {
    expect(isSheetRef("тооцоо нийлдэг хүн")).toBe(false);
    expect(contactNote("  тооцоо нийлдэг хүн ")).toBe("тооцоо нийлдэг хүн");
    expect(contactNote("")).toBe("");
    expect(contactNote(undefined)).toBe("");
  });
});

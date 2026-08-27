import { describe, it, expect } from "vitest";
import { formDirty, contractDraftDirty } from "./dirty";

// Модал хаах хамгаалалт нь ЭНЭ хоёр функцээр л шийдэгдэнэ. Худал «цэвэрхэн»
// хариу = бөглөсөн маягт асуулгүй устана; худал «бохир» хариу = юу ч
// бөглөөгүй хүнээс дэмий асууна. Хоёулаа алдаа тул хоёуланг нь барина.

describe("formDirty", () => {
  it("яг ижил утгууд дээр цэвэрхэн (асуухгүй)", () => {
    expect(formDirty({ name: "", amount: "0" }, { name: "", amount: "0" })).toBe(false);
  });

  it("нэг мөрөн талбар өөрчлөгдвөл бохир", () => {
    expect(formDirty({ name: "", note: "" }, { name: "Хаан банк", note: "" })).toBe(true);
  });

  it("тоо ба логик талбарыг мөн адил барина", () => {
    expect(formDirty({ sort: 0, ndsh: false }, { sort: 3, ndsh: false })).toBe(true);
    expect(formDirty({ sort: 0, ndsh: false }, { sort: 0, ndsh: true })).toBe(true);
  });

  it("зөвхөн хоосон зай бичсэн ч бохир — хэрэглэгчийн бичсэнийг чимээгүй устгахгүй", () => {
    expect(formDirty({ note: "" }, { note: " " })).toBe(true);
  });

  it("талбар нэмэгдсэн/хасагдсан бол бохир (хоёр талын түлхүүрийг нийлүүлж хардаг)", () => {
    expect(formDirty({ a: "1" } as any, { a: "1", b: "2" } as any)).toBe(true);
    expect(formDirty({ a: "1", b: "2" } as any, { a: "1" } as any)).toBe(true);
  });

  it("Object.is тул NaN === NaN — тоон талбар хоосорсныг бохир гэж заахгүй", () => {
    expect(formDirty({ qty: NaN }, { qty: NaN })).toBe(false);
  });

  it("массив/объект талбар нь ЗААГААР харьцуулагдана (мөр бүхий маягт өөрийн дүрэмтэй)", () => {
    const rows = [{ qty: 1 }];
    expect(formDirty({ rows } as any, { rows } as any)).toBe(false);
    expect(formDirty({ rows: [{ qty: 1 }] } as any, { rows: [{ qty: 1 }] } as any)).toBe(true);
  });
});

const COND0 = { start_date: "2026-08-27", end_date: "", penalty_percent: "0.5",
                deposit: "", vat_percent: "0", note: "", no: "" };
const NEW0 = { name: "", person: "", phone: "", reg: "" };
const draft = (over: Partial<Parameters<typeof contractDraftDirty>[0]> = {}) =>
  contractDraftDirty({ step: 1, clientId: null, itemCount: 0,
                       cond: COND0, condInitial: COND0, newClient: NEW0, ...over });

describe("contractDraftDirty", () => {
  it("дөнгөж нээсэн 1-р алхам — хамгаалалт унтарсан", () => {
    expect(draft()).toBe(false);
  });

  it("2-р алхам руу орсон бол хамгаална (сонголт нь ард үлдсэн)", () => {
    expect(draft({ step: 2 })).toBe(true);
  });

  it("харилцагч сонгосон бол хамгаална", () => {
    expect(draft({ clientId: 7 })).toBe(true);
  });

  it("материал жагсаасан бол хамгаална", () => {
    expect(draft({ itemCount: 1 })).toBe(true);
  });

  it("шинэ харилцагчийн аль нэг талбар бөглөгдсөн бол хамгаална", () => {
    expect(draft({ newClient: { ...NEW0, phone: "9911" } })).toBe(true);
  });

  it("шинэ харилцагчийн талбар зөвхөн хоосон зайтай бол хамгаалахгүй", () => {
    expect(draft({ newClient: { ...NEW0, name: "   " } })).toBe(false);
  });

  it("нөхцөлийн аль нэг талбар засагдсан бол хамгаална (алданги, барьцаа, тэмдэглэл…)", () => {
    expect(draft({ cond: { ...COND0, deposit: "6,000,000" } })).toBe(true);
    expect(draft({ cond: { ...COND0, penalty_percent: "1" } })).toBe(true);
  });
});

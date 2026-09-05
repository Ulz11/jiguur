import { describe, expect, it } from "vitest";
import { contactOutcome, dayShift, entryOutcome, fieldOutcome, fileOutcome,
         freshMark, issueOutcome, noteOutcome, payOutcome, promiseOutcome,
         receivableShift, returnOutcome, saleOutcome, shipmentOutcome,
         voidEntryOutcome, voidPayOutcome } from "./outcome";

/**
 * ҮР ДҮНГИЙН ЗУРВАСЫН ҮГ — Отгоо эгч дэлгэц дээр ӨНГӨРЧ БУЙ зүйлийг
 * анзаардаггүй. 3.2 секундын toast нь түүний хувьд БАЙХГҮЙ: тэр «Бүртгэх»
 * дараад цаасаа эргүүлж, буцаж харахад дэлгэц юу ч болоогүй мэт зогсож
 * байдаг. Тиймээс мөр нь ХЭДЭН ШИРХЭГ, ХЭЗЭЭ, МӨНГӨ нь ХЭДЭЭС ХЭД болсныг
 * тоогоороо хэлж, ДАРТАЛ үлдэнэ.
 *
 * Энэ файл нь тэр өгүүлбэрийн ЦЭВЭР логик: React-гүй, сүлжээгүй.
 */

describe("dayShift — «өдрийн дүн X → Y» нь ХОЁР тоог хамт хэлнэ", () => {
  it("хоёр тоог сумтайгаа нэрлэнэ", () => {
    expect(dayShift(1_229_460, 1_224_510))
      .toBe("өдрийн дүн 1,229,460₮ → 1,224,510₮");
  });

  it("тоо хөдлөөгүй бол мөр огт гарахгүй — давхардсан тоо асуулт төрүүлнэ", () => {
    expect(dayShift(1_229_460, 1_229_460)).toBe("");
  });

  it("хагас төгрөгийн зөрүү нь зөрүү БИШ (дугуйлбал ижил тоо)", () => {
    expect(dayShift(1_000_000, 1_000_000.4)).toBe("");
  });
});

describe("returnOutcome — «Буцаалт бүртгэгдлээ …»", () => {
  const base = { qty: 15, date: "2026-09-05", dayBefore: 1_229_460,
                 dayAfter: 1_224_510, seesMoney: true, movementId: 42 };

  it("тоо · огноо · өдрийн дүнгийн шилжилт гурвуулаа мөрөнд орно", () => {
    expect(returnOutcome(base).text).toBe(
      "Буцаалт бүртгэгдлээ — 15ш · 2026-09-05 · өдрийн дүн 1,229,460₮ → 1,224,510₮");
  });

  it("шинэ мөрөө нэрлэж өгнө — хуудас түүнийг тодруулж чадна", () => {
    expect(returnOutcome(base).mark).toBe("mv-42");
  });

  it("үйлдвэрийн даргад ₮ ОРОХГҮЙ — түүний дэлгэц ширхэг дээр зогсоно", () => {
    const o = returnOutcome({ ...base, seesMoney: false });
    expect(o.text).toBe("Буцаалт бүртгэгдлээ — 15ш · 2026-09-05");
    expect(o.text).not.toContain("₮");
  });
});

describe("issueOutcome — олголт нь ХҮЛЭЭГДЭЖ байгаагаа өөрөө хэлнэ", () => {
  it("«дарга баталгаажуулсны дараа» гэдэг нь мөрийн САЛШГҮЙ хэсэг", () => {
    const o = issueOutcome({ qty: 40, date: "2026-09-05", dayBefore: 1_229_460,
                             dayAfter: 1_242_660, seesMoney: true, movementId: 7 });
    expect(o.text).toBe(
      "Нэмэлт олголт бүртгэгдлээ — 40ш · 2026-09-05 · дарга «Ачсан ✓» дарсны "
      + "дараа өдрийн дүн 1,229,460₮ → 1,242,660₮ болно");
    expect(o.mark).toBe("mv-7");
  });

  it("даргад ₮ орохгүй ч ХҮЛЭЭЛТ нь хэвээр нэрлэгдэнэ", () => {
    const o = issueOutcome({ qty: 40, date: "2026-09-05", dayBefore: 0, dayAfter: 0,
                             seesMoney: false, movementId: 7 });
    expect(o.text).toContain("дарга «Ачсан ✓» дарсны дараа тооцоонд орно");
    expect(o.text).not.toContain("₮");
  });
});

describe("saleOutcome · payOutcome · shipmentOutcome", () => {
  it("худалдаа нь нэхэмжлэлд хэд нэмэгдснийг хэлнэ", () => {
    expect(saleOutcome({ qty: 30, date: "2026-09-05", total: 2_085_000,
                         seesMoney: true, movementId: 9 }).text)
      .toBe("Худалдаа бүртгэгдлээ — 30ш · 2026-09-05 · нэхэмжлэлд 2,085,000₮ нэмэгдэв");
  });

  it("төлбөр нь ХЭДИЙГ хуваарилснаа хэлнэ — үлдсэн нь кредит", () => {
    const o = payOutcome({ amount: 6_000_000, allocated: 5_500_000,
                           date: "2026-09-05", paymentId: 3 });
    expect(o.text).toBe("Төлбөр бүртгэгдлээ — 6,000,000₮ · 2026-09-05 · "
                        + "5,500,000₮ нэхэмжлэлд хуваарилагдав · 500,000₮ кредит болов");
    expect(o.mark).toBe("pay-3");
  });

  it("бүтнээрээ хуваарилагдсан төлбөрт «кредит» гэсэн мөр гарахгүй", () => {
    expect(payOutcome({ amount: 5_500_000, allocated: 5_500_000,
                        date: "2026-09-05", paymentId: 3 }).text)
      .not.toContain("кредит");
  });

  it("ачилт баталгаажсан нь ТООЦОО ЭХЭЛСЭН гэсэн үг", () => {
    expect(shipmentOutcome({ qty: 25, date: "2026-09-05", movementId: 5 }).text)
      .toBe("Ачилт баталгаажлаа — 25ш · 2026-09-05-наас тооцоонд орлоо");
  });
});

describe("freshMark — тодруулах мөрийн түлхүүр", () => {
  it("төрөл бүр өөрийн угтвартай — хөдөлгөөн, төлбөр, акт хоорондоо мөргөхгүй", () => {
    expect(freshMark("mv", 3)).toBe("mv-3");
    expect(freshMark("pay", 3)).toBe("pay-3");
    expect(freshMark("akt", 3)).toBe("akt-3");
    // ХАРИЛЦАГЧИЙН хуудасны шинэ мөрүүд ч өөрийн угтвартай
    expect(freshMark("entry", 3)).toBe("entry-3");
    expect(freshMark("note", 3)).toBe("note-3");
    expect(freshMark("contact", 3)).toBe("contact-3");
  });

  it("дугааргүй бол тэмдэг ч байхгүй — хий тодруулга хийхгүй", () => {
    expect(freshMark("mv", undefined)).toBeUndefined();
    expect(freshMark("pay", null)).toBeUndefined();
  });
});

/* ХАРИЛЦАГЧИЙН ХУУДАС — гэрээний хуудастай НЭГ хэл. Урьд нь энэ хуудсан
   дээр зурвас ОГТ байгаагүй: `PayModal` нь `payOutcome(...)`-оо дамжуулдаг
   байсныг хуудас нь чимээгүй хаядаг байв. */
describe("харилцагчийн хуудасны өгүүлбэрүүд", () => {
  it("бичилт нь юуны төлөө, хэдээр, авлага хаашаа гэдгээ хэлнэ", () => {
    const o = entryOutcome({ kindLabel: "Олгосон зээл",
                             label: "2025 онд бэлэн мөнгө зээлсэн",
                             signed: 164_492_000,
                             before: 335_333_564, after: 499_825_564, entryId: 7 });
    expect(o.text).toBe("Бичилт хийгдлээ — Олгосон зээл · 2025 онд бэлэн мөнгө "
                        + "зээлсэн · +164,492,000₮ · авлага 335,333,564₮ → 499,825,564₮");
    expect(o.mark).toBe("entry-7");
  });

  it("кредит бичилт хасах тэмдгээрээ гарна", () => {
    expect(entryOutcome({ kindLabel: "Залруулга", label: "хоёр удаа бичсэн",
                          signed: -500_000, before: 1_000_000, after: 500_000 }).text)
      .toContain("−500,000₮");
  });

  it("тоо хөдлөөгүй бол «авлага X → X» гэсэн хий мөр гарахгүй", () => {
    expect(receivableShift(500_000, 500_000)).toBe("");
    expect(receivableShift(500_000, 0)).toBe("авлага 500,000₮ → 0₮");
  });

  it("цуцлалт нь ЮУ сулрахыг тоогоор хэлнэ", () => {
    expect(voidPayOutcome({ amount: 5_000_000, date: "2026-09-05",
                            released: 5_000_000, reason: "дүнг буруу бичсэн" }).text)
      .toBe("Төлбөр хүчингүй болов — 5,000,000₮ · 2026-09-05 · "
            + "5,000,000₮ нэхэмжлэлээс сулрав · дүнг буруу бичсэн");
    expect(voidEntryOutcome({ label: "кран", signed: 10_000_000,
                              before: 20_000_000, after: 10_000_000,
                              reason: "хоёр удаа бичсэн" }).text)
      .toBe("Бичилт хүчингүй болов — кран · 10,000,000₮ · "
            + "авлага 20,000,000₮ → 10,000,000₮ · хоёр удаа бичсэн");
  });

  it("гарын үсэгтний дөрвөн үйлдэл дөрвөн өөр өгүүлбэр", () => {
    const who = { name: "Н.Соль", role: "Нярав", phone: "99966285", contactId: 2 };
    expect(contactOutcome("add", who).text)
      .toBe("Холбоо барих хүн нэмэгдлээ — Н.Соль · Нярав · 99966285");
    expect(contactOutcome("off", who).text).toContain("идэвхгүй болов");
    expect(contactOutcome("on", who).text).toContain("идэвхжлээ");
    expect(contactOutcome("edit", who).mark).toBe("contact-2");
    // Албан тушаал, утасгүй хүн дээр тусгаарлагч дангаараа үлдэхгүй
    expect(contactOutcome("add", { name: "Б.Дорж" }).text)
      .toBe("Холбоо барих хүн нэмэгдлээ — Б.Дорж");
  });

  it("файл, талбарын засвар нь НЭРЭЭРЭЭ", () => {
    expect(fileOutcome("geree-2024.pdf").text)
      .toBe("Файл хавсаргагдлаа — geree-2024.pdf");
    expect(fieldOutcome("Компанийн нэр", "Бутангууд ХХК").text)
      .toBe("Компанийн нэр засагдлаа — Бутангууд ХХК");
    expect(fieldOutcome("Утас", "  ").text).toBe("Утас засагдлаа — хоосон болов");
  });

  it("амлалт нь ХЭЗЭЭ, юу ярьсан, юу амласныг гурвууланг хэлнэ", () => {
    const o = promiseOutcome({ date: "2026-09-05", kindLabel: "Утсаар",
                               note: "Даваа гарагт 5 сая шилжүүлнэ",
                               promiseDate: "2026-09-08", promiseAmount: 5_000_000,
                               noteId: 11 });
    expect(o.text).toBe("Амлалт бичигдлээ — 2026-09-05 · Утсаар · Даваа гарагт "
                        + "5 сая шилжүүлнэ · амлалт 2026-09-08 · 5,000,000₮");
    expect(o.mark).toBe("note-11");
  });

  it("захын тэмдэглэл — огноо, үг, шар туг", () => {
    expect(noteOutcome("add", { date: "2026-09-05", text: "нөат шивсэн",
                                flag: true }).text)
      .toBe("Тэмдэглэл бичигдлээ — 2026-09-05 · нөат шивсэн · анхаарах ⚑");
    expect(noteOutcome("add", { date: "2026-09-05", text: "модонд" }).text)
      .toBe("Тэмдэглэл бичигдлээ — 2026-09-05 · модонд");
    expect(noteOutcome("void", { date: "2026-09-05", text: "модонд",
                                 reason: "буруу гэрээнд бичсэн" }).text)
      .toBe("Тэмдэглэл хүчингүй болов — 2026-09-05 · модонд · буруу гэрээнд бичсэн");
  });

  it("амлалтгүй дуудлага дээр «амлалт» гэсэн хий мөр гарахгүй", () => {
    expect(promiseOutcome({ date: "2026-09-05", kindLabel: "Утсаар",
                            note: "утас авсангүй" }).text)
      .toBe("Амлалт бичигдлээ — 2026-09-05 · Утсаар · утас авсангүй");
  });
});

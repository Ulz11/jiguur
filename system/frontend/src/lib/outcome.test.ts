import { describe, expect, it } from "vitest";
import { dayShift, freshMark, issueOutcome, payOutcome, returnOutcome,
         saleOutcome, shipmentOutcome } from "./outcome";

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
  });

  it("дугааргүй бол тэмдэг ч байхгүй — хий тодруулга хийхгүй", () => {
    expect(freshMark("mv", undefined)).toBeUndefined();
    expect(freshMark("pay", null)).toBeUndefined();
  });
});

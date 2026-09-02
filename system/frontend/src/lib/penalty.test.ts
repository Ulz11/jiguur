import { describe, it, expect } from "vitest";
import { penaltySplit, penaltyChargeRows, penaltyChargeTotal, UNCHARGED,
         chargeLabel, chargedTotal, laterLiveCharge, liveCharges,
         type PenaltyChargeEvent } from "./penalty";

/* Алданги = ХӨШҮҮРЭГ (R25 / H2). Дэлгэц дээр НЭХЭГДСЭН ба НЭХЭГДЭЭГҮЙ нь
   ХЭЗЭЭ Ч нэг тоо болж нийлэхгүй — нийлбэл «машин өр зохиов» гэж уншигдана. */

describe("penaltySplit", () => {
  it("нэхээгүй үед бүхэлдээ НЭХЭГДЭЭГҮЙ", () => {
    expect(penaltySplit(49_500, 0)).toEqual({
      booked: 0, unbooked: 49_500, total: 49_500, showUnbooked: true });
  });

  it("хэсэгчлэн нэхсэн үед хоёр тоо болж задарна", () => {
    // 5 хоног нэхсэн (24,750₮), сүүлийн 5 хоног нэхэгдээгүй
    expect(penaltySplit(49_500, 24_750)).toEqual({
      booked: 24_750, unbooked: 24_750, total: 49_500, showUnbooked: true });
  });

  it("бүрэн нэхсэн үед нэхэгдээгүй мөр огт харагдахгүй", () => {
    const s = penaltySplit(49_500, 49_500);
    expect(s.unbooked).toBe(0);
    expect(s.showUnbooked).toBe(false);
  });

  it("алдангигүй гэрээнд хоёулаа 0", () => {
    expect(penaltySplit(0, 0)).toEqual({
      booked: 0, unbooked: 0, total: 0, showUnbooked: false });
    expect(penaltySplit(undefined, undefined).showUnbooked).toBe(false);
  });

  it("дугуйлалтын зөрүү СӨРӨГ тоо болж гарахгүй", () => {
    // сервер тал тус тусад нь дугуйлдаг тул нэхэгдсэн нь нийлбэрээс 1₮ давж болно
    const s = penaltySplit(49_500, 49_501);
    expect(s.unbooked).toBe(0);
    expect(s.booked).toBe(49_500);
  });

  it("шошго нь нэг л газраас гарна", () => {
    expect(UNCHARGED).toBe("нэхэгдээгүй");
  });
});

/* «Алданги нэхэх» баримт — серверийн `_book_invoices`-ийн толь.
   Модал дээрх огноог Отгоо өөрчилж болдог тул тоо нь дахин бодогдоно. */

const INV = [
  // 990,000₮ өртэй, 4.19-нд хэтэрсэн, хэзээ ч нэхэгдээгүй
  { id: 1, no: "R-24/03-1", outstanding: 990_000, due_date: "2026-04-19",
    penalty_since: "2026-04-19" },
  // 990,000₮ өртэй, 5.19-нд хэтрэх
  { id: 2, no: "R-24/03-2", outstanding: 990_000, due_date: "2026-05-19",
    penalty_since: "2026-05-19" },
];

describe("penaltyChargeRows", () => {
  it("хэтэрсэн нэхэмжлэл бүрд хоног × хувиар бодно", () => {
    const rows = penaltyChargeRows(INV, 0.5, "2026-05-29");
    expect(rows).toEqual([
      { id: 1, no: "R-24/03-1", days: 40, amount: 198_000,
        cycle_start: undefined, cycle_end: undefined },
      { id: 2, no: "R-24/03-2", days: 10, amount: 49_500,
        cycle_start: undefined, cycle_end: undefined },
    ]);
    expect(penaltyChargeTotal(rows)).toBe(247_500);
  });

  it("хугацаа хэтрээгүй нэхэмжлэлийг алгасна", () => {
    const rows = penaltyChargeRows(INV, 0.5, "2026-04-29");
    expect(rows.map((r) => r.id)).toEqual([1]);
    expect(rows[0]).toMatchObject({ days: 10, amount: 49_500 });
  });

  it("аль хэдийн нэхсэн хоногийг ДАХИН тоолохгүй (монотон)", () => {
    const booked = [{ ...INV[0], penalty_since: "2026-04-29" }];
    const rows = penaltyChargeRows(booked, 0.5, "2026-05-09");
    expect(rows[0]).toMatchObject({ days: 10, amount: 49_500 });
    // тэр өдрөөрөө дахин нэхэхэд нэхэх зүйл алга
    expect(penaltyChargeRows(booked, 0.5, "2026-04-29")).toEqual([]);
    // хойшоо ч явахгүй
    expect(penaltyChargeRows(booked, 0.5, "2026-04-25")).toEqual([]);
  });

  it("үндсэн дүн хаагдсан нэхэмжлэлд алданги нэхэгдэхгүй", () => {
    const paid = [{ ...INV[0], outstanding: 0 }];
    expect(penaltyChargeRows(paid, 0.5, "2026-05-29")).toEqual([]);
  });

  it("алдангийн хувь 0 бол нэхэх зүйл огт алга", () => {
    expect(penaltyChargeRows(INV, 0, "2026-05-29")).toEqual([]);
    expect(penaltyChargeTotal([])).toBe(0);
  });

  it("хоосон оролтод унахгүй", () => {
    expect(penaltyChargeRows(undefined, 0.5, "2026-05-29")).toEqual([]);
    expect(penaltyChargeRows(INV, 0.5, "")).toEqual([]);
  });

  it("`penalty_since` байхгүй бол хугацаанаас нь бодно", () => {
    const bare = [{ id: 9, no: "R-9", outstanding: 100_000, due_date: "2026-05-01" }];
    expect(penaltyChargeRows(bare, 1, "2026-05-11")[0])
      .toMatchObject({ days: 10, amount: 10_000 });
  });
});


/* ---------- НЭХЭЛТИЙН ТҮҮХ ба цуцлалт (H1-ийн тэгш хэм) ---------- */

const CH = (id: number, as_of: string, amount: number,
            voided = false): PenaltyChargeEvent =>
  ({ id, as_of, amount, user_name: "Санхүүч", voided,
     void_reason: voided ? "өршөөв" : "" });

describe("нэхэлтийн түүх", () => {
  const rows = [CH(1, "2026-05-04", 24_750), CH(2, "2026-05-09", 24_750),
                CH(3, "2026-05-11", 9_000, true)];

  it("цуцлагдсан нэхэлт нийлбэрт ОРОХГҮЙ, харин мөрөндөө үлдэнэ", () => {
    expect(chargedTotal(rows)).toBe(49_500);
    expect(liveCharges(rows).map((r) => r.id)).toEqual([1, 2]);
    expect(rows.length).toBe(3);
  });

  it("хоосон оролтод унахгүй", () => {
    expect(chargedTotal(undefined)).toBe(0);
    expect(liveCharges(null)).toEqual([]);
  });

  it("мөр өөрийгөө дуудагдах нэрээр нэрлэнэ", () => {
    expect(chargeLabel(rows[0])).toBe("2026-05-04 өдрөөр нэхсэн алданги");
  });

  it("ХОЖУУ амьд нэхэлт байвал хил нь тэндээ үлдэнэ гэж сануулна", () => {
    // 05-04-ийг цуцлахад 05-09 нь амьд — хил нь хэвээр, дүн буурахгүй байж болно
    expect(laterLiveCharge(rows, rows[0])?.id).toBe(2);
    // сүүлчийнхийг нь цуцлахад ард нь амьд мөр АЛГА (05-11 нь цуцлагдсан)
    expect(laterLiveCharge(rows, rows[1])).toBeUndefined();
    // өөрийгөө хэзээ ч заахгүй
    expect(laterLiveCharge([rows[0]], rows[0])).toBeUndefined();
  });

  it("хамгийн ХОЖУУ амьд мөрийг заана (олон байвал)", () => {
    const many = [CH(1, "2026-05-04", 100), CH(2, "2026-05-09", 100),
                  CH(3, "2026-05-20", 100)];
    expect(laterLiveCharge(many, many[0])?.as_of).toBe("2026-05-20");
  });
});

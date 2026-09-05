import { describe, it, expect } from "vitest";
import { Poller, dialogOpen } from "./live";

// Тайлангууд өөрсдөө шинэчлэгдэнэ (X3). Poller нь ХЭЗЭЭ дахин татахыг шийддэг
// цэвэр логик: интервал бүрэн өнгөрсөн үед, эсвэл цонх руу буцаж ирэхэд —
// гэхдээ 5 сек дотор дахин татахгүй (лаптоп сэрэхэд шуурга болохоос сэргийлнэ).

describe("Poller", () => {
  it("интервал өнгөрсөн, цонх нээлттэй үед татна", () => {
    const p = new Poller(60_000);
    p.markFetched(1_000);
    expect(p.shouldFetch("interval", 61_000, false)).toBe(true);
  });

  it("сүүлийн татлагаас хойш 5 сек болоогүй бол focus-ыг үл тоомсорлоно", () => {
    const p = new Poller(60_000);
    p.markFetched(10_000);
    expect(p.shouldFetch("focus", 12_000, false)).toBe(false); // 2 сек — эрт
    expect(p.shouldFetch("focus", 15_000, false)).toBe(true); // 5 сек — болно
  });

  it("нуугдсан таб дээр интервал татахгүй", () => {
    const p = new Poller(60_000);
    p.markFetched(1_000);
    expect(p.shouldFetch("interval", 61_000, true)).toBe(false);
  });

  it("focus нь цонх харагдаж байгааг өөрөө хэлж байгаа тул hidden-д саатахгүй", () => {
    const p = new Poller(60_000);
    p.markFetched(1_000);
    expect(p.shouldFetch("focus", 61_000, true)).toBe(true);
  });

  it("markFetched-ийн дараа интервал дуустал татахгүй", () => {
    const p = new Poller(60_000);
    p.markFetched(100_000);
    expect(p.shouldFetch("interval", 100_100, false)).toBe(false); // тэр дороо
    expect(p.shouldFetch("interval", 130_000, false)).toBe(false); // хагас интервал
    expect(p.shouldFetch("interval", 160_000, false)).toBe(true); // бүтэн интервал
  });

  it("анхны татлага хийгдээгүй бол интервал шууд татна", () => {
    const p = new Poller(60_000);
    expect(p.shouldFetch("interval", 0, false)).toBe(true);
  });

  it("минимум завсрыг тохируулж болно", () => {
    const p = new Poller(60_000, 1_000);
    p.markFetched(10_000);
    expect(p.shouldFetch("focus", 10_500, false)).toBe(false);
    expect(p.shouldFetch("focus", 11_000, false)).toBe(true);
  });
});

/* ЦОНХ НЭЭЛТТЭЙ БАЙХАД чимээгүй шинэчлэлт ХИЙХГҮЙ. Хуудас өөрийн
   цонхнуудаа мэддэг ч ХҮҮХЭД бүрэлдэхүүнийхийг (холбоо барих хүн нэмэх,
   тэмдэглэл) мэдэхгүй — `role="dialog"` нь бүгдийн нийтлэг тэмдэг. */
describe("dialogOpen", () => {
  it("DOM байхгүй орчинд УНАХГҮЙ, зүгээр л худал", () => {
    expect(dialogOpen()).toBe(false);
  });
});

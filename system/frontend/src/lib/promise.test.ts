import { describe, it, expect } from "vitest";
import { PROMISE_KINDS, promiseHead, promiseKindLabel, promiseLine,
         promiseState, type CollectionNote } from "./promise";

const money = (v: number) => `${Math.round(v).toLocaleString("en-US")}₮`;
const TODAY = "2026-09-05";

const note = (o: Partial<CollectionNote> = {}): CollectionNote => ({
  id: 1, date: "2026-09-01", kind: "call", note: "залгав", ...o });

describe("хэлбэрийн толь", () => {
  it("дөрвүүлээ монгол нэртэй, дараалал нь «Авлага цуглуулах»-тай ижил", () => {
    expect(PROMISE_KINDS.map(([k]) => k))
      .toEqual(["call", "visit", "message", "other"]);
    expect(promiseKindLabel("call")).toBe("Утсаар");
  });

  it("танихгүй хэлбэр түүхий түлхүүрээ зурахгүй", () => {
    expect(promiseKindLabel("email")).toBe("Бусад");
    expect(promiseKindLabel(null)).toBe("Бусад");
  });
});

describe("promiseState — мөрийн төлөв", () => {
  it("амлалтгүй дуудлага дээр шошго ОГТ гарахгүй", () => {
    expect(promiseState(note(), TODAY)).toBeNull();
  });

  it("ирээдүйн амлалт — «Амласан»", () => {
    expect(promiseState(note({ promise_date: "2026-09-08", promise_amount: 5e6 }), TODAY))
      .toEqual({ cls: "pill-amber", label: "Амласан" });
  });

  it("огноо нь өнгөрсөн, нээлттэй хэвээр — «Хугацаа хэтэрсэн»", () => {
    expect(promiseState(note({ promise_date: "2026-09-01", promise_amount: 5e6,
                               status: "open" }), TODAY))
      .toEqual({ cls: "pill-red", label: "Хугацаа хэтэрсэн" });
  });

  it("сервер шийдсэн төлөв огнооноос ДЭЭГҮҮР", () => {
    expect(promiseState(note({ promise_date: "2026-09-01", promise_amount: 5e6,
                               status: "kept" }), TODAY)!.label).toBe("Биелсэн");
    expect(promiseState(note({ promise_date: "2026-09-01", promise_amount: 5e6,
                               status: "broken" }), TODAY)!.label).toBe("Зөрчсөн");
  });

  it("огноогүй ч дүнтэй амлалт мөр гаргана", () => {
    expect(promiseState(note({ promise_amount: 5e6 }), TODAY)!.label).toBe("Амласан");
  });
});

describe("promiseLine — амлалтын мөр", () => {
  it("огноо ба дүн хамт", () => {
    expect(promiseLine(note({ promise_date: "2026-09-08", promise_amount: 5e6 }), money))
      .toBe("2026-09-08-нд 5,000,000₮");
  });
  it("дан огноо, дан дүн", () => {
    expect(promiseLine(note({ promise_date: "2026-09-08" }), money)).toBe("2026-09-08-нд");
    expect(promiseLine(note({ promise_amount: 5e6 }), money)).toBe("5,000,000₮");
  });
  it("амлалтгүй бол ХООСОН", () => {
    expect(promiseLine(note(), money)).toBe("");
  });
});

describe("promiseHead — мөрийн толгой", () => {
  it("огноо · хэлбэр · зохиогч", () => {
    expect(promiseHead(note({ user_name: "Ч.Отгонцэцэг" })))
      .toBe("2026-09-01 · Утсаар · Ч.Отгонцэцэг");
  });
  it("зохиогчгүй мөр дээр тусгаарлагч дангаараа үлдэхгүй", () => {
    expect(promiseHead(note({ user_name: "" }))).toBe("2026-09-01 · Утсаар");
  });
});

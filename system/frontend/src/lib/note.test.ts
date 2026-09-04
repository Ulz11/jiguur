import { describe, it, expect } from "vitest";
import { orderNotes, noteSummary, type Note } from "./note";

const n = (p: Partial<Note> & { id: number; date: string }): Note => ({
  text: "мөр", flag: false, author: "Ч.Отгонцэцэг", ...p,
});

describe("orderNotes — сүүлийн шийдвэр ДЭЭРЭЭ", () => {
  it("огноогоор буурахаар эрэмбэлнэ", () => {
    const rows = orderNotes([
      n({ id: 1, date: "2026-07-01", text: "7.06нд тооцов" }),
      n({ id: 2, date: "2026-08-15", text: "нөат шивсэн" }),
      n({ id: 3, date: "2026-06-02", text: "хаав" }),
    ]);
    expect(rows.map((r) => r.text)).toEqual(["нөат шивсэн", "7.06нд тооцов", "хаав"]);
  });

  it("нэг өдөр хоёр тэмдэглэл — СҮҮЛД бичигдсэн нь дээрээ", () => {
    const rows = orderNotes([
      n({ id: 7, date: "2026-07-06", text: "эхний" }),
      n({ id: 9, date: "2026-07-06", text: "хоёр дахь" }),
    ]);
    expect(rows.map((r) => r.text)).toEqual(["хоёр дахь", "эхний"]);
  });

  it("өгөгдсөн массивыг ХӨНДӨХГҮЙ (шинэ хуулбар буцаана)", () => {
    const src = [n({ id: 1, date: "2026-01-01" }), n({ id: 2, date: "2026-02-01" })];
    const out = orderNotes(src);
    expect(src.map((r) => r.id)).toEqual([1, 2]);
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });

  it("хоосон ба байхгүй нь хоосон массив", () => {
    expect(orderNotes([])).toEqual([]);
    expect(orderNotes(null)).toEqual([]);
    expect(orderNotes(undefined)).toEqual([]);
  });
});

describe("noteSummary — хумигдсан толгойн хоёр тоо", () => {
  it("бүх мөрийг тоолж, тугтайг нь тусад нь хэлнэ", () => {
    expect(noteSummary([
      n({ id: 1, date: "2026-07-01" }),
      n({ id: 2, date: "2026-07-02", flag: true }),
      n({ id: 3, date: "2026-07-03", flag: true }),
    ])).toEqual({ count: 3, flagged: 2 });
  });

  it("ХҮЧИНГҮЙ болсон туг нь «анхаарах» БИШ — мөр нь хэвээр тоологдоно", () => {
    expect(noteSummary([
      n({ id: 1, date: "2026-07-01", flag: true }),
      n({ id: 2, date: "2026-07-02", flag: true, voided: true }),
    ])).toEqual({ count: 2, flagged: 1 });
  });

  it("хоосон бол тэг", () => {
    expect(noteSummary([])).toEqual({ count: 0, flagged: 0 });
    expect(noteSummary(null)).toEqual({ count: 0, flagged: 0 });
  });
});

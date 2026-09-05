import { describe, it, expect } from "vitest";
import { NOTE_CAP, capRows, noteSummary, orderNotes, rankNotes, showAllLabel,
         type Note } from "./note";

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

describe("rankNotes — анхаарах ⚑ нь ТАВАН мөрөнд ЗААВАЛ багтана", () => {
  it("тугтай мөр дээрээ, дараа нь огноогоор", () => {
    const rows = rankNotes([
      n({ id: 1, date: "2026-08-20", text: "шинэ" }),
      n({ id: 2, date: "2026-06-01", text: "хуучин ТУГТАЙ", flag: true }),
      n({ id: 3, date: "2026-08-01", text: "дунд" }),
    ]);
    expect(rows.map((r) => r.text)).toEqual(["хуучин ТУГТАЙ", "шинэ", "дунд"]);
  });

  it("ХҮЧИНГҮЙ болсон туг нь дээшээ гарахгүй (цуцлалт тугийг унтраана)", () => {
    const rows = rankNotes([
      n({ id: 1, date: "2026-08-20", text: "шинэ" }),
      n({ id: 2, date: "2026-06-01", text: "цуцлагдсан", flag: true, voided: true }),
    ]);
    expect(rows.map((r) => r.text)).toEqual(["шинэ", "цуцлагдсан"]);
  });

  it("тугтай хэд хэдэн мөр дотроо огнооны дараалалтай (тогтвортой эрэмбэ)", () => {
    const rows = rankNotes([
      n({ id: 1, date: "2026-06-01", text: "туг хуучин", flag: true }),
      n({ id: 2, date: "2026-08-01", text: "туг шинэ", flag: true }),
      n({ id: 3, date: "2026-09-01", text: "туггүй хамгийн шинэ" }),
    ]);
    expect(rows.map((r) => r.text))
      .toEqual(["туг шинэ", "туг хуучин", "туггүй хамгийн шинэ"]);
  });
});

describe("capRows — 48 тэмдэглэл гэрээний хуудсыг залгихаа болино", () => {
  const many = Array.from({ length: 12 },
    (_, i) => n({ id: i + 1, date: `2026-07-${String(i + 1).padStart(2, "0")}` }));

  it("хумигдсан үед ЗӨВХӨН хязгаарын тоо гарна", () => {
    const v = capRows(many, NOTE_CAP, false);
    expect(v.shown).toHaveLength(5);
    expect(v.total).toBe(12);
    expect(v.hidden).toBe(7);
  });

  it("задарсан үед БҮГД гарна — мөр алга болохгүй", () => {
    const v = capRows(many, NOTE_CAP, true);
    expect(v.shown).toHaveLength(12);
    expect(v.hidden).toBe(0);
  });

  it("хязгаараас цөөн бол товч гарах шаардлагагүй", () => {
    const v = capRows(many.slice(0, 3), NOTE_CAP, false);
    expect(v.shown).toHaveLength(3);
    expect(v.hidden).toBe(0);
  });

  it("хоосон ба байхгүй нь унахгүй", () => {
    expect(capRows([], NOTE_CAP, false)).toEqual({ shown: [], total: 0, hidden: 0 });
    expect(capRows(null, NOTE_CAP, false)).toEqual({ shown: [], total: 0, hidden: 0 });
  });

  it("товчны тоо нь ХЭДИЙГ нээхийг хэлнэ", () => {
    expect(showAllLabel(12)).toBe("Бүгдийг харах (12)");
  });
});

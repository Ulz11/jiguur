import { describe, it, expect } from "vitest";
import { materialSections } from "./lots";

/* Отгоо материалын мөр дээр дарахад доор нь ТЭР материалын түүх задарна:
   юу гарсан, юу буцсан, аль паданнаас, тэгээд ХЭД үлдсэн. Үлдэгдлийн багана
   нь мөр бүрийн дараах гадаа байгаа тоо — сүүлийн мөрийнх нь толгойн тоотой
   ЯГ таарах ёстой, эс бөгөөс хүснэгт өөртэйгөө маргана. */

const issue = (id: number, date: string, qty: number, rate: number, extra: any = {}) => ({
  id, movement_id: id * 10, type: "ISSUE", date, status: "done", counted: true,
  qty, delta: qty, rate, sources: null, ...extra,
});
const ret = (id: number, date: string, qty: number, sources: any[]) => ({
  id, movement_id: id * 10, type: "RETURN", date, status: "done", counted: true,
  qty, delta: -qty, rate: null, sources,
});

describe("materialSections", () => {
  it("нэг материалын тарифаараа салсан мөрүүдийг НЭГ хэсэг болгож нэгтгэнэ", () => {
    const items = [
      { material_id: 1, grade_id: 3, material: "Хэв хашмал 6012", grade: "В", qty: 1000, daily_rate: 300 },
      { material_id: 1, grade_id: 3, material: "Хэв хашмал 6012", grade: "В", qty: 200, daily_rate: 330 },
      { material_id: 19, grade_id: 2, material: "Труба 3м", grade: "А", qty: 250, daily_rate: 200 },
    ];
    const groups = [
      { material_id: 1, grade_id: 3, material: "Хэв хашмал 6012", grade: "В", held: 1200,
        lines: [issue(8, "2026-03-17", 1000, 300), issue(22, "2026-08-25", 200, 330)] },
      { material_id: 19, grade_id: 2, material: "Труба 3м", grade: "А", held: 250,
        lines: [issue(9, "2026-03-17", 250, 200)] },
    ];

    const secs = materialSections(items as any, groups as any);

    expect(secs.map((s) => s.key)).toEqual(["1:3", "19:2"]);
    expect(secs[0].rows).toHaveLength(2);          // 300₮ ба 330₮ хоёр падан
    expect(secs[0].qty).toBe(1200);
    expect(secs[0].material).toBe("Хэв хашмал 6012");
    expect(secs[1].rows).toHaveLength(1);
  });

  it("мөр бүрийн дараах үлдэгдлийг гүйлгэж бодно — сүүлийнх нь гадаа байгаа тоо", () => {
    const items = [{ material_id: 1, grade_id: 2, material: "Хэв", grade: "А", qty: 1425 }];
    const groups = [{
      material_id: 1, grade_id: 2, material: "Хэв", grade: "А", held: 1425,
      lines: [
        issue(1, "2026-03-22", 2131, 330),
        ret(2, "2026-03-23", 306, [{ issue_line_id: 1, qty: 306, rate: 330, pinned: false }]),
        ret(3, "2026-06-20", 400, [{ issue_line_id: 1, qty: 400, rate: 330, pinned: false }]),
      ],
    }];

    const secs = materialSections(items as any, groups as any);

    expect(secs[0].lines.map((l) => l.balance)).toEqual([2131, 1825, 1425]);
    expect(secs[0].lines[secs[0].lines.length - 1].balance).toBe(secs[0].qty);
  });

  it("хүлээгдэж буй ачилт харагдана ч үлдэгдлийг ХӨДӨЛГӨХГҮЙ", () => {
    const items = [{ material_id: 1, grade_id: 2, material: "Хэв", grade: "А", qty: 700 }];
    const groups = [{
      material_id: 1, grade_id: 2, material: "Хэв", grade: "А", held: 700,
      lines: [
        issue(1, "2026-03-22", 1000, 330),
        ret(2, "2026-04-01", 300, [{ issue_line_id: 1, qty: 300, rate: 330, pinned: false }]),
        issue(3, "2026-08-28", 200, 330, { status: "pending", counted: false }),
      ],
    }];

    const secs = materialSections(items as any, groups as any);

    expect(secs[0].lines.map((l) => l.balance)).toEqual([1000, 700, 700]);
    expect(secs[0].pending).toBe(1);
    // Отгоод «хэдэн мөр» биш «хэдэн ширхэг ирж байна» гэдэг нь хэрэгтэй
    expect(secs[0].pendingQty).toBe(200);
    expect(secs[0].lines[secs[0].lines.length - 1].balance).toBe(700);
  });

  it("огт олгогдоогүй гэрээний мөр хоосон түүхтэй хэсэг болно", () => {
    const items = [{ material_id: 5, grade_id: 1, material: "Тулаас В2", grade: "шинэ", qty: 0 }];

    const secs = materialSections(items as any, []);

    expect(secs).toHaveLength(1);
    expect(secs[0].lines).toEqual([]);
    expect(secs[0].qty).toBe(0);
    expect(secs[0].pending).toBe(0);
    expect(secs[0].pendingQty).toBe(0);
  });

  it("хүснэгтийн мөргүй үлдсэн түүх ч гээгдэхгүй — арын мөрөнд гарна", () => {
    const groups = [{
      material_id: 7, grade_id: 4, material: "Труба 6м", grade: "С", held: 0,
      lines: [issue(1, "2026-01-05", 60, 220),
              ret(2, "2026-02-05", 60, [{ issue_line_id: 1, qty: 60, rate: 220, pinned: false }])],
    }];

    const secs = materialSections([], groups as any);

    expect(secs).toHaveLength(1);
    expect(secs[0].rows).toEqual([]);
    expect(secs[0].qty).toBe(0);
    expect(secs[0].lines.map((l) => l.balance)).toEqual([60, 0]);
  });
});

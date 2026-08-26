import { describe, it, expect } from "vitest";
import {
  monthsWithEvents,
  latestMonth,
  latestDayInMonth,
  buildMonthGrid,
  eventsOn,
  addMonth,
  type TLEvent,
} from "./calendar";

// Хуанлийн цэвэр логик (React-гүй). Долоо хоног ДАВАА гарагаас эхэлнэ:
// Да Мя Лх Пү Ба Бя Ня. Огноог "YYYY-MM-DD" тэмдэгт мөрөөс цагийн бүсийн
// хазайлтгүйгээр (UTC биш) уншина.

const ev = (date: string, kind = "payment"): TLEvent => ({ date, kind, title: "t", sub: "s" });

describe("monthsWithEvents / latestMonth", () => {
  it("давхардлыг арилгаж, өсөхөөр эрэмбэлнэ", () => {
    const events = [ev("2026-04-16"), ev("2026-04-02"), ev("2026-01-30"), ev("2025-12-05")];
    expect(monthsWithEvents(events)).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 4 },
    ]);
  });

  it("latestMonth хамгийн сүүлийн сарыг сонгоно", () => {
    const events = [ev("2026-04-16"), ev("2026-01-30"), ev("2025-12-05")];
    expect(latestMonth(events)).toEqual({ year: 2026, month: 4 });
  });

  it("хоосон оролт дээр latestMonth null буцаана", () => {
    expect(latestMonth([])).toBeNull();
    expect(monthsWithEvents([])).toEqual([]);
  });
});

describe("buildMonthGrid — Даваа-аас эхлэх байрлал", () => {
  it("2026-04-16 (Пүрэв) 3-р долоо хоног, 4 дэх багана (Пү) дээр буудаг", () => {
    const grid = buildMonthGrid([ev("2026-04-16")], 2026, 4);
    // 7 хоногийн мөр бүр яг 7 нүд
    grid.weeks.forEach((w) => expect(w.length).toBe(7));
    let found: { wi: number; ci: number } | null = null;
    grid.weeks.forEach((w, wi) =>
      w.forEach((c, ci) => {
        if (c.iso === "2026-04-16") found = { wi, ci };
      })
    );
    expect(found).toEqual({ wi: 2, ci: 3 }); // мөр 2 (0-based), багана 3 = Пүрэв
  });

  it("4-р сарын эхэнд 2 хоосон нүд (1-ний өдөр Лхагва)", () => {
    const grid = buildMonthGrid([], 2026, 4);
    const first = grid.weeks[0];
    expect(first[0].day).toBeNull();
    expect(first[0].inMonth).toBe(false);
    expect(first[1].day).toBeNull();
    expect(first[2].day).toBe(1); // Апрель 1 = Лхагва (индекс 2)
    expect(first[2].inMonth).toBe(true);
    expect(first[2].iso).toBe("2026-04-01");
  });

  it("цагийн бүсийн хазайлтгүй: 2026-03-01 (Ням) 0-р мөр, 6 дахь багана", () => {
    const grid = buildMonthGrid([ev("2026-03-01")], 2026, 3);
    const cell = grid.weeks[0][6];
    expect(cell.day).toBe(1);
    expect(cell.iso).toBe("2026-03-01");
    expect(cell.events.length).toBe(1);
  });

  it("counts төрлөөр нэгтгэнэ", () => {
    const events = [
      ev("2026-04-16", "payment"),
      ev("2026-04-16", "payment"),
      ev("2026-04-16", "return"),
      ev("2026-04-16", "writeoff"),
    ];
    const grid = buildMonthGrid(events, 2026, 4);
    let cell = null as any;
    grid.weeks.forEach((w) => w.forEach((c) => { if (c.iso === "2026-04-16") cell = c; }));
    expect(cell.counts).toEqual({ payment: 2, return: 1, writeoff: 1 });
    expect(cell.events.length).toBe(4);
  });

  it("хоосон оролт → хүчинтэй хоосон grid (бүх нүд эвентгүй)", () => {
    const grid = buildMonthGrid([], 2026, 2);
    expect(grid.year).toBe(2026);
    expect(grid.month).toBe(2);
    expect(grid.weeks.length).toBeGreaterThan(0);
    const all = grid.weeks.flat();
    expect(all.every((c) => c.events.length === 0)).toBe(true);
    // 2026 оны 2-р сар 28 хоног
    expect(all.filter((c) => c.inMonth).length).toBe(28);
  });
});

describe("eventsOn / latestDayInMonth / addMonth", () => {
  it("eventsOn тухайн өдрийн эвентийг шүүнэ", () => {
    const events = [ev("2026-04-16"), ev("2026-04-16"), ev("2026-04-02")];
    expect(eventsOn(events, "2026-04-16").length).toBe(2);
    expect(eventsOn(events, "2026-04-30").length).toBe(0);
  });

  it("latestDayInMonth сарын хамгийн сүүлийн эвенттэй өдрийг өгнө", () => {
    const events = [ev("2026-04-02"), ev("2026-04-16"), ev("2026-03-31")];
    expect(latestDayInMonth(events, 2026, 4)).toBe("2026-04-16");
    expect(latestDayInMonth(events, 2026, 5)).toBeNull();
  });

  it("addMonth он дамжина", () => {
    expect(addMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

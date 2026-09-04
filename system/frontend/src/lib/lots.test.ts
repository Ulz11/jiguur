import { describe, it, expect } from "vitest";
import { materialSections, lotOptions, lotDaysHint, lotDaysMax, overrideEffect,
         daysVarianceText, siteBreakdown, usedSites } from "./lots";

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

/* ---- Падан-сонгогчийн сонголтууд ----
   H5: «буцаалтад падан-сонгогч (сервер талд бэлэн — UI илгээдэггүй)».
   Отгоо «энэ буцаалт ХОЁРДУГААР падангаас» гэж заахын тулд эхлээд ямар падан
   нээлттэй байгааг харах ёстой: дугаар, огноо, ТАРИФ, хэд үлдсэн. */

const grp = (lines: any[]): any => ({
  material_id: 1, grade_id: 2, material: "Хэв 6012", grade: "А", held: 0, lines,
});

describe("lotOptions", () => {
  const lots = grp([
    { id: 11, movement_id: 1, type: "ISSUE", date: "2026-03-20", status: "done",
      counted: true, qty: 100, delta: 100, rate: 330, sources: null },
    { id: 12, movement_id: 2, type: "ISSUE", date: "2026-04-05", status: "done",
      counted: true, qty: 50, delta: 50, rate: 350, sources: null },
    { id: 20, movement_id: 3, type: "RETURN", date: "2026-04-10", status: "done",
      counted: true, qty: 30, delta: -30, rate: null,
      sources: [{ issue_line_id: 11, rate: 330, qty: 30, pinned: false }] },
  ]);

  it("падан бүрийг дугаар · огноо · тариф · үлдэгдлээр нэрлэнэ", () => {
    expect(lotOptions(lots, "2026-04-10", 20)).toEqual([
      ["0", "Авто — эхлээд хуучнаас"],
      ["11", "#11 · 2026-03-20 · 330₮ · 100ш үлдсэн"],
      ["12", "#12 · 2026-04-05 · 350₮ · 50ш үлдсэн"],
    ]);
  });

  it("ӨӨРИЙНХӨӨ хассан тоог падангийн үлдэгдэлд буцааж нэмнэ", () => {
    // 20-р мөрийг ОРУУЛАХГҮЙ тооцвол #11 нь 30ш хасагдсан харагдана
    expect(lotOptions(lots, "2026-04-10")).toEqual([
      ["0", "Авто — эхлээд хуучнаас"],
      ["11", "#11 · 2026-03-20 · 330₮ · 70ш үлдсэн"],
      ["12", "#12 · 2026-04-05 · 350₮ · 50ш үлдсэн"],
    ]);
  });

  it("буцаалтын өдрөөс ХОЙШ гарсан паданг санал болгохгүй (сервер татгалзана)", () => {
    expect(lotOptions(lots, "2026-03-25", 20).map((o) => o[0])).toEqual(["0", "11"]);
  });

  it("баталгаажаагүй / хүчингүй олголт падан биш", () => {
    const pend = grp([{ id: 9, movement_id: 1, type: "ISSUE", date: "2026-01-01",
                        status: "pending", counted: false, qty: 80, delta: 80,
                        rate: 330, sources: null }]);
    expect(lotOptions(pend, "2026-05-01")).toEqual([["0", "Авто — эхлээд хуучнаас"]]);
  });

  it("хоосорсон падан жагсаалтад гарахгүй", () => {
    const eaten = grp([
      { id: 11, movement_id: 1, type: "ISSUE", date: "2026-03-20", status: "done",
        counted: true, qty: 40, delta: 40, rate: 330, sources: null },
      { id: 21, movement_id: 3, type: "RETURN", date: "2026-04-01", status: "done",
        counted: true, qty: 40, delta: -40, rate: null,
        sources: [{ issue_line_id: 11, rate: 330, qty: 40, pinned: false }] },
    ]);
    expect(lotOptions(eaten, "2026-04-05")).toEqual([["0", "Авто — эхлээд хуучнаас"]]);
  });

  it("бүлэггүй дуудлагад унахгүй", () => {
    expect(lotOptions(undefined, "2026-04-10")).toEqual([["0", "Авто — эхлээд хуучнаас"]]);
  });
});

/* ---------- Гар хоног (H5): машины тоог ХАРУУЛЖ байж л дарж болно ---------- */

describe("lotDaysHint", () => {
  const lots = grp([
    issue(11, "2026-03-20", 100, 330),
    issue(12, "2026-04-05", 50, 350),
  ]);

  it("падан ЦИКЛЭЭ ЭХЛЭХЭЭС өмнө гарсан бол циклийн эхлэлээс тоолно", () => {
    // цикл [2026-04-19, 2026-05-19); #11 нь 3.20-нд гарсан → 4.19-өөс тоолно
    expect(lotDaysHint(lots, "2026-05-01", "2026-04-19")).toBe(12);
  });

  it("падан ЦИКЛ ДОТОР гарсан бол падангийн өдрөөс тоолно", () => {
    // цикл [2026-03-20, 2026-04-19); #12 нь 4.05-нд гарсан, заасан
    expect(lotDaysHint(lots, "2026-04-15", "2026-03-20", 12)).toBe(10);
  });

  it("заагаагүй бол ХУУЧИН падангаас (FIFO) тоолно", () => {
    expect(lotDaysHint(lots, "2026-04-15", "2026-03-20")).toBe(26);
  });

  it("падан олдохгүй бол сануулга ч гарахгүй (null)", () => {
    expect(lotDaysHint(grp([]), "2026-04-15", "2026-03-20")).toBeNull();
    expect(lotDaysHint(lots, "2026-03-01", "2026-02-20")).toBeNull();
  });

  it("цикл олдоогүй үед (гэрээний эхлэлээс өмнөх огноо) null", () => {
    expect(lotDaysHint(lots, "2026-04-15", null)).toBeNull();
  });
});

describe("lotDaysMax", () => {
  const lots = grp([
    issue(11, "2026-03-20", 100, 330),
    issue(12, "2026-04-09", 50, 300),
  ]);

  it("цикл эхлэхээс ӨМНӨ гарсан падан — бүтэн циклийн урт", () => {
    expect(lotDaysMax(lots, "2026-04-15", "2026-03-20", "2026-04-19")).toBe(30);
  });

  it("ДУНД циклд гарсан падан — цонх нь ТЭР ПАДАНГИЙНХ (сервертэй ижил)", () => {
    // 4.09-нд гарсан падан 4.19 хүртэл ердөө 10 хоног гадаа байж чадна
    expect(lotDaysMax(lots, "2026-04-15", "2026-03-20", "2026-04-19", 12)).toBe(10);
  });

  it("падан ч, цикл ч байхгүй бол хязгаар алга", () => {
    expect(lotDaysMax(grp([]), "2026-04-15", "2026-03-20", "2026-04-19")).toBeNull();
    expect(lotDaysMax(lots, "2026-04-15", null, "2026-04-19")).toBeNull();
    expect(lotDaysMax(lots, "2026-04-15", "2026-03-20", null)).toBeNull();
  });
});

/* Гар хоног нь МӨНГӨНИЙ шийдвэр — маягт дээр бичиж байхад нь дүн нь
   харагдах ёстой. Хөдөлгүүр яг (гараар − системээр) × тоо × тарифаар л
   хөдөлдөг (pytest: test_override_shifts_accrual_by_exactly_the_day_difference). */
describe("overrideEffect", () => {
  it("хоосон хоног (= авто) — мөнгө хөдлөхгүй", () => {
    expect(overrideEffect([{ qty: 30, rate: 330, days: null, hint: 12 }]))
      .toEqual({ count: 0, delta: 0, manual: null, auto: null });
  });

  it("гараар 13 / системээр 12 → ЯГ (13−12) × 30ш × 330₮ = 9,900₮", () => {
    expect(overrideEffect([{ qty: 30, rate: 330, days: 13, hint: 12 }]))
      .toEqual({ count: 1, delta: 9900, manual: 13, auto: 12 });
  });

  it("богиносгосон хоног нэхэмжлэлийг БУУРУУЛНА (сөрөг)", () => {
    expect(overrideEffect([{ qty: 30, rate: 330, days: 10, hint: 12 }]).delta)
      .toBe(-2 * 30 * 330);
  });

  it("машинтай ТААРСАН тоо — зөрүү 0, гэхдээ мөр нь тоологдоно", () => {
    expect(overrideEffect([{ qty: 30, rate: 330, days: 12, hint: 12 }]))
      .toEqual({ count: 1, delta: 0, manual: 12, auto: 12 });
  });

  it("олон мөрийн зөрүү НИЙЛНЭ — задаргаа нь ганц мөр дээр л гарна", () => {
    const e = overrideEffect([
      { qty: 30, rate: 330, days: 13, hint: 12 },
      { qty: 50, rate: 300, days: 8, hint: 10 },
    ]);
    expect(e.count).toBe(2);
    expect(e.delta).toBe(9900 - 2 * 50 * 300);
    expect(e.manual).toBeNull();
    expect(e.auto).toBeNull();
  });

  it("машины тоо мэдэгдэхгүй бол зөрүү бодогдохгүй — худал тоо гаргахгүй", () => {
    expect(overrideEffect([{ qty: 30, rate: 330, days: 13, hint: null }]))
      .toEqual({ count: 1, delta: 0, manual: 13, auto: null });
  });
});

describe("daysVarianceText", () => {
  it("гараар тохирсон хоногийг зөрүүтэй нь хамт нэрлэнэ", () => {
    expect(daysVarianceText({ days: 11, billed_days: 12, override: true } as any))
      .toBe("12 хоног (гараар — системээр 11)");
  });

  it("гараар тохирсон ч машинтай ТААРСАН бол зөрүү дурдахгүй", () => {
    expect(daysVarianceText({ days: 12, billed_days: 12, override: true } as any))
      .toBe("12 хоног (гараар)");
  });

  it("авто хоногт хаалт хэрэггүй", () => {
    expect(daysVarianceText({ days: 12, billed_days: 12, override: false } as any))
      .toBe("12 хоног");
  });
});

/* ---------- ТАЛБАЙН ЗАДАРГАА (№88, 97) ----------
   Блүүмийн НЭГ хуудас ГУРВАН талбайг барина: `БЛҮҮМ технологи` 2,044 ·
   `БЛҮҮМ архангай` 326 · `Блүүм дарь эх` 1,924 = 4,294ш, гэвч АВЛАГА нь НЭГ.
   Батцоожийн `F5='А Е блок үлдэгдэл'` багана нь дэд-объектынхоо үлдэгдлийг
   өөрөө барьдаг. Задаргаа нь ЦЭВЭР ГАРГАЛТ — дэвтрийн мөрүүдээс. */
describe("siteBreakdown", () => {
  const at = (site: string, delta: number, extra: any = {}) => ({
    id: 1, movement_id: 1, type: delta > 0 ? "ISSUE" : "RETURN", date: "2026-03-21",
    status: "done", counted: true, qty: Math.abs(delta), delta, rate: null,
    sources: null, site, ...extra,
  });

  it("Блүүм: 2,044 технологи + 326 архангай + 1,924 дарь эх = 4,294", () => {
    const parts = siteBreakdown([
      at("Технологи", 2044), at("Архангай", 326), at("Дарь эх", 1924),
    ]);
    expect(parts).toEqual([
      { site: "Технологи", qty: 2044 },
      { site: "Архангай", qty: 326 },
      { site: "Дарь эх", qty: 1924 },
    ]);
    expect(parts.reduce((s, p) => s + p.qty, 0)).toBe(4294);
  });

  it("буцаалт нь ӨӨРИЙН талбайгаасаа хасагдана", () => {
    expect(siteBreakdown([
      at("Технологи", 2044), at("Дарь эх", 1924), at("Технологи", -300),
    ])).toEqual([{ site: "Технологи", qty: 1744 }, { site: "Дарь эх", qty: 1924 }]);
  });

  it("ГАНЦ талбай бол задаргаа ХЭРЭГГҮЙ — толгойн тоо аль хэдийн хэлсэн", () => {
    expect(siteBreakdown([at("Дарь эх", 100), at("Дарь эх", -40)])).toEqual([]);
    expect(siteBreakdown([at("", 100)])).toEqual([]);
    expect(siteBreakdown([])).toEqual([]);
    expect(siteBreakdown(null)).toEqual([]);
  });

  it("талбай БИЧЭЭГҮЙ мөр өөрийн бүлэгтэй — чимээгүй нийлэхгүй", () => {
    // Хуучин хөдөлгөөнүүд талбайгүй: тэднийг нэрлэсэн талбай руу нааж болохгүй
    expect(siteBreakdown([at("Дарь эх", 100), at("", 40)]))
      .toEqual([{ site: "Дарь эх", qty: 100 }, { site: "", qty: 40 }]);
  });

  it("ТООЛОГДООГҮЙ мөр (хүлээгдэж буй, ХҮЧИНГҮЙ) задаргаанд ОРОХГҮЙ", () => {
    // Дүрэм нь үлдэгдлийнхтэй ЯГ ижил: `counted` мөрүүдийн `delta`-гийн нийлбэр
    expect(siteBreakdown([
      at("Технологи", 500),
      at("Архангай", 300, { counted: false, status: "pending" }),
      at("Архангай", 120),
      at("Технологи", -80, { counted: false, voided: true }),
    ])).toEqual([{ site: "Технологи", qty: 500 }, { site: "Архангай", qty: 120 }]);
  });

  it("бүх мөр нь тоологдоогүй бол задаргаа гарахгүй", () => {
    expect(siteBreakdown([
      at("Технологи", 500, { counted: false }),
      at("Архангай", 300, { counted: false }),
    ])).toEqual([]);
  });
});

describe("usedSites — цонхны санал", () => {
  it("давхардлыг хасч, цагаан толгойн дарааллаар", () => {
    expect(usedSites([
      { site: "Дарь эх" }, { site: "Архангай" }, { site: "Дарь эх" }, { site: "" },
    ])).toEqual(["Архангай", "Дарь эх"]);
  });

  it("талбайгүй гэрээнд санал ГАРАХГҮЙ", () => {
    expect(usedSites([{ site: "" }, {}])).toEqual([]);
    expect(usedSites(null)).toEqual([]);
  });

  it("урд/хойд зайг тайрна — «Дарь эх » ба «Дарь эх» нь НЭГ талбай", () => {
    expect(usedSites([{ site: " Дарь эх " }, { site: "Дарь эх" }])).toEqual(["Дарь эх"]);
  });
});

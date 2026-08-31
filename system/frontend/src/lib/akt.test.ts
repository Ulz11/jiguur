import { describe, expect, it } from "vitest";
import { AKT_KINDS, aktAmountText, aktCycle, aktCycleLabel, aktKind,
         aktLabel, aktLandingText, aktSigned } from "./akt";

describe("актын тэмдэг — Нэмэгдэл / Хөнгөлөлт", () => {
  it("хоёр л сонголт байна, нэмэгдэл нь эхэнд", () => {
    expect(AKT_KINDS.map(([k]) => k)).toEqual(["charge", "discount"]);
  });

  it("хөнгөлөлт нь дүнг СӨРӨГ болгоно", () => {
    expect(aktSigned("discount", "1,206,500")).toBe(-1_206_500);
  });

  it("нэмэгдэл нь эерэг — Excel-ээс хуулсан зайтай тоог ч уншина", () => {
    expect(aktSigned("charge", "1 206 500")).toBe(1_206_500);
  });

  it("сонголт нь тэмдгийг ЭЗЭМШИНЭ — хасах бичсэн ч нэмэгдэл нэмэгдэл хэвээр", () => {
    expect(aktSigned("charge", "-500000")).toBe(500_000);
    expect(aktSigned("discount", "-500000")).toBe(-500_000);
  });

  it("хоосон талбар 0 — товч түгжигдэх шалгуур", () => {
    expect(aktSigned("charge", "")).toBe(0);
  });

  it("бичигдсэн дүнгээс сонголт нь БУЦААЖ уншигдана", () => {
    expect(aktKind(-148_500)).toBe("discount");
    expect(aktKind(1_206_500)).toBe("charge");
    expect(aktKind(0)).toBe("charge");
  });
});

describe("актын мөрийн харагдац", () => {
  it("тэмдэг нь дүнгийнхээ өмнө зогсоно", () => {
    expect(aktAmountText(1_206_500)).toBe("+1,206,500₮");
    expect(aktAmountText(-148_500)).toBe("−148,500₮");
  });

  it("шошго нь серверийн бичсэнтэй ЯГ ижил — цаас, дэлгэц хоёр зөрөхгүй", () => {
    expect(aktLabel("Кран дуудлага")).toBe("Акт: Кран дуудлага");
  });
});

describe("акт АЛЬ циклд унах вэ", () => {
  const c30 = { start_date: "2026-07-22", cycle_mode: "days", cycle_days: 30 };

  it("30 хоногийн горим — эхний цикл", () => {
    expect(aktCycle(c30, "2026-07-27")).toEqual({ start: "2026-07-22", end: "2026-08-21" });
  });

  it("30 хоногийн горим — цонхны төгсгөл нь ДАРААГИЙНХ (хагас нээлттэй)", () => {
    expect(aktCycle(c30, "2026-08-21")).toEqual({ start: "2026-08-21", end: "2026-09-20" });
  });

  it("гэрээний эхлэлээс өмнө — цикл алга", () => {
    expect(aktCycle(c30, "2026-07-21")).toBeNull();
  });

  it("календарь сар — зангилаа хумигдаад ЭРГЭЖ очно (1.31 → 2.28 → 3.31)", () => {
    const cm = { start_date: "2026-01-31", cycle_mode: "month", cycle_days: 30 };
    expect(aktCycle(cm, "2026-01-31")).toEqual({ start: "2026-01-31", end: "2026-02-28" });
    expect(aktCycle(cm, "2026-03-15")).toEqual({ start: "2026-02-28", end: "2026-03-31" });
    expect(aktCycle(cm, "2026-03-31")).toEqual({ start: "2026-03-31", end: "2026-04-30" });
  });

  it("огноо бичигдээгүй бол цикл ч алга", () => {
    expect(aktCycle(c30, "")).toBeNull();
  });

  it("циклийн нэр нь нэхэмжлэлийн мөртэй ЯГ ижил хэлбэртэй", () => {
    expect(aktCycleLabel({ start: "2026-07-22", end: "2026-08-21" }))
      .toBe("2026-07-22 – 2026-08-21");
    expect(aktCycleLabel(null)).toBe("—");
  });

  it("амьд мөр нь хаана буухыг үгээр хэлнэ", () => {
    expect(aktLandingText(c30, "2026-07-27"))
      .toBe("Энэ бичилт 2026-07-22 – 2026-08-21 циклд орно");
    expect(aktLandingText(c30, "2026-07-21"))
      .toBe("Огноо гэрээний эхлэлээс өмнө байна — цикл олдохгүй");
    expect(aktLandingText(c30, "")).toBe("");
  });
});

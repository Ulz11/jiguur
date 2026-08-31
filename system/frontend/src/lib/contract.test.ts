import { describe, it, expect } from "vitest";
import { endDateLabel, CYCLE_MODES, cycleModeLabel, cycleModeHint } from "./contract";

// Гэрээний дуусах огноо нь ХООСОН байх нь хэвийн (компани түүнийг тавьдаггүй).
// Тэр хоосон утга дэлгэц дээр «None», «null», хоосон зай болж гарвал Отгоо
// «систем эвдэрсэн юм болов уу» гэж бодно — энэ функц тэр ганц хариултыг өгнө.

describe("endDateLabel", () => {
  it("огноо байвал огноогоо буцаана", () => {
    expect(endDateLabel("2026-08-27")).toBe("2026-08-27");
  });

  it("null/undefined бол «Хугацаагүй»", () => {
    expect(endDateLabel(null)).toBe("Хугацаагүй");
    expect(endDateLabel(undefined)).toBe("Хугацаагүй");
  });

  it("хоосон мөр, хоосон зай ч «Хугацаагүй»", () => {
    expect(endDateLabel("")).toBe("Хугацаагүй");
    expect(endDateLabel("   ")).toBe("Хугацаагүй");
  });

  it("«None»/«null» гэсэн үг ХЭЗЭЭ Ч дэлгэц дээр гарахгүй", () => {
    for (const v of [null, undefined, ""]) {
      const out = endDateLabel(v);
      expect(out).not.toBe("None");
      expect(out).not.toBe("null");
      expect(out.trim()).not.toBe("");
    }
  });
});

// ТООЦООНЫ МӨЧЛӨГ (H3 / R5) — цөөнх гэрээ КАЛЕНДАРЬ САРААР нэхэгддэг.
// Дэлгэц дээр «month» гэсэн англи түлхүүр ХЭЗЭЭ Ч гарч болохгүй; сонголт нь
// юу хийхээ өөрөө нэг мөрөөр хэлдэг байх ёстой (Отгоо тайлбар уншдаггүй,
// тоо уншдаг — тул тайлбар нь НЭГ мөр, шошго нь бүрэн монгол).

describe("cycleModeLabel", () => {
  it("«days» бол «30 хоног», «month» бол «Календарь сар»", () => {
    expect(cycleModeLabel("days")).toBe("30 хоног");
    expect(cycleModeLabel("month")).toBe("Календарь сар");
  });

  it("хоосон / танихгүй утга нь анхны горим руу унана", () => {
    for (const v of [null, undefined, "", "quarter"]) {
      expect(cycleModeLabel(v)).toBe("30 хоног");
    }
  });

  it("түлхүүр үг дэлгэц дээр ХЭЗЭЭ Ч гарахгүй", () => {
    for (const [v] of CYCLE_MODES) {
      expect(cycleModeLabel(v)).not.toMatch(/[A-Za-z]/);
    }
  });

  it("сонголтын жагсаалт нь хоёр горимыг НЭГ эх сурвалжаас өгнө", () => {
    expect(CYCLE_MODES.map(([v]) => v)).toEqual(["days", "month"]);
    expect(CYCLE_MODES.map(([, l]) => l)).toEqual(["30 хоног", "Календарь сар"]);
  });
});

describe("cycleModeHint", () => {
  it("эхлэх огнооны ӨДРИЙГ зангилаа болгож нэрлэнэ", () => {
    expect(cycleModeHint("2026-04-14"))
      .toBe("Сар бүрийн 14-нд шинэ цикл — 31 хоногтой сар 31 хоногоор нэхэгдэнэ");
  });

  it("1-нд эхэлбэл жинхэнэ календарь сар болно", () => {
    expect(cycleModeHint("2026-04-01")).toContain("Сар бүрийн 1-нд");
  });

  it("29–31-нд зангидсан бол хумигдахаа ӨӨРӨӨ хэлнэ", () => {
    for (const d of ["2026-01-29", "2026-01-30", "2026-01-31"]) {
      expect(cycleModeHint(d)).toContain("богино сард сарын сүүлчийн өдөр");
    }
    expect(cycleModeHint("2026-01-28")).not.toContain("богино сард");
  });

  it("огноо байхгүй үед ч ойлгомжтой мөр буцаана (хоосон биш)", () => {
    for (const v of [null, undefined, "", "  "]) {
      const out = cycleModeHint(v);
      expect(out.trim()).not.toBe("");
      expect(out).not.toContain("undefined");
      expect(out).not.toContain("NaN");
    }
  });
});

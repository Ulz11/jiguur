import { describe, it, expect } from "vitest";
import { endDateLabel } from "./contract";

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

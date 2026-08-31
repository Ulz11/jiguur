import { describe, expect, it } from "vitest";
import { rangeError, rangeReady, reportQuery } from "./report";

describe("тайлангийн хугацааны сонголт", () => {
  it("сарын горимд months query явна — огноонууд юу ч байсан", () => {
    expect(reportQuery("months", 6, "", "")).toBe("months=6");
    expect(reportQuery("months", 12, "2026-01-01", "2026-06-30")).toBe("months=12");
  });

  it("огнооны горимд бүрэн муж → d_from/d_to", () => {
    expect(reportQuery("range", 6, "2026-01-01", "2026-06-30"))
      .toBe("d_from=2026-01-01&d_to=2026-06-30");
  });

  it("хагас бөглөсөн эсвэл урвуу муж → хоосон (татахгүй)", () => {
    expect(reportQuery("range", 6, "2026-01-01", "")).toBe("");
    expect(reportQuery("range", 6, "", "2026-06-30")).toBe("");
    expect(reportQuery("range", 6, "2026-07-01", "2026-06-30")).toBe("");
  });

  it("нэг өдрийн муж хүчинтэй — эхлэл = төгсгөл", () => {
    expect(rangeReady("2026-07-01", "2026-07-01")).toBe(true);
  });

  it("алдааны үг ЗӨВХӨН урвуу мужид — бөглөж дуусаагүйг зэмлэхгүй", () => {
    expect(rangeError("", "")).toBe("");
    expect(rangeError("2026-01-01", "")).toBe("");
    expect(rangeError("2026-07-01", "2026-06-30")).not.toBe("");
  });
});

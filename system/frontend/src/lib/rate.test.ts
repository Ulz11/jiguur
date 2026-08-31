import { describe, expect, it } from "vitest";
import { effectiveDate, effectiveOptions, rateChangeScope, rateChangeText,
         restatesHistory, RATE_RESTATE_WARN } from "./rate";

const B = { contract_start: "2026-03-20", current_start: "2026-04-19",
            next_start: "2026-05-19" };

describe("«Хэзээнээс» — гурван сонголт СЕРВЕРИЙН хилээс", () => {
  it("дараагийн цикл нь ЭХЭНД зогсоно — Отгоогийн анхны утга", () => {
    const opts = effectiveOptions(B);
    expect(opts[0].value).toBe("next");
    expect(opts[0].date).toBe("2026-05-19");
  });

  it("гурван сонголт, огноо нь шошгондоо гарна", () => {
    const opts = effectiveOptions(B);
    expect(opts.map((o) => o.value)).toEqual(["next", "current", "history"]);
    expect(opts[0].label).toContain("2026-05-19");
    expect(opts[1].label).toContain("2026-04-19");
    expect(opts[2].label).toContain("2026-03-20");
  });

  it("эхний циклд байгаа гэрээнд «энэ цикл» ба «бүх түүх» нь ИЖИЛ огноо — нэг л мөр", () => {
    const opts = effectiveOptions({ contract_start: "2026-03-20",
                                    current_start: "2026-03-20",
                                    next_start: "2026-04-19" });
    expect(opts.map((o) => o.date)).toEqual(["2026-04-19", "2026-03-20"]);
    expect(opts).toHaveLength(2);
  });

  it("хил ирээгүй бол сонголт огт гарахгүй — таамгаар огноо зохиохгүй", () => {
    expect(effectiveOptions(null)).toEqual([]);
    expect(effectiveOptions({ contract_start: "", current_start: "", next_start: "" }))
      .toEqual([]);
  });

  it("сонголтоос огноо нь БУЦААЖ уншигдана", () => {
    expect(effectiveDate(B, "current")).toBe("2026-04-19");
    expect(effectiveDate(B, "history")).toBe("2026-03-20");
    expect(effectiveDate(null, "next")).toBe("");
  });
});

describe("аль сонголт ТҮҮХИЙГ дахин бичих вэ", () => {
  it("дараагийн цикл нь гарын үсэгтэй өнгөрсөнд ХҮРЭХГҮЙ", () => {
    expect(restatesHistory("next")).toBe(false);
  });

  it("энэ цикл ба бүх түүх нь нэхэмжилсэнд хүрч БОЛЗОШГҮЙ — анхааруулгатай", () => {
    expect(restatesHistory("current")).toBe(true);
    expect(restatesHistory("history")).toBe(true);
    expect(RATE_RESTATE_WARN).toContain("дахин");
  });
});

describe("тарифын өөрчлөлтийн мөр", () => {
  it("«330₮ → 350₮ · 2026-04-19-ээс»", () => {
    expect(rateChangeText({ old_rate: 330, new_rate: 350, effective_from: "2026-04-19" }))
      .toBe("330₮ → 350₮ · 2026-04-19-ээс");
  });

  it("хүрээгүй (бүх падан) өөрчлөлт нь тэгж НЭРЛЭГДЭНЭ", () => {
    expect(rateChangeText({ old_rate: null, new_rate: 450, effective_from: "2026-05-19" }))
      .toBe("бүх тариф → 450₮ · 2026-05-19-ээс");
  });

  it("хүрээ нь падангийн ТӨРӨЛХИЙН тарифаас гарна — харагдаж буй утгаас БИШ", () => {
    expect(rateChangeScope({ orig_rate: 330, daily_rate: 450 })).toBe(330);
    // Төрөлх нь мэдэгдэхгүй бол хүрээ тавихгүй (бүх падан хөдөлнө)
    expect(rateChangeScope({ daily_rate: 450 })).toBeUndefined();
  });
});

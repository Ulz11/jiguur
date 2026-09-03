import { describe, expect, it } from "vitest";
import { applyPrefill, closeSteps, outstandingQty, outstandingSale, outstandingWriteoff,
         returnPrefill, salePrefill, stepBlock, stepIndex, CLOSE_STEP_TITLES,
         dayChoicePayload, dayLineText, defaultDayPicks, pickDelta, pickedAmount,
         pickedDays, type DayConflict, type DayPick } from "./close";

const clean = {
  close_date: "2026-05-03", close_error: null, can_close: true,
  outstanding: [], day_conflicts: [], final_invoices: [{ no: "R-24/03-2", cycle_start: "2026-04-19",
                                      cycle_end: "2026-05-04", label: "…",
                                      rent_amount: 462000, charge_amount: 0,
                                      vat_amount: 0, total: 462000 }],
  unpaid: 990000, balance: 990000, penalty_booked: 0, penalty_unbooked: 12000,
  deposit: { amount: 0, status: "held", settled: false, applied: 0, returned: 0 },
};

const dirty = {
  ...clean, can_close: false,
  outstanding: [
    { material_id: 1, material: "Хэв хашмал 6012", grade_id: 2, grade: "А",
      qty: 40, nb_price: 69500, writeoff_amount: 2_780_000,
      sale_price: 58000, sale_amount: 2_320_000 },
    { material_id: 3, material: "Тулаас В2", grade_id: 2, grade: "А",
      qty: 12, nb_price: 65000, writeoff_amount: 780_000,
      sale_price: 65000, sale_amount: 780_000 },
  ],
  deposit: { amount: 5_000_000, status: "held", settled: false, applied: 0, returned: 0 },
};

describe("хаалтын алхмууд — байгаа зүйл л алхам болно", () => {
  it("гадаа юу ч байхгүй, барьцаагүй бол ХОЁР алхам", () => {
    expect(closeSteps(clean).map((s) => s.key)).toEqual(["final", "confirm"]);
  });

  it("гадаа бараа ба цэвэрлэгдээгүй барьцаа нь өөрсдийн алхамтай", () => {
    expect(closeSteps(dirty).map((s) => s.key))
      .toEqual(["goods", "final", "deposit", "confirm"]);
  });

  it("тооцоо хийгдсэн барьцаа дахин асуухгүй", () => {
    const p = { ...dirty, outstanding: [],
                deposit: { amount: 5_000_000, status: "settled", settled: true,
                           applied: 5_000_000, returned: 0 } };
    expect(closeSteps(p).map((s) => s.key)).toEqual(["final", "confirm"]);
  });

  it("алхам бүр нэртэй — гарчиг нь нэг эх сурвалжаас", () => {
    expect(closeSteps(dirty)[0].title).toBe(CLOSE_STEP_TITLES.goods);
    expect(CLOSE_STEP_TITLES.final).toBe("Эцсийн тооцоо");
  });

  it("алхмын дугаар нь жагсаалтаас гарна (алга болсон алхам зай үлдээхгүй)", () => {
    expect(stepIndex(closeSteps(dirty), "deposit")).toBe(2);
    expect(stepIndex(closeSteps(clean), "deposit")).toBe(-1);
  });
});

describe("алхам ЗӨВШӨӨРӨХГҮЙ шалтгаан", () => {
  it("гадаа бараа байхад цааш явахгүй — ХЭДИЙГ хэлнэ", () => {
    const msg = stepBlock(dirty, "goods");
    expect(msg).toContain("52");             // 40 + 12
    expect(msg).toContain("шийдэгдээгүй");
  });

  it("саад нь ГУРВАН гарцыг нэрлэнэ — тэр мөр алхам дээрээ зурагддаг (H7)", () => {
    /* Энэ мөр урьд нь ЗӨВХӨН товчны `title`-д очдог байв: Отгоо эгч идэвхгүй
       товч дээр хулгана барьдаггүй тул «дараад юу ч болсонгүй» гэж уншина.
       Одоо алхам дээрээ ил зурагдана — тиймээс агуулга нь ГУРВУУЛАН гарцыг
       нэрлэх ёстой: нэрлээгүй гарц бол БАЙХГҮЙ гарц. */
    const msg = stepBlock(dirty, "goods")!;
    expect(msg).toContain("буцаалт");
    expect(msg).toContain("дутагдуулсан");
    expect(msg).toContain("худалдаа болгосон");
  });

  it("бүгд буцсаны дараа саад алга", () => {
    expect(stepBlock(clean, "goods")).toBeNull();
  });

  it("огнооны алдаа нь БАТЛАХ алхмыг түгжинэ", () => {
    const bad = { ...clean, can_close: false,
                  close_error: "Хаах огноо сүүлийн хөдөлгөөнөөс (2026-05-03) өмнө байж болохгүй" };
    expect(stepBlock(bad, "confirm")).toContain("хөдөлгөөн");
  });

  it("гадаа бараа байвал БАТЛАХ ч түгжигдэнэ — хоёр талаас нь", () => {
    expect(stepBlock(dirty, "confirm")).toContain("шийдэгдээгүй");
  });

  it("барьцаа нь АЛГАСАГДАЖ болно — түгжээгүй, зөвхөн анхааруулга", () => {
    expect(stepBlock(dirty, "deposit")).toBeNull();
  });
});

describe("гадаа үлдэгдлийн тоо", () => {
  it("нийт ширхэг", () => {
    expect(outstandingQty(dirty.outstanding)).toBe(52);
    expect(outstandingQty([])).toBe(0);
  });

  it("бүгдийг ДУТАГДУУЛСАН гэж бичвэл хэдэн ₮ болох (R13)", () => {
    expect(outstandingWriteoff(dirty.outstanding)).toBe(3_560_000);
  });
});

describe("буцаалтын цонхны урьдчилсан утга", () => {
  it("«Буцаалт бүртгэх» — тоо нь гадаа үлдсэнээр, актлах 0", () => {
    expect(returnPrefill(dirty.outstanding[0], "return"))
      .toEqual({ key: "1:2", ret: 40, writeoff: 0 });
  });

  it("«Дутагдуулсан» — буцаалт ба актлах ХОЁУЛАА бүтэн тоо", () => {
    expect(returnPrefill(dirty.outstanding[0], "writeoff"))
      .toEqual({ key: "1:2", ret: 40, writeoff: 40 });
  });
});

describe("урьдчилсан утга маягтын мөрүүд рүү тархах", () => {
  /* Нэг материал ХОЁР падангаар (330₮ ба 300₮) гадаа байж болно — маягт дээр
     хоёр мөр болж харагдана. Гадаа үлдэгдэл нь тэдгээрийн НИЙЛБЭР тул
     урьдчилсан тоо нь мөрүүд рүү дараалан ДҮҮРНЭ. */
  const rows = [
    { material_id: 1, grade_id: 2, qty: 30, ret: 0, writeoff: 0 },
    { material_id: 1, grade_id: 2, qty: 25, ret: 0, writeoff: 0 },
    { material_id: 9, grade_id: 2, qty: 10, ret: 0, writeoff: 0 },
  ];

  it("нэг мөрөнд багтвал тэндээ", () => {
    const out = applyPrefill(rows, { key: "9:2", ret: 10, writeoff: 10 });
    expect(out[2]).toMatchObject({ ret: 10, writeoff: 10 });
    expect(out[0].ret).toBe(0);
  });

  it("хоёр падан руу дараалан дүүрнэ — нийлбэр нь ЯГ хүссэн тоо", () => {
    const out = applyPrefill(rows, { key: "1:2", ret: 45, writeoff: 45 });
    expect([out[0].ret, out[1].ret]).toEqual([30, 15]);
    expect([out[0].writeoff, out[1].writeoff]).toEqual([30, 15]);
    expect(out[2].ret).toBe(0);
  });

  it("актлахгүй бол зөвхөн буцаалтын тоо тавигдана", () => {
    const out = applyPrefill(rows, { key: "1:2", ret: 30, writeoff: 0 });
    expect(out[0]).toMatchObject({ ret: 30, writeoff: 0 });
  });

  it("урьдчилсан утга байхгүй бол мөрүүд ХЭВЭЭР", () => {
    expect(applyPrefill(rows, null)).toEqual(rows);
  });
});

describe("ГУРАВ ДАХЬ ГАРЦ — «Худалдаа болгох» (H7)", () => {
  /* §3 H7 нь ГУРВАН гарц нэрлэдэг: буцаалт · дутагдуулсан · ХУДАЛДАА БОЛГОХ.
     Гурав дахь нь баригдаагүй байсан — харилцагч ажлын төгсгөлд хэвийг
     буцааж ачихын оронд өөртөө авч үлдэх нь бодит үйл явдал. */
  it("мөр бүр ХОЁР үнэтэй: дутагдуулбал НБҮнэ, худалдвал худалдах үнэ", () => {
    const r = dirty.outstanding[0];
    expect(r.writeoff_amount).toBe(2_780_000);        // 40 × 69,500
    expect(r.sale_amount).toBe(2_320_000);            // 40 × 58,000
    expect(r.sale_price).toBe(58_000);
  });

  it("бүгдийг ХУДАЛДВАЛ хэдэн ₮ болох", () => {
    expect(outstandingSale(dirty.outstanding)).toBe(2_320_000 + 780_000);
    expect(outstandingSale([])).toBe(0);
  });

  it("худалдааны урьдчилсан утга нь БУЦААЛТ БИШ — өөрийн цонхтой", () => {
    expect(salePrefill(dirty.outstanding[0]))
      .toEqual({ key: "1:2", qty: 40 });
  });

  it("саадын мессеж ГУРВУУЛАНГ нэрлэнэ — гурав дахь гарц нуугдахгүй", () => {
    const msg = stepBlock(dirty, "goods") || "";
    expect(msg).toContain("буцаалт");
    expect(msg).toContain("дутагдуулсан");
    expect(msg).toContain("худалдаа");
  });
});

/* ---------- ГАР ХОНОГИЙН ЗӨРЧИЛ (H5-ийн сүүлчийн миль) ----------
   Хаах агшинд эцсийн цикл тасарч, тохирсон 12 хоног нь 8 хоногийн цонхонд
   багтахаа болино. Урьд нь машин түүнийг ЧИМЭЭГҮЙ хумидаг байв. Одоо гурван
   зам нэрлэгдэж, аль нь ч ТҮҮНИЙ сонголт болно. */
const conflict: DayConflict = {
  line_id: 77, movement_id: 12, date: "2026-05-01",
  material_id: 1, material: "Хэв хашмал 6012", grade_id: 2, grade: "А",
  qty: 40, agreed_days: 12, window_days: 8,
  day_amount: 13_200,                       // 40ш × 330₮
  agreed_amount: 158_400, window_amount: 105_600, diff_amount: 52_800,
};

describe("гар хоногийн зөрчил — ГУРВАН зам, өгөгдмөл нь ТҮҮНИЙХ", () => {
  it("өгөгдмөл сонголт нь ТОХИРСОН тоо — гарын үсэг зурсан нь тэр", () => {
    const picks = defaultDayPicks([conflict]);
    expect(picks[77]).toEqual({ mode: "agreed", text: "" });
    expect(pickedDays(conflict, picks[77])).toBe(12);
    expect(pickedAmount(conflict, picks[77])).toBe(158_400);
  });

  it("сонголтгүй мөр ч ТҮҮНИЙ тоо руугаа унана", () => {
    expect(pickedDays(conflict, undefined)).toBe(12);
    expect(pickedDays(conflict, null)).toBe(12);
  });

  it("цонхны тоог сонговол ЯГ тэр — зөрүү нь −52,800₮", () => {
    const p: DayPick = { mode: "window", text: "" };
    expect(pickedDays(conflict, p)).toBe(8);
    expect(pickedAmount(conflict, p)).toBe(105_600);
    expect(pickDelta(conflict, p)).toBe(-52_800);
    expect(pickDelta(conflict, p)).toBe(-conflict.diff_amount);
  });

  it("ӨӨР тоо — бүрэн эрх чөлөө, 20 гэвэл 20", () => {
    const p: DayPick = { mode: "other", text: "20" };
    expect(pickedDays(conflict, p)).toBe(20);
    expect(pickedAmount(conflict, p)).toBe(264_000);
    expect(pickDelta(conflict, p)).toBe(8 * 13_200);
  });

  it("бичиж эхлээгүй нүд нь ШИЙДВЭР БИШ — тохирсон тоо руугаа унана", () => {
    for (const text of ["", "   ", "abc", "-3"]) {
      expect(pickedDays(conflict, { mode: "other", text })).toBe(12);
    }
  });

  it("бутархай бичвэл бүхэлдээ бөөрөнхийлнө — хоног бол бүхэл тоо", () => {
    expect(pickedDays(conflict, { mode: "other", text: "9.4" })).toBe(9);
    expect(pickedDays(conflict, { mode: "other", text: "9.6" })).toBe(10);
  });

  it("тэг хоног нь ЖИНХЭНЭ сонголт — «тэр өдрүүд нэхэгдэхгүй»", () => {
    expect(pickedDays(conflict, { mode: "other", text: "0" })).toBe(0);
    expect(pickedAmount(conflict, { mode: "other", text: "0" })).toBe(0);
  });

  it("сервер рүү мөр БҮР илэрхий явна — өгөгдмөл нь ч тоологдоно", () => {
    const other: DayConflict = { ...conflict, line_id: 78, agreed_days: 5,
                                 window_days: 3, day_amount: 1000 };
    const picks = { 77: { mode: "window" as const, text: "" } };
    expect(dayChoicePayload([conflict, other], picks))
      .toEqual([{ line_id: 77, days: 8 }, { line_id: 78, days: 5 }]);
  });

  it("зөрчилгүй бол илгээх юу ч алга", () => {
    expect(dayChoicePayload([], {})).toEqual([]);
    expect(dayChoicePayload(null, {})).toEqual([]);
    expect(defaultDayPicks(null)).toEqual({});
  });

  it("арифметик нь ЗАДЛАГДАЖ бичигдэнэ — цаасан дээр дахин гаргаж болно", () => {
    expect(dayLineText(12, 13_200)).toBe("12 хоног × 13,200₮ = 158,400₮");
    expect(dayLineText(8, 13_200)).toBe("8 хоног × 13,200₮ = 105,600₮");
  });

  it("зөрчил нь алхам НЭМЭХГҮЙ, зам ч ХААХГҮЙ — шийдвэр нь «Эцсийн тооцоо» дотор", () => {
    const p = { ...clean, day_conflicts: [conflict] };
    expect(closeSteps(p).map((s) => s.key)).toEqual(["final", "confirm"]);
    expect(stepBlock(p, "final")).toBeNull();
    expect(stepBlock(p, "confirm")).toBeNull();
  });
});

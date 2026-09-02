import { describe, expect, it } from "vitest";
import { applyPrefill, closeSteps, outstandingQty, outstandingSale, outstandingWriteoff,
         returnPrefill, salePrefill, stepBlock, stepIndex, CLOSE_STEP_TITLES } from "./close";

const clean = {
  close_date: "2026-05-03", close_error: null, can_close: true,
  outstanding: [], final_invoices: [{ no: "R-24/03-2", cycle_start: "2026-04-19",
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

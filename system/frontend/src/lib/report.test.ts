import { describe, expect, it } from "vitest";
import { rangeError, rangeReady, reportQuery,
         rangeHint, cashflowTitle, REPORT_FILE, downloadOutcome } from "./report";

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

/* ХАГАС бөглөсөн муж дээр хуудас ЧИМЭЭГҮЙ зогсдог байв: тоо нь өмнөх
   мужийнхаа хэвээр байхад Отгоо тэднийг ШИНЭ мужийн хариу гэж уншина. */
describe("rangeHint", () => {
  it("сараар үзэж байхад юу ч хэлэхгүй", () => {
    expect(rangeHint("months", "", "")).toBe("");
  });

  it("огнооны горимд ХАГАС бөглөсөн үед ЮУ хүлээж байгаагаа хэлнэ", () => {
    expect(rangeHint("range", "2026-07-01", "")).toMatch(/Дуусах огноогоо/);
    expect(rangeHint("range", "", "2026-07-31")).toMatch(/Эхлэх огноогоо/);
    expect(rangeHint("range", "", "")).toMatch(/Эхлэх ба дуусах/);
  });

  it("муж бүрэн болмогц дуугарахаа болино", () => {
    expect(rangeHint("range", "2026-07-01", "2026-07-31")).toBe("");
  });

  it("урвуу муж дээр `rangeError` ярьж байгаа тул давхарлахгүй", () => {
    expect(rangeHint("range", "2026-08-01", "2026-07-01")).toBe("");
    expect(rangeError("2026-08-01", "2026-07-01")).not.toBe("");
  });
});

/* «Мөнгөн урсгал — сүүлийн 6 сар» гэсэн ХАТУУ гарчиг нь ХУДАЛ болдог байв:
   тайланг 7-р сараар шүүхэд график тэр мужаар зурагдана, гарчиг нь хэвээр. */
describe("cashflowTitle", () => {
  it("муж өгсөн үед ЯГ тэр цонхоо хэлнэ", () => {
    expect(cashflowTitle({ range_applied: true, from: "2026-07-01", to: "2026-07-31" }))
      .toBe("Мөнгөн урсгал — 2026-07-01 – 2026-07-31");
  });

  it("хүсэлт тайрагдсан бол СЕРВЕРИЙН тайлбарыг дамжуулна", () => {
    expect(cashflowTitle({ range_applied: false, from: "2026-01-01", to: "2026-06-30",
                           range_note: "Хүсэлтийн муж 24 сараас урт тул сүүлийн 24 сар: 2026-01-01 – 2026-06-30" }))
      .toBe("Мөнгөн урсгал — Хүсэлтийн муж 24 сараас урт тул сүүлийн 24 сар: 2026-01-01 – 2026-06-30");
  });

  it("хуучин payload дээр ч нэрээ алдахгүй", () => {
    expect(cashflowTitle({ months_count: 6 })).toBe("Мөнгөн урсгал — сүүлийн 6 сар");
    expect(cashflowTitle(null)).toBe("Мөнгөн урсгал");
    expect(cashflowTitle({})).toBe("Мөнгөн урсгал");
  });
});

/* Отгоо татсан файлаа «Downloads» дотроос НЭРЭЭР нь хайдаг: «jiguur-tailan.xlsx»
   гэж амлаад «tailan.xlsx» буулгавал тэр файл алга болсонтой адил. */
describe("Excel-ийн нэр", () => {
  it("серверийн ЖИНХЭНЭ нэртэй нэг", () => {
    expect(REPORT_FILE).toBe("tailan.xlsx");
  });
  it("үр дүнгийн зурвас нь файлаа нэрлэнэ", () => {
    expect(downloadOutcome()).toBe("Excel татагдлаа — tailan.xlsx");
  });
});

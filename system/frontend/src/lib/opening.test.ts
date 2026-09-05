import { describe, it, expect } from "vitest";
import {
  OPENING_LABEL, contractCount, contractNoLabel, contractTitle, isOpeningNo,
  isOpeningRow, openingUntil, partnerSince, realContracts,
} from "./opening";

/* «№OB-2» гэсэн юмыг Отгоо эгч хэзээ ч гарын үсэг зурч байгаагүй.
   Арван харилцагчийн ЯГ ТАЛ нь ийм мөртэй — тэдгээр нь дэлгэц дээр
   ГЭРЭЭ БИШ, «хуучин үлдэгдэл» болж гарна. */

describe("isOpeningNo — серверийн `OB-` тэмдэг", () => {
  it("OB-ээр эхэлсэн дугаарыг таньна", () => {
    expect(isOpeningNo("OB-2")).toBe(true);
    expect(isOpeningNo("OB-10")).toBe(true);
  });

  it("жинхэнэ гэрээний дугаар нь хуучин үлдэгдэл БИШ", () => {
    expect(isOpeningNo("24/03")).toBe(false);
    expect(isOpeningNo("25.19·ӨнөОрд-8")).toBe(false);
    // «OB» гэсэн үсэг ДУНДУУР нь таарах нь тэмдэг биш
    expect(isOpeningNo("Р-OB-7")).toBe(false);
  });

  it("хоосон, байхгүй нь худал", () => {
    expect(isOpeningNo("")).toBe(false);
    expect(isOpeningNo(null)).toBe(false);
    expect(isOpeningNo(undefined)).toBe(false);
  });
});

describe("isOpeningRow — дугаараар нь ч, төлөвөөр нь ч", () => {
  it("серверийн `state: opening`", () => {
    expect(isOpeningRow({ state: "opening" })).toBe(true);
  });
  it("зөвхөн дугаар ирсэн ч танина", () => {
    expect(isOpeningRow({ no: "OB-3" })).toBe(true);
  });
  it("жинхэнэ гэрээ", () => {
    expect(isOpeningRow({ no: "24/03", state: "active" })).toBe(false);
    expect(isOpeningRow(null)).toBe(false);
  });
});

describe("нэр — дугаар ХЭЗЭЭ Ч гарахгүй", () => {
  it("жинхэнэ гэрээ дугаараараа", () => {
    expect(contractNoLabel("24/03")).toBe("№24/03");
    expect(contractTitle("24/03")).toBe("Гэрээ №24/03");
  });

  it("хуучин үлдэгдэл нь ҮГЭЭРЭЭ — «№OB-2» гэсэн юм гарахгүй", () => {
    expect(contractNoLabel("OB-2")).toBe(OPENING_LABEL);
    expect(contractTitle("OB-2")).toBe(OPENING_LABEL);
    expect(contractNoLabel("OB-2")).not.toContain("OB");
    expect(contractTitle("OB-2")).not.toContain("№");
  });

  it("«хэзээ хүртэл» нь огноотой үедээ л гарна", () => {
    expect(openingUntil("2026-09-01")).toBe("2026-09-01 хүртэл");
    expect(openingUntil("")).toBe("");
    expect(openingUntil(null)).toBe("");
  });
});

describe("тоолол — нэг гэрээтэй харилцагч 2 гэж харагдахаа болино", () => {
  const rows = [
    { no: "24/03", state: "active", start_date: "2024-04-04" },
    { no: "OB-2", state: "opening", start_date: "2026-09-01" },
  ];

  it("хуучин үлдэгдэл тоонд орохгүй", () => {
    expect(contractCount(rows)).toBe(1);
    expect(realContracts(rows).map((r) => r.no)).toEqual(["24/03"]);
  });

  it("хоосон, байхгүй нь тэг", () => {
    expect(contractCount([])).toBe(0);
    expect(contractCount(null)).toBe(0);
  });
});

describe("partnerSince — «Хамтран ажилласан» нь ХАМГИЙН ХУУЧИН гэрээнээс", () => {
  it("бүртгэсэн огноо биш, гэрээний эхлэл", () => {
    expect(partnerSince([
      { no: "25/07", state: "active", start_date: "2025-09-22" },
      { no: "24/03", state: "active", start_date: "2024-04-04" },
    ])).toBe("2024-04-04");
  });

  it("хуучин үлдэгдлийн ачаалсан огноо тооцоонд ОРОХГҮЙ", () => {
    // OB нь 2026-09-01 — жинхэнэ гэрээнээс хойно ч, өмнө ч байж болно
    expect(partnerSince([
      { no: "OB-2", state: "opening", start_date: "2020-01-01" },
      { no: "24/03", state: "active", start_date: "2024-04-04" },
    ])).toBe("2024-04-04");
  });

  /* СОЛИВ (2026-09): урьд нь гэрээгүй харилцагч дээр БҮРТГЭСЭН огноо руу
     унадаг байсан — дөнгөж нэмсэн харилцагч «Хамтран ажилласан: 2026-09-05-с»
     гэж харагдана. Тэдэнтэй хараахан ямар ч ажил хийгээгүй; хоосон мөр нь
     ХУДАЛ мөрнөөс дээр (дуудагч тал огт зурахгүй). */
  it("гэрээгүй бол ХООСОН — «өнөөдрөөс хамтран ажилласан» гэж бичихгүй", () => {
    expect(partnerSince([])).toBe("");
    expect(partnerSince(null)).toBe("");
    expect(partnerSince([{ no: "OB-9", state: "opening", start_date: "2026-09-01" }]))
      .toBe("");
  });
});

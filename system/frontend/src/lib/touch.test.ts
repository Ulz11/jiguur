import { describe, it, expect } from "vitest";
import { COARSE, isTouchDevice } from "./touch";

/* ХУРУУ бол ХУРУУ — хэн барьж байгаагаас үл хамааран.
 *
 * Дашбоардын том зогсоол (52px) нь `role === "factory"` дээр тогтдог байв:
 * Отгоо эгч iPad-аараа ачилт баталгаажуулахад 36px-ийн товч гарч ирнэ —
 * ЯГ тэр 36px-ийг «даргын хуруунд болохгүй» гэж бид өөрсдөө шийдсэн.
 * Хэмжүүр нь ТӨХӨӨРӨМЖИЙНХ (`pointer: coarse`), рольд хамаагүй. */

const mm = (matches: boolean) => (q: string) => {
  expect(q, "асуулт нь заавал `pointer: coarse` байх ёстой").toBe(COARSE);
  return { matches };
};

describe("isTouchDevice — хуруу юу, хулгана юу", () => {
  it("хуруутай төхөөрөмж дээр ҮНЭН", () => {
    expect(isTouchDevice(mm(true))).toBe(true);
  });

  it("хулганатай ширээний машин дээр ХУДАЛ", () => {
    expect(isTouchDevice(mm(false))).toBe(false);
  });

  it("matchMedia байхгүй орчинд (сервер, хуучин хөтөч) ХУДАЛ — унахгүй", () => {
    expect(isTouchDevice(undefined)).toBe(false);
  });

  it("matchMedia шидвэл ХУДАЛ — хэмжүүр эвдэрсэн нь хуудсыг унагаахгүй", () => {
    expect(isTouchDevice(() => { throw new Error("тасарлаа"); })).toBe(false);
  });
});

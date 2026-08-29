import { describe, it, expect } from "vitest";
import { rateLabel, holdingSections, daysLabel, type Holding } from "./material";

const hold = (over: Partial<Holding>): Holding => ({
  contract_id: 1, contract_no: "24/03", client_id: 1, client: "Алтан Гадас",
  grade_id: 2, grade: "А", qty: 100, pending: 0, rates: [330], since: "2026-03-22", days: 160,
  ...over,
});

describe("rateLabel", () => {
  it("ганц тарифыг тэр чигт нь хэлнэ", () => {
    expect(rateLabel([330])).toBe("330₮");
  });

  it("хоёр өөр тарифтай падан хоёуланг нь хэлнэ", () => {
    // Нэг гэрээ дундуураа үнэ солибол падан бүр өөрийн тарифаа хадгална —
    // «330₮» гэж ганцхан тоо бичвэл нөгөө нь чимээгүй алга болно.
    expect(rateLabel([330, 300])).toBe("300 · 330₮");
  });

  it("давхардсан тарифыг нэг л удаа хэлнэ", () => {
    expect(rateLabel([330, 330, 330])).toBe("330₮");
  });

  it("тарифгүй мөр зураас — хоосон «₮» биш", () => {
    expect(rateLabel([])).toBe("—");
    expect(rateLabel(null)).toBe("—");
    expect(rateLabel(undefined)).toBe("—");
  });

  it("тоог форматлагчаар дамжуулж болно", () => {
    expect(rateLabel([1500, 2000], (n) => n.toLocaleString("en-US"))).toBe("1,500 · 2,000₮");
  });
});

describe("holdingSections", () => {
  it("зэрэглэлээр бүлэглэж, бүлгийн дүнг гаргана", () => {
    const secs = holdingSections([
      hold({ grade_id: 2, grade: "А", qty: 1425 }),
      hold({ grade_id: 2, grade: "А", qty: 1200, contract_no: "26/11" }),
      hold({ grade_id: 3, grade: "В", qty: 1100, contract_no: "26/07" }),
    ]);
    expect(secs.map((s) => s.grade)).toEqual(["А", "В"]);
    expect(secs[0].qty).toBe(2625);
    expect(secs[0].rows).toHaveLength(2);
    expect(secs[1].qty).toBe(1100);
  });

  it("серверийн эрэмбийг хөндөхгүй", () => {
    // Сервер зэрэглэлээ өөрийн `sort`-оор эгнүүлж илгээдэг — фронт дахин
    // эрэмбэлбэл «шинэ, А, В» гэсэн дараалал цагаан толгойд эвдэрнэ.
    const secs = holdingSections([
      hold({ grade_id: 1, grade: "шинэ", qty: 10 }),
      hold({ grade_id: 3, grade: "В", qty: 20 }),
      hold({ grade_id: 2, grade: "А", qty: 30 }),
    ]);
    expect(secs.map((s) => s.grade)).toEqual(["шинэ", "В", "А"]);
  });

  it("хоосон жагсаалт хоосон бүлэг", () => {
    expect(holdingSections([])).toEqual([]);
  });
});

describe("daysLabel", () => {
  it("хоногийг тоогоор хэлнэ", () => {
    expect(daysLabel(160)).toBe("160 хоног");
    expect(daysLabel(1)).toBe("1 хоног");
  });

  it("өнөөдөр гарсан бол «0 хоног» биш", () => {
    expect(daysLabel(0)).toBe("өнөөдөр гарсан");
  });

  it("утгагүй тоо зураас", () => {
    expect(daysLabel(NaN)).toBe("—");
    expect(daysLabel(-3)).toBe("—");
  });
});

import { describe, it, expect } from "vitest";
import { nextSort, ariaSort, sortByNumber, type SortState } from "./sort";

type K = "overdue" | "oldest";
const start: SortState<K> = { key: "overdue", dir: "desc" };

describe("nextSort", () => {
  it("ижил баганыг дахин дарвал эргэнэ", () => {
    const a = nextSort(start, "overdue");
    expect(a).toEqual({ key: "overdue", dir: "asc" });
    expect(nextSort(a, "overdue")).toEqual({ key: "overdue", dir: "desc" });
  });

  it("өөр багана руу шилжихэд ИХ утгаас эхэлнэ", () => {
    // Хамгийн хуучин өрийг харах гэж дарсан хүн 1 хоногийн өрийг эхэнд харах ёсгүй
    expect(nextSort(start, "oldest")).toEqual({ key: "oldest", dir: "desc" });
    expect(nextSort({ key: "overdue", dir: "asc" }, "oldest")).toEqual({ key: "oldest", dir: "desc" });
  });
});

describe("ariaSort", () => {
  it("зөвхөн ИДЭВХТЭЙ баганад чиглэлээ хэлнэ", () => {
    expect(ariaSort(start, "overdue")).toBe("descending");
    expect(ariaSort(start, "oldest")).toBeUndefined();
    expect(ariaSort({ key: "oldest", dir: "asc" }, "oldest")).toBe("ascending");
  });
});

describe("sortByNumber", () => {
  // Шинэ массив ТУС БҮРД — эрэмбэлэгч эх өгөгдлийг хөндвөл дараагийн шалгалт
  // «аль хэдийн эрэмбэлэгдсэн» массив дээр гүйж, алдааг нуух байлаа.
  const makeRows = () => [
    { name: "А", overdue: 500 },
    { name: "Б", overdue: 1200 },
    { name: "В", overdue: 500 },
    { name: "Г", overdue: 0 },
  ];
  const amount = (r: { overdue: number }) => r.overdue;

  it("буурахаар эрэмбэлнэ", () => {
    expect(sortByNumber(makeRows(), amount, "desc").map((r) => r.name))
      .toEqual(["Б", "А", "В", "Г"]);
  });

  it("өсөхөөр эрэмбэлнэ", () => {
    expect(sortByNumber(makeRows(), amount, "asc").map((r) => r.name))
      .toEqual(["Г", "А", "В", "Б"]);
  });

  it("тэнцүү утгууд анхны дараалалаа хадгална", () => {
    // А ба В хоёулаа 500 — аль ч чиглэлд А нь В-ээс өмнө үлдэнэ
    const d = sortByNumber(makeRows(), amount, "desc").map((r) => r.name);
    const a = sortByNumber(makeRows(), amount, "asc").map((r) => r.name);
    expect(d.indexOf("А")).toBeLessThan(d.indexOf("В"));
    expect(a.indexOf("А")).toBeLessThan(a.indexOf("В"));
  });

  it("эх массивыг хөндөхгүй", () => {
    const rows = makeRows();
    const before = rows.map((r) => r.name);
    const out = sortByNumber(rows, amount, "asc");
    expect(rows.map((r) => r.name)).toEqual(before);
    expect(out).not.toBe(rows);
  });
});

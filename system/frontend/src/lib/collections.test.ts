import { describe, it, expect } from "vitest";
import { DEFAULT_SORT, canClosePromise, collectionFilterFrom, collectionSortFrom,
         collectionsHref, promiseDoneText, promiseStatusPill, sortAria,
         sortParam } from "./collections";

/* Отгоо «Амлалт зөрчсөн» гэж шүүгээд нэг харилцагч руу орж, буцах товч
   дарахад ЖАГСААЛТ БҮГД болж эргэж ирдэг байв — тэр хаана байснаа алдана. */

describe("шүүлтүүр хаягнаас", () => {
  it("таних утга дамжина", () => {
    expect(collectionFilterFrom("late")).toBe("late");
    expect(collectionFilterFrom("nocontact")).toBe("nocontact");
  });

  it("танихгүй / хоосон нь «бүгд» рүү унана — хоосон хүснэгт гарахгүй", () => {
    expect(collectionFilterFrom("хачин")).toBe("all");
    expect(collectionFilterFrom(null)).toBe("all");
    expect(collectionFilterFrom(undefined)).toBe("all");
  });
});

describe("эрэмбэ хаягнаас", () => {
  it("анхны эрэмбэ = хамгийн их хэтэрсэн нь дээрээ", () => {
    expect(collectionSortFrom(null)).toEqual(DEFAULT_SORT);
    expect(DEFAULT_SORT).toEqual({ key: "overdue", dir: "desc" });
  });

  it("«oldest-asc» нь бүтнээрээ уншигдана", () => {
    expect(collectionSortFrom("oldest-asc")).toEqual({ key: "oldest", dir: "asc" });
    expect(collectionSortFrom("oldest")).toEqual({ key: "oldest", dir: "desc" });
  });

  it("танихгүй багана нь эрэмбийг эвдэхгүй", () => {
    expect(collectionSortFrom("хачин-asc")).toEqual(DEFAULT_SORT);
  });

  it("анхны эрэмбэ хаягийг БОХИРДУУЛАХГҮЙ", () => {
    expect(sortParam(DEFAULT_SORT)).toBe("");
    expect(sortParam({ key: "overdue", dir: "asc" })).toBe("overdue-asc");
  });
});

describe("хуудасны хаяг", () => {
  it("тохиргоогүй хуудас нь цэвэр хаягтай", () => {
    expect(collectionsHref("all", DEFAULT_SORT)).toBe("/collections");
  });

  it("шүүлтүүр ба эрэмбэ хоёул хаяган дээр — буцах товч тэдгээрийг сэргээнэ", () => {
    expect(collectionsHref("late", DEFAULT_SORT)).toBe("/collections?state=late");
    expect(collectionsHref("all", { key: "oldest", dir: "asc" }))
      .toBe("/collections?sort=oldest-asc");
    expect(collectionsHref("old", { key: "oldest", dir: "desc" }))
      .toBe("/collections?state=old&sort=oldest-desc");
  });

  it("хаягаас уншсан нь буцаад ижил хаяг өгнө (гэрлэлт)", () => {
    const href = collectionsHref("late", { key: "oldest", dir: "asc" });
    const p = new URLSearchParams(href.split("?")[1]);
    expect(collectionFilterFrom(p.get("state"))).toBe("late");
    expect(collectionSortFrom(p.get("sort"))).toEqual({ key: "oldest", dir: "asc" });
  });
});

/* Амлалт хаагдахгүй бол «Амлалт зөрчсөн» тоолуур ХЭЗЭЭ Ч буурахгүй: төлбөр нь
   орсон ч мөр нь нээлттэй хэвээр тоологдоод, улаан мэдэгдэл үүрд үлдэнэ. */
describe("амлалтын төлөв", () => {
  it("хаагдсан амлалт мөрөн дээрээ тэмдэгтэй", () => {
    expect(promiseStatusPill("kept")).toEqual(["Биелсэн ✓", "pill-green"]);
    expect(promiseStatusPill("broken")).toEqual(["Зөрчсөн", "pill-red"]);
  });

  it("нээлттэй амлалт нь төлөвийн тэмдэггүй — болзоо нь өөрөө мөрөн дээр", () => {
    expect(promiseStatusPill("open")).toBeNull();
    expect(promiseStatusPill(null)).toBeNull();
  });

  it("хаах товч нь ЗӨВХӨН нээлттэй амлалт дээр", () => {
    expect(canClosePromise({ promise_id: 7, promise_status: "open" })).toBe(true);
    expect(canClosePromise({ promise_id: 7, promise_status: "kept" })).toBe(false);
    // Амлалтгүй мөр дээр товч гарах ёсгүй — юуг хаах нь тодорхойгүй
    expect(canClosePromise({ promise_id: null, promise_status: null })).toBe(false);
    expect(canClosePromise({})).toBe(false);
  });

  it("төлөвгүй ирсэн амлалтыг НЭЭЛТТЭЙ гэж үзнэ (хуучин сервер)", () => {
    expect(canClosePromise({ promise_id: 7 })).toBe(true);
  });

  it("үр дүн нь ХЭНИЙ амлалт болохыг нэрлэнэ", () => {
    expect(promiseDoneText("Батбаяр ХХК", "kept"))
      .toBe("Батбаяр ХХК — амлалт «биелсэн» болж хаагдлаа");
    expect(promiseDoneText("Батбаяр ХХК", "broken"))
      .toBe("Батбаяр ХХК — амлалт «зөрчсөн» болж хаагдлаа");
  });
});

describe("эрэмбийн товчны нэр", () => {
  it("дарвал ЮУ болохыг хэлнэ — сум нь дангаараа юу ч хэлдэггүй", () => {
    expect(sortAria("Хэтэрсэн", DEFAULT_SORT, "overdue"))
      .toBe("Хэтэрсэн — багаас их рүү эрэмбэлэх");
    expect(sortAria("Хамгийн хуучин", DEFAULT_SORT, "oldest"))
      .toBe("Хамгийн хуучин — эрэмбэлэх");
  });
});

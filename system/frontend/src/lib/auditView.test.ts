import { describe, it, expect } from "vitest";
import {
  DEFAULT_DAYS, PAGE, auditQuery, defaultFilter, defaultRange, emptyText,
  filterTouched, isToday, localStamp, paging, pagingLabel,
} from "./auditView";

const TODAY = "2026-09-06";

describe("огнооны анхдагч цонх", () => {
  it("сүүлийн 30 хоног — хоёр үзүүр нь хоёулаа орно", () => {
    expect(defaultRange(TODAY)).toEqual({ from: "2026-08-08", to: TODAY });
    // 08-08 … 09-06 = яг 30 хоног
    expect(DEFAULT_DAYS).toBe(30);
  });

  it("сар/жилийн хилээр буцаж алхана", () => {
    expect(defaultRange("2026-01-05").from).toBe("2025-12-07");
  });
});

describe("хүсэлтийн мөр", () => {
  it("хоосон шүүлтүүр огт явахгүй — зөвхөн хугацаа ба хязгаар", () => {
    expect(auditQuery(defaultFilter(TODAY)))
      .toBe(`/api/audit?from=2026-08-08&to=2026-09-06&limit=${PAGE}`);
  });

  it("бүх талбар — «Хэн» нь серверийн `user` нэрээр очно", () => {
    const q = auditQuery({ from: "2026-09-01", to: "2026-09-06", action: "void",
                           entity: "payment", who: " Отгоо ", q: " бартер ", offset: 400 });
    expect(q).toContain("action=void");
    expect(q).toContain("entity=payment");
    expect(q).toContain("user=%D0%9E%D1%82%D0%B3%D0%BE%D0%BE");   // тайрагдсан
    expect(q).toContain("offset=400");
    expect(q).not.toContain("user=+");
  });

  it("эхний хуудсанд `offset` огт бичигдэхгүй", () => {
    expect(auditQuery({ ...defaultFilter(TODAY), offset: 0 })).not.toContain("offset");
  });

  it("«Миний бүртгэл» нь ӨӨР хаалга — «Хэн» шүүлт огт явахгүй", () => {
    const f = { ...defaultFilter(TODAY), who: "Отгоо", entity: "movement" };
    const q = auditQuery(f, true);
    expect(q.startsWith("/api/audit/mine?")).toBe(true);
    expect(q).toContain("entity=movement");
    expect(q).not.toContain("user=");
    // Бүтэн бүртгэл дээр «Хэн» ХЭВЭЭР ажиллана
    expect(auditQuery(f)).toContain("user=");
  });
});

describe("шүүлт хөндөгдсөн эсэх", () => {
  it("анхдагч байдалд ХӨНДӨГДӨӨГҮЙ", () => {
    expect(filterTouched(defaultFilter(TODAY), TODAY)).toBe(false);
  });
  it("зөвхөн хоосон зайтай хайлт нь хөндөлт БИШ", () => {
    expect(filterTouched({ ...defaultFilter(TODAY), q: "   " }, TODAY)).toBe(false);
  });
  it("огноо, үйлдэл, биет, хэн, хайлт — тус бүр нь хөндөлт", () => {
    const d = defaultFilter(TODAY);
    expect(filterTouched({ ...d, from: "2020-01-01" }, TODAY)).toBe(true);
    expect(filterTouched({ ...d, action: "delete" }, TODAY)).toBe(true);
    expect(filterTouched({ ...d, entity: "loan" }, TODAY)).toBe(true);
    expect(filterTouched({ ...d, who: "Санхүүч" }, TODAY)).toBe(true);
    expect(filterTouched({ ...d, q: "барь" }, TODAY)).toBe(true);
  });
});

describe("цагийн тэмдэг", () => {
  it("серверийн орон нутгийн цагийг ХӨРВҮҮЛЭХГҮЙ, зөвхөн богиносгоно", () => {
    expect(localStamp("2026-09-06T14:03:22+08:00")).toBe("2026-09-06 14:03");
  });

  it("хөтчийн цагийн бүсээс ХАМААРАХГҮЙ — мөрийг огтолж уншина", () => {
    /* `new Date(...)` рүү оруулбал UTC-д гүйж буй тест дээр 06:03 болно.
       Cron нь 06:00-д гүйдэг: тэр мөр «22:00» гэж харагдвал Отгоо
       «шөнө хэн ажилласан юм бэ» гэж асууна. */
    expect(localStamp("2026-09-06T06:00:00+08:00")).toBe("2026-09-06 06:00");
  });

  it("латин үсэг үлдээхгүй — «T» ч, «+08:00» ч алга", () => {
    expect(localStamp("2026-09-06T14:03:22+08:00")).not.toMatch(/[A-Za-z+]/);
  });

  it("`local_at` байхгүй хуучин мөр дээр `at`-аараа зогсоно", () => {
    expect(localStamp(null, "2026-09-06 14:03:22")).toBe("2026-09-06 14:03");
    expect(localStamp("", "")).toBe("—");
  });

  it("өнөөдрийн мөрийг ялгана", () => {
    expect(isToday("2026-09-06 14:03", TODAY)).toBe(true);
    expect(isToday("2026-09-05 23:59", TODAY)).toBe(false);
  });
});

describe("хуудаслалт", () => {
  it("нийтээс дутуу байвал дараагийн хуудас бий", () => {
    expect(paging(200, 1431)).toEqual({ shown: 200, total: 1431, hasMore: true, nextOffset: 200 });
  });
  it("бүгд ирсэн бол товч гарахгүй", () => {
    expect(paging(37, 37).hasMore).toBe(false);
  });
  it("шошго нь ХОЁР тоог хамт хэлнэ", () => {
    expect(pagingLabel(paging(200, 1431))).toBe("200 / 1,431 бичилт");
    expect(pagingLabel(paging(0, 0))).toBe("0 бичилт");
  });
});

describe("хоосон төлөв", () => {
  it("ХУГАЦААГАА нэрлэнэ — «алга» гэдэг дангаараа мухардмал", () => {
    expect(emptyText(defaultFilter(TODAY))).toBe("2026-08-08 – 2026-09-06");
  });
});

import { describe, it, expect } from "vitest";
import { billableJobs, billTotal, invoiceTotals, type MachineLogRow } from "./machine";

// Нэхэмжлэх үүсгэхийн ӨМНӨ Отгоо «хэдэн мөр, хэдэн төгрөг» болохыг харна.
// Тэр урьдчилсан харагдац нь серверийн сонголттой ЯГ ижил дүрмээр ажиллах ёстой
// (routers/machines.py `billable_jobs`) — эс бөгөөс дэлгэц 2 мөр гэж амлаад
// баримт дээр 3 мөр хэвлэгдэнэ.

const logs: MachineLogRow[] = [
  { id: 1, date: "2026-05-01", entry: "job", label: "Бүтэн өдөр", client: "Түмэн Хийц", amount: 1_200_000, method: "BANK" },
  { id: 2, date: "2026-05-31", entry: "job", label: "Хагас өдөр", client: "Түмэн Хийц", amount: 600_000, method: "CASH" },
  { id: 3, date: "2026-05-15", entry: "job", label: "Дотоод ажил", client: "Түмэн Хийц", amount: 300_000, method: "INTERNAL" },
  { id: 4, date: "2026-05-10", entry: "job", label: "Бүтэн өдөр", client: "Бат Бүтээц", amount: 900_000, method: "BANK" },
  { id: 5, date: "2026-05-12", entry: "expense", label: "Түлш", client: "Түмэн Хийц", amount: 400_000, method: "" },
  { id: 6, date: "2026-06-01", entry: "job", label: "Бүтэн өдөр", client: "Түмэн Хийц", amount: 800_000, method: "BANK" },
];

describe("billableJobs", () => {
  it("зөвхөн тэр харилцагчийн АЖЛЫН мөрийг авна — зарлага, өөр харилцагч орохгүй", () => {
    const rows = billableJobs(logs, "Түмэн Хийц", "2026-05-01", "2026-05-31");
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("ДОТООД ажлыг хасна — өөрийн агуулах руу нэхэмжлэхгүй", () => {
    expect(billableJobs(logs, "Түмэн Хийц", "2026-05-01", "2026-05-31")
      .some((r) => r.method === "INTERNAL")).toBe(false);
  });

  it("цонхны хоёр ирмэг ОРНО (1-ний өдөр ба 31-ний өдөр хоёулаа)", () => {
    expect(billableJobs(logs, "Түмэн Хийц", "2026-05-02", "2026-05-30")).toEqual([]);
  });

  it("харилцагчийн нэрийн хоёр талын зайг үл тоомсорлоно (Excel-ээс хуулсан нэр)", () => {
    expect(billableJobs(logs, "  Түмэн Хийц ", "2026-05-01", "2026-05-31")).toHaveLength(2);
  });

  it("харилцагч сонгоогүй эсвэл огноо дутуу бол юу ч сонгохгүй", () => {
    expect(billableJobs(logs, "", "2026-05-01", "2026-05-31")).toEqual([]);
    expect(billableJobs(logs, "Түмэн Хийц", "", "2026-05-31")).toEqual([]);
    expect(billableJobs(logs, "Түмэн Хийц", "2026-05-01", "")).toEqual([]);
  });

  it("огноогоор эрэмбэлнэ — баримт дээрх дараалалтай ижил", () => {
    expect(billableJobs(logs, "Түмэн Хийц", "2026-05-01", "2026-06-30").map((r) => r.date))
      .toEqual(["2026-05-01", "2026-05-31", "2026-06-01"]);
  });
});

describe("billTotal", () => {
  it("сонгогдсон мөрүүдийн дүнг нэмнэ", () => {
    expect(billTotal(billableJobs(logs, "Түмэн Хийц", "2026-05-01", "2026-05-31")))
      .toBe(1_800_000);
  });

  it("хоосон сонголт 0", () => {
    expect(billTotal([])).toBe(0);
  });
});

/* НӨАТ нь дэлгэц дээр ХАРАГДДАГГҮЙ байв: урьдчилсан харагдац `billTotal`-ыг
   шууд «Нийт» гэж бичдэг байсан бол сервер `grand_total = total + НӨАТ` гэж
   бичдэг. Жигүүр Зам одоогоор НӨАТ-гүй (тохиргоо 0) тул хоёр тоо санамсаргүй
   таарч байсан — тохиргоог асаамагц баримт дээр өөр тоо гарна. */
describe("invoiceTotals", () => {
  const rows = billableJobs(logs, "Түмэн Хийц", "2026-05-01", "2026-05-31");

  it("НӨАТ 0 бол нийт нь мөрүүдийн нийлбэрээрээ хэвээр", () => {
    expect(invoiceTotals(rows, 0)).toEqual({ total: 1_800_000, vat: 0, grand: 1_800_000 });
  });

  it("НӨАТ 10% — серверийн total + total×%/100 томьёо", () => {
    expect(invoiceTotals(rows, 10)).toEqual({ total: 1_800_000, vat: 180_000, grand: 1_980_000 });
  });

  it("тохиргоо уншигдаагүй (заагаагүй) бол НӨАТ-гүй гэж үзнэ", () => {
    expect(invoiceTotals(rows)).toEqual({ total: 1_800_000, vat: 0, grand: 1_800_000 });
  });

  it("тохиргоо гажсан (NaN, сөрөг) бол 0 болж унана — тоо хэзээ ч NaN болохгүй", () => {
    expect(invoiceTotals(rows, NaN).grand).toBe(1_800_000);
    expect(invoiceTotals(rows, -5).grand).toBe(1_800_000);
  });

  it("хоосон сонголт бүхэлдээ 0", () => {
    expect(invoiceTotals([], 10)).toEqual({ total: 0, vat: 0, grand: 0 });
  });
});

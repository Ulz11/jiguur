import { describe, it, expect } from "vitest";
import { allocationPreview } from "./alloc";

// Backend-ийн хуваарилалтын дүрмийг UI дээр урьдчилж харуулна:
// хамгийн хуучин нэхэмжлэлээс эхэлж хаана, илүү нь кредит болно.

describe("allocationPreview", () => {
  it("нэг нэхэмжлэлийг бүрэн хаана", () => {
    const r = allocationPreview(1000, [
      { id: 1, no: "R-1", outstanding: 1000, due_date: "2026-05-01" },
    ]);
    expect(r.rows).toEqual([{ id: 1, no: "R-1", take: 1000 }]);
    expect(r.remainder).toBe(0);
  });

  it("хамгийн хуучнаас эхэлж хаагаад, илүүг кредит болгоно", () => {
    const r = allocationPreview(1500, [
      { id: 2, no: "R-2", outstanding: 800, due_date: "2026-06-01" },
      { id: 1, no: "R-1", outstanding: 1000, due_date: "2026-05-01" },
      { id: 3, no: "R-3", outstanding: 0, due_date: "2026-04-01" }, // төлөгдчихсөн — алгасна
    ]);
    expect(r.rows).toEqual([
      { id: 1, no: "R-1", take: 1000 },
      { id: 2, no: "R-2", take: 500 },
    ]);
    expect(r.remainder).toBe(0);
  });

  it("нэхэмжлэлээс их төлбөл үлдэгдэл нь кредит", () => {
    const r = allocationPreview(5000, [
      { id: 1, no: "R-1", outstanding: 3000, due_date: "2026-05-01" },
    ]);
    expect(r.remainder).toBe(2000);
  });

  it("0 болон сөрөг дүнд юу ч хуваарилахгүй", () => {
    expect(allocationPreview(0, [{ id: 1, no: "R-1", outstanding: 500, due_date: "2026-05-01" }]).rows).toEqual([]);
    expect(allocationPreview(-10, []).remainder).toBe(0);
  });
});

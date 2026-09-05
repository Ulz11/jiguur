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

  it("нэхэмжлэл бүрийг БҮТНЭЭР хаана: үндсэн дүн → түүний алданги → дараагийнх", () => {
    // 1,218,000₮ = 990,000 (1-р үндсэн) + 198,000 (1-р алданги) + 30,000 (2-р ҮНДСЭН)
    const r = allocationPreview(1_218_000, [
      { id: 1, no: "R-1", outstanding: 990_000, due_date: "2026-04-19", penalty_due: 198_000 },
      { id: 2, no: "R-2", outstanding: 990_000, due_date: "2026-05-19", penalty_due: 49_500 },
    ]);
    expect(r.rows).toEqual([
      { id: 1, no: "R-1", take: 990_000 },
      { id: 1, no: "R-1", take: 198_000, part: "penalty" },
      { id: 2, no: "R-2", take: 30_000 },
    ]);
    expect(r.remainder).toBe(0);
  });

  it("үндсэн дүн хаагдсан ч бүртгэгдсэн алданги үлдсэн нэхэмжлэл рүү мөнгө орно", () => {
    const r = allocationPreview(60_000, [
      { id: 1, no: "R-1", outstanding: 0, due_date: "2026-04-19", penalty_due: 49_500 },
      { id: 2, no: "R-2", outstanding: 100_000, due_date: "2026-05-19" },
    ]);
    expect(r.rows).toEqual([
      { id: 1, no: "R-1", take: 49_500, part: "penalty" },
      { id: 2, no: "R-2", take: 10_500 },
    ]);
    expect(r.remainder).toBe(0);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
   ХУУЧИН ҮЛДЭГДЭЛ НЬ ТӨЛБӨРИЙН ЦОНХНООС ХАРАГДАХГҮЙ БАЙВ (2026-09).

   Гэрээний хуудсан дээрх «Төлбөр бүртгэх» нь ЗӨВХӨН тэр гэрээний
   нэхэмжлэлүүдийг мэддэг байсан тул харилцагч 1.5 сая₮ хуучин өртэй атал
   баримт дээр «Илүү — кредит болно» гэж бичигддэг: Отгоо мөнгө орж ирснийг
   бүртгээд, хуучин өр нь хаагдсан эсэхийг ХАРААГҮЙ хэвээр цонхоо хаана.
   Хуучин үлдэгдэл нь харилцагчийн ДАНСНЫ гэрээн дээр (`OB-…`) сууна —
   нэр нь ялгаатай ч мөнгө нь НЭГ харилцагчийнх.
   ────────────────────────────────────────────────────────────────────────── */

import { payCandidates } from "./alloc";

const inv = (o: Partial<Parameters<typeof payCandidates>[0][number]>) => ({
  id: 1, no: "R-1", outstanding: 100, due_date: "2026-09-01", ...o,
} as Parameters<typeof payCandidates>[0][number]);

describe("payCandidates — нэг харилцагч, нэг дараалал", () => {
  it("харилцагчийн ДАНСНЫ (OB) нэхэмжлэл нэр дэвшигчид нэмэгдэнэ", () => {
    const out = payCandidates(
      [inv({ id: 5, no: "R-26/07-1", outstanding: 990_000, due_date: "2026-09-20" })],
      [inv({ id: 9, no: "OB-3", contract_no: "OB-3",
             outstanding: 1_500_000, due_date: "2026-08-11" })]);
    expect(out.map((i) => i.id)).toEqual([9, 5]);
  });

  it("ӨӨР ЖИНХЭНЭ гэрээний нэхэмжлэл ОРОХГҮЙ — тэр нь өөрийн хуудастай", () => {
    const out = payCandidates(
      [inv({ id: 5, no: "R-26/07-1" })],
      [inv({ id: 7, no: "R-26/11-2", contract_no: "26/11", outstanding: 500_000 })]);
    expect(out.map((i) => i.id)).toEqual([5]);
  });

  it("дансны гэрээн дээрх ЧӨЛӨӨТ бичилт (A-…) ч мөн адил хуучин өр", () => {
    const out = payCandidates(
      [inv({ id: 5, no: "R-26/07-1", due_date: "2026-09-20" })],
      [inv({ id: 8, no: "A-3-1", contract_no: "OB-3",
             outstanding: 164_492_000, due_date: "2026-05-02" })]);
    expect(out.map((i) => i.id)).toEqual([8, 5]);
  });

  it("НЭГ нэхэмжлэл ХОЁР удаа орохгүй (гэрээнийх нь жагсаалтад аль хэдийн бий)", () => {
    const row = inv({ id: 9, no: "OB-3", contract_no: "OB-3", outstanding: 1_500_000 });
    expect(payCandidates([row], [row]).map((i) => i.id)).toEqual([9]);
  });

  it("хаагдсан ба ХҮЧИНГҮЙ мөр нэмэгдэхгүй — хаах юмгүй мөр асуулт төрүүлнэ", () => {
    const out = payCandidates([inv({ id: 5 })], [
      inv({ id: 9, no: "OB-3", contract_no: "OB-3", outstanding: 0 }),
      inv({ id: 10, no: "OB-4", contract_no: "OB-4", outstanding: 900, voided: true }),
    ]);
    expect(out.map((i) => i.id)).toEqual([5]);
  });

  it("харилцагчийн зураг ирээгүй бол гэрээнийх нь жагсаалт ХЭВЭЭР", () => {
    const own = [inv({ id: 5 })];
    expect(payCandidates(own, null)).toEqual(own);
    expect(payCandidates(own, undefined)).toEqual(own);
  });

  it("баримтын дараалал нь ТӨЛӨХ ХУГАЦААГААР — хамгийн хуучин нь эхэнд", () => {
    const out = payCandidates(
      [inv({ id: 1, due_date: "2026-09-20" }), inv({ id: 2, due_date: "2026-07-20" })],
      [inv({ id: 9, no: "OB-3", contract_no: "OB-3",
             outstanding: 1_500_000, due_date: "2026-08-11" })]);
    expect(out.map((i) => i.id)).toEqual([2, 9, 1]);
  });
});

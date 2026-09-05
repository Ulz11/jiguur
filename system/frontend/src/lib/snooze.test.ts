import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { elsewhereLine, forgetSnooze, pruneSnoozed, rememberSnooze,
         snoozeId, snoozedNotes } from "./snooze";

/* Нуулт нь УСТГАЛТАЙ адилхан мэдрэгдэж болохгүй: сервер нуусан мөрүүдээ
   хариунаасаа хасдаг тул «юуг нуусан бэ?» гэсэн асуултын хариу дэлгэц дээр
   байхгүй. Энэ санамж нь тэр хариуг НЭГ төхөөрөмж дээр барина. */

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    get size() { return map.size; },
  };
}

const g = globalThis as any;
let saved: any;
beforeEach(() => { saved = g.localStorage; g.localStorage = fakeStorage(); });
afterEach(() => { g.localStorage = saved; });

const TODAY = "2026-09-06";
const row = (kind: string, id: number | null, until = "2026-09-13") =>
  ({ kind, entity_id: id, title: `${kind} #${id}`, until });

describe("нуусан мөрийн санамж", () => {
  it("нуусан мөр нэрээрээ жагсана — «юуг нуусан бэ?» гэсэн хариу", () => {
    rememberSnooze(row("overdue", 41), TODAY);
    expect(snoozedNotes(TODAY)).toEqual([
      { kind: "overdue", entity_id: 41, title: "overdue #41", until: "2026-09-13" },
    ]);
  });

  it("ижил мөрийг хоёр удаа нуувал НЭГ бичлэг", () => {
    rememberSnooze(row("overdue", 41, "2026-09-10"), TODAY);
    rememberSnooze(row("overdue", 41, "2026-09-20"), TODAY);
    const rows = snoozedNotes(TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].until).toBe("2026-09-20");
  });

  it("нуултыг цуцлахад санамжаас ч гарна", () => {
    rememberSnooze(row("overdue", 41), TODAY);
    rememberSnooze(row("shipment", 88), TODAY);
    forgetSnooze({ kind: "overdue", entity_id: 41 }, TODAY);
    expect(snoozedNotes(TODAY).map((r) => r.kind)).toEqual(["shipment"]);
  });

  it("хугацаа нь дууссан бичлэг өөрөө унана — сервер аль хэдийн буцаасан", () => {
    rememberSnooze(row("overdue", 41, "2026-09-05"), TODAY);   // өчигдөр дуусав
    rememberSnooze(row("shipment", 88, "2026-09-13"), TODAY);
    expect(snoozedNotes(TODAY).map((r) => r.entity_id)).toEqual([88]);
  });

  it("entity_id-гүй (бүхэл төрлийн) нуулт нь өөрийн хаягтай", () => {
    expect(snoozeId({ kind: "promise_late", entity_id: null }))
      .not.toBe(snoozeId({ kind: "promise_late", entity_id: 1 }));
    rememberSnooze(row("promise_late", null), TODAY);
    expect(snoozedNotes(TODAY)).toHaveLength(1);
  });

  it("хугацаагүй бичлэг өөрөө унахгүй", () => {
    expect(pruneSnoozed([{ kind: "a", entity_id: 1, title: "a", until: "" }], TODAY))
      .toHaveLength(1);
  });

  it("санах ой хаалттай байсан ч нуулт ажиллана", () => {
    g.localStorage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };
    expect(() => rememberSnooze(row("overdue", 41), TODAY)).not.toThrow();
    expect(snoozedNotes(TODAY)).toEqual([]);
  });
});

describe("өөр төхөөрөмжөөс нуусан мөрүүд", () => {
  it("хаягийг нь мэдэхгүй тул буцаах гэж ХУДАЛ амлахгүй — тоогоор хэлнэ", () => {
    expect(elsewhereLine(5, 2))
      .toBe("Өөр төхөөрөмжөөс нуусан 3 мөр — хугацаа нь дуусахад өөрөө буцаж ирнэ.");
  });
  it("бүгд танил бол нэмэлт мөр гарахгүй", () => {
    expect(elsewhereLine(2, 2)).toBe("");
    expect(elsewhereLine(1, 4)).toBe("");
  });
});

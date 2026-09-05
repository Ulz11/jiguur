import { describe, it, expect } from "vitest";
import { AGING_KEYS, agingColor, agingFootnote, agingRows,
         overdueTile, snoozedLabel } from "./dashboard";

/* НАСЖИЛТЫН ХУВИН — ДУГААРААР олдвол ЧИМЭЭГҮЙ ХУДАЛ ярина.
   `d.aging[3]` нь «90+» байсан. Сервер «Хугацаа болоогүй» гэсэн хувинг ЭХЭНД
   нэмэхэд тэр индекс «61–90» руу гулсаж, «90+ хоног хэтэрсэн» гэсэн шошгын
   доор огт өөр тоо зогссон — алдаа дуугардаггүй, зөвхөн худал хариулдаг. */
describe("насжилтын хувингууд", () => {
  const server = [
    { key: "not_due", label: "Хугацаа болоогүй", amount: 12_000_000 },
    { key: "0_30", label: "0–30 хоног", amount: 5_000_000 },
    { key: "31_60", label: "31–60", amount: 3_000_000 },
    { key: "61_90", label: "61–90", amount: 1_000_000 },
    { key: "90_plus", label: "90+", amount: 44_000_000 },
  ];

  it("серверийн дараалалд ҮЛ ХАМААРАН канон дараалалд орно", () => {
    const shuffled = [server[4], server[0], server[3], server[1], server[2]];
    expect(agingRows(shuffled).map((r) => r.key)).toEqual([...AGING_KEYS]);
  });

  it("«90+» нь ТҮЛХҮҮРЭЭРЭЭ олдоно — индексээр биш", () => {
    const rows = agingRows(server);
    expect(rows.find((r) => r.key === "90_plus")!.amount).toBe(44_000_000);
    // Хэрэв индексээр («aging[3]») уншсан бол 1,000,000 гарах байв
    expect(rows[3].amount).toBe(1_000_000);
  });

  it("«Хугацаа болоогүй» нь ХОЦРОЛТЫН өнгө авахгүй — ХҮЛЭЭЛТ", () => {
    expect(agingColor("not_due")).not.toBe(agingColor("90_plus"));
    expect(agingColor("90_plus")).toBe("#C9363B");
    // Хувин бүр өөрийн өнгөтэй — таван мөр таван өнгө
    expect(new Set(AGING_KEYS.map(agingColor)).size).toBe(AGING_KEYS.length);
  });

  it("танихгүй өнгө нь УНАХГҮЙ", () => {
    expect(agingColor("шинэ_хувин")).toBeTruthy();
  });

  it("түлхүүргүй ХУУЧИН хариу дээр хуудас нурахгүй", () => {
    const legacy = [{ label: "0–30 хоног", amount: 5 }, { label: "31–60", amount: 3 },
                    { label: "61–90", amount: 1 }, { label: "90+", amount: 44 }];
    const rows = agingRows(legacy);
    expect(rows.map((r) => r.key)).toEqual(["0_30", "31_60", "61_90", "90_plus"]);
    expect(rows[3].amount).toBe(44);
  });

  it("сервер ШИНЭ хувин нэмбэл түүнийг чимээгүй хаяхгүй", () => {
    const rows = agingRows([...server, { key: "180_plus", label: "180+", amount: 7 }]);
    expect(rows[rows.length - 1]).toEqual({ key: "180_plus", label: "180+", amount: 7 });
  });

  it("хоосон/эвдэрсэн хариу дээр ч хоосон жагсаалт", () => {
    expect(agingRows(undefined)).toEqual([]);
    expect(agingRows([])).toEqual([]);
  });
});

/* Хувингуудын нийлбэр нь авлагын НИЙТ дүнтэй тэнцдэггүй: одоогийн циклийн
   хуримтлал нь хараахан нэхэмжлэл болоогүй тул хувинд суудаггүй. Тэр зөрүү
   тайлбаргүй бол «энэ график буруу байна» гэж уншигдана. */
describe("насжилтын хөлийн мөр", () => {
  it("нэхэмжилсэн + нэхэмжлэгдээгүй = нийт гэдгийг НЭГ мөрөөр хэлнэ", () => {
    expect(agingFootnote(51_300_000, 2_100_000))
      .toBe("нэхэмжилсэн 51,300,000₮ + нэхэмжлэгдээгүй 2,100,000₮ = 53,400,000₮");
  });

  it("хуримтлал байхгүй бол мөр гарахгүй — тайлбарлах зөрүү алга", () => {
    expect(agingFootnote(51_300_000, 0)).toBe("");
    expect(agingFootnote(51_300_000, 0.2)).toBe("");
  });
});

describe("«Хугацаа хэтэрсэн» картын дэд мөр", () => {
  it("нэхэмжлэлийн тоо нь ХЭДЭН ХҮН гэдгийг хэлэхгүй — залгах ажил хүнээр хэмжигдэнэ", () => {
    expect(overdueTile(12, 7)).toBe("12 нэхэмжлэл · 7 харилцагч");
  });

  it("хуучин сервер харилцагчийн тоо явуулаагүй бол нэхэмжлэл ганцаараа", () => {
    expect(overdueTile(12, undefined)).toBe("12 нэхэмжлэл");
    expect(overdueTile(12, null)).toBe("12 нэхэмжлэл");
    // 0 бол ХҮЧИНТЭЙ хариулт — «алга» гэдгийг хэлж байна
    expect(overdueTile(0, 0)).toBe("0 нэхэмжлэл · 0 харилцагч");
  });
});

describe("нуусан мэдэгдлийн шошго", () => {
  it("нуусан мөр АЛГА БОЛООГҮЙ гэдгийг хэлж, буцаах замаа заана", () => {
    expect(snoozedLabel(5)).toBe("5 нуугдсан · харах");
  });
  it("нуулт байхгүй бол шошго ч байхгүй", () => {
    expect(snoozedLabel(0)).toBe("");
    expect(snoozedLabel(undefined)).toBe("");
  });
});

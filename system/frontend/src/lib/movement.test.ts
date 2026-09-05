import { describe, expect, it } from "vitest";
import { MOVEMENT_NAMES, mvName, mvTone, saleRowTotal, saleTotal } from "./movement";

describe("хөдөлгөөний нэр — НЭГ толь, гурван дэлгэц", () => {
  /* Урьд нь нэр нь ContractDetail ба MaterialDetail хоёрт ТУСДАА бичигдсэн
     байв: шинэ төрөл нэмэхэд нэг нь «Акт» гэж, нөгөө нь «Худалдаа» гэж
     уншина. Толь нь нэг байх ёстой (UI-ЗАРЧИМ §3). */
  it("дөрвөн төрөл бүр нэртэй", () => {
    expect(mvName("ISSUE")).toBe("Ачилт");
    expect(mvName("RETURN")).toBe("Буцаалт");
    expect(mvName("WRITEOFF")).toBe("Акт");
    expect(mvName("SALE")).toBe("Худалдаа болгов");
    expect(Object.keys(MOVEMENT_NAMES)).toHaveLength(4);
  });

  it("танихгүй төрөл нь ӨӨРӨӨРӨӨ гарна — хоосон нүд үлдэхгүй", () => {
    // ЧАНГАРУУЛСАН (2026-09): «GIFT» гэсэн англи үг дэлгэц дээр гарахаа
    // болив — Отгоо эгчийн хувьд тэр нь хоосон нүднээс ялгаагүй.
    expect(mvName("GIFT")).toBe("Бусад");
  });

  it("өнгө нь утгаараа: олголт=брэнд, буцаалт=анхаар, акт=улаан, худалдаа=violet", () => {
    expect(mvTone("ISSUE")).toBe("brand");
    expect(mvTone("RETURN")).toBe("warn");
    expect(mvTone("WRITEOFF")).toBe("danger");
    // UI-ЗАРЧИМ §4: гэрээний төрөл «Худалдаа» → violet. Худалдаа болгосон
    // хөдөлгөөн ч мөн ХУДАЛДАА тул ижил өнгөөр яригдана.
    expect(mvTone("SALE")).toBe("violet");
    expect(mvTone("GIFT")).toBe("brand");
  });
});

describe("Худалдаа болгох — үржвэр нь ХАРАГДАНА (R13/R32)", () => {
  /* «Дутагдуулсан, засварын тооцоо гараар → qty × үнэ автомат — ҮРЖВЭРИЙГ
     нь харуулбал хурдан» (§4). Тиймээс мөрийн дүн нь ЦЭВЭР функц: Отгоо
     дэлгэц дээрх тоог өөрөө дахин үржүүлж шалгаж чадна. */
  it("мөрийн дүн = тоо × худалдах үнэ", () => {
    expect(saleRowTotal({ qty: 40, sale_price: 58_000 })).toBe(2_320_000);
  });

  it("үнэгүй (каталогт байхгүй) мөр 0 — NaN БИШ", () => {
    expect(saleRowTotal({ qty: 40, sale_price: 0 })).toBe(0);
    expect(saleRowTotal({ qty: 0, sale_price: 58_000 })).toBe(0);
    expect(saleRowTotal(undefined)).toBe(0);
  });

  it("бутархай тоог дугуйлна — төгрөг бол бүхэл", () => {
    expect(saleRowTotal({ qty: 1.5, sale_price: 58_333 })).toBe(87_500);
  });

  it("маягтын нийт дүн = зарах гэж бичсэн мөрүүдийн нийлбэр", () => {
    const rows = [
      { qty: 40, sale_price: 58_000 },
      { qty: 12, sale_price: 65_000 },
      { qty: 0, sale_price: 42_000 },
    ];
    expect(saleTotal(rows)).toBe(2_320_000 + 780_000);
    expect(saleTotal([])).toBe(0);
  });
});

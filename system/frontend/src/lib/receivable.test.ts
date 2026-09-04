import { describe, it, expect } from "vitest";
import { UNINVOICED, receivableSplit, uninvoicedLine, sameReceivable } from "./receivable";

describe("receivableSplit — НЭГ нийт дүн, задаргаатайгаа", () => {
  it("нэхэмжлэгдээгүй хэсэг байвал ил гаргана", () => {
    const s = receivableSplit(13_320_000, 990_000);
    expect(s.total).toBe(13_320_000);
    expect(s.invoiced).toBe(990_000);
    expect(s.uninvoiced).toBe(12_330_000);
    expect(s.showUninvoiced).toBe(true);
  });

  it("бүхэлдээ нэхэгдсэн бол дэд мөр ГАРАХГҮЙ — хий мөр бохирдуулна", () => {
    const s = receivableSplit(990_000, 990_000);
    expect(s.uninvoiced).toBe(0);
    expect(s.showUninvoiced).toBe(false);
  });

  it("хоосон харилцагч — бүх тоо тэг, дэд мөргүй", () => {
    const s = receivableSplit(0, 0);
    expect(s).toMatchObject({ total: 0, invoiced: 0, uninvoiced: 0, showUninvoiced: false });
  });

  it("төгрөгийн доорх шуугианыг дэд мөр болгохгүй, бүтэн төгрөгийг ХАРУУЛНА", () => {
    // `penaltySplit`-тэй ижил босго (0.5₮): бутархай нь дугуйлалтын шуугиан,
    // бүтэн төгрөг нь бодит хуримтлал — нуувал тоо зөрсөн мэт харагдана.
    expect(receivableSplit(990_000.4, 990_000).showUninvoiced).toBe(false);
    expect(receivableSplit(990_001, 990_000).showUninvoiced).toBe(true);
  });

  it("серверийн талбар дутсан ч уначихгүй", () => {
    const s = receivableSplit(undefined, undefined);
    expect(s).toMatchObject({ total: 0, invoiced: 0, uninvoiced: 0, showUninvoiced: false });
  });

  it("задаргаа нь НИЙТ дүнгээс хэзээ ч давахгүй", () => {
    // сервер зөрүүтэй тоо илгээсэн ч дэлгэц дээр сөрөг хэсэг гарахгүй
    const s = receivableSplit(1_000_000, 1_500_000);
    expect(s.invoiced).toBe(1_000_000);
    expect(s.uninvoiced).toBe(0);
  });

  it("нэхэмжилсэн хэсэг дутсан бол НИЙТ дүнгээс гаргана", () => {
    const s = receivableSplit(5_000_000, undefined);
    expect(s.invoiced).toBe(5_000_000);
    expect(s.uninvoiced).toBe(0);
  });
});

describe("uninvoicedLine — дэд мөрийн бичиг", () => {
  it("Отгоогийн үгээр: «үүнээс нэхэмжлэгдээгүй»", () => {
    expect(UNINVOICED).toBe("нэхэмжлэгдээгүй");
    expect(uninvoicedLine(12_330_000)).toBe("үүнээс нэхэмжлэгдээгүй: 12,330,000₮");
  });

  it("тэг бол мөр огт байхгүй", () => {
    expect(uninvoicedLine(0)).toBe("");
    expect(uninvoicedLine(0.4)).toBe("");
  });

  it("нягт байрлалд «сая»-гаар — ҮГС нь хэвээр", () => {
    expect(uninvoicedLine(12_330_000, 13_320_000)).toBe("үүнээс нэхэмжлэгдээгүй: 12.3 сая₮");
  });

  it("ХЭМЖҮҮРИЙГ ТОЛГОЙ тогтооно — дэд мөр ӨӨРӨӨ БИШ", () => {
    /* Хоёр дахь аргумент нь форматч БИШ, ТОЛГОЙН ДҮН: дэд мөр толгойныхоо
       шатанд буудаг тул дуудагч тал буруу хэмжүүр сонгох боломжгүй.

       Бодит уналт (2026-09): толгой нь `sayaFmt` («1.2 сая₮»), дэд мөр нь
       өөрийнхөө хэмжээгээр («13,200₮») бичигдэж, нэг нүдэнд ХОЁР хэмжүүр
       дараалж байв. Отгоо эгч тэр хоёрыг хасах гэж оролдоод утгагүй тоо
       гаргана — эсвэл (илүү аюултай нь) тоонд нь итгэхээ болино. Бодит
       датад авлага нь зуун сая, хуримтлал нь мянгаар хэмжигддэг тул энэ хос
       БАРАГ МӨР БҮР дээр гарна.

       ЗУРАГДСАН хосыг нь `tests/e2e/her/one-number.spec.ts` хуудас бүр дээр
       нүдээр тулгана (JSX-ийн хос энэ давхаргаас харагдахгүй). */
    expect(uninvoicedLine(13_200, 1_207_800)).toBe("үүнээс нэхэмжлэгдээгүй: 0.01 сая₮");
    expect(uninvoicedLine(13_200, 402_600)).toBe("үүнээс нэхэмжлэгдээгүй: 13,200₮");
    expect(uninvoicedLine(8_500_000, 1_200_000_000))
      .toBe("үүнээс нэхэмжлэгдээгүй: 0.01 тэрбум₮");
  });

  it("толгойн дүн дутсан = толгой нь БҮТЭН ₮ — дэд мөр ч бүтэн ₮", () => {
    const exact = uninvoicedLine(12_330_000);
    expect(exact).toContain("12,330,000₮");
    expect(exact).not.toContain("сая");
  });

  it("толгой нь «сая» бол дэд мөр ХЭЗЭЭ Ч бүтэн ₮ рүү унахгүй", () => {
    /* Жижиг дүн дээр «сая»-г хаях нь яг тэр хоёр хэмжүүрийг буцааж авчирна:
       нягтрал нь орон нэмж шийдэгдэнэ, хэмжүүр солиод биш. */
    for (const un of [19_800, 6_600, 600, 6, 1])
      expect(uninvoicedLine(un, 12_000_000), `${un}₮ дэд мөр`).toContain("сая₮");
  });
});

describe("sameReceivable — хоёр дэлгэцийн тоо тулгагдана", () => {
  it("ижил тоог ижил гэж хэлнэ", () => {
    expect(sameReceivable(13_320_000, 13_320_000)).toBe(true);
  });
  it("нэг төгрөгийн зөрүүг ч ЗӨРҮҮ гэж хэлнэ", () => {
    expect(sameReceivable(13_320_000, 13_320_001)).toBe(false);
  });
});

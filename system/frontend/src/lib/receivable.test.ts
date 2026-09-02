import { describe, it, expect } from "vitest";
import { UNINVOICED, receivableSplit, uninvoicedLine, sameReceivable } from "./receivable";
import { sayaFmt } from "./num";

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
    expect(uninvoicedLine(12_330_000, sayaFmt)).toBe("үүнээс нэхэмжлэгдээгүй: 12.3 сая₮");
  });

  it("ФОРМАТЧ нь ХЭМЖҮҮР — толгойныхтойгоо ижил байх ёстой", () => {
    /* Энэ функцэд дамжуулсан форматч нь зүгээр нэг чимэг БИШ: тэр нь дэд
       мөрийн ХЭМЖҮҮРИЙГ (бүтэн ₮ эсвэл «сая») тогтоодог. Тиймээс дуудагч
       тал ҮРГЭЛЖ өөрийн ТОЛГОЙН мөртэй ижил форматчийг дамжуулна.

       Бодит уналт (2026-09, Dashboard.tsx «Хүлээгдэж буй төлбөр» хүснэгт):
       толгой нь `money()` (бүтэн ₮), дэд мөр нь `sayaFmt` байсан тул нэг
       нүдэнд «2,345,678₮» дээр «үүнээс нэхэмжлэгдээгүй: 1.2 сая₮» тогтож,
       Отгоо эгч хоёр өөр хэмжүүрийг НЭМЭХ гэж оролддог байв.

       Хоёр гаралт нь ҮНЭХЭЭР ялгаатай гэдгийг энд тогтооно — тиймээс
       буруу форматч сонгох нь ХАРАГДАХ зөрүү, чимээгүй ялгаа биш.
       ЗУРАГДСАН хосыг нь `tests/e2e/her/one-number.spec.ts` хуудас бүр дээр
       нүдээр тулгана (JSX-ийн хос энэ давхаргаас харагдахгүй). */
    const full = uninvoicedLine(12_330_000);
    const short = uninvoicedLine(12_330_000, sayaFmt);
    expect(full).not.toBe(short);
    expect(full).toContain("12,330,000₮");
    expect(short).toContain("сая");
    expect(full).not.toContain("сая");
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

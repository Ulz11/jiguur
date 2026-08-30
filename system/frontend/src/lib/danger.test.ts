import { describe, it, expect } from "vitest";
import { nodeText, saysIrreversible } from "./danger";

/* «Буцаагдахгүй» гэж БИЧЧИХЭЭД `danger` өгөхөө мартвал ConfirmModal нь Enter-ийг
   ГҮЙЦЭТГЭХ товч дээр тавина — санамсаргүй нэг товшилт 5,950,000₮-ийн цалин
   олгочихно. Хүн мартдаг тул дүрмийг МАШИН барина: энэ хоёр функц нь
   хөгжүүлэлтийн үеийн анхааруулгын нүд. */

describe("nodeText — JSX-ээс үгийг гаргаж авах", () => {
  it("энгийн мөр, тоог хэвээр буцаана", () => {
    expect(nodeText("буцаагдахгүй")).toBe("буцаагдахгүй");
    expect(nodeText(42)).toBe("42");
  });

  it("хоосон утгууд юу ч нэмэхгүй", () => {
    expect(nodeText(null)).toBe("");
    expect(nodeText(undefined)).toBe("");
    expect(nodeText(false)).toBe("");
  });

  it("үүрлэсэн элементийн гүнээс ч уншина", () => {
    // intro={<><b>2026-08 · 2-р хагас</b> — олгосон гэж тэмдэглэхэд буцаагдахгүй.</>}
    const jsx = { props: { children: [
      { props: { children: "2026-08 · 2-р хагас" } },
      " — олгосон гэж тэмдэглэхэд буцаагдахгүй.",
    ] } };
    expect(nodeText(jsx)).toBe("2026-08 · 2-р хагас — олгосон гэж тэмдэглэхэд буцаагдахгүй.");
  });
});

describe("saysIrreversible — модал өөрөө «эргэхгүй» гэж амлав уу", () => {
  it("«буцаагдахгүй», «сэргэхгүй» хоёрыг таана", () => {
    expect(saysIrreversible("олгосон гэж тэмдэглэхэд буцаагдахгүй.")).toBe(true);
    expect(saysIrreversible("Устгасан бичилт сэргэхгүй.")).toBe(true);
    expect(saysIrreversible({ props: { children: ["ямар нэг ", "буцаагдахгүй"] } })).toBe(true);
  });

  it("буцаагддаг үйлдлийг ХУДАЛ тэмдэглэхгүй", () => {
    // «Сэргээх» нь эсрэг утга — үг таарсан гэж дуугарвал анхааруулга хог болно
    expect(saysIrreversible("сэргээсний дараа сарын хүү дахин тооцогдож эхэлнэ.")).toBe(false);
    expect(saysIrreversible("Баталгаажуулмагц нөөц хөдөлж, тооцоо эхэлнэ.")).toBe(false);
    expect(saysIrreversible(null)).toBe(false);
  });
});

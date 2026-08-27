import { describe, it, expect, vi } from "vitest";
import { isActivateKey, rowClickProps } from "./rowClick";

/* Мөр дарагддаг гэдэг нь ЗӨВХӨН хулганаар гэсэн үг байж болохгүй. Энэ файл
   гарын замыг хамгаална: Tab-аар очно, Enter/Space нээнэ, дотоод товчны Enter
   мөрийг хөндөхгүй. */

const ROW = { row: true };            // «мөр» өөрөө
const INNER = { inner: true };        // мөрийн доторх товч/талбар

const keyEvent = (key: string, target: unknown = ROW) => ({
  key, target, currentTarget: ROW, preventDefault: vi.fn(),
});

describe("isActivateKey", () => {
  it("Enter ба Space нь дарсантай ижил", () => {
    expect(isActivateKey("Enter")).toBe(true);
    expect(isActivateKey(" ")).toBe(true);
    expect(isActivateKey("Spacebar")).toBe(true);   // хуучин хөтөч
  });

  it("бусад товчлуур мөрийг хөдөлгөхгүй", () => {
    for (const k of ["Tab", "Escape", "ArrowDown", "a", "Shift"]) {
      expect(isActivateKey(k)).toBe(false);
    }
  });
});

describe("rowClickProps", () => {
  it("мөрийг Tab-аар очиж болохоор, нэртэйгээр буцаана", () => {
    const p = rowClickProps(() => {}, "Гэрээ №26/07 нээх");
    expect(p.tabIndex).toBe(0);
    expect(p["aria-label"]).toBe("Гэрээ №26/07 нээх");
    expect(p.role).toBe("button");
  });

  it("хүснэгтийн мөр уугуул `row` үүргээ хадгална", () => {
    // `button` болговол <table> бүтэн тороороо задарна — Отгоогийн уншилт эвдэрнэ
    expect(rowClickProps(() => {}, "Зээл нээх", "row").role).toBe("row");
    expect(rowClickProps(() => {}, "Гэрээ нээх", "link").role).toBe("link");
  });

  it("хулганаар дарахад үйлдэл ажиллана", () => {
    const go = vi.fn();
    rowClickProps(go, "нээх").onClick();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("Enter ба Space мөрийг нээнэ", () => {
    for (const k of ["Enter", " "]) {
      const go = vi.fn();
      const e = keyEvent(k);
      rowClickProps(go, "нээх").onKeyDown(e);
      expect(go).toHaveBeenCalledTimes(1);
      // Space нь хуудсыг доош үсэргэх ёсгүй
      expect(e.preventDefault).toHaveBeenCalledTimes(1);
    }
  });

  it("бусад товчлуурт хөдлөхгүй — Tab нь дараагийн мөр рүү явна", () => {
    const go = vi.fn();
    const e = keyEvent("Tab");
    rowClickProps(go, "нээх").onKeyDown(e);
    expect(go).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("мөрийн доторх товч дээрх Enter нь мөрийг хөндөхгүй", () => {
    // ж: Loans-ийн InlineEdit дотор Enter дарахад зээлийн мөр задрах ёсгүй
    const go = vi.fn();
    const e = keyEvent("Enter", INNER);
    rowClickProps(go, "нээх").onKeyDown(e);
    expect(go).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

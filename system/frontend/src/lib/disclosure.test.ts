import { describe, it, expect } from "vitest";
import { panelId, disclosureProps } from "./disclosure";

/* Задардаг мөр системд ТАВАН өөр дүрээр гарч байв: сумтай + `aria-controls`-той
   (дашбоардын хэтэрсэн KPI), зөвхөн сумтай (материалын эхний мөр), сумгүй мөртлөө
   задардаг (материалын 2 дахь мөр), огт тэмдэггүй (Зээл, Цалин). Нэг л дүрэм:
   тэмдэг нь төлөвөө хэлнэ, самбар нь id-тай, товч нь НЭЭЛТТЭЙ үедээ түүнийг заана. */

describe("panelId", () => {
  it("төрөл + түлхүүрээс нэг хэвийн id гаргана", () => {
    expect(panelId("loan", 7)).toBe("loan-panel-7");
    expect(panelId("run", 12)).toBe("run-panel-12");
  });

  it("id-д зохисгүй тэмдэгтийг цэвэрлэнэ", () => {
    // Материалын түлхүүр нь `material_id:grade_id` — цэг таслалтай түүхий утга
    expect(panelId("mat", "3:5")).toBe("mat-panel-3-5");
    // Түлхүүрт кирилл, зай, зураас орсон ч гарах утга нь ҮРГЭЛЖ хууль ёсны id
    expect(panelId("mat", "хэв 12/б")).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("нэг түлхүүр ҮРГЭЛЖ нэг id — холбоос хоосон буудахгүй", () => {
    expect(panelId("mat", "3:5")).toBe(panelId("mat", "3:5"));
    expect(panelId("mat", "3:5")).not.toBe(panelId("mat", "3:6"));
  });
});

describe("disclosureProps", () => {
  it("хумигдсан үед `aria-controls` ОГТ гаргахгүй", () => {
    // Хумигдсан үед самбар нь DOM-д байхгүй — заасан холбоос нь мухардмал болно
    const p = disclosureProps(false, "loan-panel-7");
    expect(p["aria-expanded"]).toBe(false);
    expect("aria-controls" in p).toBe(false);
  });

  it("нээлттэй үед байгаа самбараа заана", () => {
    expect(disclosureProps(true, "loan-panel-7")).toEqual({
      "aria-expanded": true, "aria-controls": "loan-panel-7",
    });
  });
});

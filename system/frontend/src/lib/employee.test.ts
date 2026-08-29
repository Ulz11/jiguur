import { describe, it, expect } from "vitest";
import { empBody, type EmployeeRow } from "./employee";

// PUT /api/salary/employees/{id} нь БҮТЭН EmployeeIn хүлээж авдаг: дутуу явуулсан
// талбар нь сервер дээр анхны утгаараа (0, "") бичигдэнэ. Тиймээс мөр дээр НЭГ
// талбар засахад үлдсэнийг нь хэвээр нь дагуулж явуулах ёстой — эс бөгөөс
// «албан тушаал» засахад цалин 0 болж ЧИМЭЭГҮЙ устана.

const e: EmployeeRow = {
  id: 7, name: "Дорж", role_title: "Оператор", type: "main",
  monthly_salary: 2_000_000, daily_rate: 0, ndsh: true,
};

describe("empBody", () => {
  it("зөвхөн заасан талбар өөрчлөгдөж, бусад нь хэвээр явна", () => {
    expect(empBody(e, { role_title: "Ахлах оператор" })).toEqual({
      name: "Дорж", role_title: "Ахлах оператор", type: "main",
      monthly_salary: 2_000_000, daily_rate: 0, ndsh: true,
    });
  });

  it("id-г явуулахгүй — сервер URL-аас нь олдог", () => {
    expect(empBody(e, {})).not.toHaveProperty("id");
  });

  it("НДШ-г logical утгаар явуулна (0/1 биш)", () => {
    expect(empBody(e, { ndsh: false }).ndsh).toBe(false);
    expect(empBody({ ...e, ndsh: false }, { ndsh: true }).ndsh).toBe(true);
  });

  it("дутуу талбартай мөрийг ч аюулгүй утгаар дүүргэнэ", () => {
    expect(empBody({ id: 1, name: "Сараа", type: "daily" } as EmployeeRow, { daily_rate: 90_000 }))
      .toEqual({ name: "Сараа", role_title: "", type: "daily",
                 monthly_salary: 0, daily_rate: 90_000, ndsh: false });
  });
});

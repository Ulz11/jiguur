import { describe, it, expect } from "vitest";
import { partLabel, partSign, balanceAfterRemoving, plannedDue } from "./loan";

// Зээлийн мөрөнд ГУРАВ өөр утгатай мөр зэрэгцэж харагдана: хүүгийн төлөлт
// (үлдэгдлийг хөдөлгөхгүй), үндсэн төлөлт (бууруулна), НЭМЭЛТ ОЛГОЛТ (ӨСГӨНӨ).
// Тэмдэг нь буруу бол Отгоо 400,000₮ авсан мөнгөө төлсөн гэж уншина.

describe("partLabel", () => {
  it("гурван төрлийг монголоор нэрлэнэ", () => {
    expect(partLabel("interest")).toBe("Хүү");
    expect(partLabel("principal")).toBe("Үндсэн");
    expect(partLabel("topup")).toBe("Нэмэлт олголт");
  });

  it("танихгүй утгыг өөрөөр нь буцаана — чимээгүй алдаа гаргахгүй", () => {
    expect(partLabel("хачин")).toBe("хачин");
  });
});

describe("partSign", () => {
  it("олголт нэмэгддэг, үндсэн төлөлт хасагддаг, хүү үлдэгдлийг хөдөлгөхгүй", () => {
    expect(partSign("topup")).toBe("+");
    expect(partSign("principal")).toBe("−");
    expect(partSign("interest")).toBe("");
  });
});

describe("balanceAfterRemoving", () => {
  it("үндсэн төлөлт уствал үлдэгдэл ӨСНӨ", () => {
    expect(balanceAfterRemoving(700_000, "principal", 300_000)).toBe(1_000_000);
  });

  it("нэмэлт олголт уствал үлдэгдэл БУУРНА", () => {
    expect(balanceAfterRemoving(1_400_000, "topup", 400_000)).toBe(1_000_000);
  });

  it("хүүгийн төлөлт уствал үлдэгдэл хэвээр", () => {
    expect(balanceAfterRemoving(1_000_000, "interest", 20_000)).toBe(1_000_000);
  });
});

describe("plannedDue", () => {
  it("гэрээгээр тохирсон сарын төлөлт байвал ТҮҮГЭЭР (серверийн planned_due-тэй нэг дүрэм)", () => {
    expect(plannedDue({ monthly_payment: 2_500_000, monthly_due: 600_000 })).toBe(2_500_000);
  });

  it("тохироогүй (0) бол сарын хүүгээр", () => {
    expect(plannedDue({ monthly_payment: 0, monthly_due: 600_000 })).toBe(600_000);
    expect(plannedDue({ monthly_due: 600_000 })).toBe(600_000);
  });
});

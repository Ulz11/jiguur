import { describe, it, expect } from "vitest";
import {
  depositActions, depositAfter, depositAmountText, depositError, depositKindLabel,
  depositLimit, depositMovesMoney, depositSign, depositStatusText,
} from "./deposit";

const money = (v: number) => `${Math.round(v).toLocaleString("en-US")}₮`;

/* Зулаа-3!G30 = «=20000000-8265000+3000000+3000000+10000000» = 27,735,000₮.
   Барьцаа нь НЭГ НҮД биш, ТАВАН ШИЙДВЭР (H8) — доорх дүрмүүд нь тэр гинжийг
   дэлгэц дээр буруу уншуулахгүй байх ганц хамгаалалт. */

describe("барьцааны бичилтийн тэмдэг", () => {
  it("байршуулалт ба нэмэлт нь ӨСГӨНӨ, суутгал ба буцаалт нь БУУРУУЛНА", () => {
    expect(depositSign("lodge")).toBe(1);
    expect(depositSign("topup")).toBe(1);
    expect(depositSign("apply")).toBe(-1);
    expect(depositSign("return")).toBe(-1);
  });

  it("Зулаагийн гинж мөр мөрөөрөө 27,735,000₮ болно", () => {
    const chain: [string, number][] = [
      ["lodge", 20_000_000], ["apply", 8_265_000],
      ["topup", 3_000_000], ["topup", 3_000_000], ["topup", 10_000_000],
    ];
    let bal = 0;
    for (const [kind, amount] of chain) bal = depositAfter(bal, kind, amount);
    expect(bal).toBe(27_735_000);
  });

  it("дүн нь тэмдэгтэйгээ уншигдана — хасах тэмдгийг ТЭР бичихгүй", () => {
    expect(depositAmountText({ kind: "topup", amount: 3_000_000 }, money)).toBe("+3,000,000₮");
    expect(depositAmountText({ kind: "apply", amount: 8_265_000 }, money)).toBe("−8,265,000₮");
  });
});

describe("мөнгө хөдөлгөх эсэх", () => {
  it("суутгал ба буцаалт нь мөнгө хөдөлгөнө — Receipt + баталгаажуулалт", () => {
    expect(depositMovesMoney("apply")).toBe(true);
    expect(depositMovesMoney("return")).toBe(true);
  });
  it("байршуулалт нь БҮРТГЭЛ — мөнгө нь аль хэдийн ирсэн", () => {
    expect(depositMovesMoney("lodge")).toBe(false);
    expect(depositMovesMoney("topup")).toBe(false);
  });
});

describe("хязгаар ба алдаа", () => {
  it("хасах үйлдэл барьцааны үлдэгдлээс хэтрэхгүй", () => {
    expect(depositLimit("apply", 27_735_000)).toBe(27_735_000);
    expect(depositLimit("return", 0)).toBe(0);
    expect(depositLimit("topup", 100)).toBeNull();
  });

  it("хэтэрсэн дүнг ӨГҮҮЛБЭРЭЭР хэлнэ", () => {
    expect(depositError("apply", 30_000_000, 27_735_000))
      .toBe("Барьцааны үлдэгдлээс их байна (үлдэгдэл 27,735,000₮)");
    expect(depositError("apply", 27_735_000, 27_735_000)).toBe("");
    expect(depositError("topup", 10_000_000, 0)).toBe("");
  });

  it("0 ба сөрөг дүн бичигдэхгүй — тэмдгийг төрөл нь зөөнө", () => {
    expect(depositError("topup", 0, 5)).toBe("Дүн 0-ээс их байх ёстой");
    expect(depositError("topup", -5, 5)).toBe("Дүн 0-ээс их байх ёстой");
  });
});

describe("товчны сонголт", () => {
  it("байршуулаагүй үед ЗӨВХӨН «Байршуулах» гарна", () => {
    expect(depositActions({ status: "none", balance: 0 }).map((a) => a.kind))
      .toEqual(["lodge"]);
  });

  it("барьцаатай үед байршуулах ДАХИН гарахгүй — хоёр дахь нь нэмэлт", () => {
    expect(depositActions({ status: "held", balance: 27_735_000 }).map((a) => a.kind))
      .toEqual(["topup", "apply", "return"]);
  });

  it("тооцоо хийгдсэн үед зөвхөн дахин нэмж болно", () => {
    expect(depositActions({ status: "settled", balance: 0 }).map((a) => a.kind))
      .toEqual(["topup"]);
  });
});

describe("төлвийн үг", () => {
  it("«байршуулаагүй» нь 0₮ БИШ — үйл явдал огт болоогүй (№55)", () => {
    expect(depositStatusText({ status: "none", balance: 0 }).label).toBe("Байршуулаагүй");
    expect(depositStatusText({ status: "none", balance: 0 }).label)
      .not.toBe(depositStatusText({ status: "settled", balance: 0 }).label);
  });

  it("өнгө нь UI-ЗАРЧИМ §4-ийн шатнаас гарна", () => {
    const SCALE = new Set(["pill-green", "pill-amber", "pill-grey"]);
    for (const st of ["none", "held", "settled"]) {
      expect(SCALE.has(depositStatusText({ status: st, balance: 1 }).pill)).toBe(true);
    }
  });
});

describe("явдлын нэр", () => {
  it("дөрвүүлээ монгол нэртэй", () => {
    expect(depositKindLabel("lodge")).toBe("Байршуулав");
    expect(depositKindLabel("topup")).toBe("Нэмж байршуулав");
    expect(depositKindLabel("apply")).toBe("Авлагад суутгав");
    expect(depositKindLabel("return")).toBe("Буцаав");
  });
  it("танихгүй төрөл чимээгүй алга болохгүй — өөрөө гарна", () => {
    expect(depositKindLabel("шинэ")).toBe("шинэ");
  });
});

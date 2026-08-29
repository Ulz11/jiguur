import { describe, it, expect } from "vitest";
import {
  clientHref, contractHref, materialHref, invoiceAnchorId, invoiceHref,
  contractsHref, contractFilterFrom, auditHref, notificationHref,
} from "./links";

/* Дэлгэц бүр дээр НЭГ объект НЭГ хаягтай байх ёстой. Хаягийг мөрөөр нь
   гараар угсарч байвал нэг хуудсанд `/clients/7`, нөгөөд нь `/client/7`
   болж чимээгүй эвдэрнэ — эндээс л гарна гэсэн дүрэм энэ файлаар барьцаална. */

describe("объектын хаяг", () => {
  it("харилцагч, гэрээ, материал бүр өөрийн канон хуудастай", () => {
    expect(clientHref(7)).toBe("/clients/7");
    expect(contractHref(26)).toBe("/contracts/26");
    expect(materialHref(3)).toBe("/warehouse/materials/3");
  });
});

describe("нэхэмжлэлийн хаяг", () => {
  it("нэхэмжлэл нь гэрээнийхээ хуудсан дээрх ЯГ өөрийн мөр рүү заана", () => {
    // Гэрээний толгойд буулгах нь «олдсонгүй»-тэй ойролцоо: 30 мөрийн
    // дундаас Отгоо өөрийн дарсан нэхэмжлэлээ дахин нүдээрээ хайна.
    expect(invoiceHref(26, 412)).toBe("/contracts/26#inv-412");
  });

  it("мөрийн id ба хаягийн зангуу НЭГ эх сурвалжаас гарна", () => {
    expect(invoiceAnchorId(412)).toBe("inv-412");
    expect(invoiceHref(26, 412)).toBe(`${contractHref(26)}#${invoiceAnchorId(412)}`);
  });

  it("нэхэмжлэлээ мэдэхгүй бол гэрээ рүүгээ — зангуугүй", () => {
    expect(invoiceHref(26, null)).toBe("/contracts/26");
    expect(invoiceHref(26, undefined)).toBe("/contracts/26");
  });
});

describe("contractsHref / contractFilterFrom", () => {
  it("шүүлтүүргүй бол жагсаалтын хаяг цэвэр хэвээр", () => {
    expect(contractsHref()).toBe("/contracts");
    expect(contractsHref("all")).toBe("/contracts");
  });

  it("төлөвийг хаягаар дамжуулна — дашбоардаас шууд «дуусах дөхсөн» рүү", () => {
    expect(contractsHref("ending")).toBe("/contracts?state=ending");
    expect(contractsHref("overdue")).toBe("/contracts?state=overdue");
  });

  it("хаягнаас уншихад зөвхөн ТАНИХ төлөв дамжина", () => {
    expect(contractFilterFrom("ending")).toBe("ending");
    expect(contractFilterFrom("opening")).toBe("opening");
  });

  it("танихгүй / хоосон утга бүх гэрээг харуулна — хоосон дэлгэц гаргахгүй", () => {
    for (const raw of ["", null, undefined, "хог", "ENDING", "; drop"]) {
      expect(contractFilterFrom(raw)).toBe("all");
    }
  });
});

describe("auditHref", () => {
  it("хуудастай объектыг нээнэ", () => {
    expect(auditHref("contract", 26)).toBe("/contracts/26");
    expect(auditHref("client", 4)).toBe("/clients/4");
    expect(auditHref("material", 9)).toBe("/warehouse/materials/9");
  });

  it("хуудасгүй объект — үхсэн холбоос ҮҮСГЭХГҮЙ", () => {
    // `payment`, `movement`, `invoice`-ийн id нь гэрээний id БИШ: /contracts/12
    // руу аваачвал огт өөр гэрээ нээгдэнэ.
    for (const e of ["payment", "movement", "invoice", "settings", "loan", "salary"]) {
      expect(auditHref(e, 12)).toBeNull();
    }
  });

  it("id байхгүй бичилт холбоосгүй", () => {
    expect(auditHref("contract", null)).toBeNull();
    expect(auditHref("contract", 0)).toBeNull();
  });
});

describe("notificationHref", () => {
  it("гэрээтэй мэдэгдэл гэрээ рүүгээ очно", () => {
    expect(notificationHref({ kind: "ending", contract_id: 5 }, "manager")).toBe("/contracts/5");
    expect(notificationHref({ kind: "shipment", contract_id: 5 }, "factory")).toBe("/contracts/5");
  });

  it("нэхэмжлэлээ нэрлэсэн мэдэгдэл ТЭР МӨР рүүгээ буулгана", () => {
    // «нэхэмжлэл R-26/07-4 12 хоног хэтэрлээ» гэж дуудсан мэдэгдэл гэрээний
    // толгойд буувал Отгоо тэр мөрийг өөрөө хайх ёстой болно.
    expect(notificationHref({ kind: "overdue", contract_id: 5, invoice_id: 41 }, "manager"))
      .toBe("/contracts/5#inv-41");
  });

  it("гэрээгүй мэдэгдэл өөрийн хуудас руу очно", () => {
    expect(notificationHref({ kind: "loan" }, "manager")).toBe("/loans");
    expect(notificationHref({ kind: "promise_late" }, "finance")).toBe("/collections");
    expect(notificationHref({ kind: "barter_stale" }, "manager")).toBe("/barter");
  });

  it("үйлдвэрийн даргад ХААЛТТАЙ хуудас руу холбоос гаргахгүй", () => {
    // Түүнд Зээл, Авлага цуглуулах хуудас байхгүй (цэсэнд ч алга, сервер ч 403)
    expect(notificationHref({ kind: "loan" }, "factory")).toBeNull();
    expect(notificationHref({ kind: "promise_late" }, "factory")).toBeNull();
  });

  it("танихгүй мэдэгдэл хаашаа ч аваачихгүй", () => {
    expect(notificationHref({ kind: "хачин" }, "manager")).toBeNull();
    expect(notificationHref({ kind: "loan", contract_id: null }, "manager")).toBe("/loans");
  });
});

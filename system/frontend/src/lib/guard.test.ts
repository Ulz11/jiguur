import { describe, it, expect } from "vitest";
import { canOpen, deniedMessage, routeRoles, rolesText } from "./guard";

/* Даргын цэсэнд «Тайлан» байхгүй ч ХАЯГ нь ажилласаар байв: хавчуургаа
   дарсан дарга хоосон дэлгэц дээр ЭРГЭЛДЭГЧ ширтэж үлддэг — сервер 403
   буцаасан тул хүлээж байгаа дата нь ХЭЗЭЭ Ч ирэхгүй. */

describe("хаалттай зам", () => {
  it("санхүүгийн хуудсууд даргад хаалттай", () => {
    for (const p of ["/collections", "/loans", "/salary", "/reports", "/analytics"]) {
      expect(canOpen(p, "factory"), p).toBe(false);
      expect(canOpen(p, "manager"), p).toBe(true);
      expect(canOpen(p, "finance"), p).toBe(true);
    }
  });

  it("Тохиргоо, Үйлдлийн бүртгэл нь ЗӨВХӨН менежерийнх", () => {
    for (const p of ["/settings", "/audit"]) {
      expect(canOpen(p, "manager"), p).toBe(true);
      expect(canOpen(p, "finance"), p).toBe(false);
      expect(canOpen(p, "factory"), p).toBe(false);
    }
  });

  it("хамтын хуудсууд хэнд ч нээлттэй", () => {
    for (const p of ["/", "/contracts", "/contracts/42", "/clients/7",
                     "/warehouse", "/warehouse/stocktake", "/barter", "/machines"]) {
      expect(canOpen(p, "factory"), p).toBe(true);
    }
  });

  it("ШИНЭ ГЭРЭЭ нь ЗӨВХӨН менежерийнх — сервер ч тэгдэг", () => {
    expect(canOpen("/contracts/new", "manager")).toBe(true);
    expect(canOpen("/contracts/new", "finance")).toBe(false);
    expect(canOpen("/contracts/new", "factory")).toBe(false);
    // Дугаартай гэрээ нь ХЭВЭЭР — «new» гэдэг ганц үг л хаалттай
    expect(canOpen("/contracts/9", "finance")).toBe(true);
  });

  it("БАРТЕР нь гурвуулангийнх — ил бичигдэв (дарга нөөцөд орох хөрөнгөө хардаг)", () => {
    expect(routeRoles("/barter")).toEqual(["manager", "finance", "factory"]);
    for (const r of ["manager", "finance", "factory"]) {
      expect(canOpen("/barter", r), r).toBe(true);
    }
    expect(canOpen("/barter", undefined)).toBe(false);
  });

  it("«Миний бүртгэл» нь бүх рольд — бүтэн бүртгэл ХЭВЭЭР эзний", () => {
    for (const r of ["manager", "finance", "factory"]) {
      expect(canOpen("/audit/mine", r), r).toBe(true);
    }
    expect(canOpen("/audit", "factory")).toBe(false);
    expect(canOpen("/audit", "finance")).toBe(false);
  });

  it("рольгүй хүнд ХААЛТТАЙ — таамаглаж нээхгүй", () => {
    expect(canOpen("/reports", undefined)).toBe(false);
    expect(canOpen("/reports", "")).toBe(false);
    // Танихгүй роль ч хаалттай: жагсаалтад байхгүй нь «болно» гэсэн үг биш
    expect(canOpen("/audit", "хачин")).toBe(false);
  });

  it("дэд зам нь эцэг замынхаа хаалтыг өвлөнө", () => {
    expect(canOpen("/settings/users", "finance")).toBe(false);
    // «/loansomething» нь /loans БИШ — хаалт гулсахгүй
    expect(routeRoles("/loansomething")).toBeNull();
  });
});

describe("зурвасын өгүүлбэр", () => {
  it("ХЭН нээж болохыг НЭРЛЭНЭ — «тэгвэл хэн хийх вэ?» гэсэн асуулт үлдэхгүй", () => {
    expect(deniedMessage("/reports")).toBe("Энэ хуудас танд хаалттай — зөвхөн менежер, санхүү");
    expect(deniedMessage("/settings")).toBe("Энэ хуудас танд хаалттай — зөвхөн менежер");
  });

  it("серверийн 403-ын мөртэй НЭГ үг, НЭГ дараалал", () => {
    // `auth.roles_text(("manager", "finance"))` → «менежер, санхүү»
    expect(rolesText(["manager", "finance"])).toBe("менежер, санхүү");
  });

  it("хаалтгүй зам дээр зурвас гарахгүй", () => {
    expect(deniedMessage("/contracts")).toBe("");
  });
});

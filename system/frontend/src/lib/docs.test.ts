import { describe, it, expect, vi } from "vitest";
import { runBusy, failMessage } from "./docs";
import { FALLBACK_ERROR } from "./errors";

/** Дуудлага бүрийг бүртгэдэг хиймэл орчин. `busy` нь `setBusy`-г дагаж
 *  хөдөлнө — жинхэнэ hook дээр ref яг ингэж ажилладаг. */
function harness(run: () => Promise<unknown>, alive = () => true) {
  const log: string[] = [];
  const toasts: string[] = [];
  const t = {
    get busy() { return t.key !== null; },
    key: null as string | null,
    setBusy: (k: string | null) => { t.key = k; log.push(k === null ? "free" : `busy:${k}`); },
    toast: (msg: string) => { toasts.push(msg); },
    alive,
    run,
  };
  return { t, log, toasts };
}

describe("runBusy", () => {
  it("амжилттай үед түгжээд, дуусмагц тайлна", async () => {
    const { t, log, toasts } = harness(async () => {});
    expect(await runBusy("/api/x/pdf", t)).toBe("done");
    expect(log).toEqual(["busy:/api/x/pdf", "free"]);
    expect(toasts).toEqual([]);
  });

  it("аль хэдийн ажил явж байвал хоёр дахь даралтыг ОГТ ажиллуулахгүй", async () => {
    const run = vi.fn(async () => {});
    const { t, log } = harness(run);
    t.key = "/api/x/pdf";                       // эхний даралт явж байна
    log.length = 0;
    expect(await runBusy("/api/x/pdf", t)).toBe("skipped");
    expect(run).not.toHaveBeenCalled();
    expect(log).toEqual([]);                    // явж буй ажлын түгжээг хөндөөгүй
  });

  it("алдааг ЗАЛГИХГҮЙ — мессежийг нь харуулж, товчоо сэргээнэ", async () => {
    const { t, log, toasts } = harness(async () => { throw new Error("PDF үүсгэж чадсангүй"); });
    expect(await runBusy("/api/x/pdf", t)).toBe("failed");
    expect(toasts).toEqual(["PDF үүсгэж чадсангүй"]);
    expect(log).toEqual(["busy:/api/x/pdf", "free"]);   // дахин оролдох боломж үлдэнэ
  });

  it("бүрэлдэхүүн салсан бол төлөв хөдөлгөхгүй (React-ийн анхааруулга гарахгүй)", async () => {
    const { t, log } = harness(async () => {}, () => false);
    await runBusy("/api/x/pdf", t);
    expect(log).toEqual(["busy:/api/x/pdf"]);   // «free» алга — setState хийгээгүй
  });
});

describe("failMessage", () => {
  it("Error-ийн мессежийг авна", () => {
    expect(failMessage(new Error("Нэвтрэлт дууссан"))).toBe("Нэвтрэлт дууссан");
  });

  it("мессежгүй/хоосон зайтай алдаа дээр ерөнхий мөр рүү унана", () => {
    expect(failMessage(new Error("   "))).toBe(FALLBACK_ERROR);
    expect(failMessage(null)).toBe(FALLBACK_ERROR);
    expect(failMessage("шидэгдсэн мөр")).toBe(FALLBACK_ERROR);
  });
});

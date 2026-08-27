import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { markSessionExpired, takeSessionExpired } from "./session";

/* Отгоо гэрээ бөглөж байтал токен нь хүчингүй болж, нэвтрэх хуудас руу
   шидэгддэг. Тайлбар нь ЯГ НЭГ УДАА гарч ирээд арилах ёстой — эс бөгөөс
   маргааш өглөө өөрөө нэвтрэх үед «хугацаа дууссан» гэж худал зогсоно. */

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    get size() { return map.size; },
  };
}

const g = globalThis as any;
let saved: any;

beforeEach(() => { saved = g.sessionStorage; g.sessionStorage = fakeStorage(); });
afterEach(() => { g.sessionStorage = saved; });

describe("session expiry flag", () => {
  it("тэмдэглээгүй үед юу ч хэлэхгүй", () => {
    expect(takeSessionExpired()).toBe(false);
  });

  it("тэмдэглэсний дараа НЭГ удаа мэдэгдэнэ", () => {
    markSessionExpired();
    expect(takeSessionExpired()).toBe(true);
    expect(takeSessionExpired()).toBe(false);   // хоёр дахь удаад чимээгүй
  });

  it("уншсаны дараа санах ойд юу ч үлдэхгүй", () => {
    markSessionExpired();
    takeSessionExpired();
    expect(g.sessionStorage.size).toBe(0);
  });

  it("санах ой хаалттай байсан ч нэвтрэлтийг зогсоохгүй", () => {
    // Приват горим/хориглосон cookie — бичих, унших хоёр хоёулаа шиднэ
    g.sessionStorage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };
    expect(() => markSessionExpired()).not.toThrow();
    expect(takeSessionExpired()).toBe(false);
  });
});

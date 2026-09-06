import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSessionExpiry, markSessionExpired, takeSessionExpired,
         parseExpiry, tokenAge, shouldRefresh, minutesLeft, expiryWarning,
         keepDraft, takeDraft, dropDraft,
         policyFrom, DEFAULT_POLICY,
         TOKEN_TTL_MS, REFRESH_AFTER_MS, EXPIRY_WARN_MS, DRAFT_TTL_MS,
         mustChangeAfterClose } from "./session";

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

  /* РЕГРЕСС (E2E-ээр баригдсан): буруу нууц үг оруулахад дэлгэц дээр
     «Нэвтрэлт дууссан» гэж гарч байв. Отгоо хэзээ ч нэвтрээгүй — тэр зүгээр л
     нууц үгээ буруу дарсан. `api.ts` нь БҮХ 401-ийг «хугацаа дууссан» гэж
     үзээд серверийн ЯГ үгийг («Нэвтрэх нэр эсвэл нууц үг буруу байна»)
     залгидаг байлаа. */
  it("нэвтрэх хүсэлтийн 401 нь «хугацаа дууссан» БИШ", () => {
    expect(isSessionExpiry("/api/auth/login")).toBe(false);
  });

  it("бусад хүсэлтийн 401 нь хугацаа дууссаных", () => {
    expect(isSessionExpiry("/api/clients")).toBe(true);
    expect(isSessionExpiry("/api/contracts/1")).toBe(true);
    expect(isSessionExpiry("/api/auth/me")).toBe(true);
    // Нууц үг солих нь нэвтэрсэн хүний үйлдэл — түүний 401 бол хугацаа дууссан
    expect(isSessionExpiry("/api/auth/change-password")).toBe(true);
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

/* ══ ТОКЕНЫ НАС ══
   Өглөө 9-д нэвтэрсэн Отгоо орой 9-д ГЭРЭЭ БӨГЛӨЖ БАЙХДАА шидэгддэг байв.
   Сервер гулсдаг хугацаа өгсөн; дэлгэц түүнийг ЯГ тэр хоёр тоогоор дуудна. */
describe("токены нас", () => {
  const NOW = new Date(2026, 8, 6, 14, 0).getTime();
  const inMs = (ms: number) => new Date(NOW + ms).toISOString();

  it("шинэ токеныг шинэчлэхгүй — сервер ямар ч байсан «үгүй» гэнэ", () => {
    // 12 цаг үлдсэн = дөнгөж гарсан
    expect(shouldRefresh(parseExpiry(inMs(TOKEN_TTL_MS)), NOW)).toBe(false);
    // 11 цаг 30 мин үлдсэн = 30 минутын настай
    expect(shouldRefresh(parseExpiry(inMs(TOKEN_TTL_MS - 30 * 60_000)), NOW)).toBe(false);
  });

  it("1 цагаас хөгширсөн токеныг шинэчилнэ", () => {
    expect(shouldRefresh(parseExpiry(inMs(TOKEN_TTL_MS - REFRESH_AFTER_MS)), NOW)).toBe(true);
    expect(shouldRefresh(parseExpiry(inMs(2 * 60 * 60_000)), NOW)).toBe(true);
  });

  it("уншигдахгүй цаг нь ТААМАГЛАЛ төрүүлэхгүй", () => {
    expect(parseExpiry(null)).toBeNull();
    expect(parseExpiry("хачин")).toBeNull();
    expect(shouldRefresh(null, NOW)).toBe(false);
    expect(tokenAge(null, NOW)).toBeNull();
  });

  it("10 минутаас бага үлдвэл САНУУЛНА", () => {
    expect(expiryWarning(parseExpiry(inMs(9 * 60_000)), NOW))
      .toBe("Нэвтрэлт 9 минутын дараа дуусна");
    expect(expiryWarning(parseExpiry(inMs(EXPIRY_WARN_MS)), NOW))
      .toBe("Нэвтрэлт 10 минутын дараа дуусна");
  });

  it("эрт ч, хожуу ч сануулахгүй", () => {
    // 11 минут — хараахан эрт
    expect(expiryWarning(parseExpiry(inMs(11 * 60_000)), NOW)).toBe("");
    // аль хэдийн дууссан — 401 өөрөө ажиллана, зурвас нь хоцрогдоно
    expect(expiryWarning(parseExpiry(inMs(-60_000)), NOW)).toBe("");
    expect(expiryWarning(null, NOW)).toBe("");
  });

  it("минут ДЭЭШ бүхэлчлэгдэнэ — «0 минутын дараа» гэж хэлэхгүй", () => {
    expect(minutesLeft(NOW + 30_000, NOW)).toBe(1);
  });
});

/* ══ БӨГЛӨСӨН ЗҮЙЛИЙГ АВРАХ ══
   401 нь Отгоог шиднэ; тэр агшинд төлбөрийн цонхонд шивсэн дүн React-ийн
   санах ойтой хамт алга болно. Дахин нэвтрээд буцахад цонх нь ХООСОН. */
describe("цонхны ноорог", () => {
  it("ЯГ тэр зам дээр, ЯГ тэр цонхонд сэргэнэ", () => {
    keepDraft("pay", "/contracts/26", { amount: "1200000", date: "2026-09-06" });
    expect(takeDraft("pay", "/contracts/26"))
      .toEqual({ amount: "1200000", date: "2026-09-06" });
  });

  it("ӨӨР гэрээн дээр буулгахгүй — буруу тоо шивэхээс дор", () => {
    keepDraft("pay", "/contracts/26", { amount: "1200000" });
    expect(takeDraft("pay", "/contracts/31")).toBeNull();
  });

  it("ӨӨР цонхонд буулгахгүй", () => {
    keepDraft("pay", "/contracts/26", { amount: "1200000" });
    expect(takeDraft("return", "/contracts/26")).toBeNull();
  });

  it("НЭГ л удаа сэргэнэ — «яагаад энэ тоо энд байна» дахин төрөхгүй", () => {
    keepDraft("promise", "/collections", { note: "залгасан" });
    expect(takeDraft("promise", "/collections")).toEqual({ note: "залгасан" });
    expect(takeDraft("promise", "/collections")).toBeNull();
  });

  it("хэтэрхий хуучин ноорог сэргэхгүй — маргааш өглөө гарч ирэх ёсгүй", () => {
    const t0 = 1_000_000;
    keepDraft("pay", "/contracts/26", { amount: "5" }, t0);
    expect(takeDraft("pay", "/contracts/26", t0 + DRAFT_TTL_MS + 1)).toBeNull();
  });

  it("хаях товч нь санах ойг цэвэрлэнэ", () => {
    keepDraft("pay", "/contracts/26", { amount: "5" });
    dropDraft();
    expect(takeDraft("pay", "/contracts/26")).toBeNull();
  });

  it("санах ой хаалттай байсан ч ажил зогсохгүй", () => {
    (globalThis as any).sessionStorage = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };
    expect(() => keepDraft("pay", "/x", { a: 1 })).not.toThrow();
    expect(takeDraft("pay", "/x")).toBeNull();
    expect(() => dropDraft()).not.toThrow();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ХОЁР ТООГ СЕРВЕР ХЭЛНЭ

   `TOKEN_TTL_MS`/`REFRESH_AFTER_MS` нь серверийн `auth.py`-ийн ХУУЛБАР.
   Сервер хэлж чадвал түүнийхийг авна — эс бөгөөс кэшлэгдсэн хуучин JS нь
   4 цагийн токеныг 12 гэж бодоод хэзээ ч шинэчлэхгүй.
   ══════════════════════════════════════════════════════════════════════════ */
describe("токены бодлого", () => {
  it("сервер юу ч хэлээгүй бол анхдагч", () => {
    expect(policyFrom(null)).toEqual(DEFAULT_POLICY);
    expect(policyFrom({})).toEqual(DEFAULT_POLICY);
    expect(policyFrom("хог")).toEqual(DEFAULT_POLICY);
  });

  it("серверийн секундыг ms болгоно", () => {
    expect(policyFrom({ token_ttl_seconds: 4 * 3600, refresh_after_seconds: 900 }))
      .toEqual({ ttlMs: 4 * 3600_000, refreshAfterMs: 900_000 });
  });

  it("нэг талбар л ирсэн бол нөгөө нь анхдагч хэвээр", () => {
    expect(policyFrom({ token_ttl_seconds: 3600 }))
      .toEqual({ ttlMs: 3600_000, refreshAfterMs: REFRESH_AFTER_MS });
  });

  it("утгагүй тоог (0, сөрөг, мөр) ҮЛ ТОО — тэдгээр нь бүх сессийг унтраана", () => {
    for (const bad of [0, -5, NaN, "3600", null, {}]) {
      expect(policyFrom({ token_ttl_seconds: bad })).toEqual(DEFAULT_POLICY);
    }
  });

  it("серверийн бодлого нь насыг ӨӨРӨӨР тоолно", () => {
    const NOW = Date.UTC(2026, 0, 15, 10, 0, 0);
    const short = policyFrom({ token_ttl_seconds: 3600, refresh_after_seconds: 600 });

    // Сервер 1 цагийн токен өгсөн, 55 минут үлдсэн → 5 минут настай: хэрэггүй
    const fresh = NOW + 55 * 60_000;
    expect(tokenAge(fresh, NOW, short)).toBe(5 * 60_000);
    expect(shouldRefresh(fresh, NOW, short)).toBe(false);
    /* ЯГ ТЭР агшинд 12 цагийн ХУУЛБАР нь токеныг 11 цаг настай гэж боддог —
       товшилт бүрд `refresh` дуудна. Тоог сервер хэлэх шалтгаан нь ЭНЭ. */
    expect(shouldRefresh(fresh, NOW, DEFAULT_POLICY)).toBe(true);

    // 45 минут үлдсэн → 15 минут настай: серверийн 10 минутын хаалга нээгдэв
    const old = NOW + 45 * 60_000;
    expect(shouldRefresh(old, NOW, short)).toBe(true);
  });
});

/* «АНХНЫ НУУЦ ҮГ ХЭВЭЭР» ГЭСЭН ЗУРВАС — ХААХ нь СОЛИХ БИШ.
   Нууц үг солих цонх ГУРВАН замаар хаагддаг (Escape, «Болих», гадна товшилт);
   гурвуулаа нууц үгийг хөндөхгүй. Гэвч бүрхүүл нь хаагдмагц
   `must_change_password: false`-ыг ХАДГАЛДАГ байв: Отгоо цонхыг санамсаргүй
   нээгээд Escape дархад сануулга бүтэн сессийн турш чимээгүй унтарна —
   /audit-ийн «Хэн» багана утгагүй хэвээр (гурван хүн бүгд «1234»). */
describe("нууц үгийн сануулга — цонх хаагдсаны дараа", () => {
  it("Escape / «Болих» нь зурвасыг ҮЛДЭЭНЭ", () => {
    expect(mustChangeAfterClose(true, false)).toBe(true);
  });

  it("нууц үг ҮНЭХЭЭР солигдсон үед л унтарна", () => {
    expect(mustChangeAfterClose(true, true)).toBe(false);
  });

  it("зурвасгүй хүн дээр юу ч асуухгүй", () => {
    expect(mustChangeAfterClose(false, false)).toBe(false);
    expect(mustChangeAfterClose(false, true)).toBe(false);
  });
});

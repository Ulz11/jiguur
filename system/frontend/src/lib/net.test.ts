import { describe, it, expect } from "vitest";
import { FETCH_TIMEOUT_MS, SLOW_SERVER, isSlowStatus, isTimeoutError } from "./net";

describe("хүлээх хугацаа", () => {
  it("25 секунд — Отгоо хоосон дэлгэц рүү үүнээс удаан ширтэхгүй", () => {
    expect(FETCH_TIMEOUT_MS).toBe(25_000);
  });

  it("зурвас нь ЮУ ХИЙХИЙГ хэлнэ", () => {
    expect(SLOW_SERVER).toContain("дахин оролдоно уу");
  });
});

describe("isSlowStatus", () => {
  it("504 (Vercel-ийн функц таслагдав) ба 408 нь «удаан»", () => {
    expect(isSlowStatus(504)).toBe(true);
    expect(isSlowStatus(408)).toBe(true);
  });

  it("сервер ХАРИУЛСАН бусад алдаа нь «удаан» БИШ — тэдний ЯГ үг чухал", () => {
    for (const s of [200, 400, 401, 403, 409, 413, 422, 500, 502]) {
      expect(isSlowStatus(s)).toBe(false);
    }
  });
});

describe("isTimeoutError", () => {
  it("бидний таймераас гарсан таслалтыг таньна", () => {
    const e = new Error("тасарлаа");
    e.name = "AbortError";
    expect(isTimeoutError(e)).toBe(true);
  });

  it("сүлжээ тасарсан (TypeError) нь таймер БИШ", () => {
    expect(isTimeoutError(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("хог утга дээр унахгүй", () => {
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
    expect(isTimeoutError("AbortError")).toBe(false);
  });
});

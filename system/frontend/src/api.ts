import { errorMessage, FALLBACK_ERROR } from "./lib/errors";
import { markSessionExpired } from "./lib/session";

export type User = { id: number; name: string; role: string; username: string };

export function token(): string | null {
  return localStorage.getItem("jz_token");
}
export function user(): User | null {
  const raw = localStorage.getItem("jz_user");
  return raw ? JSON.parse(raw) : null;
}
export function setAuth(t: string, u: User) {
  localStorage.setItem("jz_token", t);
  localStorage.setItem("jz_user", JSON.stringify(u));
}
export function clearAuth() {
  localStorage.removeItem("jz_token");
  localStorage.removeItem("jz_user");
}

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    clearAuth();
    if (!location.pathname.includes("login")) {
      // Хуудас руу шидэгдэхийн ӨМНӨ шалтгааныг үлдээнэ — эс бөгөөс Отгоо
      // гэрээ бөглөж байгаад гэнэт нэвтрэх дэлгэц дээр тайлбаргүй зогсоно.
      markSessionExpired();
      location.href = "/login";
    }
    throw new Error("Нэвтрэлт дууссан");
  }
  if (!res.ok) {
    // FastAPI 422 нь detail-ыг МАССИВ болгож буцаадаг — errorMessage бүх
    // хэлбэрийг хүн уншихаар мөр болгоно (lib/errors.ts).
    let msg = FALLBACK_ERROR;
    try { msg = errorMessage(await res.json()); } catch { /* JSON биш хариу */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function openPdf(path: string) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error("PDF үүсгэж чадсангүй");
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), "_blank");
}

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const money = (n: number) => fmt(n) + "₮";
export const sayaFmt = (n: number) =>
  Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " сая" : fmt(n);

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
    if (!location.pathname.includes("login")) location.href = "/login";
    throw new Error("Нэвтрэлт дууссан");
  }
  if (!res.ok) {
    let msg = "Алдаа гарлаа";
    try {
      const j = await res.json();
      msg = j.detail || msg;
    } catch { /* ignore */ }
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

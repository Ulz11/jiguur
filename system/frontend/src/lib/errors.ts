/* Серверийн алдааг хүн уншихаар мөр болгох ганц газар.
 *
 * FastAPI-ийн 422 (validation) хариу нь `detail`-ыг МАССИВ болгож буцаадаг:
 *   {"detail":[{"loc":["body","deposit"],"msg":"Input should be a valid number",…}]}
 * Хуучин `msg = j.detail` нь энэ массивыг шууд Error() рүү шидээд toast дээр
 * "[object Object]" болж харагддаг байсан — хэрэглэгч юу буруу болсныг мэдэхгүй.
 */

export const FALLBACK_ERROR = "Алдаа гарлаа";

function oneMessage(x: any): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x.trim();
  if (typeof x === "object") {
    if (typeof x.msg === "string" && x.msg.trim()) return x.msg.trim();
    try { return JSON.stringify(x); } catch { return ""; }
  }
  return String(x);
}

export function errorMessage(j: any): string {
  const d = j?.detail;
  if (Array.isArray(d)) {
    const parts = d.map(oneMessage).filter(Boolean);
    return parts.length ? parts.join("; ") : FALLBACK_ERROR;
  }
  return oneMessage(d) || FALLBACK_ERROR;
}

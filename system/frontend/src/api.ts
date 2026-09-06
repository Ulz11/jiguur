import { errorMessage, FALLBACK_ERROR } from "./lib/errors";
import { isSessionExpiry, markSessionExpired, keepDraft,
         clearSessionInfo } from "./lib/session";
import { dirtySnapshot } from "./lib/dirty";
import { live } from "./lib/live";
import { FETCH_TIMEOUT_MS, SLOW_SERVER, isSlowStatus, isTimeoutError } from "./lib/net";

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
  // Сессийн санамж (хугацаа, нууц үгийн анхааруулга) токентой хамт явна
  clearSessionInfo();
}

/* ГАНЦ ГАРАЛТ. Vercel дээр сервер нь «унтарсан» байснаа сэрэх (Neon-ы compute
   хэдэн секунд босно), эсвэл 300 секундын хаалганд таслагдах боломжтой.
   Браузерын анхдагч зан нь ХЯЗГААРГҮЙ ХҮЛЭЭХ — тэр агшинд дэлгэц хөлддөг,
   Отгоо дахин дарж хоёр бичилт үүсгэнэ. 25 секундын дараа өөрсдөө таслаад
   ЯГ НЭГ өгүүлбэр хэлнэ (`lib/net.ts`). */
async function fetchOrTimeout(path: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(path, { ...init, signal: ctrl.signal });
  } catch (e) {
    // Таслалт нь «сүлжээ унав» БИШ — «сервер хариулж амжсангүй».
    if (isTimeoutError(e)) throw new Error(SLOW_SERVER);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  /* ТОПБАРЫН ЗААГЧ (`lib/live.ts`). Дэлгэц дээрх тоо ХЭР ШИНЭ болохыг зөвхөн
     ӨГӨГДӨЛ УНШИХ хүсэлт хэлж чадна: POST/PATCH нь дэлгэцийг шинэчилдэггүй
     (араас нь ирэх GET л шинэчилнэ) тул тэдгээрийг «Шинэчилсэн: 14:03»
     болгож бичвэл цаг нь худал болно.
     ⚠ Сүлжээ тасарсныг ЗӨВХӨН fetch өөрөө унасан үед хэлнэ: 400/403/409 нь
     сервер ХАРИУЛСАН гэсэн үг — холболт бүтэн, зөвхөн хүсэлт нь буруу. */
  const reads = !opts.method || opts.method.toUpperCase() === "GET";
  let res: Response;
  try {
    res = await fetchOrTimeout(path, { ...opts, headers });
  } catch (e) {
    if (reads) live.fail();
    throw e;
  }
  if (reads) {
    // 5xx = сервер өөрөө унасан — тоо шинэчлэгдээгүй гэсэн үг
    if (res.status >= 500) live.fail(); else live.ok();
  }
  /* 401 нь ХОЁР өөр зүйл байж болно. Токентой хүсэлтийн 401 = хугацаа дууссан
     (шидэгдэнэ, тайлбар үлдээнэ). НЭВТРЭХ хүсэлтийн 401 = нэр/нууц үг буруу —
     энэ нь ердийн алдаа тул доорх `!res.ok` салбар нь серверийн ЯГ үгийг
     дамжуулна. Ялгаагүй болгосноос болж нууц үгээ буруу бичсэн хүнд
     «Нэвтрэлт дууссан» гэж ХУДАЛ хэлдэг байв. */
  if (res.status === 401 && isSessionExpiry(path)) {
    clearAuth();
    if (!location.pathname.includes("login")) {
      // Хуудас руу шидэгдэхийн ӨМНӨ шалтгааныг үлдээнэ — эс бөгөөс Отгоо
      // гэрээ бөглөж байгаад гэнэт нэвтрэх дэлгэц дээр тайлбаргүй зогсоно.
      markSessionExpired();
      /* ...БА БИЧСЭН ЗҮЙЛИЙГ НЬ. Тэр агшинд гарын доор 45 минутын ажил байж
         болно: төлбөрийн дүн, буцаалтын мөр, амлалтын тэмдэглэл. Дахин
         нэвтрээд ЯГ тэр зам дээр буцахад цонх нь бөглөгдсөнөөрөө нээгдэнэ. */
      const snap = dirtySnapshot();
      if (snap) keepDraft(snap.name, location.pathname, snap.values);
      location.href = "/login";
    }
    throw new Error("Нэвтрэлт дууссан");
  }
  if (!res.ok) {
    /* 504 нь серверийн «үг» БИШ — Vercel өөрөө функцийг таслаад хоосон
       (эсвэл HTML) хариу буцаасан гэсэн үг. `errorMessage` түүнээс юу ч
       гаргаж чадахгүй тул «Алдаа гарлаа» болж хувирдаг байв. */
    if (isSlowStatus(res.status)) {
      const slow = new Error(SLOW_SERVER) as Error & { status?: number };
      slow.status = res.status;
      throw slow;
    }
    // FastAPI 422 нь detail-ыг МАССИВ болгож буцаадаг — errorMessage бүх
    // хэлбэрийг хүн уншихаар мөр болгоно (lib/errors.ts).
    let msg = FALLBACK_ERROR;
    let detail: unknown;
    try {
      const body = await res.json();
      msg = errorMessage(body);
      detail = body?.detail;
    } catch { /* JSON биш хариу */ }
    /* ТҮҮХИЙ биетийг ХАЯХГҮЙ. Зарим 409 нь өгүүлбэрээс ГАДНА үйлдэл авч
       явдаг: давхардсан харилцагчийн `existing_id` нь «тэр хүн рүү очих»
       холбоос болно (`lib/clientAdmin.ts`). Мөрөнд шахчихвал тэр холбоос
       үүрд алга болно. Бүх хуучин баригч тал `e.message`-ээ хэвээр уншина. */
    const err = new Error(msg) as Error & { detail?: unknown; status?: number };
    err.detail = detail;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Серверийн алдааны хариу нь JSON — «PDF үүсгэж чадсангүй» гэсэн ерөнхий
 *  мөрөөр дарвал Отгоо ЯАГААД гараагүйг мэдэхгүй (ж: «Энэ циклд хавсралт
 *  гаргах хөдөлгөөн алга»). Байвал серверийн үгийг нь дамжуулна. */
async function fileError(res: Response, fallback: string): Promise<Error> {
  // Таслагдсан функц нь JSON БИШ — «PDF үүсгэж чадсангүй» гэхээс «сервер
  // удаан байна» гэдэг нь ЯАХЫГ (дахин оролдох) хэлж байна.
  if (isSlowStatus(res.status)) return new Error(SLOW_SERVER);
  try { return new Error(errorMessage(await res.json())); } catch { return new Error(fallback); }
}

export async function openPdf(path: string) {
  const res = await fetchOrTimeout(path, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw await fileError(res, "PDF үүсгэж чадсангүй");
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), "_blank");
}

/** Файл татах (Excel, хавсралт). `res.ok`-ыг шалгахгүй байхад алдааны JSON нь
 *  `avlaga.xlsx` нэртэйгээр диск рүү бууж, Excel «эвдэрсэн файл» гэж хэлдэг —
 *  хаанаас гарсан алдаа нь мэдэгдэхгүй. */
export async function downloadFile(path: string, filename: string) {
  const res = await fetchOrTimeout(path, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw await fileError(res, "Файл татаж чадсангүй");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Татаж эхлэхээс өмнө URL-ыг чөлөөлвөл зарим хөтөч татахаа болино
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* Тоо форматлах ГАНЦ эх сурвалж нь `lib/num.ts` (тестээр барьцаалагдсан,
   сүлжээ/localStorage-гүй тул шууд гүйдэг). Энд зөвхөн дахин экспортлоно —
   хуудсууд өмнөх шигээ `../api`-аас авна. */
export { fmt, sayaFmt, sayaFmtLike } from "./lib/num";
import { fmt as _fmt } from "./lib/num";
export const money = (n: number) => _fmt(n) + "₮";

/* «Яагаад би гэнэт нэвтрэх хуудсан дээр байна вэ?»
 *
 * Токен хүчингүй болмогц api.ts нь хуудсыг login руу ШУУД шидэж, хийж байсан
 * ажил чимээгүй алга болдог байв. Токен сэргээх (refresh) нь энэ шатны ажил
 * биш — гэхдээ ЮУ болсныг хэлэх нь ажил. Хаягдахынхаа өмнө нэг туг үлдээж,
 * нэвтрэх хуудас түүнийг уншаад тайлбарлана.
 *
 * `sessionStorage` — учир нь: (1) хуудас дахин ачаалагдахад амьд үлдэнэ,
 * (2) табаа хаахад өөрөө арилна, (3) бусад таб руу халдахгүй.
 * Приват горим/хориглосон санах ойд бичих нь ЧУЛУУ ШИДЭХГҮЙ — нэвтрэлт
 * тайлбаргүй ч ажиллах ёстой тул бүх хандалт try/catch дотор. */

const EXPIRED_KEY = "jz_session_expired";

/** Хугацаа дууссаныг тэмдэглэнэ (api.ts, login руу шидэхийн ӨМНӨ). */
export function markSessionExpired(): void {
  try { sessionStorage.setItem(EXPIRED_KEY, "1"); } catch { /* санах ой хаалттай */ }
}

/** Нэвтрэх хүсэлт өөрөө — түүний 401 нь ӨӨР утгатай. */
const LOGIN_PATH = "/api/auth/login";

/**
 * Энэ 401 нь «нэвтрэлтийн хугацаа дууссан» гэсэн үг үү?
 *
 * НЭВТРЭХ хүсэлтийн 401 нь тэр биш — нэр эсвэл нууц үг буруу гэсэн үг.
 * Хоёуланг нь нэг гэж үзсэнээс болж нууц үгээ буруу дарсан Отгоод
 * «Нэвтрэлт дууссан» гэсэн ХУДАЛ мессеж гардаг байв: тэр хэзээ ч нэвтрээгүй,
 * зүгээр л «1234»-ээ буруу бичсэн. Серверийн ЯГ үг («Нэвтрэх нэр эсвэл нууц
 * үг буруу байна») л түүнд юу хийхийг нь хэлж чадна.
 */
export function isSessionExpiry(path: string): boolean {
  return !path.startsWith(LOGIN_PATH);
}

/** Тугийг АВЧ, шууд арилгана — нэг л удаа тайлбарлана.
 *  (Дараа нь гараар гарч ирсэн хүнд «хугацаа дууссан» гэж худал хэлэхгүй.) */
export function takeSessionExpired(): boolean {
  try {
    const v = sessionStorage.getItem(EXPIRED_KEY);
    if (v === null) return false;
    sessionStorage.removeItem(EXPIRED_KEY);
    return true;
  } catch { return false; }
}

/* ══════════════════════════════════════════════════════════════════════════
   ТОКЕНЫ НАС — «ГЭНЭТ ЯАГААД НЭВТРЭХ ХУУДАС ДЭЭР БАЙНА ВЭ?» гэдгийн НӨГӨӨ ТАЛ

   Дээрх туг нь ЗӨВХӨН тайлбарладаг. Ажил нь ҮРГЭЛЖЛЭХ ёстой: 12 цагийн
   токен нь өглөө 9-д нэвтэрсэн Отгоог орой 9-д ГЭРЭЭ БӨГЛӨЖ БАЙХАД нь
   шиднэ. Сервер `POST /api/auth/refresh` гэсэн гулсдаг хугацаа өгсөн —
   ХЭРЭГЛЭЖ байгаа хүн дундуур нь гарахгүй, хэрэглээгүй сесси 12 цагийн
   дараа өөрөө унтарна.

   Дүрэм нь ЦЭВЭР логик: серверийн `auth.py`-ийн ЯГ тэр хоёр тоо.
   ══════════════════════════════════════════════════════════════════════════ */

/** Серверийн `TOKEN_TTL` — 12 цаг. */
export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
/** Серверийн `REFRESH_AFTER` — токен 1 цагаас хөгширсөн үед л шинэчилнэ. */
export const REFRESH_AFTER_MS = 60 * 60 * 1000;
/** Хэдийн өмнө сануулах вэ — 10 минут (Отгоо гэрээгээ хадгалж амжина). */
export const EXPIRY_WARN_MS = 10 * 60 * 1000;

/** ISO цагийг ms болгоно. Уншигдахгүй бол `null` — хуудас нь ТААМАГЛАХГҮЙ
 *  (буруу тоо нь «10 минут үлдлээ» гэсэн ХУДАЛ зурвас төрүүлнэ). */
export function parseExpiry(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Токен ХЭДЭН ms настай вэ (`TTL − үлдсэн`). Мэдэгдэхгүй бол `null`. */
export function tokenAge(expiresAt: number | null, now: number): number | null {
  return expiresAt === null ? null : TOKEN_TTL_MS - (expiresAt - now);
}

/** Одоо шинэчлэх үү. Серверийн 1 цагийн хаалттай ЯГ ижил — эс бөгөөс дэлгэц
 *  хүсэлт бүрд `refresh` дуудаж, сервер бүр удаа «үгүй» гэж хариулна. */
export function shouldRefresh(expiresAt: number | null, now: number): boolean {
  const age = tokenAge(expiresAt, now);
  return age !== null && age >= REFRESH_AFTER_MS;
}

/** Хэдэн минут үлдэв (дээш нь бүхэлчилнэ: «0 минут» гэж хэлэхгүй). */
export function minutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000));
}

/** Сануулгын ЗУРВАС — 10 минутаас бага үлдсэн үед л. Дууссан бол хоосон
 *  (тэр үед 401 нь өөрөө ажиллана, зурвас нь хоцрогдоно). */
export function expiryWarning(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return "";
  const left = expiresAt - now;
  if (left <= 0 || left > EXPIRY_WARN_MS) return "";
  return `Нэвтрэлт ${minutesLeft(expiresAt, now)} минутын дараа дуусна`;
}

/* ══════════════════════════════════════════════════════════════════════════
   БӨГЛӨСӨН ЗҮЙЛИЙГ АВРАХ

   401 нь Отгоог АВТОМАТААР нэвтрэх хуудас руу шиднэ. Тэр агшинд түүний
   гарын доор 45 минутын ажил байж болно: төлбөрийн цонхонд шивсэн дүн,
   буцаалтын мөрүүд, амлалтын тэмдэглэл. Тэдгээр нь React-ийн санах ойд
   амьдардаг тул хуудас солигдмогц АЛГА болно — дахин нэвтрээд буцаж ирэхэд
   цонх нь ХООСОН нээгдэнэ, юу бичсэнээ санахаас өөр арга үлдэхгүй.

   Тиймээс шидэгдэхийн ӨМНӨ бичсэн зүйл нь `sessionStorage`-д үлдэнэ, ЯГ ТЭР
   ЗАМ дээр буцаж ирэхэд сэргэнэ. Дүрэм:
     · зөвхөн ЯГ ТЭР зам (`/contracts/26`) — өөр гэрээн дээр буулгах нь
       буруу тоо шивэхээс ДОР;
     · зөвхөн 2 цагийн дотор — маргаашийн нээлт дээр хуучин ноорог гарахгүй;
     · нэг л удаа (`takeDraft` нь АВЧ, устгана) — «яагаад энэ тоо энд байна»
       гэсэн асуулт хоёр дахь удаа төрөхгүй.
   ══════════════════════════════════════════════════════════════════════════ */

const DRAFT_KEY = "jz_dialog_draft";
/** Ноорог хэр удаан амьдрах вэ — 2 цаг. */
export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

export type DialogDraft = {
  /** Цонхны нэр — «pay», «return», «promise». */
  name: string;
  /** Хаана бөглөж байсан (`location.pathname`). */
  path: string;
  savedAt: number;
  values: Record<string, unknown>;
};

/** Бөглөсөн зүйлээ үлдээнэ (401-ийн ӨМНӨ, эсвэл цонх бохирдох бүрд). */
export function keepDraft(name: string, path: string, values: Record<string, unknown>,
                          now: number = Date.now()): void {
  try {
    sessionStorage.setItem(DRAFT_KEY,
      JSON.stringify({ name, path, savedAt: now, values } satisfies DialogDraft));
  } catch { /* санах ой хаалттай — ажил зогсохгүй */ }
}

/** Энэ зам дээрх энэ цонхны ноорог (байвал) — АВЧ, устгана. */
export function takeDraft(name: string, path: string,
                          now: number = Date.now()): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DialogDraft;
    if (!d || d.name !== name || d.path !== path) return null;
    sessionStorage.removeItem(DRAFT_KEY);
    if (!d.values || typeof d.values !== "object") return null;
    if (now - (d.savedAt || 0) > DRAFT_TTL_MS) return null;   // хэтэрхий хуучин
    return d.values;
  } catch { return null; }
}

/** Ноорогийг ХАЯХ — цонх амжилттай хадгалагдсан эсвэл болих дарагдсан үед. */
export function dropDraft(): void {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* үл ойшоох */ }
}

/* ---------- СЕССИЙН МЭДЭЭЛЛИЙН САНАМЖ ----------
 *
 * `GET /api/auth/me` нь «нууц үг анхныхаараа юу» гэдгийг шалгахдаа
 * PBKDF2-ыг 100,000 давталтаар гүйлгэдэг (`auth.is_seed_password`). Тэр нь
 * ЗӨВ — нууц үгийн шалгалт удаан байх ёстой. Гэвч ХУУДАС АЧААЛАХ БҮРД
 * түүнийг дуудах нь өөр асуудал: Отгоо өдөрт 200 удаа хуудас сольдог,
 * тэр бүрд сервер нэг нууц үг задлана.
 *
 * НЭВТРЭХ хариу нь ЯГ тэр хоёр талбарыг аль хэдийн авч ирдэг тул дахин
 * асуух шаардлагагүй: түүнийг хадгалж, дараагийн ачаалалтад уншина.
 * `localStorage` — токентой хамт амьдарна, `clearAuth` хамт арчина.
 */
const INFO_KEY = "jz_session";

export type SessionInfo = { token_expires_at?: string; must_change_password?: boolean };

export function saveSessionInfo(info: SessionInfo): void {
  try {
    const prev = readSessionInfo() || {};
    localStorage.setItem(INFO_KEY, JSON.stringify({ ...prev, ...info }));
  } catch { /* санах ой хаалттай — дэлгэц `/api/auth/me` рүү унана */ }
}

export function readSessionInfo(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(INFO_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as SessionInfo) : null;
  } catch { return null; }
}

export function clearSessionInfo(): void {
  try { localStorage.removeItem(INFO_KEY); } catch { /* үл ойшоох */ }
}

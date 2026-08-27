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

/* «Хэрэглэгч юм бөглөсөн үү?» гэдгийг шийддэг ГАНЦ газар.
 *
 * Модал хаах хамгаалалт (`Modal`-ийн `dirty`) нь СОНГОЛТ байсан тул 23 модалын
 * ердөө 3-д нь өгөгдсөн байв — үлдсэнд нь санамсаргүй дарсан гадна талын
 * товшилт бөглөсөн бүхнийг чимээгүй устгана. Одоо маягттай модал бүр
 * `FormModal`-ыг ашиглаж, «бохирдсон эсэх»-ээ ЗААВАЛ хэлдэг болсон.
 * Тэр хариултыг гараар бичих бүрд алдаа гардаг тул энд нэг л дүрэм:
 * ЭХНИЙ утгаас ялгаатай талбар байвал бохирдсон.
 */

/** Хоёр хавтгай (flat) маягтын төлөвийг талбар талбараар нь харьцуулна.
 *
 *  ЗАНГИЙН ХИЛ:
 *   • Утгуудыг `Object.is`-ээр харьцуулна — массив/объект талбар нь ЗААГААР
 *     (reference) харьцуулагдана. Мөр бүхий маягт (буцаалт, цалин бодох) өөрийн
 *     тусгай дүрмээ бичнэ, энд массив дамжуулахгүй.
 *   • Хоёр талд байхгүй түлхүүр = `undefined` тул нэмэгдсэн/хасагдсан түлхүүр
 *     бохирдол болно.
 *   • Хоосон зай ("  ") нь ялгаа гэж тооцогдоно — хэрэглэгч бичсэн зүйл нь
 *     хэдий утгагүй ч түүнийг асуулгүй устгах эрх бидэнд алга. */
export function formDirty<T extends Record<string, unknown>>(initial: T, current: T): boolean {
  for (const k of new Set([...Object.keys(initial), ...Object.keys(current)])) {
    if (!Object.is(initial[k], current[k])) return true;
  }
  return false;
}

/** Шинэ гэрээний 4 алхамт визард дундаа хаягдвал юу алдагдахыг шийднэ.
 *  Визард нь модал биш, БҮТЭН ХУУДАС тул хамгаалалт нь навигацийн түвшинд
 *  (`useBlocker` + `beforeunload`) ажиллана — энэ функц нь тэр хамгаалалтыг
 *  асаах эсэхийг хэлэх ганц дүрэм. */
export function contractDraftDirty(d: {
  step: number;
  clientId: number | null;
  itemCount: number;
  cond: Record<string, string>;
  condInitial: Record<string, string>;
  newClient: Record<string, string>;
}): boolean {
  if (d.step > 1) return true;                       // нэг ч алхам урагшилсан
  if (d.clientId !== null) return true;              // харилцагч сонгосон
  if (d.itemCount > 0) return true;                  // материал жагсаасан
  if (Object.values(d.newClient).some((v) => v.trim() !== "")) return true;
  return formDirty(d.condInitial, d.cond);           // нөхцөлийн аль нэг талбар
}

/* ══════════════════════════════════════════════════════════════════════════
   НЭЭЛТТЭЙ БОХИР ЦОНХНУУДЫН БҮРТГЭЛ

   Хоёр зүйл үүнийг мэдэх ёстой, хоёул ЦОНХНООС ГАДНА амьдардаг:
     · «Гарах» товч (App.tsx) — бөглөж байгаа хүнийг АСУУЛГҮЙ гаргах ёсгүй;
     · 401 (api.ts) — шидэгдэхийн ӨМНӨ бичсэн зүйлийг `sessionStorage`-д
       үлдээж, дахин нэвтрээд буцахад нь сэргээнэ.

   React-ийн төлөв нь бүрэлдэхүүн доторх тул гаднаас уншигдахгүй — тиймээс
   `Modal` өөрөө энд бүртгүүлнэ. Бүртгэл нь ЦЭВЭР (React-гүй): түлхүүр,
   нэр, утга гурав.
   ══════════════════════════════════════════════════════════════════════════ */

export type DirtyEntry = {
  /** Цонхны нэр — «pay», «return», «promise». Ноорог үүгээр сэргэнэ. */
  name: string;
  /** Одоогийн бөглөсөн утгууд (хавтгай объект). */
  values: Record<string, unknown>;
};

const openDirty = new Map<object, DirtyEntry>();

/** Цонх БОХИРДЛОО (эсвэл утга нь солигдлоо). */
export function markDialogDirty(key: object, entry: DirtyEntry): void {
  openDirty.set(key, entry);
}

/** Цонх хаагдлаа / цэвэрлэгдлээ. */
export function clearDialogDirty(key: object): void {
  openDirty.delete(key);
}

/** Одоо бөглөж байгаа зүйл БАЙНА УУ. */
export function anyDialogDirty(): boolean {
  return openDirty.size > 0;
}

/** Хамгийн СҮҮЛД бохирдсон цонхны агшин зураг (эсвэл `null`).
 *  Нэг агшинд хоёр цонх бөглөгдөх нь бодит хэрэглээнд байхгүй тул нэгийг л
 *  аварна — хоёрыг «аварсан» гэж амлаад нэгийг нь алдахаас дээр. */
export function dirtySnapshot(): DirtyEntry | null {
  let last: DirtyEntry | null = null;
  for (const v of openDirty.values()) last = v;
  return last;
}

/** Тестийн ба гарах урсгалын цэвэрлэгээ. */
export function resetDirtyDialogs(): void {
  openDirty.clear();
}

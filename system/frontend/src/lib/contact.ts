/* ХАРИЛЦАГЧИЙН ГАРЫН ҮСЭГТНҮҮД — «хэнд залгах вэ» гэсэн НЭГ дүрэм (№72, 73).
 *
 * Отгоо эгчийн хуудас бүр гарын үсгийн блокоор дуусдаг, тэнд 2-4 хүн өөрийн
 * албан тушаал, утастайгаа зогсоно:
 *
 *   Бутангууд: Төслийн менежер Н.Батцоож 96590908 · Нярав Н.Соль 99966285 ·
 *              Захирал С.Лхагвасүрэн 99113579
 *
 * ⚠ Тэр ЗАХИРАЛ руу залгадаггүй. Тооцоо нийлж, актад гарын үсэг зурдаг хүн
 * нь НЯРАВ (эсвэл төслийн/талбайн МЕНЕЖЕР). «Авлага цуглуулах» жагсаалтын
 * ☎ холбоос буруу хүн рүү заавал тэр дугаар нь дэмий — хуучин зуршил
 * (гараар дэвтэрээсээ хайх) руу буцна.
 *
 * Дүрэм нь ЭНД, тесттэйгээ: хуудас нь зөвхөн зурна.
 */

export type Contact = {
  id?: number;
  name: string;
  role?: string;
  phone?: string;
  phone2?: string;
  note?: string;
  active?: boolean;
};

/** Албан тушаалын нэршлүүд (№73) — хуудсан дээр яг эдгээр үгс гардаг. */
const RECONCILER_RANK: [RegExp, number][] = [
  // ТООЦОО НИЙЛДЭГ хүн — эхлээд түүн рүү
  [/нярав/i, 0],
  // Талбайн / Төслийн / компанийн менежер — хоёрдугаарт
  [/менежер/i, 1],
];

/** Тухайн албан тушаал нь ТООЦОО НИЙЛДЭГ хүнийх үү. */
export function isReconciler(role: string | null | undefined): boolean {
  return RECONCILER_RANK.some(([re]) => re.test(role || ""));
}

/** Албан тушаалын пил. Гол холбоо нь брэнд (§4 «идэвхтэй, гол үйлдэл»),
 *  бусад нь саарал. Өнгө дангаараа утга зөөхгүй — албан тушаалын ҮГ
 *  пилийн дотор өөрөө зогсоно. */
export function contactRolePill(role: string | null | undefined): string {
  return isReconciler(role) ? "pill-blue" : "pill-grey";
}

function rankOf(role: string | null | undefined): number | null {
  for (const [re, rank] of RECONCILER_RANK) if (re.test(role || "")) return rank;
  return null;
}

/** ЗАЛГАХ ХҮН — байхгүй бол `null` (мөр нь `person`/`phone` дээрээ үлдэнэ).
 *
 *  Идэвхгүй болсон хүн ба УТАСГҮЙ мөр огт нэр дэвшихгүй: залгах жагсаалт
 *  дээр дарагдахгүй дугаар нь тоо төдий. Ижил зэрэгтэй хоёр хүн байвал
 *  хуудсан дээрх ДАРААЛЛААР нь эхнийх. */
export function preferredContact(
  contacts: Contact[] | null | undefined,
): Contact | null {
  let best: Contact | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const c of contacts || []) {
    if (c.active === false || !(c.phone || "").trim()) continue;
    const rank = rankOf(c.role);
    if (rank === null || rank >= bestRank) continue;
    best = c;
    bestRank = rank;
  }
  return best;
}

/** «9911-2233» → «tel:99112233» — зай, зураас утасны програмыг төөрөгдүүлнэ.
 *  Улсын кодын `+` нь утга зөөдөг тул үлдэнэ. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

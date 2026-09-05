/* ТҮР НУУСАН МЭДЭГДЛҮҮД — «АЛГА БОЛСОН» БИШ, «ХОЙШЛУУЛСАН».
 *
 * «Батбаяр ХХК — R-26/07 12 хоног хэтэрлээ» гэсэн мөр өдөр бүр гарч ирнэ.
 * Отгоо тэр хүнтэй ярьж «сарын 15-нд төлнө» гэж тохирсон бол тэр мөр долоо
 * хоног хэрэггүй — атал жагсаалтаас гарах арга байхгүй тул түүний доорх
 * БОДИТ шинэ мэдэгдэл нүднээс гардаг.
 *
 * Сервер нуултыг хүн тус бүрээр хадгална (`notification_states`) ба нуусан
 * мөрүүдийг хариунаасаа ХАСНА — зөвхөн `snoozed_count` буцаана. Тиймээс
 * «юуг нуусан бэ?» гэсэн асуултын хариу дэлгэц дээр байхгүй: нуулт нь
 * УСТГАЛТАЙ адилхан мэдрэгдэнэ.
 *
 * Энэ файл нь тэр асуултын хариуг НЭГ төхөөрөмж дээр хадгална: юуг, хэзээ
 * хүртэл нуусныг тэмдэглэж, «харах» дарахад буцаах товчтойгоо жагсаана.
 * Өөр төхөөрөмжөөс нуусан мөрийг ХУДЛААР амлахгүй — тэдгээр нь тоогоороо
 * л хэлэгдэж, хугацаа нь дуусахад өөрөө буцаж ирнэ.
 */

export type SnoozedNote = {
  kind: string;
  entity_id: number | null;
  /** Мөрөн дээр байсан ЯГ тэр гарчиг — «юуг нуусан бэ?»-ийн хариу. */
  title: string;
  sub?: string;
  /** ISO огноо (сервер буцаана) — хэзээ өөрөө эргэж ирэх вэ. */
  until: string;
};

const KEY = "jz_snoozed";

/** Нэг мөрийн ӨВӨРМӨЦ хаяг — жагсаалтад давхардахгүй. */
export const snoozeId = (n: { kind: string; entity_id: number | null }) =>
  `${n.kind}#${n.entity_id ?? ""}`;

function readAll(): SnoozedNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.kind === "string") : [];
  } catch { return []; }
}

function writeAll(rows: SnoozedNote[]): void {
  try {
    if (rows.length) localStorage.setItem(KEY, JSON.stringify(rows));
    else localStorage.removeItem(KEY);
  } catch { /* хувийн горим — нуулт ажиллана, санамж л алдагдана */ }
}

/** Хугацаа нь дууссан бичлэгүүдийг хаяна: сервер тэднийг аль хэдийн буцаасан. */
export function pruneSnoozed(rows: SnoozedNote[], todayIso: string): SnoozedNote[] {
  return rows.filter((r) => !r.until || r.until > todayIso);
}

/** Нуусан мөрийг САНАНА (хуучин, ижил хаягтай бичлэгийг дарж). */
export function rememberSnooze(n: SnoozedNote, todayIso: string): void {
  const id = snoozeId(n);
  writeAll([...pruneSnoozed(readAll(), todayIso).filter((r) => snoozeId(r) !== id), n]);
}

/** Нуултыг цуцалсан — санамжаас ч гарна. */
export function forgetSnooze(n: { kind: string; entity_id: number | null },
                             todayIso: string): void {
  const id = snoozeId(n);
  writeAll(pruneSnoozed(readAll(), todayIso).filter((r) => snoozeId(r) !== id));
}

/** Энэ төхөөрөмж дээрээс нуусан, ОДООГ ХҮРТЭЛ хүчинтэй мөрүүд. */
export function snoozedNotes(todayIso: string): SnoozedNote[] {
  const kept = pruneSnoozed(readAll(), todayIso);
  writeAll(kept);
  return kept;
}

/** Серверийн тоо ба санамжийн зөрүү — «өөр төхөөрөмжөөс нуусан» мөрүүд.
 *  Тэднийг буцаах товч ХУДАЛ болно (хаягийг нь мэдэхгүй) тул зөвхөн хэлнэ. */
export function elsewhereLine(serverCount: number, known: number): string {
  const rest = Math.max((serverCount || 0) - known, 0);
  return rest > 0
    ? `Өөр төхөөрөмжөөс нуусан ${rest} мөр — хугацаа нь дуусахад өөрөө буцаж ирнэ.`
    : "";
}

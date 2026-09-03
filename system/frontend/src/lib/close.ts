/* ГЭРЭЭ ХААХ ЁСЛОЛ — алхмуудыг ДАТА нь тодорхойлно (H7).
 *
 * Отгоо эгчийн ёслол: гадаа үлдсэнээ шийд (буцаалт эсвэл ДУТАГДУУЛСАН
 * НБҮнээр) → эцсийн ТАСАРХАЙ циклээ нэх → барьцаагаа суутгаж/буцааж
 * цэвэрлэ → «хаав» гэж бич. Систем нь урьд нь зөвхөн СҮҮЛЧИЙН товчийг
 * мэддэг байв.
 *
 * АЛХАМ НЬ БАЙГАА ЗҮЙЛЭЭС ГАРНА: гадаа юу ч байхгүй бол «гадаа үлдэгдэл»
 * алхам ОГТ гарахгүй — хоосон дэлгэц дамжуулах нь ажил нэмнэ.
 *
 * ЦЭВЭР логик: React-гүй, сүлжээгүй, детерминистик.
 */
import { fmt } from "./num";

export type OutRow = {
  material_id: number; material: string;
  grade_id: number; grade: string;
  qty: number;
  /** ДУТАГДУУЛСАН гарц — дансны/нөхөн үнэ (R13) */
  nb_price: number; writeoff_amount: number;
  /** ХУДАЛДАА БОЛГОХ гарц — худалдах үнэ (R32-ийн хоёр дахь шатлал) */
  sale_price: number; sale_amount: number;
};

/** ХААЛТЫН ТАСАРХАЙ ЦОНХТОЙ ЗӨРЧИЛДСӨН гар хоног (H5-ийн сүүлчийн миль).
 *
 *  Хаах агшинд эцсийн цикл ТАСАРНА. Тэр богино цонх нь падангийн цонхыг
 *  богиносгодог тул бүртгэх агшинд тохирсон 20 хоног энд багтахаа болино.
 *  Урьд нь хөдөлгүүр түүнийг чимээгүй хумиж, гарын үсэгтэй 20 нь хавсралт
 *  дээр 16 болж хэвлэгддэг байв. Одоо энэ нь ТҮҮНИЙ ШИЙДВЭР болно. */
export type DayConflict = {
  line_id: number; movement_id: number; date: string;
  material_id: number; material: string;
  grade_id: number; grade: string;
  qty: number;
  /** Тохирсон тоо (гарын үсэг зурсан нь энэ) */
  agreed_days: number;
  /** Хаалтын огноогоор багтах тоо */
  window_days: number;
  /** ЭНЭ МӨРИЙН нэг хоногийн ₮ — тоо × тариф */
  day_amount: number;
  agreed_amount: number; window_amount: number;
  /** Хоёр замын ₮ зөрүү */
  diff_amount: number;
};

export type ClosePreview = {
  close_date: string;
  close_error?: string | null;
  can_close: boolean;
  outstanding: OutRow[];
  day_conflicts: DayConflict[];
  final_invoices: { no: string; cycle_start: string; cycle_end: string; label: string;
                    rent_amount: number; charge_amount: number; vat_amount: number;
                    total: number }[];
  unpaid: number;
  balance: number;
  penalty_booked: number;
  penalty_unbooked: number;
  deposit: { amount: number; status: string; settled: boolean;
             applied: number; returned: number };
};

export type StepKey = "goods" | "final" | "deposit" | "confirm";

export const CLOSE_STEP_TITLES: Record<StepKey, string> = {
  goods: "Гадаа үлдэгдэл",
  final: "Эцсийн тооцоо",
  deposit: "Барьцаа",
  confirm: "Гэрээ хаах",
};

export type Step = { key: StepKey; title: string };

/** Энэ гэрээнд ЯМАР алхмууд байх вэ — дата нь өөрөө хэлнэ. */
export function closeSteps(p: ClosePreview | null | undefined): Step[] {
  const keys: StepKey[] = [];
  if ((p?.outstanding?.length || 0) > 0) keys.push("goods");
  keys.push("final");
  if ((p?.deposit?.amount || 0) > 0 && !p?.deposit?.settled) keys.push("deposit");
  keys.push("confirm");
  return keys.map((key) => ({ key, title: CLOSE_STEP_TITLES[key] }));
}

/** Алхмын байрлал (0-оос). Байхгүй бол −1 — алга болсон алхам зай үлдээхгүй. */
export function stepIndex(steps: Step[], key: StepKey): number {
  return steps.findIndex((s) => s.key === key);
}

/** Гадаа үлдсэн НИЙТ ширхэг. */
export function outstandingQty(rows: OutRow[] | null | undefined): number {
  return (rows || []).reduce((s, r) => s + (r.qty || 0), 0);
}

/** Бүгдийг ДУТАГДУУЛСАН гэж бичвэл нэхэгдэх дүн (R13) — сохроор шийдэхгүйн тулд. */
export function outstandingWriteoff(rows: OutRow[] | null | undefined): number {
  return (rows || []).reduce((s, r) => s + (r.writeoff_amount || 0), 0);
}

/** Бүгдийг ХУДАЛДВАЛ нэхэгдэх дүн — дутагдуулсны хажууд зогсох ХОЁР ДАХЬ тоо.
 *
 *  Хоёр үнэ ЗӨРНӨ (69,500 ба 58,000) тул аль гарцыг сонгох нь мөнгөний
 *  шийдвэр. Хоёуланг нь зэрэг харуулж байж л тэр шийдвэр Отгоогийнх болно. */
export function outstandingSale(rows: OutRow[] | null | undefined): number {
  return (rows || []).reduce((s, r) => s + (r.sale_amount || 0), 0);
}

/** Алхам цааш явахыг ЗӨВШӨӨРӨХГҮЙ шалтгаан — байхгүй бол `null`.
 *
 *  Барьцаа нь ХЭЗЭЭ Ч түгжихгүй: Отгоо барьцааг дараа нь ч тооцож болно
 *  (алгасах нь анхааруулгатай сонголт). Гадаа бараа болон огнооны зөрчил нь
 *  түгжинэ — тэдгээр нь цаасыг өөртэй нь зөрчилдүүлнэ. */
export function stepBlock(p: ClosePreview | null | undefined,
                          key: StepKey): string | null {
  if (!p) return null;
  const out = outstandingQty(p.outstanding);
  if ((key === "goods" || key === "confirm") && out > 0) {
    // ГУРВУУЛАНГ нэрлэнэ (§3 H7): нэрлээгүй гарц нь БАЙХГҮЙ гарц — Отгоо
    // худалдаа болгож болохоо мэдэхгүй бол дутагдуулсан гэж бичээд өнгөрнө.
    return `Гадаа ${fmt(out)}ш шийдэгдээгүй байна — буцаалт, дутагдуулсан `
         + `эсвэл худалдаа болгосон гэж бүртгэнэ үү.`;
  }
  if (key === "confirm" && p.close_error) return p.close_error;
  return null;
}

/* ---------- ГАР ХОНОГИЙН СОНГОЛТ (H5) ----------
 *
 * ГУРВАН ЗАМ, гуравуулаа НЭРЛЭГДСЭН: тохирсон тоогоо нэх (ӨГӨГДМӨЛ — гарын
 * үсэг зурсан нь тэр), цонхны тоог нэх, эсвэл ӨӨР тоо бичих. Нэрлээгүй гарц
 * нь байхгүй гарц (§3 H7-ийн дүрэм гадаа үлдэгдэлтэй ижил).
 *
 * Дүн нь ҮРЖВЭР: хоног × нэг хоногийн ₮. Отгоо эгчийн арифметик — цаасан
 * дээр дахин гаргаад шалгаж болно. */

export type DayMode = "agreed" | "window" | "other";

/** `text` нь ЗӨВХӨН «өөр тоо» замд утгатай — бичиж байх зуур бүтэн биш
 *  байж болох тул хоногийг `pickedDays` шийднэ, түүхий бичиг биш. */
export type DayPick = { mode: DayMode; text: string };

/** Мөр бүрийн эхлэлийн сонголт — ҮРГЭЛЖ ТҮҮНИЙ тохирсон тоо. */
export function defaultDayPicks(rows: DayConflict[] | null | undefined)
    : Record<number, DayPick> {
  const out: Record<number, DayPick> = {};
  for (const r of rows || []) out[r.line_id] = { mode: "agreed", text: "" };
  return out;
}

/** Сонголт → ҮНЭХЭЭР нэхэгдэх хоног.
 *
 *  «Өөр тоо» нь хоосон эсвэл утгагүй байвал ТОХИРСОН тоо руугаа унана —
 *  бичиж эхлээгүй нүд нь шийдвэр биш. */
export function pickedDays(row: DayConflict, p?: DayPick | null): number {
  if (!p || p.mode === "agreed") return row.agreed_days;
  if (p.mode === "window") return row.window_days;
  const n = Math.round(Number(p.text));
  return p.text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : row.agreed_days;
}

/** Сонголт → тэр мөрийн ₮. */
export function pickedAmount(row: DayConflict, p?: DayPick | null): number {
  return pickedDays(row, p) * row.day_amount;
}

/** Сервер рүү явах шийдвэрүүд — мөр БҮРийг ИЛЭРХИЙ нэрлэнэ.
 *
 *  Өгөгдмөлөө хэвээр үлдээсэн мөрийг ч илгээнэ: сервер дээр «сонгоогүй» нь
 *  мөн л түүний тоо руу унадаг ч, ИЛЭРХИЙ илгээсэн тоо нь audit дээр
 *  «ТЭР баталсан» гэж мөрөө үлдээнэ. */
export function dayChoicePayload(rows: DayConflict[] | null | undefined,
                                 picks: Record<number, DayPick>) {
  return (rows || []).map((r) => ({ line_id: r.line_id,
                                    days: pickedDays(r, picks[r.line_id]) }));
}

/** «12 хоног × 13,200₮ = 158,400₮» — задлагдсан үржвэр, нуугдсан тоогүй. */
export function dayLineText(days: number, dayAmount: number): string {
  return `${fmt(days)} хоног × ${fmt(dayAmount)}₮ = ${fmt(days * dayAmount)}₮`;
}

/** Сонголт нь эцсийн нэхэмжлэлийг ХЭД хөдөлгөх вэ (өгөгдмөлөөс).
 *
 *  Сервер ЭЦСИЙН тоог өөрөө хэлнэ; энэ нь зөвхөн мөрөн дээрх «одоо −52,800₮»
 *  гэсэн тэмдэг — шийдвэрийн үнэ нь товч дарахаас ӨМНӨ харагдана. */
export function pickDelta(row: DayConflict, p?: DayPick | null): number {
  return (pickedDays(row, p) - row.agreed_days) * row.day_amount;
}

/** Мөрөн дээрх хоёр гарц → буцаалтын цонхны урьдчилсан утга.
 *
 *  «Дутагдуулсан» нь буцаалтын мөр дээр АКТЛАХ тоог бүтнээр нь тавина:
 *  бараа ирээгүй ч тооцоо нь хаагдах ёстой — НБҮнээр нэхэгдэж өрөнд нэмэгдэнэ. */
export function returnPrefill(row: OutRow, mode: "return" | "writeoff") {
  return { key: `${row.material_id}:${row.grade_id}`, ret: row.qty,
           writeoff: mode === "writeoff" ? row.qty : 0 };
}

export type Prefill = { key: string; ret: number; writeoff: number };

/** «Худалдаа болгох» → худалдааны цонхны урьдчилсан утга.
 *
 *  Буцаалтын `Prefill`-ээс ЗОРИУД тусдаа: худалдаа бол БУЦААЛТ БИШ. Тэр
 *  барааг бид дахин хэзээ ч харахгүй — «очих зэрэглэл», «засварт», «актлах»
 *  гэсэн асуултууд нь утгагүй болно. Тусдаа цонх, тусдаа урьдчилсан утга. */
export function salePrefill(row: OutRow) {
  return { key: `${row.material_id}:${row.grade_id}`, qty: row.qty };
}

export type SalePrefill = { key: string; qty: number };

/** Худалдааны урьдчилсан тоог маягтын мөрүүд рүү тараана (`applyPrefill`-ийн ах).
 *
 *  Нэг материал ХОЁР падангаар гадаа байвал маягт дээр хоёр мөр болно;
 *  гадаа үлдэгдэл нь тэдгээрийн НИЙЛБЭР тул тоо нь дараалан дүүрнэ. */
export function applySalePrefill<T extends { material_id: number; grade_id: number;
                                             qty: number; sell: number }>(
    rows: T[], p: SalePrefill | null | undefined): T[] {
  if (!p) return rows;
  let left = p.qty;
  return rows.map((r) => {
    if (`${r.material_id}:${r.grade_id}` !== p.key || left <= 0) return r;
    const take = Math.min(left, r.qty);
    left -= take;
    return { ...r, sell: take };
  });
}

/** Урьдчилсан тоог маягтын мөрүүд рүү тарааж БУЦААНА (шинэ жагсаалт).
 *
 *  Нэг материал ХОЁР падангаар (330₮ ба 300₮) гадаа байвал маягт дээр хоёр
 *  мөр болно; гадаа үлдэгдэл нь тэдгээрийн НИЙЛБЭР тул тоо нь мөрүүд рүү
 *  дараалан дүүрнэ. Нийлбэр нь ЯГ хүссэн тоо байх нь чухал — эс бөгөөс
 *  «40ш дутагдуулсан» гэж дараад 30ш л бичигдэнэ. */
export function applyPrefill<T extends { material_id: number; grade_id: number;
                                         qty: number; ret: number; writeoff: number }>(
    rows: T[], p: Prefill | null | undefined): T[] {
  if (!p) return rows;
  let ret = p.ret;
  let wo = p.writeoff;
  return rows.map((r) => {
    if (`${r.material_id}:${r.grade_id}` !== p.key || ret <= 0) return r;
    const takeRet = Math.min(ret, r.qty);
    const takeWo = Math.min(wo, takeRet);
    ret -= takeRet;
    wo -= takeWo;
    return { ...r, ret: takeRet, writeoff: takeWo };
  });
}

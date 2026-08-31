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
  qty: number; nb_price: number; writeoff_amount: number;
};

export type ClosePreview = {
  close_date: string;
  close_error?: string | null;
  can_close: boolean;
  outstanding: OutRow[];
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
    return `Гадаа ${fmt(out)}ш шийдэгдээгүй байна — буцаалт эсвэл дутагдуулсан гэж бүртгэнэ үү.`;
  }
  if (key === "confirm" && p.close_error) return p.close_error;
  return null;
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

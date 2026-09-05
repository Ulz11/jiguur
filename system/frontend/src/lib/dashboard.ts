/* УДИРДЛАГЫН ТӨВИЙН ЦЭВЭР ЛОГИК — React-гүй, сүлжээгүй, тесттэй.
 *
 * Дашбоард нь 640 мөр JSX; тэр дотор нуугдсан тооцоолол нь ХЭЗЭЭ Ч
 * шалгагддаггүй. Хамгийн үнэтэй жишээ: насжилтын доод мөр `d.aging[3]`-ыг
 * «90+» гэж уншдаг байв. Сервер «Хугацаа болоогүй» гэсэн ШИНЭ хувинг ЭХЭНД
 * нэмэхэд тэр индекс «61–90» руу гулсаж, «90+ хоног хэтэрсэн» гэсэн шошгын
 * доор ОГТ ӨӨР тоо зогссон — алдаа нь дуугардаггүй, зөвхөн ХУДАЛ хариулдаг.
 *
 * Тиймээс хувин нь ДУГААРААР биш ТҮЛХҮҮРЭЭР олдоно, дүрэм нь энд.
 */
import { fmt } from "./num";

export type AgingRow = { key: string; label: string; amount: number };

/** Хувингийн КАНОН дараалал — сервертэй (`routers/dashboard.py`) нэг эх. */
export const AGING_KEYS = ["not_due", "0_30", "31_60", "61_90", "90_plus"] as const;
export type AgingKey = (typeof AGING_KEYS)[number];

/** Хувин бүрийн НЭР — сервер шошгогүй хариу буцаавал (кэшлэгдсэн хуучин
 *  хуудас) мөр нь нэрээ эндээс авна. */
export const AGING_LABEL: Record<string, string> = {
  not_due: "Хугацаа болоогүй", "0_30": "0–30 хоног",
  "31_60": "31–60", "61_90": "61–90", "90_plus": "90+",
};

/** Хувингийн ӨНГӨ — ТҮЛХҮҮРЭЭР. Хувин нэмэгдэхэд өнгө нь гулсахгүй.
 *
 *  «Хугацаа болоогүй» нь ХОЦРОЛТ БИШ, ХҮЛЭЭЛТ — тиймээс саарал/цэнхэр
 *  (тайван), улаан руу чиглэсэн шатанд ОРОХГҮЙ. Дараа нь хоцролт гүнзгийрэх
 *  тусам ногоон → цэнхэр → улбар → улаан. */
const AGING_COLOR: Record<string, string> = {
  not_due: "#8A94A6", "0_30": "#1F8B69", "31_60": "#253886",
  "61_90": "#F88712", "90_plus": "#C9363B",
};

export function agingColor(key: string): string {
  return AGING_COLOR[key] ?? "#8A94A6";
}

/** Серверийн хувингуудыг КАНОН дараалалд оруулна.
 *
 *  Түлхүүргүй хуучин хариу (4 элемент) ирвэл дарааллаар нь тааруулна —
 *  хуудас нурахгүй, зөвхөн «Хугацаа болоогүй» мөр байхгүй байна. */
export function agingRows(raw: any): AgingRow[] {
  const list: any[] = Array.isArray(raw) ? raw : [];
  const hasKeys = list.some((r) => r && typeof r.key === "string");
  if (!hasKeys) {
    /* Хуучин хариу: [0–30, 31–60, 61–90, 90+] — «Хугацаа болоогүй» байхгүй. */
    const legacy = AGING_KEYS.slice(1);
    return list.slice(0, legacy.length).map((r, i) => ({
      key: legacy[i],
      label: r?.label || AGING_LABEL[legacy[i]],
      amount: Math.max(Number(r?.amount) || 0, 0),
    }));
  }
  const by = new Map<string, any>(list.filter((r) => r?.key).map((r) => [r.key, r]));
  const known = AGING_KEYS.filter((k) => by.has(k)).map((k) => ({
    key: k as string,
    label: by.get(k).label || AGING_LABEL[k],
    amount: Math.max(Number(by.get(k).amount) || 0, 0),
  }));
  /* Сервер ШИНЭ хувин нэмбэл түүнийг ЧИМЭЭГҮЙ хаяхгүй — эцэст нь наана. */
  const extra = list.filter((r) => r?.key && !(AGING_KEYS as readonly string[]).includes(r.key))
    .map((r) => ({ key: r.key, label: r.label || r.key,
                   amount: Math.max(Number(r.amount) || 0, 0) }));
  return [...known, ...extra];
}

/** «Хугацаа хэтэрсэн» картын хоёр дахь мөр.
 *
 *  «12 нэхэмжлэл» гэдэг тоо нь ХЭДЭН ХҮН гэдгийг хэлдэггүй — атал залгах
 *  ажил нь ХҮНЭЭР хэмжигддэг (нэг харилцагчийн 6 нэхэмжлэл = НЭГ утас). */
export function overdueTile(invoices: number, clients: number | undefined | null): string {
  const inv = `${fmt(invoices || 0)} нэхэмжлэл`;
  return clients == null ? inv : `${inv} · ${fmt(clients)} харилцагч`;
}

/** Насжилтын ХӨЛИЙН МӨР — хувингуудын нийлбэр нь ЯАГААД авлагын нийт
 *  дүнтэй тэнцэхгүй байгааг хэлнэ.
 *
 *  Насжилт нь ЗӨВХӨН нэхэмжилсэн мөнгийг хуваадаг: одоогийн циклийн
 *  хуримтлал нь хараахан нэхэмжлэл болоогүй тул ямар ч хувинд суудаггүй.
 *  Тэр зөрүү нь тайлбаргүй бол Отгоо «энэ график буруу байна» гэж уншина. */
export function agingFootnote(invoiced: number, uninvoiced: number): string {
  const inv = Math.max(invoiced || 0, 0);
  const un = Math.max(uninvoiced || 0, 0);
  if (un <= 0.5) return "";
  return `нэхэмжилсэн ${fmt(inv)}₮ + нэхэмжлэгдээгүй ${fmt(un)}₮ = ${fmt(inv + un)}₮`;
}

/** «5 нуугдсан · харах» — нуусан мөр АЛГА БОЛООГҮЙ гэдгийг хэлнэ.
 *  Нуулт нь эргэж болдог гэдгийг мэдэхгүй хүн түүнийг дарахаас айна. */
export function snoozedLabel(n: number | undefined | null): string {
  return (n || 0) > 0 ? `${fmt(n!)} нуугдсан · харах` : "";
}

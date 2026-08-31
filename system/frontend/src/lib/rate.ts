/* ТАРИФЫН ДАХИН ТОХИРОЛТ — «хэзээнээс» гэдэг ГАНЦ асуулт (R3 / H6).
 *
 * Отгоо эгчийн Excel-д тариф циклүүдийн хооронд дахин тохирогддог (Мөнхболд
 * 300 → 350 → 450) бөгөөс түүний семантик нэг мөр: ШИНЭ ТАРИФ ДАРААГИЙН
 * ЦИКЛЭЭС, гарын үсэг зурсан өнгөрсөн нь ХЭВЭЭР.
 *
 * Огноог UI ТААМАГЛАХГҮЙ: гурван хил (гэрээний эхлэл / энэ цикл / дараагийн
 * цикл) СЕРВЕРЭЭС ирнэ (`cycle_bounds`) — тэнд цонхыг гаргадаг ЯГ тэр код
 * сууна. Дэлгэц дээр «дараагийн цикл» гэж бичээд сервер өөр өдөр ойлговол
 * Отгоо хоёр өөр тоо хараад аль нь ч итгэл хүлээхээ болино.
 *
 * ЦЭВЭР логик: React-гүй, сүлжээгүй, детерминистик.
 */
import { fmt } from "./num";

export type CycleBounds = {
  contract_start?: string | null;
  current_start?: string | null;
  next_start?: string | null;
};

export type EffKey = "next" | "current" | "history";

export type EffOption = {
  value: EffKey;
  date: string;
  label: string;
  /** Нэхэмжилсэн циклд хүрч БОЛЗОШГҮЙ — цонх нь эхлээд зөрүүг харуулна */
  restates: boolean;
};

/** Түүх рүү хүрч болзошгүй сонголтуудын анхааруулга — нэг л газар бичигдэнэ. */
export const RATE_RESTATE_WARN =
  "Энэ сонголт нэхэмжилсэн циклүүдэд хүрвэл тэдгээр дахин бодогдоно — " +
  "зөрүүг нь эхлээд харуулна.";

/** Сонголт нь гарын үсэгтэй өнгөрсөнд хүрэх үү. */
export function restatesHistory(v: EffKey): boolean {
  return v !== "next";
}

const TITLES: Record<EffKey, string> = {
  next: "Дараагийн циклээс",
  current: "Энэ циклээс",
  history: "Бүх түүхэнд",
};

/** Гурван сонголт — эрэмбэ нь утгатай: ДАРААГИЙН ЦИКЛ нь Отгоогийн анхны утга.
 *
 *  Огноо нь давхцвал (эхний циклд явж буй гэрээнд «энэ цикл» = «бүх түүх»)
 *  НЭГ л мөр үлдэнэ: ижил үр дүнтэй хоёр товч нь сонголт биш, эргэлзээ. */
export function effectiveOptions(b: CycleBounds | null | undefined): EffOption[] {
  const by: Record<EffKey, string> = {
    next: (b?.next_start || "").trim(),
    current: (b?.current_start || "").trim(),
    history: (b?.contract_start || "").trim(),
  };
  const out: EffOption[] = [];
  const seen = new Set<string>();
  for (const value of ["next", "current", "history"] as EffKey[]) {
    const date = by[value];
    if (!date || seen.has(date)) continue;
    seen.add(date);
    out.push({ value, date, label: `${TITLES[value]} — ${date}`,
               restates: restatesHistory(value) });
  }
  return out;
}

/** Сонголт → огноо (сервер рүү явах `effective_from`). */
export function effectiveDate(b: CycleBounds | null | undefined, v: EffKey): string {
  const o = effectiveOptions(b).find((x) => x.value === v);
  return o ? o.date : "";
}

/** Дараагийн өөрчлөлтийн ХҮРЭЭ — падангийн ТӨРӨЛХИЙН тариф (`orig_rate`).
 *
 *  Харагдаж буй тариф нь аль хэдийн өөрчлөгдсөн байж болно; хүрээг түүгээр
 *  тавибал «330₮-ийн падан» гэсэн үе олдохоо болино. Төрөлх нь мэдэгдэхгүй
 *  (хуучин хариу) бол хүрээ огт тавихгүй — тухайн материалын БҮГД хөдөлнө. */
export function rateChangeScope(row: { orig_rate?: number | null;
                                       [k: string]: unknown }): number | undefined {
  return row?.orig_rate == null ? undefined : row.orig_rate;
}

/** Жагсаалтын мөр: «330₮ → 350₮ · 2026-04-19-ээс». */
export function rateChangeText(rc: { old_rate?: number | null; new_rate: number;
                                     effective_from: string }): string {
  const from = rc.old_rate == null ? "бүх тариф" : `${fmt(rc.old_rate)}₮`;
  return `${from} → ${fmt(rc.new_rate)}₮ · ${rc.effective_from}-ээс`;
}

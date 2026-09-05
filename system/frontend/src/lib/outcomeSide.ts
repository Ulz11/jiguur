import { fmt } from "./num";

/* ҮР ДҮНГИЙН ЗУРВАС — ХАЖУУГИЙН ХУУДСУУДЫНХ (Зээл · Цалин · Бартер ·
 * Механизм · Тохиргоо).
 *
 * `lib/outcome.ts` нь гэрээ ба харилцагчийн хуудсыг үйлчилдэг. Энэ файл нь
 * ЯГ ижил дүрмээр (ЮУ болов — хэн/хэдэн ₮ · ХЭЗЭЭ · тоо ХЭДЭЭС ХЭД болов)
 * үлдсэн таван хуудсанд ярина: тэдгээр нь өнөөдөр бүгд 3.2 секундын
 * мэдэгдлээр л ярьдаг байв.
 *
 * Хамгийн ХУРЦ жишээ нь ЗЭЭЛ: сервер төлөлт дээр `closed: true` буцаадаг
 * (үлдэгдэл 0 боллоо ⇒ автоматаар хаагдав) ба төлөлт устгахад
 * `reopened: true`. Хоёулаа ХУУДАС ӨӨРӨӨ шийдээгүй үйлдэл: Отгоо «Бүртгэх»
 * дараад буцаж ирэхэд зээл нь жагсаалтаас АЛГА болсон байдаг. Тэр
 * шийдвэрийг зурвас ҮГЭЭР үлдээнэ.
 */

export type Outcome = { text: string };

const tug = (n: number) => fmt(n) + "₮";

/** «Гарчиг — хэсэг · хэсэг». Хоосон хэсэг өөрөө унана (`outcome.ts`-тэй ижил). */
function line(head: string, parts: (string | false | null | undefined)[]): string {
  const kept = parts.filter((p): p is string => !!p && p.trim() !== "");
  return kept.length ? `${head} — ${kept.join(" · ")}` : head;
}

/** «үлдэгдэл 2,040,000,000₮ → 2,030,000,000₮» — тоо хөдлөөгүй бол ХООСОН. */
export function balanceShift(before: number, after: number): string {
  if (Math.round(before) === Math.round(after)) return "";
  return `үлдэгдэл ${tug(before)} → ${tug(after)}`;
}

/* ══════ ЗЭЭЛ ══════ */

/** Төлөлт/нэмэлт олголт. `closed` нь СЕРВЕРИЙН шийдвэр — үүнийг зурвас үүрнэ. */
export function loanPayOutcome(f: {
  name: string; amount: number; part: "interest" | "principal" | "topup";
  date: string; before: number; after: number; closed?: boolean;
}): Outcome {
  const head = f.part === "topup" ? "Нэмэлт олголт бүртгэгдлээ" : "Төлөлт бүртгэгдлээ";
  const what = f.part === "interest" ? "хүү" : f.part === "principal" ? "үндсэн" : "олголт";
  return {
    text: line(head, [f.name.trim(), `${tug(f.amount)} ${what}`, f.date,
                      balanceShift(f.before, f.after),
                      f.closed && "зээл хаагдлаа — үлдэгдэл 0"]),
  };
}

/** Автомат хаалт — ГАНЦААРАА зогсох өгүүлбэр (жагсаалтаас алга болсны учир). */
export function loanClosedOutcome(name: string): Outcome {
  return { text: line("Зээл хаагдлаа — үлдэгдэл 0", [name.trim()]) };
}

/** Төлөлт устгаснаар үлдэгдэл ЭРГЭЖ гарсан ⇒ сервер зээлийг сэргээв. */
export function loanReopenedOutcome(name: string, balance: number): Outcome {
  return { text: line("Зээл сэргэлээ", [name.trim(), `үлдэгдэл ${tug(balance)} болсон тул нээгдэв`]) };
}

export function loanPayDeletedOutcome(f: {
  name: string; amount: number; part: string; date: string;
  before: number; after: number; reopened?: boolean;
}): Outcome {
  const head = f.part === "topup" ? "Нэмэлт олголт устгагдлаа" : "Төлөлт устгагдлаа";
  return {
    text: line(head, [f.name.trim(), tug(f.amount), f.date,
                      balanceShift(f.before, f.after),
                      f.reopened && "зээл сэргэлээ"]),
  };
}

export function loanStatusOutcome(name: string, closing: boolean, balance: number): Outcome {
  return closing
    ? { text: line("Зээл хаагдлаа", [name.trim(), `үлдэгдэл ${tug(balance)}`,
                                     "сарын дарамтаас хасагдав"]) }
    : { text: line("Зээл сэргэлээ", [name.trim(), `үлдэгдэл ${tug(balance)}`,
                                     "сарын хүү дахин тооцогдоно"]) };
}

export function loanAddedOutcome(name: string, principal: number, rate: number): Outcome {
  return { text: line("Зээл бүртгэгдлээ", [name.trim(), tug(principal), `${rate}%/сар`]) };
}

/* ══════ ЦАЛИН ══════ */

export function salaryRunOutcome(f: {
  period: string; half: number; people: number; net: number;
}): Outcome {
  return {
    text: line("Бодолт үүслээ", [`${f.period} · ${f.half}-р хагас`,
                                 `${f.people} хүн`, `гарт олгох ${tug(f.net)}`]),
  };
}

export function salaryPaidOutcome(f: {
  period: string; half: number; net: number; date: string;
}): Outcome {
  return {
    text: line("Цалин олгогдлоо", [`${f.period} · ${f.half}-р хагас`,
                                   tug(f.net), f.date, "зардалд тусав"]),
  };
}

export function salaryRunDeletedOutcome(f: {
  period: string; half: number; people: number; net: number;
}): Outcome {
  return {
    text: line("Бодолт устгагдлаа", [`${f.period} · ${f.half}-р хагас`,
                                     `${f.people} хүн`, tug(f.net),
                                     "дахин бодож болно"]),
  };
}

export function employeeOutcome(action: "add" | "off" | "on", f: {
  name: string; roleTitle?: string; pay?: string;
}): Outcome {
  const head = action === "add" ? "Ажилтан бүртгэгдлээ"
             : action === "off" ? "Ажилтан жагсаалтаас хасагдлаа"
             : "Ажилтан жагсаалтад буцлаа";
  return { text: line(head, [f.name.trim(), f.roleTitle?.trim(), f.pay?.trim()]) };
}

/* ══════ БАРТЕР ══════ */

export function barterSellOutcome(f: {
  name: string; amount: number; valueIn: number; date: string;
}): Outcome {
  const gain = Math.round(f.amount - f.valueIn);
  return {
    text: line("Борлуулалт бүртгэгдлээ",
               [f.name.trim(), tug(f.amount), f.date,
                `${gain >= 0 ? "ашиг" : "алдагдал"} ${gain >= 0 ? "+" : "−"}${tug(Math.abs(gain))}`]),
  };
}

export function barterSavedOutcome(isEdit: boolean, f: {
  name: string; valueIn: number; dateIn: string;
}): Outcome {
  return {
    text: line(isEdit ? "Хөрөнгө засагдлаа" : "Хөрөнгө бүртгэгдлээ",
               [f.name.trim(), tug(f.valueIn), `орж ирсэн ${f.dateIn}`]),
  };
}

export function barterToStockOutcome(f: {
  name: string; material: string; grade: string; qty: number;
}): Outcome {
  return {
    text: line("Агуулахын нөөцөд орлоо",
               [f.name.trim(), `${f.material} (${f.grade})`, `${fmt(f.qty)}ш`]),
  };
}

/* ══════ МЕХАНИЗМ ══════ */

export function invoiceCreatedOutcome(f: {
  no: string; client: string; rows: number; grandTotal: number;
}): Outcome {
  return {
    text: line("Нэхэмжлэл үүслээ", [`№${f.no}`, f.client.trim(),
                                    `${f.rows} мөр`, tug(f.grandTotal)]),
  };
}

/* ══════ ТОХИРГОО ══════ */

export function settingsSavedOutcome(changes: string[]): Outcome {
  const kept = changes.filter((c) => c.trim() !== "");
  return kept.length
    ? { text: line("Тохиргоо хадгалагдлаа", kept) }
    : { text: "Тохиргоо хадгалагдлаа — өөрчлөлтгүй" };
}

/** «Механизмын НӨАТ 0% → 10%» — юуг юу болгосныг НЭРЛЭНЭ. */
export function settingChange(label: string, before: string, after: string): string {
  const b = (before ?? "").trim();
  const a = (after ?? "").trim();
  if (b === a) return "";
  return `${label} ${b || "хоосон"} → ${a || "хоосон"}`;
}

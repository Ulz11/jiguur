import { fmt } from "./num";

/* ҮР ДҮНГИЙН ЗУРВАС — ХИЙГДСЭН ЗҮЙЛ ДЭЛГЭЦЭН ДЭЭР ҮЛДЭНЭ.
 *
 * Отгоо эгч дэлгэц дээр ӨНГӨРЧ БУЙ зүйлийг анзаардаггүй: `ui.tsx`-ийн
 * амжилтын мэдэгдэл 3.2 секундын дараа өөрөө арилдаг ба дараагийн мэдэгдэл
 * түүнийг дардаг. Тэр «Бүртгэх» дараад цаасаа эргүүлж, утсаа авч, буцаж
 * ирэхэд дэлгэц нь юу ч болоогүй мэт зогсож байна — «дараад юу ч болсонгүй»
 * гэсэн мэдрэмж ЯГ эндээс төрдөг.
 *
 * Тиймээс мутаци бүрийн дараа гэрээний хуудсанд ЗУРВАС үлдэнэ: ямар үйлдэл,
 * ХЭДЭН ширхэг, ХЭЗЭЭ, мөнгө нь ХЭДЭЭС ХЭД болов — тоонуудтайгаа. Тэр
 * зурвас ӨӨРӨӨ арилахгүй: «Хаах» дартал, эсвэл өөр хуудас руу явтал зогсоно.
 *
 * Энэ файл нь тэр өгүүлбэрийн ЦЭВЭР логик (React-гүй, сүлжээгүй) — үг нь
 * НЭГ газар амьдарна, эс бөгөөс арван цонх арван өөр өгүүлбэр зохионо.
 */

/** Зурвасын мөр ба (сонголтоор) ТОДРУУЛАХ шинэ мөрийн түлхүүр. */
export type Outcome = { text: string; mark?: string };

const tug = (n: number) => fmt(n) + "₮";

/** Шинээр төрсөн мөрийн түлхүүр — хуудас түүнийг олж тодруулна. */
export function freshMark(kind: "mv" | "pay" | "akt" | "entry" | "note" | "contact",
                          id: number | null | undefined): string | undefined {
  return id == null ? undefined : `${kind}-${id}`;
}

/** «өдрийн дүн 1,229,460₮ → 1,224,510₮» — ХОЁР тоог хамт.
 *
 *  Ганц тоо («одоо 1,224,510₮») нь өөрчлөлтийг ХЭЛДЭГГҮЙ: Отгоо өмнөх тоог
 *  санахгүй тул зөрүүг өөрөө бодож чадахгүй. Тоо хөдлөөгүй бол мөр огт
 *  гарахгүй — ижил хоёр тоо нь зөвхөн «аль нь үнэн бэ» гэсэн асуулт төрүүлнэ. */
export function dayShift(before: number, after: number): string {
  if (Math.round(before) === Math.round(after)) return "";
  return `өдрийн дүн ${tug(before)} → ${tug(after)}`;
}

/** «Гарчиг — хэсэг · хэсэг · хэсэг». Хоосон хэсэг өөрөө унана. */
function line(head: string, parts: (string | false | null | undefined)[]): string {
  const kept = parts.filter((p): p is string => !!p && p.trim() !== "");
  return kept.length ? `${head} — ${kept.join(" · ")}` : head;
}

export type MoveFacts = {
  qty: number;
  date: string;
  dayBefore: number;
  dayAfter: number;
  /** Үйлдвэрийн даргад ₮ ОРОХГҮЙ — түүний дэлгэц ширхэг дээр зогсоно. */
  seesMoney: boolean;
  movementId?: number | null;
};

/** «Буцаалт бүртгэгдлээ — 15ш · 2026-09-05 · өдрийн дүн 1,229,460₮ → 1,224,510₮» */
export function returnOutcome(f: MoveFacts): Outcome {
  return {
    text: line("Буцаалт бүртгэгдлээ",
               [`${fmt(f.qty)}ш`, f.date, f.seesMoney && dayShift(f.dayBefore, f.dayAfter)]),
    mark: freshMark("mv", f.movementId),
  };
}

/** Олголт нь ХҮЛЭЭЛТЭЭ өөрөө хэлнэ — нөөц ч, тооцоо ч хараахан хөдлөөгүй. */
export function issueOutcome(f: MoveFacts): Outcome {
  const shift = f.seesMoney ? dayShift(f.dayBefore, f.dayAfter) : "";
  const wait = shift
    ? `дарга «Ачсан ✓» дарсны дараа ${shift} болно`
    : "дарга «Ачсан ✓» дарсны дараа тооцоонд орно";
  return {
    text: line("Нэмэлт олголт бүртгэгдлээ", [`${fmt(f.qty)}ш`, f.date, wait]),
    mark: freshMark("mv", f.movementId),
  };
}

/** Худалдаа — түрээс зогсож, дүн нь нэхэмжлэлд нэмэгдэнэ. */
export function saleOutcome(f: {
  qty: number; date: string; total: number; seesMoney: boolean; movementId?: number | null;
}): Outcome {
  return {
    text: line("Худалдаа бүртгэгдлээ",
               [`${fmt(f.qty)}ш`, f.date,
                f.seesMoney ? `нэхэмжлэлд ${tug(f.total)} нэмэгдэв` : "түрээс зогсов"]),
    mark: freshMark("mv", f.movementId),
  };
}

/** Төлбөр — ХЭДИЙГ нэхэмжлэлд хуваарилж, ХЭД нь кредит болов. */
export function payOutcome(f: {
  amount: number; allocated: number; date: string; paymentId?: number | null;
}): Outcome {
  const left = Math.round(f.amount - f.allocated);
  return {
    text: line("Төлбөр бүртгэгдлээ",
               [tug(f.amount), f.date,
                `${tug(f.allocated)} нэхэмжлэлд хуваарилагдав`,
                left > 0 && `${tug(left)} кредит болов`]),
    mark: freshMark("pay", f.paymentId),
  };
}

/** Ачилт баталгаажсан нь ТООЦОО ЭХЭЛСЭН гэсэн үг — нөөц тэр агшинд хөдөлнө. */
export function shipmentOutcome(f: {
  qty: number; date: string; movementId?: number | null;
}): Outcome {
  return {
    text: line("Ачилт баталгаажлаа", [`${fmt(f.qty)}ш`, `${f.date}-наас тооцоонд орлоо`]),
    mark: freshMark("mv", f.movementId),
  };
}

/* ══════ ХАРИЛЦАГЧИЙН ХУУДАС ══════
 *
 * Гэрээний хуудсан дээр зурвас БАЙСАН, харилцагчийнх дээр БАЙГААГҮЙ: тэнд
 * `PayModal` нь `payOutcome(...)`-оо дамжуулдаг байсныг хуудас нь чимээгүй
 * ХАЯЖ (`onDone={() => { setPay(false); load(); }}`), Отгоо төлбөр бүртгээд
 * толгойн доор ЮУ Ч олдоггүй байв. Хоёр дэлгэц НЭГ хэл ярих ёстой тул
 * өгүүлбэрүүд нь ижил бүтэцтэй: ЮУ болов — хэн/хэдэн ₮ · ХЭЗЭЭ · тоо
 * ХЭДЭЭС ХЭД болов.
 */

/** «авлага 335,333,564₮ → 499,825,564₮» — тоо хөдлөөгүй бол ХООСОН. */
export function receivableShift(before: number, after: number): string {
  if (Math.round(before) === Math.round(after)) return "";
  return `авлага ${tug(before)} → ${tug(after)}`;
}

/** Түрээс БИШ бичилт — юуны төлөө, хэдээр, авлага хаашаа. */
export function entryOutcome(f: {
  kindLabel: string; label: string; signed: number;
  before: number; after: number; entryId?: number | null;
}): Outcome {
  const amount = (f.signed < 0 ? "−" : "+") + tug(Math.abs(f.signed));
  return {
    text: line("Бичилт хийгдлээ",
               [f.kindLabel, f.label.trim(), amount, receivableShift(f.before, f.after)]),
    mark: freshMark("entry", f.entryId),
  };
}

/** Бичилт ХҮЧИНГҮЙ — мөр нь үлдэнэ, тооцооноос л гарна. */
export function voidEntryOutcome(f: {
  label: string; signed: number; before: number; after: number; reason: string;
}): Outcome {
  return { text: line("Бичилт хүчингүй болов",
                      [f.label.trim(), tug(Math.abs(f.signed)),
                       receivableShift(f.before, f.after), f.reason.trim()]) };
}

/** Төлбөр ХҮЧИНГҮЙ — хэдэн төгрөг нэхэмжлэлээс сулрав. */
export function voidPayOutcome(f: {
  amount: number; date: string; released: number; reason: string;
}): Outcome {
  return { text: line("Төлбөр хүчингүй болов",
                      [tug(f.amount), f.date,
                       f.released > 0 && `${tug(f.released)} нэхэмжлэлээс сулрав`,
                       f.reason.trim()]) };
}

/** Гарын үсэгтэн (№72, 73) — дөрвөн үйлдэл, нэг өгүүлбэрийн хэв. */
export type ContactAction = "add" | "edit" | "off" | "on";
const CONTACT_HEAD: Record<ContactAction, string> = {
  add: "Холбоо барих хүн нэмэгдлээ",
  edit: "Холбоо барих хүн засагдлаа",
  off: "Холбоо барих хүн идэвхгүй болов",
  on: "Холбоо барих хүн идэвхжлээ",
};
export function contactOutcome(action: ContactAction, f: {
  name: string; role?: string; phone?: string; contactId?: number | null;
}): Outcome {
  return {
    text: line(CONTACT_HEAD[action], [f.name.trim(), f.role?.trim(), f.phone?.trim()]),
    mark: freshMark("contact", f.contactId),
  };
}

/** Хавсралт — нэрээрээ (Отгоо ямар файл орсныг нүдээрээ тулгана). */
export function fileOutcome(filename: string): Outcome {
  return { text: line("Файл хавсаргагдлаа", [filename.trim()]) };
}

/** Амлалт · холбоо барьсан түүх — ХЭЗЭЭ, юу ярьсан, юу амласан. */
export function promiseOutcome(f: {
  date: string; kindLabel: string; note: string;
  promiseDate?: string; promiseAmount?: number; noteId?: number | null;
}): Outcome {
  const promise = f.promiseDate || (f.promiseAmount || 0) > 0
    ? `амлалт ${[f.promiseDate, (f.promiseAmount || 0) > 0 && tug(f.promiseAmount!)]
        .filter(Boolean).join(" · ")}`
    : "";
  return {
    text: line("Амлалт бичигдлээ", [f.date, f.kindLabel, f.note.trim(), promise]),
    mark: freshMark("note", f.noteId),
  };
}

/** ЗАХЫН ТЭМДЭГЛЭЛ (P1-22) — «модонд», «нөат шивсэн», ⚑ шар туг. */
export function noteOutcome(action: "add" | "void", f: {
  date: string; text: string; flag?: boolean; reason?: string;
}): Outcome {
  const head = action === "add" ? "Тэмдэглэл бичигдлээ" : "Тэмдэглэл хүчингүй болов";
  return {
    text: line(head, [f.date, f.text.trim(),
                      action === "add" ? (f.flag ? "анхаарах ⚑" : "") : f.reason?.trim()]),
  };
}

/** Дарж зассан талбар — ЮУГ ЮУ болгосныг хэлнэ («засагдлаа» гэдэг дангаараа
 *  юу ч хэлэхгүй: Отгоо гурван талбар дараалж засаад аль нь суусныг мэдэхгүй). */
export function fieldOutcome(label: string, value: string): Outcome {
  const v = value.trim();
  return { text: line(`${label} засагдлаа`, [v || "хоосон болов"]) };
}

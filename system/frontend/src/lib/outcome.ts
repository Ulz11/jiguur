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
export function freshMark(kind: "mv" | "pay" | "akt",
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

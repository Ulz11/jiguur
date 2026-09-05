import { cycleLabel } from "./cycle";
import { OPENING_LABEL, isOpeningNo, openingUntil } from "./opening";

export type InvoiceNaming = {
  no: string;
  /** Циклийн эхлэл/төгсгөл — түрээсийн нэхэмжлэлд л зөрүүтэй байна. */
  cycle_start?: string;
  cycle_end?: string;
};

/** Нэхэмжлэлийн НЭР — нэг дүрэм, бүх дэлгэц дээр ижил.
 *
 *  Түрээсийн нэхэмжлэлийг хүн ҮЕЭЭР нь танина («2026-07-20 – 2026-08-18»),
 *  дугаар нь зөвхөн хоёрдогч тэмдэглэгээ. Худалдааны нэхэмжлэлд үе гэж
 *  байхгүй — цикл нь нэг өдөр — тул түүний № нь өөрөө нэр болно. Ижил
 *  объектыг хоёр өөр нэрээр дуудахаас сэргийлнэ.
 *
 *  ХУУЧИН ҮЛДЭГДЭЛ (`OB-…`) нь нэхэмжлэл ДҮР ЭСГЭСЭН шилжүүлгийн үлдэгдэл:
 *  Отгоо «№OB-2» гэсэн баримт хэзээ ч гаргаж байгаагүй тул дугаар нь
 *  дэлгэц дээр ГАРАХГҮЙ — үг нь, хамрах огноотойгоо гарна (`lib/opening`). */
export function invoiceLabel(inv: InvoiceNaming): { title: string; sub?: string } {
  const { cycle_start: s, cycle_end: e, no } = inv;
  if (isOpeningNo(no)) {
    const until = openingUntil(s || e);
    return until ? { title: OPENING_LABEL, sub: until } : { title: OPENING_LABEL };
  }
  // Цонх нь хагас нээлттэй ирдэг ([s, e)) — нэр нь БАГТААМЖТАЙ гарна (R4):
  // «2026-07-20 – 2026-08-18» = 30 хоног. Хоосон циклийг (s === e) ТҮҮХИЙ
  // утгаар нь таньж байж л шошиглоно, эс бөгөөс OB/худалдааны нэхэмжлэл
  // урвуу муж болно.
  if (s && e && s !== e) return { title: cycleLabel(s, e), sub: `№${no}` };
  return { title: `№${no}` };
}

/* ---------- ХАРИЛЦАГЧИЙН ХУУДАСНЫ НЭР ----------
 *
 * Гэрээний хуудсан дээр «энэ аль гэрээ вэ» гэдэг асуулт БАЙХГҮЙ (та тэр
 * гэрээн дотор зогсож байна) тул нэхэмжлэлийн № нь хоёрдогч тэмдэглэгээ
 * болж явна. ХАРИЛЦАГЧИЙН хуудсан дээр яг эсрэгээрээ: нэг жагсаалт дотор
 * гурван гэрээ, хуучин үлдэгдэл, гараар бичсэн бичилт зэрэгцэн суух тул
 * мөр бүр ЮУНЫХ болохоо өөрөө хэлэх ёстой.
 *
 * ⚠ ХУУЧИН ҮЛДЭГДЛИЙГ НЭХЭМЖЛЭЛИЙН ДУГААРААР НЬ ТАНИНА, ГЭРЭЭГЭЭР НЬ БИШ.
 * Гараар бичсэн бичилтүүд (`A-…`) нь ХУУЧИН ҮЛДЭГДЛИЙН зохиомол гэрээн
 * дээр (`OB-{id}`) суудаг — «дансны гэрээ». Урьд нь хуудас гэрээний
 * дугаараар нь шалгадаг байсан тул Бутангуудын «Өнө Ордтой тооцоо —
 * 2026.06.22 акт» гэсэн бичилт «Хуучин үлдэгдэл · 2026-09-01 хүртэл
 * 139,648,000₮» гэж нэрлэгдэж байв: гурван худал нэг мөрөнд.
 */

/** Гараар бичсэн бичилтийн нэхэмжлэл — `A-{харилцагч}-{n}` (`services/entries`). */
export function isEntryNo(no: string | null | undefined): boolean {
  return /^A-\d+-\d+$/.test((no || "").trim());
}

export type ClientInvoiceNaming = InvoiceNaming & {
  /** Гараар бичсэн бичилтийн шошго — сервер `detail_json`-оос гаргана. */
  label?: string | null;
};

/** Харилцагчийн хуудсан дээрх нэхэмжлэлийн НЭР.
 *
 *  · `OB-…`  → «Хуучин үлдэгдэл» + «{огноо} хүртэл»
 *  · `A-…`   → бичилтийн ӨӨРИЙНХ нь шошго («Өнө Ордтой тооцоо — 2026.06.22 акт»)
 *  · түрээс  → «Түрээс 2026-07-13 – 2026-08-11» (БАГТААМЖТАЙ хил, `lib/cycle`)
 *  · бусад   → «№…»
 *
 *  Гэрээний нэр нь мөрөн дээр ТУСДАА холбоосоор зогсдог тул энд давхардахгүй. */
export function clientInvoiceLabel(inv: ClientInvoiceNaming): { title: string; sub?: string } {
  const { cycle_start: s, cycle_end: e, no } = inv;
  if (isOpeningNo(no)) {
    const until = openingUntil(s || e);
    return until ? { title: OPENING_LABEL, sub: until } : { title: OPENING_LABEL };
  }
  if (isEntryNo(no)) {
    const label = (inv.label || "").trim();
    // Шошгогүй бичилт байж болохгүй (сервер шаарддаг) — гэхдээ хуучин мөр
    // ирвэл хоосон гарчиг зурахгүй, төрлөө хэлнэ.
    return { title: label || "Бичилт", sub: s || undefined };
  }
  if (s && e && s !== e) return { title: `Түрээс ${cycleLabel(s, e)}` };
  return { title: `№${(no || "").trim()}` };
}

/* ---------- «ТООЦОО НИЙЛСЭН» — хамтарсан гарын үсгийн ТӨЛӨВ (№69) ----------
 *
 * Отгоо эгчийн арван харилцагчийн хуудас бүр гарын үсгийн блокоор дуусдаг:
 * «Тооцоо нийлсэн: / Жигүүр Зам ХХК / Ч.Отгонцэцэг … / түрээслэгч: БЛҮҮМ ХХК /
 * Н.Манлай …». Энэ бол чимэг БИШ, ТӨЛӨВ: тэр дүн дээр маргаан ДУУССАН.
 * Систем баталгаажсан ба батлагдаагүй тоог ялгадаггүй байсан.
 */

export type Agreeable = { agreed_at?: string | null; agreed_by?: string };

export function isAgreed(inv: Agreeable | undefined | null): boolean {
  return !!inv?.agreed_at;
}

/** Мөрөн дэх ЖИЖИГ тэмдэг: «Тооцоо нийлсэн 2026.07.20 · Н.Манлай».
 *  Тэмдэглэгээгүй бол ХООСОН — хий «нийлээгүй» гэсэн шошго нэмэхгүй
 *  (жагсаалт дээр утга нь ЯЛГАА, чимээгүй байдал нь анхны төлөв). */
export function agreedMark(inv: Agreeable | undefined | null): string {
  if (!isAgreed(inv)) return "";
  const by = (inv!.agreed_by || "").trim();
  return `Тооцоо нийлсэн ${inv!.agreed_at}` + (by ? ` · ${by}` : "");
}

/** Хулганы tooltip — тэмдэг таслагдсан ч бүтнээрээ уншигдана. */
export function agreedTitle(inv: Agreeable | undefined | null): string | undefined {
  return isAgreed(inv) ? agreedMark(inv) : undefined;
}

import { daysBetween } from "./schedule";

/* Материалын мөрийн доор задардаг ХӨДӨЛГӨӨНИЙ ДЭВТЭР — цэвэр бүлэглэлт.
 *
 * Отгоо Numbers дээрээ материал бүрийн доор нь тэр материалын түүхийг бичдэг
 * байсан: юу гарсан, юу буцсан, тэгээд ХЭД үлдсэн. Хүснэгт нь материалыг
 * ТАРИФААР нь салгаж хардаг (нэг хэв 300₮-өөр ч, 330₮-өөр ч гарсан байж
 * болно) — түүх нь харин МАТЕРИАЛЫНХ, тарифынх биш: буцаалт хоёр паданг
 * дамнаж болно. Тиймээс энэ туслах нь тарифаараа салсан мөрүүдийг нэг
 * материалын хэсэг болгож нэгтгээд, доор нь нэг л түүх өгнө.
 *
 * ҮЛДЭГДЛИЙН ГАНЦ ДҮРЭМ: `counted` мөрүүдийн `delta`-гийн гүйлгэсэн нийлбэр.
 * Хүлээгдэж буй ачилт ХАРАГДАНА (Отгоо хүлээж байгаагаа мэдэх ёстой) ч
 * үлдэгдлийг хөдөлгөхгүй — тооцооны хөдөлгүүр түүнийг тоодоггүйтэй яг адил.
 * Сүүлийн мөрийн үлдэгдэл нь хэсгийн толгойн тоотой таарна (backend-ийн
 * `held` ба энэ нийлбэр хоёр зөрвөл pytest тэнцлийн тест улаан болно).
 */

export type LotSource = {
  issue_line_id: number;
  issue_movement_id?: number;
  date?: string;
  rate: number;
  qty: number;
  pinned: boolean;
  /** Машины тоолсон хоног (падан циклдээ орсноос буцаалт хүртэл) */
  days?: number;
  /** Үнэхээр нэхэгдэх хоног — гар хоног байвал ТҮҮНИЙХ */
  billed_days?: number;
  /** Хоног нь ГАРААР тохирсон эсэх (H5) */
  override?: boolean;
};

export type LedgerLine = {
  id: number;
  movement_id: number;
  type: string;                 // ISSUE | RETURN | WRITEOFF | SALE
  date: string;
  status: string;               // pending | done
  counted: boolean;
  qty: number;
  delta: number;                // тэмдэгтэй: олголт +, буцаалт/акт/худалдаа −
  rate: number | null;          // зөвхөн олголтын мөр — падангийн тариф
  sources: LotSource[] | null;  // зөвхөн буцаалт/акт — аль падангаас хассан
  /* Цуцлагдсан хөдөлгөөн — мөр нь ХАРАГДАНА, `counted` нь `false` (хүлээгдэж
     буй ачилттай яг ижил журам), тул тэнцэл хэвээр. */
  voided?: boolean;
  void_reason?: string;
  voided_by?: string;
  voided_at?: string | null;
  /** Гар хоног (H5) — `null` бол машины тоо. Зөвхөн буцаалтын мөр. */
  billed_days_override?: number | null;
  /* Доорхи нь зөвхөн ХАРУУЛАХ талбарууд — үлдэгдлийн тооцоонд оролцохгүй */
  note?: string;
  return_grade?: string | null;
  repair_qty?: number;
  repair_fee?: number;
  writeoff_qty?: number;
  writeoff_fee?: number;
  /** Худалдаа болгосон мөрийн дүн (H7) — зөвхөн SALE. Даргад ирэхгүй. */
  sale_fee?: number;
  /** ТАЛБАЙ (№88, 97) — «хаанаас гарсан / хаана буцсан». Хоосон бол нэргүй. */
  site?: string;
  [k: string]: unknown;
};

export type LedgerGroup = {
  material_id: number;
  grade_id: number;
  material: string;
  grade: string;
  held: number;
  lines: LedgerLine[];
};

export type ItemRow = {
  material_id: number;
  grade_id: number;
  qty: number;
  [k: string]: unknown;
};

export type MaterialSection = {
  /** `material_id:grade_id` — задарсан мөрийг санахад ашиглагдана */
  key: string;
  material_id: number;
  grade_id: number;
  material: string;
  grade: string;
  /** Хүснэгтийн үндсэн мөрүүд — тариф бүрд нэг (ихэвчлэн ганц) */
  rows: ItemRow[];
  /** Гадаа байгаа нийт тоо — мөрүүдийн нийлбэр */
  qty: number;
  /** Түүхийн мөрүүд + мөр бүрийн ДАРААХ үлдэгдэл */
  lines: (LedgerLine & { balance: number })[];
  /** Хүлээгдэж буй (баталгаажаагүй) мөрийн тоо */
  pending: number;
  /** Хүлээгдэж буй мөрүүдийн ширхэг — «хэдэн мөр» биш «хэд ирж байна» */
  pendingQty: number;
};

const keyOf = (materialId: number, gradeId: number) => `${materialId}:${gradeId}`;

function withBalance(lines: LedgerLine[]): (LedgerLine & { balance: number })[] {
  let run = 0;
  return lines.map((ln) => {
    if (ln.counted) run += ln.delta;
    return { ...ln, balance: run };
  });
}

/** Хүснэгтийн мөрүүд + материалын дэвтрүүд → задардаг хэсгүүд.
 *
 *  Дараалал нь ХҮСНЭГТИЙНХ: мөр анх гарч ирсэн дараалал хэвээр үлдэнэ (Отгоо
 *  гэрээгээ бичсэн дарааллаараа хардаг). Хүснэгтэд мөргүй үлдсэн дэвтэр
 *  (бүрэн буцаагдсан, гэрээний мөрд байхгүй материал) арын мөрөнд гарна —
 *  түүх чимээгүй алга болох ёсгүй. */
export function materialSections(items: ItemRow[], groups: LedgerGroup[]): MaterialSection[] {
  const byKey = new Map<string, LedgerGroup>();
  for (const g of groups) byKey.set(keyOf(g.material_id, g.grade_id), g);

  const secs = new Map<string, MaterialSection>();
  const push = (materialId: number, gradeId: number, name: string, grade: string) => {
    const key = keyOf(materialId, gradeId);
    let s = secs.get(key);
    if (!s) {
      const g = byKey.get(key);
      s = {
        key, material_id: materialId, grade_id: gradeId,
        material: name || g?.material || "?", grade: grade || g?.grade || "?",
        rows: [], qty: 0,
        lines: withBalance(g?.lines ?? []),
        pending: (g?.lines ?? []).filter((ln) => !ln.counted).length,
        pendingQty: (g?.lines ?? []).reduce((n, ln) => (ln.counted ? n : n + ln.qty), 0),
      };
      secs.set(key, s);
    }
    return s;
  };

  for (const it of items) {
    const s = push(it.material_id, it.grade_id,
                   String(it.material ?? ""), String(it.grade ?? ""));
    s.rows.push(it);
    s.qty += it.qty;
  }
  // Хүснэгтэд мөргүй үлдсэн түүх ч гээгдэхгүй
  for (const g of groups) push(g.material_id, g.grade_id, g.material, g.grade);

  return [...secs.values()];
}

/* ---------- Падан-сонгогч (буцаалтын мөрөнд) ----------
   H5: «буцаалтад падан-сонгогч — сервер талд бэлэн, UI илгээдэггүй».

   Отгоо «энэ буцаалт ХОЁРДУГААР падангаас хасагдана» гэж заахын тулд ямар
   падан нээлттэй байгааг эхлээд харах ёстой. Шошго нь ТҮҮНИЙ таних дөрвөн
   тэмдгийг авч явна: дугаар (дэвтэр дээрээ «#12 падан» гэж харагддаг), огноо,
   ТАРИФ (нэг хэв 300₮-өөр ч, 330₮-өөр ч гарсан байж болно) ба хэд үлдсэн.

   Үлдэгдлийг ЭНД бодох нь давхардал биш: сервер `_lots`-оороо ижил тоог
   гаргадаг ч сонголтын мөр бүрд тусад нь асуух зам байхгүй. Мөр өөрөө нь
   хассан тоог БУЦААЖ нэмнэ — эс бөгөөс өөрийн хаасан паданг «хоосон» гэж
   уншиж, тэр мөр сонгогчоосоо алга болно. */
export function lotOptions(group: { lines?: LedgerLine[] } | undefined | null,
                           onDate: string, selfLineId?: number): [string, string][] {
  const out: [string, string][] = [["0", "Авто — эхлээд хуучнаас"]];
  const lines = group?.lines || [];
  const taken = new Map<number, number>();
  for (const ln of lines) {
    if (ln.id === selfLineId) continue;        // өөрийнхөө хасалт тооцогдохгүй
    for (const s of ln.sources || []) {
      taken.set(s.issue_line_id, (taken.get(s.issue_line_id) || 0) + s.qty);
    }
  }
  for (const ln of lines) {
    if (ln.type !== "ISSUE" || !ln.counted || ln.date > onDate) continue;
    const left = ln.qty - (taken.get(ln.id) || 0);
    if (left <= 0) continue;
    const rate = ln.rate != null ? `${Math.round(ln.rate).toLocaleString("en-US")}₮` : "—";
    out.push([String(ln.id),
              `#${ln.id} · ${ln.date} · ${rate} · ${Math.round(left).toLocaleString("en-US")}ш үлдсэн`]);
  }
  return out;
}

/* ---------- Гар хоног (H5) ----------
   «Хоёр тал 12 хоног гэж гарын үсэг зурсан бол 12 нь хэлцлийн баримт.» Гэвч
   Отгоо машины тоог ХАРААГҮЙ байж дарж болохгүй: дарах болгонд нь зөрүү
   төрвөл тэр «машин тоолж чаддаггүй» гэсэн дүгнэлтээ баталгаажуулна. Тиймээс
   маягт дээр машины тоо ЭХЛЭЭД сануулга болж зогсоно. */

/** Машин энэ буцаалтыг хэдэн хоног гэж тоолох вэ — маягтын сануулга.
 *
 *  Дүрэм нь серверийнхтэй ижил: падан ЦИКЛДЭЭ орсон өдрөөс (падангийн огноо
 *  ба циклийн эхлэл — аль хожуу нь) буцаалт хүртэл. Падан нь заасан нь,
 *  эс бөгөөс FIFO-гоор хамгийн хуучин нээлттэй нь.
 *
 *  Буцаалт хоёр падан дамнавал сервер тэдгээр бүрд ТҮҮНИЙ хоногийг тавина;
 *  сануулга нь ЭХЭЛЖ хаагдах падангийнхыг харуулна — тэр л түгээмэл тохиолдол. */
function pickLot(group: { lines?: LedgerLine[] } | undefined | null,
                 onDate: string, pinLineId?: number): LedgerLine | null {
  const ids = lotOptions(group, onDate).slice(1).map((o) => Number(o[0]));
  const id = pinLineId && ids.includes(pinLineId) ? pinLineId : ids[0];
  if (!id) return null;
  return (group?.lines || []).find((ln) => ln.id === id) || null;
}

/** Падан ТУХАЙН ЦИКЛД орсон өдөр — падангийн огноо ба циклийн эхлэл, хожуу нь. */
function lotStart(lot: LedgerLine, cycleStart: string): string {
  return lot.date > cycleStart ? lot.date : cycleStart;
}

export function lotDaysHint(group: { lines?: LedgerLine[] } | undefined | null,
                            onDate: string, cycleStart: string | null | undefined,
                            pinLineId?: number): number | null {
  if (!cycleStart) return null;
  const lot = pickLot(group, onDate, pinLineId);
  if (!lot) return null;
  const days = daysBetween(lotStart(lot, cycleStart), onDate);
  return days >= 0 ? days : null;
}

/** Гар хоногийн ДЭЭД ХЯЗГААР — падан циклдээ орсноос цонхны төгсгөл хүртэл.
 *
 *  Серверийн `billing.override_cap`-ийн толь. Хязгаар нь ЦИКЛИЙН УРТ БИШ:
 *  циклийн дунд гарсан падангаас буцаасан хэсэг тэр падангийн өдрөөс өмнө
 *  гадаа байж чадахгүй. Маягтын `max` ба серверийн татгалзал НЭГ тоо руу
 *  харахгүй бол Отгоо зөвшөөрөгдсөн тоогоо бичээд 400 иднэ. */
export function lotDaysMax(group: { lines?: LedgerLine[] } | undefined | null,
                           onDate: string, cycleStart: string | null | undefined,
                           cycleEnd: string | null | undefined,
                           pinLineId?: number): number | null {
  if (!cycleStart || !cycleEnd) return null;
  const lot = pickLot(group, onDate, pinLineId);
  if (!lot) return null;
  const days = daysBetween(lotStart(lot, cycleStart), cycleEnd);
  return days >= 0 ? days : null;
}

/* ---------- Гар хоног = МӨНГӨ (H5) ----------
   Буцаалтын цонхны тооцоо нь «хэдэн ширхэг» дээр зогсдог байсан: хоногоо
   бичиж байхад нь ямар дүн хөдлөхийг ХЭЛДЭГГҮЙ байв. Хөдөлгүүр яг
   (гараар − системээр) × тоо × тарифаар л хөдөлдөг тул тэр нэг үржвэрийг
   маягт дээр нь харуулна — тэр бичихдээ мөнгөө хараагүй байж гарын үсэг
   зурах ёсгүй. */

export type ReturnDaysRow = {
  /** Буцаах тоо */
  qty: number;
  /** Материалын өдрийн тариф */
  rate: number;
  /** Отгоогийн бичсэн хоног — хоосон бол `null` (= авто) */
  days: number | null;
  /** Машины тоолсон хоног (`lotDaysHint`) — мэдэгдэхгүй бол `null` */
  hint: number | null;
};

export type OverrideEffect = {
  /** Гар хоног бичигдсэн мөрийн тоо */
  count: number;
  /** ₮ зөрүү: эерэг = нэхэмжлэл ӨСНӨ, сөрөг = БУУРНА */
  delta: number;
  /** Ганц мөр байвал ТҮҮНИЙ хоёр тоо — «гараар 12 / системээр 10» */
  manual: number | null;
  auto: number | null;
};

export function overrideEffect(rows: ReturnDaysRow[]): OverrideEffect {
  const manual = rows.filter((r) => r.days != null);
  let delta = 0;
  for (const r of manual) {
    // Машины тоо мэдэгдэхгүй бол зөрүү нь мэдэгдэхгүй — таамгаар тоо гаргахгүй
    if (r.hint == null) continue;
    delta += ((r.days as number) - r.hint) * r.qty * r.rate;
  }
  const one = manual.length === 1 ? manual[0] : null;
  return { count: manual.length, delta,
           manual: one ? (one.days as number) : null,
           auto: one ? one.hint : null };
}

/** Дэвтрийн мөрөн дээрх хоногийн бичиг — зөрүүг ХЭЗЭЭ Ч нууцлахгүй.
 *
 *  «12 хоног (гараар — системээр 11)». Гараар тохирсон ч машинтай таарсан бол
 *  зөрүү гэж байхгүй — «(гараар)» гэсэн тэмдэг л үлдэнэ, эс бөгөөс тоо
 *  давхардаж уншигдана. */
export function daysVarianceText(s: LotSource): string {
  const billed = s.billed_days ?? s.days ?? 0;
  if (!s.override) return `${billed} хоног`;
  if (s.days === undefined || s.days === billed) return `${billed} хоног (гараар)`;
  return `${billed} хоног (гараар — системээр ${s.days})`;
}


/* ---------- ТАЛБАЙН ЗАДАРГАА (№88, 97) ----------
 *
 * Блүүмийн НЭГ хуудас ГУРВАН талбайг барина: `2026 шинэ`!C16/C17/C18 нь
 * `БЛҮҮМ технологи` 2,044 · `БЛҮҮМ архангай` 326 · `Блүүм дарь эх` 1,924 —
 * нийлбэр нь 4,294ш, гэвч АВЛАГА нь НЭГ. Батцоожийн хуудсан дээр
 * `F5='А Е блок үлдэгдэл'` гэсэн багана дэд-объектынхоо үлдэгдлийг өөрөө
 * барьдаг: «нийт хэд гадаа байна» гэдэг нь түүнд ХАНГАЛТГҮЙ хариу, учир нь
 * буцаалт нь ТАЛБАЙГААРАА ирдэг.
 *
 * Энэ бол ЦЭВЭР ГАРГАЛТ: шинэ эх сурвалж БИШ, дэвтрийн мөрүүдийн нийлбэр
 * (H9 «нэг факт, нэг тоо»). Дүрэм нь үлдэгдлийнхтэй ЯГ ИЖИЛ — зөвхөн
 * `counted` мөрүүд оролцоно, тул задаргааны нийлбэр нь толгойн тоотой таарна.
 */

export type SitePart = { site: string; qty: number };

/** Талбай бүрийн гадаа байгаа тоо. ХОЁРООС ЦӨӨН талбайтай бол ХООСОН:
 *  ганц талбайн задаргаа нь толгойн тоог давтаж, мөр л нэмнэ.
 *
 *  Дараалал нь ДЭВТРИЙНХ (эхэлж гарч ирсэн талбай эхэндээ) — тоогоор
 *  эрэмбэлбэл буцаалт болгоны дараа мөрүүд байраа солино. */
export function siteBreakdown(
  lines: { site?: string; delta: number; counted: boolean }[] | null | undefined,
): SitePart[] {
  const order: string[] = [];
  const sum = new Map<string, number>();
  for (const ln of lines || []) {
    if (!ln.counted) continue;
    const site = ln.site || "";
    if (!sum.has(site)) { sum.set(site, 0); order.push(site); }
    sum.set(site, sum.get(site)! + ln.delta);
  }
  if (order.length < 2) return [];
  return order.map((site) => ({ site, qty: sum.get(site)! }));
}

/** Тухайн гэрээн дээр АЛЬ ХЭДИЙН хэрэглэгдсэн талбайнууд — цонхны `datalist`.
 *
 *  Талбайн нэрийг гараар бичих нь «Дарь эх» ба «дарь эх» гэсэн ХОЁР бүлэг
 *  төрүүлнэ: задаргаа тэр агшинд худал болно. Санал болгосон жагсаалт нь тэр
 *  хуваагдлыг эхнээс нь хаана. Дараалал: цагаан толгойн (сонголтын жагсаалт
 *  тул хайлт нь урьдчилан таамаглагдана). */
export function usedSites(
  movements: { site?: string }[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const mv of movements || []) {
    const s = (mv.site || "").trim();
    if (s) seen.add(s);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "mn"));
}

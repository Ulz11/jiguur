/* Объект → хаяг. Систем нь Отгоогийн НЭГ дэвтэр: харилцагч, гэрээ, материал
 * тус бүр НЭГ хуудастай, тэр хуудас руу нь дэлгэц бүрээс ижил замаар очно.
 *
 * Хаягийг мөр мөрөөр нь газар газарт угсарч байвал нэг дэлгэц дээр
 * `/clients/7`, нөгөө дээр `/client/7` болж чимээгүй эвдэрнэ. Тиймээс зам
 * бүр ЭНД нэг л удаа бичигдэнэ.
 */

export const clientHref = (id: number) => `/clients/${id}`;
export const contractHref = (id: number) => `/contracts/${id}`;
export const materialHref = (id: number) => `/warehouse/materials/${id}`;

/* ---------- Нэхэмжлэл: гэрээний хуудасны ЯГ тэр мөр ----------
 *
 * Нэхэмжлэлд өөрийн хуудас байхгүй — тэр нь гэрээнийхээ хүснэгтэн дэх нэг мөр.
 * Гэхдээ «хугацаа хэтэрсэн 3 нэхэмжлэл» дотроос нэгийг дараад гэрээний ТОЛГОЙД
 * буух нь Отгоог 30 мөрийн дундаас өөрийн дарсан мөрөө дахин хайхад хүргэдэг.
 * Тиймээс мөр өөрөө хаягтай: `#inv-{id}`. Зангууны нэр НЭГ л газар бичигдэнэ —
 * мөрийн `id` ба холбоос хоёр зөрвөл холбоос чимээгүй хоосон буудна.
 */
export const invoiceAnchorId = (invoiceId: number) => `inv-${invoiceId}`;

/** Нэхэмжлэлээ мэдэхгүй бол ГЭРЭЭ рүүгээ — худал зангуу нь зангуугүйгээс дор. */
export function invoiceHref(contractId: number, invoiceId?: number | null): string {
  const to = contractHref(contractId);
  return invoiceId ? `${to}#${invoiceAnchorId(invoiceId)}` : to;
}

/* ---------- Түрээс / Худалдаа — хамрах хүрээ ----------
 *
 * Энэ шилжүүлэгч нь дашбоардын БҮХ тоог (авлагын нийт 77.4 → 6.1 сая), 4 дэх
 * картын хэмждэг зүйлийг, гэрээний жагсаалтыг бүхэлд нь сольдог. Ийм хүчтэй
 * шүүлтүүр нь хуудасны дотоод төлөв болж нуугдвал:
 *   · буцах товч түүнийг БУЦААХГҮЙ (Отгоо «яагаад тоо өөрчлөгдчихөв» гэж үлдэнэ)
 *   · хавчуурга, хуваалцсан холбоос нь өөр зураг нээнэ
 *   · дахин ачаалахад чимээгүй «бүгд» рүү унана
 * Тиймээс хүрээ нь ХАЯГАН дээр амьдарна: `?scope=rent|sale`, байхгүй нь «бүгд».
 */
export const SCOPES = ["all", "rent", "sale"] as const;
export type Scope = (typeof SCOPES)[number];

/** Хаягнаас уншсан хүрээ — ЗӨВХОН таних утга дамжина. Танихгүй үг ирвэл
 *  «бүгд» рүү унана: буруу линк Отгоод хоосон самбар үзүүлэх ёсгүй. */
export function scopeFrom(raw: string | null | undefined): Scope {
  return (SCOPES as readonly string[]).includes(raw ?? "") ? (raw as Scope) : "all";
}

/** Байгаа хаягийн БУСАД параметрийг хөндөхгүйгээр хүрээг сольсон хаяг.
 *  «Бүгд» нь параметргүй — анхны төлөв хаягаа бохирдуулахгүй. */
export function scopeHref(pathname: string, search: string, scope: Scope): string {
  const p = new URLSearchParams(search);
  if (scope === "all") p.delete("scope");
  else p.set("scope", scope);
  const q = p.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/* ---------- Гэрээний жагсаалтын төлөв ---------- */

/** Гэрээнүүд хуудасны төлөвийн шүүлтүүрүүд (Contracts.tsx-ийн FILTERS-тэй нэг эх сурвалж) */
export const CONTRACT_FILTERS = ["all", "active", "ending", "overdue", "closed", "opening"] as const;
export type ContractFilter = (typeof CONTRACT_FILTERS)[number];

/** «3 нь удахгүй дуусна» гэдэг тоо нь АЛЬ гэрээнүүд болохыг хэлэх ёстой.
 *  Шүүлтүүр нь хаягаар дамжина: холбоос нь тэмдэглэгдэж, буцаж ирэхэд ч
 *  ижил жагсаалт нээгдэнэ (хуудасны дотоод төлөв бол зөвхөн нэг товшилтын
 *  настай). */
export function contractsHref(state?: ContractFilter | null, scope?: Scope | null): string {
  const p = new URLSearchParams();
  if (state && state !== "all") p.set("state", state);
  if (scope && scope !== "all") p.set("scope", scope);
  const q = p.toString();
  return q ? `/contracts?${q}` : "/contracts";
}

/** Хаягнаас уншсан төлөв — ЗӨВХӨН таних утга дамжина. Танихгүй үг ирвэл
 *  «бүгд» рүү унана: буруу линк Отгоод хоосон хүснэгт үзүүлэх ёсгүй. */
export function contractFilterFrom(raw: string | null | undefined): ContractFilter {
  return (CONTRACT_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as ContractFilter)
    : "all";
}

/* ---------- Үйлдлийн бүртгэл ---------- */

const AUDIT_ROUTE: Record<string, ((id: number) => string) | undefined> = {
  contract: contractHref,
  client: clientHref,
  material: materialHref,
};

/** Бүртгэлийн мөрийг нээгддэг болгоно — ГЭХДЭЭ хуудастай объект дээр л.
 *
 *  `payment`, `movement`, `invoice`, `contract_item`-ийн `entity_id` нь
 *  тэдгээрийн ӨӨРСДИЙН id (гэрээнийх БИШ) тул `/contracts/{id}` руу аваачвал
 *  огт өөр гэрээ нээгдэнэ — худал холбоос нь холбоосгүйгээс дор. */
export function auditHref(entity: string, entityId: number | null | undefined): string | null {
  const build = AUDIT_ROUTE[entity];
  return build && entityId ? build(entityId) : null;
}

/* ---------- Дашбоардын мэдэгдэл ---------- */

/** Гэрээгүй мэдэгдлүүд өөрсдийн хуудастай */
const NOTE_ROUTE: Record<string, string> = {
  loan: "/loans",
  promise_late: "/collections",
  barter_stale: "/barter",
};
/** Үйлдвэрийн даргад цэсэнд ч, серверт ч хаалттай хуудсууд */
const FACTORY_BLOCKED = new Set(["/loans", "/collections", "/salary", "/reports", "/analytics"]);

/** Мэдэгдэл хаашаа аваачих вэ. Гэрээтэй бол гэрээ рүүгээ, эс бөгөөс төрлийнхөө
 *  хуудас руу. Даргад хаалттай хуудас руу холбоос ҮҮСГЭХГҮЙ — дарж ороод 403
 *  харах нь холбоосгүйгээс дор.
 *
 *  Мэдэгдэл нь ЯМАР нэхэмжлэлийн тухай ярьж байгаагаа мэддэг бол (сервер
 *  `invoice_id` явуулдаг) тэр мөр дээрээ буулгана — «R-26/07-4 12 хоног
 *  хэтэрлээ» гэж уншсан хүн гэрээний толгойд бууж, мөрөө дахин хайх ёсгүй. */
export function notificationHref(
  n: { kind: string; contract_id?: number | null; invoice_id?: number | null },
  role: string | undefined,
): string | null {
  if (n.contract_id) return invoiceHref(n.contract_id, n.invoice_id);
  const to = NOTE_ROUTE[n.kind];
  if (!to) return null;
  return role === "factory" && FACTORY_BLOCKED.has(to) ? null : to;
}

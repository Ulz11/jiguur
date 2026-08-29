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

/* ---------- Гэрээний жагсаалтын төлөв ---------- */

/** Гэрээнүүд хуудасны төлөвийн шүүлтүүрүүд (Contracts.tsx-ийн FILTERS-тэй нэг эх сурвалж) */
export const CONTRACT_FILTERS = ["all", "active", "ending", "overdue", "closed", "opening"] as const;
export type ContractFilter = (typeof CONTRACT_FILTERS)[number];

/** «3 нь удахгүй дуусна» гэдэг тоо нь АЛЬ гэрээнүүд болохыг хэлэх ёстой.
 *  Шүүлтүүр нь хаягаар дамжина: холбоос нь тэмдэглэгдэж, буцаж ирэхэд ч
 *  ижил жагсаалт нээгдэнэ (хуудасны дотоод төлөв бол зөвхөн нэг товшилтын
 *  настай). */
export function contractsHref(state?: ContractFilter | null): string {
  return !state || state === "all" ? "/contracts" : `/contracts?state=${state}`;
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
 *  харах нь холбоосгүйгээс дор. */
export function notificationHref(
  n: { kind: string; contract_id?: number | null },
  role: string | undefined,
): string | null {
  if (n.contract_id) return contractHref(n.contract_id);
  const to = NOTE_ROUTE[n.kind];
  if (!to) return null;
  return role === "factory" && FACTORY_BLOCKED.has(to) ? null : to;
}

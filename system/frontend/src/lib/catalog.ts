/* Материалын каталогийн ЦЭВЭР дүрмүүд — «шинэ материал» ба «байгаа материал
 * дээр зэрэглэлийн үнэ нэмэх» гэсэн ХОЁР хаалганы ард НЭГ л тооцоо зогсоно.
 *
 * ЯАГААД ТУСДАА ФАЙЛ ВЭ. Каталогийн цонх нь одоо ХОЁР хуудаснаас нээгддэг
 * (Тохиргоо ба Агуулах). Цонх нь нэг хэрэгжилт хэвээр (`components/
 * CatalogModals.tsx`) ч түүний доторх тооцоо нь МӨНГӨ тээдэг тул нүдээр
 * биш, тестээр баригдах ёстой:
 *   · НБҮнэ  → дутагдуулсан гарцын нэхэмжлэл (акт);
 *   · Худалдах үнэ → «Худалдаа болгох» гарц.
 * Буруу мөр илгээх нь харилцагчийн тооцоог хөдөлгөнө.
 */

export type Grade = { id: number; code: string; [k: string]: unknown };

export type GradePriceRow = {
  grade_id: number;
  /** Зэрэглэлийн код — цонхон дээр pill болж зогсоно (сервер рүү явахгүй). */
  grade: string;
  nb_price: number;
  sale_price: number;
};

export type MaterialForm = {
  name: string;
  category: string;
  base_rate: number;
  repair_fee: number;
  prices: GradePriceRow[];
};

/** Цонх нээгдэхэд суух суурь талбарууд (мөрөөс ТУСДАА — `formDirty` хавтгай). */
export function materialBase(m: any): Omit<MaterialForm, "prices"> {
  return {
    name: m?.name || "",
    category: m?.category || "Хэв",
    base_rate: m?.base_rate ?? 0,
    repair_fee: m?.repair_fee ?? 0,
  };
}

/**
 * Зэрэглэл БҮРД нэг мөр — байгаа үнэ дүүрч, байхгүй нь 0-оор НЭЭЛТТЭЙ зогсоно.
 *
 * ЭНЭ БОЛ «байгаа материал дээр шинэ төрөл нэмэх» гэдгийн бүх механизм:
 * шинэ зэрэглэл үүсмэгц материал бүр дээр 0-тэй мөр өөрөө гарч ирж, Отгоо
 * түүн рүү үнээ бичихэд тэр материал шинэ зэрэглэлээ авна. Зэрэглэлийн
 * эрэмбийг СЕРВЕРИЙНХЭЭР үлдээнэ (`/api/grades` нь `sort`-оор эгнүүлдэг) —
 * цонх бүр өөрөө эрэмбэлбэл хоёр хаалга ХОЁР өөр дараалал үзүүлнэ.
 */
export function gradePriceRows(grades: Grade[], m: any): GradePriceRow[] {
  const existing: any[] = m?.prices || [];
  return (grades || []).map((g) => {
    const ex = existing.find((p) => p.grade_id === g.id);
    return {
      grade_id: g.id,
      grade: g.code,
      nb_price: ex?.nb_price ?? 0,
      sale_price: ex?.sale_price ?? 0,
    };
  });
}

/**
 * Мөр бүхий маягтын «бохирдсон эсэх».
 *
 * `formDirty` нь массивыг ЗААГААР харьцуулдаг тул үнийн мөрүүдийг барьж
 * чадахгүй: 6 зэрэглэлийн НБҮнэ бөглөчихөөд санамсаргүй гадуур товшилт
 * бүгдийг чимээгүй устгана. Тиймээс мөрүүд өөрсдийн харьцуулалттай.
 */
export function pricesDirty(before: GradePriceRow[], after: GradePriceRow[]): boolean {
  if (before.length !== after.length) return true;
  return after.some((p, i) =>
    p.grade_id !== before[i]?.grade_id
    || p.nb_price !== before[i]?.nb_price
    || p.sale_price !== before[i]?.sale_price);
}

/**
 * Сервер рүү явах БИЕ.
 *
 * ХОЁР зүйлийг санаатай хийнэ:
 *
 * 1. ХООСОН МӨР ЯВУУЛАХГҮЙ. Зэрэглэл бүр мөртэй нээгддэг тул үнэ өгөөгүй
 *    зэрэглэлүүд 0/0-оор дүүрэн ирнэ — тэднийг илгээвэл материал бүр
 *    зэрэглэл болгонтойгоо «үнэтэй» болж, каталог нь худал дүүрнэ.
 *
 * 2. `code`, `unit`-ыг ХЭВЭЭР зөөнө. `PUT /api/materials/{id}` нь
 *    `m.code, m.unit = body.code, body.unit` гэж ШУУД бичдэг бөгөөд
 *    `MaterialIn` дээр тэдгээр нь `""` ба `"ш"` гэсэн анхдагчтай. Өөрөөр
 *    хэлбэл эдгээрийг илгээхгүй бол ҮНЭ ЗАСАХ бүрд материалын код арчигдаж,
 *    хэмжих нэгж нь «ш» рүү буцна (`MaterialDetail` тэр нэгжийг ханддаг).
 *    Цонх дээр эдгээр талбар БАЙХГҮЙ — тиймээс нээгдсэн утгыг нь дагуулна.
 */
export function materialPayload(m: any, f: MaterialForm) {
  return {
    name: f.name,
    category: f.category,
    code: m?.code ?? "",
    unit: m?.unit ?? "ш",
    base_rate: f.base_rate,
    repair_fee: f.repair_fee,
    prices: f.prices
      .filter((p) => p.nb_price || p.sale_price)
      .map((p) => ({ grade_id: p.grade_id, nb_price: p.nb_price, sale_price: p.sale_price })),
  };
}

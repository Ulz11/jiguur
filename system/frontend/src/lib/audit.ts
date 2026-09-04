/* Үйлдлийн бүртгэлийн ТОЛЬ — backend-ийн түлхүүр → Отгоо эгчийн үг.
 *
 * ЯАГААД `pages/Audit.tsx`-ээс салгав: тэнд толь нь `ACTIONS[r.action] || r.action`
 * гэсэн ЧИМЭЭГҮЙ уналттай сууж байв. Дутуу түлхүүр нь алдаа өгдөггүй —
 * зүгээр л «void», «rate_change», «book_penalty» гэсэн ТҮҮХИЙ АНГЛИ үгийг
 * дэлгэц дээр зурчихдаг. Отгоо эгч англи мэдэхгүй; тэр мөрөнд юу болсныг
 * тааж чадахгүй тул бүртгэл нь бүхэлдээ уншигдахаа болино.
 *
 * Одоо тольнууд ЭНД, backend-ийн бодит түлхүүрийн жагсаалттай хамт сууна.
 * `audit.test.ts` нь тэр хоёрыг тулгаж, дутууг хөгжүүлэлтийн үед унагаана —
 * дэлгэц дээр гарахаас нь өмнө.
 *
 * ⚠ Backend-д `audit.log(...)` нэмэх бүрд ЭНД гурван зүйл нэмнэ:
 *   1. `BACKEND_ACTIONS`/`BACKEND_ENTITIES` жагсаалтад түлхүүр;
 *   2. `ACTIONS`/`ENTITIES` толинд монгол нэр;
 *   3. өнгө нь UI-ЗАРЧИМ §4-ийн шатаар (улаан = устгах/хүчингүй,
 *      шар = анхаар, саарал = хүний шийдвэр биш).
 * Түлхүүрийн жагсаалтыг эндээс шинэчилнэ:
 *   grep -rn "\.log(db" system/backend/app
 */

/** Товчны/пилийн монгол нэр ба өнгөний ангилал. */
export const ACTIONS: Record<string, [label: string, pill: string]> = {
  create: ["Үүсгэсэн", "pill-green"],
  update: ["Зассан", "pill-blue"],
  delete: ["Устгасан", "pill-red"],
  confirm: ["Баталгаажуулсан", "pill-green"],
  stocktake: ["Тооллого", "pill-amber"],
  settle_deposit: ["Барьцаа тооцсон", "pill-violet"],
  rebuild: ["Дахин бодсон", "pill-violet"],
  /* Устгал БИШ — сөрөг бичилт (H1): хоёр мөр хоёулаа үлддэг. Тиймээс
     «Устгасан» гэж нэрлэвэл худал; өнгө нь улаан хэвээр, үг нь өөр. */
  void: ["Хүчингүй болгосон", "pill-red"],
  close: ["Гэрээ хаасан", "pill-grey"],
  /* StatePill.penalty-тэй ижил шар — нэг ойлголт, нэг өнгө. */
  book_penalty: ["Алданги нэхсэн", "pill-amber"],
  /* Хүнгүй зам (`services/cron.py`). Саарал: хүний ШИЙДВЭР биш, суурь явц. */
  cron: ["Автоматаар үүсгэсэн", "pill-grey"],
  /* ХАМТАРСАН ГАРЫН ҮСЭГ (№69) — «энэ тоог хоёр тал баталсан». Ногоон:
     батлагдсан тоо; цуцлалт нь шар («анхаар»), улаан БИШ (мөнгө хөдлөөгүй). */
  agree: ["Тооцоо нийлсэн", "pill-green"],
  unagree: ["Нийлснийг цуцалсан", "pill-amber"],
  /* ХОЛБОО БАРИХ ХҮН (№72, 73) — устгал БАЙХГҮЙ: ажлаас гарсан хүн мөрөндөө
     үлдэж, зөвхөн залгах жагсаалтаас гарна. Тиймээс «Устгасан» БИШ. */
  deactivate: ["Идэвхгүй болгосон", "pill-grey"],
};

/** Биетийн монгол нэр — мөрөн дээр ба ШҮҮЛТҮҮРИЙН товчин дээр хоёуланд нь. */
export const ENTITIES: Record<string, string> = {
  contract: "Гэрээ", contract_item: "Гэрээний мөр", payment: "Төлбөр", stock: "Агуулах",
  collection_note: "Тэмдэглэл", loan: "Зээл", barter: "Бартер", salary: "Цалин",
  material: "Материал", grade: "Зэрэглэл", settings: "Тохиргоо", client: "Харилцагч",
  movement: "Хөдөлгөөн", invoice: "Нэхэмжлэл",
  /* §3-ын толь бичгээр — гэрээний дэлгэрэнгүй дээр яг эдгээр үгс зогсоно. */
  akt: "Акт", rate_change: "Тарифын өөрчлөлт", penalty_charge: "Алдангийн нэхэлт",
  machine: "Механизм", machine_log: "Механизмын бүртгэл",
  machine_invoice: "Механизмын нэхэмжлэл",
  /* Барьцааны ГҮЙДЭГ ДЭВТЭР (H8) — байршуулав / нэмэв / суутгав / буцаав. */
  deposit_event: "Барьцааны бичилт",
  /* Түрээс БИШ бичилт (H11) — олгосон зээл, цалин, кран, хоорондын тооцоо. */
  client_entry: "Харилцагчийн бичилт",
  /* ЗАХЫН ТЭМДЭГЛЭЛ (P1-22) — «7.06нд тооцов», «ирээгүй», ⚑ шар туг.
     `collection_note` («Тэмдэглэл» — авлагын яриа) -тай ЯЛГААТАЙ үгтэй байх
     ёстой: шүүлтүүрийн хоёр товч ижил нэртэй бол аль нь юу вэ гэдэг алга. */
  note: "Захын тэмдэглэл",
  /* Гарын үсэгтнүүд (№72, 73) — нярав, менежер, захирал. */
  client_contact: "Холбоо барих хүн",
};

/** Backend-ийн `audit.log(db, user, ACTION, …)` дуудлагад БОДИТООР гардаг үйлдлүүд. */
export const BACKEND_ACTIONS = [
  "create", "update", "delete", "void", "stocktake",
  "settle_deposit", "rebuild", "close", "book_penalty", "cron",
  "agree", "unagree", "deactivate",
] as const;

/** Backend-ийн `audit.log(db, user, action, ENTITY, …)` дуудлагад гардаг биетүүд. */
export const BACKEND_ENTITIES = [
  "contract", "contract_item", "payment", "stock", "collection_note",
  "movement", "invoice", "akt", "rate_change", "penalty_charge",
  "machine", "machine_log", "machine_invoice", "deposit_event", "client_entry",
  "note", "client_contact",
] as const;

/** Үйлдлийн нэр + пилийн анги. Танихгүй түлхүүр ирвэл ядаж СААРАЛ болж,
 *  түүхий түлхүүрээ өөрөө хэлнэ — чимээгүй алга болохоос дээр. */
export function actionLabel(action: string): [string, string] {
  return ACTIONS[action] ?? [action, "pill-grey"];
}

/** Биетийн нэр — мөрөнд ба шүүлтүүрийн товчинд ИЖИЛ үг гарахын тулд нэг эх. */
export function entityLabel(entity: string): string {
  return ENTITIES[entity] ?? entity;
}

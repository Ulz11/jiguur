/* Дарж засах — ХОЁР АЛХАМ, гэхдээ ГАРААР ч дуустал явна.
 *
 * Хоёр алхам байх шалтгаан хэвээр: нэг товшилт нэг тоог чимээгүй солих ёсгүй
 * («330 → 3300» гэсэн алдаа хүснэгтийн дундуур үл мэдэгдэн өнгөрнө). Гэхдээ
 * ХОЁР дахь алхмыг зөвхөн ХУЛГАНААР хийж болдог байв: утга бичээд Enter
 * дарахад «Хадгалах уу?» гарч ирээд, дахин Enter дарахад ЮУ Ч болохгүй —
 * гараар ажилладаг хүн Tab дарж ✓ чип рүү очих замыг өөрөө олох ёстой болно.
 * Хоёр дахь Enter нь ЯГ тэр чипийг дарна: алхам хоёул хэвээр, гарц нээгдэв.
 *
 * Escape нь ХОЁУЛАН горимд цуцална — баталгаажуулах горимд орсон хүн буцах
 * замгүй үлдэхгүй.
 *
 * Шийдвэр нь DOM-гүй, цэвэр функц: React-гүйгээр шалгагдана.
 */
export type EditMode = "view" | "edit" | "confirm";

/** `none` — хөндлөнгөөс орохгүй · `cancel` — харах горим руу ·
 *  `ask` — баталгаажуулалт асуух · `commit` — сервер рүү явуулах */
export type EditKeyAction = "none" | "cancel" | "ask" | "commit";

export function editKeyAction(key: string, mode: EditMode, busy = false): EditKeyAction {
  if (mode === "view") return "none";       // харах горимд энэ нь энгийн товч
  if (key === "Escape") return "cancel";
  if (key !== "Enter") return "none";       // бичихэд саад болохгүй
  if (mode === "edit") return "ask";
  // Сервер хариу нэхэж байх хоромд дарсан Enter нэг засварыг хоёр удаа явуулна
  return busy ? "none" : "commit";
}

/* ══════════════════════════════════════════════════════════════════════════
   ХЭН ЮУГ ЗАСАХ ВЭ — дэлгэц ба серверийн НЭГ ДҮРЭМ.

   «Үргэлж 403 болдог товч» бол худал амлалт: дарга талбай дээр ✎ дарж,
   тоогоо бичээд, ✓ дарж, улаан зурвас уншина. Тиймээс эдгээр нь серверийн
   хаалгуудтай (`routers/contracts.py: patch_movement_line`, `patch_movement`,
   `routers/machines.py: _own_log`) ҮГЧЛЭН ижил байх ёстой — цэвэр функц тул
   хоёр талыг зэрэг уншиж болно.
   ══════════════════════════════════════════════════════════════════════════ */

type Role = string | null | undefined;

/** БУЦААЛТЫН мөрийн тоо, засвар/акт, зэрэглэл, падан, гар хоног.
 *
 *  Талбай дээр «40ш» гэж бичээд 38 байсныг олж мэдэх нь өдөр бүрийн явдал —
 *  тэр мөрийг бүртгэсэн хүн өөрөө зална. ОЛГОЛТЫН мөр (падан төрүүлдэг,
 *  тарифтай) нь эзнийх хэвээр. */
export function canEditReturnDetail(role: Role, movementType: string): boolean {
  if (role === "manager") return true;
  return role === "factory" && movementType === "RETURN";
}

/** ТАРИФ / нэгж үнэ — МӨНГӨ. Зураас хэвээр. */
export function canEditRate(role: Role): boolean {
  return role === "manager";
}

/** ХӨДӨЛГӨӨНИЙ ОГНОО — эзний зам, НЭГ УЧРААС бусад: өнөөдөр ӨӨРӨӨ
 *  бүртгэсэн хүн өдрөө зөв болгоно (маргааш нь тэр мөр түүх болно). */
export function canEditMovementDate(role: Role, mineToday: boolean): boolean {
  return role === "manager" || (role === "factory" && mineToday);
}

/** МЕХАНИЗМЫН бүртгэлийн мөр — засах, устгах. Мөнгөний эзэд үргэлж;
 *  дарга нь ӨНӨӨДӨР ӨӨРИЙН бичсэн мөрөн дээр. */
export function canEditMachineLog(role: Role, mineToday: boolean): boolean {
  return role === "manager" || role === "finance"
    || (role === "factory" && mineToday);
}

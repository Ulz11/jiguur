/* Зээлийн мөрүүдийг УНШУУЛАХ ганц газар (frontend тал).
 *
 * Нэг зээлийн түүхэнд гурван өөр утгатай мөр зэрэгцэнэ:
 *   · `interest`  — хүүгийн төлөлт: үлдэгдлийг ХӨДӨЛГӨХГҮЙ;
 *   · `principal` — үндсэн төлөлт: үлдэгдлийг БУУРУУЛНА;
 *   · `topup`     — НЭМЭЛТ ОЛГОЛТ: нэг гэрээн дээр дахин авсан мөнгө, үлдэгдлийг ӨСГӨНӨ.
 *
 * Сервер тал (`services/loans.py`) ЯГ ижил дүрэмтэй: үлдэгдэл = үндсэн дүн +
 * олголтууд − үндсэн төлөлтүүд; сарын хүү нь ОДООГИЙН үлдэгдлээр бодогдоно.
 */

export const PART_LABEL: Record<string, string> = {
  interest: "Хүү",
  principal: "Үндсэн",
  topup: "Нэмэлт олголт",
};

export function partLabel(part: string): string {
  return PART_LABEL[part] ?? part;
}

/** Үлдэгдэлд үзүүлэх нөлөөний тэмдэг — «+400,000₮» нь АВСАН, «−400,000₮» нь ТӨЛСӨН. */
export function partSign(part: string): string {
  return part === "topup" ? "+" : part === "principal" ? "−" : "";
}

/** Мөрийг устгавал үлдэгдэл хэд болохыг урьдчилан харуулна (баталгаажуулах цонхонд). */
export function balanceAfterRemoving(balance: number, part: string, amount: number): number {
  if (part === "principal") return balance + amount;
  if (part === "topup") return balance - amount;
  return balance;
}

/** Ойрын төлөлтөд харагдах дүн — серверийн `planned_due`-тэй нэг дүрэм:
 *  гэрээгээр тохирсон сарын төлөлт байвал түүгээр, үгүй бол сарын хүүгээр. */
export function plannedDue(l: { monthly_payment?: number; monthly_due: number }): number {
  return (l.monthly_payment || 0) > 0 ? (l.monthly_payment as number) : l.monthly_due;
}

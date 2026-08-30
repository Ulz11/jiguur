/* «Буцаагдахгүй ⇒ danger» дүрмийн хамгаалалт.
 *
 * `ConfirmModal` нь `danger` өгөгдөөгүй бол ГҮЙЦЭТГЭХ товчийг өөрөө сонгодог
 * (autoFocus) — Enter дарахад үйлдэл шууд явна. Энэ нь «Ачилт баталгаажуулах»
 * гэх мэт БУЦААГДДАГ үйлдэлд зөв: хамгийн түгээмэл хариулт нүдний өмнөө байна.
 * Гэвч модал өөрөө «буцаагдахгүй» гэж бичсэн атлаа `danger` авахаа мартвал
 * санамсаргүй нэг Enter 5,950,000₮-ийн цалин олгочихно (Salary.tsx-д яг ийм
 * байв). Хүн мартдаг тул дүрмийг МАШИН барина — хөгжүүлэлтийн үед console-д
 * дуугарч, ажилд гарахаас нь өмнө барина.
 *
 * ЗӨВХӨН үгүйсгэсэн хэлбэрийг таана: «сэргээх», «буцаах» гэсэн ЭСРЭГ утгатай
 * үйлдлүүд (зээл сэргээх) худал дуугарвал анхааруулга хог болж, хэн ч уншихаа
 * болино.
 */
const IRREVERSIBLE = ["буцаагдахгүй", "сэргэхгүй"];

/** React зангилаанаас ҮГИЙГ нь гаргаж авна — `intro` нь ихэвчлэн <b>-тэй JSX. */
export function nodeText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  const kids = (node as { props?: { children?: unknown } })?.props?.children;
  return kids === undefined ? "" : nodeText(kids);
}

/** Энэ текст «эргэж буцахгүй» гэж амлав уу? */
export function saysIrreversible(node: unknown): boolean {
  const t = nodeText(node).toLowerCase();
  return IRREVERSIBLE.some((w) => t.includes(w));
}

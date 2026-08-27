/* Бүтэн мөр дарагддаг бол ГАРААР ч дарагдах ёстой.
 *
 * Жагсаалтын мөр `onClick`-тэй боловч `<tr>`/`<div>` хэвээрээ байвал Tab дарж
 * яваа хүн түүн дээр огт зогсож чадахгүй — хулгана барьж чадахгүй хүнд гэрээ
 * нээх зам БАЙХГҮЙ гэсэн үг. Энэ туслах нь мөр бүрд нэг ижил дүрэм өгнө:
 *   · `tabIndex=0`   — Tab-аар очно
 *   · Enter / Space  — дарсантай ижил үйлдэл (Space нь хуудсыг гүйлгэхгүй)
 *   · `aria-label`   — «Гэрээ №26/07 нээх» гэж ХААШАА очихыг нэрлэнэ
 *
 * Дотор нь өөрийн товч/талбартай мөрүүд бий (InlineEdit, «Төлөлт», «Ачсан ✓»).
 * Тэдгээрийн дотор Enter дарахад мөр өөрөө хөдлөх ёсгүй — тиймээс товчлуур нь
 * ЯГ мөр дээрээ ирсэн үед л (`target === currentTarget`) ажиллана.
 *
 * `role`:
 *   · "button" — жирийн дарагддаг хайрцаг (задардаг мөр, мэдэгдэл).
 *   · "link"   — өөр хуудас руу аваачдаг хайрцаг.
 *   · "row"    — ХҮСНЭГТИЙН мөр. `<tr>`-ийн уугуул үүрэг нь `row`; түүнийг
 *                `button` болговол хүснэгтийн бүтэн тор эвдэрч, Отгоогийн
 *                excel маягийн уншилт (мөр/багана) алдагдана. Гараар очих,
 *                Enter дарах, нэрлэгдэх гурав нь role-гүйгээр бүрдэнэ.
 */

/** Enter/Space-ийн товчлуурын мөн чанар — DOM-гүй шалгагдана. */
export function isActivateKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

type KeyLike = {
  key: string;
  target: unknown;
  currentTarget: unknown;
  preventDefault: () => void;
};

export type RowClickProps = {
  role: "button" | "link" | "row";
  tabIndex: 0;
  "aria-label": string;
  onClick: () => void;
  onKeyDown: (e: KeyLike) => void;
};

export function rowClickProps(
  onActivate: () => void,
  label: string,
  role: "button" | "link" | "row" = "button",
): RowClickProps {
  return {
    role,
    tabIndex: 0,
    "aria-label": label,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (!isActivateKey(e.key)) return;
      // Дотоод товч/талбар дээр дарсан Enter нь ТҮҮНИЙХ — мөр хөндлөнгөөс орохгүй
      if (e.target !== e.currentTarget) return;
      e.preventDefault();   // Space нь хуудсыг доош гүйлгэхгүй
      onActivate();
    },
  };
}

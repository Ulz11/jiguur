/* Жагсаалтыг баганаар нь эрэмбэлэх цэвэр логик (номын сан нэмэхгүй).
 *
 * Авлагын жагсаалт нь «хэнд эхэлж залгах вэ» гэсэн НЭГ асуултад хариулдаг.
 * Тиймээс анхны эрэмбэ нь хамгийн их хэтэрсэн дүнгээр буурна; Отгоо хамгийн
 * хуучин өрөөр харах бол баганынх нь толгойг дарна. */

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

/** Багана дарахад ЮУ болох вэ:
 *  · өөр багана → тухайн баганын ХЭРЭГТЭЙ талаас эхэлнэ (их → бага);
 *  · ижил багана → зүгээр л эргэнэ.
 *  Мөнгө ба хоног хоёулаа «их нь эхэлж анхаарал татна» гэсэн утгатай тул
 *  анхны чиглэл нь буурах байна. */
export function nextSort<K extends string>(cur: SortState<K>, key: K): SortState<K> {
  return cur.key === key
    ? { key, dir: cur.dir === "desc" ? "asc" : "desc" }
    : { key, dir: "desc" };
}

/** Хүснэгтийн толгойн `aria-sort` — эрэмбийг ХАРААГҮЙ хүн ч мэднэ. */
export function ariaSort<K extends string>(cur: SortState<K>, key: K):
  "ascending" | "descending" | undefined {
  if (cur.key !== key) return undefined;
  return cur.dir === "asc" ? "ascending" : "descending";
}

/** Тоон талбараар эрэмбэлнэ. Эх массивыг ХӨНДӨХГҮЙ (шүүлтүүрийн үр дүнг
 *  газар дээр нь эргүүлбэл дараагийн дүрслэлд дараалал нь тогтворгүй болно).
 *  Тэнцүү утгууд анхны дараалалаа хадгална (ES2019 stable sort). */
export function sortByNumber<T>(rows: readonly T[], value: (r: T) => number, dir: SortDir): T[] {
  return rows.slice().sort((a, b) => (dir === "asc" ? value(a) - value(b) : value(b) - value(a)));
}

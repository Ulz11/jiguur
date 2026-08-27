/* Баримт гаргах (PDF, Excel) — ЯВЦ ба БҮТЭЛГҮЙТЭЛ хоёулаа харагддаг газар.
 *
 * Өмнө нь `onClick={() => openPdf(path)}` гэж шууд дуудаж байв:
 *   · сервер 3 секунд PDF нийлүүлж байхад ТОВЧ юу ч болоогүй мэт зогсоно —
 *     Отгоо дахин дарж, хоёр таб нээгдэнэ;
 *   · алдаа гарвал `openPdf` шидсэн алдааг ХЭН Ч барихгүй — консолд unhandled
 *     rejection үлдээд, дэлгэц дээр ЮУ Ч болохгүй. Хэрэглэгч дахин дарна.
 * Excel татах хоёр газар бүр ч дор байсан: `res.ok`-ыг шалгалгүй алдааны JSON-ыг
 * `avlaga.xlsx` нэрээр диск рүү хадгалдаг байв.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { openPdf, downloadFile } from "../api";
import { useToast } from "../ui";
import { FALLBACK_ERROR } from "./errors";

/** Алдааны объектоос хүн уншихаар мөр гаргана (`api`/`openPdf` нь аль хэдийн
 *  серверийн `detail`-ыг мөр болгож `Error`-т хийсэн байдаг). */
export function failMessage(e: unknown): string {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.trim() ? m.trim() : FALLBACK_ERROR;
}

export type BusyTask = {
  /** Яг ОДОО өөр ажил явж байна уу (давхар дарахаас хамгаална) */
  busy: boolean;
  /** Явж буй ажлын түлхүүр — дуусахад `null` */
  setBusy: (key: string | null) => void;
  toast: (msg: string, kind: "err") => void;
  /** Бүрэлдэхүүн амьд байгаа эсэх — салсан бол төлөв хөдөлгөхгүй */
  alive: () => boolean;
  run: () => Promise<unknown>;
};

/** Нэг удаад НЭГ баримт: эхлэхэд түгжиж, дуусахад тайлж, алдааг ХАРУУЛНА.
 *  React-гүй тул шууд шалгагдана (docs.test.ts). */
export async function runBusy(key: string, t: BusyTask): Promise<"done" | "failed" | "skipped"> {
  if (t.busy) return "skipped";
  t.setBusy(key);
  try {
    await t.run();
    return "done";
  } catch (e) {
    t.toast(failMessage(e), "err");
    return "failed";
  } finally {
    // Амжилттай бол хуудас дахин ачаалагдаж энэ бүрэлдэхүүн салсан байж болно —
    // салсан бүрэлдэхүүн дээр setState дуудвал React анхааруулга өгнө.
    if (t.alive()) t.setBusy(null);
  }
}

/** usePdf / useDownload хоёрын нийтлэг зүрх. */
function useBusyRunner() {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Товчийг хоёр удаа шууд дараад амжихад `busyKey` төлөв хараахан
  // шинэчлэгдээгүй байдаг — түгжээг ref-ээр барина.
  const busyRef = useRef<string | null>(null);
  const alive = useRef(true);
  /* `alive`-ыг effect-ийн БИЕД дахин асаана. React 18-ийн StrictMode нь
     effect-ийг mount → cleanup → mount гэж давхар дуудна: цэвэрлэгээ ганцхан
     удаа `false` болгоод дахин асаах хүн байхгүй бол товч ҮҮРД «…» дээрээ
     хөлдөнө (амьд байхад нь л төлөв цэвэрлэдэг тул). */
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const start = useCallback((key: string, run: () => Promise<unknown>) =>
    runBusy(key, {
      busy: busyRef.current !== null,
      setBusy: (k) => { busyRef.current = k; setBusyKey(k); },
      toast,
      alive: () => alive.current,
      run,
    }), [toast]);

  return { start, busyKey, busy: busyKey !== null };
}

/** PDF нээх: `open(path)` дуудаад товчоо `busyPath === path` үед «…» болгоно. */
export function usePdf() {
  const { start, busyKey, busy } = useBusyRunner();
  const open = useCallback((path: string) => start(path, () => openPdf(path)), [start]);
  return { open, busy, busyPath: busyKey };
}

/** Файл татах (Excel, хавсралт) — PDF-тэй ижил дүрэм. */
export function useDownload() {
  const { start, busyKey, busy } = useBusyRunner();
  const download = useCallback((path: string, filename: string) =>
    start(path, () => downloadFile(path, filename)), [start]);
  return { download, busy, busyPath: busyKey };
}

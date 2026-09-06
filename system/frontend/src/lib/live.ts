import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Дэлгэц хэзээ өөрөө шинэчлэгдэхийг шийддэг цэвэр логик (X3 — амьд тайлан).
 *
 *  Дүрэм:
 *  - `interval` — таб нуугдсан үед татахгүй (нээгээгүй дэлгэцийг сэргээх утгагүй).
 *  - `focus` — цонх руу буцаж ирсэн гэсэн үг, өөрөө харагдаж байгааг хэлж байгаа
 *    тул `hidden` тугийг үл тоомсорлоно.
 *  - Аль ч тохиолдолд сүүлийн татлагаас хойш `minGapMs` болоогүй бол татахгүй
 *    (лаптоп сэрэхэд focus + visibilitychange хоёулаа дуудагдаад давхардахаас).
 *  - `interval` нь бүтэн `intervalMs` өнгөрсөн үед л татна.
 */
export class Poller {
  private last = -Infinity;

  constructor(private intervalMs: number, private minGapMs = 5000) {}

  shouldFetch(kind: "interval" | "focus", now: number, hidden: boolean): boolean {
    if (kind === "interval" && hidden) return false;
    const since = now - this.last;
    if (since < this.minGapMs) return false;
    if (kind === "interval" && since < this.intervalMs) return false;
    return true;
  }

  markFetched(now: number): void {
    this.last = now;
  }
}

/** ЯМАР НЭГ ЦОНХ НЭЭЛТТЭЙ БАЙНА УУ.
 *
 *  Чимээгүй шинэчлэлт нь Отгоо эгчийн бөглөж байгаа зүйлийн ДООГУУР датаг
 *  сольж болохгүй: 15 мөр бөглөж байхад тоо нь өөрчлөгдвөл бичсэн зүйл нь
 *  эргэлзээ болно. Хуудас өөрийн цонхнуудаа `busyForm`-оор мэддэг ч
 *  ХҮҮХЭД бүрэлдэхүүний цонхнуудыг (холбоо барих хүн нэмэх, тэмдэглэл)
 *  мэдэхгүй. `role="dialog"` нь бүх модалын нийтлэг тэмдэг тул НЭГ мөрөөр
 *  бүгдийг барина. DOM байхгүй орчинд (тест, SSR) `false`. */
export function dialogOpen(): boolean {
  return typeof document !== "undefined"
      && !!document.querySelector('[role="dialog"]');
}

/** Хуудсыг амьд байлгана: хамаарал (scope, months …) солигдоход шууд, дараа нь
 *  `intervalMs` тутам болон цонх руу буцаж ирэхэд дахин ачаална.
 *
 *  `load(background)` — `background=false` бол хамаарал солигдсон/анхны ачаалал
 *  (хуудас өөрөө эргэлдэгч үзүүлж, алдааг toast-оор хэлнэ), `background=true` бол
 *  чимээгүй шинэчлэлт (state-ээ null болгохгүй, алдааг залгина). */
export function useLive(
  load: (background: boolean) => void,
  deps: unknown[],
  intervalMs = 60_000,
) {
  const cb = useRef(load);
  // Хамгийн сүүлийн хувилбарыг барина (доорх effect зөвхөн deps дээр дахин уяна).
  useEffect(() => { cb.current = load; });

  useEffect(() => {
    const poller = new Poller(intervalMs);
    cb.current(false);
    poller.markFetched(Date.now());

    const tick = (kind: "interval" | "focus") => {
      const now = Date.now();
      if (!poller.shouldFetch(kind, now, document.hidden)) return;
      poller.markFetched(now);
      cb.current(true);
    };
    const onInterval = () => tick("interval");
    const onFocus = () => tick("focus");
    const onVisible = () => { if (!document.hidden) tick("focus"); };

    const id = window.setInterval(onInterval, intervalMs);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    /* Топбарын заагч дээр дарахад ЭНЭ хуудсаа дахин татна (`live.retry`).
       Бүртгэлгүй бол заагч нь зөвхөн холболтоо шалгана — Отгоогийн бөглөж
       байгаа зүйлийг дахин ачаалалт устгах ёсгүй. */
    live.setRetry(() => { poller.markFetched(Date.now()); cb.current(true); });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      live.setRetry(null);
    };
  }, [...deps, intervalMs]);
}

/* ══════════════════════════════════════════════════════════════════════════
   ТОПБАРЫН ТӨЛӨВ — «ЭНЭ ТОО ХЭР ШИНЭ ВЭ?»

   Топбарын баруун дээд буланд НОГООН ЦЭГ 24 цаг зогсдог байв: `title` нь
   «Систем хэвийн ажиллаж байна» гэж хэлдэг ч тэр өгүүлбэр нь HTML-д ХАТУУ
   бичигдсэн — сүлжээ тасарсан ч, сервер унасан ч, дэлгэц дээрх тоо гурван
   цагийн өмнөх байсан ч ЯГ ТЭР ногоон цэг ижилхэн гэрэлтэнэ. Отгоо эгч
   хуучирсан тоог хараад залгах хүнээ сонгож болно.

   Одоо цэг нь ҮНЭНИЙГ хэлнэ:
     · «Шинэчилсэн: 14:03»          — сүүлийн АМЖИЛТТАЙ татлагын цаг;
     · «Шинэчлэгдээгүй — 4 мин»     — татлага унасан (шар);
     · «Холболт тасарсан»           — гурав дараалан унасан (улаан).
   Дарахад дахин оролдоно.

   Логик нь ЦЭВЭР (React-гүй, DOM-гүй) — цаг, тоолуур хоёроос үг гарна.
   ══════════════════════════════════════════════════════════════════════════ */

/** Хэдэн дараалсан уналтын дараа «Холболт тасарсан» гэж хэлэх вэ. */
export const DOWN_AFTER = 3;

export type LiveTone = "ok" | "warn" | "down" | "idle";
export type LiveSnapshot = {
  /** Сүүлийн АМЖИЛТТАЙ хариу (ms). Хараахан нэг ч ирээгүй бол null. */
  okAt: number | null;
  /** Түүнээс хойшх дараалсан уналтын тоо. */
  fails: number;
};

export const LIVE_IDLE: LiveSnapshot = { okAt: null, fails: 0 };

/** Цагийн шошго — ОРОН НУТГИЙН 24 цагаар («14:03»). */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Хэдэн минут өнгөрөв (доош нь бүхэлчилнэ, сөрөг нь 0). */
export function minutesSince(then: number, now: number): number {
  return Math.max(0, Math.floor((now - then) / 60_000));
}

export function liveTone(s: LiveSnapshot): LiveTone {
  if (s.fails >= DOWN_AFTER) return "down";
  if (s.fails > 0) return "warn";
  return s.okAt === null ? "idle" : "ok";
}

/** Заагчийн ҮГ. Тоо биш, ӨГҮҮЛБЭР: «сүүлд хэзээ» гэдэг нь цэгний өнгөнөөс
 *  хамаагүй чухал — өнгө ялгадаггүй хүн ч уншина. */
export function liveText(s: LiveSnapshot, now: number): string {
  const tone = liveTone(s);
  if (tone === "down") return "Холболт тасарсан";
  if (tone === "warn") {
    /* Хэзээ ч амжилттай татаагүй бол «0 мин» гэж худал хэлэхгүй. */
    if (s.okAt === null) return "Шинэчлэгдээгүй";
    return `Шинэчлэгдээгүй — ${minutesSince(s.okAt, now)} мин`;
  }
  if (tone === "idle") return "Шинэчилж байна…";
  return `Шинэчилсэн: ${clockLabel(s.okAt!)}`;
}

/** УТСАН дээрх (≤480px) ХУРААНГУЙ шошго — ЦАГ нь үлдэж, «Шинэчилсэн:» гэдэг
 *  үг нь хумигдана. Урьд нь тэр өргөнд бүтэн бичиг нь нуугдаж, заагч нь 26px
 *  өргөн ЦЭГ болж хоцордог байв: цэг дангаараа ЮУ Ч хэлэхгүй.
 *  Унасан төлөвүүд ҮГЭЭ авч явна — өнгө дангаараа утга зөөхгүй (§4). */
export function liveShort(s: LiveSnapshot, now: number): string {
  const tone = liveTone(s);
  if (tone === "down") return "тасарсан";
  if (tone === "warn") return s.okAt === null ? "хоцорсон" : `${minutesSince(s.okAt, now)} мин`;
  if (tone === "idle") return "…";
  return clockLabel(s.okAt!);
}

/** Хулгана хүрэхэд ба уншигчид — заагч нь ЮУ хийхээ ч хэлнэ. */
export function liveTitle(s: LiveSnapshot, now: number): string {
  const base = liveText(s, now);
  const tone = liveTone(s);
  if (tone === "down") {
    return `${base} — серверээс ${s.fails} удаа дараалан хариу ирсэнгүй. `
         + `Дэлгэц дээрх тоо хуучирсан байж магадгүй. Дарж дахин оролдоно уу.`;
  }
  if (tone === "warn") {
    return `${base} — сүүлийн шинэчлэлт амжилтгүй боллоо. Дарж дахин оролдоно уу.`;
  }
  if (tone === "idle") return "Хуудасны мэдээлэл ачаалагдаж байна.";
  return `${base} — дэлгэц дээрх тоо энэ цагийнх. Дарж дахин шинэчилнэ.`;
}

/* ---------- Амьд төлөвийн НЭГ дэлгүүр ----------
   Хуудас бүр өөрийн заагчтай байвал топбар нь аль хуудасны тухай ярьж
   байгаа нь эргэлзээтэй болно. Тиймээс НЭГ дэлгүүр: `api()` амжилт/уналт
   бүрийг энд хэлж, топбар түүнийг уншина, хуудас солиход тэглэгдэнэ. */
class LiveStore {
  private state: LiveSnapshot = LIVE_IDLE;
  private listeners = new Set<() => void>();
  /** Тухайн хуудасны «дахин татах» — `useLive` бүртгүүлнэ. */
  private retryFn: (() => void) | null = null;

  get = (): LiveSnapshot => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private emit(next: LiveSnapshot) {
    if (next.okAt === this.state.okAt && next.fails === this.state.fails) return;
    this.state = next;
    this.listeners.forEach((f) => f());
  }

  /** Серверээс хариу ИРЛЭЭ — тоолуур тэглэгдэнэ. */
  ok = (now: number = Date.now()): void => this.emit({ okAt: now, fails: 0 });

  /** Хариу ИРСЭНГҮЙ — сүүлийн амжилтын цаг ХЭВЭЭР (тэр нь одоо «хэр хуучин»
   *  гэдгийг хэмжих цэг болно). */
  fail = (): void => this.emit({ okAt: this.state.okAt, fails: this.state.fails + 1 });

  /** Хуудас солигдлоо — шинэ хуудасны тухай шинээр ярина. */
  reset = (): void => this.emit(LIVE_IDLE);

  setRetry = (fn: (() => void) | null): void => { this.retryFn = fn; };
  /** Заагч дээр дарсан — тухайн хуудсаа дахин татна (бүртгэгдээгүй бол null). */
  retry = (): boolean => {
    if (!this.retryFn) return false;
    this.retryFn();
    return true;
  };
}

export const live = new LiveStore();

/** Топбарын заагчид зориулсан унших дэгээ (`useSyncExternalStore` — рендерийн
 *  явцад ч зөрөхгүй). `tick` нь «4 мин» гэсэн тоог минут тутам шинэчилнэ. */
export function useLiveState(): LiveSnapshot {
  return useSyncExternalStore(live.subscribe, live.get, live.get);
}

/** Минут тутамд дахин зурах цохилт — «Шинэчлэгдээгүй — 4 мин» зогсонги
 *  болохгүйн тулд. Хуудас нуугдсан үед ч цаг явсаар байдаг тул интервал
 *  хангалттай (шинэ хариу ирэх бүрд store өөрөө дахин зурна). */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

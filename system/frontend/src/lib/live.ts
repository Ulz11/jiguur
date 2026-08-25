import { useEffect, useRef } from "react";

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
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [...deps, intervalMs]);
}

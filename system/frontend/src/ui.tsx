import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useLayoutEffect, useRef, useId } from "react";
import { tabbablesIn, trapNext } from "./lib/focus";
import { editKeyAction } from "./lib/edit";

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const timer = useRef<number | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const show = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    clear();
    setToast({ msg, kind });
    // Амжилтын мэдэгдэл өөрөө арилна. АЛДАА арилахгүй — Отгоо гар утсаа
    // хараад эргэж ирэхэд юу болсныг мэдэхгүй үлдэх ёсгүй, өөрөө ✕ дарж хаана.
    if (kind === "ok") timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => clear, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        /* Нэг мэдэгдэлд НЭГ л зарлах механизм: `role="status"` нь polite,
           `role="alert"` нь assertive гэдгээ өөрөө агуулдаг. Дээр нь
           `aria-live` давхарлавал зарим уншигч хоёр удаа уншина. */
        <div role={toast.kind === "err" ? "alert" : "status"}
             className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3.5 rounded-xl font-semibold text-sm shadow-2xl z-50 flex items-start gap-2.5 max-w-[90vw]">
          <span className="shrink-0 leading-5">{toast.kind === "ok" ? "✓" : "⚠"}</span>
          <span className="min-w-0 break-words leading-5">{toast.msg}</span>
          {toast.kind === "err" && (
            <button onClick={() => { clear(); setToast(null); }} aria-label="Мэдэгдлийг хаах"
                    className="shrink-0 -mr-1.5 -my-1 px-2 py-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition text-base leading-5">
              ✕
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ----------
   `dirty` өгвөл — хэрэглэгч ямар нэг юм бөглөсөн байвал — санамсаргүй дарсан
   гадна талын товшилт, Escape нь оруулсан зүйлийг чимээгүй устгахгүй:
   эхлээд модал дотроо баталгаажуулна. ✕ товч ч мөн адил ажиллана. */
export function Modal({ title, onClose, children, wide, dirty }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; dirty?: boolean;
}) {
  const [askClose, setAskClose] = useState(false);
  const guardRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  /* «Нээгч» товчийг РЕНДЕРИЙН үед бичиж авна, effect дотор биш. React нь
     `autoFocus`-ыг effect-ээс ӨМНӨ ажиллуулдаг тул effect дотор уншвал модал
     доторх талбар өөрөө «нээгч» болж бүртгэгдээд, хаагдахад фокус хуудасны
     эхэнд унана (AddLoanModal, GradeModal … бүгд autoFocus-тай). */
  if (openerRef.current === null && typeof document !== "undefined") {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  const titleId = useId();
  const attemptClose = useCallback(() => {
    if (dirty) setAskClose(true); else onClose();
  }, [dirty, onClose]);

  // Урт модал доошоо гүйлгэсэн байхад асуулт нүднээс гарч үлдэх ёсгүй
  useEffect(() => { if (askClose) guardRef.current?.scrollIntoView({ block: "nearest" }); }, [askClose]);

  /* Фокусын шилжилт: нээхэд ДОТОГШ, хаахад нээсэн товч дээрээ БУЦАЖ.
     Хаагдмагц фокус хуудасны эхэнд унавал Отгоо Tab-аа тэгээс эхлэн дарна. */
  useEffect(() => {
    const panel = panelRef.current;
    // React-ийн `autoFocus` аль хэдийн модал дотор фокус тавьсан бол хүндэтгэнэ —
    // ConfirmModal аюултай үйлдэл дээр ЦУЦЛАХ товчийг санаатай сонгодог.
    if (panel && !panel.contains(document.activeElement)) {
      (tabbablesIn(panel)[0] || panel).focus();
    }
    return () => {
      // Нээсэн товч устсан байж болно (жагсаалт дахин ачаалагдсан) — байгаа бол л буцаана
      const opener = openerRef.current;
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { attemptClose(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      /* Фокусын хавх: модал нээлттэй байхад Tab нь ард үлдсэн хуудас руу
         гарах ёсгүй. Жагсаалтыг дарах бүрд шинээр уншина — модалын агуулга
         (задарсан талбар, идэвхгүй болсон товч) хөдөлж байдаг. */
      const list = tabbablesIn(panel);
      const to = trapNext(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      if (to === null) {
        if (list.length === 0) e.preventDefault();   // гарах газар алга
        return;
      }
      e.preventDefault();
      list[to].focus();
    };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";   // ард нь гүйлгэхгүй
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [attemptClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto py-10 px-4 backdrop-blur-md"
         style={{ background: "rgba(11,37,69,0.4)" }}
         onMouseDown={(e) => e.target === e.currentTarget && attemptClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
           className={`rounded-[26px] shadow-2xl w-full border border-line ${wide ? "max-w-3xl" : "max-w-lg"} p-6 outline-none`}
           style={{ background: "var(--color-cardbg)" }}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-line">
          <h3 id={titleId} className="text-[17px] font-bold text-ink tracking-tight">{title}</h3>
          {/* 28×36 байв — өндөр нь шатандаа хүрсэн ч ӨРГӨН нь дутуу. Бүх 23
              модалын хаах товч тул нэг мөрөөр 36×36 (--target-sm) болов. */}
          <button className="btn-ghost !min-h-9 !w-9 !px-0 justify-center text-xl leading-none"
                  onClick={attemptClose} aria-label="Хаах">×</button>
        </div>
        {askClose && (
          <div ref={guardRef}
               className="mb-5 rounded-xl bg-danger-50 px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[13.5px] font-medium text-danger flex-1 min-w-[180px]">
              Хаавал оруулсан мэдээлэл устна. Хаах уу?
            </span>
            <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]" onClick={onClose}>Хаах</button>
            <button className="btn-primary !min-h-9 !py-1.5 !px-3 text-[13px]" autoFocus
                    onClick={() => setAskClose(false)}>Үргэлжлүүлэх</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ---------- Маягттай модал ----------
   `Modal`-ийн `dirty` нь СОНГОЛТ байсан тул 23 модалын ердөө 3-д нь өгөгдсөн
   байв — үлдсэн 20-д нь санамсаргүй гадна талын товшилт бөглөсөн бүхнийг
   чимээгүй устгана. `FormModal` нь ЯГ ижил Modal, ганц ялгаа нь: `dirty` нь
   ЗААВАЛ. Талбартай шинэ модал бичихэд TypeScript өөрөө «энэ юу бөглөгдсөн
   бол бохирдох вэ?» гэж асууна — мартах боломж хаагдана.
   (Асуулт-хариултын модал — ConfirmModal, RebuildModal — Modal хэвээр:
   тэдгээрт бөглөх юм байхгүй тул хаах нь юу ч алдагдуулахгүй.) */
export function FormModal(p: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; dirty: boolean;
}) {
  return <Modal {...p} />;
}

/* ---------- Илгээх товч ----------
   Сервер хариу нэхэж байх хоромд товч юу ч болоогүй мэт зогсдог байв: Отгоо
   дахин дарж, нэг төлбөр хоёр удаа бүртгэгддэг. Товч өөрөө «явж байна» гэдгээ
   мэдэж, дуустал өөрийгөө түгжинэ. Амжилттай бол модал хаагдаж энэ товч
   салдаг тул төлөв сэргээхгүй (салсан бүрэлдэхүүн дээр setState хийхгүй). */
export function SubmitButton({ children, onSubmit, disabled, className = "btn-primary", title,
                               busyLabel = "…" }: {
  children: ReactNode;
  onSubmit: () => Promise<unknown> | unknown;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Урт үйлдэлд юу болж байгааг НЭРЛЭ («Үүсгэж байна…»); богинод «…» хангалттай */
  busyLabel?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  // StrictMode нь effect-ийг mount → cleanup → mount гэж давхар дуудна —
  // биед нь дахин асаахгүй бол товч «…» дээрээ үүрд хөлдөнө.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  return (
    <button className={className} disabled={busy || disabled} title={title}
            aria-busy={busy || undefined}
            onClick={async () => {
              setBusy(true);
              try { await onSubmit(); } finally { if (alive.current) setBusy(false); }
            }}>
      {busy ? busyLabel : children}
    </button>
  );
}

/* ---------- Мөнгө хөдөлгөх үйлдлийн баталгаажуулалт ----------
   RebuildModal-ийн "үр дагаврыг эхлээд харуул" загварыг дахин ашиглах хэлбэр:
   болох гэж буй зүйлээ navy Receipt дээр харуулаад л асууна. */
export function ConfirmModal({ title, intro, rows, total, note, confirmLabel, cancelLabel = "Болих",
                               danger, onConfirm, onClose }: {
  title: string;
  intro?: ReactNode;
  rows?: ReceiptRow[];
  total?: ReceiptRow;
  note?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  // SubmitButton-тай ижил: StrictMode-ийн давхар mount дээр «…» хөлдөхгүй
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  return (
    <Modal title={title} onClose={onClose}>
      {intro && <p className="text-[13.5px] text-t2 mb-4">{intro}</p>}
      {(rows?.length || total) && <Receipt rows={rows || []} total={total} />}
      {note && <p className="text-[12.5px] text-t2 mt-3">{note}</p>}
      <div className="flex justify-end gap-2.5 mt-5">
        {/* Устгах/хаах төрлийн үйлдэлд Enter дарахад ЦУЦЛАХ нь сонгогдоно —
            санамсаргүй товшилт мөнгө хөдөлгөх ёсгүй. */}
        <button className="btn-secondary" disabled={busy} autoFocus={danger}
                onClick={onClose}>{cancelLabel}</button>
        <button className={`btn-primary ${danger ? "!bg-danger" : ""}`} disabled={busy} autoFocus={!danger}
                onClick={async () => {
                  setBusy(true);
                  // Амжилттай бол дуудагч тал биднийг хаана; амжилтгүй бол
                  // товчийг сэргээж дахин оролдох боломж үлдээнэ.
                  try { await onConfirm(); } finally { if (alive.current) setBusy(false); }
                }}>
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Navy тооцооны хайрцаг (calc-receipt) ---------- */
/** `sub` — нэрийн доор орох жижиг хоёрдогч мөр (ж: нэхэмжлэлийн №). Мөрийн
 *  үндсэн нэр нь юу болохыг хэлж, sub нь хаанаас хайхыг хэлнэ. */
export type ReceiptRow = { label: string; sub?: string; value: string; accent?: "money" | "danger" | "violet" | "dim" };
/* `dim` нь 0.55 байхад navy дээр 4.37:1 — 14px хагас тод тоонд хүрэлцэхгүй.
   0.72 (6.30:1) болгоход бусад мөрнөөс (10.56:1) ялгарсан хэвээр. */
const RC_COLOR: Record<string, string> = { money: "#7de8b8", danger: "#ffb3b6", violet: "#cdb9ff", dim: "rgba(255,255,255,0.72)" };

export function Receipt({ rows, total, className = "" }: {
  rows: ReceiptRow[];
  total?: ReceiptRow;
  className?: string;
}) {
  return (
    <div className={`receipt ${className}`}>
      {rows.map((r, i) => (
        <div key={i} className="receipt-row">
          <span>{r.label}{r.sub && <span className="rc-sub">{r.sub}</span>}</span>
          <b style={{ color: r.accent ? RC_COLOR[r.accent] : "#fff" }}>{r.value}</b>
        </div>
      ))}
      {total && (
        <div className="receipt-row receipt-total">
          <span>{total.label}</span>
          <b style={{ color: total.accent ? RC_COLOR[total.accent] : "#fff" }}>{total.value}</b>
        </div>
      )}
    </div>
  );
}

/* ---------- Жижиг туслахууд ---------- */
export function StatePill({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    active: ["pill-green", "Идэвхтэй"],
    overdue: ["pill-red", "Хэтэрсэн"],
    ending: ["pill-amber", "Дуусах дөхсөн"],
    closed: ["pill-grey", "Хаагдсан"],
    paid: ["pill-green", "Төлөгдсөн"],
    penalty: ["pill-amber", "Алданги үлдсэн"],
    partial: ["pill-amber", "Хэсэгчлэн"],
    open: ["pill-blue", "Нээлттэй"],
    pending: ["pill-amber", "Хүлээгдэж буй"],
    done: ["pill-green", "Хийгдсэн"],
    opening: ["pill-grey", "Хуучин үлдэгдэл"],
  };
  const [cls, label] = map[state] || ["pill-grey", state];
  return <span className={cls}>{label}</span>;
}

export function TypePill({ type }: { type: string }) {
  return type === "rent"
    ? <span className="pill-blue">Түрээс</span>
    : <span className="pill-violet">Худалдаа</span>;
}

/** Хоосон төлөв. Шүүлтүүрээс болж хоосорсон бол энэ нь ГАРЦГҮЙ ХАНА байх
 *  ёсгүй — `action` өгвөл буцаж гарах ганц товч гарч ирнэ («Бүгдийг харах»). */
export function Empty({ title, sub, action }: {
  title: string;
  sub?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="py-12 text-center">
      <div className="w-16 h-16 mx-auto mb-3.5 rounded-[20px] bg-brand-50 grid place-items-center text-brand-ink text-2xl">▦</div>
      <h3 className="font-bold text-ink text-[15px] mb-1">{title}</h3>
      {sub && <p className="text-t2 text-[13px] max-w-sm mx-auto">{sub}</p>}
      {action && (
        <button className="btn-secondary mt-4" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}

export function Spinner() {
  return <div className="py-16 text-center text-t3 text-sm animate-pulse">Ачаалж байна…</div>;
}

/** Товч ажиллаж байхад дэргэд нь эргэлдэх тэмдэг — ШОШГЫГ СОЛИХГҮЙ.
 *
 *  «…» нь ажиллаж байгааг хэлдэг ч товчны НЭРИЙГ УСТГАДАГ байв: уншигчаар
 *  ажилладаг хүн дарсан товчоо алдаж («…» гэдэг нь дуудагдах нэр биш), харж
 *  байгаа хүн ч гурван цэг болсон хоёр товчийг ялгахгүй. Нэр байрандаа үлдэж,
 *  зөвхөн тэмдэг нэмэгдэнэ — төлөвийг `aria-busy` хэлнэ. */
export function Spin() {
  return <span aria-hidden="true" className="inline-block w-3 h-3 ml-1.5 align-[-1px]
    rounded-full border-2 border-current border-t-transparent animate-spin" />;
}

/* ---------- Дахин татаж байх үе ----------
   Сар/хамрах хүрээ солиход хуудсыг ЦООХОР ХООСОН болгож, эргэлдэгч тавьдаг
   байв — Отгоо юу харж байснаа алдаж, шинэ тоо ирэхийг хоосон дэлгэц ширтэж
   хүлээнэ. Өмнөх тоо байрандаа үлдэж, зөвхөн бүдгэрч, дарагдахаа болино:
   хаана байсныг санаж, солигдохыг нь хардаг. */
export function Refreshing({ busy, children }: { busy: boolean; children: ReactNode }) {
  /* Хариу 40ms-д ирэхэд бүдгэрүүлэг ЦАВЧИЛЖ өнгөрөх нь тайвшруулахын оронд
     цочроодог. Тиймээс 180ms-ээс удаж байж л мэдэгдэнэ — хурдан шинэчлэлт
     чимээгүй, удаан шинэчлэлт тайлбартай. */
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!busy) { setShow(false); return; }
    const t = window.setTimeout(() => setShow(true), 180);
    return () => window.clearTimeout(t);
  }, [busy]);
  return (
    <>
      {show && <div className="refresh-note" role="status">Шинэчилж байна…</div>}
      <div className={show ? "refresh-body is-busy" : "refresh-body"}
           {...(show ? { "aria-busy": true } : {})}>
        {children}
      </div>
    </>
  );
}

/* ---------- Inline editor (2 алхамт баталгаажуулалттай) ----------
   Засварын горим нь нүдээ ӨРГӨСГӨДӨГ байв. Зээлийн хуудсанд нэг нэр дээр
   дарахад хүснэгт 1020 → 1178px, ✓ дарахад дахин 1245px болж, хажуугийн
   баганууд хулганы доогуур гулсдаг: Отгоо эхний товшилтоо нэг нүдэн дээр,
   хоёр дахийг нь ӨӨР нүдэн дээр хийнэ.

   Одоо: харагдаж байсан утга нүдэндээ СҮҮДЭР (ghost) болж үлдэж, ЯГ тэр
   өргөнийг барина; засварын талбар нь түүн дээр ХӨВЖ гарна. Хүснэгт бүх
   алхам дээр огт хөдлөхгүй (view = edit = confirm өргөн).

   Хөвөгч талбар нь баруун ирмэгээс давбал зүүн тийшээ эргэж ургана — эс
   бөгөөс гүйлгэх талбай (scrollWidth) өсөж, яг ижил алдаа дахин үүснэ.
   Өндөр нь 46px: мөрийн 14px дүүргэлт дотор багтаж, картын босоо гүйлгэлт
   үүсгэхгүй.

   ГАРЫН ЗАМ (`lib/edit.ts` — DOM-гүй шалгагдана):
     · Enter (засвар)       → «…солих уу?» гарч ирнэ  — АСУУНА, хадгалахгүй
     · Enter (баталгаажуулах) → ЯГ тэр чипийг дарна   — хоёр дахь Enter хадгална
     · Escape (хоёул)       → цуцална
     · Tab                  → ✓ / ✕ чип рүү (өмнөх зам ХЭВЭЭР)
   Гараар цуцалсан/хадгалсан үед фокус нүднийхээ товч дээр БУЦАЖ ирнэ (хулганы
   товшилт үүнийг хөдөлгөхгүй — Отгоо дарсан газраа үлдэнэ). */
export function InlineEdit({ value, display, onSave, type = "text", suffix = "", confirmText = "Хадгалах уу?", width = "w-24", right, options, label }: {
  value: string | number | null | undefined;
  display?: string;
  onSave: (v: string) => Promise<void> | void;
  type?: "text" | "number" | "date";
  suffix?: string;
  confirmText?: string;
  width?: string;
  right?: boolean;
  options?: [string, string][];   // [value, label] — өгвөл <select> болно
  /** Талбарын БОГИНО нэр («Тариф», «Хүү»). Дэлгэц дээр гарахгүй — зөвхөн
   *  дуудагдах нэрэнд ордог: «Тариф: 330 · засах». Хүснэгтийн мөрөнд дөрвөн
   *  дараалсан зогсоол «330 · засах», «5 · засах» гэж дуудагдвал уншигчаар
   *  ажилладаг хүн ЮУГ засаж байгаагаа мэдэхгүй. */
  label?: string;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [flip, setFlip] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const popRef = useRef<HTMLSpanElement | null>(null);
  const viewRef = useRef<HTMLButtonElement | null>(null);
  /* ГАРААР гарсан үед л фокусыг товч дээрээ буцаана. Хулганаар ✓ дарсан
     хүнийг татахгүй — тэр хаана байгаагаа нүдээрээ мэднэ. */
  const backToView = useRef(false);
  const start = (e: React.MouseEvent) => {
    e.stopPropagation(); setVal(String(value ?? "")); setFlip(false); setMode("edit");
  };
  const commit = async () => {
    setBusy(true);
    try { await onSave(val); setMode("view"); }
    catch { /* toast нь дуудагч талд */ }
    finally { setBusy(false); }
  };
  const onKey = (e: { key: string; preventDefault: () => void }) => {
    const act = editKeyAction(e.key, mode, busy);
    if (act === "none") return;
    e.preventDefault();
    backToView.current = true;             // гарын зам — фокус буцна
    if (act === "cancel") setMode("view");
    else if (act === "ask") setMode("confirm");
    else void commit();
  };
  // Засвар хаагдмагц фокус хуудасны эхэнд унах ёсгүй: дарсан нүдэн дээрээ үлдэнэ
  useEffect(() => {
    if (mode !== "view" || !backToView.current) return;
    backToView.current = false;
    viewRef.current?.focus();
  }, [mode]);
  const shown = display ?? (value === null || value === undefined || value === "" ? "—" : String(value));

  /* Хөвөгч талбар багтах уу? Ойрын гүйлгэдэг өвөг (card.overflow-x-auto) —
     байхгүй бол цонх — түүний БАРУУН ирмэгээр хэмжинэ. Багтахгүй бол баруун
     ирмэгээрээ тогтоно (зүүн тийш ургах нь LTR-д scrollWidth-ыг өсгөхгүй).
     Товчны бичиг edit → confirm дээр өөрчлөгддөг тул мод бүрд дахин хэмжинэ. */
  useLayoutEffect(() => {
    if (mode === "view") return;
    const a = anchorRef.current, p = popRef.current;
    if (!a || !p) return;
    let sc: HTMLElement | null = a.parentElement;
    while (sc && sc !== document.body) {
      const ox = getComputedStyle(sc).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") break;
      sc = sc.parentElement;
    }
    const edge = sc && sc !== document.body
      ? Math.min(sc.getBoundingClientRect().right, window.innerWidth)
      : window.innerWidth;
    setFlip(a.getBoundingClientRect().left + p.offsetWidth > edge - 6);
  }, [mode]);

  // Товчны нэр нь УТГАА + үйлдлээ хоёуланг агуулна: «12345678 · засах».
  // ✎ нь чимэг тул нуугдана — эс бөгөөс уншигч «харандаа» гэж дуудна.
  if (mode === "view") {
    return (
      <button className="inline-val" ref={viewRef} onClick={start} title="Дарж засна">
        {label && <span className="sr-only">{label}: </span>}
        <span>{shown}{suffix}</span>
        <span className="pen" aria-hidden="true">✎</span>
        <span className="sr-only"> · засах</span>
      </button>
    );
  }
  return (
    <span className="inline-edit-live" ref={anchorRef} onClick={(e) => e.stopPropagation()}>
      {/* Сүүдэр: нүдний өргөнийг харагдаж байсан хэвээр нь барина. Уншигчид
          хуучин утгыг давхар уншуулахгүй тул aria-hidden. */}
      <span className="inline-val invisible" aria-hidden="true">
        <span>{shown}{suffix}</span>
        <span className="pen">✎</span>
      </span>
      <span className={`inline-edit-pop${flip ? " is-flip" : ""}`} ref={popRef}>
        {options ? (
          <select autoFocus aria-label={label ? `${label} — шинэ утга` : "Шинэ утга"}
            className={`inp !min-h-9 !py-1 !px-2 !rounded-lg !text-[13px] ${width}`}
            value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={onKey}>
            {options.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
          </select>
        ) : (
          <input autoFocus type={type} aria-label={label ? `${label} — шинэ утга` : "Шинэ утга"}
            className={`inp !min-h-9 !py-1 !px-2 !rounded-lg !text-[13px] ${width} ${right ? "text-right" : ""}`}
            value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={onKey} />
        )}
        {/* Баталгаажуулах/цуцлах товчнууд target-sm (36px) — хуруугаар ч оносон дарагдана */}
        {mode === "edit" ? (
          <>
            <button className="w-9 h-9 rounded-lg bg-brand-50 text-brand-ink font-bold shrink-0"
                    aria-label="Хадгалахаар үргэлжлүүлэх" onClick={() => setMode("confirm")}>✓</button>
            <button className="w-9 h-9 rounded-lg bg-sunken text-t2 shrink-0"
                    aria-label="Болих" onClick={() => setMode("view")}>✕</button>
          </>
        ) : (
          <>
            <button className="h-9 px-3 rounded-lg bg-money text-white text-[12px] font-bold whitespace-nowrap shrink-0"
                    disabled={busy} onClick={commit}>{busy ? "…" : confirmText}</button>
            <button className="w-9 h-9 rounded-lg bg-sunken text-t2 shrink-0"
                    aria-label="Болих" onClick={() => setMode("view")}>✕</button>
          </>
        )}
      </span>
    </span>
  );
}

/** Явцын зураас. Дүрэм нь ЗУРААС ӨӨРӨӨ ЮУ ХЭЛЖ БАЙНА гэдгээр шийдэгдэнэ:
 *
 *  · Зураас нь дэргэдээ бүтэн үг+тоотой бол (ж: Гэрээний цикл «29/30 · хэтэрсэн»)
 *    энэ бол ЧИМЭГ — `label` бүү өг, давхардуулж уншуулахгүй.
 *  · Зураас нь хажуудаа байхгүй ямар нэг зүйл авч явдаг бол — ганцаараа зогсох
 *    (агуулахын ашиглалт), 100%-ийн шатыг зурах (KPI), эсвэл хамгийн том
 *    хувинтай харьцуулах (авлагын насжилт) — `label` өгч НЭРЛЭ.
 *
 *  Аль ч тохиолдолд ӨНГӨ дангаараа утга зөөж болохгүй: улаан/улбар/ногоон
 *  ялгаа нь дэргэдээ ҮГТЭЙ явна (Аналитикийн «бага/дунд/хэвийн»). */
export function Prog({ pct, color, label }: { pct: number; color?: string; label?: string }) {
  return (
    <div className="h-[7px] rounded-full bg-sunken overflow-hidden"
         {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const })}>
      <div className="h-full rounded-full transition-all duration-700"
           style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color || "var(--color-brand)" }} />
    </div>
  );
}

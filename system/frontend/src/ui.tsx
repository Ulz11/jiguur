import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";

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
        <div role="status" aria-live={toast.kind === "err" ? "assertive" : "polite"}
             className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3.5 rounded-xl font-semibold text-sm shadow-2xl z-50 flex items-start gap-2.5 max-w-[90vw]">
          <span className="shrink-0 leading-5">{toast.kind === "ok" ? "✓" : "⚠"}</span>
          <span className="min-w-0 break-words leading-5">{toast.msg}</span>
          {toast.kind === "err" && (
            <button onClick={() => { clear(); setToast(null); }} aria-label="Мэдэгдлийг хаах"
                    className="shrink-0 -mr-1.5 -my-1 px-2 py-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition text-base leading-5">
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
  const attemptClose = useCallback(() => {
    if (dirty) setAskClose(true); else onClose();
  }, [dirty, onClose]);

  // Урт модал доошоо гүйлгэсэн байхад асуулт нүднээс гарч үлдэх ёсгүй
  useEffect(() => { if (askClose) guardRef.current?.scrollIntoView({ block: "nearest" }); }, [askClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") attemptClose(); };
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
      <div className={`rounded-[26px] shadow-2xl w-full border border-line ${wide ? "max-w-3xl" : "max-w-lg"} p-6`}
           style={{ background: "var(--color-cardbg)" }}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-line">
          <h3 className="text-[17px] font-bold text-ink tracking-tight">{title}</h3>
          <button className="btn-ghost !min-h-0 !p-2 text-xl leading-none" onClick={attemptClose} aria-label="Хаах">×</button>
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
  useEffect(() => () => { alive.current = false; }, []);
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
export type ReceiptRow = { label: string; value: string; accent?: "money" | "danger" | "violet" | "dim" };
const RC_COLOR: Record<string, string> = { money: "#7de8b8", danger: "#ffb3b6", violet: "#cdb9ff", dim: "rgba(255,255,255,0.55)" };

export function Receipt({ rows, total, className = "" }: {
  rows: ReceiptRow[];
  total?: ReceiptRow;
  className?: string;
}) {
  return (
    <div className={`receipt ${className}`}>
      {rows.map((r, i) => (
        <div key={i} className="receipt-row">
          <span>{r.label}</span>
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

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="py-12 text-center">
      <div className="w-16 h-16 mx-auto mb-3.5 rounded-[20px] bg-brand-50 grid place-items-center text-brand text-2xl">▦</div>
      <h3 className="font-bold text-ink text-[15px] mb-1">{title}</h3>
      {sub && <p className="text-t2 text-[13px] max-w-sm mx-auto">{sub}</p>}
    </div>
  );
}

export function Spinner() {
  return <div className="py-16 text-center text-t3 text-sm animate-pulse">Ачаалж байна…</div>;
}

/* ---------- Inline editor (2 алхамт баталгаажуулалттай) ---------- */
export function InlineEdit({ value, display, onSave, type = "text", suffix = "", confirmText = "Хадгалах уу?", width = "w-24", right, options }: {
  value: string | number | null | undefined;
  display?: string;
  onSave: (v: string) => Promise<void> | void;
  type?: "text" | "number" | "date";
  suffix?: string;
  confirmText?: string;
  width?: string;
  right?: boolean;
  options?: [string, string][];   // [value, label] — өгвөл <select> болно
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const start = (e: React.MouseEvent) => { e.stopPropagation(); setVal(String(value ?? "")); setMode("edit"); };
  const commit = async () => {
    setBusy(true);
    try { await onSave(val); setMode("view"); }
    catch { /* toast нь дуудагч талд */ }
    finally { setBusy(false); }
  };
  if (mode === "view") {
    return (
      <button className="inline-val" onClick={start} title="Дарж засна">
        <span>{display ?? (value === null || value === undefined || value === "" ? "—" : String(value))}{suffix}</span>
        <span className="pen">✎</span>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {options ? (
        <select autoFocus
          className={`inp !min-h-8 !py-1 !px-2 !rounded-lg !text-[13px] ${width}`}
          value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setMode("confirm"); if (e.key === "Escape") setMode("view"); }}>
          {options.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
        </select>
      ) : (
        <input autoFocus type={type}
          className={`inp !min-h-8 !py-1 !px-2 !rounded-lg !text-[13px] ${width} ${right ? "text-right" : ""}`}
          value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setMode("confirm"); if (e.key === "Escape") setMode("view"); }} />
      )}
      {mode === "edit" ? (
        <>
          <button className="w-7 h-7 rounded-lg bg-brand-50 text-brand font-bold shrink-0" onClick={() => setMode("confirm")}>✓</button>
          <button className="w-7 h-7 rounded-lg bg-sunken text-t2 shrink-0" onClick={() => setMode("view")}>✕</button>
        </>
      ) : (
        <>
          <button className="h-7 px-2.5 rounded-lg bg-money text-white text-[12px] font-bold whitespace-nowrap shrink-0"
                  disabled={busy} onClick={commit}>{busy ? "…" : confirmText}</button>
          <button className="w-7 h-7 rounded-lg bg-sunken text-t2 shrink-0" onClick={() => setMode("view")}>✕</button>
        </>
      )}
    </span>
  );
}

export function Prog({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="h-[7px] rounded-full bg-sunken overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
           style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color || "var(--color-brand)" }} />
    </div>
  );
}

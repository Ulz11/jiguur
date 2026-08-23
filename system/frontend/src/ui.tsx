import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null);
  const show = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3.5 rounded-xl font-semibold text-sm shadow-2xl z-50 flex items-center gap-2.5 max-w-[90vw]">
          <span>{toast.kind === "ok" ? "✓" : "⚠"}</span>
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";   // ард нь гүйлгэхгүй
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto py-10 px-4 backdrop-blur-md"
         style={{ background: "rgba(11,37,69,0.4)" }}
         onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`rounded-[26px] shadow-2xl w-full border border-line ${wide ? "max-w-3xl" : "max-w-lg"} p-6`}
           style={{ background: "var(--color-cardbg)" }}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-line">
          <h3 className="text-[17px] font-bold text-ink tracking-tight">{title}</h3>
          <button className="btn-ghost !min-h-0 !p-2 text-xl leading-none" onClick={onClose} aria-label="Хаах">×</button>
        </div>
        {children}
      </div>
    </div>
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
export function InlineEdit({ value, display, onSave, type = "text", suffix = "", confirmText = "Хадгалах уу?", width = "w-24", right }: {
  value: string | number | null | undefined;
  display?: string;
  onSave: (v: string) => Promise<void> | void;
  type?: "text" | "number" | "date";
  suffix?: string;
  confirmText?: string;
  width?: string;
  right?: boolean;
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
      <input autoFocus type={type}
        className={`inp !min-h-8 !py-1 !px-2 !rounded-lg !text-[13px] ${width} ${right ? "text-right" : ""}`}
        value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") setMode("confirm"); if (e.key === "Escape") setMode("view"); }} />
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

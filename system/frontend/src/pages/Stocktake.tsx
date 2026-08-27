import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, user } from "../api";
import { Spinner, useToast, Receipt } from "../ui";
import { parseMoney } from "../lib/num";

const today = () => new Date().toISOString().slice(0, 10);

type Row = { material_id: number; grade_id: number; material: string; category: string;
             grade: string; system: number; counted: string };

/* ---------- Ноорог ----------
   Агуулах тоолох нь 20-30 минут үргэлжилнэ. Утас түгжигдэх, таб хаагдах,
   санамсаргүй "буцах" — тоолсон бүхэн алга болно. Оруулсан тоог тухай бүрд нь
   тухайн хэрэглэгчийн ноорогт хадгалж, буцаж ирэхэд нь сэргээнэ. */
type Draft = { savedAt: string; note: string; counts: Record<string, string> };
const rowKey = (r: { material_id: number; grade_id: number }) => `${r.material_id}-${r.grade_id}`;

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === "object" && d.counts && typeof d.counts === "object" ? (d as Draft) : null;
  } catch { return null; }   // эвдэрсэн / уншигдахгүй ноорог ажлыг зогсоох ёсгүй
}

const whenLabel = (iso: string) => {
  const t = new Date(iso);
  return isNaN(+t) ? "" : t.toLocaleString();
};

/** Утсаар агуулах тоолоход зориулсан горим — том товч, нэг мөр = нэг зэрэглэл. */
export default function Stocktake() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState<string | null>(null); // сэргээсэн ноорогийн огноо
  const [draftKey] = useState(() => `jz_stocktake_draft:${user()?.id ?? 0}`);
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => {
    api("/api/stock").then((d) => {
      const out: Row[] = [];
      for (const m of d.rows)
        for (const s of m.stock || [])
          out.push({ material_id: m.id, grade_id: s.grade_id, material: m.name,
                     category: m.category, grade: s.grade, system: s.on_hand, counted: "" });
      // Ноорогоо сэргээнэ — устсан материалын мөр байвал зүгээр л алгасна
      const draft = readDraft(draftKey);
      const counts = draft?.counts || {};
      let hits = 0;
      for (const r of out) {
        const v = counts[rowKey(r)];
        if (v !== undefined && v !== "") { r.counted = v; hits++; }
      }
      if (hits) {
        if (draft?.note) setNote(draft.note);
        setRestored(draft?.savedAt || "");
      }
      setRows(out);
    }).catch((e) => toast(e.message, "err"));
  }, []);

  /* Оруулсан тоо бүрийг тэр дороо ноорогт бичнэ */
  useEffect(() => {
    if (!rows) return;
    const counts: Record<string, string> = {};
    for (const r of rows) if (r.counted !== "") counts[rowKey(r)] = r.counted;
    try {
      if (Object.keys(counts).length === 0) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey,
        JSON.stringify({ savedAt: new Date().toISOString(), note, counts } satisfies Draft));
    } catch { /* хувийн горим / зай дүүрсэн — ноорог алдагдана ч тооллого үргэлжилнэ */ }
  }, [rows, note, draftKey]);

  /* Хадгалаагүй байхад таб хаах гэвэл хөтөч өөрөө асууна */
  const filledCount = rows ? rows.filter((r) => r.counted !== "").length : 0;
  useEffect(() => {
    if (!filledCount) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [filledCount]);

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* үл ойшоох */ }
    setRows((rs) => (rs ? rs.map((r) => ({ ...r, counted: "" })) : rs));
    setNote("");
    setRestored(null);
  }

  if (!rows) return <Spinner />;

  const diffOf = (r: Row) => (r.counted === "" ? 0 : parseMoney(r.counted) - r.system);
  const filled = rows.filter((r) => r.counted !== "");
  const diffs = filled.filter((r) => diffOf(r) !== 0);
  const shown = rows.filter((r) =>
    (!q || r.material.toLowerCase().includes(q.toLowerCase()) || r.grade.toLowerCase().includes(q.toLowerCase()))
    && (!onlyDiff || diffOf(r) !== 0));

  async function submit() {
    if (!filled.length) { toast("Ядаж нэг мөр тоолно уу", "err"); return; }
    setBusy(true);
    try {
      const r = await api("/api/stock/stocktake", { method: "POST", body: JSON.stringify({
        date: today(), note,
        lines: filled.map((x) => ({ material_id: x.material_id, grade_id: x.grade_id,
                                    counted: parseMoney(x.counted) })) }) });
      try { localStorage.removeItem(draftKey); } catch { /* үл ойшоох */ }
      toast(`Тооллого хадгалагдлаа — ${r.adjusted} мөр залруулагдав`);
      nav("/warehouse");
    } catch (e: any) { toast(e.message, "err"); setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto pb-28">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">STOCKTAKE <span>•</span> {today()}</div>
          <h1 className="dashboard-title">Тооллого</h1>
          <p className="dashboard-subtitle">
            Агуулахад байгаа бодит тоог бичнэ. Зөрүү шууд харагдана.
          </p>
        </div>
      </div>

      {restored !== null && (
        <div className="mb-3.5 rounded-xl bg-brand-50 px-4 py-3 flex items-center gap-2.5 flex-wrap">
          <span className="text-[13px] font-medium text-t1 flex-1 min-w-[200px]">
            Хадгалагдаагүй тооллого сэргээгдлээ{restored ? ` · ${whenLabel(restored)}` : ""} — үргэлжлүүлэн тоолж болно.
          </span>
          <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]" onClick={clearDraft}>
            Цэвэрлэж шинээр эхлэх
          </button>
          <button className="btn-ghost !min-h-9 !py-1.5 !px-2 text-[13px]" aria-label="Мэдэгдлийг хаах"
                  onClick={() => setRestored(null)}>✕</button>
        </div>
      )}

      <div className="flex gap-2.5 mb-3.5 flex-wrap">
        <input className="inp flex-1 min-w-[180px]" placeholder="Материал хайх…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`btn-secondary ${onlyDiff ? "!border-brand !text-brand" : ""}`}
                onClick={() => setOnlyDiff(!onlyDiff)}>
          Зөрүүтэй ({diffs.length})
        </button>
      </div>

      <div className="card divide-y divide-line">
        {shown.map((r) => {
          const idx = rows.indexOf(r);
          const diff = diffOf(r);
          return (
            <div key={`${r.material_id}-${r.grade_id}`} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <b className="text-[14.5px] text-ink block leading-tight">{r.material}</b>
                <span className="text-[12px] text-t3">
                  <span className="pill-grey !text-[10.5px] !py-0 mr-1.5">{r.grade}</span>
                  системд <b className="tabular-nums">{fmt(r.system)}</b>
                </span>
              </div>
              <input type="number" inputMode="numeric" placeholder="тоо"
                     className={`inp !w-28 !min-h-[52px] text-center !text-[17px] font-bold
                       ${diff > 0 ? "!border-money" : diff < 0 ? "!border-danger" : ""}`}
                     value={r.counted}
                     onChange={(e) => {
                       const next = [...rows];
                       next[idx] = { ...r, counted: e.target.value };
                       setRows(next);
                     }} />
              <div className="w-20 text-right shrink-0">
                {r.counted !== "" && (
                  <b className={`tabular-nums text-[14px] ${
                    diff > 0 ? "text-money" : diff < 0 ? "text-danger" : "text-t3"}`}>
                    {diff > 0 ? "+" : ""}{diff === 0 ? "таарав" : fmt(diff)}
                  </b>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-8 text-center text-t3 text-sm">Илэрц алга</div>}
      </div>

      {filled.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-line p-3.5 backdrop-blur"
             style={{ background: "rgba(255,255,255,.94)" }}>
          <div className="max-w-3xl mx-auto flex gap-3 items-center flex-wrap">
            <Receipt className="flex-1 min-w-[240px] !py-2.5"
              rows={[{ label: "Тоолсон мөр", value: `${filled.length} / ${rows.length}` }]}
              total={{ label: "Зөрүүтэй мөр",
                       value: `${diffs.length} мөр · ${fmt(diffs.reduce((s, r) => s + diffOf(r), 0))}ш`,
                       accent: diffs.length ? "danger" : "money" }} />
            <input className="inp max-w-[200px]" placeholder="Тэмдэглэл (заавал биш)"
                   value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary !min-h-[52px] px-6" disabled={busy} onClick={submit}>
              {busy ? "Хадгалж байна…" : "✓ Тооллого дуусгах"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

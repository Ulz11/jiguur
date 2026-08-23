import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt } from "../api";
import { Spinner, useToast, Receipt } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);

type Row = { material_id: number; grade_id: number; material: string; category: string;
             grade: string; system: number; counted: string };

/** Утсаар агуулах тоолоход зориулсан горим — том товч, нэг мөр = нэг зэрэглэл. */
export default function Stocktake() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => {
    api("/api/stock").then((d) => {
      const out: Row[] = [];
      for (const m of d.rows)
        for (const s of m.stock || [])
          out.push({ material_id: m.id, grade_id: s.grade_id, material: m.name,
                     category: m.category, grade: s.grade, system: s.on_hand, counted: "" });
      setRows(out);
    }).catch((e) => toast(e.message, "err"));
  }, []);
  if (!rows) return <Spinner />;

  const diffOf = (r: Row) => (r.counted === "" ? 0 : (parseFloat(r.counted) || 0) - r.system);
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
                                    counted: parseFloat(x.counted) || 0 })) }) });
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

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, money, sayaFmt, user } from "../api";
import { Spinner, StatePill, TypePill, Prog, Empty } from "../ui";
import { useScope } from "../App";

export default function Contracts() {
  const { scope } = useScope();
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const u = user();

  useEffect(() => { setRows(null); api(`/api/contracts?scope=${scope}`).then(setRows); }, [scope]);
  if (!rows) return <Spinner />;

  // «Хуучин үлдэгдэл» (OB-) гэрээнүүд жагсаалтыг дүүргэхгүйн тулд тусдаа шүүлтүүрт
  const isOB = (c: any) => c.state === "opening";
  const match = (c: any, f: string) =>
    f === "opening" ? isOB(c) : f === "all" ? !isOB(c) : !isOB(c) && c.state === f;
  const cnt = (f: string) => rows.filter((c) => match(c, f)).length;
  const shown = rows.filter((c) => match(c, filter))
    .filter((c) => !q || c.client.toLowerCase().includes(q.toLowerCase()) || c.no.includes(q));
  const FILTERS: [string, string][] = [
    ["all", "Идэвхтэй бүгд"], ["active", "Хэвийн"], ["ending", "Дуусах дөхсөн"],
    ["overdue", "Хэтэрсэн"], ["closed", "Хаагдсан"], ["opening", "Хуучин үлдэгдэл"],
  ];

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Гэрээнүүд</h1>
          <p className="text-t2 text-[13.5px] mt-0.5">Бүх түрээс, худалдааны гэрээ нэг дор.</p>
        </div>
        {u?.role !== "factory" && <Link to="/contracts/new" className="btn-primary">+ Шинэ гэрээ</Link>}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="segment flex-wrap">
          {FILTERS.map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={filter === v ? "on" : ""}>
              {l} · {cnt(v)}
            </button>
          ))}
        </div>
        <input className="inp max-w-[240px] !min-h-10 !py-2 ml-auto" placeholder="Харилцагч, № хайх…"
               value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {filter === "opening" && (
        <div className="text-[12.5px] text-t2 bg-brand-50 rounded-xl px-4 py-2.5 mb-4">
          Хуучин системээс шилжсэн үлдэгдлүүд. Төлбөр бүртгэмэгц энд автоматаар хаагдана —
          шинэ түрээсийн тооцоо эдгээр дээр явахгүй.
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px]">
          <thead><tr>
            <th className="th">Гэрээ / Харилцагч</th><th className="th">Төрөл</th><th className="th">Явц</th>
            <th className="th text-right">Өдрийн дүн</th><th className="th text-right">Үлдэгдэл</th>
            <th className="th">Төлөв</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {shown.map((c) => {
              const pct = c.cycle ? (c.cycle.days_done / c.cycle.days_total) * 100 : c.type === "sale" ? 100 : 0;
              return (
                <tr key={c.id} className="cursor-pointer hover:bg-canvas transition group"
                    onClick={() => nav(`/contracts/${c.id}`)}>
                  <td className="td">
                    <span className="font-bold text-ink">{c.client}</span>
                    <span className="block text-xs text-t3 mt-0.5">№{c.no} · {c.start_date}-с
                      {c.deposit > 0 && ` · барьцаа ${sayaFmt(c.deposit)}₮`}</span>
                  </td>
                  <td className="td"><TypePill type={c.type} /></td>
                  <td className="td min-w-[150px]">
                    {c.cycle ? (
                      <>
                        <div className="text-xs text-t2 mb-1.5">
                          {c.cycle.cycle_start.slice(5)} – {c.cycle.cycle_end.slice(5)} · {c.cycle.days_done}/{c.cycle.days_total}
                        </div>
                        <Prog pct={pct} color={c.state === "overdue" ? "#EF4444" : c.state === "ending" ? "#F5A524" : undefined} />
                      </>
                    ) : <span className="text-xs text-t3">{c.type === "sale" ? "Худалдаа" : "—"}</span>}
                  </td>
                  <td className="td text-right tabular-nums font-bold text-ink">
                    {c.day_amount ? money(c.day_amount) : "—"}
                  </td>
                  <td className="td text-right tabular-nums">
                    <span className={`font-bold ${c.state === "overdue" ? "text-danger" : "text-ink"}`}>
                      {sayaFmt(c.balance)}₮
                    </span>
                    {c.penalty > 0 && <span className="block text-[11px] text-danger">+ алданги {sayaFmt(c.penalty)}₮</span>}
                  </td>
                  <td className="td"><StatePill state={c.state} /></td>
                  {/* Мөр дарагддаг гэдгийг ЗӨВХӨН хулгана дээр нь ирэхэд хэлдэг
                      байсан — планшет дээр огт харагдахгүй. Тайван боловч ил. */}
                  <td className="td text-t3 group-hover:text-ink transition" aria-hidden="true">→</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <Empty title="Илэрц алга" sub="Энэ шүүлтүүрт тохирох гэрээ байхгүй." />}
      </div>
    </div>
  );
}

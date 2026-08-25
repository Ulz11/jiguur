import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, sayaFmt, user } from "../api";
import { Spinner, Prog, useToast } from "../ui";
import { useScope } from "../App";
import { useLive } from "../lib/live";
import RevChart from "../components/RevChart";

export default function Dashboard() {
  const { scope } = useScope();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  const u = user();

  const load = () => api(`/api/dashboard?scope=${scope}`).then(setD).catch((e) => toast(e.message, "err"));
  /** Фонд шинэчлэх — эргэлдэгч гаргахгүй, алдааг чимээгүй залгина. */
  const refresh = () => api(`/api/dashboard?scope=${scope}`).then(setD).catch(() => {});
  useLive((bg) => { if (bg) refresh(); else { setD(null); load(); } }, [scope]);

  if (!d) return <Spinner />;
  const k = d.kpi;
  const agingMax = Math.max(...d.aging.map((a: any) => a.amount), 1);
  const agingColors = ["#1F8B69", "#253886", "#F88712", "#C9363B"];

  async function confirmShipment(id: number) {
    setBusy(id);
    try {
      await api(`/api/movements/${id}/confirm`, { method: "POST" });
      toast("Ачилт баталгаажлаа — нөөц хөдөлж, тооцоо эхэллээ");
      load();
    } catch (e: any) { toast(e.message, "err"); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">OPERATIONAL OVERVIEW <span>•</span> LIVE</div>
          <h1 className="dashboard-title">Удирдлагын төв</h1>
          <p className="dashboard-subtitle">
            {scope === "all" ? "Компанийн өнөөдрийн зураг — бүх тоо амьд." :
             scope === "rent" ? "Зөвхөн түрээсийн үзүүлэлтүүд." : "Зөвхөн худалдааны үзүүлэлтүүд."}
          </p>
        </div>
        {u?.role !== "factory" && (
          <Link to="/contracts/new" className="btn-primary command-action">+ Шинэ гэрээ</Link>
        )}
      </div>

      {/* KPI */}
      <div className="command-metrics">
        <div className="command-hero relative overflow-hidden">
          <div className="text-[12.5px] text-white/60 font-medium mb-2">Авлагын нийт үлдэгдэл</div>
          <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight">
            {sayaFmt(k.receivable)} <span className="text-sm text-white/40 font-semibold">₮</span>
          </div>
          <div className="mt-2"><span className="pill bg-white/10 text-white/80">алданги +{sayaFmt(k.penalty)}₮</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хугацаа хэтэрсэн</div>
          <div className="text-[28px] font-extrabold text-danger tabular-nums leading-tight">
            {sayaFmt(k.overdue)} <span className="text-sm text-t2 font-semibold">₮</span>
          </div>
          <div className="mt-2"><span className="pill-red">{k.overdue_count} нэхэмжлэл</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Идэвхтэй гэрээ</div>
          <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">{k.active_contracts}</div>
          <div className="mt-2"><span className="pill-blue">{k.ending_soon} нь удахгүй дуусна</span></div>
        </div>
        {scope === "sale" ? (
          <div className="card p-5">
            <div className="text-[12.5px] text-t2 font-medium mb-2">Энэ сарын худалдаа</div>
            <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">
              {sayaFmt(k.month_sale)} <span className="text-sm text-t2 font-semibold">₮</span>
            </div>
          </div>
        ) : (
          <div className="card p-5">
            <div className="text-[12.5px] text-t2 font-medium mb-2">Нөөц түрээсэнд</div>
            <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">{k.utilization}<span className="text-sm text-t2 font-semibold"> %</span></div>
            <div className="mt-3"><Prog pct={k.utilization} color="#22C55E" /></div>
          </div>
        )}
      </div>

      {/* Chart + aging */}
      <div className="dashboard-analysis">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-ink text-[15.5px] flex items-center gap-2"><span className="cdot" />Орлого — Түрээс · Худалдаа · Бартер</h3>
            <span className="pill-grey">сүүлийн 6 сар</span>
          </div>
          <RevChart months={d.revenue.months} rent={d.revenue.rent} sale={d.revenue.sale} barter={d.revenue.barter} />
        </div>
        <div className="card p-5">
          <h3 className="font-bold text-ink text-[15.5px] mb-4">Авлага насжилтаар</h3>
          {d.aging.map((a: any, i: number) => (
            <div key={a.label} className="flex items-center gap-3 mb-3">
              <span className="w-[84px] text-[12.5px] text-t2 font-medium">{a.label}</span>
              <div className="flex-1"><Prog pct={(a.amount / agingMax) * 100} color={agingColors[i]} /></div>
              <b className="w-[80px] text-right tabular-nums text-[13px]">{sayaFmt(a.amount)}</b>
            </div>
          ))}
          <div className="mt-4 pt-3.5 border-t border-sunken flex justify-between items-center">
            <span className="text-[12.5px] text-t2">90+ хоног хэтэрсэн</span>
            <b className="text-danger tabular-nums">{sayaFmt(d.aging[3].amount)}₮</b>
          </div>
        </div>
      </div>

      {/* Notifications + pending + loans */}
      <div className="dashboard-operations">
        <div className="card p-5">
          <h3 className="font-bold text-ink text-[15.5px] mb-3">Мэдэгдэл</h3>
          {d.notifications.length === 0 && <p className="text-t3 text-sm py-4">Одоогоор мэдэгдэл алга. 🙌</p>}
          {d.notifications.map((n: any, i: number) => (
            <div key={i} onClick={() => n.contract_id && nav(`/contracts/${n.contract_id}`)}
                 className="flex gap-3 py-3 border-b border-sunken last:border-0 items-start cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg transition">
              <div className={`w-8 h-8 rounded-[10px] grid place-items-center shrink-0 text-sm ${
                n.level === "danger" ? "bg-danger-50 text-danger" :
                n.level === "warn" ? "bg-warn-50 text-warn" : "bg-brand-50 text-brand"}`}>
                {n.level === "danger" ? "!" : n.level === "warn" ? "◷" : "▤"}
              </div>
              <div className="min-w-0">
                <b className="text-[13.5px] text-ink font-semibold block leading-snug">{n.title}</b>
                <span className="text-[12.5px] text-t2">{n.sub}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-ink text-[15.5px]">Ачилт хүлээгдэж буй</h3>
            <span className="pill-blue">Дарга баталгаажуулна</span>
          </div>
          {d.pending_shipments.length === 0 && <p className="text-t3 text-sm py-4">Хүлээгдэж буй ачилт алга.</p>}
          {d.pending_shipments.map((p: any) => (
            <div key={p.id} className="flex gap-3 py-3 border-b border-sunken last:border-0 items-center">
              <div className="min-w-0 cursor-pointer" onClick={() => nav(`/contracts/${p.contract_id}`)}>
                <b className="text-[13.5px] text-ink font-semibold block">{p.client} — №{p.contract_no}</b>
                <span className="text-[12.5px] text-t2">{p.date} · {p.summary}</span>
              </div>
              {(u?.role === "factory" || u?.role === "manager") && (
                <button className="btn-secondary ml-auto !min-h-9 !py-1.5 !px-3 text-[13px]"
                        disabled={busy === p.id} onClick={() => confirmShipment(p.id)}>
                  {busy === p.id ? "…" : "Ачсан ✓"}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-ink text-[15.5px]">Зээлийн ойрын төлөлт</h3>
            {u?.role !== "factory" && (
              <button className="text-[12.5px] text-brand font-semibold cursor-pointer"
                      onClick={() => nav("/loans")}>Бүгд →</button>
            )}
          </div>
          {(d.loans_upcoming || []).length === 0 && <p className="text-t3 text-sm py-4">Идэвхтэй зээл алга.</p>}
          {(d.loans_upcoming || []).map((l: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-sunken last:border-0">
              <div className="min-w-0">
                <b className="text-[13.5px] text-ink font-semibold block truncate">{l.name}</b>
                <span className="text-[12px] text-t2">Сарын хүү {l.rate}%</span>
              </div>
              <div className="ml-auto text-right shrink-0">
                <b className="tabular-nums text-[13.5px]">{sayaFmt(l.amount)}₮</b>
                <span className="block text-[11.5px] text-t3">{l.due}</span>
              </div>
            </div>
          ))}
          {(d.loans_total || 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-sunken flex justify-between items-center">
              <span className="text-[12.5px] text-t2">Нийт өглөг</span>
              <b className="tabular-nums text-danger">{sayaFmt(d.loans_total)}₮</b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

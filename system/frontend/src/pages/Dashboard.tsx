import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, sayaFmt, user } from "../api";
import { Spinner, Prog, useToast, ConfirmModal } from "../ui";
import { useScope } from "../App";
import { useLive } from "../lib/live";
import RevChart from "../components/RevChart";

/** Даргад хамаарах мэдэгдлүүд — ачилт, гэрээний хугацаа. Нэхэмжлэлийн
 *  хугацаа хэтрэлт, алданги, зээл, амлалт нь санхүүгийн ажил тул түүнд харагдахгүй. */
const FACTORY_NOTE_KINDS = new Set(["shipment", "ending", "expired"]);

export default function Dashboard() {
  const { scope } = useScope();
  const [d, setD] = useState<any>(null);
  const [outQueue, setOutQueue] = useState<any[] | null>(null); // гадаа материалтай гэрээнүүд
  const [busy, setBusy] = useState<number | null>(null);
  const [ask, setAsk] = useState<any>(null);          // баталгаажуулах гэж буй ачилт
  const [lines, setLines] = useState<any[] | null>(null); // тухайн ачилтын мөрүүд
  const toast = useToast();
  const nav = useNavigate();
  const u = user();
  const isFactory = u?.role === "factory";

  /** Даргын ажлын дараалал — гадаа материалтай, идэвхтэй ТҮРЭЭСийн гэрээнүүд.
   *  Хамгийн их барааг барьж байгаа гэрээ дээр эхэлж очно. */
  function loadQueue() {
    if (!isFactory) return;
    api("/api/contracts")
      .then((rows: any[]) => setOutQueue(rows
        .filter((c) => c.type === "rent" && c.status === "active" && (c.qty_out || 0) > 0)
        .sort((a, b) => b.qty_out - a.qty_out)))
      .catch(() => setOutQueue([]));   // дараалал татагдаагүй нь ачилтын ажлыг зогсоох ёсгүй
  }
  const load = () => {
    loadQueue();
    return api(`/api/dashboard?scope=${scope}`).then(setD).catch((e) => toast(e.message, "err"));
  };
  /** Фонд шинэчлэх — эргэлдэгч гаргахгүй, алдааг чимээгүй залгина. */
  const refresh = () => {
    loadQueue();
    return api(`/api/dashboard?scope=${scope}`).then(setD).catch(() => {});
  };
  useLive((bg) => { if (bg) refresh(); else { setD(null); load(); } }, [scope]);

  if (!d) return <Spinner />;
  const k = d.kpi;
  const agingMax = Math.max(...d.aging.map((a: any) => a.amount), 1);
  const agingColors = ["#1F8B69", "#253886", "#F88712", "#C9363B"];

  /** Баталгаажуулах өмнө юу хөдлөхийг харуулна. Хяналтын самбарын мөр нь
   *  зөвхөн тоо ширхэгийн хураангуйтай тул мөрийн задаргааг гэрээнээс татна;
   *  татаж чадаагүй ч мөр дээрх хураангуйгаар асууна (хаалга нээлттэй үлдэхгүй). */
  function askShipment(p: any) {
    setAsk(p);
    setLines(null);
    api(`/api/contracts/${p.contract_id}`)
      .then((c) => setLines(c.movements?.find((m: any) => m.id === p.id)?.lines ?? []))
      .catch(() => setLines([]));
  }

  async function confirmShipment(id: number) {
    setBusy(id);
    try {
      await api(`/api/movements/${id}/confirm`, { method: "POST" });
      toast("Ачилт баталгаажлаа — нөөц хөдөлж, тооцоо эхэллээ");
      setAsk(null);
      load();
    } catch (e: any) { toast(e.message, "err"); }
    finally { setBusy(null); }
  }

  const notes = isFactory
    ? d.notifications.filter((n: any) => FACTORY_NOTE_KINDS.has(n.kind))
    : d.notifications;

  /** Ачилт хүлээгдэж буй — даргын гол ажил. `touch` горимд мөр том, товч нь
   *  анхаарлын товч болж 52px өндөр (планшетаар хуруугаар дардаг). */
  const shipmentsCard = (touch: boolean) => (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className={`font-bold text-ink ${touch ? "text-[17px]" : "text-[15.5px]"}`}>Ачилт хүлээгдэж буй</h3>
        <span className="pill-blue">
          {touch ? `${d.pending_shipments.length} хүлээгдэж байна` : "Дарга баталгаажуулна"}
        </span>
      </div>
      {d.pending_shipments.length === 0 && <p className="text-t3 text-sm py-4">Хүлээгдэж буй ачилт алга.</p>}
      {d.pending_shipments.map((p: any) => (
        <div key={p.id} className={`flex gap-3 border-b border-sunken last:border-0 ${
              touch ? "flex-wrap items-center py-3.5" : "items-center py-3"}`}>
          <div className={`min-w-0 cursor-pointer ${touch ? "flex-1 min-w-[170px]" : ""}`}
               onClick={() => nav(`/contracts/${p.contract_id}`)}>
            <b className={`text-ink font-semibold block ${touch ? "text-[15.5px] leading-tight" : "text-[13.5px]"}`}>
              {p.client} — №{p.contract_no}
            </b>
            <span className={`text-t2 ${touch ? "text-[13px]" : "text-[12.5px]"}`}>{p.date} · {p.summary}</span>
          </div>
          {(isFactory || u?.role === "manager") && (
            touch ? (
              <button className="btn-primary tap-lg px-6 max-[840px]:w-full max-[840px]:justify-center"
                      disabled={busy === p.id} onClick={() => askShipment(p)}>
                {busy === p.id ? "…" : "Ачсан ✓"}
              </button>
            ) : (
              <button className="btn-secondary ml-auto !min-h-9 !py-1.5 !px-3 text-[13px]"
                      disabled={busy === p.id} onClick={() => askShipment(p)}>
                {busy === p.id ? "…" : "Ачсан ✓"}
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );

  /** Гадаа байгаа материал — дарга юуг буцааж авахаа эндээс хардаг. */
  const returnQueueCard = (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="font-bold text-ink text-[17px]">Буцаалт хүлээж буй гэрээ</h3>
        {!!outQueue?.length && (
          <span className="pill-grey">
            {fmt(outQueue.reduce((s: number, c: any) => s + c.qty_out, 0))} ш гадаа
          </span>
        )}
      </div>
      {outQueue === null && <p className="text-t3 text-sm py-4">Ачаалж байна…</p>}
      {outQueue?.length === 0 && <p className="text-t3 text-sm py-4">Гадаа байгаа материал алга.</p>}
      {outQueue?.map((c: any) => (
        <button key={c.id} className="work-row" onClick={() => nav(`/contracts/${c.id}`)}>
          <div className="min-w-0">
            <b className="text-[15px] text-ink font-semibold block truncate">{c.client}</b>
            <span className="text-[12.5px] text-t2">№{c.no} · {c.start_date}-с</span>
          </div>
          <div className="ml-auto text-right shrink-0">
            <b className="text-[17px] tabular-nums text-ink leading-none">{fmt(c.qty_out)}</b>
            <span className="block text-[12px] text-t3 mt-1">ширхэг гадаа</span>
          </div>
        </button>
      ))}
    </div>
  );

  const notificationsCard = (
    <div className="card p-5">
      <h3 className="font-bold text-ink text-[15.5px] mb-3">Мэдэгдэл</h3>
      {notes.length === 0 && <p className="text-t3 text-sm py-4">Одоогоор мэдэгдэл алга. 🙌</p>}
      {notes.map((n: any, i: number) => (
        <div key={i} onClick={() => n.contract_id && nav(`/contracts/${n.contract_id}`)}
             className="flex gap-3 py-3 border-b border-sunken last:border-0 items-start cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg transition">
          <div className={`w-8 h-8 rounded-[10px] grid place-items-center shrink-0 text-sm ${
            n.level === "danger" ? "bg-danger-50 text-danger" :
            n.level === "warn" ? "bg-warn-50 text-warn" : "bg-brand-50 text-brand-ink"}`}>
            {n.level === "danger" ? "!" : n.level === "warn" ? "◷" : "▤"}
          </div>
          <div className="min-w-0">
            <b className="text-[13.5px] text-ink font-semibold block leading-snug">{n.title}</b>
            <span className="text-[12.5px] text-t2">{n.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );

  const confirmDialog = ask && (
    <ConfirmModal
      title="Ачилт баталгаажуулах"
      intro={<><b className="text-ink">{ask.client}</b> — Гэрээ №{ask.contract_no} · {ask.date}</>}
      rows={lines === null
        ? [{ label: "Ачилтын мөрүүд", value: "уншиж байна…", accent: "dim" as const }]
        : lines.length > 0
          ? lines.map((l: any) => ({ label: `${l.material} (${l.grade})`, value: `${fmt(l.qty)} ш` }))
          : [{ label: "Ачилтын мөр", value: ask.summary || "—", accent: "dim" as const }]}
      total={lines && lines.length > 0
        ? { label: "Ачих нийт", value: `${fmt(lines.reduce((s: number, l: any) => s + l.qty, 0))} ш` }
        : undefined}
      note="Баталгаажуулмагц нөөц хөдөлж, тооцоо эхэлнэ."
      confirmLabel="Ачсан ✓"
      onClose={() => setAsk(null)}
      onConfirm={() => confirmShipment(ask.id)} />
  );

  /* ---------- Үйлдвэрийн дарга: ажил нь эхний дэлгэцэнд ----------
     Авлага, орлогын график, насжилт, зээл нь түүний ажил биш — санхүүгийн
     блокуудыг огт үзүүлэхгүй. Эхлээд ачилт, дараа нь гадаа байгаа материал. */
  if (isFactory) return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ӨДРИЙН АЖИЛ <span>•</span> АМЬД</div>
          <h1 className="dashboard-title">Өнөөдрийн ажил</h1>
          <p className="dashboard-subtitle">Ачилтаа баталгаажуулж, гадаа байгаа материалаа хараарай.</p>
        </div>
      </div>
      <div className="work-queue">
        {shipmentsCard(true)}
        {returnQueueCard}
      </div>
      {notificationsCard}
      {confirmDialog}
    </div>
  );

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">УДИРДЛАГЫН ТОЙМ <span>•</span> АМЬД</div>
          <h1 className="dashboard-title">Удирдлагын төв</h1>
          <p className="dashboard-subtitle">
            {scope === "all" ? "Компанийн өнөөдрийн зураг — бүх тоо амьд." :
             scope === "rent" ? "Зөвхөн түрээсийн үзүүлэлтүүд." : "Зөвхөн худалдааны үзүүлэлтүүд."}
          </p>
        </div>
        <Link to="/contracts/new" className="btn-primary command-action">+ Шинэ гэрээ</Link>
      </div>

      {/* KPI */}
      <div className="command-metrics">
        <div className="command-hero relative overflow-hidden">
          <div className="text-[12.5px] text-white/80 font-medium mb-2">Авлагын нийт үлдэгдэл</div>
          <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight">
            {sayaFmt(k.receivable)} <span className="text-sm text-white/70 font-semibold">₮</span>
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
        {notificationsCard}
        {shipmentsCard(false)}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-ink text-[15.5px]">Зээлийн ойрын төлөлт</h3>
            <button className="text-[12.5px] text-brand-ink font-semibold cursor-pointer"
                    onClick={() => nav("/loans")}>Бүгд →</button>
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
                <span className="block text-[12px] text-t3">{l.due}</span>
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

      {confirmDialog}
    </div>
  );
}

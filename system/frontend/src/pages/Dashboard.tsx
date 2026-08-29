import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, money, sayaFmt, user } from "../api";
import { Spinner, Prog, useToast, ConfirmModal, Refreshing } from "../ui";
import { useScope } from "../App";
import { useLive } from "../lib/live";
import { rowClickProps } from "../lib/rowClick";
import { clientHref, contractHref, contractsHref, notificationHref } from "../lib/links";
import { invoiceLabel } from "../lib/invoice";
import { dueLabel, todayIso } from "../lib/schedule";
import RevChart from "../components/RevChart";

/** Даргад хамаарах мэдэгдлүүд — ачилт, гэрээний хугацаа. Нэхэмжлэлийн
 *  хугацаа хэтрэлт, алданги, зээл, амлалт нь санхүүгийн ажил тул түүнд харагдахгүй. */
const FACTORY_NOTE_KINDS = new Set(["shipment", "ending", "expired"]);

export default function Dashboard() {
  const { scope } = useScope();
  const [d, setD] = useState<any>(null);
  const [busyScope, setBusyScope] = useState(false);
  const [outQueue, setOutQueue] = useState<any[] | null>(null); // гадаа материалтай гэрээнүүд
  const [busy, setBusy] = useState<number | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false); // хэтэрсэн нэхэмжлэлийн задаргаа
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
  /* Түрээс/Худалдаа солиход самбарыг null болгож БҮТНЭЭР нь нурааж байв —
     нэг тоог нөгөөтэй нь харьцуулах гэж дарсан хүн хоосон дэлгэц хардаг.
     Одоо өмнөх тоо байрандаа үлдэж, зөвхөн бүдгэрнэ. */
  const load = () => {
    loadQueue();
    setBusyScope(true);
    return api(`/api/dashboard?scope=${scope}`).then(setD)
      .catch((e) => toast(e.message, "err"))
      .finally(() => setBusyScope(false));
  };
  /** Фонд шинэчлэх — бүдгэрүүлэг ч гаргахгүй, алдааг чимээгүй залгина. */
  const refresh = () => {
    loadQueue();
    return api(`/api/dashboard?scope=${scope}`).then(setD).catch(() => {});
  };
  useLive((bg) => (bg ? refresh() : load()), [scope]);

  if (!d) return <Spinner />;   // ЗӨВХӨН анхны ачаалал
  const k = d.kpi;
  const agingMax = Math.max(...d.aging.map((a: any) => a.amount), 1);
  const agingColors = ["#1F8B69", "#253886", "#F88712", "#C9363B"];
  /* Хуучин сервер (кэшлэгдсэн хуудас) эдгээр талбаргүй хариу буцаавал самбар
     нурах ёсгүй — хоосон жагсаалт руу унана. */
  const overdueList = d.overdue_list || [];
  const schedule = d.payment_schedule || [];
  const scheduleTotal = schedule.reduce((s: number, r: any) => s + r.projected_amount, 0);
  const today = todayIso();

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
          {/* Мөр дарагддаг — гараар ч дарагдана (Tab → Enter) */}
          <div className={`min-w-0 cursor-pointer ${touch ? "flex-1 min-w-[170px]" : ""}`}
               {...rowClickProps(() => nav(contractHref(p.contract_id)),
                                 `Гэрээ №${p.contract_no} · ${p.client} — нээх`, "link")}>
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
            {fmt(outQueue.reduce((s: number, c: any) => s + c.qty_out, 0))} ш түрээсэнд
          </span>
        )}
      </div>
      {outQueue === null && <p className="text-t3 text-sm py-4">Ачаалж байна…</p>}
      {outQueue?.length === 0 && <p className="text-t3 text-sm py-4">Түрээсэнд байгаа материал алга.</p>}
      {outQueue?.map((c: any) => (
        <button key={c.id} className="work-row" onClick={() => nav(contractHref(c.id))}
                aria-label={`Гэрээ №${c.no} · ${c.client} — ${fmt(c.qty_out)}ш түрээсэнд, нээх`}>
          <div className="min-w-0">
            <b className="text-[15px] text-ink font-semibold block truncate">{c.client}</b>
            <span className="text-[12.5px] text-t2">№{c.no} · {c.start_date}-с</span>
          </div>
          <div className="ml-auto text-right shrink-0">
            <b className="text-[17px] tabular-nums text-ink leading-none">{fmt(c.qty_out)}</b>
            <span className="block text-[12px] text-t3 mt-1">ширхэг түрээсэнд</span>
          </div>
        </button>
      ))}
    </div>
  );

  const notificationsCard = (
    <div className="card p-5">
      <h3 className="font-bold text-ink text-[15.5px] mb-3">Мэдэгдэл</h3>
      {notes.length === 0 && <p className="text-t3 text-sm py-4">Одоогоор мэдэгдэл алга. 🙌</p>}
      {notes.map((n: any, i: number) => {
        /* Мэдэгдэл бүр ХААШАА аваачихаа мэднэ: гэрээтэй бол гэрээ рүү, эс
           бөгөөс төрлийнхөө хуудас руу (зээл → Зээл, амлалт → Авлага
           цуглуулах, бартер → Бартер). Даргад хаалттай хуудас руу холбоос
           үүсэхгүй — тэр мөр зүгээр л уншигдана. */
        const to = notificationHref(n, u?.role);
        return (
        <div key={i}
             {...(to ? rowClickProps(() => nav(to), `${n.title} — нээх`, "link") : {})}
             className={`flex gap-3 py-3 border-b border-sunken last:border-0 items-start -mx-2 px-2 rounded-lg transition ${
               to ? "cursor-pointer hover:bg-canvas" : ""}`}>
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
        );
      })}
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
    <Refreshing busy={busyScope}>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ӨДРИЙН АЖИЛ <span>•</span> АМЬД</div>
          <h1 className="dashboard-title">Өнөөдрийн ажил</h1>
          <p className="dashboard-subtitle">Ачилтаа баталгаажуулж, түрээсэнд байгаа материалаа хараарай.</p>
        </div>
      </div>
      <div className="work-queue">
        {shipmentsCard(true)}
        {returnQueueCard}
      </div>
      {notificationsCard}
      {confirmDialog}
    </Refreshing>
  );

  return (
    <Refreshing busy={busyScope}>
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
          {/* Дугуйлсан тоо нь харцанд, бүтэн төгрөг нь хулгана хүрэхэд */}
          <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight"
               title={money(k.receivable)}>
            {sayaFmt(k.receivable)} <span className="text-sm text-white/70 font-semibold">₮</span>
          </div>
          <div className="mt-2"><span className="pill bg-white/10 text-white/80"
                                      title={money(k.penalty)}>алданги +{sayaFmt(k.penalty)}₮</span></div>
        </div>
        {/* «3 нэхэмжлэл хэтэрсэн» гэдэг тоо нь ЯМАР нэхэмжлэлүүд болохыг
            хэлдэггүй байв — Отгоо тоог хараад хэнд залгахаа мэдэхгүй үлддэг.
            Карт нь бүтнээрээ дарагдаж задарна (Tab-аар ч очно). */}
        <button type="button" className="command-metric w-full text-left"
                aria-expanded={overdueOpen} aria-controls="overdue-panel"
                onClick={() => setOverdueOpen(!overdueOpen)}>
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хугацаа хэтэрсэн</div>
          <div className="text-[28px] font-extrabold text-danger tabular-nums leading-tight"
               title={money(k.overdue)}>
            {sayaFmt(k.overdue)} <span className="text-sm text-t2 font-semibold">₮</span>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="pill-red">{k.overdue_count} нэхэмжлэл</span>
            {/* 12.5px биш 13px — картын бусад шошгыг ЗОРИУДААР том үсэг, mono
                болгодог дүрэм (index.css `.command-metric`) энэ дээр унахгүй:
                энэ бол шошго биш, ҮЙЛДЭЛ. */}
            <span className="text-[13px] text-brand-ink font-semibold">
              <span className="text-t3 mr-1">{overdueOpen ? "▾" : "›"}</span>Дэлгэрэнгүй
            </span>
          </div>
        </button>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Идэвхтэй гэрээ</div>
          <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">{k.active_contracts}</div>
          {/* Тоо нь АЛЬ гэрээнүүд болохыг хэлэх ёстой — шүүлтүүр нь хаягаар
              дамжиж, Гэрээнүүд «Дуусах дөхсөн» дээр нээгдэнэ. */}
          <div className="mt-2">
            {k.ending_soon > 0 ? (
              <Link to={contractsHref("ending")} className="pill-blue hover:underline">
                {k.ending_soon} нь удахгүй дуусна →
              </Link>
            ) : (
              <span className="pill-blue">{k.ending_soon} нь удахгүй дуусна</span>
            )}
          </div>
        </div>
        {scope === "sale" ? (
          <div className="card p-5">
            <div className="text-[12.5px] text-t2 font-medium mb-2">Энэ сарын худалдаа</div>
            <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight"
                 title={money(k.month_sale)}>
              {sayaFmt(k.month_sale)} <span className="text-sm text-t2 font-semibold">₮</span>
            </div>
          </div>
        ) : (
          <div className="card p-5">
            <div className="text-[12.5px] text-t2 font-medium mb-2">Нөөц түрээсэнд</div>
            <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">{k.utilization}<span className="text-sm text-t2 font-semibold"> %</span></div>
            <div className="mt-3"><Prog pct={k.utilization} label={`Нөөц түрээсэнд ${k.utilization}%`} color="#22C55E" /></div>
          </div>
        )}
      </div>

      {/* Хэтэрсэн нэхэмжлэлийн задаргаа — KPI картын ЯГ доор задарна */}
      {overdueOpen && (
        <div id="overdue-panel" className="card p-5 mb-3">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="font-bold text-ink text-[15.5px]">Хугацаа хэтэрсэн нэхэмжлэлүүд</h3>
            <span className="pill-red" title={money(k.overdue)}>
              {overdueList.length} нэхэмжлэл · {sayaFmt(k.overdue)}₮
            </span>
          </div>
          {overdueList.length === 0 ? (
            <p className="text-t3 text-sm py-4">Хэтэрсэн нэхэмжлэл алга 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead><tr>
                  <th className="th">Нэхэмжлэл</th><th className="th">Харилцагч</th>
                  <th className="th text-right">Үлдэгдэл</th><th className="th text-right">Хэтэрсэн</th>
                </tr></thead>
                <tbody>
                  {overdueList.map((o: any) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-canvas"
                        {...rowClickProps(() => nav(contractHref(o.contract_id)),
                          `${o.client} — ${money(o.remaining)}, ${o.days_overdue} хоног хэтэрсэн, гэрээ №${o.contract_no} нээх`,
                          "row")}>
                      <td className="td">
                        {/* Нэхэмжлэлийн нэр бүх дэлгэц дээр НЭГ дүрмээс гарна */}
                        <b className="text-ink">{invoiceLabel(o).title}</b>
                        <span className="block text-xs text-t3">
                          Гэрээ №{o.contract_no} · {o.due_date}-нд төлөгдөх ёстой байсан
                        </span>
                      </td>
                      {/* Мөр нь ГЭРЭЭ рүү; харилцагчийн нэр ӨӨРИЙН баганадаа
                          зогсож байгаа тул профайл руугаа очно. */}
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        <Link to={clientHref(o.client_id)} className="text-ink hover:underline">{o.client}</Link>
                      </td>
                      <td className="td text-right tabular-nums font-bold text-danger">{money(o.remaining)}</td>
                      <td className="td text-right"><span className="pill-red tabular-nums">{o.days_overdue} хоног</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Хүлээгдэж буй төлбөр — ТӨСӨӨЛӨЛ, нэхэмжлэгдсэн баримт БИШ */}
      <div className="card p-5 mb-3">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <h3 className="font-bold text-ink text-[15.5px]">Хүлээгдэж буй төлбөр</h3>
          <span className="pill-amber">төсөөлөл</span>
        </div>
        <p className="text-[12.5px] text-t2 mb-3">
          Цикл дуустал нэмэлт ачилт, буцаалт гарахгүй гэвэл ийм дүнтэй нэхэмжлэл төрнө —
          нэхэмжлэгдсэн дүн БИШ.
        </p>
        {schedule.length === 0 ? (
          <p className="text-t3 text-sm py-4">
            Хүлээгдэж буй төлбөр алга — идэвхтэй түрээсийн гэрээн дээр бараа түрээсэнд гарахад энд гарч ирнэ.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr>
                <th className="th">Хүлээх огноо</th><th className="th">Харилцагч</th>
                <th className="th">Гэрээ</th><th className="th text-right">Төсөөлөл</th>
                <th className="th text-right">Авлагын үлдэгдэл</th>
              </tr></thead>
              <tbody>
                {schedule.map((s: any) => (
                  <tr key={s.contract_id} className="cursor-pointer hover:bg-canvas"
                      {...rowClickProps(() => nav(contractHref(s.contract_id)),
                        `${s.client} — ${s.expected_date}-нд ойролцоогоор ${money(s.projected_amount)}, гэрээ №${s.contract_no} нээх`,
                        "row")}>
                    <td className="td"><b className="text-ink tabular-nums">{s.expected_date}</b>
                      <span className="block text-xs text-t3">{dueLabel(s.expected_date, today)} · {s.cycle_label}</span></td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <Link to={clientHref(s.client_id)} className="text-ink hover:underline">{s.client}</Link>
                    </td>
                    <td className="td text-t2">№{s.contract_no}</td>
                    {/* ≈ нь энэ тоо ТООЦООЛСОН гэдгийг нүдэнд шууд хэлнэ */}
                    <td className="td text-right tabular-nums font-bold text-ink"
                        title={`Төсөөлөл — ${money(s.projected_amount)}`}>≈{money(s.projected_amount)}</td>
                    <td className={`td text-right tabular-nums ${s.receivable > 0 ? "text-danger font-semibold" : "text-t3"}`}>
                      {s.receivable > 0 ? money(s.receivable) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 pt-3 border-t border-sunken flex justify-between items-center">
              <span className="text-[12.5px] text-t2">Энэ циклийн нийт төсөөлөл</span>
              <b className="tabular-nums text-ink" title={money(scheduleTotal)}>≈{sayaFmt(scheduleTotal)}₮</b>
            </div>
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
              {/* Зураасны урт нь хамгийн том хувингийн ХЭД дүйцэхийг хэлдэг —
                  тэр харьцаа хаана ч бичээстэй байгаагүй. */}
              <div className="flex-1"><Prog pct={(a.amount / agingMax) * 100} color={agingColors[i]}
                     label={`${a.label} — ${sayaFmt(a.amount)}₮, хамгийн том хувингийн ${Math.round((a.amount / agingMax) * 100)}%`} /></div>
              <b className="w-[80px] text-right tabular-nums text-[13px]" title={money(a.amount)}>{sayaFmt(a.amount)}</b>
            </div>
          ))}
          <div className="mt-4 pt-3.5 border-t border-sunken flex justify-between items-center">
            <span className="text-[12.5px] text-t2">90+ хоног хэтэрсэн</span>
            <b className="text-danger tabular-nums" title={money(d.aging[3].amount)}>{sayaFmt(d.aging[3].amount)}₮</b>
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
            <Link to="/loans" className="text-[12.5px] text-brand-ink font-semibold hover:underline">Бүгд →</Link>
          </div>
          {(d.loans_upcoming || []).length === 0 && <p className="text-t3 text-sm py-4">Идэвхтэй зээл алга.</p>}
          {(d.loans_upcoming || []).map((l: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-sunken last:border-0">
              <div className="min-w-0">
                <b className="text-[13.5px] text-ink font-semibold block truncate">{l.name}</b>
                <span className="text-[12px] text-t2">Сарын хүү {l.rate}%</span>
              </div>
              <div className="ml-auto text-right shrink-0">
                <b className="tabular-nums text-[13.5px]" title={money(l.amount)}>{sayaFmt(l.amount)}₮</b>
                <span className="block text-[12px] text-t3">{l.due}</span>
              </div>
            </div>
          ))}
          {(d.loans_total || 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-sunken flex justify-between items-center">
              <span className="text-[12.5px] text-t2">Нийт өглөг</span>
              <b className="tabular-nums text-danger" title={money(d.loans_total)}>{sayaFmt(d.loans_total)}₮</b>
            </div>
          )}
        </div>
      </div>

      {confirmDialog}
    </Refreshing>
  );
}

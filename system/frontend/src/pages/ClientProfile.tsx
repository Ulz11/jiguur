import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmt, money, sayaFmt, user } from "../api";
import { Spinner, StatePill, TypePill, Empty, useToast, Prog, InlineEdit } from "../ui";
import { PayModal } from "./ContractDetail";
import { invoiceLabel } from "../lib/invoice";
import { useDownload } from "../lib/docs";
import { rowClickProps } from "../lib/rowClick";
import { contractHref } from "../lib/links";
import { dueLabel, todayIso } from "../lib/schedule";
import {
  buildMonthGrid, latestMonth, latestDayInMonth, eventsOn, addMonth, dayCellLabel,
  parseIso, isoOf, WEEKDAYS_MN, monthLabelMN, type TLEvent, type YearMonth,
} from "../lib/calendar";

export default function ClientProfile() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [pay, setPay] = useState(false);
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dl = useDownload();
  const u = user();

  const load = () => api(`/api/clients/${id}`).then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, [id]);
  if (!d) return <Spinner />;
  const upcoming = d.upcoming || [];
  const today = todayIso();

  async function saveClient(patch: Record<string, string>) {
    await api(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify({
      name: d.name, reg: d.reg || "", person: d.person || "", phone: d.phone || "",
      note: d.note || "", ...patch }) });
    toast("Хадгалагдлаа");
    load();
  }

  const TABS = [
    ["overview", "Тойм"],
    ["contracts", `Гэрээ`, d.contracts.length],
    ["invoices", "Нэхэмжлэл", d.invoices.length],
    ["payments", "Төлбөр", d.payments.length],
    ["barter", "Бартер", d.barter?.length || 0],
    ["files", "Хавсралт", d.files.length],
  ] as any[];

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      await api(`/api/files/client/${id}`, { method: "POST", body: fd });
      toast("Файл хавсаргагдлаа");
      load();
    } catch (er: any) { toast(er.message, "err"); }
  }

  return (
    <div>
      <Link to="/clients" className="btn-ghost mb-3 inline-flex">← Харилцагчид руу буцах</Link>
      <div className="card p-6">
        <div className="flex gap-4 items-start flex-wrap">
          <div className="w-14 h-14 rounded-[18px] bg-brand-50 text-brand-ink grid place-items-center font-extrabold text-lg shrink-0">
            {d.name.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-[230px]">
            <h1 className="text-[22px] font-extrabold text-ink tracking-tight flex items-center gap-2.5 flex-wrap">
              {d.name}
              {d.overdue ? <span className="pill-red">Хэтэрсэн өртэй</span> :
               d.receivable > 0 ? <span className="pill-amber">Үлдэгдэлтэй</span> :
               <span className="pill-green">Хэвийн</span>}
            </h1>
            <div className="text-[13px] text-t2 mt-1.5 flex gap-x-4 gap-y-1.5 flex-wrap items-center">
              <span className="inline-flex items-center gap-1.5">Регистр:
                <InlineEdit label="Регистр" value={d.reg} width="w-28" confirmText="Хадгалах уу?"
                  onSave={(v) => saveClient({ reg: v })} /></span>
              <span className="inline-flex items-center gap-1.5">Хариуцагч:
                <InlineEdit label="Хариуцагч" value={d.person} width="w-36" confirmText="Хадгалах уу?"
                  onSave={(v) => saveClient({ person: v })} /></span>
              <span className="inline-flex items-center gap-1.5">Утас:
                <InlineEdit label="Утас" value={d.phone} width="w-32" confirmText="Хадгалах уу?"
                  onSave={(v) => saveClient({ phone: v })} /></span>
              <span>Хамтран ажилласан: <b className="text-t1">{d.since}-с</b></span>
            </div>
            <div className="mt-2.5 text-[12.5px] text-t2 inline-flex items-center gap-2">💬
              <InlineEdit label="Тэмдэглэл" value={d.note} display={d.note || "тэмдэглэл нэмэх…"} width="w-80"
                confirmText="Хадгалах уу?"
                onSave={(v) => saveClient({ note: v })} />
            </div>
          </div>
          {/* Дөрвөн үзүүлэлт нэг мөрөнд багтах ёстой тул гол тоо нь «сая»-гаараа
              үлдэнэ — гэхдээ АВЛАГА ярихад «12.3 сая» гэдэг хангалтгүй: залгаж
              нэхэх, тулгах дүн нь доор нь бүтнээрээ зогсоно. */}
          <div className="grid grid-cols-4 gap-6 max-sm:grid-cols-2">
            <Stat label="Авлага" val={sayaFmt(d.receivable) + "₮"} exact={money(d.receivable)} danger={d.overdue} />
            <Stat label="Алданги" val={d.penalty > 0 ? sayaFmt(d.penalty) + "₮" : "—"}
                  exact={d.penalty > 0 ? money(d.penalty) : undefined} danger={d.penalty > 0} />
            <Stat label="Барьцаа" val={d.deposit > 0 ? sayaFmt(d.deposit) + "₮" : "—"}
                  exact={d.deposit > 0 ? money(d.deposit) : undefined} />
            <Stat label="Гэрээ" val={String(d.contracts.length)} />
          </div>
        </div>
        {u?.role !== "factory" && (
          <div className="mt-4 flex gap-2.5">
            <button className="btn-secondary !min-h-10" onClick={() => setPay(true)}>Төлбөр бүртгэх</button>
          </div>
        )}

        <div className="flex gap-0.5 border-b border-line mt-5 mb-4 overflow-x-auto">
          {TABS.map(([v, l, n]: any) => (
            <button key={v} onClick={() => setTab(v)} aria-current={tab === v ? true : undefined}
              className={`tab-btn px-4 py-2.5 font-semibold text-[13.5px] border-b-[2.5px] -mb-px whitespace-nowrap min-h-11 transition ${
                tab === v ? "text-brand-ink border-brand" : "text-t2 border-transparent hover:text-ink"}`}>
              {l}{n !== undefined && <span className={`text-[12px] rounded-full px-1.5 py-0.5 ml-1.5 font-bold ${
                tab === v ? "bg-brand-50 text-brand-ink" : "bg-sunken text-t2"}`}>{n}</span>}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-[1.6fr_1fr] gap-6 max-lg:grid-cols-1">
            <div>
              <h3 className="font-bold text-[14.5px] mb-3.5">Сүүлийн үйл явдлууд</h3>
              {d.timeline.length === 0
                ? <p className="text-t3 text-sm">Түүх хоосон байна.</p>
                : <TimelineCalendar events={d.timeline} />}
            </div>
            <div>
              {/* Хүлээгдэж буй төлбөр — энэ харилцагчийн идэвхтэй түрээсийн
                  гэрээнүүдийн одоогийн циклийн ТӨСӨӨЛӨЛ. Мөнгөний блок тул
                  үйлдвэрийн даргад харагдахгүй (дашбоардын журамтай ижил). */}
              {u?.role !== "factory" && (
                <div className="mb-6">
                  <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                    <h3 className="font-bold text-[14.5px]">Хүлээгдэж буй төлбөр</h3>
                    <span className="pill-amber">төсөөлөл</span>
                  </div>
                  {upcoming.length === 0 ? (
                    <p className="text-t3 text-[13px]">Идэвхтэй түрээсийн гэрээнээс хүлээгдэх төлбөр алга.</p>
                  ) : upcoming.map((s: any) => (
                    <div key={s.contract_id}
                         className="flex items-center justify-between gap-3 py-2.5 border-b border-sunken cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg transition"
                         {...rowClickProps(() => nav(contractHref(s.contract_id)),
                           `Гэрээ №${s.contract_no} — ${s.expected_date}-нд ойролцоогоор ${money(s.projected_amount)}, нээх`,
                           "link")}>
                      <div className="min-w-0">
                        <b className="text-[13px] text-ink tabular-nums">{s.expected_date}</b>
                        <span className="block text-xs text-t3">
                          №{s.contract_no} · {dueLabel(s.expected_date, today)}
                        </span>
                      </div>
                      {/* ≈ нь энэ тоо ТООЦООЛСОН гэдгийг нүдэнд шууд хэлнэ */}
                      <b className="text-[13px] tabular-nums text-ink shrink-0"
                         title={`Төсөөлөл — ${money(s.projected_amount)}`}>≈{money(s.projected_amount)}</b>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2.5 text-[12.5px]">
                    <span className="text-t2">Авлагын үлдэгдэл</span>
                    <b className={`tabular-nums ${d.receivable > 0 ? "text-danger" : "text-t3"}`}>
                      {money(d.receivable)}
                    </b>
                  </div>
                </div>
              )}
              <h3 className="font-bold text-[14.5px] mb-3.5">Нэхэмжлэлийн байдал</h3>
              {d.invoices.slice(0, 6).map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-sunken last:border-0">
                  <div>
                    <Link to={contractHref(inv.contract_id)}
                          className="text-[13px] font-bold text-ink hover:underline">
                      №{inv.contract_no}
                    </Link>
                    <b className="text-[13px] text-ink"> · {inv.cycle_start}</b>
                    <span className="block text-xs text-t3 tabular-nums">{money(inv.total)}
                      {inv.penalty > 0 && <span className="text-danger"> + алданги {money(inv.penalty)}</span>}</span>
                  </div>
                  <StatePill state={inv.status} />
                </div>
              ))}
              {d.invoices.length === 0 && <Empty title="Нэхэмжлэл алга" />}
            </div>
          </div>
        )}

        {tab === "contracts" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead><tr><th className="th">Гэрээ</th><th className="th">Төрөл</th><th className="th">Явц</th>
                <th className="th text-right">Үлдэгдэл</th><th className="th">Төлөв</th></tr></thead>
              <tbody>
                {d.contracts.map((c: any) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-canvas group"
                      {...rowClickProps(() => nav(contractHref(c.id)),
                                        `Гэрээ №${c.no} нээх`, "row")}>
                    <td className="td"><b className="text-ink">№{c.no}</b>
                      <span className="block text-xs text-t3">{c.start_date}-с</span></td>
                    <td className="td"><TypePill type={c.type} /></td>
                    <td className="td min-w-[140px]">
                      {c.cycle ? <><div className="text-xs text-t2 mb-1">{c.cycle.days_done}/{c.cycle.days_total} хоног</div>
                        <Prog pct={(c.cycle.days_done / c.cycle.days_total) * 100} /></> : <span className="text-xs text-t3">—</span>}
                    </td>
                    <td className="td text-right tabular-nums font-bold" title={money(c.balance)}>{sayaFmt(c.balance)}₮</td>
                    <td className="td"><StatePill state={c.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "invoices" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">Нэхэмжлэл</th><th className="th text-right">Дүн</th>
                <th className="th text-right">Төлсөн</th><th className="th text-right">Үлдэгдэл</th>
                <th className="th text-right">Алданги</th><th className="th">Төлөв</th></tr></thead>
              <tbody>
                {d.invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    {/* Гэрээний дэлгэрэнгүй ба төлбөрийн модалтой ИЖИЛ нэр */}
                    <td className="td"><b className="text-ink">{invoiceLabel(inv).title}</b>
                      <span className="block text-xs text-t3">
                        {invoiceLabel(inv).sub && <>{invoiceLabel(inv).sub} · </>}
                        <Link to={contractHref(inv.contract_id)} className="text-t2 hover:underline">
                          Гэрээ №{inv.contract_no}
                        </Link>
                      </span></td>
                    <td className="td text-right tabular-nums">{money(inv.total)}</td>
                    <td className="td text-right tabular-nums">{money(inv.paid)}</td>
                    {/* Гэрээний дэлгэрэнгүйтэй ИЖИЛ багана — хоёр дэлгэц дээр
                        нэг нэхэмжлэлийн үлдэгдэл өөр өөрөөр гарахгүй. */}
                    <td className={`td text-right tabular-nums font-bold ${
                          inv.outstanding > 0 && inv.status === "overdue" ? "text-danger"
                          : inv.outstanding > 0 ? "text-ink" : "text-t3"}`}>
                      {inv.outstanding > 0 ? money(inv.outstanding) : "—"}
                    </td>
                    <td className="td text-right tabular-nums text-danger">{inv.penalty > 0 ? money(inv.penalty) : "—"}</td>
                    <td className="td"><StatePill state={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.invoices.length === 0 && <Empty title="Нэхэмжлэл алга" />}
          </div>
        )}

        {tab === "payments" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead><tr><th className="th">Огноо</th><th className="th text-right">Дүн</th><th className="th">Хэлбэр</th><th className="th">Гэрээ</th></tr></thead>
              <tbody>
                {d.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="td">{p.date}</td>
                    <td className="td text-right tabular-nums font-bold text-ink">{money(p.amount)}</td>
                    <td className="td">
                      <span className={p.method === "BARTER" ? "pill-violet" : p.method === "CASH" ? "pill-green" : "pill-blue"}>
                        {p.method === "BARTER" ? `Бартер · ${p.barter_desc}` : p.method === "CASH" ? "Бэлэн" : "Данс"}
                      </span>
                    </td>
                    <td className="td text-t2">
                      {p.contract_id
                        ? <Link to={contractHref(p.contract_id)} className="text-ink hover:underline">
                            №{p.contract_no}
                          </Link>
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.payments.length === 0 && <Empty title="Төлбөр алга" />}
          </div>
        )}

        {tab === "barter" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th">Хөрөнгө</th><th className="th text-right">Орж ирсэн үнэ</th>
                <th className="th">Төлөв</th><th className="th text-right">Ашиг / Алдагдал</th></tr></thead>
              <tbody>
                {(d.barter || []).map((a: any) => (
                  <tr key={a.id}>
                    <td className="td"><span className="font-bold text-ink">{a.name}</span>
                      <span className="block text-xs text-t3">{a.type} · {a.date_in}</span></td>
                    <td className="td text-right tabular-nums">{money(a.value_in)}</td>
                    <td className="td">
                      {a.status === "held" ? <span className="pill-blue">Хадгалагдаж буй</span> :
                       a.status === "sold" ? <span className="pill-grey">Зарагдсан</span> :
                       <span className="pill-green">Нөөцөд орсон</span>}
                    </td>
                    <td className="td text-right tabular-nums">
                      {a.gain !== null && a.gain !== undefined
                        ? <b className={a.gain < 0 ? "text-danger" : "text-money"}>{a.gain > 0 ? "+" : ""}{money(a.gain)}</b>
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(d.barter || []).length === 0 && <Empty title="Бартер алга"
              sub="Энэ харилцагчаас бартераар орж ирсэн хөрөнгө байхгүй." />}
          </div>
        )}

        {tab === "files" && (
          <div>
            {d.files.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 py-3 border-b border-sunken last:border-0">
                {/* Файлын өргөтгөл — дүрсний оронд суусан тэмдэг. Нэр нь хажуудаа
                    бүтнээрээ байгаа тул мэдээллийг давхардуулна; 11px хэвээр. */}
                <div className="w-9 h-9 rounded-[10px] bg-danger-50 text-danger grid place-items-center text-[11px] font-extrabold shrink-0">
                  {(f.filename.split(".").pop() || "F").toUpperCase().slice(0, 4)}
                </div>
                <div className="min-w-0">
                  <b className="text-[13.5px] text-ink block truncate">{f.filename}</b>
                  <span className="text-[12px] text-t3">{(f.size / 1024).toFixed(0)} KB · {f.uploaded_at}</span>
                </div>
                {/* Татахад сервер алдаа буцаавал өмнө нь алдааны JSON нь
                    файлын нэрээр диск рүү бууж, юу болсон нь мэдэгдэхгүй байв. */}
                <a className="btn-ghost ml-auto !min-h-9" href={`/api/files/dl/${f.id}`}
                   aria-busy={dl.busyPath === `/api/files/dl/${f.id}` || undefined}
                   onClick={(e) => { e.preventDefault(); dl.download(`/api/files/dl/${f.id}`, f.filename); }}>
                  {dl.busyPath === `/api/files/dl/${f.id}` ? "Татаж байна…" : "Татах"}
                </a>
              </div>
            ))}
            {d.files.length === 0 && <Empty title="Хавсралт алга" sub="Гэрээний скан, падангийн зураг зэргийг энд хадгална." />}
            <input type="file" ref={fileRef} className="hidden" onChange={upload} />
            <button className="btn-secondary mt-4" onClick={() => fileRef.current?.click()}>+ Файл хавсаргах</button>
          </div>
        )}
      </div>

      {pay && <PayModal client_id={d.id} d={null} invoices={d.invoices} onClose={() => setPay(false)} onDone={() => { setPay(false); load(); }} />}
    </div>
  );
}

/** `exact` — бүтэн төгрөгийн дүн. Дугуйлсан тоо нь ХАРАХАД, бүтэн тоо нь
 *  АЖИЛЛАХАД хэрэгтэй (нэхэх, тулгах, шилжүүлэг бичих). Хоёуланг нь нэг
 *  багана дээр шатлан харуулна. */
function Stat({ label, val, exact, danger }: any) {
  return (
    <div>
      <div className="text-[12px] text-t3 font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${danger ? "text-danger" : "text-ink"}`}
           title={exact}>{val}</div>
      {exact && <div className="text-[12px] text-t2 tabular-nums mt-0.5">{exact}</div>}
    </div>
  );
}

/* ---------- Тойм: сарын хуанли (босоо timeline-ийн оронд) ---------- */
// Төрөл бүрийн өнгө: төлбөр→ногоон, буцаалт→улбар, акт→улаан, ачилт/гэрээ→brand
const KIND_DOT: Record<string, string> = {
  // «Гэрээ» нь өмнө нь «Ачилт»-тай ЯГ ижил улбар цэгтэй байсан — тайлбар
  // гаргамагц хоёр ижил цэг хоёр өөр нэртэй зогсох тул ялгав.
  payment: "bg-money", return: "bg-warn", writeoff: "bg-danger", issue: "bg-brand", contract: "bg-violet",
};
/* Цэг бүр ЮУ гэсэн үг болохыг хаана ч бичээгүй байсан — өнгө нь дангаараа
   утга зөөж чадахгүй. Тайлбарыг торны доор ил гаргаж, нүд бүрийн дуудагдах
   нэрэнд ч мөн энэ нэрсийг ашиглана (нэг эх сурвалж). */
const KIND_LABEL: Record<string, string> = {
  payment: "Төлбөр", issue: "Ачилт", return: "Буцаалт", writeoff: "Акт", contract: "Гэрээ",
};
const KIND_ORDER = ["contract", "issue", "return", "writeoff", "payment"];
const LEGEND = ["payment", "issue", "return", "writeoff", "contract"];
const dotCls = (k: string) => KIND_DOT[k] || "bg-brand";

function TimelineCalendar({ events }: { events: TLEvent[] }) {
  const now = new Date();
  const todayIso = isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const [view, setView] = useState<YearMonth>(
    () => latestMonth(events) ?? { year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selected, setSelected] = useState<string | null>(
    () => latestDayInMonth(events, view.year, view.month));

  const grid = useMemo(() => buildMonthGrid(events, view.year, view.month), [events, view]);
  const dayEvents = selected ? eventsOn(events, selected) : [];
  const prev = addMonth(view, -1);
  const next = addMonth(view, 1);

  function go(delta: number) {
    const nv = addMonth(view, delta);
    setView(nv);
    setSelected(latestDayInMonth(events, nv.year, nv.month));
  }

  function selHeading(iso: string) {
    const p = parseIso(iso);
    const wd = WEEKDAYS_MN[(new Date(p.year, p.month - 1, p.day).getDay() + 6) % 7];
    return `${p.month}-р сарын ${p.day}, ${wd}`;
  }

  return (
    <div>
      {/* Сар сонгох мөр */}
      <div className="flex items-center justify-between mb-3">
        {/* ‹ › нь дүрс дээрээ л ярьдаг — хаашаа очихыг нь нэрэндээ агуулна */}
        <button onClick={() => go(-1)} aria-label={`Өмнөх сар — ${monthLabelMN(prev.year, prev.month)}`}
          className="w-10 h-10 rounded-lg grid place-items-center text-t2 hover:bg-brand-50 hover:text-brand-ink text-lg font-bold transition">‹</button>
        <b className="text-[14px] text-ink font-bold tabular-nums" aria-live="polite">{monthLabelMN(view.year, view.month)}</b>
        <button onClick={() => go(1)} aria-label={`Дараах сар — ${monthLabelMN(next.year, next.month)}`}
          className="w-10 h-10 rounded-lg grid place-items-center text-t2 hover:bg-brand-50 hover:text-brand-ink text-lg font-bold transition">›</button>
      </div>

      {/* Гарагийн толгой */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS_MN.map((w, i) => (
          <div key={w} className={`text-center text-[12px] font-bold py-1 ${i === 6 ? "text-danger" : "text-t3"}`}>{w}</div>
        ))}
      </div>

      {/* Хоногийн тор */}
      <div className="grid grid-cols-7 gap-1">
        {grid.weeks.flat().map((c, i) => {
          if (!c.inMonth) return <div key={i} className="min-h-[58px]" />;
          const kinds = KIND_ORDER.filter((k) => c.counts[k]).concat(
            Object.keys(c.counts).filter((k) => !KIND_ORDER.includes(k)));
          const total = c.events.length;
          const isSel = c.iso === selected;
          const isToday = c.iso === todayIso;
          return (
            <button key={i} onClick={() => setSelected(c.iso)} className={`cal-day min-h-[58px] rounded-lg p-1.5 flex flex-col text-left border transition ${
                isSel ? "border-brand bg-brand-50 ring-1 ring-brand"
                : total ? "border-line bg-card2 hover:bg-brand-50"
                : "border-line bg-cardbg hover:bg-sunken"}`}
              aria-label={dayCellLabel(c.iso, c.counts, KIND_LABEL)}
              aria-pressed={isSel} {...(isToday ? { "aria-current": "date" as const } : {})}>
              <span className={`text-[13px] font-bold tabular-nums ${
                isSel ? "text-brand-ink" : isToday ? "text-brand-ink" : "text-t2"}`}>
                {c.day}{isToday && <i className="inline-block w-1 h-1 rounded-full bg-brand align-super ml-0.5" />}
              </span>
              {total > 0 && (
                <span className="mt-auto flex items-center gap-1 flex-wrap" aria-hidden="true">
                  {kinds.map((k) => <i key={k} className={`w-2 h-2 rounded-full ${dotCls(k)}`} />)}
                  <span className="text-[12px] font-bold text-t2 ml-0.5 tabular-nums">{total}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Цэгний тайлбар — өнгө нь юу гэсэн үг болохыг ЭНД хэлнэ */}
      <ul className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-t2 list-none p-0">
        {LEGEND.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <i className={`w-2 h-2 rounded-full ${dotCls(k)}`} aria-hidden="true" />
            {KIND_LABEL[k]}
          </li>
        ))}
      </ul>

      {/* Сонгосон өдрийн үйл явдлууд */}
      <div className="mt-4 border-t border-line pt-3.5 min-h-[64px]">
        {selected && dayEvents.length > 0 ? (
          <>
            <div className="text-[12.5px] font-bold text-ink mb-2.5">{selHeading(selected)}</div>
            {dayEvents.map((e, i) => (
              <div key={i} className="flex gap-2.5 pb-3 last:pb-0">
                <i className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${dotCls(e.kind)}`} />
                <div className="min-w-0">
                  <b className="block text-[13.5px] text-ink font-semibold">{e.title}</b>
                  <span className="text-[12.5px] text-t2">{e.sub}</span>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="text-t3 text-[13px] text-center py-2">Энэ сард үйл явдал алга.</p>
        )}
      </div>
    </div>
  );
}

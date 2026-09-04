import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmt, money, sayaFmt, sayaFmtLike, user } from "../api";
import { Spinner, StatePill, TypePill, Empty, useToast, Prog, InlineEdit,
         FormModal, ConfirmModal, Receipt, SubmitButton,
         FinanceDisclosure, FinanceBlock, FinanceRow } from "../ui";
import { PayModal } from "./ContractDetail";
import { VoidButton, VoidPaymentModal } from "../components/VoidPayment";
import { NotesStrip } from "../components/Notes";
import { ContactsCard } from "../components/Contacts";
import { isVoided, voidRowClass, voidTitle } from "../lib/void";
import { ClientEntry, ENTRY_KINDS, EntryKind, EntryMode, entryAmountText,
         entryError, entryKindLabel, entryKindPill, entryModeLabel,
         entrySubText, receivableAfter, signedAmount } from "../lib/entry";
import { invoiceLabel } from "../lib/invoice";
import { useDownload } from "../lib/docs";
import { rowClickProps } from "../lib/rowClick";
import { contractHref } from "../lib/links";
import { dueLabel, todayIso } from "../lib/schedule";
import { penaltySplit, UNCHARGED } from "../lib/penalty";
import { uninvoicedLine } from "../lib/receivable";
import { withoutMoney } from "../lib/timeline";
import {
  buildMonthGrid, latestMonth, latestDayInMonth, eventsOn, addMonth, dayCellLabel,
  parseIso, isoOf, WEEKDAYS_MN, monthLabelMN, type TLEvent, type YearMonth,
} from "../lib/calendar";

export default function ClientProfile() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [pay, setPay] = useState(false);
  const [voidPay, setVoidPay] = useState<any>(null);
  /* ТҮРЭЭС БИШ бичилт (H11): шинэ бичилтийн цонх ба цуцлах гэж буй мөр. */
  const [entryNew, setEntryNew] = useState(false);
  const [voidEntry, setVoidEntry] = useState<ClientEntry | null>(null);
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
  /* Төлбөр цуцлах нь мөнгөний засвар — менежер, санхүүчийнх (сервер ч тэгнэ). */
  const canVoid = u?.role === "manager" || u?.role === "finance";
  /* Даргын хувьд энэ хуудас нь «энэ харилцагчид юу гарсан, юу буцсан» —
     авлага, нэхэмжлэл, төлбөр нь ХОЙНО, «Санхүү» задаргаа дотор нэг дор
     (эзэний шийдвэр: нууц биш, ЦЭГЦ). */
  const seesMoney = u?.role !== "factory";

  /* InlineEdit-ийн хадгалалт: алдааг toast-оор гаргаад ДАХИН шиднэ (H10).
     Урьд нь энд try/catch байгаагүй тул `api`-ийн шидсэн алдааг InlineEdit
     чимээгүй залгидаг байв: Отгоо регистр/утсаа засаад ✓ дарахад дэлгэц дээр
     ЮУ Ч болохгүй, хуучин утга нь эргэж ирнэ. Одоо Loans/Salary/Machines/
     ContractDetail-ийн `doPatch`-тай ЯГ ижил зам — toast + throw. */
  async function saveClient(patch: Record<string, string>) {
    try {
      await api(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify({
        name: d.name, reg: d.reg || "", person: d.person || "", phone: d.phone || "",
        note: d.note || "", ...patch }) });
      toast("Хадгалагдлаа");
      load();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  }

  /* Даргад мөнгөний ГУРВАН таб байхгүй — тэдгээрийн хүснэгт нь «Санхүү»
     задаргаа дотор, доор нэг дор зогсоно. Табын мөр нь түүний АЖЛЫН зам:
     тойм, гэрээ, хавсралт. */
  const TABS = ([
    ["overview", "Тойм"],
    ["contracts", `Гэрээ`, d.contracts.length],
    ...(seesMoney ? [
      ["invoices", "Нэхэмжлэл", d.invoices.length],
      ["payments", "Төлбөр", d.payments.length],
      ["barter", "Бартер", d.barter?.length || 0],
      ["entries", "Бусад бичилт", d.entries?.length || 0],
    ] : []),
    ["files", "Хавсралт", d.files.length],
  ]) as any[];

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
          <div className={`grid gap-6 ${seesMoney ? "grid-cols-4 max-sm:grid-cols-2" : "grid-cols-1"}`}>
            {seesMoney && (<>
            {/* АВЛАГА = нэхэмжилсэн + одоогийн циклийн хуримтлал (H9b) — энэ
                тоо жагсаалт, дашбоард, Авлага цуглуулах дээр ЯГ ИЖИЛ. Дундах
                хуримтлалыг доор нь нэрлэнэ: нуувал «тоо зөрж байна» болно.
                Дэд бичиг нь ТОЛГОЙН шатаар (`sayaFmtLike`) — толгой «1.2 сая₮»
                байхад «13,200₮» гэж бичвэл нэг үзүүлэлт дотор хоёр хэмжүүр
                зэрэгцэнэ. «0.01 сая₮» гэдэг нь богино ч БҮРЭН үнэн; яг дүн нь
                доорх бүтэн ₮ мөр ба hover дээр хэвээр. */}
            <Stat label="Авлага" val={sayaFmt(d.receivable) + "₮"} exact={money(d.receivable)}
                  danger={d.overdue}
                  note={uninvoicedLine(d.receivable_uninvoiced, d.receivable) || undefined} />
            {/* АЛДАНГИ ХОЁР НҮҮРТЭЙ (R25 / H2): нэхэгдсэн нь ӨР (улаан),
                нэхэгдээгүй нь зөвхөн ТООЦООЛОЛ — ≈ угтвартай, бүдэг, доор нь
                «нэхэгдээгүй» гэж бичигдэнэ. Нэг тоо болгож нийлүүлбэл Отгоо
                «машин өр зохиов» гэж уншина. */}
            {(() => {
              const pen = penaltySplit(d.penalty, d.penalty_booked);
              return pen.booked > 0
                ? <Stat label="Нэхэгдсэн алданги" val={sayaFmt(pen.booked) + "₮"}
                        exact={money(pen.booked)} danger
                        note={pen.showUnbooked
                          ? `≈${sayaFmtLike(pen.unbooked, pen.booked)}₮ ${UNCHARGED}` : undefined} />
                : <Stat label="Алдангийн тооцоолол"
                        val={pen.showUnbooked ? "≈" + sayaFmt(pen.unbooked) + "₮" : "—"}
                        exact={pen.showUnbooked ? money(pen.unbooked) : undefined}
                        note={pen.showUnbooked ? UNCHARGED : undefined} />;
            })()}
            <Stat label="Барьцаа" val={d.deposit > 0 ? sayaFmt(d.deposit) + "₮" : "—"}
                  exact={d.deposit > 0 ? money(d.deposit) : undefined} />
            </>)}
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
          /* Даргад баруун багана нь бүхэлдээ МӨНГӨ (хүлээгдэж буй төлбөр,
             нэхэмжлэлийн байдал) — тэр нь доорх «Санхүү» задаргаанд нүүсэн
             тул түүний тойм НЭГ баганаар, түүхээрээ дүүрч зогсоно. */
          <div className={`grid gap-6 max-lg:grid-cols-1 ${
            seesMoney ? "grid-cols-[1.6fr_1fr]" : "grid-cols-1"}`}>
            <div>
              <h2 className="font-bold text-[14.5px] mb-3.5">Сүүлийн үйл явдлууд</h2>
              {d.timeline.length === 0
                ? <p className="text-t3 text-sm">Түүх хоосон байна.</p>
                : <TimelineCalendar events={d.timeline} money={seesMoney} />}
            </div>
            {seesMoney && (
            <div>
              {/* Хүлээгдэж буй төлбөр — энэ харилцагчийн идэвхтэй түрээсийн
                  гэрээнүүдийн одоогийн циклийн ТӨСӨӨЛӨЛ. Мөнгөний блок тул
                  үйлдвэрийн даргад харагдахгүй (дашбоардын журамтай ижил). */}
              {u?.role !== "factory" && (
                <div className="mb-6">
                  <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                    <h2 className="font-bold text-[14.5px]">Хүлээгдэж буй төлбөр</h2>
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
                  {/* Дээрх «≈» төсөөллүүд ба энэ үлдэгдэл хоёр хоорондоо
                      холбогдоно: үлдэгдлийн дотор хэдэн төгрөг нь хараахан
                      нэхэгдээгүй хуримтлал болохыг ЭНД хэлнэ (H9b). */}
                  {uninvoicedLine(d.receivable_uninvoiced) && (
                    <div className="text-right text-[12px] text-t3 tabular-nums">
                      {uninvoicedLine(d.receivable_uninvoiced)}
                    </div>)}
                </div>
              )}
              <h2 className="font-bold text-[14.5px] mb-3.5">Нэхэмжлэлийн байдал</h2>
              {d.invoices.slice(0, 6).map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-sunken last:border-0">
                  <div>
                    <Link to={contractHref(inv.contract_id)}
                          className="text-[13px] font-bold text-ink hover:underline">
                      №{inv.contract_no}
                    </Link>
                    <b className="text-[13px] text-ink"> · {inv.cycle_start}</b>
                    <span className="block text-xs text-t3 tabular-nums">{money(inv.total)}
                      {inv.penalty_due > 0 && <span className="text-danger"> + алданги {money(inv.penalty_due)}</span>}
                      {inv.penalty_unbooked > 0 && <span className="text-t3"> · ≈{money(inv.penalty_unbooked)} {UNCHARGED}</span>}</span>
                  </div>
                  <StatePill state={inv.status} />
                </div>
              ))}
              {d.invoices.length === 0 && <Empty title="Нэхэмжлэл алга" />}
            </div>
            )}
          </div>
        )}

        {tab === "contracts" && (
          <div className="overflow-x-auto">
            <table className={`w-full ${seesMoney ? "min-w-[600px]" : "min-w-[460px]"}`}>
              <thead><tr><th className="th">Гэрээ</th><th className="th">Төрөл</th><th className="th">Явц</th>
                {seesMoney && <th className="th text-right">Үлдэгдэл</th>}
                <th className="th">Төлөв</th></tr></thead>
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
                    {seesMoney && (
                      <td className="td text-right tabular-nums font-bold" title={money(c.balance)}>{sayaFmt(c.balance)}₮</td>
                    )}
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
                <th className="th text-right">Нэхэгдсэн алданги</th><th className="th">Төлөв</th></tr></thead>
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
                    {/* НЭХЭГДСЭН нь л мөнгө. Нэхэгдээгүй тооцоолол нь доор,
                        бүдэг, ≈ угтвартай — багана нь өрийн багана хэвээр. */}
                    <td className="td text-right tabular-nums">
                      <span className="text-danger">{inv.penalty_due > 0 ? money(inv.penalty_due) : "—"}</span>
                      {inv.penalty_unbooked > 0 && (
                        <span className="block text-[12px] text-t3">
                          ≈{money(inv.penalty_unbooked)} {UNCHARGED}</span>)}
                    </td>
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
            <table className="w-full min-w-[620px]">
              <thead><tr><th className="th">Огноо</th><th className="th text-right">Дүн</th>
                <th className="th">Хэлбэр</th><th className="th">Гэрээ</th>
                {canVoid && <th className="th">Үйлдэл</th>}</tr></thead>
              <tbody>
                {d.payments.map((p: any) => (
                  /* Цуцлагдсан мөр УСТАХГҮЙ: зурагдаж, бүдгэрч, «ХҮЧИНГҮЙ»
                     тэмдэг, шалтгаантайгаа хамт үлдэнэ. Гэрээний хуудсан дээрх
                     дүрэмтэй ЯГ ижил (lib/void.ts) — нэг бичилт хоёр дэлгэц
                     дээр өөр харагдвал аль нь үнэн бэ гэж эргэлзэнэ. */
                  <tr key={p.id} title={voidTitle(p)}>
                    <td className={`td ${voidRowClass(p)}`}>{p.date}</td>
                    <td className={`td text-right tabular-nums font-bold text-ink ${voidRowClass(p)}`}>
                      {money(p.amount)}
                    </td>
                    <td className="td">
                      <span className={`${voidRowClass(p)} ${p.method === "BARTER" ? "pill-violet" : p.method === "CASH" ? "pill-green"
                        : p.method === "CREDIT" ? "pill-grey" : "pill-blue"}`}>
                        {p.method === "BARTER" ? `Бартер · ${p.barter_desc}` : p.method === "CASH" ? "Бэлэн"
                         : p.method === "CREDIT" ? "Бичилтийн кредит" : "Данс"}
                      </span>
                      {isVoided(p) && (
                        <>
                          {" "}<span className="pill-red">ХҮЧИНГҮЙ</span>
                          {p.void_reason && (
                            <span className="block text-[12px] text-danger">
                              {p.void_reason}
                              {p.voided_by && <span className="text-t3"> · {p.voided_by}</span>}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="td text-t2">
                      {p.contract_id
                        ? <Link to={contractHref(p.contract_id)} className="text-ink hover:underline">
                            №{p.contract_no}
                          </Link>
                        : "—"}
                    </td>
                    {canVoid && (
                      <td className="td">
                        {isVoided(p)
                          ? <span className="text-t3">—</span>
                          : <VoidButton label={`${money(p.amount)} · ${p.date}`}
                                        onClick={() => setVoidPay(p)} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {d.payments.length === 0 && <Empty title="Төлбөр алга" />}
          </div>
        )}

        {/* ТҮРЭЭС БИШ БИЧИЛТ (H11 / P1-16) — олгосон зээл, ажилчдын цалин,
            кран, харилцагч хоорондын тооцоо. Эдгээр нь ӨӨРИЙН үлдэгдэл
            үүсгэхгүй: дебит нь дансны нэхэмжлэл, кредит нь төлбөр болж
            АВЛАГЫН ХУУЧИН ЗАМААР явна (H9 — нэг факт, нэг тоо). */}
        {tab === "entries" && (
          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <p className="text-[13px] text-t2 max-w-2xl">
                Түрээсийн мөчлөгт хамаарахгүй бичилтүүд — олгосон зээл, түүний
                өмнөөс төлсөн цалин, кран, харилцагч хоорондын тооцоо. Бичилт бүр
                харилцагчийн авлагад ЯГ тэр дүнгээрээ буудаг.
              </p>
              {canVoid && (
                <button className="btn-primary !min-h-10" onClick={() => setEntryNew(true)}>
                  + Бичилт
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead><tr><th className="th">Огноо</th><th className="th">Төрөл</th>
                  <th className="th">Юуны төлөө</th><th className="th text-right">Дүн</th>
                  {canVoid && <th className="th">Үйлдэл</th>}</tr></thead>
                <tbody>
                  {(d.entries || []).map((e: ClientEntry) => (
                    <tr key={e.id} title={voidTitle(e)}>
                      <td className={`td ${voidRowClass(e)}`}>{e.date}</td>
                      <td className="td">
                        <span className={`${entryKindPill(e.kind)} ${voidRowClass(e)}`}>
                          {e.kind_mn || entryKindLabel(e.kind)}
                        </span>
                        {isVoided(e) && <> <span className="pill-red">ХҮЧИНГҮЙ</span></>}
                      </td>
                      <td className="td">
                        <span className={`text-ink ${voidRowClass(e)}`}>{e.label}</span>
                        {entrySubText(e) && (
                          <span className="block text-[12px] text-t3">{entrySubText(e)}</span>
                        )}
                        {isVoided(e) && e.void_reason && (
                          <span className="block text-[12px] text-danger">
                            {e.void_reason}
                            {e.voided_by && <span className="text-t3"> · {e.voided_by}</span>}
                          </span>
                        )}
                      </td>
                      {/* Тэмдэг нь ҮГТЭЙ хамт явна: улаан/ногооныг ялгадаггүй
                          нүдэнд ч «+» «−» нь өөрөө уншигдана (UI-ЗАРЧИМ §4). */}
                      <td className={`td text-right tabular-nums font-bold ${voidRowClass(e)} ${
                            e.amount < 0 ? "text-money" : "text-ink"}`}>
                        {entryAmountText(e.amount, money)}
                      </td>
                      {canVoid && (
                        <td className="td">
                          {isVoided(e)
                            ? <span className="text-t3">—</span>
                            : <VoidButton label={`${e.label} · ${money(Math.abs(e.amount))}`}
                                          onClick={() => setVoidEntry(e)} />}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {(d.entries || []).length === 0 && (
                <Empty title="Бусад бичилт алга"
                       sub="Олгосон зээл, ажилчдын цалин, кран, харилцагч хоорондын тооцоог энд бичнэ." />
              )}
            </div>
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
                       a.status === "voided" ? <span className="pill-red">ХҮЧИНГҮЙ</span> :
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

      {/* ХОЛБОО БАРИХ (№72, 73) — гарын үсгийн блокийн 2-4 хүн. Дээрх
          «Хариуцагч / Утас» нь ҮНДСЭН хос болж хэвээр үлдэнэ; тэр нярав руу
          залгадаг гэдгийг энэ карт мэднэ. */}
      <div className="mt-4">
        <ContactsCard clientId={d.id} contacts={d.contacts} canWrite={seesMoney}
                      onChanged={load} />
      </div>

      {/* ЗАХЫН ТЭМДЭГЛЭЛ (P1-22) — «модонд», «нөат шивсэн», «хаав». Табны
          ГАДНА зогсоно: түүний шийдвэрүүд аль табан дээр ч байрандаа байна.
          Харилцагчийн дэвтэр нь мөнгөнийх тул үйлдвэрийн даргад унших нь
          нээлттэй, бичих нь хаалттай (сервер ч тэгнэ). */}
      <div className="mt-4">
        <NotesStrip entityType="client" entityId={d.id} canWrite={seesMoney} />
      </div>

      {/* САНХҮҮ — зөвхөн даргад, түүхийнх нь ХОЙНО. Хураангуй нь §3-ын бүтэн
          нэрээрээ «Авлагын үлдэгдэл»: харилцагчийн тухай «мөнгө нь юу болов»
          гэсэн асуултын ГАНЦ хариу (H9 — нэг тоо, хаа сайгүй ижил). */}
      {!seesMoney && <ClientFinance d={d} />}

      {pay && <PayModal client_id={d.id} d={null} invoices={d.invoices} onClose={() => setPay(false)} onDone={() => { setPay(false); load(); }} />}
      {voidPay && <VoidPaymentModal payment={voidPay} onClose={() => setVoidPay(null)}
                                    onDone={() => { setVoidPay(null); load(); }} />}
      {entryNew && <EntryModal d={d} onClose={() => setEntryNew(false)}
                               onDone={() => { setEntryNew(false); load(); }} />}
      {voidEntry && <VoidEntryModal d={d} e={voidEntry} onClose={() => setVoidEntry(null)}
                                    onDone={() => { setVoidEntry(null); load(); }} />}
    </div>
  );
}

/* ---------- ТҮРЭЭС БИШ БИЧИЛТ (H11 / P1-16) ----------
 *
 * Отгоо эгч ХАСАХ ТЭМДЭГ БИЧДЭГГҮЙ: түүний хуудсан дээр «өгсөн» ба «авсан»
 * нь хоёр багана. Тиймээс цонх нь «Дебит / Кредит» гэсэн сонголт өгч,
 * тэмдгийг ӨӨРӨӨ зөөнө (`lib/entry.ts`). Мөнгө хөдөлдөг тул баталгаажуулах
 * цонх нь авлагын БАЙХ ба БОЛОХ тоог navy Receipt дээр харуулна.
 */
function EntryModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const uid = useId();
  const f0 = { date: todayIso(), mode: "debit" as EntryMode, kind: "advance" as EntryKind,
               amount: "", label: "", ref: "", note: "" };
  const [f, setF] = useState(f0);
  const [ask, setAsk] = useState(false);
  const amount = Number(String(f.amount).replace(/[^\d.-]/g, "")) || 0;
  const signed = signedAmount(f.mode, amount);
  const err = f.amount.trim() || f.label.trim() ? entryError(f.label, Math.abs(amount)) : "";
  const after = receivableAfter(d.receivable, signed);

  const rows = [
    { label: "Одоогийн авлага", value: money(d.receivable) },
    { label: `${entryKindLabel(f.kind)} · ${f.label.trim() || "…"}`,
      value: entryAmountText(signed, money),
      accent: (signed < 0 ? "money" : "danger") as "money" | "danger" },
  ];

  const save = async () => {
    await api(`/api/clients/${d.id}/entries`, { method: "POST", body: JSON.stringify({
      date: f.date, amount: signed, kind: f.kind, label: f.label.trim(),
      ref: f.ref.trim(), note: f.note.trim() }) });
    toast("Бичилт хийгдлээ");
    onDone();
  };

  if (ask) {
    return (
      <ConfirmModal title="Бичилт хийх"
        intro={<><b className="text-ink">{d.name}</b> · {f.date} · {entryModeLabel(f.mode)}.
                 Бичилт нь харилцагчийн дансанд{" "}
                 {signed > 0 ? "нэхэмжлэл" : "кредит төлбөр"} болж бууна.</>}
        rows={rows} total={{ label: "Авлага болно", value: money(after) }}
        confirmLabel="Бичих" onClose={() => setAsk(false)}
        onConfirm={async () => {
          try { await save(); } catch (e: any) { toast(e.message, "err"); setAsk(false); }
        }} />
    );
  }

  return (
    <FormModal title="Бусад бичилт" onClose={onClose} dirty={JSON.stringify(f) !== JSON.stringify(f0)}>
      <p className="text-[13.5px] text-t2 mb-4">
        <b className="text-ink">{d.name}</b> · одоогийн авлага{" "}
        <b className="text-ink tabular-nums">{money(d.receivable)}</b>
      </p>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-kind`}>Төрөл</label>
          <select id={`${uid}-kind`} className="inp" value={f.kind}
                  onChange={(e) => setF({ ...f, kind: e.target.value as EntryKind })}>
            {ENTRY_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date}
                 onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
      </div>
      {/* ХАСАХ ТЭМДГИЙГ ТЭР БИЧИХГҮЙ — сонголт нь чиглэлээ ӨГҮҮЛБЭРЭЭР хэлнэ. */}
      <fieldset className="mt-3.5">
        <legend className="lbl">Чиглэл</legend>
        <div className="flex gap-2 flex-wrap">
          {(["debit", "credit"] as EntryMode[]).map((m) => (
            <button key={m} type="button" onClick={() => setF({ ...f, mode: m })}
                    aria-pressed={f.mode === m}
                    className={`btn-secondary !min-h-10 text-[13px] ${
                      f.mode === m ? "!bg-brand-50 !text-brand-ink !border-brand" : ""}`}>
              {entryModeLabel(m)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        <div><label className="lbl" htmlFor={`${uid}-amt`}>Дүн ₮</label>
          <input id={`${uid}-amt`} className="inp" inputMode="numeric" autoFocus
                 value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-ref`}>Эх сурвалж</label>
          <input id={`${uid}-ref`} className="inp" value={f.ref} placeholder="ж: акт №7"
                 onChange={(e) => setF({ ...f, ref: e.target.value })} /></div>
      </div>
      <div className="mt-3.5">
        <label className="lbl" htmlFor={`${uid}-label`}>
          Юуны төлөө <span className="text-danger">*</span>
        </label>
        <input id={`${uid}-label`} className="inp" value={f.label}
               placeholder="ж: 2025 онд бэлэн мөнгө зээлсэн"
               onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note}
               onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      {err && <p className="text-[12.5px] text-danger mt-2.5">⚠ {err}</p>}
      <Receipt className="mt-4" rows={rows} total={{ label: "Авлага болно", value: money(after) }} />
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!!err || !(Math.abs(amount) > 0) || !f.label.trim()}
                      onSubmit={() => setAsk(true)}>Үргэлжлүүлэх</SubmitButton>
      </div>
    </FormModal>
  );
}

function VoidEntryModal({ d, e, onClose, onDone }: {
  d: any; e: ClientEntry; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const rid = useId();
  const after = receivableAfter(d.receivable, -e.amount);
  return (
    <ConfirmModal title="Бичилт хүчингүй болгох"
      intro={<>
        {e.kind_mn || entryKindLabel(e.kind)} · <b className="text-ink">{e.label}</b>{" "}
        {entryAmountText(e.amount, money)} — энэ мөр УСТАХГҮЙ: жагсаалтад «ХҮЧИНГҮЙ»
        тэмдэгтэй, шалтгаантайгаа хамт үлдэнэ. Түүний{" "}
        {e.amount > 0 ? "нэхэмжлэл" : "төлбөр"} нь хамт хүчингүй болж, авлага буцаж
        засагдана. Энэ үйлдлийг буцаах боломжгүй.
      </>}
      rows={[{ label: "Одоогийн авлага", value: money(d.receivable) },
             { label: "Бичилт хүчингүй", value: entryAmountText(-e.amount, money),
               accent: "danger" }]}
      total={{ label: "Авлага болно", value: money(after) }}
      confirmLabel="Хүчингүй болгох" confirmDisabled={!reason.trim()} danger
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api(`/api/client-entries/${e.id}/void`, {
            method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
          toast("Бичилт хүчингүй болов");
          onDone();
        } catch (er: any) { toast(er.message, "err"); }
      }}>
      <label className="block text-[12.5px] font-semibold text-t2 mb-1.5" htmlFor={rid}>
        Цуцлах шалтгаан <span className="text-danger">*</span>
      </label>
      <input id={rid} className="inp w-full" value={reason} autoFocus
             placeholder="ж: хоёр удаа бичсэн"
             onChange={(er) => setReason(er.target.value)} />
    </ConfirmModal>
  );
}

/* ---------- САНХҮҮ — харилцагчийн мөнгө, даргын дэлгэц дээр ----------
 *
 * Толгойн үзүүлэлт, тойм баганын нэхэмжлэл, гурван таб (Нэхэмжлэл, Төлбөр,
 * Бартер) нь ЭНД цугларна: даргын хуудсан дээр мөнгө НЭГ газарт, ХУМИГДСАН
 * байна. Тэр асуулт ирэхэд нээж уншина, бусад үедээ ажлаа хийнэ.
 */
function ClientFinance({ d }: { d: any }) {
  const pen = penaltySplit(d.penalty, d.penalty_booked);
  const barter = d.barter || [];
  return (
    <FinanceDisclosure name={`client-${d.id}`}
      summary={money(d.receivable)} summaryLabel="Авлагын үлдэгдэл"
      hint="Авлага, алданги, барьцаа, нэхэмжлэл, төлбөр — дарж дэлгэнэ.">
      <FinanceBlock title="Хураангуй">
        <FinanceRow label="Авлагын үлдэгдэл" value={money(d.receivable)}
                    sub={uninvoicedLine(d.receivable_uninvoiced) || undefined}
                    tone={d.overdue ? "danger" : undefined} />
        {pen.booked > 0 && (
          <FinanceRow label="Нэхэгдсэн алданги" value={money(pen.booked)} tone="danger" />
        )}
        {pen.showUnbooked && (
          <FinanceRow label="Алдангийн тооцоолол" value={"≈" + money(pen.unbooked)}
                      sub={UNCHARGED} tone="dim" />
        )}
        <FinanceRow label="Барьцаа" value={d.deposit > 0 ? money(d.deposit) : "—"} />
      </FinanceBlock>

      <FinanceBlock title="Нэхэмжлэл">
        {d.invoices.length === 0 ? (
          <p className="text-t3 text-[13px]">Нэхэмжлэл алга.</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className="th">Нэхэмжлэл</th><th className="th text-right">Дүн</th>
              <th className="th text-right">Төлсөн</th><th className="th text-right">Үлдэгдэл</th>
              <th className="th">Төлөв</th>
            </tr></thead>
            <tbody>
              {d.invoices.map((inv: any) => (
                <tr key={inv.id}>
                  <td className="td"><b className="text-ink">{invoiceLabel(inv).title}</b>
                    <span className="block text-xs text-t3">Гэрээ №{inv.contract_no}</span></td>
                  <td className="td text-right tabular-nums">{money(inv.total)}</td>
                  <td className="td text-right tabular-nums">{money(inv.paid)}</td>
                  <td className={`td text-right tabular-nums font-bold ${
                        inv.outstanding > 0 && inv.status === "overdue" ? "text-danger"
                        : inv.outstanding > 0 ? "text-ink" : "text-t3"}`}>
                    {inv.outstanding > 0 ? money(inv.outstanding) : "—"}</td>
                  <td className="td"><StatePill state={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </FinanceBlock>

      <FinanceBlock title="Төлбөр">
        {d.payments.length === 0 ? (
          <p className="text-t3 text-[13px]">Төлбөр алга.</p>
        ) : d.payments.map((p: any) => (
          <FinanceRow key={p.id} label={`${p.date} · ${
            p.method === "BARTER" ? `Бартер · ${p.barter_desc}`
            : p.method === "CASH" ? "Бэлэн"
            : p.method === "CREDIT" ? "Бичилтийн кредит" : "Данс"}`}
            sub={isVoided(p) ? "ХҮЧИНГҮЙ" : p.contract_no ? `Гэрээ №${p.contract_no}` : undefined}
            value={money(p.amount)} tone={isVoided(p) ? "dim" : undefined} />
        ))}
      </FinanceBlock>

      {barter.length > 0 && (
        <FinanceBlock title="Бартер">
          {barter.map((a: any) => (
            <FinanceRow key={a.id} label={a.name} sub={`${a.type} · ${a.date_in}`}
                        value={money(a.value_in)} />
          ))}
        </FinanceBlock>
      )}
    </FinanceDisclosure>
  );
}

/** `exact` — бүтэн төгрөгийн дүн. Дугуйлсан тоо нь ХАРАХАД, бүтэн тоо нь
 *  АЖИЛЛАХАД хэрэгтэй (нэхэх, тулгах, шилжүүлэг бичих). Хоёуланг нь нэг
 *  багана дээр шатлан харуулна. */
/** `note` — тооны доорх нэг үгийн тайлбар («нэхэгдээгүй»): тоо нь ЮУ болохыг
 *  хэлнэ, бүтэн дүнгээ орлохгүй. */
function Stat({ label, val, exact, danger, note }: any) {
  return (
    <div>
      <div className="text-[12px] text-t3 font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${danger ? "text-danger" : "text-ink"}`}
           title={exact}>{val}</div>
      {exact && <div className="text-[12px] text-t2 tabular-nums mt-0.5">{exact}</div>}
      {note && <div className="text-[12px] text-t3 tabular-nums">{note}</div>}
    </div>
  );
}

/* ---------- Тойм: сарын хуанли (босоо timeline-ийн оронд) ---------- */
// Төрөл бүрийн өнгө: төлбөр→ногоон, буцаалт→улбар, акт→улаан, ачилт/гэрээ→brand
const KIND_DOT: Record<string, string> = {
  // «Гэрээ» нь өмнө нь «Ачилт»-тай ЯГ ижил улбар цэгтэй байсан — тайлбар
  // гаргамагц хоёр ижил цэг хоёр өөр нэртэй зогсох тул ялгав.
  payment: "bg-money", return: "bg-warn", writeoff: "bg-danger", issue: "bg-brand",
  // Худалдаа болгосон (H7) ба гэрээ хоёулаа violet — нэг нь үйл явдал,
  // нөгөө нь эхлэл; тайлбар нь доор нэрээрээ ялгарна.
  sale: "bg-violet", contract: "bg-violet",
};
/* Цэг бүр ЮУ гэсэн үг болохыг хаана ч бичээгүй байсан — өнгө нь дангаараа
   утга зөөж чадахгүй. Тайлбарыг торны доор ил гаргаж, нүд бүрийн дуудагдах
   нэрэнд ч мөн энэ нэрсийг ашиглана (нэг эх сурвалж). */
const KIND_LABEL: Record<string, string> = {
  payment: "Төлбөр", issue: "Ачилт", return: "Буцаалт", writeoff: "Акт",
  sale: "Худалдаа болгов", contract: "Гэрээ",
};
const KIND_ORDER = ["contract", "issue", "return", "writeoff", "sale", "payment"];
const LEGEND = ["payment", "issue", "return", "writeoff", "contract"];
const dotCls = (k: string) => KIND_DOT[k] || "bg-brand";

/** `money=false` (үйлдвэрийн дарга): хэлхээ нь ЯВДЛЫГ хэлнэ, ДҮНГ нь биш —
 *  дүн нь хуудасны доод талын «Санхүү» задаргаанд бүтнээрээ зогсоно
 *  (`lib/timeline.ts` — эзний шийдвэр 2026-09: хана биш, ЭМХ ЦЭГЦ). */
function TimelineCalendar({ events, money = true }: { events: TLEvent[]; money?: boolean }) {
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
                  <b className="block text-[13.5px] text-ink font-semibold">
                    {money ? e.title : withoutMoney(e.title)}</b>
                  <span className="text-[12.5px] text-t2">
                    {money ? e.sub : withoutMoney(e.sub)}</span>
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

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmt, money, sayaFmt, sayaFmtLike, user } from "../api";
import { Spinner, StatePill, TypePill, Empty, useToast, Prog, InlineEdit,
         FormModal, ConfirmModal, Receipt, SubmitButton,
         FinanceDisclosure, FinanceBlock, FinanceRow } from "../ui";
import { PayModal, PdfButton } from "./ContractDetail";
import { VoidButton, VoidPaymentModal } from "../components/VoidPayment";
import { NotesStrip } from "../components/Notes";
import { ContactsCard } from "../components/Contacts";
import { PromiseNoteModal, PromisePanel } from "../components/PromiseNote";
import { isVoided, voidRowClass, voidTitle } from "../lib/void";
import { ClientEntry, ENTRY_KINDS, EntryKind, EntryMode, entryAmountText,
         entryError, entryKindLabel, entryKindPill, entryModeLabel,
         entrySubText, receivableAfter, signedAmount } from "../lib/entry";
import { clientInvoiceLabel } from "../lib/invoice";
import { useDownload, usePdf } from "../lib/docs";
import { dialogOpen, useLive } from "../lib/live";
import { Outcome, contactOutcome, entryOutcome, fieldOutcome, fileOutcome,
         voidEntryOutcome, voidPayOutcome } from "../lib/outcome";
import { clientState, creditLine, exactBelow, unallocatedCredit } from "../lib/credit";
import { canDeleteClient } from "../lib/clientAdmin";
import { STATEMENT_CHOICES, StatementChoice, statementError, statementRange,
         statementRangeText, statementUrl } from "../lib/statement";
import { rowClickProps } from "../lib/rowClick";
import { contractHref } from "../lib/links";
import { contractCount, contractNoLabel, contractTitle, isOpeningRow, openingUntil,
         partnerSince } from "../lib/opening";
import { dueLabel, todayIso } from "../lib/schedule";
import { penaltySplit, UNCHARGED } from "../lib/penalty";
import { uninvoicedLine } from "../lib/receivable";
import { withoutMoney } from "../lib/timeline";
import {
  buildMonthGrid, eventsKey, latestDayInMonth, eventsOn, addMonth, dayCellLabel,
  parseIso, isoOf, seedMonth, WEEKDAYS_MN, monthLabelMN, type TLEvent, type YearMonth,
} from "../lib/calendar";

/* Шинээр төрсөн мөр ХЭД ХУГАЦААНД тодрох вэ — гэрээний хуудастай ИЖИЛ.
   Отгоо цонх хаагаад нүдээрээ мөрөө хайдаг; 1.5 секундын анивчаа нь түүний
   хувьд огт болоогүйтэй адил. */
const FRESH_MS = 10_000;

export default function ClientProfile() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [pay, setPay] = useState(false);
  const [voidPay, setVoidPay] = useState<any>(null);
  /* ТҮРЭЭС БИШ бичилт (H11): шинэ бичилтийн цонх ба цуцлах гэж буй мөр. */
  const [entryNew, setEntryNew] = useState(false);
  const [voidEntry, setVoidEntry] = useState<ClientEntry | null>(null);
  /* Амлалт бичих цонх (Авлага цуглуулахтай ИЖИЛ), хуулгын хугацаа, устгал. */
  const [promise, setPromise] = useState(false);
  const [stmt, setStmt] = useState(false);
  const [del, setDel] = useState(false);
  /* ҮР ДҮНГИЙН ЗУРВАС (`lib/outcome.ts`) — мутаци бүрийн дараа ЮУ БОЛСНЫГ
     тоонуудтай нь хуудсан дээр үлдээнэ. Гэрээний хуудсан дээр энэ БАЙСАН,
     энд БАЙГААГҮЙ: `PayModal` нь `payOutcome(...)`-оо дамжуулдаг байсныг
     хуудас нь чимээгүй хаядаг байв. Зурвас нь «Хаах» дартал зогсоно. */
  const [outcome, setOutcome] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const freshTimer = useRef<number | null>(null);
  useEffect(() => () => { if (freshTimer.current) window.clearTimeout(freshTimer.current); }, []);
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dl = useDownload();
  const pdf = usePdf();
  const u = user();

  const load = (background = false) => api(`/api/clients/${id}`).then(setD)
    .catch((e) => { if (!background) toast(e.message, "err"); });

  /* ХУУДАС АМЬД (X3) — гэрээний хуудастай ижил журам. Ачилтыг ДАРГА өөр
     компьютер дээр баталгаажуулдаг, төлбөрийг санхүүч бичдэг: Отгоо энэ
     хуудсыг нээгээд суувал хуучин тоо ширтэнэ.
     ⚠ ЦОНХ НЭЭЛТТЭЙ бол чимээгүй шинэчлэлт ХИЙХГҮЙ — бөглөж байгаа зүйлийнх
     нь доогуур дата солигдвол бичсэн юм нь эргэлзээ болно. */
  const busyForm = pay || entryNew || !!voidPay || !!voidEntry || promise || stmt || del;
  useLive((bg) => { if (bg && (busyForm || dialogOpen())) return; load(bg); }, [id]);

  /* ---------- ЗУРВАС ба ТОДРОЛ ----------
     Мутаци бүр НЭГ замаар зарлагдана: юу болсныг тоонуудтай нь бичээд,
     шинэ мөрөө нэрлэнэ. «Дараад юу ч болсонгүй» гэсэн мэдрэмж үлдэхгүй. */
  function announce(o?: Outcome | null) {
    if (!o) return;
    setOutcome(o.text);
    setFresh(o.mark ?? null);
    if (freshTimer.current) window.clearTimeout(freshTimer.current);
    if (o.mark) freshTimer.current = window.setTimeout(() => setFresh(null), FRESH_MS);
  }
  /** Цонх хаагдана → зурвас үлдэнэ → хуудас дахин уншина. */
  const finish = (close: () => void, fallback?: string) => (o?: Outcome) => {
    close();
    announce(o ?? (fallback ? { text: fallback } : null));
    load();
  };

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
  async function saveClient(label: string, patch: Record<string, string>) {
    try {
      await api(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify({
        name: d.name, reg: d.reg || "", person: d.person || "", phone: d.phone || "",
        note: d.note || "", ...patch }) });
      toast("Хадгалагдлаа");
      // Зурвас нь ЮУГ ЮУ болгосныг хэлнэ: Отгоо гурван талбар дараалж
      // засаад аль нь суусныг toast-аас мэдэхгүй (сүүлийнх нь өмнөхийг дарна).
      announce(fieldOutcome(label, Object.values(patch)[0] ?? ""));
      load();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  }

  /* Даргад мөнгөний ГУРВАН таб байхгүй — тэдгээрийн хүснэгт нь «Санхүү»
     задаргаа дотор, доор нэг дор зогсоно. Табын мөр нь түүний АЖЛЫН зам:
     тойм, гэрээ, хавсралт. */
  const TABS = ([
    ["overview", "Тойм"],
    /* Хуучин үлдэгдлийн зохиомол гэрээ ТООНД ОРОХГҮЙ: нэг гэрээтэй
       харилцагч «2» гэж харагдвал Отгоо байхгүй гэрээ хайж эхэлнэ. */
    ["contracts", `Гэрээ`, contractCount(d.contracts)],
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
      announce(fileOutcome(f.name));
      load();
    } catch (er: any) { toast(er.message, "err"); }
  }

  /* ИЛҮҮ ТӨЛӨЛТ (`lib/credit.ts`) — хуваарилагдаагүй төлбөрийн нийлбэр.
     Хурд групп 78,165,000₮ илүү төлсөн атал толгой нь «Авлага 0₮ · Хэвийн»
     гэж зогсдог байв: тэр мөнгө зөвхөн «Төлбөр» табын нэг мөрөнд амьдарна. */
  const credit = unallocatedCredit(d.payments);
  const state = clientState(d.receivable, d.overdue, credit);
  /* УСТГАЛ нь ЗӨВХӨН хоосон харилцагч дээр (сервер ч тэгнэ). Товч нь
     наалдсан зүйлтэй харилцагч дээр ОГТ гарахгүй — дарж болдоггүй товч бол
     хамгийн муу төрлийн эвдрэл. */
  const canDelete = u?.role === "manager" && canDeleteClient(d);

  return (
    <div>
      <Link to="/clients" className="btn-ghost mb-3 inline-flex">← Харилцагчид руу буцах</Link>
      <div className="card p-6">
        <div className="flex gap-4 items-start flex-wrap">
          <div className="w-14 h-14 rounded-[18px] bg-brand-50 text-brand-ink grid place-items-center font-extrabold text-lg shrink-0">
            {d.name.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-[230px]">
            {/* КОМПАНИЙН НЭР нь ХААНА Ч засагддаггүй байв — «Бутангуд» гэж
                бичсэн үсгийн алдаа мөнхөд үлдэж, Отгоо хайхдаа олдоггүй.
                Сервер (`PUT /api/clients/{id}`) нэрийг хүлээж авдаг байсан;
                зөвхөн хаалга нь байхгүй байв. Хоёр алхамт (`InlineEdit`) —
                нэр солих нь бүх дэлгэц, бүх баримт дээр гарна. */}
            <h1 className="text-[22px] font-extrabold text-ink tracking-tight flex items-center gap-2.5 flex-wrap">
              {u?.role === "manager"
                ? <InlineEdit label="Компанийн нэр" value={d.name} width="w-72"
                              confirmText="Нэрийг солих уу?"
                              onSave={(v) => saveClient("Компанийн нэр", { name: v })} />
                : d.name}
              <span className={state.cls}>{state.label}</span>
            </h1>
            <div className="text-[13px] text-t2 mt-1.5 flex gap-x-4 gap-y-1.5 flex-wrap items-center">
              <span className="inline-flex items-center gap-1.5">Регистр:
                <InlineEdit label="Регистр" value={d.reg} width="w-28" confirmText="Хадгалах уу?"
                  onSave={(v) => saveClient("Регистр", { reg: v })} /></span>
              <span className="inline-flex items-center gap-1.5">Хариуцагч:
                <InlineEdit label="Хариуцагч" value={d.person} width="w-36" confirmText="Хадгалах уу?"
                  onSave={(v) => saveClient("Хариуцагч", { person: v })} /></span>
              <span className="inline-flex items-center gap-1.5">Утас:
                <InlineEdit label="Утас" value={d.phone} width="w-32" confirmText="Хадгалах уу?"
                  onSave={(v) => saveClient("Утас", { phone: v })} /></span>
              {/* «Хамтран ажилласан» нь ХАРИЛЦААНЫ нас — системд бүртгүүлсэн
                  өдөр биш. Шилжүүлсэн харилцагч бүрд бүртгэлийн огноо нь
                  ачаалсан өдөр (2026-09-04) тул хоёр жилийн түнш «өнөөдөр
                  эхэлсэн» гэж харагддаг байв. Үнэн нь хамгийн хуучин
                  гэрээний эхлэл; ГЭРЭЭГҮЙ бол мөр нь ОГТ гарахгүй
                  (`lib/opening.partnerSince`). */}
              {partnerSince(d.contracts) && (
                <span>Хамтран ажилласан:{" "}
                  <b className="text-t1">{partnerSince(d.contracts)}-с</b></span>
              )}
            </div>
            <div className="mt-2.5 text-[12.5px] text-t2 inline-flex items-center gap-2">💬
              <InlineEdit label="Тэмдэглэл" value={d.note} display={d.note || "тэмдэглэл нэмэх…"} width="w-80"
                confirmText="Хадгалах уу?"
                onSave={(v) => saveClient("Тэмдэглэл", { note: v })} />
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
            {/* ИЛҮҮ ТӨЛӨЛТ нь тоон нүдэндээ, БҮТЭН төгрөгөөрөө зогсоно:
                «Авлага 0₮» гэсэн толгойн доор «Илүү төлөлт (кредит):
                78,165,000₮ — дараагийн нэхэмжлэлээс хасагдана». Тэр мөнгө
                байгаа эсэхийг мэдэхийн тулд таб нээх шаардлагагүй боллоо. */}
            <Stat label="Авлага" val={sayaFmt(d.receivable) + "₮"} exact={money(d.receivable)}
                  danger={d.overdue}
                  note={uninvoicedLine(d.receivable_uninvoiced, d.receivable) || undefined}
                  extra={creditLine(credit, money) || undefined} />
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
            <Stat label="Гэрээ" val={String(contractCount(d.contracts))} />
          </div>
        </div>
        {u?.role !== "factory" && (
          <div className="mt-4 flex gap-2.5 flex-wrap items-center">
            <button className="btn-secondary !min-h-10" onClick={() => setPay(true)}>Төлбөр бүртгэх</button>
            {/* ТООЦООНЫ ХУУЛГА — тэр тооцоо нийлэхээр очихдоо ЦААС барьж
                явдаг. Систем дотор тэр хуудас байсан ч гаргах товч байгаагүй
                тул Excel рүүгээ буцдаг байв. */}
            <button className="btn-secondary !min-h-10" onClick={() => setStmt(true)}>
              Хуулга хэвлэх
            </button>
            {/* Наалдсан зүйлгүй бол л онгойно (сервер ч тэгнэ) — андуурч
                бичсэн нэр жагсаалтыг мөнхөд бохирдуулах ёсгүй. */}
            {canDelete && (
              <button className="btn-ghost !min-h-10 !text-danger ml-auto"
                      onClick={() => setDel(true)}>Харилцагч устгах</button>
            )}
          </div>
        )}

        {/* ═══ ҮР ДҮНГИЙН ЗУРВАС — ХИЙГДСЭН ЗҮЙЛ ДЭЛГЭЦЭН ДЭЭР ҮЛДЭНЭ ═══
            Амжилтын мэдэгдэл 3.2 секундын дараа өөрөө арилдаг (`ui.tsx`) —
            Отгоо тэр агшинд цаас руугаа харж, утсаа авч байна. Гэрээний
            хуудсан дээрхтэй ЯГ ижил биет, ижил өгүүлбэрийн хэв. */}
        {outcome && (
          <div role="status"
               className="mt-4 rounded-2xl border border-money bg-money-50 px-4 py-3
                          flex items-start gap-3 flex-wrap">
            <span aria-hidden="true" className="text-money font-bold leading-6">✓</span>
            <span className="flex-1 min-w-[200px] text-[13.5px] font-semibold text-ink
                             leading-6 tabular-nums break-words">{outcome}</span>
            <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]"
                    onClick={() => { setOutcome(null); setFresh(null); }}>Хаах</button>
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
                           `${contractTitle(s.contract_no)} — ${s.expected_date}-нд ойролцоогоор ${money(s.projected_amount)}, нээх`,
                           "link")}>
                      <div className="min-w-0">
                        <b className="text-[13px] text-ink tabular-nums">{s.expected_date}</b>
                        <span className="block text-xs text-t3">
                          {contractNoLabel(s.contract_no)} · {dueLabel(s.expected_date, today)}
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
              {/* НЭР НЬ НЭХЭМЖЛЭЛИЙНХ, ГЭРЭЭНИЙХ БИШ (`lib/invoice`).
                  Урьд нь мөр нь гэрээний дугаараар шийдэгддэг байсан тул
                  ХУУЧИН ҮЛДЭГДЛИЙН зохиомол гэрээн дээр суусан гараар
                  бичсэн бичилт бүр «Хуучин үлдэгдэл · 2026-09-01 хүртэл»
                  гэж нэрлэгддэг байв: Бутангуудын «Өнө Ордтой тооцоо»
                  139,648,000₮ ч мөн адил. */}
              {d.invoices.slice(0, 6).map((inv: any) => {
                const lb = clientInvoiceLabel(inv);
                return (
                <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-sunken last:border-0">
                  <div className="min-w-0">
                    <b className="text-[13px] text-ink">{lb.title}</b>
                    {lb.sub && <span className="text-[13px] text-t2">{" · "}{lb.sub}</span>}
                    {/* ЗОХИОМОЛ гэрээ мөр дээр ГАРАХГҮЙ. Хуучин үлдэгдэл ба
                        гараар бичсэн бичилтүүд `OB-{id}` гэсэн ДАНСНЫ гэрээн
                        дээр суудаг — Отгоо тийм гэрээнд гарын үсэг зурч
                        байгаагүй. Түүнийг холбоос болгож зурвал «Хуучин
                        үлдэгдэл» гэсэн үг нэг мөрөнд ХОЁР удаа зогсоно. */}
                    {!isOpeningRow({ no: inv.contract_no }) && (
                      <span className="block text-xs text-t3">
                        {/* Гэрээ рүү очих холбоос — 36px хүрэх талбайтай */}
                        <Link to={contractHref(inv.contract_id)}
                              className="tap-link text-t2 hover:text-ink hover:underline">
                          {contractTitle(inv.contract_no)}
                        </Link>
                      </span>
                    )}
                    <span className="block text-xs text-t3 tabular-nums">{money(inv.total)}
                      {inv.penalty_due > 0 && <span className="text-danger"> + алданги {money(inv.penalty_due)}</span>}
                      {inv.penalty_unbooked > 0 && <span className="text-t3"> · ≈{money(inv.penalty_unbooked)} {UNCHARGED}</span>}</span>
                  </div>
                  <StatePill state={inv.status} />
                </div>
                );
              })}
              {d.invoices.length === 0 && <Empty title="Нэхэмжлэл алга" />}

              {/* АМЛАЛТ · ХОЛБОО БАРЬСАН ТҮҮХ — сервер илгээж байсныг хуудас
                  ЗУРДАГГҮЙ байв. Тэр харилцагч руу залгахаасаа өмнө «энэ хүн
                  юу гэж байсан билээ» гэдгээ энэ хуудсан дээрээс уншина. */}
              <PromisePanel notes={d.notes} today={today} canWrite={seesMoney}
                            freshMark={fresh} onAdd={() => setPromise(true)} />
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
                                        `${contractTitle(c.no)} нээх`, "row")}>
                    <td className="td"><b className="text-ink">{contractNoLabel(c.no)}</b>
                      {/* Хуучин үлдэгдэл нь тэр өдрөөс ЭХЭЛСЭН биш, тэр
                          өдрөөр ТООЛОГДСОН. Түрээс/худалдаа гэсэн төрөл ч
                          түүнд байхгүй. */}
                      <span className="block text-xs text-t3">
                        {isOpeningRow(c) ? openingUntil(c.start_date) : `${c.start_date}-с`}
                      </span></td>
                    <td className="td">
                      {isOpeningRow(c) ? <span className="text-xs text-t3">—</span>
                                       : <TypePill type={c.type} />}</td>
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
            <table className="w-full min-w-[860px]">
              <thead><tr><th className="th">Нэхэмжлэл</th><th className="th text-right">Дүн</th>
                <th className="th text-right">Төлсөн</th><th className="th text-right">Үлдэгдэл</th>
                <th className="th text-right">Нэхэгдсэн алданги</th><th className="th">Төлөв</th>
                <th className="th">Хэвлэх</th></tr></thead>
              <tbody>
                {d.invoices.map((inv: any) => {
                  const lb = clientInvoiceLabel(inv);
                  /* Хавсралт нь ЗӨВХӨН түрээст: худалдаа, хуучин үлдэгдэл,
                     гараар бичсэн бичилтэд хоногийн цонх, материалын мөр
                     байхгүй тул сервер 400 буцаана (дарахад юу ч болохгүй
                     товч бол хамгийн муу төрлийн эвдрэл). */
                  const rent = !!inv.cycle_start && !!inv.cycle_end
                            && inv.cycle_start !== inv.cycle_end;
                  return (
                  <tr key={inv.id}>
                    <td className="td"><b className="text-ink">{lb.title}</b>
                      <span className="block text-xs text-t3">
                        {lb.sub}
                        {/* Дансны ЗОХИОМОЛ гэрээ мөр дээр гарахгүй (дээрх
                            «Нэхэмжлэлийн байдал»-тай ижил дүрэм). */}
                        {!isOpeningRow({ no: inv.contract_no }) && (
                          <>{lb.sub && " · "}
                            <Link to={contractHref(inv.contract_id)}
                                  className="tap-link text-t2 hover:underline">
                              {contractTitle(inv.contract_no)}
                            </Link></>
                        )}
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
                    {/* ХЭВЛЭХ нь гэрээний хуудсан дээр байсан, ЭНД БАЙГААГҮЙ:
                        Отгоо нэхэмжлэл хэвлэхийн тулд гэрээ рүү орох ёстой
                        байв (аль гэрээ болохыг нь эхлээд олж). Ижил товч,
                        ижил зам (`lib/docs.usePdf`). */}
                    <td className="td">
                      <div className="flex gap-1.5 flex-wrap">
                        <PdfButton pdf={pdf} className="btn-ghost btn-row"
                                   path={`/api/invoices/${inv.id}/pdf`}>Хэвлэх</PdfButton>
                        {rent && (
                          <PdfButton pdf={pdf} className="btn-ghost btn-row"
                                     path={`/api/invoices/${inv.id}/appendix-pdf`}>Хавсралт</PdfButton>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
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
                  /* Дөнгөж бүртгэсэн төлбөр цөөн хормын турш тодорч, нүдэнд
                     өөрөө оочихно (`row-fresh`, 10 секунд). */
                  <tr key={p.id} title={voidTitle(p)}
                      className={fresh === `pay-${p.id}` ? "row-fresh" : undefined}>
                    <td className={`td ${voidRowClass(p)}`}>{p.date}</td>
                    <td className={`td text-right tabular-nums font-bold text-ink ${voidRowClass(p)}`}>
                      {money(p.amount)}
                    </td>
                    <td className="td">
                      <span className={`${voidRowClass(p)} ${p.method === "BARTER" ? "pill-violet" : p.method === "CASH" ? "pill-green"
                        : p.method === "CREDIT" ? "pill-grey" : "pill-blue"}`}>
                        {p.method === "BARTER" ? `Бартер · ${p.barter_desc}` : p.method === "CASH" ? "Бэлэн"
                         : p.method === "CREDIT" ? "Тооцоогоор хаасан" : "Данс"}
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
                            {contractNoLabel(p.contract_no)}
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
                Түрээсийн циклд хамаарахгүй бичилтүүд — олгосон зээл, түүний
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
                    <tr key={e.id} title={voidTitle(e)}
                        className={fresh === `entry-${e.id}` ? "row-fresh" : undefined}>
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
                      freshMark={fresh}
                      onChanged={(o) => { announce(o); load(); }} />
      </div>

      {/* ЗАХЫН ТЭМДЭГЛЭЛ (P1-22) — «модонд», «нөат шивсэн», «хаав». Табны
          ГАДНА зогсоно: түүний шийдвэрүүд аль табан дээр ч байрандаа байна.
          Харилцагчийн дэвтэр нь мөнгөнийх тул үйлдвэрийн даргад унших нь
          нээлттэй, бичих нь хаалттай (сервер ч тэгнэ). */}
      <div className="mt-4">
        <NotesStrip entityType="client" entityId={d.id} canWrite={seesMoney}
                    onOutcome={announce} />
      </div>

      {/* САНХҮҮ — зөвхөн даргад, түүхийнх нь ХОЙНО. Хураангуй нь §3-ын бүтэн
          нэрээрээ «Авлагын үлдэгдэл»: харилцагчийн тухай «мөнгө нь юу болов»
          гэсэн асуултын ГАНЦ хариу (H9 — нэг тоо, хаа сайгүй ижил). */}
      {!seesMoney && <ClientFinance d={d} />}

      {/* Цонх бүр ХИЙГДСЭН ЗҮЙЛЭЭ зурвас болгож буцаана — урьд нь `PayModal`
          нь `payOutcome(...)`-оо дамжуулдаг байсныг энэ хуудас чимээгүй
          хаяж, толгойн доор ЮУ Ч үлддэггүй байв. */}
      {pay && <PayModal client_id={d.id} d={null} invoices={d.invoices}
                        onClose={() => setPay(false)}
                        onDone={finish(() => setPay(false), "Төлбөр бүртгэгдлээ")} />}
      {voidPay && <VoidPaymentModal payment={voidPay} onClose={() => setVoidPay(null)}
                                    onDone={finish(() => setVoidPay(null))} />}
      {entryNew && <EntryModal d={d} onClose={() => setEntryNew(false)}
                               onDone={finish(() => setEntryNew(false))} />}
      {voidEntry && <VoidEntryModal d={d} e={voidEntry} onClose={() => setVoidEntry(null)}
                                    onDone={finish(() => setVoidEntry(null))} />}
      {promise && <PromiseNoteModal
        t={{ clientId: d.id, client: d.name, balance: d.receivable,
             balanceUninvoiced: d.receivable_uninvoiced,
             penaltyBooked: d.penalty_booked,
             penaltyUnbooked: Math.max((d.penalty || 0) - (d.penalty_booked || 0), 0),
             contacts: d.contacts, person: d.person, phone: d.phone }}
        onClose={() => setPromise(false)} onDone={finish(() => setPromise(false))} />}
      {stmt && <StatementModal d={d} pdf={pdf} onClose={() => setStmt(false)} />}
      {del && <DeleteClientModal d={d} onClose={() => setDel(false)}
                                 onDone={() => nav("/clients")} />}
    </div>
  );
}

/* ---------- ТООЦООНЫ ХУУЛГА (PDF) ----------
 *
 * Отгоо эгч тооцоо нийлэхээр очихдоо ЦААС барьж явдаг: харилцагч бүрийн
 * Excel хуудсаа хэвлэдэг. Систем дотор тэр хуудас (нэхэмжлэл, төлбөр,
 * бичилт, үлдэгдэл) БАЙГАА ч гаргах товч байгаагүй тул тэр Excel рүүгээ
 * буцна.
 *
 * Хугацаа нь ГУРВАН бэлэн товч + гараар заах (`lib/statement.ts`): тэр
 * ихэвчлэн «бүгдийг» эсвэл «энэ сар» гэдэг, гэхдээ тооцоо нийлэх үе нь
 * дурын байдаг тул гар оролт үлдэнэ.
 */
function StatementModal({ d, pdf, onClose }: {
  d: any; pdf: ReturnType<typeof usePdf>; onClose: () => void;
}) {
  const uid = useId();
  const today = todayIso();
  const [choice, setChoice] = useState<StatementChoice>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const range = statementRange(choice, today, custom);
  const err = statementError(range);
  const dirty = choice !== "all" || !!custom.from || !!custom.to;
  return (
    <FormModal title="Тооцооны хуулга хэвлэх" onClose={onClose} dirty={dirty}
      footer={
        <div className="flex justify-end gap-2.5">
          <button className="btn-secondary" onClick={onClose}>Болих</button>
          <SubmitButton disabled={!!err} busyLabel="Гаргаж байна…"
                        onSubmit={async () => {
                          await pdf.open(statementUrl(d.id, range));
                          onClose();
                        }}>Хэвлэх</SubmitButton>
        </div>}>
      <p className="text-[13.5px] text-t2 mb-4">
        <b className="text-ink">{d.name}</b> — нэхэмжлэл, төлбөр, бичилт бүхий
        нэг хуудас. Тооцоо нийлэхэд авч явна.
      </p>
      <div className="lbl" id={`${uid}-period`}>Хугацаа</div>
      <div className="flex gap-2 flex-wrap mb-3.5" role="group" aria-labelledby={`${uid}-period`}>
        {STATEMENT_CHOICES.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setChoice(v)} aria-pressed={choice === v}
            className={`rounded-[7px] border px-4 py-2 font-semibold text-[13px] min-h-10 transition ${
              choice === v ? "border-brand bg-brand-50 text-brand-ink"
                           : "border-line-strong text-t2"}`}>{l}</button>
        ))}
      </div>
      {choice === "custom" && (
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="lbl" htmlFor={`${uid}-from`}>Эхлэх огноо</label>
            <input id={`${uid}-from`} type="date" className="inp" value={custom.from}
                   onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
          <div><label className="lbl" htmlFor={`${uid}-to`}>Дуусах огноо</label>
            <input id={`${uid}-to`} type="date" className="inp" value={custom.to}
                   onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
        </div>
      )}
      {/* Сонгосон хугацаа нь ҮГЭЭРЭЭ давтагдана — дарахаасаа өмнө юу гарахыг
          нь мэдэж байх ёстой. */}
      <p className="text-[13px] text-t2 mt-3.5">
        Хамрах хугацаа: <b className="text-ink tabular-nums">{statementRangeText(range)}</b>
      </p>
      {err && <p className="text-[12.5px] text-danger mt-2.5">⚠ {err}</p>}
    </FormModal>
  );
}

/* ---------- ХООСОН ХАРИЛЦАГЧИЙГ УСТГАХ ----------
 *
 * H1 «устгал байхгүй» нь ТҮҮХИЙГ хамгаалдаг дүрэм; ХООСОН харилцагчид түүх
 * байхгүй — андуурч бичсэн нэр, хоёр дахин оруулсан мөр. Хаалга нь сервер
 * дээр нарийн (`_attached`); тэр татгалзвал ӨӨРИЙНХ нь өгүүлбэр цонхон
 * дотор үлдэнэ (toast болж өнгөрөхгүй).
 */
function DeleteClientModal({ d, onClose, onDone }: {
  d: any; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [err, setErr] = useState("");
  return (
    <ConfirmModal
      title="Харилцагч устгах"
      intro={<>
        <b className="text-ink">{d.name}</b> — энэ харилцагчид гэрээ, төлбөр,
        бичилт, тэмдэглэл, файл ЮУ Ч бүртгэгдээгүй байна. Устгавал жагсаалтаас
        бүрмөсөн алга болно: энэ үйлдлийг буцаах боломжгүй.
      </>}
      rows={[{ label: d.name, sub: d.reg ? `ТТД ${d.reg}` : undefined,
               value: `${(d.contacts || []).length} холбоо барих хүн`,
               accent: "dim" as const }]}
      note={err || undefined}
      confirmLabel="Устгах" danger
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api(`/api/clients/${d.id}`, { method: "DELETE" });
          toast(`${d.name} устгагдлаа`);
          onDone();
        } catch (e: any) {
          /* Серверийн өгүүлбэр («Энэ харилцагчид 2 гэрээ … бүртгэлтэй тул
             устгах боломжгүй») цонхон ДОТОР үлдэнэ — 3.2 секундын мэдэгдэл
             болж өнгөрвөл Отгоо яагаад болоогүйг мэдэхгүй. */
          setErr(e.message);
          toast(e.message, "err");
        }
      }} />
  );
}

/* ---------- ТҮРЭЭС БИШ БИЧИЛТ (H11 / P1-16) ----------
 *
 * Отгоо эгч ХАСАХ ТЭМДЭГ БИЧДЭГГҮЙ: түүний хуудсан дээр «өгсөн» ба «авсан»
 * нь хоёр багана. Тиймээс цонх нь «Дебит / Кредит» гэсэн сонголт өгч,
 * тэмдгийг ӨӨРӨӨ зөөнө (`lib/entry.ts`). Мөнгө хөдөлдөг тул баталгаажуулах
 * цонх нь авлагын БАЙХ ба БОЛОХ тоог navy Receipt дээр харуулна.
 */
function EntryModal({ d, onClose, onDone }: {
  d: any; onClose: () => void; onDone: (o?: Outcome) => void;
}) {
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
    const r = await api(`/api/clients/${d.id}/entries`, { method: "POST", body: JSON.stringify({
      date: f.date, amount: signed, kind: f.kind, label: f.label.trim(),
      ref: f.ref.trim(), note: f.note.trim() }) });
    toast("Бичилт хийгдлээ");
    onDone(entryOutcome({ kindLabel: entryKindLabel(f.kind), label: f.label,
                          signed, before: d.receivable, after, entryId: r?.id }));
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
    /* БАРИМТ ба ГОЛ ТОВЧ нь ГҮЙЛТИЙН ГАДНА (`FormModal.footer`).
       Отгоогийн дэлгэц 768px өндөртэй; энэ цонх «Юуны төлөө», «Тэмдэглэл»,
       баримттайгаа 900px давдаг тул «Үргэлжлүүлэх» нүднээс доош унана: тэр
       талбараа бөглөөд «дараа нь юу хийх вэ» гэдгээ олохгүй (цонх ДОТОР
       гүйлгэх гэсэн зүйл түүний толгойд байхгүй — Excel-ийн 20 жилд ийм
       юм байгаагүй). Одоо баримт нь мөнгө хаашаа хөдлөхийг ҮРГЭЛЖ нүдний
       өмнө барина: «Одоогийн авлага X → Авлага болно Y». */
    <FormModal title="Бусад бичилт" onClose={onClose}
               dirty={JSON.stringify(f) !== JSON.stringify(f0)}
               footer={
                 <div className="flex items-end justify-between gap-3 flex-wrap">
                   <Receipt className="flex-1 min-w-[240px] !mt-0" rows={rows}
                            total={{ label: "Авлага болно", value: money(after) }} />
                   <div className="flex gap-2.5">
                     <button className="btn-secondary" onClick={onClose}>Болих</button>
                     <SubmitButton disabled={!!err || !(Math.abs(amount) > 0) || !f.label.trim()}
                                   onSubmit={() => setAsk(true)}>Үргэлжлүүлэх</SubmitButton>
                   </div>
                 </div>}>
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
    </FormModal>
  );
}

function VoidEntryModal({ d, e, onClose, onDone }: {
  d: any; e: ClientEntry; onClose: () => void; onDone: (o?: Outcome) => void;
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
      /* Бичсэн шалтгаан нь ЭРГЭЖ САНАГДАХГҮЙ — Escape түүнийг чимээгүй
         устгах ёсгүй (`ui.tsx` ConfirmModal.dirty). */
      dirty={!!reason.trim()}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api(`/api/client-entries/${e.id}/void`, {
            method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
          toast("Бичилт хүчингүй болов");
          onDone(voidEntryOutcome({ label: e.label, signed: e.amount,
                                    before: d.receivable, after,
                                    reason: reason.trim() }));
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
                  <td className="td"><b className="text-ink">{clientInvoiceLabel(inv).title}</b>
                    <span className="block text-xs text-t3">{contractTitle(inv.contract_no)}</span></td>
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
            : p.method === "CREDIT" ? "Тооцоогоор хаасан" : "Данс"}`}
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
/** `extra` — тоон доорх БҮТЭН өгүүлбэр (илүү төлөлт). `note`-оос ялгаатай нь
 *  тоо биш, ӨГҮҮЛБЭР тул мөрөө эвхэж болно. */
function Stat({ label, val, exact, danger, note, extra }: any) {
  /* ДУГУЙЛСАН ба БҮТЭН тоо ижил байвал хоёр дахь мөр гарахгүй: тэг авлагатай
     харилцагч дээр «0₮» гэсэн мөр хоёр удаа дараалж зогсдог байв
     (`lib/credit.exactBelow`). */
  const below = exactBelow(val, exact);
  return (
    <div>
      <div className="text-[12px] text-t3 font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${danger ? "text-danger" : "text-ink"}`}
           title={exact}>{val}</div>
      {below && <div className="text-[12px] text-t2 tabular-nums mt-0.5">{below}</div>}
      {note && <div className="text-[12px] text-t3 tabular-nums">{note}</div>}
      {extra && <div className="text-[12px] text-money font-semibold tabular-nums mt-0.5">{extra}</div>}
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
  /* ХУАНЛИ ӨНӨӨДРИЙН САР ДЭЭР НЭЭГДЭНЭ.
     Урьд нь `latestMonth(events)` байв — Бутангуудын сүүлчийн бичилт 6-р
     сард тул хуудас 9-р сарын 5-нд ч 6-р сарыг үзүүлж зогсоно. Отгоо тэр
     агшинд төлбөр бүртгэвэл ТЭР ТӨЛБӨР ХАРАГДАХГҮЙ: өнөөдрийн цэг нүднээс
     гурван сарын цаана байна («дараад юу ч болсонгүй»). */
  const [view, setView] = useState<YearMonth>(() => seedMonth(todayIso));
  const [selected, setSelected] = useState<string | null>(
    () => latestDayInMonth(events, view.year, view.month));

  /* ШИНЭ ЯВДАЛ ИРВЭЛ ХУАНЛИ ӨНӨӨДӨР РҮҮГЭЭ ЭРГЭНЭ. Ижил өгөгдөл дахин
     ирэхэд (60 секундын чимээгүй шинэчлэлт) ЮУ Ч болохгүй — эс бөгөөс 6-р
     сарыг уншиж байхад дэлгэц доороос нь татагдана (`lib/calendar.eventsKey`). */
  const key = eventsKey(events);
  const seen = useRef(key);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    const nv = seedMonth(todayIso);
    setView(nv);
    setSelected(latestDayInMonth(events, nv.year, nv.month));
  }, [key, todayIso, events]);

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

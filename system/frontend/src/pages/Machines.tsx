import { useEffect, useId, useState } from "react";
import { api, money, sayaFmt, user } from "../api";
import { Spinner, Spin, FormModal, SubmitButton, useToast, Empty, InlineEdit, ConfirmModal, Receipt,
         FinanceDisclosure, FinanceBlock, FinanceRow } from "../ui";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { usePdf } from "../lib/docs";
import { billableJobs, invoiceTotals, type MachineLogRow } from "../lib/machine";
import { todayIso } from "../lib/schedule";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
const monthStart = () => today().slice(0, 8) + "01";
const JOB_LABELS = ["Бүтэн өдөр", "Хагас өдөр", "Дотоод ажил"];
const EXP_LABELS = ["Түлш", "Сэлбэг", "Жолоочийн цалин", "Бусад"];
const METHODS: [string, string][] = [["CASH", "Бэлэн"], ["BANK", "Данс"],
                                     ["BARTER", "Бартер"], ["INTERNAL", "Дотоод"]];
const methodLabel = (m: string) => METHODS.find(([v]) => v === m)?.[1] || "—";

export default function Machines() {
  const [d, setD] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);         // сонгосон машины logs + нэхэмжлэхүүд
  const [modal, setModal] = useState<any>(null);     // {kind:'job'|'expense'|'add'|'invoice', machine}
  // Уугуул confirm() биш — системийн бусад устгал/төлөв солихтой ижил Modal
  const [ask, setAsk] = useState<any>(null);         // {kind:'delLog'|'retire'|'delInv', …}
  /* Нэхэмжлэлийн товч сервер рүү явж байх хоромд өөрийгөө түгжинэ — хоёр дарвал
     хоёр цонх (эсвэл хоёр баримт) төрдөг байв (SubmitButton-ийн журам).
     ТҮЛХҮҮР нь МАШИНЫ ID: ганц `number | null` байхад нэг машины хүлээлт БҮХ
     машины товчийг унтраадаг байв — зургаан краны жагсаалт бүхэлдээ хөшинө. */
  const [invBusy, setInvBusy] = useState<Record<number, boolean>>({});
  const toast = useToast();
  const pdf = usePdf();
  const u = user();
  const isManager = u?.role === "manager";
  /* ЭМХ ЦЭГЦИЙН зураас (эзний шийдвэр 2026-09) — НУУЦЛАЛЫНХ БИШ.
     Дарга нь МЕХАНИЗМЫН хүн: түүний нүд энэ хуудсан дээр «хэн, хэзээ, ямар
     ажил хийв» гэдгийг хайдаг. Тиймээс мөрөн дэх ДҮНГИЙН багана, картын
     P&L нь МӨРНӨӨС гарч, доорх НЭГ «Санхүү» задаргаанд хумигдана — асуулт
     ирэхэд тэр нээж хариулна (хуудас бүр дээр ИЖИЛ хэлбэр).

     ⚠ ЭРХ нь ӨӨР асуулт бөгөөд ХЭВЭЭР: ӨӨРИЙН ажлаа бүртгэх (огноо, төрөл,
     харилцагч, ДҮН) нь нээлттэй — тэр ажлынхаа үнийг талбай дээр өөрөө
     бичдэг. Харин түүхэн бичилт ЗАСАХ/УСТГАХ, нэхэмжлэл гаргах нь
     менежер+санхүүчийнх (routers/machines.py `money_guard` — сервер 403).
     Тиймээс тэдгээр товч задаргаа дотор ч ГАРАХГҮЙ: үргэлж унадаг товч
     харуулах нь худал амлалт. */
  const seesMoney = u?.role !== "factory";

  const load = async () => {
    const lst = await api("/api/machines");
    setD(lst);
    if (lst.machines.length) {
      const mid = sel?.id && lst.machines.some((m: any) => m.id === sel.id) ? sel.id : lst.machines[0].id;
      setSel(await api(`/api/machines/${mid}/logs`));
    }
  };
  useEffect(() => { load(); }, []);

  /** Машины бичилтүүдийг доор задлах — карт ч, нэр ч ЭНЭ ганц замаар очно. */
  const openLogs = async (id: number) => {
    try { setSel(await api(`/api/machines/${id}/logs`)); }
    catch (e: any) { toast(e.message, "err"); }
  };

  // Inline засвар: амжилтгүй бол алдааг toast-оор гаргаж, InlineEdit-д дахин
  // throw хийнэ (тэгснээр засварын горимоос гарахгүй, бичсэн зүйл нь үлдэнэ).
  const doPatch = async (url: string, body: any, msg: string) => {
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(body) });
      toast(msg); await load();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  };
  const doDelete = async (url: string, msg: string) => {
    try {
      await api(url, { method: "DELETE" });
      toast(msg); setAsk(null); await load();
    } catch (e: any) { toast(e.message, "err"); }
  };
  const toggleActive = async (m: any) => {
    try {
      await api(`/api/machines/${m.id}`, { method: "PATCH",
        body: JSON.stringify({ active: m.active ? 0 : 1 }) });
      toast(m.active ? "Механизм зогслоо" : "Механизм идэвхжлээ"); setAsk(null); await load();
    } catch (e: any) { toast(e.message, "err"); }
  };

  if (!d) return <Spinner />;

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">МЕХАНИЗМ <span>•</span> {d.machines.length} МАШИН</div>
          <h1 className="dashboard-title">Механизм</h1>
          <p className="dashboard-subtitle">
            {seesMoney
              ? "Автокран г.м. — өдрийн ажил, зарлага, машин бүрийн ашиг."
              : "Автокран г.м. — өдрийн ажил, зарлагаа бүртгэнэ."}
          </p>
        </div>
        {isManager && (
          <button className="btn-secondary command-action"
                  onClick={() => setModal({ kind: "add" })}>+ Машин нэмэх</button>
        )}
      </div>

      {/* Планшет (дарга талбай дээр 768px-ээр орно): гурав нь 233px болж
          «1.4 сая₮» гэсэн тоонууд нугалдаг байв. Хоёр багана = 358px. */}
      <div className="grid grid-cols-3 gap-4 mb-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {d.machines.map((m: any) => (
          /* Карт БҮТНЭЭРЭЭ дарагдсан хэвээр (хулганы хялбар зам) ч ГАРЫН
             зогсоол нь МАШИНЫ НЭР дээр: `role="button"` хайрцаг өөрийн доторх
             жинхэнэ товчийг (Нэхэмжлэл үүсгэх) уншигчийн хувьд ЗАЛГИДАГ —
             нэрлэгдсэн үйлдэл нь нэрээ өөрөө үүрч, товч нь ах дүү болж үлдэнэ. */
          <div key={m.id}
            onClick={() => openLogs(m.id)}
            className={`card p-5 text-left transition cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${
              sel?.id === m.id ? "!border-brand ring-4 ring-brand-50" : ""} ${m.active ? "" : "opacity-75"}`}>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              {/* Сонгогдсон карт нь хүрээгээрээ хэлдэг — `aria-pressed` нь ЯГ
                  тэр төлөвийг уншигчид хэлнэ (хүрээ нь өнгө, энэ нь үг). */}
              {/* `min-h-[--target-sm]` — 23px өндөртэй байв. Энэ бол даргын
                  планшет дээрх ГОЛ зогсоол (машины түүх нээх) тул §4-ийн
                  доод шатнаас доогуур байж болохгүй. `inline-flex items-center`
                  нь өндрийг ҮНЭХЭЭР өгнө: `min-height` дангаараа inline
                  элементэд үйлчлэхгүй. */}
              <button type="button" aria-label={`${m.name} — бичилтүүдийг нээх`}
                      className="text-left text-ink text-[15px] font-bold rounded-[4px] hover:underline
                                 inline-flex items-center min-h-[36px]"
                      aria-pressed={sel?.id === m.id}
                      onClick={(e) => { e.stopPropagation(); openLogs(m.id); }}>
                {m.name}
              </button>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Нэхэмжлэл гаргах зам нүд дотроо ч бий — доод «Нэхэмжлэлүүд»
                    хэсэг рүү гүйлгэлгүйгээр шууд. Зогссон машины өнгөрсөн ажлыг
                    нэхэмжлэх нь хэвийн тул идэвхгүй үед ч харагдана. */}
                {/* Хоёр оролт НЭГ үйлдэл — тул НЭГ жинтэй (btn-secondary) ба НЭГ
                    нэртэй. Картын оролт нь ХАРАГДАЖ буй бичилтийн самбарыг
                    хөдөлгөхгүй: В машины нэхэмжлэлийг гаргахын тулд А машины
                    нээлттэй түүхийг чимээгүй сольдог байв. Цонх нь дөнгөж
                    татсан объектоо ШУУД аваад явна. */}
                {seesMoney && (
                  <button className="btn-secondary btn-row" disabled={!!invBusy[m.id]}
                          aria-busy={invBusy[m.id] || undefined}
                          aria-label={`${m.name} — нэхэмжлэл үүсгэх`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setInvBusy((b) => ({ ...b, [m.id]: true }));
                            try {
                              const s = await api(`/api/machines/${m.id}/logs`);
                              setModal({ kind: "invoice", machine: s });
                            } catch (er: any) { toast(er.message, "err"); }
                            finally { setInvBusy((b) => ({ ...b, [m.id]: false })); }
                          }}>
                    Нэхэмжлэл үүсгэх{invBusy[m.id] && <Spin />}
                  </button>
                )}
                {/* Зогссон машин жагсаалтын сүүлд ирдэг (сервер эрэмбэлнэ) ба
                    тэмдэглэгээтэй — тоо нь хэвээр харагдана, шинэ бичилт л хаагдана. */}
                <span className={m.active ? "pill-grey" : "pill-amber"}>
                  {m.active ? `${m.log_count} бичилт` : "Зогссон"}
                </span>
              </div>
            </div>
            {seesMoney ? (
              <>
                <div className="flex gap-5">
                  <div><div className="text-[12px] text-t3 font-bold uppercase">Орлого</div>
                    <div className="font-extrabold tabular-nums text-money" title={money(m.income)}>{sayaFmt(m.income)}₮</div></div>
                  <div><div className="text-[12px] text-t3 font-bold uppercase">Зарлага</div>
                    <div className="font-extrabold tabular-nums text-danger" title={money(m.expense)}>{sayaFmt(m.expense)}₮</div></div>
                  <div><div className="text-[12px] text-t3 font-bold uppercase">Цэвэр</div>
                    <div className={`font-extrabold tabular-nums ${m.net >= 0 ? "text-ink" : "text-danger"}`}
                         title={money(m.net)}>{sayaFmt(m.net)}₮</div></div>
                </div>
                {/* Дотоод ажил ОРЛОГОД ОРООГҮЙ (нэхэмжлэх ч түүнийг хасдаг) —
                    гэхдээ алга болох ёсгүй: кран өөрийн барилга дээр хэдэн
                    өдөр зогссон нь ч мэдээлэл. Тиймээс бүдэг, тусдаа мөр. */}
                {m.internal_count > 0 && (
                  <div className="text-[12px] text-t3 mt-2" title={money(m.internal)}>
                    Дотоод ажил {m.internal_count}ш · {sayaFmt(m.internal)}₮ — орлогод ороогүй
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12.5px] text-t2">Өдрийн ажил, зарлагаа энд бүртгэнэ.</div>
            )}
          </div>
        ))}
        {d.machines.length === 0 && <div className="col-span-full"><Empty title="Машин бүртгэгдээгүй" /></div>}
      </div>

      {sel && (
        <div className="card overflow-x-auto">
          <div className="flex items-start justify-between px-4 pt-4 pb-1 flex-wrap gap-2">
            <div className="min-w-0">
              <h2 className="font-bold text-ink text-[15.5px] flex items-center gap-2 flex-wrap">
                {isManager
                  ? <InlineEdit label="Машины нэр" value={sel.name} width="w-52" confirmText="Нэр солих уу?"
                      onSave={(v) => doPatch(`/api/machines/${sel.id}`, { name: v }, "Нэр шинэчлэгдлээ")} />
                  : <span>{sel.name}</span>}
                <span className="text-t3 font-medium">— бичилтүүд</span>
                {!sel.active && <span className="pill-amber">Зогссон</span>}
              </h2>
              <div className="flex items-center gap-1.5 text-[12.5px] text-t3 mt-0.5">
                {/* Талбарын нэр нь InlineEdit-ийн `label` дээр аль хэдийн бий —
                    харагдах бичиг нь ХАРЦНЫХ, дахин уншуулбал давхар зарлагдана. */}
                <span aria-hidden="true">Тэмдэглэл:</span>
                {isManager
                  ? <InlineEdit label="Машины тэмдэглэл" value={sel.note} display={sel.note || "нэмэх…"}
                      width="w-64" confirmText="Хадгалах уу?"
                      onSave={(v) => doPatch(`/api/machines/${sel.id}`, { note: v }, "Тэмдэглэл шинэчлэгдлээ")} />
                  : <span>{sel.note || "—"}</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {sel.active ? (
                <>
                  <button className="btn-secondary !min-h-9 !py-1.5" onClick={() => setModal({ kind: "expense", machine: sel })}>+ Зарлага</button>
                  <button className="btn-primary !min-h-9 !py-1.5" onClick={() => setModal({ kind: "job", machine: sel })}>+ Ажил бүртгэх</button>
                </>
              ) : (
                <span className="text-[12.5px] text-t2 self-center">Зогссон — түүх уншигдана, шинэ бичилт нэмэхгүй.</span>
              )}
              {isManager && (
                <button className="btn-ghost btn-row" onClick={() => setAsk({ kind: "retire", machine: sel })}>
                  {sel.active ? "Зогсоох" : "Идэвхжүүлэх"}
                </button>
              )}
            </div>
          </div>
          {/* Даргад: мөр бүр ХЭВЭЭР харагдана (өөрийн бүртгэсэн ажлаа шалгах
              ёстой) ч ДҮНГИЙН багана огт байхгүй — багана нь хоосон нүд болж
              «энд ямар нэг тоо байгаа» гэж заадаггүй. Засварын ✎, устгалын ✕
              ч алга: сервер тэднийг 403-оор хаадаг тул үргэлж унадаг товч
              харуулах нь худал амлалт. */}
          {/* 820px-ийн шал нь 768px планшет дээр (агуулга 730px) хүснэгтийг
              90px-ээр халиулж, мөр дээрх засварууд хэвтээ гүйлгэлтийн ард
              үлддэг байв. Шалыг буулгав: планшет дээр чөлөөт текстийн багана
              нугалж мөр 65 → 80px болно — тоо БҮГД харагдана гэдэг нь нүднээс
              далд үлдсэн 90px-ээс дээр. */}
          <table className={`w-full ${seesMoney ? "min-w-[680px]" : "min-w-[560px]"}`}>
            <thead><tr>
              <th className="th">Огноо</th><th className="th">Юу</th><th className="th">Хэн / Хаана</th>
              {seesMoney && <th className="th text-right">Дүн</th>}
              <th className="th">Хэлбэр</th>
              {seesMoney && <th className="th"></th>}
            </tr></thead>
            <tbody>
              {sel.logs.map((l: any) => {
                /* Мөр бүр ХЭНИЙХ болохоо өөрөө үүрнэ. Дараалсан зургаан
                   зогсоол «Бүртгэлийн дүн: 1,500,000₮ · засах» гэж ижилхэн
                   дуудагдвал уншигчаар ажилладаг хүн АЛЬ бичилтийг заасныг
                   мэдэхгүй (MaterialLedger-ийн журам: огноо · юу). */
                const row = `${l.date} · ${l.label || (l.entry === "job" ? "Ажил" : "Зарлага")}`;
                return (
                <tr key={l.id}>
                  <td className="td">
                    {seesMoney ? (
                      <InlineEdit type="date" label={`${row} — огноо`} value={l.date} display={l.date} width="w-36"
                        confirmText="Огноо солих уу?"
                        onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { date: v }, "Огноо шинэчлэгдлээ")} />
                    ) : <span className="tabular-nums">{l.date}</span>}
                  </td>
                  <td className="td">
                    {/* Шошго нь ЧӨЛӨӨТ текст (seed дээр «Сэлбэг — краны гинж» гэх мэт)
                        тул сонголтын жагсаалт болговол бичсэн зүйл нь алдагдана. */}
                    {seesMoney ? (
                      <InlineEdit label={`${row} — ${l.entry === "job" ? "ажлын төрөл" : "зарлагын ангилал"}`}
                        value={l.label} width="w-40" confirmText="Хадгалах уу?"
                        display={l.label || "—"}
                        onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { label: v }, "Бичилт шинэчлэгдлээ")} />
                    ) : <span>{l.label || "—"}</span>}
                  </td>
                  <td className="td text-t2">
                    {seesMoney ? (
                      <InlineEdit label={`${row} — хэн / хаана`} value={l.client} display={l.client || "—"} width="w-48"
                        confirmText="Хадгалах уу?"
                        onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { client: v }, "Харилцагч шинэчлэгдлээ")} />
                    ) : <span>{l.client || "—"}</span>}
                  </td>
                  {seesMoney && (
                    <td className="td text-right tabular-nums" title={money(l.amount)}>
                      <InlineEdit type="number" right label={`${row} — дүн`} value={l.amount} width="w-28"
                        confirmText="Дүн солих уу?"
                        display={(l.entry === "job" ? "+" : "−") + money(l.amount)}
                        onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { amount: parseMoney(v) }, "Дүн шинэчлэгдлээ")} />
                    </td>
                  )}
                  <td className="td">
                    {l.entry !== "job"
                      ? <span className="pill-red">зарлага</span>
                      : seesMoney
                        ? <InlineEdit label={`${row} — төлбөрийн хэлбэр`} value={l.method} display={methodLabel(l.method)}
                            options={METHODS} width="w-28" confirmText="Хэлбэр солих уу?"
                            onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { method: v }, "Төлбөрийн хэлбэр шинэчлэгдлээ")} />
                        : <span className="text-t2">{methodLabel(l.method)}</span>}
                  </td>
                  {seesMoney && (
                    <td className="td text-right">
                      {/* 28px байсан — docs/UI-ЗАРЧИМ.md §4: дарагддаг юм 36px-ээс намхан БАЙХГҮЙ */}
                      <button className="w-9 h-9 rounded-lg bg-danger-50 text-danger shrink-0"
                              title="Бичилт устгах" aria-label={`${row} — бичилт устгах`}
                              onClick={() => setAsk({ kind: "delLog", log: l })}>✕</button>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
          {sel.logs.length === 0 && <Empty title="Бичилт алга" sub="Ажил эсвэл зарлага бүртгэвэл энд харагдана." />}
        </div>
      )}

      {/* Нэхэмжлэл бол МӨНГӨНИЙ баримт — даргад бүхэл хэсгээрээ хаалттай
          (сервер ч POST/DELETE-ийг 403-оор буцаана). */}
      {sel && seesMoney && (
        <div className="card mt-4 overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-1 flex-wrap gap-2">
            <div>
              <h2 className="font-bold text-ink text-[15.5px]">Нэхэмжлэлүүд</h2>
              {/* Энэ бол ТУСДАА баримт: авлагын жагсаалтад ордоггүй, төлбөрийн
                  бодит байдал нь бичилтийн «Хэлбэр» талбар дээр бүртгэгддэг. */}
              <p className="text-[12.5px] text-t3 mt-0.5">Краны ажлын мөрүүдээс гаргасан баримт — авлагын тооцоонд ордоггүй.</p>
            </div>
            {/* Картын оролттой ИЖИЛ нэр — нэг үйлдэл хоёр өөр дуудлагатай
                байвал уншигчаар ажилладаг хүн хоёр өөр зүйл гэж уншина. */}
            <button className="btn-secondary !min-h-9 !py-1.5"
                    aria-label={`${sel.name} — нэхэмжлэл үүсгэх`}
                    onClick={() => setModal({ kind: "invoice", machine: sel })}>Нэхэмжлэл үүсгэх</button>
          </div>
          {sel.invoices.length === 0 ? (
            <Empty title="Нэхэмжлэл үүсгээгүй"
                   sub="Харилцагч, хугацаа сонгоод тухайн үеийн ажлуудыг нэг баримт болгоно." />
          ) : (
            <table className="w-full min-w-[680px]">
              <thead><tr>
                <th className="th">№</th><th className="th">Харилцагч</th><th className="th">Хугацаа</th>
                <th className="th text-right">Дүн</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {sel.invoices.map((inv: any) => {
                  const path = `/api/machine-invoices/${inv.id}/pdf`;
                  return (
                    <tr key={inv.id}>
                      <td className="td font-bold text-ink">№{inv.no}</td>
                      <td className="td text-t2">{inv.client}</td>
                      <td className="td text-t2 tabular-nums">{inv.d_from} – {inv.d_to}</td>
                      <td className="td text-right tabular-nums font-bold text-ink"
                          title={money(inv.grand_total)}>{money(inv.grand_total)}</td>
                      <td className="td text-right whitespace-nowrap">
                        {/* Шошго нь «…» болдог байв — уншигчаар ажилладаг хүн
                            30 мөрийн аль баримтын товчийг дарснаа алддаг. Нэр
                            байрандаа, тэмдэг нь дэргэд нь. */}
                        <button className="btn-ghost btn-row" disabled={pdf.busy}
                                aria-busy={pdf.busyPath === path || undefined}
                                aria-label={`№${inv.no} — хэвлэх`}
                                onClick={() => pdf.open(path)}>
                          Хэвлэх{pdf.busyPath === path && <Spin />}
                        </button>
                        <button className="w-9 h-9 rounded-lg bg-danger-50 text-danger shrink-0 ml-1.5 align-middle"
                                title="Нэхэмжлэл устгах" aria-label={`№${inv.no} — нэхэмжлэл устгах`}
                                onClick={() => setAsk({ kind: "delInv", inv })}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* САНХҮҮ — зөвхөн даргад, ажлынх нь бичилтүүдийн ХОЙНО. Хураангуй тоо
          нь БҮХ машины «Цэвэр ашиг»: механизмын талаар «мөнгө нь юу болов»
          гэсэн асуултын ганц хариу. Дотор нь машин бүрийн задаргаа, сонгосон
          машины бичилтийн дүн ба нэхэмжлэлүүд. */}
      {!seesMoney && d.machines.length > 0 && (
        <FinanceDisclosure name="machines"
          summary={money(d.machines.reduce((n: number, m: any) => n + (m.net || 0), 0))}
          summaryLabel="Цэвэр ашиг"
          hint="Машин бүрийн орлого, зарлага, бичилтийн дүн, нэхэмжлэл — дарж дэлгэнэ.">
          <FinanceBlock title="Машин бүрээр">
            <table className="w-full">
              <thead><tr>
                <th className="th">Машин</th><th className="th text-right">Орлого</th>
                <th className="th text-right">Зарлага</th><th className="th text-right">Цэвэр</th>
              </tr></thead>
              <tbody>
                {d.machines.map((m: any) => (
                  <tr key={m.id}>
                    <td className="td"><b className="text-ink">{m.name}</b>
                      {/* Дотоод ажил ОРЛОГОД ОРООГҮЙ — алга болох ёсгүй */}
                      {m.internal_count > 0 && (
                        <span className="block text-[12px] text-t3">
                          Дотоод ажил {m.internal_count}ш · {money(m.internal)} — орлогод ороогүй
                        </span>)}
                    </td>
                    <td className="td text-right tabular-nums text-money">{money(m.income)}</td>
                    <td className="td text-right tabular-nums text-danger">{money(m.expense)}</td>
                    <td className={`td text-right tabular-nums font-bold ${
                      m.net >= 0 ? "text-ink" : "text-danger"}`}>{money(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinanceBlock>

          {sel && sel.logs.length > 0 && (
            <FinanceBlock title={`${sel.name} — бичилтийн дүн`}>
              {sel.logs.map((l: any) => (
                <FinanceRow key={l.id}
                            label={`${l.date} · ${l.label || (l.entry === "job" ? "Ажил" : "Зарлага")}`}
                            sub={l.client || undefined}
                            value={(l.entry === "job" ? "+" : "−") + money(l.amount)}
                            tone={l.entry === "job" ? "money" : "danger"} />
              ))}
            </FinanceBlock>
          )}

          {sel && sel.invoices.length > 0 && (
            <FinanceBlock title={`${sel.name} — нэхэмжлэлүүд`}>
              {sel.invoices.map((inv: any) => (
                <FinanceRow key={inv.id} label={`№${inv.no} · ${inv.client}`}
                            sub={`${inv.d_from} – ${inv.d_to}`}
                            value={money(inv.grand_total)} />
              ))}
            </FinanceBlock>
          )}
        </FinanceDisclosure>
      )}

      {(modal?.kind === "job" || modal?.kind === "expense") && (
        <LogModal kind={modal.kind} m={modal.machine} onClose={() => setModal(null)}
                  onDone={() => { setModal(null); load(); }} />
      )}
      {modal?.kind === "add" && <AddMachineModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === "invoice" && (
        <InvoiceModal m={modal.machine} onClose={() => setModal(null)}
                      onDone={() => { setModal(null); load(); }} />
      )}

      {ask?.kind === "delLog" && (
        <ConfirmModal
          title="Бичилт устгах"
          intro={<>Устгасан бичилт сэргэхгүй. Машины орлого, зарлага, цэвэр ашиг дагаж дахин бодогдоно.</>}
          rows={[
            { label: "Огноо", value: ask.log.date },
            { label: ask.log.label || (ask.log.entry === "job" ? "Ажил" : "Зарлага"),
              value: (ask.log.entry === "job" ? "+" : "−") + money(ask.log.amount),
              accent: ask.log.entry === "job" ? "money" : "danger" },
            ...(ask.log.client ? [{ label: "Хэн / хаана", value: ask.log.client, accent: "dim" as const }] : []),
          ]}
          confirmLabel="Устгах" danger
          onClose={() => setAsk(null)}
          onConfirm={() => doDelete(`/api/machine-logs/${ask.log.id}`, "Бичилт устгагдлаа")} />
      )}
      {ask?.kind === "retire" && (
        <ConfirmModal
          title={ask.machine.active ? "Механизм зогсоох" : "Механизм идэвхжүүлэх"}
          intro={ask.machine.active
            ? <><b className="text-ink">{ask.machine.name}</b> — түүх БҮРЭН хадгалагдана (бичилт, нэхэмжлэл,
                тайлангийн тоо хэвээр). Зөвхөн ШИНЭ бичилт нэмэх боломж хаагдана.</>
            : <><b className="text-ink">{ask.machine.name}</b> — дахин ажиллаж эхэлнэ, шинэ бичилт нэмэгдэнэ.</>}
          rows={[
            { label: "Бичилт", value: `${ask.machine.log_count}` },
            { label: "Орлого", value: money(ask.machine.income), accent: "money" },
            { label: "Зарлага", value: money(ask.machine.expense), accent: "danger" },
          ]}
          total={{ label: "Цэвэр ашиг", value: money(ask.machine.net) }}
          confirmLabel={ask.machine.active ? "Зогсоох" : "Идэвхжүүлэх"} danger={!!ask.machine.active}
          onClose={() => setAsk(null)}
          onConfirm={() => toggleActive(ask.machine)} />
      )}
      {ask?.kind === "delInv" && (
        <ConfirmModal
          title="Нэхэмжлэл устгах"
          intro={<>Баримт устгагдана. Краны <b className="text-ink">ажлын бүртгэл хэвээр</b> үлдэх тул
                  шаардвал дахин нэхэмжлэл гаргаж болно.</>}
          rows={[
            { label: "№", value: ask.inv.no },
            { label: "Харилцагч", value: ask.inv.client },
            { label: "Хугацаа", value: `${ask.inv.d_from} – ${ask.inv.d_to}`, accent: "dim" },
          ]}
          total={{ label: "Нийт дүн", value: money(ask.inv.grand_total) }}
          confirmLabel="Устгах" danger
          onClose={() => setAsk(null)}
          onConfirm={() => doDelete(`/api/machine-invoices/${ask.inv.id}`, "Нэхэмжлэл устгагдлаа")} />
      )}
    </div>
  );
}

function LogModal({ kind, m, onClose, onDone }: any) {
  const toast = useToast();
  const labels = kind === "job" ? JOB_LABELS : EXP_LABELS;
  const f0 = { date: today(), label: labels[0], client: "", amount: "", method: "BANK", note: "" };
  const [f, setF] = useState(f0);
  const amt = parseMoney(f.amount);
  const uid = useId();
  return (
    <FormModal dirty={formDirty(f0, f)} onClose={onClose}
               title={kind === "job" ? `Ажил бүртгэх — ${m.name}` : `Зарлага — ${m.name}`}>
      <div className="lbl" id={`${uid}-label`}>{kind === "job" ? "Ажлын төрөл" : "Зарлагын ангилал"}</div>
      <div className="flex gap-2 mb-3.5 flex-wrap" role="group" aria-labelledby={`${uid}-label`}>
        {labels.map((lb) => (
          <button key={lb} aria-pressed={f.label === lb}
            onClick={() => setF({ ...f, label: lb, method: lb === "Дотоод ажил" ? "INTERNAL" : f.method })}
            className={`rounded-[10px] border px-4 py-2 font-semibold text-[13px] min-h-10 transition ${
              f.label === lb ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amount`}>Дүн ₮</label>
          <input id={`${uid}-amount`} className="inp" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></div>
      </div>
      {kind === "job" && (
        <>
          <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-client`}>Хэнд / хаана</label>
            <input id={`${uid}-client`} className="inp" placeholder="Харилцагч эсвэл дотоод ажлын тайлбар" value={f.client}
                   list={`${uid}-clients`}
                   onChange={(e) => setF({ ...f, client: e.target.value })} />
            {/* Нэрийг ЯГ ижилхэн бичих нь чухал: нэхэмжлэх нь харилцагчийн нэрээр
                мөрөө цуглуулдаг тул «Түмэн хийц» ба «Түмэн Хийц» хоёр өөр болно. */}
            <datalist id={`${uid}-clients`}>
              {(m.clients || []).map((c: string) => <option key={c} value={c} />)}
            </datalist></div>
          {f.label !== "Дотоод ажил" && (
            <div className="mt-3.5"><div className="lbl" id={`${uid}-method`}>Төлбөрийн хэлбэр</div>
              <div className="flex gap-2" role="group" aria-labelledby={`${uid}-method`}>
                {[["CASH", "Бэлэн"], ["BANK", "Данс"], ["BARTER", "Бартер"]].map(([v, lb]) => (
                  <button key={v} onClick={() => setF({ ...f, method: v })} aria-pressed={f.method === v}
                    className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
                      f.method === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
                ))}
              </div></div>
          )}
        </>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!amt} onSubmit={async () => {
          try {
            await api(`/api/machines/${m.id}/logs`, { method: "POST", body: JSON.stringify({
              date: f.date, entry: kind, label: f.label, client: f.client,
              amount: amt, method: kind === "job" ? f.method : "", note: f.note }) });
            toast("Бүртгэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

/* ---------- Механизмын нэхэмжлэл ----------
   «Үүсгэх» дарахаас ӨМНӨ ЯГ ЮУ орохыг харуулна: сонгогдсон мөрүүд, тэдгээрийн
   нийт дүн. Сонголтын дүрэм нь серверийнхтэй нэг эх сурвалжаас (lib/machine.ts,
   machine.test.ts-ээр барьцаалагдсан) — дэлгэц дээрх амлалт баримт дээр эвдэрэхгүй. */
function InvoiceModal({ m, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { client: "", from: monthStart(), to: today() };
  const [f, setF] = useState(f0);
  const [names, setNames] = useState<string[]>([]);
  /* НӨАТ% нь СЕРВЕРИЙН тооцоонд ордог (`create_invoice`) тул урьдчилсан
     харагдац түүнийг мэдэхгүй бол «1,800,000₮» гэж амлаад баримт дээр өөр тоо
     хэвлэнэ. Компанийн тохиргоо ГАНЦ эх сурвалж — сервер ч эндээс уншина. */
  const [vat, setVat] = useState(0);
  const uid = useId();

  // Харилцагчийн санал: бүртгэлтэй харилцагчид + краны бичилтэд бичигдсэн
  // чөлөөт нэрс. Жагсаалт нь модал НЭЭГДЭХЭД л татагдана — Механизмын хуудас
  // ачаалагдах бүрд бүх харилцагчийн тооцоог сэргээх шалтгаан алга.
  useEffect(() => {
    let alive = true;
    api("/api/clients")
      .then((rows: any[]) => { if (alive) setNames(rows.map((c) => c.name)); })
      .catch(() => { /* санал байхгүй ч гараар бичих зам нээлттэй */ });
    api("/api/settings")
      .then((s: any) => { if (alive) setVat(parseMoney(s.vat_percent)); })
      .catch(() => { /* уншигдаагүй бол 0 — өнөөдрийн бодит утга */ });
    return () => { alive = false; };
  }, []);

  const logs: MachineLogRow[] = m.logs || [];
  const rows = billableJobs(logs, f.client, f.from, f.to);
  const sum = invoiceTotals(rows, vat);
  const suggestions = Array.from(new Set([...(m.clients || []), ...names]));

  return (
    <FormModal title={`Нэхэмжлэл үүсгэх — ${m.name}`} onClose={onClose} dirty={formDirty(f0, f)}>
      <label className="lbl" htmlFor={`${uid}-client`}>Харилцагч *</label>
      <input id={`${uid}-client`} className="inp" list={`${uid}-clients`} autoFocus
             placeholder="Бичилт дээрх нэртэй ЯГ ижил байх ёстой" value={f.client}
             onChange={(e) => setF({ ...f, client: e.target.value })} />
      <datalist id={`${uid}-clients`}>
        {suggestions.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        <div><label className="lbl" htmlFor={`${uid}-from`}>Эхлэх огноо</label>
          <input id={`${uid}-from`} type="date" className="inp" value={f.from}
                 onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-to`}>Дуусах огноо</label>
          <input id={`${uid}-to`} type="date" className="inp" value={f.to}
                 onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      </div>
      <p className="text-[12.5px] text-t3 mt-2">
        Хоёр огноо хоёулаа ОРНО. Дотоод ажил, зарлага нэхэмжлэлд орохгүй.
      </p>

      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-xl bg-sunken px-4 py-3 text-[13px] text-t2">
            {f.client.trim()
              ? "Энэ хугацаанд тухайн харилцагчийн нэхэмжлэх ажил алга."
              : "Харилцагчаа сонгоно уу — сонгосны дараа орох мөрүүд энд харагдана."}
          </div>
        ) : (
          <Receipt
            rows={[
              ...rows.slice(0, 6).map((r) => ({
                label: `${r.date} · ${r.label || "Ажил"}`,
                sub: methodLabel(r.method),
                value: money(r.amount),
              })),
              ...(rows.length > 6
                ? [{ label: `… бас ${rows.length - 6} мөр`, value: money(invoiceTotals(rows.slice(6)).total), accent: "dim" as const }]
                : []),
              // НӨАТ 0 бол мөр нэмэхгүй — байхгүй татварыг «0₮» гэж зарлах нь
              // уншигчийг зогсоох чимээ (өнөөдрийн Жигүүр Зам).
              ...(sum.vat > 0
                ? [{ label: `Мөрүүдийн дүн`, value: money(sum.total), accent: "dim" as const },
                   { label: `НӨАТ ${vat}%`, value: money(sum.vat), accent: "dim" as const }]
                : []),
            ]}
            total={{ label: `${rows.length} мөр · Нийт`, value: money(sum.grand), accent: "money" }} />
        )}
      </div>

      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={rows.length === 0} busyLabel="Үүсгэж байна…"
          title={rows.length === 0 ? "Орох мөр байхгүй тул нэхэмжлэл үүсгэхгүй" : undefined}
          onSubmit={async () => {
            try {
              const inv = await api(`/api/machines/${m.id}/invoices`, { method: "POST",
                body: JSON.stringify({ client: f.client.trim(), d_from: f.from, d_to: f.to }) });
              toast(`№${inv.no} үүслээ — ${inv.rows} мөр`);
              onDone();
            } catch (e: any) { toast(e.message, "err"); }
          }}>Үүсгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

function AddMachineModal({ onClose, onDone }: any) {
  const toast = useToast();
  const [name, setName] = useState("");
  const uid = useId();
  return (
    <FormModal title="Машин нэмэх" onClose={onClose} dirty={name.trim() !== ""}>
      <label className="lbl" htmlFor={`${uid}-name`}>Нэр *</label>
      <input id={`${uid}-name`} className="inp mb-5" placeholder="ж: Ачааны машин 6800УКС" value={name}
             onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="flex justify-end gap-2.5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!name.trim()} onSubmit={async () => {
          try {
            await api("/api/machines", { method: "POST", body: JSON.stringify({ name }) });
            toast("Машин нэмэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Нэмэх</SubmitButton>
      </div>
    </FormModal>
  );
}

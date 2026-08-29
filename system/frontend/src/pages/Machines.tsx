import { useEffect, useId, useState } from "react";
import { api, money, sayaFmt, user } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty, InlineEdit, ConfirmModal, Receipt } from "../ui";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { usePdf } from "../lib/docs";
import { billableJobs, billTotal, type MachineLogRow } from "../lib/machine";

const today = () => new Date().toISOString().slice(0, 10);
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
  const toast = useToast();
  const pdf = usePdf();
  const u = user();
  const isManager = u?.role === "manager";

  const load = async () => {
    const lst = await api("/api/machines");
    setD(lst);
    if (lst.machines.length) {
      const mid = sel?.id && lst.machines.some((m: any) => m.id === sel.id) ? sel.id : lst.machines[0].id;
      setSel(await api(`/api/machines/${mid}/logs`));
    }
  };
  useEffect(() => { load(); }, []);

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
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Механизм</h1>
          <p className="text-t2 text-[13.5px] mt-0.5">Автокран г.м. — өдрийн ажил, зарлага, машин бүрийн ашиг.</p>
        </div>
        {isManager && (
          <button className="btn-secondary" onClick={() => setModal({ kind: "add" })}>+ Машин нэмэх</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 max-sm:grid-cols-1">
        {d.machines.map((m: any) => (
          <button key={m.id} onClick={async () => setSel(await api(`/api/machines/${m.id}/logs`))}
            className={`card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
              sel?.id === m.id ? "!border-brand ring-4 ring-brand-50" : ""} ${m.active ? "" : "opacity-75"}`}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <b className="text-ink text-[15px]">{m.name}</b>
              {/* Зогссон машин жагсаалтын сүүлд ирдэг (сервер эрэмбэлнэ) ба
                  тэмдэглэгээтэй — тоо нь хэвээр харагдана, шинэ бичилт л хаагдана. */}
              <span className={m.active ? "pill-grey" : "pill-amber"}>
                {m.active ? `${m.log_count} бичилт` : "Зогссон"}
              </span>
            </div>
            <div className="flex gap-5">
              <div><div className="text-[12px] text-t3 font-bold uppercase">Орлого</div>
                <div className="font-extrabold tabular-nums text-money" title={money(m.income)}>{sayaFmt(m.income)}₮</div></div>
              <div><div className="text-[12px] text-t3 font-bold uppercase">Зарлага</div>
                <div className="font-extrabold tabular-nums text-danger" title={money(m.expense)}>{sayaFmt(m.expense)}₮</div></div>
              <div><div className="text-[12px] text-t3 font-bold uppercase">Цэвэр</div>
                <div className={`font-extrabold tabular-nums ${m.net >= 0 ? "text-ink" : "text-danger"}`}
                     title={money(m.net)}>{sayaFmt(m.net)}₮</div></div>
            </div>
          </button>
        ))}
        {d.machines.length === 0 && <div className="col-span-3"><Empty title="Машин бүртгэгдээгүй" /></div>}
      </div>

      {sel && (
        <div className="card overflow-x-auto">
          <div className="flex items-start justify-between px-4 pt-4 pb-1 flex-wrap gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-ink text-[15.5px] flex items-center gap-2 flex-wrap">
                {isManager
                  ? <InlineEdit label="Машины нэр" value={sel.name} width="w-52" confirmText="Нэр солих уу?"
                      onSave={(v) => doPatch(`/api/machines/${sel.id}`, { name: v }, "Нэр шинэчлэгдлээ")} />
                  : <span>{sel.name}</span>}
                <span className="text-t3 font-medium">— бичилтүүд</span>
                {!sel.active && <span className="pill-amber">Зогссон</span>}
              </h3>
              <div className="flex items-center gap-1.5 text-[12.5px] text-t3 mt-0.5">
                <span>Тэмдэглэл:</span>
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
          <table className="w-full min-w-[820px]">
            <thead><tr>
              <th className="th">Огноо</th><th className="th">Юу</th><th className="th">Хэн / Хаана</th>
              <th className="th text-right">Дүн</th><th className="th">Хэлбэр</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {sel.logs.map((l: any) => (
                <tr key={l.id}>
                  <td className="td">
                    <InlineEdit type="date" label="Бүртгэлийн огноо" value={l.date} display={l.date} width="w-36"
                      confirmText="Огноо солих уу?"
                      onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { date: v }, "Огноо шинэчлэгдлээ")} />
                  </td>
                  <td className="td">
                    {/* Шошго нь ЧӨЛӨӨТ текст (seed дээр «Сэлбэг — краны гинж» гэх мэт)
                        тул сонголтын жагсаалт болговол бичсэн зүйл нь алдагдана. */}
                    <InlineEdit label={l.entry === "job" ? "Ажлын төрөл" : "Зарлагын ангилал"}
                      value={l.label} width="w-40" confirmText="Хадгалах уу?"
                      display={l.label || "—"}
                      onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { label: v }, "Бичилт шинэчлэгдлээ")} />
                  </td>
                  <td className="td text-t2">
                    <InlineEdit label="Хэн / хаана" value={l.client} display={l.client || "—"} width="w-48"
                      confirmText="Хадгалах уу?"
                      onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { client: v }, "Харилцагч шинэчлэгдлээ")} />
                  </td>
                  <td className="td text-right tabular-nums" title={money(l.amount)}>
                    <InlineEdit type="number" right label="Бүртгэлийн дүн" value={l.amount} width="w-28"
                      confirmText="Дүн солих уу?"
                      display={(l.entry === "job" ? "+" : "−") + money(l.amount)}
                      onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { amount: parseMoney(v) }, "Дүн шинэчлэгдлээ")} />
                  </td>
                  <td className="td">
                    {l.entry === "job"
                      ? <InlineEdit label="Төлбөрийн хэлбэр" value={l.method} display={methodLabel(l.method)}
                          options={METHODS} width="w-28" confirmText="Хэлбэр солих уу?"
                          onSave={(v) => doPatch(`/api/machine-logs/${l.id}`, { method: v }, "Төлбөрийн хэлбэр шинэчлэгдлээ")} />
                      : <span className="pill-red">зарлага</span>}
                  </td>
                  <td className="td text-right">
                    <button className="w-7 h-7 rounded-lg bg-danger-50 text-danger shrink-0"
                            title="Бичилт устгах" aria-label={`${l.date} · ${l.label || l.entry} — бичилт устгах`}
                            onClick={() => setAsk({ kind: "delLog", log: l })}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sel.logs.length === 0 && <Empty title="Бичилт алга" sub="Ажил эсвэл зарлага бүртгэвэл энд харагдана." />}
        </div>
      )}

      {sel && (
        <div className="card mt-4 overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-1 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-ink text-[15.5px]">Нэхэмжлэхүүд</h3>
              {/* Энэ бол ТУСДАА баримт: авлагын жагсаалтад ордоггүй, төлбөрийн
                  бодит байдал нь бичилтийн «Хэлбэр» талбар дээр бүртгэгддэг. */}
              <p className="text-[12.5px] text-t3 mt-0.5">Краны ажлын мөрүүдээс гаргасан баримт — авлагын тооцоонд ордоггүй.</p>
            </div>
            <button className="btn-secondary !min-h-9 !py-1.5"
                    onClick={() => setModal({ kind: "invoice", machine: sel })}>Нэхэмжлэх үүсгэх</button>
          </div>
          {sel.invoices.length === 0 ? (
            <Empty title="Нэхэмжлэх үүсгээгүй"
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
                        <button className="btn-ghost btn-row" disabled={pdf.busy}
                                aria-busy={pdf.busyPath === path || undefined}
                                onClick={() => pdf.open(path)}>
                          {pdf.busyPath === path ? "…" : "PDF"}
                        </button>
                        <button className="w-7 h-7 rounded-lg bg-danger-50 text-danger shrink-0 ml-1.5 align-middle"
                                title="Нэхэмжлэх устгах" aria-label={`№${inv.no} — нэхэмжлэх устгах`}
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
            ? <><b className="text-ink">{ask.machine.name}</b> — түүх БҮРЭН хадгалагдана (бичилт, нэхэмжлэх,
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
          title="Нэхэмжлэх устгах"
          intro={<>Баримт устгагдана. Краны <b className="text-ink">ажлын бүртгэл хэвээр</b> үлдэх тул
                  шаардвал дахин нэхэмжлэх гаргаж болно.</>}
          rows={[
            { label: "№", value: ask.inv.no },
            { label: "Харилцагч", value: ask.inv.client },
            { label: "Хугацаа", value: `${ask.inv.d_from} – ${ask.inv.d_to}`, accent: "dim" },
          ]}
          total={{ label: "Нийт дүн", value: money(ask.inv.grand_total) }}
          confirmLabel="Устгах" danger
          onClose={() => setAsk(null)}
          onConfirm={() => doDelete(`/api/machine-invoices/${ask.inv.id}`, "Нэхэмжлэх устгагдлаа")} />
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

/* ---------- Механизмын нэхэмжлэх ----------
   «Үүсгэх» дарахаас ӨМНӨ ЯГ ЮУ орохыг харуулна: сонгогдсон мөрүүд, тэдгээрийн
   нийт дүн. Сонголтын дүрэм нь серверийнхтэй нэг эх сурвалжаас (lib/machine.ts,
   machine.test.ts-ээр барьцаалагдсан) — дэлгэц дээрх амлалт баримт дээр эвдэрэхгүй. */
function InvoiceModal({ m, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { client: "", from: monthStart(), to: today() };
  const [f, setF] = useState(f0);
  const [names, setNames] = useState<string[]>([]);
  const uid = useId();

  // Харилцагчийн санал: бүртгэлтэй харилцагчид + краны бичилтэд бичигдсэн
  // чөлөөт нэрс. Жагсаалт нь модал НЭЭГДЭХЭД л татагдана — Механизмын хуудас
  // ачаалагдах бүрд бүх харилцагчийн тооцоог сэргээх шалтгаан алга.
  useEffect(() => {
    let alive = true;
    api("/api/clients")
      .then((rows: any[]) => { if (alive) setNames(rows.map((c) => c.name)); })
      .catch(() => { /* санал байхгүй ч гараар бичих зам нээлттэй */ });
    return () => { alive = false; };
  }, []);

  const logs: MachineLogRow[] = m.logs || [];
  const rows = billableJobs(logs, f.client, f.from, f.to);
  const total = billTotal(rows);
  const suggestions = Array.from(new Set([...(m.clients || []), ...names]));

  return (
    <FormModal title={`Нэхэмжлэх үүсгэх — ${m.name}`} onClose={onClose} dirty={formDirty(f0, f)}>
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
        Хоёр огноо хоёулаа ОРНО. Дотоод ажил, зарлага нэхэмжлэхэд орохгүй.
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
                ? [{ label: `… бас ${rows.length - 6} мөр`, value: money(billTotal(rows.slice(6))), accent: "dim" as const }]
                : []),
            ]}
            total={{ label: `${rows.length} мөр · Нийт`, value: money(total), accent: "money" }} />
        )}
      </div>

      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={rows.length === 0} busyLabel="Үүсгэж байна…"
          title={rows.length === 0 ? "Орох мөр байхгүй тул нэхэмжлэх үүсгэхгүй" : undefined}
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

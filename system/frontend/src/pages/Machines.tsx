import { useEffect, useId, useState } from "react";
import { api, money, sayaFmt, user } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty } from "../ui";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";

const today = () => new Date().toISOString().slice(0, 10);
const JOB_LABELS = ["Бүтэн өдөр", "Хагас өдөр", "Дотоод ажил"];
const EXP_LABELS = ["Түлш", "Сэлбэг", "Жолоочийн цалин", "Бусад"];

export default function Machines() {
  const [d, setD] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);         // сонгосон машины logs
  const [modal, setModal] = useState<any>(null);     // {kind:'job'|'expense'|'add', machine}
  const toast = useToast();
  const u = user();

  const load = async () => {
    const lst = await api("/api/machines");
    setD(lst);
    if (lst.machines.length) {
      const mid = sel?.id && lst.machines.some((m: any) => m.id === sel.id) ? sel.id : lst.machines[0].id;
      setSel(await api(`/api/machines/${mid}/logs`));
    }
  };
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Механизм</h1>
          <p className="text-t2 text-[13.5px] mt-0.5">Автокран г.м. — өдрийн ажил, зарлага, машин бүрийн ашиг.</p>
        </div>
        {u?.role === "manager" && (
          <button className="btn-secondary" onClick={() => setModal({ kind: "add" })}>+ Машин нэмэх</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 max-sm:grid-cols-1">
        {d.machines.map((m: any) => (
          <button key={m.id} onClick={async () => setSel(await api(`/api/machines/${m.id}/logs`))}
            className={`card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
              sel?.id === m.id ? "!border-brand ring-4 ring-brand-50" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <b className="text-ink text-[15px]">{m.name}</b>
              <span className="pill-grey">{m.log_count} бичилт</span>
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
          <div className="flex items-center justify-between px-4 pt-4 pb-1 flex-wrap gap-2">
            <h3 className="font-bold text-ink text-[15.5px]">{sel.name} — бичилтүүд</h3>
            <div className="flex gap-2">
              <button className="btn-secondary !min-h-9 !py-1.5" onClick={() => setModal({ kind: "expense", machine: sel })}>+ Зарлага</button>
              <button className="btn-primary !min-h-9 !py-1.5" onClick={() => setModal({ kind: "job", machine: sel })}>+ Ажил бүртгэх</button>
            </div>
          </div>
          <table className="w-full min-w-[680px]">
            <thead><tr>
              <th className="th">Огноо</th><th className="th">Юу</th><th className="th">Хэн / Хаана</th>
              <th className="th text-right">Дүн</th><th className="th">Хэлбэр</th>
            </tr></thead>
            <tbody>
              {sel.logs.map((l: any) => (
                <tr key={l.id}>
                  <td className="td">{l.date}</td>
                  <td className="td">
                    {l.entry === "job"
                      ? <span className={l.label === "Дотоод ажил" ? "pill-grey" : "pill-blue"}>{l.label}</span>
                      : <span className="pill-red">{l.label}</span>}
                  </td>
                  <td className="td text-t2">{l.client || "—"}</td>
                  <td className="td text-right tabular-nums">
                    <b className={l.entry === "job" ? "text-money" : "text-danger"}>
                      {l.entry === "job" ? "+" : "−"}{money(l.amount)}
                    </b>
                  </td>
                  <td className="td">
                    {l.entry === "job" && l.method === "BARTER" && <span className="pill-violet">Бартер</span>}
                    {l.entry === "job" && l.method === "CASH" && <span className="pill-green">Бэлэн</span>}
                    {l.entry === "job" && l.method === "BANK" && <span className="pill-blue">Данс</span>}
                    {l.entry === "job" && l.method === "INTERNAL" && <span className="pill-grey">Дотоод</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal?.kind === "job" || modal?.kind === "expense") && (
        <LogModal kind={modal.kind} m={modal.machine} onClose={() => setModal(null)}
                  onDone={() => { setModal(null); load(); }} />
      )}
      {modal?.kind === "add" && <AddMachineModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
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
                   onChange={(e) => setF({ ...f, client: e.target.value })} /></div>
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

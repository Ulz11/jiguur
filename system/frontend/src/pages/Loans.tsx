import { Fragment, useEffect, useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, Modal, useToast, Empty, InlineEdit, Receipt } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);

export default function Loans() {
  const [d, setD] = useState<any>(null);
  const [modal, setModal] = useState<any>(null); // {kind:'pay'|'add', loan?}
  const [open, setOpen] = useState<number | null>(null);
  const toast = useToast();

  const load = () => api("/api/loans").then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;
  const s = d.summary;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Зээл / Өглөг</h1>
          <p className="text-t2 text-[13.5px] mt-0.5">Банк + хувь зээлдүүлэгч — үлдэгдэл, сарын хүү, дараагийн төлөлт.</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ kind: "add" })}>+ Шинэ зээл</button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 max-sm:grid-cols-1">
        <div className="card hero p-5">
          <div className="text-[12.5px] text-white/60 font-medium mb-2">Нийт өглөг</div>
          <div className="text-[26px] font-extrabold text-white tabular-nums leading-tight">{sayaFmt(s.total_debt)}₮</div>
          <div className="mt-2"><span className="pill bg-white/10 text-white/80">{s.active_count} идэвхтэй зээл</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Сарын хүүгийн дарамт</div>
          <div className="text-[26px] font-extrabold text-danger tabular-nums leading-tight">{sayaFmt(s.monthly_burden)}₮</div>
          <div className="mt-2"><span className="pill-red">сар бүр</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хамгийн ойрын төлөлт</div>
          {s.upcoming[0] ? (
            <>
              <div className="text-[26px] font-extrabold text-ink tabular-nums leading-tight">{sayaFmt(s.upcoming[0].amount)}₮</div>
              <div className="mt-2"><span className="pill-amber">{s.upcoming[0].due} · {s.upcoming[0].name}</span></div>
            </>
          ) : <div className="text-t3">—</div>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr>
            <th className="th">Зээлдүүлэгч</th><th className="th text-right">Үндсэн дүн</th>
            <th className="th text-right">Үлдэгдэл</th><th className="th text-right">Хүү %/сар</th>
            <th className="th text-right">Сарын төлбөр</th><th className="th">Дараагийн</th>
            <th className="th text-right">Төлсөн хүү</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {d.loans.map((l: any) => (
              <Fragment key={l.id}>
                <tr className="cursor-pointer hover:bg-canvas transition"
                    onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td className="td">
                    <span className="font-bold text-ink">{l.name}</span>
                    <span className="block text-xs text-t3">
                      {l.kind === "bank" ? "Банк" : l.kind === "private" ? "Хувь" : "Кредит"} · {l.start_date}-с
                      {l.status === "closed" && " · хаагдсан"}
                    </span>
                  </td>
                  <td className="td text-right tabular-nums">{sayaFmt(l.principal)}₮</td>
                  <td className="td text-right tabular-nums font-bold text-ink">{sayaFmt(l.balance)}₮</td>
                  <td className="td text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                    {l.status === "active" ? (
                      <InlineEdit type="number" value={l.monthly_rate} suffix="%" width="w-16" right
                        confirmText="Хүү солих уу?"
                        onSave={async (v) => {
                          await api(`/api/loans/${l.id}`, { method: "PATCH",
                            body: JSON.stringify({ monthly_rate: parseFloat(v) || 0 }) });
                          toast("Хүү шинэчлэгдлээ — сарын төлбөр дагаж өөрчлөгдөнө");
                          load();
                        }} />
                    ) : `${l.monthly_rate}%`}
                  </td>
                  <td className="td text-right tabular-nums font-bold text-danger">{sayaFmt(l.monthly_due)}₮</td>
                  <td className="td">{l.status === "active" ? <span className="pill-amber">{l.next_due}</span> : <span className="pill-grey">—</span>}</td>
                  <td className="td text-right tabular-nums text-t2">{sayaFmt(l.interest_paid)}₮</td>
                  <td className="td">
                    {l.status === "active" && (
                      <button className="btn-ghost !min-h-8 !py-1 !px-2 text-[12.5px] text-money"
                              onClick={(e) => { e.stopPropagation(); setModal({ kind: "pay", loan: l }); }}>Төлөлт</button>
                    )}
                  </td>
                </tr>
                {open === l.id && (
                  <tr><td colSpan={8} className="td !bg-canvas">
                    {l.payments.length === 0 ? <span className="text-t3 text-[13px]">Төлөлт бүртгэгдээгүй.</span> : (
                      <div className="flex flex-col gap-1.5">
                        {l.payments.map((p: any) => (
                          <div key={p.id} className="flex gap-4 text-[13px]">
                            <span className="text-t3 w-24">{p.date}</span>
                            <b className="tabular-nums w-32 text-right">{money(p.amount)}</b>
                            <span className={p.part === "interest" ? "pill-amber !text-[10.5px]" : "pill-green !text-[10.5px]"}>
                              {p.part === "interest" ? "Хүү" : "Үндсэн"}
                            </span>
                            <span className="text-t2">{p.note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {d.loans.length === 0 && <Empty title="Зээл алга" />}
      </div>

      {modal?.kind === "pay" && <PayLoanModal l={modal.loan} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === "add" && <AddLoanModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}

function PayLoanModal({ l, onClose, onDone }: any) {
  const toast = useToast();
  const [f, setF] = useState({ date: today(), amount: String(l.monthly_due), part: "interest", note: "" });
  const amt = parseFloat(f.amount.replace(/,/g, "")) || 0;
  return (
    <Modal title={`Төлөлт — ${l.name}`} onClose={onClose}>
      <div className="flex gap-2 mb-4">
        {[["interest", "Хүү"], ["principal", "Үндсэн дүн"]].map(([v, lb]) => (
          <button key={v} onClick={() => setF({ ...f, part: v, amount: v === "interest" ? String(l.monthly_due) : "" })}
            className={`flex-1 rounded-[10px] border py-2.5 font-semibold text-sm min-h-11 transition ${
              f.part === v ? "border-brand bg-brand-50 text-brand" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl">Огноо</label>
          <input type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl">Дүн ₮</label>
          <input className="inp" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl">Тэмдэглэл</label>
        <input className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      {amt > 0 && (
        <div className="mt-3.5">
          {f.part === "principal" ? (
            <Receipt
              rows={[
                { label: "Одоогийн үлдэгдэл", value: money(l.balance) },
                { label: "Үндсэн төлбөр", value: "−" + money(amt), accent: "money" },
                { label: "Шинэ сарын хүү", value: money((l.balance - amt) * l.monthly_rate / 100), accent: "money" },
              ]}
              total={{ label: "Шинэ үлдэгдэл", value: money(l.balance - amt) }} />
          ) : (
            <Receipt
              rows={[
                { label: `Сарын хүү (${l.monthly_rate}% × үлдэгдэл)`, value: money(l.monthly_due), accent: "dim" },
                { label: "Үлдэгдэл өөрчлөгдөхгүй", value: sayaFmt(l.balance) + "₮", accent: "dim" },
              ]}
              total={{ label: "Төлөх хүү", value: money(amt) }} />
          )}
        </div>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary !bg-money" disabled={!amt} onClick={async () => {
          try {
            await api(`/api/loans/${l.id}/payments`, { method: "POST",
              body: JSON.stringify({ date: f.date, amount: amt, part: f.part, note: f.note }) });
            toast("Төлөлт бүртгэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</button>
      </div>
    </Modal>
  );
}

function AddLoanModal({ onClose, onDone }: any) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", kind: "bank", principal: "", monthly_rate: "", start_date: today(), note: "" });
  return (
    <Modal title="Шинэ зээл бүртгэх" onClose={onClose}>
      <label className="lbl">Зээлдүүлэгч *</label>
      <input className="inp mb-3.5" value={f.name} placeholder="ж: Хаан банк — шугам №3" autoFocus
             onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="flex gap-2 mb-3.5">
        {[["bank", "Банк"], ["private", "Хувь хүн"], ["credit", "Кредит"]].map(([v, lb]) => (
          <button key={v} onClick={() => setF({ ...f, kind: v })}
            className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
              f.kind === v ? "border-brand bg-brand-50 text-brand" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
        <div><label className="lbl">Үндсэн дүн ₮ *</label>
          <input className="inp" inputMode="numeric" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></div>
        <div><label className="lbl">Сарын хүү % *</label>
          <input className="inp" inputMode="decimal" value={f.monthly_rate} onChange={(e) => setF({ ...f, monthly_rate: e.target.value })} /></div>
        <div><label className="lbl">Эхэлсэн огноо</label>
          <input type="date" className="inp" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl">Тэмдэглэл</label>
        <input className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={!f.name.trim() || !+f.principal.replace(/,/g, "")} onClick={async () => {
          try {
            await api("/api/loans", { method: "POST", body: JSON.stringify({
              ...f, principal: +f.principal.replace(/,/g, ""), monthly_rate: +f.monthly_rate || 0 }) });
            toast("Зээл бүртгэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</button>
      </div>
    </Modal>
  );
}

import { Fragment, useEffect, useId, useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, Modal, useToast, Empty, InlineEdit, Receipt, ConfirmModal } from "../ui";
import { parseMoney } from "../lib/num";
import { rowClickProps } from "../lib/rowClick";

const today = () => new Date().toISOString().slice(0, 10);
const kindLabel = (k: string) => (k === "bank" ? "Банк" : k === "private" ? "Хувь" : "Кредит");

export default function Loans() {
  const [d, setD] = useState<any>(null);
  const [modal, setModal] = useState<any>(null); // {kind:'pay'|'add', loan?}
  const [open, setOpen] = useState<number | null>(null);
  // Уугуул confirm() биш — системийн бусад мөнгөн үйлдэлтэй ижил Modal + Receipt
  const [ask, setAsk] = useState<any>(null);     // {kind:'del'|'status', loan, payment?}
  const toast = useToast();

  const load = () => api("/api/loans").then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);

  // Inline засвар: амжилтгүй бол алдааг toast-оор гаргаж, InlineEdit-д дахин throw хийнэ
  // (тэгснээр edit горимоос гарахгүй).
  const doPatch = async (url: string, body: any, msg: string) => {
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(body) });
      toast(msg); load();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  };
  const savePay = (l: any, p: any, body: any, msg = "Төлөлт шинэчлэгдлээ") =>
    doPatch(`/api/loans/${l.id}/payments/${p.id}`,
      { date: p.date, amount: p.amount, part: p.part, note: p.note, ...body }, msg);
  const delPay = async (l: any, p: any) => {
    try {
      await api(`/api/loans/${l.id}/payments/${p.id}`, { method: "DELETE" });
      toast("Төлөлт устгагдлаа"); setAsk(null); load();
    } catch (e: any) { toast(e.message, "err"); }
  };
  const toggleStatus = async (l: any) => {
    const closing = l.status === "active";
    try {
      await api(`/api/loans/${l.id}`, { method: "PATCH",
        body: JSON.stringify({ status: closing ? "closed" : "active" }) });
      toast(closing ? "Зээл хаагдлаа" : "Зээл сэргээгдлээ"); setAsk(null); load();
    } catch (e: any) { toast(e.message, "err"); }
  };

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
          <div className="text-[12.5px] text-white/80 font-medium mb-2">Нийт өглөг</div>
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
                    aria-expanded={open === l.id}
                    {...rowClickProps(() => setOpen(open === l.id ? null : l.id),
                                      `${l.name} — төлөлтийн түүхийг ${open === l.id ? "хаах" : "нээх"}`,
                                      "row")}>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <InlineEdit value={l.name} width="w-44" confirmText="Нэр солих уу?"
                        onSave={(v) => doPatch(`/api/loans/${l.id}`, { name: v }, "Нэр шинэчлэгдлээ")} />
                      {l.status === "closed" && <span className="pill-grey">хаагдсан</span>}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-t3 mt-0.5">
                      <InlineEdit value={l.kind} display={kindLabel(l.kind)} width="w-24"
                        options={[["bank", "Банк"], ["private", "Хувь"], ["credit", "Кредит"]]}
                        confirmText="Төрөл солих уу?"
                        onSave={(v) => doPatch(`/api/loans/${l.id}`, { kind: v }, "Төрөл шинэчлэгдлээ")} />
                      <span>·</span>
                      <InlineEdit type="date" value={l.start_date} display={`${l.start_date}-с`} width="w-36"
                        confirmText="Огноо солих уу?"
                        onSave={(v) => doPatch(`/api/loans/${l.id}`, { start_date: v }, "Эхэлсэн огноо шинэчлэгдлээ")} />
                    </span>
                  </td>
                  <td className="td text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                    <InlineEdit type="number" value={l.principal} display={sayaFmt(l.principal) + "₮"}
                      width="w-28" right confirmText="Үндсэн дүн солих уу?"
                      onSave={(v) => doPatch(`/api/loans/${l.id}`,
                        { principal: parseMoney(v) },
                        "Үндсэн дүн шинэчлэгдлээ — үлдэгдэл, сарын төлбөр дагаж өөрчлөгдөнө")} />
                  </td>
                  <td className="td text-right tabular-nums font-bold text-ink">{sayaFmt(l.balance)}₮</td>
                  <td className="td text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                    <InlineEdit type="number" value={l.monthly_rate} suffix="%" width="w-16" right
                      confirmText="Хүү солих уу?"
                      onSave={(v) => doPatch(`/api/loans/${l.id}`, { monthly_rate: parseMoney(v) },
                        "Хүү шинэчлэгдлээ — сарын төлбөр дагаж өөрчлөгдөнө")} />
                  </td>
                  <td className="td text-right tabular-nums font-bold text-danger">{sayaFmt(l.monthly_due)}₮</td>
                  <td className="td">{l.status === "active" ? <span className="pill-amber">{l.next_due}</span> : <span className="pill-grey">—</span>}</td>
                  <td className="td text-right tabular-nums text-t2">{sayaFmt(l.interest_paid)}₮</td>
                  <td className="td">
                    {l.status === "active" && (
                      <button className="btn-ghost btn-row text-money"
                              onClick={(e) => { e.stopPropagation(); setModal({ kind: "pay", loan: l }); }}>Төлөлт</button>
                    )}
                  </td>
                </tr>
                {open === l.id && (
                  <tr><td colSpan={8} className="td !bg-canvas">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap"
                           onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 text-[13px]">
                          <span className="text-t3">Тэмдэглэл:</span>
                          <InlineEdit value={l.note} display={l.note || "нэмэх…"} width="w-72"
                            confirmText="Хадгалах уу?"
                            onSave={(v) => doPatch(`/api/loans/${l.id}`, { note: v }, "Тэмдэглэл шинэчлэгдлээ")} />
                        </div>
                        <button className="btn-ghost btn-row"
                                onClick={() => setAsk({ kind: "status", loan: l })}>
                          {l.status === "active" ? "Хаах" : "Сэргээх"}
                        </button>
                      </div>
                      {l.payments.length === 0 ? <span className="text-t3 text-[13px]">Төлөлт бүртгэгдээгүй.</span> : (
                        <div className="flex flex-col gap-1.5">
                          {l.payments.map((p: any) => (
                            <div key={p.id} className="flex items-center gap-3 text-[13px]"
                                 onClick={(e) => e.stopPropagation()}>
                              <InlineEdit type="date" value={p.date} display={p.date} width="w-32"
                                confirmText="Огноо солих уу?"
                                onSave={(v) => savePay(l, p, { date: v })} />
                              <InlineEdit type="number" right value={p.amount} display={money(p.amount)} width="w-28"
                                confirmText="Дүн солих уу?"
                                onSave={(v) => savePay(l, p, { amount: parseMoney(v) })} />
                              <InlineEdit value={p.part} display={p.part === "interest" ? "Хүү" : "Үндсэн"}
                                options={[["interest", "Хүү"], ["principal", "Үндсэн"]]} width="w-24"
                                confirmText="Төрөл солих уу?"
                                onSave={(v) => savePay(l, p, { part: v })} />
                              <InlineEdit value={p.note} display={p.note || "тэмдэглэл…"} width="w-40"
                                confirmText="Хадгалах уу?"
                                onSave={(v) => savePay(l, p, { note: v })} />
                              <button className="w-7 h-7 rounded-lg bg-danger-50 text-danger shrink-0 ml-auto"
                                      title="Устгах"
                                      onClick={() => setAsk({ kind: "del", loan: l, payment: p })}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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

      {ask?.kind === "del" && (
        <ConfirmModal
          title="Төлөлт устгах"
          intro={<><b className="text-ink">{ask.loan.name}</b> — устгасан төлөлт сэргэхгүй. Зээлийн
                  үлдэгдэл, төлсөн хүү дагаж дахин бодогдоно.</>}
          rows={[
            { label: "Огноо", value: ask.payment.date },
            { label: ask.payment.part === "interest" ? "Хүүгийн төлөлт" : "Үндсэн төлөлт",
              value: money(ask.payment.amount), accent: "danger" },
          ]}
          total={{ label: "Устгасны дараа үлдэгдэл",
                   value: sayaFmt(ask.payment.part === "principal"
                            ? ask.loan.balance + ask.payment.amount : ask.loan.balance) + "₮" }}
          confirmLabel="Устгах" danger
          onClose={() => setAsk(null)}
          onConfirm={() => delPay(ask.loan, ask.payment)} />
      )}
      {ask?.kind === "status" && (() => {
        const closing = ask.loan.status === "active";
        return (
          <ConfirmModal
            title={closing ? "Зээл хаах" : "Зээл сэргээх"}
            intro={<><b className="text-ink">{ask.loan.name}</b> — {closing
              ? "хаасны дараа сарын хүүгийн дарамт болон ойрын төлөлтөөс хасагдана."
              : "сэргээсний дараа сарын хүү дахин тооцогдож эхэлнэ."}</>}
            rows={[
              { label: "Үлдэгдэл", value: sayaFmt(ask.loan.balance) + "₮" },
              { label: `Сарын хүү (${ask.loan.monthly_rate}%)`, value: money(ask.loan.monthly_due),
                accent: closing ? "money" : "danger" },
            ]}
            total={{ label: closing ? "Сарын дарамтаас хасагдана" : "Сарын дарамтад нэмэгдэнэ",
                     value: (closing ? "−" : "+") + money(ask.loan.monthly_due),
                     accent: closing ? "money" : "danger" }}
            confirmLabel={closing ? "Хаах" : "Сэргээх"} danger={closing}
            onClose={() => setAsk(null)}
            onConfirm={() => toggleStatus(ask.loan)} />
        );
      })()}
    </div>
  );
}

function PayLoanModal({ l, onClose, onDone }: any) {
  const toast = useToast();
  const [f, setF] = useState({ date: today(), amount: String(l.monthly_due), part: "interest", note: "" });
  const amt = parseMoney(f.amount);
  const uid = useId();
  return (
    <Modal title={`Төлөлт — ${l.name}`} onClose={onClose}>
      {/* Хүү/Үндсэн дүн нь ЮУГ төлж байгааг сонгодог — бүлгээ нэрлэнэ */}
      <div className="lbl" id={`${uid}-part`}>Юуг төлөх вэ</div>
      <div className="flex gap-2 mb-4" role="group" aria-labelledby={`${uid}-part`}>
        {[["interest", "Хүү"], ["principal", "Үндсэн дүн"]].map(([v, lb]) => (
          <button key={v} aria-pressed={f.part === v}
            onClick={() => setF({ ...f, part: v, amount: v === "interest" ? String(l.monthly_due) : "" })}
            className={`flex-1 rounded-[10px] border py-2.5 font-semibold text-sm min-h-11 transition ${
              f.part === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amt`}>Дүн ₮</label>
          <input id={`${uid}-amt`} className="inp" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
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
  const uid = useId();
  return (
    <Modal title="Шинэ зээл бүртгэх" onClose={onClose}>
      <label className="lbl" htmlFor={`${uid}-name`}>Зээлдүүлэгч *</label>
      <input id={`${uid}-name`} className="inp mb-3.5" value={f.name} placeholder="ж: Хаан банк — шугам №3" autoFocus
             onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="lbl" id={`${uid}-kind`}>Зээлийн төрөл</div>
      <div className="flex gap-2 mb-3.5" role="group" aria-labelledby={`${uid}-kind`}>
        {[["bank", "Банк"], ["private", "Хувь хүн"], ["credit", "Кредит"]].map(([v, lb]) => (
          <button key={v} onClick={() => setF({ ...f, kind: v })} aria-pressed={f.kind === v}
            className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
              f.kind === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
        <div><label className="lbl" htmlFor={`${uid}-principal`}>Үндсэн дүн ₮ *</label>
          <input id={`${uid}-principal`} className="inp" inputMode="numeric" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-rate`}>Сарын хүү % *</label>
          <input id={`${uid}-rate`} className="inp" inputMode="decimal" value={f.monthly_rate} onChange={(e) => setF({ ...f, monthly_rate: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-start`}>Эхэлсэн огноо</label>
          <input id={`${uid}-start`} type="date" className="inp" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={!f.name.trim() || !parseMoney(f.principal)} onClick={async () => {
          try {
            await api("/api/loans", { method: "POST", body: JSON.stringify({
              ...f, principal: parseMoney(f.principal), monthly_rate: parseMoney(f.monthly_rate) }) });
            toast("Зээл бүртгэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</button>
      </div>
    </Modal>
  );
}

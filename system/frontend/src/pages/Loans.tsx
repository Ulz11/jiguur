import { Fragment, useEffect, useId, useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty, InlineEdit, Receipt, ConfirmModal } from "../ui";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { rowClickProps } from "../lib/rowClick";
import { partLabel, partSign, balanceAfterRemoving } from "../lib/loan";
import { todayIso } from "../lib/schedule";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
const kindLabel = (k: string) => (k === "bank" ? "Банк" : k === "private" ? "Хувь" : "Кредит");

export default function Loans() {
  const [d, setD] = useState<any>(null);
  const [modal, setModal] = useState<any>(null); // {kind:'pay'|'add'|'topup', loan?}
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
  const savePay = (l: any, p: any, body: any, msg?: string) =>
    doPatch(`/api/loans/${l.id}/payments/${p.id}`,
      { date: p.date, amount: p.amount, part: p.part, note: p.note, ...body },
      msg ?? (p.part === "topup" ? "Нэмэлт олголт шинэчлэгдлээ" : "Төлөлт шинэчлэгдлээ"));
  const delPay = async (l: any, p: any) => {
    try {
      await api(`/api/loans/${l.id}/payments/${p.id}`, { method: "DELETE" });
      toast(p.part === "topup" ? "Нэмэлт олголт устгагдлаа" : "Төлөлт устгагдлаа");
      setAsk(null); load();
    } catch (e: any) { toast(e.message, "err"); setAsk(null); }
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
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ЗЭЭЛ / ӨГЛӨГ <span>•</span> {s.active_count} ИДЭВХТЭЙ</div>
          <h1 className="dashboard-title">Зээл / Өглөг</h1>
          <p className="dashboard-subtitle">Банк + хувь зээлдүүлэгч — үлдэгдэл, сарын хүү, дараагийн төлөлт.</p>
        </div>
        <button className="btn-primary command-action"
                onClick={() => setModal({ kind: "add" })}>+ Шинэ зээл</button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 max-sm:grid-cols-1">
        <div className="card hero p-5">
          <div className="text-[12.5px] text-white/80 font-medium mb-2">Нийт өглөг</div>
          {/* Дугуйлсан тоо нь харцанд, бүтэн тоо нь хулгана хүрэхэд */}
          <div className="text-[26px] font-extrabold text-white tabular-nums leading-tight"
               title={money(s.total_debt)}>{sayaFmt(s.total_debt)}₮</div>
          <div className="mt-2"><span className="pill bg-white/10 text-white/80">{s.active_count} идэвхтэй зээл</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Сарын хүүгийн дарамт</div>
          <div className="text-[26px] font-extrabold text-danger tabular-nums leading-tight"
               title={money(s.monthly_burden)}>{sayaFmt(s.monthly_burden)}₮</div>
          <div className="mt-2"><span className="pill-red">сар бүр</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хамгийн ойрын төлөлт</div>
          {s.upcoming[0] ? (
            <>
              <div className="text-[26px] font-extrabold text-ink tabular-nums leading-tight"
                   title={money(s.upcoming[0].amount)}>{sayaFmt(s.upcoming[0].amount)}₮</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="pill-amber">{s.upcoming[0].due} · {s.upcoming[0].name}</span>
                {/* Тохирсон дүн үү, эсвэл зөвхөн сарын хүү үү — тоо нь ЮУ болохыг хэлнэ */}
                <span className="pill-grey">{s.upcoming[0].planned ? "тохирсон төлөлт" : "сарын хүү"}</span>
              </div>
            </>
          ) : <div className="text-t3">—</div>}
        </div>
      </div>

      {/* ХОЁР ЖИЛИЙН ЗЭРЭГЦЭЭ ТОО НЭГ МӨРӨНД БАГТАНА.
          Өмнө нь есөн багана (1020px) байсны дөрөв нь ойролцоо утгатай:
          «Хүү %/сар · Сарын хүү · Сарын төлөлт · Төлсөн хүү». Мөр бүр 124–160px
          өндөр болж (нэр гурван мөр, огноо гурван мөр нугалаад) Отгоогийн
          1366×768 дэлгэцэнд хоёр хагас зээл багтдаг байв.
            · Хүүгийн ХУВЬ нь бодогдсон Сарын хүүгийнхээ дэргэд нэг нүдэнд орлоо
              («4.8 сая₮ 1.6%/сар») — тоо ба түүнийг гаргасан хувь зэрэгцэнэ.
            · Төлсөн хүү, Эхэлсэн огноо нь ХУРИМТЛАЛ/ЛАВЛАГАА болохоос өдөр
              тутмын шийдвэрийн тоо биш — мөрөө задлахад доор гарна.
          Мөр бүр НЭГ мөр өндөртэй: 36px (хүрэх талбайн доод шат) + 2×14px. */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead><tr>
            <th className="th">Зээлдүүлэгч</th><th className="th text-right">Үндсэн дүн</th>
            <th className="th text-right">Үлдэгдэл</th>
            <th className="th text-right">Сарын хүү</th><th className="th text-right">Сарын төлөлт</th>
            <th className="th">Дараагийн</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {d.loans.map((l: any) => (
              <Fragment key={l.id}>
                <tr className="cursor-pointer hover:bg-canvas transition"
                    aria-expanded={open === l.id}
                    {...rowClickProps(() => setOpen(open === l.id ? null : l.id),
                                      `${l.name} — төлөлтийн түүхийг ${open === l.id ? "хаах" : "нээх"}`,
                                      "row")}>
                  <td className="td whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <span className="flex items-center gap-1.5">
                      <InlineEdit label="Зээлдүүлэгч" value={l.name} width="w-44" confirmText="Нэр солих уу?"
                        onSave={(v) => doPatch(`/api/loans/${l.id}`, { name: v }, "Нэр шинэчлэгдлээ")} />
                      {l.status === "closed" && <span className="pill-grey">хаагдсан</span>}
                    </span>
                  </td>
                  <td className="td text-right tabular-nums whitespace-nowrap" title={money(l.principal)}
                      onClick={(e) => e.stopPropagation()}>
                    <InlineEdit type="number" label="Үндсэн дүн" value={l.principal} display={sayaFmt(l.principal) + "₮"}
                      width="w-28" right confirmText="Үндсэн дүн солих уу?"
                      onSave={(v) => doPatch(`/api/loans/${l.id}`,
                        { principal: parseMoney(v) },
                        "Үндсэн дүн шинэчлэгдлээ — үлдэгдэл, сарын төлбөр дагаж өөрчлөгдөнө")} />
                  </td>
                  <td className="td text-right tabular-nums font-bold text-ink whitespace-nowrap" title={money(l.balance)}>
                    {sayaFmt(l.balance)}₮
                    {/* Үлдэгдэл нь үндсэн дүнгээс их байвал ЯАГААД гэдгийг мөр дээрээ хэлнэ */}
                    {l.topup_total > 0 && (
                      <span className="block text-[11.5px] font-medium text-warn"
                            title={`Нэмэлт олголт: ${money(l.topup_total)}`}>
                        +{sayaFmt(l.topup_total)}₮ олголт
                      </span>
                    )}
                  </td>
                  {/* Бодогдсон сарын хүү + түүнийг гаргасан ХУВЬ — нэг нүдэнд.
                      Тоо нь бодогддог, хувь нь засагдана: аль нь аль болохыг
                      хэмжээ, өнгө хоёр хэлнэ. */}
                  <td className="td text-right tabular-nums whitespace-nowrap" title={money(l.monthly_due)}
                      onClick={(e) => e.stopPropagation()}>
                    <span className="inline-flex items-center gap-2">
                      <b className="font-bold text-danger">{sayaFmt(l.monthly_due)}₮</b>
                      <span className="text-[12px] text-t3 font-medium">
                        <InlineEdit type="number" label="Хүүгийн хувь" value={l.monthly_rate} suffix="%/сар"
                          width="w-16" right confirmText="Хүү солих уу?"
                          onSave={(v) => doPatch(`/api/loans/${l.id}`, { monthly_rate: parseMoney(v) },
                            "Хүү шинэчлэгдлээ — сарын хүү дагаж өөрчлөгдөнө")} />
                      </span>
                    </span>
                  </td>
                  {/* Гэрээгээр тохирсон сарын төлөлт — бодогддог хүүгээс ТУСДАА тоо */}
                  <td className="td text-right tabular-nums whitespace-nowrap"
                      title={l.monthly_payment ? money(l.monthly_payment) : "Гэрээгээр тохирсон сарын төлөлт"}
                      onClick={(e) => e.stopPropagation()}>
                    <InlineEdit type="number" label="Сарын төлөлт" value={l.monthly_payment || ""}
                      display={l.monthly_payment ? sayaFmt(l.monthly_payment) + "₮" : "тохироогүй"}
                      width="w-28" right confirmText="Сарын төлөлт хадгалах уу?"
                      onSave={(v) => doPatch(`/api/loans/${l.id}`, { monthly_payment: parseMoney(v) },
                        "Сарын төлөлт шинэчлэгдлээ — ойрын төлөлт үүгээр харагдана")} />
                  </td>
                  <td className="td">{l.status === "active" ? <span className="pill-amber">{l.next_due}</span> : <span className="pill-grey">—</span>}</td>
                  <td className="td whitespace-nowrap">
                    {l.status === "active" && (
                      <span className="flex items-center gap-1 justify-end">
                        <button className="btn-ghost btn-row text-money"
                                onClick={(e) => { e.stopPropagation(); setModal({ kind: "pay", loan: l }); }}>Төлөлт</button>
                        <button className="btn-ghost btn-row"
                                onClick={(e) => { e.stopPropagation(); setModal({ kind: "topup", loan: l }); }}>+ Олголт</button>
                      </span>
                    )}
                  </td>
                </tr>
                {open === l.id && (
                  <tr><td colSpan={7} className="td !bg-canvas">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap"
                           onClick={(e) => e.stopPropagation()}>
                        {/* Мөрөөс буусан лавлагаа: төрөл (нэр нь ихэвчлэн өөрөө
                            хэлдэг), хэзээ эхэлсэн, хүүд өнөөдрийг хүртэл хэдийг
                            өгсөн. Гурвуулаа засагдах хэвээр. */}
                        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-[13px]">
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3">Төрөл:</span>
                            <InlineEdit label="Төрөл" value={l.kind} display={kindLabel(l.kind)} width="w-24"
                              options={[["bank", "Банк"], ["private", "Хувь"], ["credit", "Кредит"]]}
                              confirmText="Төрөл солих уу?"
                              onSave={(v) => doPatch(`/api/loans/${l.id}`, { kind: v }, "Төрөл шинэчлэгдлээ")} />
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3">Эхэлсэн:</span>
                            <InlineEdit type="date" label="Эхэлсэн огноо" value={l.start_date}
                              display={l.start_date} width="w-36" confirmText="Огноо солих уу?"
                              onSave={(v) => doPatch(`/api/loans/${l.id}`, { start_date: v }, "Эхэлсэн огноо шинэчлэгдлээ")} />
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3">Төлсөн хүү:</span>
                            <b className="tabular-nums text-ink" title={money(l.interest_paid)}>
                              {sayaFmt(l.interest_paid)}₮
                            </b>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3">Тэмдэглэл:</span>
                            <InlineEdit label="Тэмдэглэл" value={l.note} display={l.note || "нэмэх…"} width="w-72"
                              confirmText="Хадгалах уу?"
                              onSave={(v) => doPatch(`/api/loans/${l.id}`, { note: v }, "Тэмдэглэл шинэчлэгдлээ")} />
                          </span>
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
                              {/* Дөрвөн зогсоол дараалан «2026-03-01 · засах»,
                                  «450,000₮ · засах» гэж дуудагдвал уншигчаар
                                  ажилладаг хүн ЮУГ засаж байгаагаа мэдэхгүй. */}
                              <InlineEdit type="date" label="Мөрийн огноо" value={p.date} display={p.date} width="w-32"
                                confirmText="Огноо солих уу?"
                                onSave={(v) => savePay(l, p, { date: v })} />
                              {/* Олголт нь ТӨЛӨЛТ БИШ — тэмдэг ба өнгөөр нь тусад нь ялгана */}
                              <span className={p.part === "topup" ? "text-warn font-semibold" : ""}>
                                <InlineEdit type="number" right
                                  label={p.part === "topup" ? "Олголтын дүн" : "Төлөлтийн дүн"} value={p.amount}
                                  display={partSign(p.part) + money(p.amount)} width="w-28"
                                  confirmText="Дүн солих уу?"
                                  onSave={(v) => savePay(l, p, { amount: parseMoney(v) })} />
                              </span>
                              <InlineEdit label="Мөрийн төрөл" value={p.part}
                                display={partLabel(p.part)}
                                options={[["interest", "Хүү"], ["principal", "Үндсэн"], ["topup", "Нэмэлт олголт"]]}
                                width="w-32"
                                confirmText="Төрөл солих уу?"
                                onSave={(v) => savePay(l, p, { part: v })} />
                              <InlineEdit label={p.part === "topup" ? "Олголтын тэмдэглэл" : "Төлөлтийн тэмдэглэл"}
                                value={p.note}
                                display={p.note || "тэмдэглэл…"} width="w-40"
                                confirmText="Хадгалах уу?"
                                onSave={(v) => savePay(l, p, { note: v })} />
                              {/* 28px байсан — docs/UI-ЗАРЧИМ.md §4: дарагддаг юм
                                  36px-ээс намхан БАЙХГҮЙ (--target-sm) */}
                              <button className="w-9 h-9 rounded-lg bg-danger-50 text-danger shrink-0 ml-auto"
                                      title="Устгах"
                                      aria-label={`${p.date} · ${partLabel(p.part)} — устгах`}
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
      {modal?.kind === "topup" && <TopUpModal l={modal.loan} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === "add" && <AddLoanModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}

      {ask?.kind === "del" && (
        <ConfirmModal
          title={ask.payment.part === "topup" ? "Нэмэлт олголт устгах" : "Төлөлт устгах"}
          intro={<><b className="text-ink">{ask.loan.name}</b> — устгасан бичилт сэргэхгүй. Зээлийн
                  үлдэгдэл, төлсөн хүү дагаж дахин бодогдоно.</>}
          rows={[
            { label: "Огноо", value: ask.payment.date },
            { label: ask.payment.part === "interest" ? "Хүүгийн төлөлт"
                     : ask.payment.part === "topup" ? "Нэмэлт олголт" : "Үндсэн төлөлт",
              value: partSign(ask.payment.part) + money(ask.payment.amount), accent: "danger" },
          ]}
          total={{ label: "Устгасны дараа үлдэгдэл",
                   value: sayaFmt(balanceAfterRemoving(ask.loan.balance, ask.payment.part,
                                                       ask.payment.amount)) + "₮" }}
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
  // Санал болгосон сарын хүү = ЭХНИЙ утга. Түүнийг хөндөөгүй бол алдах юм алга.
  const f0 = { date: today(), amount: String(l.monthly_due), part: "interest", note: "" };
  const [f, setF] = useState(f0);
  const amt = parseMoney(f.amount);
  const uid = useId();
  return (
    <FormModal title={`Төлөлт — ${l.name}`} onClose={onClose} dirty={formDirty(f0, f)}>
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
        <SubmitButton className="btn-primary !bg-money" disabled={!amt} onSubmit={async () => {
          try {
            await api(`/api/loans/${l.id}/payments`, { method: "POST",
              body: JSON.stringify({ date: f.date, amount: amt, part: f.part, note: f.note }) });
            toast("Төлөлт бүртгэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

/** Нэмэлт олголт — НЭГ гэрээн дээр дахин авсан мөнгө. Төлөлт биш тул үлдэгдэл
 *  ӨСНӨ, сарын хүү нь өссөн үлдэгдлээрээ дараагийн сараас бодогдоно. */
function TopUpModal({ l, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { date: today(), amount: "", note: "" };
  const [f, setF] = useState(f0);
  const amt = parseMoney(f.amount);
  const uid = useId();
  return (
    <FormModal title={`Нэмэлт олголт — ${l.name}`} onClose={onClose} dirty={formDirty(f0, f)}>
      <p className="text-[13px] text-t2 mb-3.5">
        Энэ гэрээгээр ДАХИН авсан мөнгө. Үлдэгдэлд нэмэгдэж, сарын хүү шинэ үлдэгдлээр бодогдоно.
      </p>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date}
                 onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amt`}>Олгосон дүн ₮</label>
          <input id={`${uid}-amt`} className="inp" inputMode="numeric" autoFocus value={f.amount}
                 onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note} placeholder="ж: 2 дахь олголт"
               onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      {amt > 0 && (
        <div className="mt-3.5">
          <Receipt
            rows={[
              { label: "Одоогийн үлдэгдэл", value: money(l.balance) },
              { label: "Нэмэлт олголт", value: "+" + money(amt), accent: "danger" },
              { label: `Шинэ сарын хүү (${l.monthly_rate}%)`,
                value: money((l.balance + amt) * l.monthly_rate / 100), accent: "danger" },
            ]}
            total={{ label: "Шинэ үлдэгдэл", value: money(l.balance + amt) }} />
        </div>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!amt} onSubmit={async () => {
          try {
            await api(`/api/loans/${l.id}/payments`, { method: "POST",
              body: JSON.stringify({ date: f.date, amount: amt, part: "topup", note: f.note }) });
            toast("Нэмэлт олголт бүртгэгдлээ — үлдэгдэл нэмэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

function AddLoanModal({ onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { name: "", kind: "bank", principal: "", monthly_rate: "", start_date: today(),
               monthly_payment: "", note: "" };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    <FormModal title="Шинэ зээл бүртгэх" onClose={onClose} dirty={formDirty(f0, f)}>
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
      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        <div><label className="lbl" htmlFor={`${uid}-mpay`}>Сарын төлөлт ₮</label>
          <input id={`${uid}-mpay`} className="inp" inputMode="numeric" value={f.monthly_payment}
                 placeholder="тохирсон бол" onChange={(e) => setF({ ...f, monthly_payment: e.target.value })} />
          <span className="block text-[12px] text-t3 mt-1">Хоосон бол ойрын төлөлтөд сарын хүү харагдана</span></div>
        <div><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
          <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim() || !parseMoney(f.principal)} onSubmit={async () => {
          try {
            await api("/api/loans", { method: "POST", body: JSON.stringify({
              ...f, principal: parseMoney(f.principal), monthly_rate: parseMoney(f.monthly_rate),
              monthly_payment: parseMoney(f.monthly_payment) }) });
            toast("Зээл бүртгэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

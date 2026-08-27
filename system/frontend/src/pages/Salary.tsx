import { Fragment, useEffect, useId, useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, Modal, useToast, Empty, Receipt, ConfirmModal } from "../ui";
import { parseMoney } from "../lib/num";

const today = () => new Date().toISOString().slice(0, 10);
const TYPE_LABEL: Record<string, string> = { main: "Үндсэн", contract: "Гэрээт", daily: "Өдрийн" };

export default function Salary() {
  const [emps, setEmps] = useState<any[] | null>(null);
  const [runs, setRuns] = useState<any[] | null>(null);
  const [modal, setModal] = useState<any>(null); // {kind:'emp'|'run', emp?}
  const [open, setOpen] = useState<number | null>(null);
  const [payRun, setPayRun] = useState<any>(null); // олгохоор баталгаажуулж буй бодолт
  const toast = useToast();

  const load = () => {
    api("/api/salary/employees").then(setEmps).catch((e) => toast(e.message, "err"));
    api("/api/salary/runs").then(setRuns);
  };
  useEffect(load, []);
  if (!emps || !runs) return <Spinner />;

  const monthlyFund = emps.reduce((s, e) => s + (e.type === "daily" ? e.daily_rate * 22 : e.monthly_salary), 0);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Цалин</h1>
          <p className="text-t2 text-[13.5px] mt-0.5">Үндсэн ба гэрээт — сард 2 удаа (15/15), өдрийн ажилтан — ажилласан өдрөөр.</p>
        </div>
        <div className="flex gap-2.5">
          <button className="btn-secondary" onClick={() => setModal({ kind: "emp" })}>+ Ажилтан</button>
          <button className="btn-primary" onClick={() => setModal({ kind: "run" })}>Цалин бодох</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 max-sm:grid-cols-1">
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Идэвхтэй ажилтан</div>
          <div className="text-[26px] font-extrabold text-ink tabular-nums">{emps.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Сарын цалингийн сан (ойролцоо)</div>
          <div className="text-[26px] font-extrabold text-ink tabular-nums">{sayaFmt(monthlyFund)}₮</div>
          <span className="block text-[12px] text-t3 mt-1">өдрийнхийг 22 хоногоор тооцов</span>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Сүүлийн бодолт</div>
          {runs[0] ? (
            <>
              <div className="text-[26px] font-extrabold text-ink tabular-nums">{sayaFmt(runs[0].total_net)}₮</div>
              <span className={`mt-1 ${runs[0].paid ? "pill-green" : "pill-amber"}`}>
                {runs[0].period} · {runs[0].half}-р хагас · {runs[0].paid ? "олгосон" : "олгоогүй"}
              </span>
            </>
          ) : <div className="text-t3">—</div>}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.4fr] gap-4 max-lg:grid-cols-1 items-start">
        <div className="card overflow-x-auto">
          <h3 className="font-bold text-ink text-[15.5px] px-4 pt-4 pb-1">Ажилчид</h3>
          <table className="w-full min-w-[420px]">
            <thead><tr><th className="th">Нэр</th><th className="th">Төрөл</th>
              <th className="th text-right">Цалин / Өдрийн хөлс</th><th className="th">НДШ</th><th className="th"></th></tr></thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id}>
                  <td className="td"><b className="text-ink">{e.name}</b>
                    <span className="block text-xs text-t3">{e.role_title}</span></td>
                  <td className="td"><span className={e.type === "daily" ? "pill-amber" : "pill-blue"}>{TYPE_LABEL[e.type]}</span></td>
                  <td className="td text-right tabular-nums font-bold">
                    {e.type === "daily" ? `${money(e.daily_rate)}/өдөр` : money(e.monthly_salary)}
                  </td>
                  <td className="td">{e.ndsh ? <span className="pill-green">Тийм</span> : <span className="pill-grey">Үгүй</span>}</td>
                  <td className="td"><button className="btn-ghost btn-row"
                    onClick={() => setModal({ kind: "emp", emp: e })}>Засах</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {emps.length === 0 && <Empty title="Ажилтан бүртгэгдээгүй" />}
        </div>

        <div className="card overflow-x-auto">
          <h3 className="font-bold text-ink text-[15.5px] px-4 pt-4 pb-1">Бодолтууд</h3>
          <table className="w-full min-w-[480px]">
            <thead><tr><th className="th">Үе</th><th className="th text-right">Нийт</th>
              <th className="th text-right">НДШ</th><th className="th text-right">Гарт олгох</th>
              <th className="th">Төлөв</th><th className="th"></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer hover:bg-canvas" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="td"><b className="text-ink">{r.period}</b>
                      <span className="block text-xs text-t3">{r.half}-р хагас · {r.items.length} хүн</span></td>
                    <td className="td text-right tabular-nums">{money(r.total_base)}</td>
                    <td className="td text-right tabular-nums text-t2">{r.total_ndsh ? money(r.total_ndsh) : "—"}</td>
                    <td className="td text-right tabular-nums font-bold text-ink">{money(r.total_net)}</td>
                    <td className="td">{r.paid ? <span className="pill-green">Олгосон</span> : <span className="pill-amber">Олгоогүй</span>}</td>
                    <td className="td">
                      {!r.paid && (
                        <button className="btn-ghost btn-row text-money"
                          onClick={(ev) => { ev.stopPropagation(); setPayRun(r); }}>Олгох ✓</button>
                      )}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={6} className="td !bg-canvas">
                      {r.items.map((i: any) => (
                        <div key={i.id} className="flex gap-4 text-[13px] py-0.5">
                          <span className="w-40 text-ink font-semibold">{i.employee}</span>
                          <span className="tabular-nums w-28 text-right">{money(i.base)}</span>
                          {i.days > 0 && <span className="text-t3">{i.days} өдөр</span>}
                          {i.ndsh_amount > 0 && <span className="text-t2">НДШ −{money(i.ndsh_amount)}</span>}
                          <b className="tabular-nums ml-auto">{money(i.net)}</b>
                        </div>
                      ))}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <Empty title="Бодолт алга" sub="«Цалин бодох» товчоор эхний бодолтоо хийгээрэй." />}
        </div>
      </div>

      {modal?.kind === "emp" && <EmpModal e={modal.emp} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === "run" && <RunModal emps={emps} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {payRun && (
        <ConfirmModal
          title="Цалин олгох"
          intro={<><b className="text-ink">{payRun.period} · {payRun.half}-р хагас</b> — олгосон гэж
                  тэмдэглэхэд буцаагдахгүй.</>}
          rows={[
            { label: "Ажилтан", value: `${payRun.items.length} хүн` },
            { label: "Нийт цалин", value: money(payRun.total_base) },
            ...(payRun.total_ndsh > 0
              ? [{ label: "НДШ суутгал", value: "−" + money(payRun.total_ndsh), accent: "danger" as const }] : []),
          ]}
          total={{ label: "Гарт олгох нийт", value: money(payRun.total_net), accent: "money" }}
          note="Олгосны дараа зардалд тусна."
          confirmLabel="Олгох ✓"
          onClose={() => setPayRun(null)}
          onConfirm={async () => {
            try {
              await api(`/api/salary/runs/${payRun.id}/pay`, { method: "POST",
                body: JSON.stringify({ date: today() }) });
              toast("Олгосон гэж тэмдэглэгдлээ — зардалд тусна");
              setPayRun(null); load();
            } catch (e: any) { toast(e.message, "err"); }
          }} />
      )}
    </div>
  );
}

function EmpModal({ e, onClose, onDone }: any) {
  const toast = useToast();
  const [f, setF] = useState({
    name: e?.name || "", role_title: e?.role_title || "", type: e?.type || "main",
    monthly_salary: e ? String(e.monthly_salary) : "", daily_rate: e ? String(e.daily_rate) : "",
    ndsh: e?.ndsh || false,
  });
  const uid = useId();
  return (
    <Modal title={e ? "Ажилтан засах" : "Шинэ ажилтан"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-name`}>Нэр *</label>
          <input id={`${uid}-name`} className="inp" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} autoFocus /></div>
        <div><label className="lbl" htmlFor={`${uid}-role`}>Албан тушаал</label>
          <input id={`${uid}-role`} className="inp" value={f.role_title} onChange={(ev) => setF({ ...f, role_title: ev.target.value })} /></div>
      </div>
      <div className="lbl mt-3.5" id={`${uid}-type`}>Төрөл</div>
      <div className="flex gap-2 mb-3.5" role="group" aria-labelledby={`${uid}-type`}>
        {Object.entries(TYPE_LABEL).map(([v, lb]) => (
          <button key={v} onClick={() => setF({ ...f, type: v })} aria-pressed={f.type === v}
            className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
              f.type === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      {f.type === "daily" ? (
        <div><label className="lbl" htmlFor={`${uid}-daily`}>Өдрийн хөлс ₮</label>
          <input id={`${uid}-daily`} className="inp" inputMode="numeric" value={f.daily_rate}
                 onChange={(ev) => setF({ ...f, daily_rate: ev.target.value })} /></div>
      ) : (
        <div><label className="lbl" htmlFor={`${uid}-monthly`}>Сарын цалин ₮</label>
          <input id={`${uid}-monthly`} className="inp" inputMode="numeric" value={f.monthly_salary}
                 onChange={(ev) => setF({ ...f, monthly_salary: ev.target.value })} /></div>
      )}
      <label className="mt-4 flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" className="w-4.5 h-4.5" checked={f.ndsh}
               onChange={(ev) => setF({ ...f, ndsh: ev.target.checked })} />
        <span className="text-[13.5px] font-medium">НДШ суутгана (11.5%)</span>
      </label>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={!f.name.trim()} onClick={async () => {
          const body = { ...f, monthly_salary: parseMoney(f.monthly_salary),
                         daily_rate: parseMoney(f.daily_rate) };
          try {
            if (e) await api(`/api/salary/employees/${e.id}`, { method: "PUT", body: JSON.stringify(body) });
            else await api("/api/salary/employees", { method: "POST", body: JSON.stringify(body) });
            toast("Хадгалагдлаа");
            onDone();
          } catch (er: any) { toast(er.message, "err"); }
        }}>Хадгалах</button>
      </div>
    </Modal>
  );
}

function RunModal({ emps, onClose, onDone }: any) {
  const toast = useToast();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [half, setHalf] = useState(now.getDate() <= 15 ? 1 : 2);
  const [pct, setPct] = useState(11.5);
  useEffect(() => { api("/api/settings").then((s) => setPct(parseMoney(s.ndsh_percent) || 11.5)); }, []);
  const dailies = emps.filter((e: any) => e.type === "daily");
  const [days, setDays] = useState<Record<string, string>>(
    Object.fromEntries(dailies.map((e: any) => [String(e.id), ""])));
  const uid = useId();

  const fixed = emps.filter((e: any) => e.type !== "daily");
  const fixedBase = fixed.reduce((s: number, e: any) => s + e.monthly_salary / 2, 0);
  const dailyBase = dailies.reduce((s: number, e: any) => s + (+days[String(e.id)] || 0) * e.daily_rate, 0);
  const ndshAmt = fixed.reduce((s: number, e: any) => s + (e.ndsh ? (e.monthly_salary / 2) * pct / 100 : 0), 0)
    + dailies.reduce((s: number, e: any) => s + (e.ndsh ? (+days[String(e.id)] || 0) * e.daily_rate * pct / 100 : 0), 0);
  return (
    <Modal title="Цалин бодох" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3.5 mb-3.5">
        <div><label className="lbl" htmlFor={`${uid}-period`}>Сар</label>
          <input id={`${uid}-period`} type="month" className="inp" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
        <div><div className="lbl" id={`${uid}-half`}>Хагас</div>
          <div className="flex gap-2" role="group" aria-labelledby={`${uid}-half`}>
            {[1, 2].map((h) => (
              <button key={h} onClick={() => setHalf(h)} aria-pressed={half === h}
                className={`flex-1 rounded-[10px] border py-2.5 font-semibold text-sm min-h-[46px] transition ${
                  half === h ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{h}-р хагас</button>
            ))}
          </div></div>
      </div>
      {dailies.length > 0 && (
        <>
          {/* Мөр бүр өөр ажилтных — нэг `label` бүгдийг нь нэрлэж чадахгүй */}
          <div className="lbl">Өдрийн ажилчдын ажилласан өдөр (энэ хагаст)</div>
          {dailies.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 py-1.5">
              <span className="text-[13.5px] flex-1"><b className="text-ink">{e.name}</b>
                <span className="text-t3"> · {money(e.daily_rate)}/өдөр</span></span>
              <input type="number" min={0} max={16} className="inp !min-h-10 !py-2 w-24 text-right"
                     aria-label={`${e.name} — ажилласан өдрийн тоо`}
                     placeholder="0" value={days[String(e.id)]}
                     onChange={(ev) => setDays({ ...days, [String(e.id)]: ev.target.value })} />
            </div>
          ))}
        </>
      )}
      <Receipt className="mt-4"
        rows={[
          { label: `Үндсэн ба гэрээт (${fixed.length} хүн × цалингийн тал)`, value: money(fixedBase) },
          ...(dailyBase > 0 ? [{ label: "Өдрийн ажилчид", value: money(dailyBase) }] : []),
          { label: `НДШ суутгал (${pct}%)`, value: "−" + money(ndshAmt), accent: "danger" as const },
        ]}
        total={{ label: "Гарт олгох нийт (урьдчилсан)", value: money(fixedBase + dailyBase - ndshAmt) }} />
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" onClick={async () => {
          try {
            const dd = Object.fromEntries(Object.entries(days).filter(([, v]) => +v > 0).map(([k, v]) => [k, +v]));
            const r = await api("/api/salary/runs", { method: "POST",
              body: JSON.stringify({ period, half, daily_days: dd }) });
            toast(`Бодолт үүслээ — гарт олгох нийт ${money(r.total_net)}`);
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бодох</button>
      </div>
    </Modal>
  );
}

import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmt, money, sayaFmt, user } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty, Receipt,
         FinanceDisclosure, FinanceBlock, FinanceRow } from "../ui";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { clientHref } from "../lib/links";
import { todayIso } from "../lib/schedule";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
const TYPES = ["Машин", "Байр", "Материал", "Бусад"];

export default function Barter() {
  const [d, setD] = useState<any>(null);
  const [modal, setModal] = useState<any>(null); // {kind: 'sell'|'stock'|'edit'|'add', asset?}
  const toast = useToast();
  const u = user();

  const load = () => api("/api/barter").then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;

  const s = d.summary;
  const canSell = u?.role === "manager" || u?.role === "finance";
  /* ⚠ ЭНЭ ХУУДАС ӨМНӨ НЬ «ШИЙДВЭР ХҮЛЭЭЖ» БАЙВ (money-wall.spec-ийн ПИН):
     үйлдвэрийн дарга компанийн бартер хөрөнгийн НИЙТ ҮНЭ, зарсан дүн, олсон
     ашгийг планшет дээрээ бүтнээр хардаг байсан. Эзний шийдвэр гарлаа —
     нуухгүй, ЦЭГЦЛЭНЭ: түүний ажил (юу орж ирэв, хэдэн хоног хэвтэв, аль нь
     агуулахад орох вэ) мөрөндөө ил зогсоно; үнэ, ашиг нь доорх «Санхүү»
     задаргаанд, хумигдсан байдлаар. Худалдах эрх нь ХЭВЭЭР хаалттай
     (`canSell` — сервер ч мөн адил). */
  const seesMoney = u?.role !== "factory";

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">БАРТЕР <span>•</span> {d.assets.length} ХӨРӨНГӨ</div>
          <h1 className="dashboard-title">Бартер</h1>
          <p className="dashboard-subtitle">
            {seesMoney
              ? "Төлбөрт орж ирсэн хөрөнгө — орж ирсэн үнэ ↔ зарсан үнийн зөрүү тайланд шууд харагдана."
              : "Төлбөрт орж ирсэн хөрөнгө — хэд хоног хэвтэж байна, аль нь агуулахад орох вэ."}
          </p>
        </div>
        {canSell && (
          <button className="btn-primary command-action"
                  onClick={() => setModal({ kind: "add" })}>+ Хөрөнгө бүртгэх</button>
        )}
      </div>

      {seesMoney && (
      <div className="command-metrics mb-4">
        <div className="command-hero">
          <div className="text-white/80 text-[12.5px] font-medium mb-2">Хадгалагдаж буй хөрөнгө</div>
          <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight">
            {sayaFmt(s.held_value)} <span className="text-sm text-white/70 font-semibold">₮</span>
          </div>
          <div className="mt-2"><span className="pill bg-white/10 text-white/80">
            {s.held_count} хөрөнгө · дунджаар {s.avg_days_held} хоног</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Зогсонги (180+ хоног)</div>
          <div className={`text-[28px] font-extrabold tabular-nums leading-tight ${
            s.stale_count ? "text-danger" : "text-money"}`}>
            {sayaFmt(s.stale_value)} <span className="text-sm text-t2 font-semibold">₮</span>
          </div>
          <div className="mt-2">
            <span className={s.stale_count ? "pill-red" : "pill-green"}>
              {s.stale_count ? `${s.stale_count} хөрөнгө удаан хэвтэж байна` : "зогсонги хөрөнгө алга"}
            </span>
          </div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Зарагдсан нийт</div>
          <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">
            {sayaFmt(s.sold_value)} <span className="text-sm text-t2 font-semibold">₮</span></div>
          <div className="mt-2"><span className="pill-grey">{s.sold_count} хөрөнгө</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хэрэгжсэн ашиг / алдагдал</div>
          <div className={`text-[28px] font-extrabold tabular-nums leading-tight ${s.realized < 0 ? "text-danger" : "text-money"}`}>
            {s.realized > 0 ? "+" : ""}{sayaFmt(s.realized)} <span className="text-sm text-t2 font-semibold">₮</span>
          </div>
        </div>
      </div>
      )}

      {seesMoney && s.aging?.length > 0 && (
        <div className="card p-4 mb-4 flex gap-6 flex-wrap items-center">
          <b className="text-[13px] text-ink">Хэвтэж буй хугацаагаар:</b>
          {s.aging.map((b: any) => (
            <span key={b.bucket} className="text-[13px] text-t2" title={money(b.value)}>
              <b className={b.bucket.startsWith("181") || b.bucket === "365+" ? "text-danger" : "text-ink"}>
                {b.bucket} хоног
              </b>{" "}— {b.count}ш · {sayaFmt(b.value)}₮
            </span>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className={`w-full ${seesMoney ? "min-w-[860px]" : "min-w-[600px]"}`}>
          <thead><tr>
            <th className="th">Хөрөнгө</th><th className="th">Хэнээс</th>
            {seesMoney && (<>
              <th className="th text-right">Орж ирсэн үнэ</th><th className="th text-right">Санал үнэ</th>
            </>)}
            <th className="th">Хэвтсэн хугацаа</th>
            <th className="th">Төлөв</th>
            {seesMoney && <th className="th text-right">Зарсан / Ашиг·Алдагдал</th>}
            <th className="th"></th>
          </tr></thead>
          <tbody>
            {d.assets.map((a: any) => (
              <tr key={a.id}>
                <td className="td">
                  <span className="font-bold text-ink">{a.name}</span>
                  <span className="block text-xs text-t3">
                    <span className="pill-grey !py-0 mr-1.5">{a.type}</span>
                    {a.detail || ""} {a.date_in}-нд орж ирсэн
                  </span>
                </td>
                {/* «Хэнээс» нь ХАРИЛЦАГЧ — тэр хөрөнгө яагаад орж ирснийг
                    профайл дээрх нь түүхээс уншина. */}
                <td className="td text-t2">
                  {a.client_id
                    ? <Link to={clientHref(a.client_id)} className="text-ink hover:underline">{a.client}</Link>
                    : a.client || "—"}
                </td>
                {seesMoney && (<>
                  <td className="td text-right tabular-nums font-bold">{money(a.value_in)}</td>
                  <td className="td text-right tabular-nums">{a.asking_price ? money(a.asking_price) : "—"}</td>
                </>)}
                <td className="td">
                  {a.status === "held" ? (
                    <span className={a.days_held >= 365 ? "pill-red" : a.days_held >= 180 ? "pill-amber" : "pill-grey"}>
                      {a.days_held} хоног{a.stale && " ⚠"}
                    </span>
                  ) : <span className="text-t3 text-[12.5px]">—</span>}
                </td>
                <td className="td">
                  {/* «voided» = бартер ТӨЛБӨР нь хүчингүй болсон тул хамт
                      цуцлагдсан хөрөнгө. Мөр нь устдаггүй (энд ч устгал
                      байхгүй) — нийлбэр, зогсонгийн тооцоонд л орохоо болино. */}
                  {a.status === "held" ? <span className="pill-blue">Хадгалагдаж буй</span> :
                   a.status === "sold" ? <span className="pill-grey">Зарагдсан</span> :
                   a.status === "voided" ? <span className="pill-red">ХҮЧИНГҮЙ</span> :
                   <span className="pill-green">Нөөцөд орсон</span>}
                </td>
                {seesMoney && (
                <td className="td text-right tabular-nums">
                  {a.status === "sold" ? (
                    <>
                      <span className="font-bold text-ink">{money(a.sold_amount)}</span>
                      <span className={`block text-[12px] font-bold ${a.gain < 0 ? "text-danger" : "text-money"}`}>
                        {a.gain > 0 ? "+" : ""}{money(a.gain)}
                      </span>
                    </>
                  ) : "—"}
                </td>
                )}
                <td className="td">
                  {a.status === "held" && canSell && (
                    <div className="flex gap-1">
                      <button className="btn-ghost btn-row text-money"
                              onClick={() => setModal({ kind: "sell", asset: a })}>Зарах</button>
                      {a.type === "Материал" && (
                        <button className="btn-ghost btn-row"
                                onClick={() => setModal({ kind: "stock", asset: a })}>Нөөцөд</button>
                      )}
                      <button className="btn-ghost btn-row"
                              onClick={() => setModal({ kind: "edit", asset: a })}>Засах</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.assets.length === 0 && (
          <Empty title="Бартерын хөрөнгө алга"
                 sub="Бартер төлбөр бүртгэгдэхэд хөрөнгө энд автоматаар орж ирнэ." />
        )}
      </div>

      {/* САНХҮҮ — зөвхөн даргад, хөрөнгийн жагсаалтынх нь ХОЙНО. Хураангуй
          тоо нь «Хадгалагдаж буй хөрөнгө»: бартерын тухай асуултын гол хариу
          (хэдэн төгрөг зарагдалгүй хэвтэж байна вэ). */}
      {!seesMoney && (
        <FinanceDisclosure name="barter"
          summary={money(s.held_value)} summaryLabel="Хадгалагдаж буй хөрөнгө"
          hint="Хөрөнгө бүрийн орж ирсэн үнэ, зарсан дүн, ашиг/алдагдал — дарж дэлгэнэ.">
          <FinanceBlock title="Хураангуй">
            <FinanceRow label="Хадгалагдаж буй хөрөнгө" value={money(s.held_value)}
                        sub={`${s.held_count} хөрөнгө · дунджаар ${s.avg_days_held} хоног`} />
            <FinanceRow label="Зогсонги (180+ хоног)" value={money(s.stale_value)}
                        sub={s.stale_count ? `${s.stale_count} хөрөнгө удаан хэвтэж байна`
                                           : "зогсонги хөрөнгө алга"}
                        tone={s.stale_count ? "danger" : "money"} />
            <FinanceRow label="Зарагдсан нийт" value={money(s.sold_value)}
                        sub={`${s.sold_count} хөрөнгө`} />
            <FinanceRow label="Хэрэгжсэн ашиг / алдагдал"
                        value={(s.realized > 0 ? "+" : "") + money(s.realized)}
                        tone={s.realized < 0 ? "danger" : "money"} />
          </FinanceBlock>
          {d.assets.length > 0 && (
            <FinanceBlock title="Хөрөнгө бүрээр">
              <table className="w-full">
                <thead><tr>
                  <th className="th">Хөрөнгө</th>
                  <th className="th text-right">Орж ирсэн үнэ</th>
                  <th className="th text-right">Санал үнэ</th>
                  <th className="th text-right">Зарсан / Ашиг·Алдагдал</th>
                </tr></thead>
                <tbody>
                  {d.assets.map((a: any) => (
                    <tr key={a.id}>
                      <td className="td"><b className="text-ink">{a.name}</b>
                        <span className="block text-xs text-t3">{a.type} · {a.date_in}</span></td>
                      <td className="td text-right tabular-nums font-bold">{money(a.value_in)}</td>
                      <td className="td text-right tabular-nums">
                        {a.asking_price ? money(a.asking_price) : "—"}</td>
                      <td className="td text-right tabular-nums">
                        {a.status === "sold" ? (<>
                          <span className="font-bold text-ink">{money(a.sold_amount)}</span>
                          <span className={`block text-[12px] font-bold ${
                            a.gain < 0 ? "text-danger" : "text-money"}`}>
                            {a.gain > 0 ? "+" : ""}{money(a.gain)}</span>
                        </>) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FinanceBlock>
          )}
        </FinanceDisclosure>
      )}

      {modal?.kind === "sell" && <SellModal a={modal.asset} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === "stock" && <StockModal a={modal.asset} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {(modal?.kind === "add" || modal?.kind === "edit") && (
        <AssetModal a={modal.asset} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

function SellModal({ a, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { date: today(), amount: "", sold_to: "", note: "" };
  const [f, setF] = useState(f0);
  const amt = parseMoney(f.amount);
  const gain = amt ? amt - a.value_in : null;
  const uid = useId();
  return (
    <FormModal title={`Зарах — ${a.name}`} onClose={onClose} dirty={formDirty(f0, f)}>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amount`}>Зарсан үнэ ₮</label>
          <input id={`${uid}-amount`} className="inp" inputMode="numeric" placeholder="0" value={f.amount} autoFocus
                 onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-buyer`}>Худалдан авагч</label>
        <input id={`${uid}-buyer`} className="inp" value={f.sold_to} onChange={(e) => setF({ ...f, sold_to: e.target.value })} /></div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <div className="mt-4">
        {gain === null ? (
          <p className="text-[12.5px] text-t3">Зарах үнээ оруулмагц ашиг/алдагдал энд бодогдоно.</p>
        ) : (
          <Receipt
            rows={[
              { label: "Орж ирсэн (тохирсон) үнэ", value: money(a.value_in) },
              { label: "Зарах үнэ", value: money(amt) },
            ]}
            total={{ label: gain >= 0 ? "Хэрэгжих ашиг" : "Хэрэгжих алдагдал",
                     value: (gain >= 0 ? "+" : "") + money(gain),
                     accent: gain >= 0 ? "money" : "danger" }} />
        )}
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton className="btn-primary !bg-money" disabled={!amt} onSubmit={async () => {
          try {
            await api(`/api/barter/${a.id}/sell`, { method: "POST",
              body: JSON.stringify({ date: f.date, amount: amt, sold_to: f.sold_to, note: f.note }) });
            toast("Борлуулалт бүртгэгдлээ — ашиг/алдагдал тайланд тусав");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Зарах</SubmitButton>
      </div>
    </FormModal>
  );
}

function StockModal({ a, onClose, onDone }: any) {
  const toast = useToast();
  const [mats, setMats] = useState<any[] | null>(null);
  const f0 = { material_id: 0, grade_id: 0, qty: "" };
  const [f, setF] = useState(f0);
  const uid = useId();
  useEffect(() => { api("/api/materials").then(setMats); }, []);
  if (!mats) return null;
  const m = mats.find((x) => x.id === f.material_id);
  return (
    <FormModal title={`Нөөцөд оруулах — ${a.name}`} onClose={onClose} dirty={formDirty(f0, f)}>
      <label className="lbl" htmlFor={`${uid}-mat`}>Материал</label>
      <select id={`${uid}-mat`} className="inp mb-3.5" value={f.material_id}
              onChange={(e) => setF({ ...f, material_id: +e.target.value, grade_id: 0 })}>
        <option value={0}>Сонгох…</option>
        {mats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {m && (
        <>
          <label className="lbl" htmlFor={`${uid}-grade`}>Зэрэглэл</label>
          <select id={`${uid}-grade`} className="inp mb-3.5" value={f.grade_id} onChange={(e) => setF({ ...f, grade_id: +e.target.value })}>
            <option value={0}>Сонгох…</option>
            {m.prices.map((p: any) => <option key={p.grade_id} value={p.grade_id}>{p.grade}</option>)}
          </select>
        </>
      )}
      <label className="lbl" htmlFor={`${uid}-qty`}>Тоо ширхэг</label>
      <input id={`${uid}-qty`} type="number" className="inp mb-5" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
      <div className="flex justify-end gap-2.5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.material_id || !f.grade_id || !+f.qty} onSubmit={async () => {
          try {
            await api(`/api/barter/${a.id}/to-stock`, { method: "POST",
              body: JSON.stringify({ material_id: f.material_id, grade_id: f.grade_id, qty: +f.qty }) });
            toast("Агуулахын нөөцөд нэмэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Оруулах</SubmitButton>
      </div>
    </FormModal>
  );
}

function AssetModal({ a, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = {
    type: a?.type || "Машин", name: a?.name || "", detail: a?.detail || "",
    date_in: a?.date_in || today(), value_in: a ? String(a.value_in) : "",
    asking_price: a ? String(a.asking_price) : "", note: a?.note || "",
  };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    <FormModal title={a ? "Хөрөнгө засах" : "Хөрөнгө бүртгэх"} onClose={onClose} dirty={formDirty(f0, f)}>
      <div className="lbl" id={`${uid}-type`}>Төрөл</div>
      <div className="flex gap-2 mb-3.5" role="group" aria-labelledby={`${uid}-type`}>
        {TYPES.map((t) => (
          <button key={t} onClick={() => setF({ ...f, type: t })} aria-pressed={f.type === t}
            className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
              f.type === t ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{t}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2"><label className="lbl" htmlFor={`${uid}-name`}>Нэр *</label>
          <input id={`${uid}-name`} className="inp" placeholder="ж: Автомашин 1234УБА" value={f.name}
                 onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="col-span-2"><label className="lbl" htmlFor={`${uid}-detail`}>Дэлгэрэнгүй (дугаар, м², хаяг…)</label>
          <input id={`${uid}-detail`} className="inp" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-datein`}>Орж ирсэн огноо</label>
          <input id={`${uid}-datein`} type="date" className="inp" value={f.date_in} onChange={(e) => setF({ ...f, date_in: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-valuein`}>Орж ирсэн үнэ ₮ *</label>
          <input id={`${uid}-valuein`} className="inp" inputMode="numeric" value={f.value_in}
                 onChange={(e) => setF({ ...f, value_in: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-asking`}>Зарах санал үнэ ₮</label>
          <input id={`${uid}-asking`} className="inp" inputMode="numeric" value={f.asking_price}
                 onChange={(e) => setF({ ...f, asking_price: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
          <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim() || !parseMoney(f.value_in)} onSubmit={async () => {
          const body = { ...f, value_in: parseMoney(f.value_in), asking_price: parseMoney(f.asking_price) };
          try {
            if (a) await api(`/api/barter/${a.id}`, { method: "PUT", body: JSON.stringify(body) });
            else await api("/api/barter", { method: "POST", body: JSON.stringify(body) });
            toast("Хадгалагдлаа");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

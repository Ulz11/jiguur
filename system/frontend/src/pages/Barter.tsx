import { useEffect, useState } from "react";
import { api, fmt, money, sayaFmt, user } from "../api";
import { Spinner, Modal, useToast, Empty, Receipt } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);
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

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Бартер</h1>
          <p className="text-t2 text-[13.5px] mt-0.5">
            Төлбөрт орж ирсэн хөрөнгө — орж ирсэн үнэ ↔ зарсан үнийн зөрүү тайланд шууд харагдана.
          </p>
        </div>
        {canSell && <button className="btn-primary" onClick={() => setModal({ kind: "add" })}>+ Хөрөнгө бүртгэх</button>}
      </div>

      <div className="command-metrics mb-4">
        <div className="command-hero">
          <div className="text-white/60 text-[12.5px] font-medium mb-2">Хадгалагдаж буй хөрөнгө</div>
          <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight">
            {sayaFmt(s.held_value)} <span className="text-sm text-white/40 font-semibold">₮</span>
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

      {s.aging?.length > 0 && (
        <div className="card p-4 mb-4 flex gap-6 flex-wrap items-center">
          <b className="text-[13px] text-ink">Хэвтэж буй хугацаагаар:</b>
          {s.aging.map((b: any) => (
            <span key={b.bucket} className="text-[13px] text-t2">
              <b className={b.bucket.startsWith("181") || b.bucket === "365+" ? "text-danger" : "text-ink"}>
                {b.bucket} хоног
              </b>{" "}— {b.count}ш · {sayaFmt(b.value)}₮
            </span>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr>
            <th className="th">Хөрөнгө</th><th className="th">Хэнээс</th>
            <th className="th text-right">Орж ирсэн үнэ</th><th className="th text-right">Санал үнэ</th>
            <th className="th">Хэвтсэн хугацаа</th>
            <th className="th">Төлөв</th><th className="th text-right">Зарсан / Ашиг·Алдагдал</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {d.assets.map((a: any) => (
              <tr key={a.id}>
                <td className="td">
                  <span className="font-bold text-ink">{a.name}</span>
                  <span className="block text-xs text-t3">
                    <span className="pill-grey !text-[10px] !py-0 mr-1.5">{a.type}</span>
                    {a.detail || ""} {a.date_in}-нд орж ирсэн
                  </span>
                </td>
                <td className="td text-t2">{a.client || "—"}</td>
                <td className="td text-right tabular-nums font-bold">{money(a.value_in)}</td>
                <td className="td text-right tabular-nums">{a.asking_price ? money(a.asking_price) : "—"}</td>
                <td className="td">
                  {a.status === "held" ? (
                    <span className={a.days_held >= 365 ? "pill-red" : a.days_held >= 180 ? "pill-amber" : "pill-grey"}>
                      {a.days_held} хоног{a.stale && " ⚠"}
                    </span>
                  ) : <span className="text-t3 text-[12.5px]">—</span>}
                </td>
                <td className="td">
                  {a.status === "held" ? <span className="pill-blue">Хадгалагдаж буй</span> :
                   a.status === "sold" ? <span className="pill-grey">Зарагдсан</span> :
                   <span className="pill-green">Нөөцөд орсон</span>}
                </td>
                <td className="td text-right tabular-nums">
                  {a.status === "sold" ? (
                    <>
                      <span className="font-bold text-ink">{money(a.sold_amount)}</span>
                      <span className={`block text-[11.5px] font-bold ${a.gain < 0 ? "text-danger" : "text-money"}`}>
                        {a.gain > 0 ? "+" : ""}{money(a.gain)}
                      </span>
                    </>
                  ) : "—"}
                </td>
                <td className="td">
                  {a.status === "held" && canSell && (
                    <div className="flex gap-1">
                      <button className="btn-ghost !min-h-8 !py-1 !px-2 text-[12.5px] text-money"
                              onClick={() => setModal({ kind: "sell", asset: a })}>Зарах</button>
                      {a.type === "Материал" && (
                        <button className="btn-ghost !min-h-8 !py-1 !px-2 text-[12.5px]"
                                onClick={() => setModal({ kind: "stock", asset: a })}>Нөөцөд</button>
                      )}
                      <button className="btn-ghost !min-h-8 !py-1 !px-2 text-[12.5px]"
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
  const [f, setF] = useState({ date: today(), amount: "", sold_to: "", note: "" });
  const amt = parseFloat(f.amount.replace(/,/g, "")) || 0;
  const gain = amt ? amt - a.value_in : null;
  return (
    <Modal title={`Зарах — ${a.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl">Огноо</label>
          <input type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl">Зарсан үнэ ₮</label>
          <input className="inp" inputMode="numeric" placeholder="0" value={f.amount} autoFocus
                 onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl">Худалдан авагч</label>
        <input className="inp" value={f.sold_to} onChange={(e) => setF({ ...f, sold_to: e.target.value })} /></div>
      <div className="mt-3.5"><label className="lbl">Тэмдэглэл</label>
        <input className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
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
        <button className="btn-primary !bg-money" disabled={!amt} onClick={async () => {
          try {
            await api(`/api/barter/${a.id}/sell`, { method: "POST",
              body: JSON.stringify({ date: f.date, amount: amt, sold_to: f.sold_to, note: f.note }) });
            toast("Борлуулалт бүртгэгдлээ — ашиг/алдагдал тайланд тусав");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Зарах</button>
      </div>
    </Modal>
  );
}

function StockModal({ a, onClose, onDone }: any) {
  const toast = useToast();
  const [mats, setMats] = useState<any[] | null>(null);
  const [f, setF] = useState({ material_id: 0, grade_id: 0, qty: "" });
  useEffect(() => { api("/api/materials").then(setMats); }, []);
  if (!mats) return null;
  const m = mats.find((x) => x.id === f.material_id);
  return (
    <Modal title={`Нөөцөд оруулах — ${a.name}`} onClose={onClose}>
      <label className="lbl">Материал</label>
      <select className="inp mb-3.5" value={f.material_id}
              onChange={(e) => setF({ ...f, material_id: +e.target.value, grade_id: 0 })}>
        <option value={0}>Сонгох…</option>
        {mats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {m && (
        <>
          <label className="lbl">Зэрэглэл</label>
          <select className="inp mb-3.5" value={f.grade_id} onChange={(e) => setF({ ...f, grade_id: +e.target.value })}>
            <option value={0}>Сонгох…</option>
            {m.prices.map((p: any) => <option key={p.grade_id} value={p.grade_id}>{p.grade}</option>)}
          </select>
        </>
      )}
      <label className="lbl">Тоо ширхэг</label>
      <input type="number" className="inp mb-5" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
      <div className="flex justify-end gap-2.5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={!f.material_id || !f.grade_id || !+f.qty} onClick={async () => {
          try {
            await api(`/api/barter/${a.id}/to-stock`, { method: "POST",
              body: JSON.stringify({ material_id: f.material_id, grade_id: f.grade_id, qty: +f.qty }) });
            toast("Агуулахын нөөцөд нэмэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Оруулах</button>
      </div>
    </Modal>
  );
}

function AssetModal({ a, onClose, onDone }: any) {
  const toast = useToast();
  const [f, setF] = useState({
    type: a?.type || "Машин", name: a?.name || "", detail: a?.detail || "",
    date_in: a?.date_in || today(), value_in: a ? String(a.value_in) : "",
    asking_price: a ? String(a.asking_price) : "", note: a?.note || "",
  });
  return (
    <Modal title={a ? "Хөрөнгө засах" : "Хөрөнгө бүртгэх"} onClose={onClose}>
      <label className="lbl">Төрөл</label>
      <div className="flex gap-2 mb-3.5">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setF({ ...f, type: t })}
            className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
              f.type === t ? "border-brand bg-brand-50 text-brand" : "border-line-strong text-t2"}`}>{t}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2"><label className="lbl">Нэр *</label>
          <input className="inp" placeholder="ж: Автомашин 1234УБА" value={f.name}
                 onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="col-span-2"><label className="lbl">Дэлгэрэнгүй (дугаар, м², хаяг…)</label>
          <input className="inp" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></div>
        <div><label className="lbl">Орж ирсэн огноо</label>
          <input type="date" className="inp" value={f.date_in} onChange={(e) => setF({ ...f, date_in: e.target.value })} /></div>
        <div><label className="lbl">Орж ирсэн үнэ ₮ *</label>
          <input className="inp" inputMode="numeric" value={f.value_in}
                 onChange={(e) => setF({ ...f, value_in: e.target.value })} /></div>
        <div><label className="lbl">Зарах санал үнэ ₮</label>
          <input className="inp" inputMode="numeric" value={f.asking_price}
                 onChange={(e) => setF({ ...f, asking_price: e.target.value })} /></div>
        <div><label className="lbl">Тэмдэглэл</label>
          <input className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={!f.name.trim() || !+f.value_in.replace(/,/g, "")} onClick={async () => {
          const body = { ...f, value_in: +f.value_in.replace(/,/g, ""), asking_price: +f.asking_price.replace(/,/g, "") || 0 };
          try {
            if (a) await api(`/api/barter/${a.id}`, { method: "PUT", body: JSON.stringify(body) });
            else await api("/api/barter", { method: "POST", body: JSON.stringify(body) });
            toast("Хадгалагдлаа");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</button>
      </div>
    </Modal>
  );
}

import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, user } from "../api";
import { Spinner, Modal, useToast, Prog, Receipt, Empty } from "../ui";
import { parseMoney } from "../lib/num";

export default function Warehouse() {
  const [d, setD] = useState<any>(null);
  const [adjust, setAdjust] = useState<any>(null);   // {m, s} — тооллогын залруулга
  const [repair, setRepair] = useState<any>(null);   // {m, s} — засвар дуусгах
  const [q, setQ] = useState("");
  const toast = useToast();
  const nav = useNavigate();
  const u = user();

  const load = () => api("/api/stock").then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Агуулах</h1>
          <p className="text-t2 text-[13.5px] mt-0.5">Амьд үлдэгдэл — хөдөлгөөн бүртгэгдэнгүүт шинэчлэгдэнэ.</p>
        </div>
        {u?.role !== "finance" && (
          <button className="btn-primary" onClick={() => nav("/warehouse/stocktake")}>
            ▣ Тооллого хийх
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 max-sm:grid-cols-1">
        <Kpi label="Агуулахад" val={fmt(d.totals.on_hand) + " ш"} />
        <Kpi label="Түрээсэнд гарсан" val={fmt(d.totals.on_rent) + " ш"} pill={`${d.totals.utilization}%`} />
        <Kpi label="Засварт" val={fmt(d.totals.in_repair) + " ш"} warn={d.totals.in_repair > 0} />
      </div>

      <input className="inp max-w-[320px] mb-4" placeholder="Материал хайх…" value={q}
             aria-label="Материал, ангиллаар хайх" onChange={(e) => setQ(e.target.value)} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead><tr>
            <th className="th">Материал</th><th className="th">Зэрэглэл бүрийн үлдэгдэл (агуулахад)</th>
            <th className="th text-right">Түрээсэнд</th><th className="th text-right">Засварт</th>
            <th className="th min-w-[130px]">Ашиглалт</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {d.rows.filter((m: any) => !q || m.name.toLowerCase().includes(q.toLowerCase())
                                        || (m.category || "").toLowerCase().includes(q.toLowerCase()))
                 .map((m: any) => {
              const hand = m.on_hand_total, rent = m.on_rent_total;
              const repair = (m.stock || []).reduce((s: number, x: any) => s + x.in_repair, 0);
              const util = hand + rent ? (rent / (hand + rent)) * 100 : 0;
              return (
                <tr key={m.id}>
                  <td className="td"><b className="text-ink">{m.name}</b>
                    <span className="block text-xs text-t3">{m.category} · тариф {fmt(m.base_rate)}₮ · засвар {fmt(m.repair_fee)}₮/ш</span></td>
                  <td className="td">
                    <div className="flex gap-1.5 flex-wrap">
                      {(m.stock || []).map((s: any) => (
                        <button key={s.grade_id} title="Тооллогын залруулга"
                          aria-label={`${m.name} · ${s.grade} зэрэглэл — агуулахад ${fmt(s.on_hand)}ш, тооллогын залруулга`}
                          onClick={() => (u?.role !== "finance") && setAdjust({ m, s })}
                          className="pill-grey hover:bg-brand-50 hover:text-brand transition cursor-pointer">
                          {s.grade}: <b className="tabular-nums">{fmt(s.on_hand)}</b>
                        </button>
                      ))}
                      {(m.stock || []).length === 0 && <span className="text-xs text-t3">—</span>}
                    </div>
                  </td>
                  <td className="td text-right tabular-nums font-bold">{fmt(rent)}</td>
                  <td className="td text-right tabular-nums">
                    {repair > 0 ? (
                      <span className="text-warn font-bold">{fmt(repair)}</span>
                    ) : "—"}
                  </td>
                  {/* Энэ нүдэнд зураасаас өөр юу ч байхгүй — хувийг нэрлэж өгнө */}
                  <td className="td"><Prog pct={util} label={`Ашиглалт ${Math.round(util)}%`}
                                           color={util > 85 ? "#EF4444" : util > 70 ? "#F5A524" : undefined} /></td>
                  <td className="td">
                    {repair > 0 && u?.role !== "finance" && (
                      <button className="btn-ghost btn-row text-money"
                        onClick={() => {
                          const s = (m.stock || []).find((x: any) => x.in_repair > 0);
                          if (s) setRepair({ m, s });
                        }}>Засвар дуусгах</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adjust && (
        <AdjustModal m={adjust.m} s={adjust.s} onClose={() => setAdjust(null)}
                     onDone={() => { setAdjust(null); load(); }} />
      )}
      {repair && (
        <RepairModal m={repair.m} s={repair.s} onClose={() => setRepair(null)}
                     onDone={() => { setRepair(null); load(); }} />
      )}
    </div>
  );
}

function RepairModal({ m, s, onClose, onDone }: any) {
  const toast = useToast();
  const [val, setVal] = useState(String(s.in_repair));
  const uid = useId();
  const qty = parseMoney(val);
  const over = qty > s.in_repair;
  return (
    <Modal title="Засвар дуусгах" onClose={onClose}>
      <p className="text-[13.5px] text-t2 mb-4">
        <b className="text-ink">{m.name}</b> ({s.grade}) — засварт байгаа{" "}
        <b className="tabular-nums">{fmt(s.in_repair)}ш</b>-аас хэдийг агуулахад буцаан оруулах вэ?
      </p>
      <label className="lbl" htmlFor={`${uid}-qty`}>Тоо ширхэг</label>
      <input id={`${uid}-qty`} type="number" className={`inp ${over ? "!border-danger" : ""}`} value={val} autoFocus
             onChange={(e) => setVal(e.target.value)} />
      {over && <p className="text-danger text-[12px] mt-1.5">Засварт байгаагаас их байна</p>}
      <Receipt className="mt-4"
        rows={[
          { label: "Засварт байсан", value: `${fmt(s.in_repair)} ш` },
          { label: "Агуулахад орох", value: `+${fmt(qty)} ш`, accent: "money" },
        ]}
        total={{ label: "Засварт үлдэх", value: `${fmt(Math.max(s.in_repair - qty, 0))} ш` }} />
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={!qty || over} onClick={async () => {
          try {
            await api("/api/stock/repair-done", { method: "POST",
              body: JSON.stringify({ material_id: m.id, grade_id: s.grade_id, qty }) });
            toast("Засвар дууслаа — агуулахад орлоо");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Оруулах</button>
      </div>
    </Modal>
  );
}

function Kpi({ label, val, pill, warn }: any) {
  return (
    <div className="card p-5">
      <div className="text-[12.5px] text-t2 font-medium mb-2">{label}</div>
      <div className="text-[26px] font-extrabold text-ink tabular-nums leading-tight">{val}</div>
      {pill && <div className="mt-2"><span className="pill-blue">{pill}</span></div>}
      {warn && <div className="mt-2"><span className="pill-amber">засвар хүлээгдэж буй</span></div>}
    </div>
  );
}

/* Залруулга нь нөөцийг шууд хөдөлгөдөг тул 2 алхамтай: эхний дарахад
   `одоо → шинэ` зөрүүг харуулж, дараа нь баталгаажуулна. */
function AdjustModal({ m, s, onClose, onDone }: any) {
  const toast = useToast();
  const [val, setVal] = useState(String(s.on_hand));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const blank = val.trim() === "";
  const next = parseMoney(val);
  const diff = next - s.on_hand;

  return (
    <Modal title="Тооллогын залруулга" onClose={onClose} dirty={!blank && diff !== 0}>
      <p className="text-[13.5px] text-t2 mb-4">
        <b className="text-ink">{m.name}</b> ({s.grade}) — бодит тоолсон агуулахын үлдэгдлийг оруулна уу.
        Одоо системд: <b className="tabular-nums">{fmt(s.on_hand)}ш</b>
      </p>
      {/* Талбар нь огт нэргүй байсан — дээрх догол мөр нь ХАРАХ хүнд л тайлбарладаг */}
      <label className="lbl" htmlFor={`${uid}-onhand`}>Бодит тоолсон үлдэгдэл (ш)</label>
      <input id={`${uid}-onhand`} type="number" className="inp" value={val} autoFocus
             onChange={(e) => { setVal(e.target.value); setConfirming(false); }} />
      {confirming && (
        <Receipt className="mt-4"
          rows={[{ label: `${m.name} · ${s.grade}`, value: `${fmt(s.on_hand)}ш → ${fmt(next)}ш`,
                   accent: diff > 0 ? "money" : diff < 0 ? "danger" : undefined }]}
          total={{ label: diff === 0 ? "Зөрүүгүй — юу ч өөрчлөгдөхгүй"
                        : diff > 0 ? "Агуулахад нэмэгдэнэ" : "Агуулахаас хасагдана",
                   value: `${diff > 0 ? "+" : ""}${fmt(diff)} ш`,
                   accent: diff > 0 ? "money" : diff < 0 ? "danger" : "dim" }} />
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" disabled={busy}
                onClick={() => (confirming ? setConfirming(false) : onClose())}>
          {confirming ? "Буцах" : "Болих"}
        </button>
        <button className="btn-primary" disabled={busy || blank} onClick={async () => {
          if (!confirming) { setConfirming(true); return; }
          setBusy(true);
          try {
            await api("/api/stock/adjust", { method: "POST",
              body: JSON.stringify({ material_id: m.id, grade_id: s.grade_id, on_hand: next }) });
            toast("Үлдэгдэл залруулагдлаа");
            onDone();
          } catch (e: any) { toast(e.message, "err"); setBusy(false); }
        }}>{busy ? "…" : confirming ? "Баталгаажуулах" : "Хадгалах"}</button>
      </div>
    </Modal>
  );
}

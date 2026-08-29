import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "react-router-dom";
import { api, fmt, money } from "../api";
import { Spinner, useToast, Receipt, ConfirmModal, SubmitButton } from "../ui";
import { parseMoney, formatMoneyInput } from "../lib/num";
import { contractDraftDirty } from "../lib/dirty";

const today = () => new Date().toISOString().slice(0, 10);

type Item = { material_id: number; grade_id: number; qty: number; daily_rate: number; unit_price: number };

export default function ContractNew() {
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState<any[] | null>(null);
  const [materials, setMaterials] = useState<any[] | null>(null);
  const [type, setType] = useState<"rent" | "sale">("rent");
  const [clientId, setClientId] = useState<number | null>(null);
  const [newClient, setNewClient] = useState({ name: "", person: "", phone: "", reg: "" });
  const [showNew, setShowNew] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  /* Дуусах огноо ЭНД алга — компани гэрээндээ хугацаа тавьдаггүй, гэрээ
     хаагдтал явдаг. Хоосон орхигддог талбар нь «би юу бөглөх ёстой юм бол»
     гэсэн эргэлзээ л төрүүлдэг байв. Шаардлагатай гэрээнд огноог үүссэний
     дараа, гэрээн дотроос нь тавина (ContractDetail-ийн InlineEdit). */
  const cond0 = useMemo(() => ({ start_date: today(), penalty_percent: "0.5",
                                 deposit: "", vat_percent: "0", note: "", no: "" }), []);
  const [cond, setCond] = useState(cond0);
  const uid = useId();
  /* Хадгалж дуусаад БИД ӨӨРСДӨӨ гэрээ рүү шилжинэ — тэр шилжилтийг өөрсдийнхөө
     хамгаалалт таслах ёсгүй. Төлөв биш ref: navigate нь дараагийн render-ийг
     хүлээхгүй, тэр хормын утга шаардлагатай. */
  const savedRef = useRef(false);

  useEffect(() => {
    api("/api/clients").then(setClients);
    api("/api/materials").then(setMaterials);
  }, []);

  /* ---- Дундуур гарахаас хамгаалах ----
     Гурван алхам бөглөчихөөд зүүн доод буланд «Тохиргоо» дарахад бүх зүйл
     чимээгүй алга болдог байв. Хуудсан доторх шилжилтийг router барина... */
  const dirty = contractDraftDirty({ step, clientId, itemCount: items.length,
                                     cond, condInitial: cond0, newClient });
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname);
  /* …таб хаах/сэргээхийг зөвхөн хөтөч өөрөө барьж чадна. */
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!clients || !materials) return <Spinner />;

  const client = clients.find((c) => c.id === clientId);
  const daySum = items.reduce((s, i) => s + i.qty * i.daily_rate, 0);
  const saleSum = items.reduce((s, i) => s + i.qty * i.unit_price, 0);

  function addItem(m: any, stock: any) {
    if (items.some((i) => i.material_id === m.id && i.grade_id === stock.grade_id)) return;
    const price = m.prices.find((p: any) => p.grade_id === stock.grade_id);
    setItems([...items, { material_id: m.id, grade_id: stock.grade_id, qty: 0,
      daily_rate: m.base_rate, unit_price: price?.sale_price || 0 }]);
  }

  async function submit() {
    try {
      let cid = clientId;
      if (!cid && newClient.name.trim()) {
        const c = await api("/api/clients", { method: "POST", body: JSON.stringify(newClient) });
        cid = c.id;
      }
      if (!cid) { toast("Харилцагч сонгоно уу", "err"); return; }
      const body = {
        client_id: cid, type, no: cond.no, start_date: cond.start_date,
        end_date: null,                    // хугацаагүй — гэрээ хаагдтал явна
        // Хоосон орхивол л суурь 0.5% — санаатай бичсэн 0-ийг 0.5 болгож
        // сольж болохгүй (`|| 0.5` нь яг тэгж байсан).
        penalty_percent: cond.penalty_percent.trim() === "" ? 0.5 : parseMoney(cond.penalty_percent),
        deposit: parseMoney(cond.deposit), vat_percent: parseMoney(cond.vat_percent),
        note: cond.note,
        items: items.filter((i) => i.qty > 0),
      };
      const r = await api("/api/contracts", { method: "POST", body: JSON.stringify(body) });
      toast(`Гэрээ №${r.no} үүслээ — ачилтын хүсэлт дарга руу илгээгдэв`);
      savedRef.current = true;          // хадгалагдсан тул хамгаалалт саад болохгүй
      nav(`/contracts/${r.id}`);
    } catch (e: any) { toast(e.message, "err"); }
  }

  const steps = ["Харилцагч", "Материал", "Нөхцөл", "Баталгаажуулах"];

  return (
    <div className="max-w-4xl">
      <Link to="/contracts" className="btn-ghost mb-3 inline-flex">← Болих</Link>
      <h1 className="text-2xl font-extrabold text-ink tracking-tight mb-1">Шинэ гэрээ</h1>
      <p className="text-t2 text-[13.5px] mb-5">4 алхам — бүх тооцоо автоматаар.</p>

      <div className="flex gap-2 mb-5">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-[5px] rounded-full mb-2 transition ${i + 1 <= step ? "bg-brand" : "bg-line"}`} />
            <span className={`text-xs font-semibold ${i + 1 === step ? "text-brand-ink" : "text-t3"}`}>{i + 1} · {s}</span>
          </div>
        ))}
      </div>

      <div className="card p-6">
        {step === 1 && (
          <>
            {/* Товчны БҮЛЭГ — ганц талбар биш тул `label` биш, нэрлэсэн бүлэг */}
            <div className="lbl" id={`${uid}-type`}>Гэрээний төрөл</div>
            <div className="flex gap-2 mb-5" role="group" aria-labelledby={`${uid}-type`}>
              {[["rent", "Түрээс"], ["sale", "Худалдаа"]].map(([v, l]) => (
                <button key={v} onClick={() => setType(v as any)} aria-pressed={type === v}
                  className={`rounded-[10px] border px-6 py-2.5 font-semibold text-sm min-h-11 transition ${
                    type === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{l}</button>
              ))}
            </div>
            <div className="lbl" id={`${uid}-client`}>Харилцагч</div>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1"
                 role="group" aria-labelledby={`${uid}-client`}>
              {clients.map((c) => (
                <button key={c.id} onClick={() => { setClientId(c.id); setShowNew(false); }}
                  aria-pressed={clientId === c.id}
                  className={`pick-card text-left border-[1.5px] rounded-[14px] px-4 py-3.5 transition min-h-16 ${
                    clientId === c.id ? "border-brand bg-brand-50" : "border-line hover:border-line-strong hover:shadow-md"}`}>
                  <b className="block text-sm text-ink">{c.name}</b>
                  <span className="text-xs text-t2">{c.active_contracts} идэвхтэй гэрээ · </span>
                  {c.overdue
                    ? <span className="text-xs font-semibold text-danger">хэтэрсэн өртэй ⚠</span>
                    : c.receivable > 0
                      ? <span className="text-xs font-semibold text-warn">үлдэгдэл {fmt(c.receivable)}₮</span>
                      : <span className="text-xs font-semibold text-money">өргүй</span>}
                </button>
              ))}
              <button onClick={() => { setClientId(null); setShowNew(true); }} aria-pressed={showNew}
                className={`pick-card text-left border-[1.5px] border-dashed rounded-[14px] px-4 py-3.5 min-h-16 transition ${
                  showNew ? "border-brand bg-brand-50" : "border-line hover:border-line-strong"}`}>
                <b className="block text-sm text-brand-ink">+ Шинэ харилцагч</b>
                <span className="text-xs text-t2">Нэр, утас оруулаад л болно</span>
              </button>
            </div>
            {showNew && (
              <div className="grid grid-cols-2 gap-3.5 mt-4 max-sm:grid-cols-1">
                <div><label className="lbl" htmlFor={`${uid}-nc-name`}>Компанийн нэр *</label>
                  <input id={`${uid}-nc-name`} className="inp" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} /></div>
                <div><label className="lbl" htmlFor={`${uid}-nc-reg`}>Регистр</label>
                  <input id={`${uid}-nc-reg`} className="inp" value={newClient.reg} onChange={(e) => setNewClient({ ...newClient, reg: e.target.value })} /></div>
                <div><label className="lbl" htmlFor={`${uid}-nc-person`}>Хариуцах хүн</label>
                  <input id={`${uid}-nc-person`} className="inp" value={newClient.person} onChange={(e) => setNewClient({ ...newClient, person: e.target.value })} /></div>
                <div><label className="lbl" htmlFor={`${uid}-nc-phone`}>Утас</label>
                  <input id={`${uid}-nc-phone`} className="inp" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} /></div>
              </div>
            )}
            {client?.overdue && (
              <div className="mt-4 bg-danger-50 text-danger rounded-xl px-4 py-3 text-[13.5px] font-medium">
                ⚠ Энэ харилцагч хэтэрсэн өртэй ({fmt(client.receivable)}₮). Гэрээ хийхээс өмнө анхаараарай.
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button className="btn-primary" disabled={!clientId && !(showNew && newClient.name.trim())}
                      onClick={() => setStep(2)}>Үргэлжлүүлэх →</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <MaterialPicker materials={materials} items={items} addItem={addItem} type={type} />
            {items.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead><tr>
                    <th className="th">Сонгосон</th><th className="th text-right">Тоо</th>
                    <th className="th text-right">{type === "rent" ? "Тариф ₮/ш/хоног" : "Нэгж үнэ ₮"}</th>
                    <th className="th text-right">{type === "rent" ? "Өдрийн дүн" : "Нийт"}</th><th className="th"></th>
                  </tr></thead>
                  <tbody>
                    {items.map((it, i) => {
                      const m = materials.find((x: any) => x.id === it.material_id);
                      const st = m?.stock?.find((s: any) => s.grade_id === it.grade_id);
                      const over = st && it.qty > st.on_hand;
                      return (
                        <tr key={i}>
                          <td className="td"><b className="text-ink">{m?.name}</b>
                            <span className="block text-xs text-t3">{st?.grade} · агуулахад {fmt(st?.on_hand || 0)}ш</span></td>
                          <td className="td text-right">
                            {/* Багана хоосон толгойтой байсан ч талбар бүр өөрөө
                                ямар материалын юуг гуйж байгаагаа хэлэх ёстой */}
                            <input type="number" min={0} aria-label={`${m?.name} — тоо ширхэг`}
                              className={`inp !min-h-10 !py-2 w-24 text-right ${over ? "!border-danger" : ""}`}
                              value={it.qty} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))} />
                            {over && <span className="block text-[12px] text-danger mt-1">нөөцөөс их!</span>}
                          </td>
                          <td className="td text-right">
                            <input type="number" min={0} className="inp !min-h-10 !py-2 w-28 text-right"
                              aria-label={`${m?.name} — ${type === "rent" ? "тариф ₮/ш/хоног" : "нэгж үнэ ₮"}`}
                              value={type === "rent" ? it.daily_rate : it.unit_price}
                              onChange={(e) => setItems(items.map((x, j) => j === i
                                ? { ...x, [type === "rent" ? "daily_rate" : "unit_price"]: +e.target.value } : x))} />
                          </td>
                          <td className="td text-right tabular-nums font-bold text-ink">
                            {money(it.qty * (type === "rent" ? it.daily_rate : it.unit_price))}
                          </td>
                          <td className="td"><button className="btn-ghost btn-row text-danger"
                            aria-label={`${m?.name} — жагсаалтаас хасах`}
                            onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-4">
                  {type === "rent" ? (
                    <Receipt
                      rows={[
                        { label: "Сонгосон материал", value: `${items.filter((i) => i.qty > 0).length} мөр · ${fmt(items.reduce((s, i) => s + i.qty, 0))}ш` },
                        { label: "Өдрийн нийт тооцоо", value: money(daySum) },
                      ]}
                      total={{ label: "30 хоногийн нэг цикл", value: money(daySum * 30) }} />
                  ) : (
                    <Receipt
                      rows={[{ label: "Сонгосон материал", value: `${items.filter((i) => i.qty > 0).length} мөр · ${fmt(items.reduce((s, i) => s + i.qty, 0))}ш` }]}
                      total={{ label: "Худалдааны нийт үнэ", value: money(saleSum) }} />
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button className="btn-secondary" onClick={() => setStep(1)}>← Буцах</button>
              <button className="btn-primary" disabled={!items.some((i) => i.qty > 0)} onClick={() => setStep(3)}>Үргэлжлүүлэх →</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
              <div><label className="lbl" htmlFor={`${uid}-no`}>Гэрээний № (хоосон бол автомат)</label>
                <input id={`${uid}-no`} className="inp" placeholder="ж: 26/15" value={cond.no} onChange={(e) => setCond({ ...cond, no: e.target.value })} /></div>
              <div><label className="lbl" htmlFor={`${uid}-start`}>Эхлэх огноо</label>
                <input id={`${uid}-start`} type="date" className="inp" value={cond.start_date} onChange={(e) => setCond({ ...cond, start_date: e.target.value })} /></div>
              <div><label className="lbl" htmlFor={`${uid}-penalty`}>Алданги %/хоног</label>
                <input id={`${uid}-penalty`} className="inp" inputMode="decimal" value={cond.penalty_percent}
                       onChange={(e) => setCond({ ...cond, penalty_percent: e.target.value })} /></div>
              <div><label className="lbl" htmlFor={`${uid}-deposit`}>Барьцаа ₮ (заавал биш)</label>
                {/* Excel-ээс "6,000,000" хуулж тавихад ажиллана; бичиж байх үед
                    мянгатыг өөрөө бүлэглэж, юу бичсэнээ хараад л мэдэхээр. */}
                <input id={`${uid}-deposit`} className="inp" inputMode="numeric" placeholder="0" value={cond.deposit}
                       onChange={(e) => setCond({ ...cond, deposit: formatMoneyInput(e.target.value) })} /></div>
              <div><label className="lbl" htmlFor={`${uid}-vat`}>НӨАТ %</label>
                <select id={`${uid}-vat`} className="inp" value={cond.vat_percent} onChange={(e) => setCond({ ...cond, vat_percent: e.target.value })}>
                  <option value="0">Тооцохгүй</option><option value="10">10%</option>
                </select></div>
            </div>
            <p className="text-[12.5px] text-t2 mt-3">
              Гэрээ <b className="text-t1">хугацаагүй</b> — хаах хүртэл тооцоо цикл бүрээр
              үргэлжилнэ. Дуусах огноо хэрэгтэй бол гэрээ үүссэний дараа гэрээн дотроос тавина.
            </p>
            <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
              <input id={`${uid}-note`} className="inp" placeholder="ж: тээврийг захиалагч хариуцна" value={cond.note}
                     onChange={(e) => setCond({ ...cond, note: e.target.value })} /></div>
            <div className="flex justify-between mt-6">
              <button className="btn-secondary" onClick={() => setStep(2)}>← Буцах</button>
              <button className="btn-primary" onClick={() => setStep(4)}>Үргэлжлүүлэх →</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            {(() => {
              const vat = parseMoney(cond.vat_percent);
              const deposit = parseMoney(cond.deposit);
              const base = type === "rent" ? daySum * 30 : saleSum;
              const vatAmt = base * vat / 100;
              /* Баталгаажуулах алхам нь МӨНГИЙГ л харуулж, ЮУГ түрээслэж
                 байгааг харуулдаггүй байв — Отгоо 2-р алхам дээр бөглөсөн
                 мөрүүдээ дахин харалгүйгээр гэрээ үүсгэдэг. Тоо ширхэг ба
                 тарифаа эндээс сүүлчийн удаа хардаг. */
              const picked = items.filter((i) => i.qty > 0);
              const lineLabel = (it: Item) => {
                const m = materials.find((x: any) => x.id === it.material_id);
                const st = m?.stock?.find((s: any) => s.grade_id === it.grade_id);
                return `${m?.name ?? "—"}${st?.grade ? ` (${st.grade})` : ""}`;
              };
              const rows: any[] = [
                { label: "Харилцагч", value: client?.name || newClient.name },
                { label: "Материал",
                  value: `${picked.length} мөр · ${fmt(picked.reduce((s, i) => s + i.qty, 0))}ш` },
                ...picked.slice(0, 3).map((it) => ({
                  label: lineLabel(it),
                  value: type === "rent"
                    ? `${fmt(it.qty)}ш × ${fmt(it.daily_rate)}₮/хоног`
                    : `${fmt(it.qty)}ш × ${fmt(it.unit_price)}₮`,
                  accent: "dim",
                })),
                ...(picked.length > 3
                  ? [{ label: "…", value: `бас ${picked.length - 3} мөр`, accent: "dim" }] : []),
                ...(type === "rent"
                  ? [{ label: "Өдрийн тооцоо", value: money(daySum) },
                     { label: "30 хоногийн цикл", value: money(daySum * 30) },
                     { label: "Алданги", value: cond.penalty_percent + " %/хоног", accent: "dim" }]
                  : [{ label: "Худалдааны дүн", value: money(saleSum) }]),
                ...(vat > 0 ? [{ label: `НӨАТ ${vat}%`, value: "+" + money(vatAmt), accent: "violet" }] : []),
                ...(deposit > 0
                  ? [{ label: "Барьцаа", value: money(deposit), accent: "money" }] : []),
              ];
              // НӨАТ 0 үед «(НӨАТ-тай)» гэдэг нь худал. Хаалт дотор нь ҮНЭНийг
              // хэлнэ — гэрээ баталгаажуулахын өмнөх сүүлчийн шалгалт.
              const vatTag = vat > 0 ? " (НӨАТ-тай)" : " (НӨАТ-гүй)";
              return (
                <Receipt className="mb-4" rows={rows}
                  total={{ label: (type === "rent" ? "Циклийн нэхэмжлэл" : "Нийт төлөх дүн") + vatTag,
                           value: money(base + vatAmt) }} />
              );
            })()}
            <div className="bg-brand-50 rounded-xl px-4 py-3.5 text-[13.5px] text-t1 mb-2">
              Хадгалмагц <b>ачилтын хүсэлт үйлдвэрийн дарга руу</b> автоматаар очно.
              Дарга "Ачсан ✓" гэж баталгаажуулмагц нөөц хөдөлж, тооцоо эхэлнэ.
            </div>
            <div className="flex justify-between mt-5">
              <button className="btn-secondary" onClick={() => setStep(3)}>← Буцах</button>
              <SubmitButton className="btn-primary !bg-money" onSubmit={submit}
                            busyLabel="Үүсгэж байна…">✓ Гэрээ баталгаажуулах</SubmitButton>
            </div>
          </>
        )}
      </div>

      {/* Дундуур гарах гэж байна — юу алдагдахыг НЭРЛЭЭД асууна. Системийн бусад
          «буцаагдахгүй» асуултуудтай ижил navy хайрцаг. */}
      {blocker.state === "blocked" && (
        <ConfirmModal
          title="Гэрээ бөглөхөө орхих уу?"
          intro={<>Бөглөсөн зүйл хадгалагдаагүй байна — энэ хуудаснаас гармагц сэргэхгүй.</>}
          rows={[
            { label: "Алхам", value: `${step} / 4 — ${steps[step - 1]}` },
            { label: "Харилцагч",
              value: client?.name || newClient.name.trim() || "сонгоогүй",
              accent: client || newClient.name.trim() ? undefined : "dim" },
            { label: "Материал",
              value: items.length
                ? `${items.length} мөр · ${fmt(items.reduce((s, i) => s + i.qty, 0))}ш`
                : "сонгоогүй",
              accent: items.length ? undefined : "dim" },
          ]}
          confirmLabel="Орхиод гарах" cancelLabel="Үргэлжлүүлэн бөглөх" danger
          onClose={() => blocker.reset?.()}
          onConfirm={() => blocker.proceed?.()} />
      )}
    </div>
  );
}

function MaterialPicker({ materials, items, addItem, type }: any) {
  const [q, setQ] = useState("");
  const cats = useMemo(() => [...new Set(materials.map((m: any) => m.category))], [materials]);
  const [cat, setCat] = useState<string>("");
  const shown = materials.filter((m: any) =>
    (!cat || m.category === cat) && (!q || m.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <div className="flex gap-2.5 mb-3.5 flex-wrap">
        <input className="inp max-w-[240px] !min-h-10 !py-2" placeholder="Материал хайх…"
               aria-label="Материал хайх" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="inline-flex bg-white border border-line rounded-full p-1 gap-0.5"
             role="group" aria-label="Материалыг ангиллаар шүүх">
          <button onClick={() => setCat("")} aria-pressed={!cat}
            className={`rounded-full px-3.5 py-1 text-[12.5px] font-semibold min-h-9 ${!cat ? "bg-brand text-onbrand" : "text-t2"}`}>Бүгд</button>
          {cats.map((c: any) => (
            <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
              className={`rounded-full px-3.5 py-1 text-[12.5px] font-semibold min-h-9 ${cat === c ? "bg-brand text-onbrand" : "text-t2"}`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {shown.map((m: any) => (m.stock || []).filter((s: any) => s.on_hand > 0).map((s: any) => {
          const picked = items.some((i: any) => i.material_id === m.id && i.grade_id === s.grade_id);
          return (
            <button key={m.id + "-" + s.grade_id} onClick={() => addItem(m, s)} disabled={picked}
              className={`pick-card text-left border rounded-xl px-3.5 py-3 transition ${
                picked ? "border-brand bg-brand-50 opacity-60" : "border-line hover:border-line-strong hover:shadow-md"}`}>
              <b className="block text-[13.5px] text-ink">{m.name}</b>
              <span className="text-xs text-t2">{s.grade} · <b className="text-money">{fmt(s.on_hand)}ш</b> агуулахад</span>
              <span className="block text-[12px] text-t3">
                {type === "rent" ? `суурь тариф ${fmt(m.base_rate)}₮` :
                 `үнэ ${fmt(m.prices.find((p: any) => p.grade_id === s.grade_id)?.sale_price || 0)}₮`}
              </span>
            </button>
          );
        }))}
      </div>
    </div>
  );
}


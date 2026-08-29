import { useEffect, useId, useState } from "react";
import { api, fmt } from "../api";
import { Spinner, FormModal, SubmitButton, useToast } from "../ui";
import { formDirty } from "../lib/dirty";

export default function SettingsPage() {
  const toast = useToast();
  const [grades, setGrades] = useState<any[] | null>(null);
  const [materials, setMaterials] = useState<any[] | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [gradeModal, setGradeModal] = useState<any>(null);      // {} = шинэ, {id..} = засах
  const [matModal, setMatModal] = useState<any>(null);
  const uid = useId();

  const load = () => {
    api("/api/grades").then(setGrades);
    api("/api/materials").then(setMaterials);
    api("/api/settings").then(setSettings);
  };
  useEffect(load, []);
  if (!grades || !materials || !settings) return <Spinner />;

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ТОХИРГОО <span>•</span> {materials.length} МАТЕРИАЛ · {grades.length} ЗЭРЭГЛЭЛ</div>
          <h1 className="dashboard-title">Тохиргоо</h1>
          <p className="dashboard-subtitle">Зэрэглэл, каталог, үнэ, системийн суурь утгууд.</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.8fr] gap-4 max-lg:grid-cols-1 items-start">
        <div className="space-y-4">
          {/* Зэрэглэл — динамик */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-ink text-[15.5px]">Зэрэглэл</h2>
              <button className="btn-ghost text-brand-ink btn-row" onClick={() => setGradeModal({})}>+ Нэмэх</button>
            </div>
            <p className="text-[12px] text-t3 mb-3">Шинэ, А, В, С… — дуртай хэдэн зэрэглэл нэмнэ. Бараа хүлээж авахдаа дарга сонгоно.</p>
            {grades.map((g) => (
              <div key={g.id} className="flex items-center gap-3 py-2 border-b border-sunken last:border-0">
                <span className="pill-blue">{g.code}</span>
                <span className="text-[13.5px]">{g.name}</span>
                <button className="btn-ghost btn-row ml-auto" aria-label={`${g.code} · ${g.name} зэрэглэлийг засах`}
                        onClick={() => setGradeModal(g)}>Засах</button>
              </div>
            ))}
          </div>

          {/* Суурь тохиргоо */}
          <div className="card p-5">
            <h2 className="font-bold text-ink text-[15.5px] mb-3.5">Суурь утгууд</h2>
            <label className="lbl" htmlFor={`${uid}-company`}>Компанийн нэр</label>
            <input id={`${uid}-company`} className="inp mb-3.5" value={settings.company_name || ""}
                   onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} />
            <label className="lbl" htmlFor={`${uid}-penalty`}>Алдангийн суурь %/хоног</label>
            <input id={`${uid}-penalty`} className="inp mb-3.5" value={settings.penalty_default || "0.5"}
                   onChange={(e) => setSettings({ ...settings, penalty_default: e.target.value })} />
            <label className="lbl" htmlFor={`${uid}-cycle`}>Циклийн урт (хоног)</label>
            <input id={`${uid}-cycle`} className="inp mb-3.5" value={settings.cycle_days_default || "30"}
                   onChange={(e) => setSettings({ ...settings, cycle_days_default: e.target.value })} />
            <label className="lbl" htmlFor={`${uid}-ndsh`}>НДШ суутгалын хувь (%)</label>
            <input id={`${uid}-ndsh`} className="inp mb-1" inputMode="decimal" value={settings.ndsh_percent || "11.5"}
                   aria-describedby={`${uid}-ndsh-hint`}
                   onChange={(e) => setSettings({ ...settings, ndsh_percent: e.target.value })} />
            <p id={`${uid}-ndsh-hint`} className="text-[12px] text-t3 mb-4">Дараагийн цалингийн бодолтоос шинэ хувиар суутгана.</p>
            {/* Барихгүй бол алдаа чимээгүй залгигдаж, хадгалагдсан мэт харагдана.
                Хадгалалт дуустал товч өөрийгөө түгжинэ — эс бөгөөс хоёр дарахад
                хоёр PUT нисч, аль нь сүүлд буусан нь тодорхойгүй болно. */}
            <SubmitButton className="btn-primary w-full justify-center" onSubmit={async () => {
              try {
                await api("/api/settings", { method: "PUT", body: JSON.stringify({ values: settings }) });
                toast("Тохиргоо хадгалагдлаа");
              } catch (e: any) { toast(e.message, "err"); }
            }}>Хадгалах</SubmitButton>
          </div>
        </div>

        {/* Каталог */}
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-1">
            <h2 className="font-bold text-ink text-[15.5px]">Материалын каталог</h2>
            <button className="btn-ghost text-brand-ink btn-row" onClick={() => setMatModal({})}>+ Материал нэмэх</button>
          </div>
          <table className="w-full min-w-[560px]">
            <thead><tr>
              <th className="th">Материал</th><th className="th text-right">Суурь тариф</th>
              <th className="th text-right">Засварын фикс</th><th className="th">Үнэ (зэрэглэлээр)</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td className="td"><b className="text-ink">{m.name}</b>
                    <span className="block text-xs text-t3">{m.category}</span></td>
                  <td className="td text-right tabular-nums">{fmt(m.base_rate)}₮</td>
                  <td className="td text-right tabular-nums">{fmt(m.repair_fee)}₮</td>
                  <td className="td">
                    <div className="flex gap-1.5 flex-wrap">
                      {m.prices.map((p: any) => (
                        <span key={p.grade_id} className="pill-grey !text-[12px]">
                          {p.grade}: {fmt(p.nb_price)}₮
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="td"><button className="btn-ghost btn-row" aria-label={`${m.name} материалыг засах`}
                                             onClick={() => setMatModal(m)}>Засах</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {gradeModal !== null && (
        <GradeModal g={gradeModal} onClose={() => setGradeModal(null)}
                    onDone={() => { setGradeModal(null); load(); }} />
      )}
      {matModal !== null && (
        <MaterialModal m={matModal} grades={grades} onClose={() => setMatModal(null)}
                       onDone={() => { setMatModal(null); load(); }} />
      )}
    </div>
  );
}

function GradeModal({ g, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { code: g.code || "", name: g.name || "", sort: g.sort ?? 0 };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    <FormModal title={g.id ? "Зэрэглэл засах" : "Шинэ зэрэглэл"} onClose={onClose} dirty={formDirty(f0, f)}>
      <label className="lbl" htmlFor={`${uid}-code`}>Код (богино)</label>
      <input id={`${uid}-code`} className="inp mb-3.5" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="ж: С" autoFocus />
      <label className="lbl" htmlFor={`${uid}-name`}>Нэр</label>
      <input id={`${uid}-name`} className="inp mb-3.5" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ж: С зэрэглэл" />
      <label className="lbl" htmlFor={`${uid}-sort`}>Эрэмбэ</label>
      <input id={`${uid}-sort`} type="number" className="inp mb-5" value={f.sort} onChange={(e) => setF({ ...f, sort: +e.target.value })} />
      <div className="flex justify-end gap-2.5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.code.trim()} onSubmit={async () => {
          try {
            if (g.id) await api(`/api/grades/${g.id}`, { method: "PUT", body: JSON.stringify(f) });
            else await api("/api/grades", { method: "POST", body: JSON.stringify(f) });
            toast("Хадгалагдлаа"); onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

function MaterialModal({ m, grades, onClose, onDone }: any) {
  const toast = useToast();
  const base0 = { name: m.name || "", category: m.category || "Хэв",
                  base_rate: m.base_rate ?? 0, repair_fee: m.repair_fee ?? 0 };
  const prices0 = grades.map((g: any) => {
    const ex = (m.prices || []).find((p: any) => p.grade_id === g.id);
    return { grade_id: g.id, grade: g.code, nb_price: ex?.nb_price ?? 0, sale_price: ex?.sale_price ?? 0 };
  });
  const [f, setF] = useState({ ...base0, prices: prices0 });
  const uid = useId();
  // Зэрэглэл бүрийн үнэ нь МӨР бүхий хэсэг тул өөрийн харьцуулалттай:
  // 6 зэрэглэлийн НБҮнэ бөглөчихөөд санамсаргүй хаах нь бүгдийг устгана.
  const dirty = formDirty(base0, { name: f.name, category: f.category,
                                   base_rate: f.base_rate, repair_fee: f.repair_fee })
    || f.prices.some((p: any, i: number) =>
         p.nb_price !== prices0[i]?.nb_price || p.sale_price !== prices0[i]?.sale_price);
  return (
    <FormModal title={m.id ? "Материал засах" : "Шинэ материал"} onClose={onClose} wide dirty={dirty}>
      <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
        <div><label className="lbl" htmlFor={`${uid}-name`}>Нэр *</label>
          <input id={`${uid}-name`} className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ж: Хэв хашмал 2020" autoFocus /></div>
        <div><label className="lbl" htmlFor={`${uid}-cat`}>Категори</label>
          <select id={`${uid}-cat`} className="inp" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {["Хэв", "Тулаас", "Труба", "Механизм", "Бусад"].map((c) => <option key={c}>{c}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor={`${uid}-rate`}>Суурь тариф ₮/ш/хоног</label>
          <input id={`${uid}-rate`} type="number" className="inp" value={f.base_rate} onChange={(e) => setF({ ...f, base_rate: +e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-fee`}>Засварын фикс үнэ ₮/ш</label>
          <input id={`${uid}-fee`} type="number" className="inp" value={f.repair_fee} onChange={(e) => setF({ ...f, repair_fee: +e.target.value })} /></div>
      </div>
      <h4 className="font-bold text-[13.5px] mt-5 mb-2">Зэрэглэл бүрийн үнэ</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px]">
          <thead><tr><th className="th">Зэрэглэл</th><th className="th text-right">НБҮнэ (актын үнэ)</th>
            <th className="th text-right">Худалдах үнэ</th></tr></thead>
          <tbody>
            {f.prices.map((p: any, i: number) => (
              <tr key={p.grade_id}>
                <td className="td"><span className="pill-blue">{p.grade}</span></td>
                <td className="td text-right"><input type="number" className="inp !min-h-9 !py-1.5 w-32 text-right"
                  aria-label={`${p.grade} зэрэглэл — НБҮнэ (актын үнэ) ₮`}
                  value={p.nb_price} onChange={(e) => setF({ ...f, prices: f.prices.map((x: any, j: number) => j === i ? { ...x, nb_price: +e.target.value } : x) })} /></td>
                <td className="td text-right"><input type="number" className="inp !min-h-9 !py-1.5 w-32 text-right"
                  aria-label={`${p.grade} зэрэглэл — худалдах үнэ ₮`}
                  value={p.sale_price} onChange={(e) => setF({ ...f, prices: f.prices.map((x: any, j: number) => j === i ? { ...x, sale_price: +e.target.value } : x) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim()} onSubmit={async () => {
          try {
            const body = { ...f, prices: f.prices.filter((p: any) => p.nb_price || p.sale_price) };
            if (m.id) await api(`/api/materials/${m.id}`, { method: "PUT", body: JSON.stringify(body) });
            else await api("/api/materials", { method: "POST", body: JSON.stringify(body) });
            toast("Хадгалагдлаа"); onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

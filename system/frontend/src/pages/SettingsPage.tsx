import { useEffect, useId, useState } from "react";
import { api, fmt } from "../api";
import { Spinner, SubmitButton, useToast } from "../ui";
/* Каталогийн хоёр цонх нь ЭНД амьдардаг байв. Отгоо шинэ материал нэмэхдээ
   АГУУЛАХ дээр зогсдог тул тэндээс ч нээгддэг болов — цонх нь НЭГ хэвээр
   (`components/CatalogModals.tsx`), энэ хуудас нь ХЭВЭЭР ажиллана. */
import { GradeModal, MaterialModal } from "../components/CatalogModals";

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
            {/* Энэ түлхүүрийг ХЭН Ч уншдаггүй байсан — шинэ гэрээний wizard
                0.5%-ийг хатуу бичдэг байв. Одоо wizard эндээс уншина. */}
            <label className="lbl" htmlFor={`${uid}-penalty`}>Алдангийн суурь %/хоног</label>
            <input id={`${uid}-penalty`} className="inp mb-1" value={settings.penalty_default ?? "0"}
                   aria-describedby={`${uid}-penalty-hint`}
                   onChange={(e) => setSettings({ ...settings, penalty_default: e.target.value })} />
            <p id={`${uid}-penalty-hint`} className="text-[12px] text-t3 mb-4">
              Шинэ гэрээний анхны утга. 0 = алданги автоматаар нэхэгдэхгүй
              (гэрээ бүр дээр «Алданги нэхэх» товчоор гараар нэхнэ).
            </p>
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

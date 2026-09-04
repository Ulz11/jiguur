import { useId, useState } from "react";
import { api } from "../api";
import { FormModal, SubmitButton, useToast } from "../ui";
import { formDirty } from "../lib/dirty";
import { materialBase, gradePriceRows, pricesDirty, materialPayload,
         type GradePriceRow } from "../lib/catalog";

/* ═══ КАТАЛОГИЙН ХОЁР ЦОНХ — НЭГ ХЭРЭГЖИЛТ, ХОЁР ХААЛГА ═══
 *
 * Эдгээр нь `SettingsPage`-ийн дотор амьдардаг байв. Гэвч Отгоо эгч шинэ
 * материал нэмэх хэрэгтэй болохдоо АГУУЛАХ дээр зогсож байдаг — тэр яг тэдгээр
 * материалыг ширтэж байгаад «энд нэмэх газар алга» гэж хэлсэн. Тохиргоо бол
 * цэсний 13 дахь мөр; түүнийг олох гэж хайх нь БОДИТ саад байв.
 *
 * Тиймээс өрөө нь хэвээр, ХОЁРДАХЬ ХААЛГА нэмэгдэв (нэхэмжлэлийг механизмын
 * нүднээс ч, өөрийн хуудаснаас ч нээдэгтэй ижил загвар). Хоёр хаалганы ард
 * ЯГ НЭГ цонх зогсоно: хоёр хувь байвал НБҮнэ (акт) ба худалдах үнэ (Худалдаа
 * болгох) хоёр хуудсан дээр ЯЛГААТАЙ ажиллаж эхэлнэ — тэр бол чимээгүй
 * мөнгөний зөрүү.
 *
 * ЭРХ: сервер тал `require_roles("manager")` — эдгээр цонхыг нээх товчийг
 * зөвхөн менежерт зурна. Товчийг нуух нь эрхийн хамгаалалт БИШ, ЭМХ ЦЭГЦ:
 * жинхэнэ зураас нь `routers/core.py` дээр хэвээр.
 */

/** Зэрэглэл нэмэх/засах — `{}` = шинэ, `{id..}` = засах. */
export function GradeModal({ g, onClose, onDone }: any) {
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

/**
 * Материал нэмэх/засах — нэр, КАТЕГОРИ, тариф, засварын фикс ба ЗЭРЭГЛЭЛ
 * БҮРИЙН үнэ.
 *
 * Отгоогийн гурван хүсэлт бүгд ЭНЭ цонхонд зогсоно:
 *   · «шинэ материал нэмэх»          → `m = {}`;
 *   · «шинэ төрлийн хэрэгсэл нэмэх»  → Категори (Хэв · Тулаас · Труба ·
 *                                       Механизм · Бусад);
 *   · «байгаа материал дээр шинэ төрөл» → зэрэглэлийн мөрөнд үнэ бичихэд тэр
 *                                       материал шинэ зэрэглэлээ авна.
 */
export function MaterialModal({ m, grades, onClose, onDone }: any) {
  const toast = useToast();
  const base0 = materialBase(m);
  const prices0 = gradePriceRows(grades, m);
  const [f, setF] = useState({ ...base0, prices: prices0 });
  const uid = useId();
  // Зэрэглэл бүрийн үнэ нь МӨР бүхий хэсэг тул өөрийн харьцуулалттай:
  // 6 зэрэглэлийн НБҮнэ бөглөчихөөд санамсаргүй хаах нь бүгдийг устгана.
  const dirty = formDirty(base0, { name: f.name, category: f.category,
                                   base_rate: f.base_rate, repair_fee: f.repair_fee })
    || pricesDirty(prices0, f.prices);
  const setPrice = (i: number, patch: Partial<GradePriceRow>) =>
    setF({ ...f, prices: f.prices.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <FormModal title={m.id ? "Материал засах" : "Шинэ материал"} onClose={onClose} wide dirty={dirty}>
      <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
        <div><label className="lbl" htmlFor={`${uid}-name`}>Нэр *</label>
          <input id={`${uid}-name`} className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ж: Хэв хашмал 2020" autoFocus /></div>
        <div><label className="lbl" htmlFor={`${uid}-cat`}>Категори</label>
          <select id={`${uid}-cat`} className="inp" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {/* Байгаа материалын категори жагсаалтад байхгүй бол (тестийн дата,
                гараар оруулсан утга) сонголт нь ЧИМЭЭГҮЙ эхний зүйл рүү
                үсэрч, засварлахад категори нь СОЛИГДОНО. Тиймээс байгаа
                утгыг нь жагсаалтад оруулж ирнэ. */}
            {[...new Set([...(f.category ? [f.category] : []),
                          "Хэв", "Тулаас", "Труба", "Механизм", "Бусад"])]
              .map((c) => <option key={c}>{c}</option>)}
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
            {f.prices.map((p, i) => (
              <tr key={p.grade_id}>
                <td className="td"><span className="pill-blue">{p.grade}</span></td>
                <td className="td text-right"><input type="number" className="inp !min-h-9 !py-1.5 w-32 text-right"
                  aria-label={`${p.grade} зэрэглэл — НБҮнэ (актын үнэ) ₮`}
                  value={p.nb_price} onChange={(e) => setPrice(i, { nb_price: +e.target.value })} /></td>
                <td className="td text-right"><input type="number" className="inp !min-h-9 !py-1.5 w-32 text-right"
                  aria-label={`${p.grade} зэрэглэл — худалдах үнэ ₮`}
                  value={p.sale_price} onChange={(e) => setPrice(i, { sale_price: +e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Зэрэглэл огт байхгүй бол хүснэгт нь ТОЛГОЙГООРОО зогсоно — юу
            дутуугаа нэрлэнэ (Отгоо «үнэ хаана байна» гэж хайхгүй). */}
        {f.prices.length === 0 && (
          <p className="text-[12.5px] text-t3 py-3">Зэрэглэл бүртгэгдээгүй байна — эхлээд зэрэглэл нэмнэ.</p>
        )}
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim()} onSubmit={async () => {
          try {
            const body = materialPayload(m, f);
            if (m.id) await api(`/api/materials/${m.id}`, { method: "PUT", body: JSON.stringify(body) });
            else await api("/api/materials", { method: "POST", body: JSON.stringify(body) });
            toast("Хадгалагдлаа"); onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

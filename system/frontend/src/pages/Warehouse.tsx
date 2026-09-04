import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, money, user } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Prog, Receipt, Empty,
         FinanceDisclosure, FinanceBlock } from "../ui";
import { parseMoney } from "../lib/num";
import { rowClickProps } from "../lib/rowClick";
import { materialHref } from "../lib/links";
import { GradeModal, MaterialModal } from "../components/CatalogModals";

export default function Warehouse() {
  const [d, setD] = useState<any>(null);
  const [grades, setGrades] = useState<any[] | null>(null);
  const [adjust, setAdjust] = useState<any>(null);   // {m, s} — тооллогын залруулга
  const [repair, setRepair] = useState<any>(null);   // {m, s} — засвар дуусгах
  const [matModal, setMatModal] = useState<any>(null);   // {} = шинэ, {id..} = засах
  const [gradeModal, setGradeModal] = useState<any>(null);
  const [q, setQ] = useState("");
  const toast = useToast();
  const nav = useNavigate();
  const u = user();
  /* КАТАЛОГ ЭНД ЧУХАЛ БАЙХ ШАЛТГААН. Отгоо шинэ материал бүртгэх хэрэгтэй
     болохдоо ЭНЭ хуудсан дээр, яг тэр материалуудыг ширтэж зогсдог. Каталог
     засах цонх нь Тохиргоо (цэсний 13 дахь мөр) дотор нуугдсан байсан тул
     «энд нэмэх газар алга» гэсэн нь ҮНЭН байв. Одоо хоёр хаалга, НЭГ өрөө:
     цонх нь `components/CatalogModals.tsx` дээр ганц хэрэгжилттэй хэвээр.
     Сервер тал `require_roles("manager")` — товчийг зөвхөн менежерт зурна. */
  const isManager = u?.role === "manager";

  const load = () => {
    api("/api/stock").then(setD);
    /* Зэрэглэлийн жагсаалт нь ЗӨВХӨН каталогийн цонхонд хэрэгтэй (үнийн мөр
       бүр нэг зэрэглэл). Тиймээс дарга/санхүүчийн хуудас нэмэлт хүсэлт
       илгээхгүй — тэдэнд тэр цонх нээгддэггүй. */
    if (isManager) api("/api/grades").then(setGrades);
  };
  useEffect(() => { load(); }, []);
  if (!d || (isManager && !grades)) return <Spinner />;

  /* Санхүүч тооллого залруулж чадахгүй. Гэсэн ч зэрэглэлийн үлдэгдэл нь бүх
     хүнд <button> хэлбэрээр, хулгана хүрэхэд өнгө нь солигдож, «Тооллогын
     залруулга» гэсэн тайлбартай зогсдог байв — 40 орчим ХУДАЛ товч. Түүнд
     эдгээр нь зүгээр л тоо. */
  const canAdjust = u?.role !== "finance";
  /* Агуулах бол ДАРГЫН өдөр тутмын дэлгэц: мөр бүрийн дэд мөрөнд «тариф
     330₮ · засвар 15,000₮/ш» гэж хоёр дүн зогсдог байв. Тэдгээр нь тоологч
     хүний ажилд ХЭРЭГГҮЙ ч, асуулт ирэхэд ХЭРЭГТЭЙ — тиймээс доорх
     «Санхүү» задаргаанд бүтнээрээ нүүнэ (эзэний шийдвэр: нууц биш, ЦЭГЦ). */
  const seesMoney = u?.role !== "factory";
  const shown = d.rows.filter((m: any) => !q || m.name.toLowerCase().includes(q.toLowerCase())
                                            || (m.category || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">АГУУЛАХ <span>•</span> {d.rows.length} МАТЕРИАЛ</div>
          <h1 className="dashboard-title">Агуулах</h1>
          <p className="dashboard-subtitle">Амьд үлдэгдэл — хөдөлгөөн бүртгэгдэнгүүт шинэчлэгдэнэ.</p>
        </div>
        {/* UI-ЗАРЧИМ §2 — гол үйлдэл БАРУУН дээд булан; хоёрдогч нь
            `btn-secondary`, зүүн талд нь. Тооллого нь өдөр тутмынх тул ГОЛ
            хэвээр; каталогийн хоёр товч түүний зүүнээс нэмэгдэнэ. */}
        {(isManager || u?.role !== "finance") && (
          <div className="flex items-center gap-2 flex-wrap command-action">
            {isManager && (
              <>
                <button className="btn-secondary" onClick={() => setGradeModal({})}>+ Зэрэглэл</button>
                <button className="btn-secondary" onClick={() => setMatModal({})}>+ Материал нэмэх</button>
              </>
            )}
            {/* Материалын дэлгэрэнгүй хуудастай ИЖИЛ — тооллого руу ХОЛБООС */}
            {u?.role !== "finance" && (
              <Link to="/warehouse/stocktake" className="btn-primary">▣ Тооллого хийх</Link>
            )}
          </div>
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
            {shown.map((m: any) => {
              const hand = m.on_hand_total, rent = m.on_rent_total;
              const repair = (m.stock || []).reduce((s: number, x: any) => s + x.in_repair, 0);
              const util = hand + rent ? (rent / (hand + rent)) * 100 : 0;
              return (
                /* Мөр бүхэлдээ материалын дэлгэрэнгүй рүү — «энэ хэв хэнд
                   байна» гэдгийг Отгоо гэрээ бүрийг нээлгүйгээр уншина.
                   Зэрэглэлийн товч, «Засвар дуусгах» нь мөрөн ДОТРОО өөрийн
                   үйлдлээ хийсэн хэвээр (товшилтоо мөрөнд өгөхгүй). */
                <tr key={m.id} className="cursor-pointer hover:bg-canvas transition group"
                    {...rowClickProps(() => nav(materialHref(m.id)),
                      `${m.name} — агуулахад ${fmt(hand)}ш, түрээсэнд ${fmt(rent)}ш, дэлгэрэнгүй нээх`,
                      "row")}>
                  <td className="td"><b className="text-ink">{m.name}</b>
                    <span className="block text-xs text-t3">{m.category}
                      {seesMoney && <> · тариф {fmt(m.base_rate)}₮ · засвар {fmt(m.repair_fee)}₮/ш</>}</span></td>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1.5 flex-wrap">
                      {(m.stock || []).map((s: any) => (canAdjust ? (
                        <button key={s.grade_id} title="Тооллогын залруулга"
                          aria-label={`${m.name} · ${s.grade} зэрэглэл — агуулахад ${fmt(s.on_hand)}ш, тооллогын залруулга`}
                          onClick={() => setAdjust({ m, s })}
                          className="pill-grey hover:bg-brand-50 hover:text-brand-ink transition cursor-pointer">
                          {s.grade}: <b className="tabular-nums">{fmt(s.on_hand)}</b>
                        </button>
                      ) : (
                        <span key={s.grade_id} className="pill-grey">
                          {s.grade}: <b className="tabular-nums">{fmt(s.on_hand)}</b>
                        </span>
                      )))}
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
                  {/* Мөр дарагддаг гэдгийг ЗӨВХӨН хулгана дээр нь ирэхэд
                      хэлдэг байвал планшет дээр огт харагдахгүй — тайван
                      боловч ил сум (Гэрээнүүдийн жагсаалттай ижил). */}
                  <td className="td">
                    <div className="flex items-center justify-end gap-2">
                      {/* «БАЙГАА МАТЕРИАЛ ДЭЭР ШИНЭ ТӨРӨЛ НЭМЭХ» гэдгийн зам.
                          Тэр цонхонд зэрэглэл БҮР мөртэй нээгддэг тул шинэ
                          зэрэглэлд үнэ бичихэд энэ материал түүнийг авна.
                          Мөрөн ДЭЭР нь байх нь чухал: Отгоо тэр материалыг
                          ширтэж байхдаа асуудаг болохоос өөр хуудас руу
                          явахаар бодохгүй. */}
                      {isManager && (
                        <button className="btn-ghost btn-row"
                          aria-label={`${m.name} — материал засах (категори, тариф, зэрэглэлийн үнэ)`}
                          onClick={(e) => { e.stopPropagation(); setMatModal(m); }}>Материал засах</button>
                      )}
                      {repair > 0 && canAdjust && (
                        <button className="btn-ghost btn-row text-money"
                          onClick={(e) => {
                            e.stopPropagation();
                            const s = (m.stock || []).find((x: any) => x.in_repair > 0);
                            if (s) setRepair({ m, s });
                          }}>Засвар дуусгах</button>
                      )}
                      <span className="text-t3 group-hover:text-ink transition" aria-hidden="true">→</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Хайлт юу ч олоогүй бол хоосон хүснэгт биш — хайлтаа цэвэрлэх зам */}
        {shown.length === 0 && (q.trim()
          ? <Empty title="Илэрц алга" sub={`«${q}» гэсэн материал, ангилал байхгүй.`}
                   action={{ label: "Хайлт цэвэрлэх", onClick: () => setQ("") }} />
          /* Хоосон каталог дээр «Тохиргооноос нэмнэ» гэж заадаг байв — тэр
             зам нь дарга, санхүүчид ХААЛТТАЙ (Тохиргоо зөвхөн менежерт).
             Одоо менежер эндээсээ эхлүүлнэ, бусад нь хэнээс асуухаа мэднэ. */
          : <Empty title="Материал бүртгэгдээгүй"
                   sub={isManager ? "Эхний материалаа энд бүртгэнэ."
                                  : "Каталогийг Отгоо эгч бүртгэнэ."}
                   action={isManager
                     ? { label: "+ Материал нэмэх", onClick: () => setMatModal({}) }
                     : undefined} />)}
      </div>

      {/* САНХҮҮ — зөвхөн даргад, нөөцийнх нь ХОЙНО. ХУРААНГУЙ ТОО ЭНД
          БАЙХГҮЙ: агуулахын мөнгө нь НЭГ дүн болж нийлдэггүй (нөөцийн
          үнэлгээ гэдэг тоо систем дээр байхгүй) — байхгүй тоог зохиохоос
          нэрлэсэн хаалга нь дээр (UI-ЗАРЧИМ §4: тоо нь утгатай байх ёстой). */}
      {!seesMoney && shown.length > 0 && (
        <FinanceDisclosure name="warehouse"
          hint="Материал бүрийн суурь тариф, засварын хураамж — дарж дэлгэнэ.">
          <FinanceBlock title="Материал бүрийн үнэ">
            <table className="w-full">
              <thead><tr>
                <th className="th">Материал</th>
                <th className="th text-right">Суурь тариф ₮/ш/хоног</th>
                <th className="th text-right">Засвар ₮/ш</th>
              </tr></thead>
              <tbody>
                {shown.map((m: any) => (
                  <tr key={m.id}>
                    <td className="td"><b className="text-ink">{m.name}</b>
                      <span className="block text-xs text-t3">{m.category}</span></td>
                    <td className="td text-right tabular-nums">{money(m.base_rate)}</td>
                    <td className="td text-right tabular-nums">{money(m.repair_fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinanceBlock>
        </FinanceDisclosure>
      )}

      {adjust && (
        <AdjustModal m={adjust.m} s={adjust.s} onClose={() => setAdjust(null)}
                     onDone={() => { setAdjust(null); load(); }} />
      )}
      {repair && (
        <RepairModal m={repair.m} s={repair.s} onClose={() => setRepair(null)}
                     onDone={() => { setRepair(null); load(); }} />
      )}
      {/* Хадгалсны дараа ЭНЭ хуудас өөрөө шинэчлэгдэнэ — Отгоо шинэ материалаа
          жагсаалтад ХАРНА, дахин ачаалах гэж бодохгүй. `load()` нь нөөцийг ба
          (шинэ зэрэглэл нэмэгдсэн бол) зэрэглэлийн жагсаалтыг хоёуланг татна. */}
      {isManager && matModal !== null && (
        <MaterialModal m={matModal} grades={grades} onClose={() => setMatModal(null)}
                       onDone={() => { setMatModal(null); load(); }} />
      )}
      {isManager && gradeModal !== null && (
        <GradeModal g={gradeModal} onClose={() => setGradeModal(null)}
                    onDone={() => { setGradeModal(null); load(); }} />
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
    /* Талбар нь засварт байгаа бүх тоогоор бөглөгдөж нээгддэг — тэр саналыг
       хөндөөгүй бол алдах юм алга. */
    <FormModal title="Засвар дуусгах" onClose={onClose} dirty={val !== String(s.in_repair)}>
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
        <SubmitButton disabled={!qty || over} onSubmit={async () => {
          try {
            await api("/api/stock/repair-done", { method: "POST",
              body: JSON.stringify({ material_id: m.id, grade_id: s.grade_id, qty }) });
            toast("Засвар дууслаа — агуулахад орлоо");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Оруулах</SubmitButton>
      </div>
    </FormModal>
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
    <FormModal title="Тооллогын залруулга" onClose={onClose} dirty={!blank && diff !== 0}>
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
    </FormModal>
  );
}

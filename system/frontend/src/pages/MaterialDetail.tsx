import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmt, user } from "../api";
import { Spinner, Empty } from "../ui";
import { rowClickProps } from "../lib/rowClick";
import { clientHref, contractHref } from "../lib/links";
import { holdingSections, rateLabel, daysLabel } from "../lib/material";
import { mvName } from "../lib/movement";

/* Материалын дэлгэрэнгүй — «энэ хэв ХААНА байна вэ?» гэсэн ганц хариу.
 *
 * Өмнө нь Отгоо энэ асуултад хариулахын тулд гэрээ бүрийг ээлжлэн нээж,
 * материалын мөрийг хайж, толгойдоо нэмдэг байв. Одоо агуулахын мөрөө дараад:
 * агуулахад хэд, гадаа хэд, гадаа байгаа нь ХЭНД (харилцагч, гэрээ, зэрэглэл,
 * тариф, хэзээнээс) байгааг нэг дэлгэцээс уншина.
 *
 * ЭРХ: тариф бүх ролид харагдана. Агуулах бол ҮЙЛДВЭРИЙН ДАРГЫН талбай —
 * гэрээний дэлгэрэнгүйн материалын хүснэгт ч түүнд тарифаа харуулдаг
 * (`seesMoney` нь нэхэмжлэл, төлбөр, барьцаа, авлагыг л нуудаг). Энэ хуудсанд
 * нэхэмжлэл, төлбөр, авлагын аль нь ч байхгүй тул нуух юм ч алга.
 */
export default function MaterialDetail() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const u = user();

  useEffect(() => {
    setD(null);
    setErr(null);
    api(`/api/materials/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);

  const back = <Link to="/warehouse" className="btn-ghost mb-3 inline-flex">← Агуулах руу буцах</Link>;

  /* Байхгүй материал руу орсон хүн эргэлдэгч ширтэж үлдэх ёсгүй. Гарчиг нь
     СЕРВЕРИЙН үг (404 бол «Материал олдсонгүй», сүлжээ тасарвал өөр) — доор нь
     үргэлж гарах зам. Хоёуланг нь өөрөө бичвэл жинхэнэ шалтгаан алдагдана. */
  if (err) return (
    <div>{back}
      <div className="card">
        <Empty title={err} sub="Агуулахын жагсаалтаас материалаа сонгоно уу."
               action={{ label: "Агуулах руу буцах", onClick: () => nav("/warehouse") }} />
      </div>
    </div>
  );
  if (!d) return <Spinner />;

  const sections = holdingSections(d.holdings || []);
  const t = d.totals;
  const unit = d.unit || "ш";
  const many = sections.length > 1;
  const canCount = u?.role !== "finance";

  return (
    <div>
      {back}

      {/* ---------- Толгой ---------- */}
      <div className="card p-6 mb-4">
        <div className="flex gap-5 items-start justify-between flex-wrap">
          <div className="min-w-[230px]">
            <h1 className="text-[22px] font-extrabold text-ink tracking-tight flex items-center gap-2.5 flex-wrap">
              {d.name}
              <span className="pill-grey">{d.category}</span>
            </h1>
            <div className="text-[13px] text-t2 mt-1.5 flex gap-x-4 gap-y-1.5 flex-wrap">
              <span>Хэмжих нэгж: <b className="text-t1">{unit}</b></span>
              <span>Суурь тариф: <b className="text-t1 tabular-nums">{fmt(d.base_rate)}₮/{unit}/хоног</b></span>
              <span>Засвар: <b className="text-t1 tabular-nums">{fmt(d.repair_fee)}₮/{unit}</b></span>
            </div>
          </div>
          {/* НИЙТ ЭЗЭМШИЛ = Агуулахад + Түрээсэнд + Засварт. Дөрвөн тоо нэг
              мөрөнд зогсох нь тэднийг зэрэгцээ дөрвөн үзүүлэлт мэт уншуулж
              байв — үнэндээ эхнийх нь бусад ГУРВЫН НИЙЛБЭР. «=» ба «+» тэмдэг
              тэр харьцааг нүдэнд шууд хэлнэ: Отгоо толгойдоо нэмж шалгах
              шаардлагагүй. Акталсан нь хуваалтад ОРОХГҮЙ (компанийнх байхаа
              больсон) тул энэ мөрөнд ч байхгүй — доод хүснэгтэд харагдана. */}
          <div>
            <div className="flex items-start gap-4 max-sm:gap-3 flex-wrap">
              <Stat label="Нийт эзэмшил" val={fmt(t.total)} unit={unit} strong />
              <Sign>=</Sign>
              <Stat label="Агуулахад" val={fmt(t.on_hand)} unit={unit} />
              <Sign>+</Sign>
              <Stat label="Түрээсэнд" val={fmt(t.out)} unit={unit}
                    sub={t.out > 0 ? `${fmt(t.contracts)} гэрээ · ${fmt(t.clients)} харилцагч` : undefined} />
              <Sign>+</Sign>
              <Stat label="Засварт" val={t.in_repair > 0 ? fmt(t.in_repair) : "—"}
                    unit={t.in_repair > 0 ? unit : ""} warn={t.in_repair > 0} />
            </div>
            <p className="text-[12px] text-t3 mt-2 max-w-[420px]">
              Эзэмшлийн ширхэг бүр эдгээрийн яг нэгэнд зогсоно.
              {t.written_off > 0 && <> Акталсан <b className="text-t2 tabular-nums">{fmt(t.written_off)}{unit}</b> нь
                эзэмшлээс гарсан тул энд ороогүй.</>}
            </p>
          </div>
        </div>
      </div>

      {/* ---------- Хуваарилалт ---------- */}
      <div className="card overflow-x-auto mb-4">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-1 flex-wrap">
          <h2 className="font-bold text-ink text-[15.5px]">Хуваарилалт — хэнд хэд байна</h2>
          <span className="flex items-center gap-1.5 flex-wrap">
            {t.out > 0 && <span className="pill-grey">{fmt(t.out)} {unit} түрээсэнд</span>}
            {/* Ирж буй бараа нь «түрээсэнд» гэсэн тоонд ОРООГҮЙ — тусдаа зогсоно */}
            {t.pending > 0 && <span className="pill-amber">+{fmt(t.pending)} {unit} ачилт хүлээгдэж буй</span>}
          </span>
        </div>
        <table className="w-full min-w-[860px]">
          <thead><tr>
            <th className="th">Харилцагч</th><th className="th">Гэрээ №</th>
            <th className="th">Зэрэглэл</th><th className="th text-right">Түрээсэнд {unit}</th>
            <th className="th text-right">Тариф</th><th className="th">Хэзээнээс</th>
            <th className="th"></th>
          </tr></thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.grade_id}>
                {sec.rows.map((h: any) => (
                  <tr key={`${h.contract_id}-${h.grade_id}`} className="cursor-pointer hover:bg-canvas transition group"
                      {...rowClickProps(() => nav(contractHref(h.contract_id)),
                        `Гэрээ №${h.contract_no} · ${h.client} — ${h.grade} зэрэглэлийн ${
                          h.qty > 0 ? `${fmt(h.qty)}${unit} түрээсэнд` : "мөр"}${
                          h.pending > 0 ? `, ${fmt(h.pending)}${unit} хүлээгдэж буй` : ""}, нээх`,
                        "row")}>
                    {/* Харилцагчийн нэр нь ПРОФАЙЛ руу — мөр өөрөө гэрээ рүү.
                        Хоёр өөр газар очих тул холбоос дарсан товшилтыг мөр
                        авах ёсгүй. */}
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <Link to={clientHref(h.client_id)} className="font-bold text-ink hover:underline">
                        {h.client}
                      </Link>
                    </td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <Link to={contractHref(h.contract_id)} className="text-t1 hover:underline tabular-nums">
                        №{h.contract_no}
                      </Link>
                      {h.status === "closed" && <span className="pill-grey ml-1.5">хаагдсан</span>}
                    </td>
                    <td className="td"><span className="pill-blue">{h.grade}</span></td>
                    {/* Хоёр ТУСДАА тоо: падан болсон нь (түрээсэнд) ба хараахан
                        баталгаажаагүй нь. Нийлүүлбэл аль нь ч итгэл хүлээхээ
                        болино — гэрээний дэлгэрэнгүйн «+Nш хүлээгдэж буй» журам. */}
                    <td className="td text-right tabular-nums font-bold text-ink">
                      {h.qty > 0 ? fmt(h.qty) : <span className="text-t3 font-normal">—</span>}
                      {h.pending > 0 && (
                        <span className="block mt-1">
                          <span className="pill-amber">+{fmt(h.pending)}{unit} хүлээгдэж буй</span>
                        </span>
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {rateLabel(h.rates, fmt)}
                      {/* Хоёроос дээш падан = дундуур нь нэмэлт олголт явсан */}
                      {h.lots > 1 && <span className="block text-[12px] text-t3">{fmt(h.lots)} падан</span>}
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className="tabular-nums text-t1">{h.since}</span>
                      {/* Падангүй мөрийн огноо нь «хэзээнээс гадаа» БИШ —
                          ачилтын огноо. «155 хоног» гэж уншуулбал худал. */}
                      <span className="block text-[12px] text-t3">
                        {h.qty > 0 ? daysLabel(h.days) : "ачилт хүлээгдэж буй"}
                      </span>
                    </td>
                    <td className="td text-t3 group-hover:text-ink transition" aria-hidden="true">→</td>
                  </tr>
                ))}
                {/* Зэрэглэл нэгээс олон бол бүлэг бүрийн дүн — Отгоо «А хэд
                    гадаа байна» гэдгээ хүснэгтээс шууд уншина. */}
                {many && (
                  <tr className="bg-sunken">
                    <td className="td" colSpan={3}>
                      <b className="text-ink">{sec.grade} зэрэглэл — түрээсэнд нийт</b>
                    </td>
                    <td className="td text-right tabular-nums font-extrabold text-ink">{fmt(sec.qty)}</td>
                    <td className="td" colSpan={3}></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {sections.length === 0 && (
          <Empty title="Түрээсэнд гараагүй"
                 sub="Энэ материалын бүх үлдэгдэл агуулахад байна — идэвхтэй гэрээнд гараагүй." />
        )}
      </div>

      {/* ---------- Агуулахад ---------- */}
      <div className="card overflow-x-auto mb-4">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-1 flex-wrap">
          <h2 className="font-bold text-ink text-[15.5px]">Агуулахад — зэрэглэл бүрээр</h2>
          {/* Санхүүч тооллого хийж чадахгүй (сервер 403) — Агуулахын хуудсан
              дээрх журамтай ижил: түүнд эдгээр нь зүгээр л тоо. */}
          {canCount && <Link to="/warehouse/stocktake" className="btn-ghost btn-row">▣ Тооллого хийх</Link>}
        </div>
        {/* Баганын дараалал нь толгойн хуваалттай ИЖИЛ: гурван бүрэлдэхүүн
            зэрэгцээ, дараа нь тэдний нийлбэр. Акталсан нь нийлбэрийн ХОЙНО
            зогсоно — хуваалтад ордоггүй гэдгээ байрлалаараа хэлнэ. */}
        <table className="w-full min-w-[720px]">
          <thead><tr>
            <th className="th">Зэрэглэл</th><th className="th text-right">Агуулахад</th>
            <th className="th text-right">Түрээсэнд</th><th className="th text-right">Засварт</th>
            <th className="th text-right">Нийт эзэмшил</th>
            <th className="th text-right">Акталсан</th>
          </tr></thead>
          <tbody>
            {d.grades.map((g: any) => (
              <tr key={g.grade_id}>
                <td className="td"><span className="pill-blue">{g.grade}</span></td>
                <td className="td text-right tabular-nums">{fmt(g.on_hand)}</td>
                <td className="td text-right tabular-nums">{g.out > 0 ? fmt(g.out) : "—"}</td>
                <td className="td text-right tabular-nums">
                  {g.in_repair > 0 ? <b className="text-warn">{fmt(g.in_repair)}</b> : "—"}
                </td>
                <td className="td text-right tabular-nums font-bold text-ink">{fmt(g.total)}</td>
                <td className="td text-right tabular-nums text-t3">
                  {g.written_off > 0 ? fmt(g.written_off) : "—"}
                </td>
              </tr>
            ))}
            {d.grades.length > 1 && (
              <tr className="bg-sunken">
                <td className="td"><b className="text-ink">Бүгд</b></td>
                <td className="td text-right tabular-nums font-bold">{fmt(t.on_hand)}</td>
                <td className="td text-right tabular-nums font-bold">{fmt(t.out)}</td>
                <td className="td text-right tabular-nums font-bold">{t.in_repair > 0 ? fmt(t.in_repair) : "—"}</td>
                <td className="td text-right tabular-nums font-extrabold text-ink">{fmt(t.total)}</td>
                <td className="td text-right tabular-nums text-t3">{t.written_off > 0 ? fmt(t.written_off) : "—"}</td>
              </tr>
            )}
          </tbody>
        </table>
        {d.grades.length > 0 && (
          <p className="text-[12px] text-t3 px-4 pb-4 pt-1">
            Агуулахад + Түрээсэнд + Засварт = Нийт эзэмшил. Акталсан нь эзэмшлээс
            гарсан тул нийлбэрт ороогүй.
          </p>
        )}
        {d.grades.length === 0 && (
          <Empty title="Нөөц бүртгэгдээгүй"
                 sub="Энэ материалд зэрэглэлийн үлдэгдэл хараахан тогтоогоогүй байна."
                 action={canCount
                   ? { label: "Тооллого хийх", onClick: () => nav("/warehouse/stocktake") }
                   : undefined} />
        )}
      </div>

      {/* ---------- Сүүлийн хөдөлгөөн ---------- */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-1 flex-wrap">
          <h2 className="font-bold text-ink text-[15.5px]">Хөдөлгөөний түүх</h2>
          {/* Жагсаалт тасарсан бол тасарсан гэдгээ ХЭЛНЭ — «нийт 34-ийн 20» */}
          <span className="pill-grey">
            {d.movements_total > d.movements.length
              ? `сүүлийн ${fmt(d.movements.length)} · нийт ${fmt(d.movements_total)}`
              : `${fmt(d.movements_total)} мөр`}
          </span>
        </div>
        <table className="w-full min-w-[760px]">
          <thead><tr>
            <th className="th">Огноо</th><th className="th">Хөдөлгөөн</th>
            <th className="th">Гэрээ / Харилцагч</th><th className="th">Зэрэглэл</th>
            <th className="th text-right">Тоо</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {d.movements.map((mv: any) => {
              const issue = mv.type === "ISSUE";
              const name = mvName(mv.type);
              return (
                <tr key={`${mv.movement_id}-${mv.id}`} className="cursor-pointer hover:bg-canvas transition group"
                    {...rowClickProps(() => nav(contractHref(mv.contract_id)),
                      `${mv.date} · ${name} ${fmt(mv.qty)}${unit} · гэрээ №${mv.contract_no} — нээх`,
                      "row")}>
                  <td className="td whitespace-nowrap tabular-nums">{mv.date}</td>
                  <td className="td">
                    <b className="text-ink">{name}</b>
                    {/* Баталгаажаагүй ачилт үлдэгдэлд ОРООГҮЙ — мөр дээрээ хэлнэ */}
                    {mv.status === "pending" && <span className="pill-amber ml-1.5">хүлээгдэж буй</span>}
                    {!!mv.return_grade && mv.return_grade !== mv.grade && (
                      <span className="text-t3"> → {mv.return_grade}</span>
                    )}
                    {(mv.repair_qty > 0 || mv.writeoff_qty > 0) && (
                      <span className="block text-[12px] text-t3">
                        {mv.repair_qty > 0 && <span className="text-warn">засвар {fmt(mv.repair_qty)}{unit}</span>}
                        {mv.repair_qty > 0 && mv.writeoff_qty > 0 && " · "}
                        {mv.writeoff_qty > 0 && <span className="text-danger">акт {fmt(mv.writeoff_qty)}{unit}</span>}
                      </span>
                    )}
                  </td>
                  {/* Хуваарилалтын хүснэгттэй ИЖИЛ дүрэм: мөр нь гэрээ рүү,
                      харилцагчийн нэр нь профайл руугаа. */}
                  <td className="td">
                    <span className="font-semibold text-ink">№{mv.contract_no}</span>
                    <span className="block text-[12px]" onClick={(e) => e.stopPropagation()}>
                      <Link to={clientHref(mv.client_id)} className="text-t2 hover:underline">{mv.client}</Link>
                    </span>
                  </td>
                  <td className="td"><span className="pill-blue">{mv.grade}</span></td>
                  <td className={`td text-right tabular-nums font-bold ${issue ? "text-ink" : "text-warn"}`}>
                    {issue ? "+" : "−"}{fmt(mv.qty)}
                  </td>
                  <td className="td text-t3 group-hover:text-ink transition" aria-hidden="true">→</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {d.movements.length === 0 && (
          <Empty title="Хөдөлгөөн алга"
                 sub="Энэ материал хараахан ямар ч гэрээгээр гараагүй байна." />
        )}
      </div>
    </div>
  );
}

/** Хуваалтын тэмдэг («=», «+») — тоонуудын ХООРОНДЫН харьцааг хэлдэг тул
 *  дэлгэц уншигчид дахин уншигдах хэрэггүй (нэрсээ өөрсдөө хэлнэ).
 *
 *  Дээрээ ҮЛ ХАРАГДАХ шошготой: `Stat`-ийн шошготой яг ижил өндөр эзэлснээр
 *  тэмдэг нь тоонуудын мөрөнд ЯГ таарч зогсоно. Тоо болгоныг гараар шилжүүлэх
 *  (`mt-[22px]` гэх мэт) нь фонт солигдоход л алдагдана. */
function Sign({ children }: { children: string }) {
  return (
    <div aria-hidden="true" className="select-none shrink-0">
      <div className={STAT_LABEL + " invisible"}>·</div>
      <div className="text-[17px] font-bold text-t3">{children}</div>
    </div>
  );
}

const STAT_LABEL = "text-[12px] text-t3 font-bold uppercase tracking-wider mb-1";

/** Толгойн үзүүлэлт — тоо нь том, нэгж нь хажуудаа тайван. */
function Stat({ label, val, unit, sub, strong, warn }: {
  label: string; val: string; unit?: string; sub?: string; strong?: boolean; warn?: boolean;
}) {
  return (
    <div>
      <div className={STAT_LABEL}>{label}</div>
      <div className={`tabular-nums font-extrabold ${strong ? "text-[22px]" : "text-lg"} ${
        warn ? "text-warn" : "text-ink"}`}>
        {val}{unit && <span className="text-[13px] font-semibold text-t2 ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[12px] text-t2 mt-0.5">{sub}</div>}
    </div>
  );
}

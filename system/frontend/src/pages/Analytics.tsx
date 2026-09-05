import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, money, sayaFmt, user } from "../api";
import { Spinner, useToast, Prog, Refreshing, PageError, Exact } from "../ui";
import { useLive } from "../lib/live";
import { rowClickProps } from "../lib/rowClick";
import { canOpen } from "../lib/guard";
import { materialHref } from "../lib/links";

/** Каталогид үнэ тогтоогоогүй материалын мөр — «0₮ · 0%» гэж бичвэл «энэ хэв
 *  мөнгө олдоггүй» гэж уншигдана. Үнэндээ бид түүнийг ХЭМЖИЖ ЧАДАХГҮЙ. */
const NO_PRICE = "үнэ тогтоогоогүй";

/** Материалын ашигт байдал + мөнгөний урсгалын прогноз. */
export default function Analytics() {
  const [tab, setTab] = useState<"materials" | "forecast">("materials");
  const [months, setMonths] = useState(6);
  const [mat, setMat] = useState<any>(null);
  const [matBusy, setMatBusy] = useState(false);
  const [matErr, setMatErr] = useState<string | null>(null);
  const [fc, setFc] = useState<any>(null);
  const [fcBusy, setFcBusy] = useState(false);
  const [fcErr, setFcErr] = useState<string | null>(null);
  const toast = useToast();

  /* Хоёр эх сурвалж хоёулаа амьд. Сар солиход хүснэгтийг null болгож бүтэн
     хуудсыг эргэлдэгчээр солидог байв — одоо өмнөх мөрүүд байрандаа үлдэж
     бүдгэрнэ; фонд шинэчлэлт нь тэр ч бүдгэрүүлгийг гаргахгүй.

     ⚠ ИДЭВХГҮЙ ТАБ ТАТАХГҮЙ. Урьд нь прогноз нь хуудас нээгдмэгц (мөн минут
     тутам) татагддаг байсан — тэр хүсэлт нь 90 хоногийн урсгалыг бүхэлд нь
     боддог, атал Отгоо түүн рүү огт орохгүй байж болно. */
  const loadMat = (bg: boolean) => {
    if (tab !== "materials") return;
    if (!bg) setMatBusy(true);
    api(`/api/reports/materials?months=${months}`)
      .then((v: any) => { setMat(v); setMatErr(null); })
      .catch((e: any) => { if (!bg) { toast(e.message, "err"); setMatErr(e.message); } })
      .finally(() => { if (!bg) setMatBusy(false); });
  };
  const loadFc = (bg: boolean) => {
    if (tab !== "forecast") return;
    if (!bg) setFcBusy(true);
    api("/api/reports/forecast")
      .then((v: any) => { setFc(v); setFcErr(null); })
      /* Прогноз ЧИМЭЭГҮЙ УНАДАГ байв (`.catch(() => {})`): сервер 500
         буцаахад таб нь «Ачаалж байна…» дээр ҮҮРД зогсоно. */
      .catch((e: any) => { if (!bg) { toast(e.message, "err"); setFcErr(e.message); } })
      .finally(() => { if (!bg) setFcBusy(false); });
  };
  useLive(loadMat, [months, tab]);
  useLive(loadFc, [tab]);

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">АНАЛИТИК <span>•</span> ХӨРӨНГӨ БА МӨНГӨ</div>
          <h1 className="dashboard-title">Аналитик</h1>
          <p className="dashboard-subtitle">Аль материал мөнгө олж байна, ойрын мөнгө хүрэлцэх үү.</p>
        </div>
        <div className="flex gap-2.5 items-center">
          <div className="segment">
            <button className={tab === "materials" ? "on" : ""} onClick={() => setTab("materials")}>Материалын өгөөж</button>
            <button className={tab === "forecast" ? "on" : ""} onClick={() => setTab("forecast")}>Мөнгөний прогноз</button>
          </div>
        </div>
      </div>

      {tab === "materials"
        ? (matErr && !mat
            ? <PageError error={matErr} onRetry={() => { setMatErr(null); loadMat(false); }} />
            : <Materials d={mat} busy={matBusy} months={months} setMonths={setMonths} />)
        : (fcErr && !fc
            ? <PageError error={fcErr} onRetry={() => { setFcErr(null); loadFc(false); }} />
            : <Forecast d={fc} busy={fcBusy} />)}
    </div>
  );
}

/* ------------------------- Материалын өгөөж ------------------------- */
/** Ашиглалтын өнгө нь дангаараа утга зөөж байсан (улаан/улбар/ногоон). Улаан
 *  ногоог ялгадаггүй хүнд, хэвлэсэн цаасан дээр тэр утга алга болно — ҮГ нь
 *  авч явж, өнгө нь ард нь дэмжинэ (Гэрээнүүдийн мөртэй ижил дүрэм). */
const utilWord = (p: number) => (p < 20 ? "бага" : p < 50 ? "дунд" : "хэвийн");

function Materials({ d, busy, months, setMonths }: any) {
  const nav = useNavigate();
  const u = user();
  if (!d) return <Spinner />;   // ЗӨВХӨН анхны ачаалал
  const t = d.totals;
  const worst = d.rows.filter((r: any) => r.utilization < 20 && r.idle_value > 0).slice(0, 3);
  /* Каталогид үнэгүй материал нь БҮХ мөнгөн баганаа 0 болгодог. Тохиргоо руу
     очих зам нь ЗӨВХӨН менежерт нээлттэй (сервер ч, чиглүүлэгч ч) —
     санхүүчид худал холбоос үзүүлэхгүй. */
  const canPrice = canOpen("/settings", u?.role);
  const noPrice = (
    <>
      <span className="text-t3">{NO_PRICE}</span>
      {canPrice && (
        <Link to="/settings" className="block text-[12px] text-brand-ink font-semibold hover:underline"
              onClick={(e) => e.stopPropagation()}>Тохиргооноос үнэ оруулах →</Link>
      )}
    </>
  );

  return (
    <Refreshing busy={busy}>
      <div className="command-metrics mb-4">
        <div className="command-hero">
          <div className="text-white/80 text-[12.5px] font-medium mb-2">Хөрөнгийн нийт үнэ</div>
          {t.asset_value > 0 ? (
            <>
              <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight"
                   title={money(t.asset_value)}>
                {sayaFmt(t.asset_value)} <span className="text-sm text-white/70 font-semibold">₮</span>
              </div>
              <Exact n={t.asset_value} className="text-white/70" />
            </>
          ) : (
            /* Каталогид НБ үнэ огт тогтоогоогүй бол «0₮» гэдэг нь «хөрөнгө
               байхгүй» гэж уншигдана — үнэндээ бид ХЭМЖИЖ ЧАДАХГҮЙ. */
            <div className="text-[19px] font-bold text-white/85 leading-tight">
              {NO_PRICE}
              {canPrice && (
                <Link to="/settings" className="block text-[12.5px] font-semibold text-white underline mt-1">
                  Тохиргооноос үнэ оруулах →
                </Link>
              )}
            </div>
          )}
          {/* «олсон» нь ЦУГЛУУЛСАН МӨНГӨ гэж уншигддаг байв — үнэндээ энэ нь
              ХУРИМТЛАЛ (30 × сарын хоног) бөгөөд нэхэмжлэгдсэн эсэхээс үл
              хамаарна. Тайлангийн «Түрээсийн орлого»-той андуурвал хоёр өөр
              тоо нэг нэрээр яригдана. */}
          <div className="mt-2"><span className="pill bg-white/10 text-white/80"
                                     title={money(t.revenue)}>
            Сүүлийн {months} сарын түрээсийн тооцоо (нэхэмжлэлээс үл хамааран) {sayaFmt(t.revenue)}₮</span></div>
          <div className="text-[12px] text-white/70 tabular-nums mt-1">яг {fmt(t.revenue)}₮</div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Ерөнхий ашиглалт</div>
          <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">
            {t.utilization}<span className="text-sm text-t2 font-semibold"> %</span></div>
          <div className="mt-3"><Prog pct={t.utilization} label={`Ерөнхий ашиглалт ${t.utilization}%`}
                                      color={t.utilization < 40 ? "#C9363B" : "#1F8B69"} /></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хэвтэж буй хөрөнгө</div>
          <div className="text-[28px] font-extrabold text-danger tabular-nums leading-tight"
               title={money(t.idle_value)}>
            {sayaFmt(t.idle_value)} <span className="text-sm text-t2 font-semibold">₮</span></div>
          <Exact n={t.idle_value} />
          <div className="mt-2"><span className="pill-red">агуулахад зогсонги</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хугацаа</div>
          <div className="segment mt-1">
            {[3, 6, 12].map((m) => (
              <button key={m} className={months === m ? "on" : ""} onClick={() => setMonths(m)}>{m} сар</button>
            ))}
          </div>
        </div>
      </div>

      {worst.length > 0 && (
        <div className="card p-4 mb-4" style={{ borderTop: "2px solid #C9363B" }}>
          <b className="text-[13.5px] text-ink">Хамгийн бага ашиглалттай:</b>
          {/* Нэр нь мухардмал текст байв — материал бүр өөрийн хуудастай */}
          <span className="text-[13px] text-t2">
            {worst.map((r: any, i: number) => (
              <span key={r.material_id}>
                {i > 0 && " · "}
                <Link to={materialHref(r.material_id)} className="font-semibold text-ink hover:underline">
                  {r.material}
                </Link>
                {` (${r.utilization}% · ${sayaFmt(r.idle_value)}₮ хэвтэж байна)`}
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead><tr>
            <th className="th">Материал</th>
            <th className="th text-right">Эзэмшиж буй</th>
            <th className="th text-right">Түрээсэнд</th>
            <th className="th">Ашиглалт</th>
            <th className="th text-right">Хөрөнгийн үнэ</th>
            <th className="th text-right">{months} сарын орлого</th>
            <th className="th text-right">Өгөөж</th>
            <th className="th text-right">Жилээр</th>
            <th className="th"></th>
          </tr></thead>
          <tbody>
            {d.rows.map((r: any) => (
              /* Агуулахын жагсаалттай ИЖИЛ дүрэм: мөр бүхэлдээ материалын
                 дэлгэрэнгүй рүү — «энэ хэв хэнд байна» гэдгийг эндээс шууд. */
              <tr key={r.material_id} className="cursor-pointer hover:bg-canvas transition group"
                  {...rowClickProps(() => nav(materialHref(r.material_id)),
                    `${r.material} — ашиглалт ${r.utilization}%, дэлгэрэнгүй нээх`, "row")}>
                <td className="td"><b className="text-ink">{r.material}</b>
                  <span className="block text-xs text-t3">{r.category}
                    {r.in_repair > 0 && <span className="text-warn"> · засварт {r.in_repair}</span>}</span></td>
                <td className="td text-right tabular-nums">{money(r.owned).replace("₮", "")}ш</td>
                <td className="td text-right tabular-nums">{money(r.on_rent).replace("₮", "")}ш</td>
                <td className="td min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><Prog pct={r.utilization}
                      label={`${r.material} — ашиглалт ${r.utilization}% (${utilWord(r.utilization)})`}
                      color={r.utilization < 20 ? "#C9363B" : r.utilization < 50 ? "#F88712" : "#1F8B69"} /></div>
                    <span className="tabular-nums text-[12px] w-[74px] text-right whitespace-nowrap">
                      {r.utilization}%
                      <b className={r.utilization < 20 ? "text-danger" : r.utilization < 50 ? "text-warn" : "text-money"}>
                        {" · "}{utilWord(r.utilization)}
                      </b>
                    </span>
                  </div>
                </td>
                {/* Үнэгүй материал дээр «0₮ · 0%» гэж бичвэл «энэ хэв мөнгө
                    олдоггүй» гэж уншигдана — үнэндээ хэмжих суурь нь алга. */}
                <td className="td text-right tabular-nums text-t2" title={money(r.asset_value)}>
                  {r.asset_value > 0 ? <>{sayaFmt(r.asset_value)}₮<Exact n={r.asset_value} /></> : noPrice}
                </td>
                <td className="td text-right tabular-nums font-bold text-ink" title={money(r.revenue)}>
                  {sayaFmt(r.revenue)}₮<Exact n={r.revenue} />
                </td>
                <td className="td text-right tabular-nums">
                  {r.asset_value > 0 ? (
                    <b className={r.yield_percent < 3 ? "text-danger" : r.yield_percent > 10 ? "text-money" : ""}>
                      {r.yield_percent}%
                    </b>
                  ) : <span className="text-t3">—</span>}
                </td>
                <td className="td text-right tabular-nums text-t2">
                  {r.asset_value > 0 ? `${r.annual_yield}%` : "—"}
                </td>
                <td className="td text-t3 group-hover:text-ink transition" aria-hidden="true">→</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-t3 mt-3 leading-relaxed">
        «{months} сарын түрээсийн тооцоо» = тухайн хугацаанд хуримтлагдсан түрээс
        ба худалдааны дүн — НЭХЭМЖЛЭГДСЭН эсэхээс үл хамаарна (Тайлангийн
        «Түрээсийн орлого» нь нэхэмжилсэн дүн — хоёр өөр тоо).
        Өгөөж = тэр дүн ÷ материалын НБҮнэ. Жилээр = түүнийг 12 сард шилжүүлсэн.
        Каталогид үнэ тогтоогоогүй материалын өгөөжийг хэмжих боломжгүй.
      </p>
    </Refreshing>
  );
}

/* ------------------------- Мөнгөний прогноз ------------------------- */
function Forecast({ d, busy }: any) {
  if (!d) return <Spinner />;
  /* ЭРСДЭЛТ ЦОНХЫГ СЕРВЕР СОНГОНО (`risk_month`). Дэлгэц нь `find(...)`-ээр
     ХАМГИЙН ЭХНИЙ хасагдалтай хувинг авдаг байсан; сервер нь ХАМГИЙН ГҮНийг
     сонгодог. Хоёр нь ялгаатай байж болно: 31–60 нь −2 сая, 61–90 нь −40 сая
     бол «эхнийх» нь аюулыг дутуу хэлнэ. Нэг фактыг хоёр газар бодохоо болив. */
  const risk = d.risk
            ?? (d.risk_month ? d.buckets.find((b: any) => b.label === d.risk_month) : null)
            ?? null;

  return (
    <Refreshing busy={!!busy}>
      {risk ? (
        <div className="card p-5 mb-4" style={{ borderTop: "3px solid #C9363B" }}>
          <b className="text-danger text-[15px]">⚠ {risk.label} дотор мөнгө хүрэлцэхгүй байх магадлалтай</b>
          <p className="text-[13px] text-t2 mt-1">
            Хуримтлагдсан зөрүү <b className="text-danger tabular-nums">{money(risk.cumulative)}</b>.
            Авлагаа эрчимжүүлэх, эсвэл бартер хөрөнгөө зарах хэрэгтэй.
          </p>
        </div>
      ) : (
        <div className="card p-5 mb-4" style={{ borderTop: "3px solid #1F8B69" }}>
          <b className="text-money text-[15px]">✓ Ойрын 90 хоногт мөнгө хүрэлцэнэ</b>
          <p className="text-[13px] text-t2 mt-1">
            Нэхэмжлэлүүд хугацаандаа төлөгдвөл 90 хоногийн эцэст{" "}
            <b className="text-money tabular-nums">{money(d.buckets[2].cumulative)}</b> үлдэнэ.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3.5 mb-4 max-lg:grid-cols-1">
        {d.buckets.map((b: any) => (
          <div key={b.label} className="card p-5">
            <div className="text-[12px] font-bold uppercase tracking-wider text-t3 mb-3">{b.label}</div>
            <div className="flex justify-between items-baseline py-1.5 border-b border-line">
              <span className="text-[13px] text-t2">Орох</span>
              <b className="tabular-nums text-money">{money(b.inflow)}</b>
            </div>
            <div className="flex justify-between items-baseline py-1.5 border-b border-line">
              <span className="text-[13px] text-t2">Гарах</span>
              <b className="tabular-nums text-danger">−{money(b.outflow)}</b>
            </div>
            <div className="flex justify-between items-baseline py-2">
              <span className="text-[13px] font-semibold text-ink">Зөрүү</span>
              <b className={`tabular-nums text-[15px] ${b.net >= 0 ? "text-money" : "text-danger"}`}>
                {b.net >= 0 ? "+" : ""}{money(b.net)}
              </b>
            </div>
            <div className="rounded-lg px-3 py-2 flex justify-between items-center"
                 style={{ background: b.cumulative >= 0 ? "#E4F4EE" : "#FBE6E7" }}>
              <span className="text-[12px] text-t2">Хуримтлагдсан</span>
              <b className={`tabular-nums ${b.cumulative >= 0 ? "text-money" : "text-danger"}`}>
                {money(b.cumulative)}
              </b>
            </div>
            {(b.items_in.length > 0 || b.items_out.length > 0) && (
              <div className="mt-3 pt-3 border-t border-line">
                {b.items_in.slice(0, 4).map((i: any, k: number) => (
                  <div key={"i" + k} className="flex justify-between gap-2 py-0.5 text-[12px]">
                    <span className="text-t3 truncate">{i.label}</span>
                    <b className="tabular-nums text-money shrink-0" title={money(i.amount)}>+{sayaFmt(i.amount)}</b>
                  </div>
                ))}
                {b.items_out.slice(0, 3).map((i: any, k: number) => (
                  <div key={"o" + k} className="flex justify-between gap-2 py-0.5 text-[12px]">
                    <span className="text-t3 truncate">{i.label}</span>
                    <b className="tabular-nums text-danger shrink-0" title={money(i.amount)}>−{sayaFmt(i.amount)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 mb-1.5">Хугацаа хэтэрсэн авлага</div>
          <div className="text-[22px] font-extrabold text-danger tabular-nums"
               title={money(d.overdue_inflow)}>{sayaFmt(d.overdue_inflow)}₮</div>
          <Exact n={d.overdue_inflow} />
          <p className="text-[12px] text-t3 mt-1">Хэзээ орж ирэх нь тодорхойгүй тул прогнозод ороогүй.</p>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 mb-1.5">Хуучин үлдэгдэл</div>
          <div className="text-[22px] font-extrabold text-warn tabular-nums"
               title={money(d.legacy_inflow || 0)}>{sayaFmt(d.legacy_inflow || 0)}₮</div>
          <Exact n={d.legacy_inflow || 0} />
          <p className="text-[12px] text-t3 mt-1">Шилжүүлсэн авлага — цуглуулбал нэмэлт мөнгө.</p>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 mb-1.5">Сарын зээлийн төлбөр</div>
          <div className="text-[22px] font-extrabold text-ink tabular-nums"
               title={money(d.monthly_loan_due)}>{sayaFmt(d.monthly_loan_due)}₮</div>
          <Exact n={d.monthly_loan_due} />
          <p className="text-[12px] text-t3 mt-1">Хүүгийн тогтмол дарамт.</p>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 mb-1.5">Сарын цалингийн сан</div>
          <div className="text-[22px] font-extrabold text-ink tabular-nums"
               title={money(d.monthly_salary)}>{sayaFmt(d.monthly_salary)}₮</div>
          <Exact n={d.monthly_salary} />
          <p className="text-[12px] text-t3 mt-1">Сард 2 удаа хуваарилагдана.</p>
        </div>
      </div>
    </Refreshing>
  );
}

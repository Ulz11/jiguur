import { useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, useToast, Prog, Empty } from "../ui";
import { useLive } from "../lib/live";

/** Материалын ашигт байдал + мөнгөний урсгалын прогноз. */
export default function Analytics() {
  const [tab, setTab] = useState<"materials" | "forecast">("materials");
  const [months, setMonths] = useState(6);
  const [mat, setMat] = useState<any>(null);
  const [fc, setFc] = useState<any>(null);
  const toast = useToast();

  // Хоёр эх сурвалж хоёулаа амьд: сар солигдоход эргэлдэгчтэй, фонд чимээгүй.
  useLive((bg) => {
    if (!bg) setMat(null);
    api(`/api/reports/materials?months=${months}`).then(setMat)
      .catch((e) => { if (!bg) toast(e.message, "err"); });
  }, [months]);
  useLive(() => { api("/api/reports/forecast").then(setFc).catch(() => {}); }, []);

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

      {tab === "materials" ? <Materials d={mat} months={months} setMonths={setMonths} />
                           : <Forecast d={fc} />}
    </div>
  );
}

/* ------------------------- Материалын өгөөж ------------------------- */
function Materials({ d, months, setMonths }: any) {
  if (!d) return <Spinner />;
  const t = d.totals;
  const worst = d.rows.filter((r: any) => r.utilization < 20 && r.idle_value > 0).slice(0, 3);

  return (
    <div>
      <div className="command-metrics mb-4">
        <div className="command-hero">
          <div className="text-white/60 text-[12.5px] font-medium mb-2">Хөрөнгийн нийт үнэ</div>
          <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight">
            {sayaFmt(t.asset_value)} <span className="text-sm text-white/40 font-semibold">₮</span>
          </div>
          <div className="mt-2"><span className="pill bg-white/10 text-white/80">
            {months} сард {sayaFmt(t.revenue)}₮ олсон</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Ерөнхий ашиглалт</div>
          <div className="text-[28px] font-extrabold text-ink tabular-nums leading-tight">
            {t.utilization}<span className="text-sm text-t2 font-semibold"> %</span></div>
          <div className="mt-3"><Prog pct={t.utilization} color={t.utilization < 40 ? "#C9363B" : "#1F8B69"} /></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хэвтэж буй хөрөнгө</div>
          <div className="text-[28px] font-extrabold text-danger tabular-nums leading-tight">
            {sayaFmt(t.idle_value)} <span className="text-sm text-t2 font-semibold">₮</span></div>
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
          <span className="text-[13px] text-t2">
            {" "}{worst.map((r: any) => `${r.material} (${r.utilization}% · ${sayaFmt(r.idle_value)}₮ хэвтэж байна)`).join(" · ")}
          </span>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead><tr>
            <th className="th">Материал</th>
            <th className="th text-right">Эзэмшиж буй</th>
            <th className="th text-right">Түрээсэнд</th>
            <th className="th">Ашиглалт</th>
            <th className="th text-right">Хөрөнгийн үнэ</th>
            <th className="th text-right">{months} сарын орлого</th>
            <th className="th text-right">Өгөөж</th>
            <th className="th text-right">Жилээр</th>
          </tr></thead>
          <tbody>
            {d.rows.map((r: any) => (
              <tr key={r.material_id}>
                <td className="td"><b className="text-ink">{r.material}</b>
                  <span className="block text-xs text-t3">{r.category}
                    {r.in_repair > 0 && <span className="text-warn"> · засварт {r.in_repair}</span>}</span></td>
                <td className="td text-right tabular-nums">{money(r.owned).replace("₮", "")}ш</td>
                <td className="td text-right tabular-nums">{money(r.on_rent).replace("₮", "")}ш</td>
                <td className="td min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><Prog pct={r.utilization}
                      color={r.utilization < 20 ? "#C9363B" : r.utilization < 50 ? "#F88712" : "#1F8B69"} /></div>
                    <span className="tabular-nums text-[12px] w-10 text-right">{r.utilization}%</span>
                  </div>
                </td>
                <td className="td text-right tabular-nums text-t2">{sayaFmt(r.asset_value)}₮</td>
                <td className="td text-right tabular-nums font-bold text-ink">{sayaFmt(r.revenue)}₮</td>
                <td className="td text-right tabular-nums">
                  <b className={r.yield_percent < 3 ? "text-danger" : r.yield_percent > 10 ? "text-money" : ""}>
                    {r.yield_percent}%
                  </b>
                </td>
                <td className="td text-right tabular-nums text-t2">{r.annual_yield}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-t3 mt-3 leading-relaxed">
        Өгөөж = тухайн үед олсон түрээс/худалдааны орлого ÷ материалын НБҮнэ.
        Жилээр = түүнийг 12 сард шилжүүлсэн. Бага өгөөжтэй, бага ашиглалттай материалыг
        зарах эсвэл үнээ өөрчлөх талаар бодох хэрэгтэй.
      </p>
    </div>
  );
}

/* ------------------------- Мөнгөний прогноз ------------------------- */
function Forecast({ d }: any) {
  if (!d) return <Spinner />;
  const risk = d.buckets.find((b: any) => b.cumulative < 0);

  return (
    <div>
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
            <div className="text-[11px] font-bold uppercase tracking-wider text-t3 mb-3">{b.label}</div>
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
                  <div key={"i" + k} className="flex justify-between gap-2 py-0.5 text-[11.5px]">
                    <span className="text-t3 truncate">{i.label}</span>
                    <b className="tabular-nums text-money shrink-0">+{sayaFmt(i.amount)}</b>
                  </div>
                ))}
                {b.items_out.slice(0, 3).map((i: any, k: number) => (
                  <div key={"o" + k} className="flex justify-between gap-2 py-0.5 text-[11.5px]">
                    <span className="text-t3 truncate">{i.label}</span>
                    <b className="tabular-nums text-danger shrink-0">−{sayaFmt(i.amount)}</b>
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
          <div className="text-[22px] font-extrabold text-danger tabular-nums">{sayaFmt(d.overdue_inflow)}₮</div>
          <p className="text-[11.5px] text-t3 mt-1">Хэзээ орж ирэх нь тодорхойгүй тул прогнозод ороогүй.</p>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 mb-1.5">Хуучин үлдэгдэл</div>
          <div className="text-[22px] font-extrabold text-warn tabular-nums">{sayaFmt(d.legacy_inflow || 0)}₮</div>
          <p className="text-[11.5px] text-t3 mt-1">Шилжүүлсэн авлага — цуглуулбал нэмэлт мөнгө.</p>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 mb-1.5">Сарын зээлийн төлбөр</div>
          <div className="text-[22px] font-extrabold text-ink tabular-nums">{sayaFmt(d.monthly_loan_due)}₮</div>
          <p className="text-[11.5px] text-t3 mt-1">Хүүгийн тогтмол дарамт.</p>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 mb-1.5">Сарын цалингийн сан</div>
          <div className="text-[22px] font-extrabold text-ink tabular-nums">{sayaFmt(d.monthly_salary)}₮</div>
          <p className="text-[11.5px] text-t3 mt-1">Сард 2 удаа хуваарилагдана.</p>
        </div>
      </div>
    </div>
  );
}

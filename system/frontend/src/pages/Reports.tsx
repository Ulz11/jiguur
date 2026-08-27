import { useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, useToast, Refreshing } from "../ui";
import { useDownload } from "../lib/docs";
import { useLive } from "../lib/live";

export default function Reports() {
  const [months, setMonths] = useState(6);
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const dl = useDownload();

  /* Сар солиход `setD(null)` хийж БҮТЭН хуудсыг нурааж байв: Отгоо 6 сарын
     тайлангаа хараад 12 руу дарахад дэлгэц хоосорч, юутай харьцуулж байснаа
     алддаг. Одоо өмнөх тоо байрандаа үлдэж, зөвхөн бүдгэрнэ. */
  const load = (m: number) => {
    setBusy(true);
    return api(`/api/reports?months=${m}`).then(setD)
      .catch((e) => toast(e.message, "err"))
      .finally(() => setBusy(false));
  };
  /** Фонд шинэчлэх — бүдгэрүүлэг ч гаргахгүй, алдааг чимээгүй залгина. */
  const refresh = (m: number) => api(`/api/reports?months=${m}`).then(setD).catch(() => {});
  useLive((bg) => (bg ? refresh(months) : load(months)), [months]);
  if (!d) return <Spinner />;   // ЗӨВХӨН анхны ачаалал
  const p = d.pnl;

  /* Тайлан бүрдүүлэхэд сервер хэдэн секунд бодно — товч дуугүй зогсох ёсгүй.
     Алдаа гарвал өмнө нь алдааны JSON нь «jiguur-tailan.xlsx» болж диск рүү
     бууж, юу болсныг хаанаас ч мэдэхгүй байв. */
  const exportPath = `/api/reports/export.xlsx?months=${months}`;

  return (
    <Refreshing busy={busy}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-ink tracking-tight">Тайлан</h1>
          <p className="text-t3 text-[13px] mt-0.5">{p.from} — {p.to} · түрээс дууссан циклээр, зардал төлөгдсөнөөр</p>
        </div>
        <div className="flex gap-2.5 items-center flex-wrap">
          <div className="segment">
            {[3, 6, 12].map((m) => (
              <button key={m} onClick={() => setMonths(m)} className={months === m ? "on" : ""}>{m} сар</button>
            ))}
          </div>
          <button className="btn-secondary" disabled={dl.busy}
                  aria-busy={dl.busyPath === exportPath || undefined}
                  onClick={() => dl.download(exportPath, "jiguur-tailan.xlsx")}>
            {dl.busyPath === exportPath ? "Бэлтгэж байна…" : "⇩ Excel татах"}
          </button>
        </div>
      </div>

      {/* Bento stat cards */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        <div className="card p-5 col-span-3 max-lg:col-span-6 max-sm:col-span-12">
          <div className="text-[12px] text-t3 font-medium mb-1.5 flex items-center gap-2">
            <span className="cdot" style={{ background: "#2BBA82", boxShadow: "0 0 0 3px #E0F5EC" }} />Нийт орлого
          </div>
          <div className="text-[28px] font-bold tracking-tight text-ink tabular-nums">
            {sayaFmt(p.total_income)}<span className="text-[15px] text-t3 font-medium ml-1">₮</span>
          </div>
          <div className="text-[12px] text-t3 mt-1">түрээс + худалдаа + механизм</div>
        </div>
        <div className="card p-5 col-span-3 max-lg:col-span-6 max-sm:col-span-12">
          <div className="text-[12px] text-t3 font-medium mb-1.5 flex items-center gap-2">
            <span className="cdot" style={{ background: "#E5484D", boxShadow: "0 0 0 3px #FBE2E3" }} />Нийт зардал
          </div>
          <div className="text-[28px] font-bold tracking-tight text-ink tabular-nums">
            {sayaFmt(p.total_expense)}<span className="text-[15px] text-t3 font-medium ml-1">₮</span>
          </div>
          <div className="text-[12px] text-t3 mt-1">цалин + хүү + зарлага</div>
        </div>
        <div className="card p-5 col-span-3 max-lg:col-span-6 max-sm:col-span-12">
          <div className="text-[12px] text-t3 font-medium mb-1.5 flex items-center gap-2">
            <span className="cdot" style={{ background: "#8B5CF6", boxShadow: "0 0 0 3px #EFE7FE" }} />Бартерын үр дүн
          </div>
          <div className={`text-[28px] font-bold tracking-tight tabular-nums ${p.barter_result < 0 ? "text-danger" : "text-money"}`}>
            {p.barter_result > 0 ? "+" : ""}{sayaFmt(p.barter_result)}<span className="text-[15px] text-t3 font-medium ml-1">₮</span>
          </div>
          <div className="text-[12px] text-t3 mt-1">зарагдсан хөрөнгийн зөрүү</div>
        </div>
        <div className="card hero p-5 col-span-3 max-lg:col-span-6 max-sm:col-span-12">
          <div className="text-[12px] text-white/80 font-medium mb-1.5">Цэвэр үр дүн</div>
          <div className="text-[30px] font-bold tracking-tight tabular-nums text-white">
            {p.net >= 0 ? "+" : ""}{sayaFmt(p.net)}<span className="text-[15px] text-white/75 font-medium ml-1">₮</span>
          </div>
          <div className="mt-1.5">
            <span className={`pill ${p.net >= 0 ? "" : ""}`}
                  style={{ background: "rgba(255,255,255,.12)", color: p.net >= 0 ? "#7de8b8" : "#ffb3b6" }}>
              {p.net >= 0 ? "ашигтай ажиллав" : "алдагдалтай"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 items-start">
        {/* P&L statement */}
        <div className="card p-6 col-span-5 max-lg:col-span-12">
          <h3 className="font-bold text-ink text-[14px] mb-4 flex items-center gap-2"><span className="cdot" />Ашиг, алдагдлын тайлан</h3>
          <Sect label="Орлого" />
          <Row label="Түрээсийн орлого" val={p.rent_income} />
          <Row label="Худалдааны орлого" val={p.sale_income} />
          <Row label="Механизмын орлого" val={p.machine_income} />
          <Row label="Алдангийн орлого" val={p.penalty_income} />
          <Total label="Нийт орлого" val={p.total_income} tone="money" />
          <Sect label="Зардал" cls="mt-5" />
          <Row label="Цалин" val={-p.salary_expense} />
          <Row label="Зээлийн хүү" val={-p.interest_expense} />
          <Row label="Механизмын зарлага" val={-p.machine_expense} />
          <Total label="Нийт зардал" val={-p.total_expense} tone="danger" />
          <div className="mt-5" />
          <Row label="Бартерын хэрэгжсэн үр дүн" val={p.barter_result} colored />
          <div className="mt-4 rounded-2xl px-4 py-3.5 flex justify-between items-center"
               style={{ background: "linear-gradient(135deg,#0b2545,#1e3a6e)" }}>
            <b className="text-[13px] text-white/80 uppercase tracking-wide">Цэвэр үр дүн</b>
            <b className={`text-[22px] tabular-nums font-bold ${p.net >= 0 ? "text-[#7de8b8]" : "text-[#ffb3b6]"}`}>
              {p.net >= 0 ? "+" : ""}{money(p.net)}
            </b>
          </div>
          {p.accruing > 0 && (
            <div className="mt-4 rounded-xl px-4 py-3 bg-brand-50 flex justify-between items-center">
              <span className="text-[12.5px] text-t1">
                Дуусаагүй циклүүдэд хуримтлагдаж буй
                <span className="block text-[12px] text-t3">цикл хаагдмагц орлогод бүртгэгдэнэ</span>
              </span>
              <b className="tabular-nums text-brand-ink text-[15px]">{money(p.accruing)}</b>
            </div>
          )}
          <p className="text-[12px] text-t3 mt-4 leading-relaxed">
            Нийт өглөг (зээл): {sayaFmt(d.loans_total)}₮ — үр дүнд орохгүй, хүү нь зардалд орсон.
            Хуучин системээс шилжсэн үлдэгдэл орлогод тооцогдохгүй (авлагад л харагдана).
          </p>
        </div>

        {/* Cashflow */}
        <div className="card p-6 col-span-7 max-lg:col-span-12">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-ink text-[14px] flex items-center gap-2"><span className="cdot" />Мөнгөн урсгал — сүүлийн 6 сар</h3>
          </div>
          <p className="text-[12px] text-t3 mb-3">Орсон: харилцагчийн төлбөр + механизм · Гарсан: зарлага + хүү + цалин</p>
          <CashBars s={d.series} />
        </div>
      </div>
    </Refreshing>
  );
}

function Sect({ label, cls = "" }: any) {
  return <div className={`text-[12px] font-bold uppercase tracking-wider text-t3 pb-1.5 border-b border-line ${cls}`}>{label}</div>;
}
function Row({ label, val, colored }: any) {
  const cls = colored ? (val >= 0 ? "text-money" : "text-danger") : "text-ink";
  return (
    <div className="flex justify-between items-center py-2 border-b border-line/60">
      <span className="text-[13px] text-t2">{label}</span>
      <b className={`tabular-nums text-[13px] ${cls}`}>{val > 0 && colored ? "+" : ""}{money(val)}</b>
    </div>
  );
}
function Total({ label, val, tone }: any) {
  return (
    <div className="flex justify-between items-center py-2.5 mt-0.5 rounded-xl px-2 -mx-2"
         style={{ background: tone === "money" ? "#E0F5EC" : "#FBE2E3" }}>
      <b className={`text-[13px] ${tone === "money" ? "text-money" : "text-danger"}`}>{label}</b>
      <b className={`tabular-nums text-[14.5px] ${tone === "money" ? "text-money" : "text-danger"}`}>{money(val)}</b>
    </div>
  );
}

const CASH_C = "#1f8b69", BANK_C = "#253886", BARTER_C = "#f88712", OUT_C = "#E5484D";

function CashBars({ s }: {
  s: {
    months: string[]; cash_in: number[]; cash_out: number[];
    inflow_cash?: number[]; inflow_bank?: number[]; inflow_barter?: number[];
  }
}) {
  // Задаргаагүй хуучин payload ирвэл нэг бүхэл “орсон” багана харагдана — хуудас унахгүй
  const fc = s.inflow_cash || [], fb = s.inflow_bank || [], fr = s.inflow_barter || [];
  const split = fc.length > 0 || fb.length > 0 || fr.length > 0;
  const sum = (a: number[]) => a.reduce((x, v) => x + (v || 0), 0);
  const moneyIn = sum(fc) + sum(fb), barterIn = sum(fr);

  const max = Math.max(...s.cash_in, ...s.cash_out, 1);
  /* Тэнхлэгийн бичээс 12px — зүүн талын "87.4 сая" багтахаар P.l өргөсгөв. */
  const W = 620, H = 250, P = { l: 66, r: 10, t: 14, b: 30 };
  const bw = (W - P.l - P.r) / s.months.length;
  const y = (v: number) => H - P.b - (v / (max * 1.15)) * (H - P.t - P.b);
  const hOf = (v: number) => Math.max(H - P.b - y(v), 0);

  return (
    <>
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mb-2">
        {[["Бэлэн", CASH_C], ["Данс", BANK_C], ["Бартер", BARTER_C], ["Гарсан", OUT_C]].map(([lb, c]) => (
          <span key={lb} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-t2">
            <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} />{lb}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {[0, 1, 2, 3].map((g) => {
          const gy = P.t + (g * (H - P.t - P.b)) / 3;
          const gv = max * 1.15 * (1 - g / 3);
          return (
            <g key={g}>
              <line x1={P.l} x2={W - P.r} y1={gy} y2={gy} stroke="var(--color-line)" strokeDasharray="3 4" />
              <text x={P.l - 9} y={gy + 4} textAnchor="end" fontSize="12" fill="var(--color-t3)">{sayaFmt(gv)}</text>
            </g>
          );
        })}
        {s.months.map((m, i) => {
          const x0 = P.l + i * bw, ix = x0 + bw * 0.16, iw = bw * 0.3;
          const segs = split
            ? [{ lb: "бэлэн", c: CASH_C, v: fc[i] || 0 },
               { lb: "данс", c: BANK_C, v: fb[i] || 0 },
               { lb: "бартер", c: BARTER_C, v: fr[i] || 0 }]
            : [{ lb: "орсон", c: CASH_C, v: s.cash_in[i] || 0 }];
          const inTot = segs.reduce((x, sg) => x + sg.v, 0);
          let acc = 0;
          return (
            <g key={m + i}>
              {/* Багана бүрийг нэг бүхэл дугуй ирмэгт багтаана — сегментүүд эвгүй тасрахгүй */}
              <clipPath id={`cin${i}`}>
                <rect x={ix} y={y(inTot)} width={iw} height={hOf(inTot)} rx="5" />
              </clipPath>
              <g clipPath={`url(#cin${i})`}>
                {segs.map((sg) => {
                  const h = hOf(sg.v);
                  if (h <= 0) return null;
                  const sy = H - P.b - acc - h;
                  acc += h;
                  return (
                    <rect key={sg.lb} x={ix} y={sy} width={iw} height={h} fill={sg.c}>
                      <title>{`${m}: ${sg.lb} ${money(sg.v)}`}</title>
                    </rect>
                  );
                })}
              </g>
              <rect x={x0 + bw * 0.54} y={y(s.cash_out[i])} width={bw * 0.3}
                    height={Math.max(H - P.b - y(s.cash_out[i]), 0)} rx="5" fill={OUT_C} opacity="0.85">
                <title>{`${m}: гарсан ${money(s.cash_out[i])}`}</title>
              </rect>
              <text x={x0 + bw / 2} y={H - 9} textAnchor="middle" fontSize="12" fill="var(--color-t3)">{m}</text>
            </g>
          );
        })}
      </svg>
      {split && (
        <p className="text-[12px] text-t3 mt-2 tabular-nums">
          мөнгөн (бэлэн+данс): <b className="text-t2">{sayaFmt(moneyIn)}₮</b>
          {" · "}бартер: <b className="text-t2">{sayaFmt(barterIn)}₮</b>
        </p>
      )}
    </>
  );
}

import { ReactNode, useEffect, useRef, useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, useToast, Refreshing, Chevron } from "../ui";
import { useDownload } from "../lib/docs";
import { useLive } from "../lib/live";
import { cycleLabel } from "../lib/cycle";
import { RangeMode, rangeError, reportQuery } from "../lib/report";
import { panelId, disclosureProps } from "../lib/disclosure";
import { rowClickProps } from "../lib/rowClick";

/* Задаргааны самбарын гарчиг — P&L мөрийн нэрээ дагана. */
const DETAIL_TITLES: Record<string, string> = {
  rent: "Түрээсийн орлого", sale: "Худалдааны орлого",
  "mach-in": "Механизмын орлого", penalty: "Алдангийн орлого",
  salary: "Цалин", interest: "Зээлийн хүү",
  "mach-out": "Механизмын зарлага", barter: "Бартерын хэрэгжсэн үр дүн",
};

export default function Reports() {
  const [months, setMonths] = useState(6);
  const [mode, setMode] = useState<RangeMode>("months");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const dl = useDownload();

  /* Задаргаа НАРИЙХАН картын дотор биш, доорх БҮТЭН ӨРГӨН самбарт гардаг —
     мөр дарахад самбар нь дэлгэцээс гадуур байж болох тул гүйлгэж очно. */
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openRow) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [openRow]);

  // Хоосон query = огнооны горимд муж бүрэн болоогүй: юу ч татахгүй,
  // өмнөх тоонууд дэлгэцэн дээрээ хэвээр зогсоно.
  const q = reportQuery(mode, months, from, to);
  const rangeErr = mode === "range" ? rangeError(from, to) : "";

  /* Хугацаа солиход `setD(null)` хийж БҮТЭН хуудсыг нурааж байв: Отгоо 6 сарын
     тайлангаа хараад 12 руу дарахад дэлгэц хоосорч, юутай харьцуулж байснаа
     алддаг. Одоо өмнөх тоо байрандаа үлдэж, зөвхөн бүдгэрнэ. */
  const load = (query: string) => {
    setBusy(true);
    return api(`/api/reports?${query}`).then(setD)
      .catch((e) => toast(e.message, "err"))
      .finally(() => setBusy(false));
  };
  /** Фонд шинэчлэх — бүдгэрүүлэг ч гаргахгүй, алдааг чимээгүй залгина. */
  const refresh = (query: string) => api(`/api/reports?${query}`).then(setD).catch(() => {});
  useLive((bg) => { if (q) (bg ? refresh(q) : load(q)); }, [q]);
  if (!d) return <Spinner />;   // ЗӨВХӨН анхны ачаалал
  const p = d.pnl;
  const dt = p.detail;          // задаргаа — хуучин серверийн payload-д байхгүй байж болно

  /* Тайлан бүрдүүлэхэд сервер хэдэн секунд бодно — товч дуугүй зогсох ёсгүй.
     Алдаа гарвал өмнө нь алдааны JSON нь «jiguur-tailan.xlsx» болж диск рүү
     бууж, юу болсныг хаанаас ч мэдэхгүй байв. */
  const exportPath = `/api/reports/export.xlsx?${q || `months=${months}`}`;

  const toggle = (id: string) => setOpenRow(openRow === id ? null : id);
  const rowProps = (id: string, label: string, val: number, colored = false) => ({
    id, label, val, colored, open: openRow === id,
    onToggle: toggle, expandable: !!dt,
  });

  return (
    <Refreshing busy={busy}>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ТАЙЛАН <span>•</span> {p.from} — {p.to}</div>
          <h1 className="dashboard-title">Тайлан</h1>
          <p className="dashboard-subtitle">Түрээс дууссан циклээр, зардал төлөгдсөнөөр.</p>
        </div>
        <div className="flex gap-2.5 items-center flex-wrap command-action">
          <div className="segment">
            {[3, 6, 12].map((m) => (
              <button key={m} onClick={() => { setMode("months"); setMonths(m); }}
                      className={mode === "months" && months === m ? "on" : ""}>{m} сар</button>
            ))}
            <button onClick={() => setMode("range")}
                    className={mode === "range" ? "on" : ""}>Огноогоор</button>
          </div>
          {mode === "range" && (
            <div className="flex items-center gap-1.5">
              <input type="date" className="inp !w-auto" aria-label="Эхлэх огноо"
                     value={from} max={to || undefined}
                     onChange={(e) => setFrom(e.target.value)} />
              <span className="text-t3">—</span>
              <input type="date" className="inp !w-auto" aria-label="Дуусах огноо"
                     value={to} min={from || undefined}
                     onChange={(e) => setTo(e.target.value)} />
            </div>
          )}
          <button className="btn-secondary" disabled={dl.busy || (mode === "range" && !q)}
                  aria-busy={dl.busyPath === exportPath || undefined}
                  onClick={() => dl.download(exportPath, "jiguur-tailan.xlsx")}>
            {dl.busyPath === exportPath ? "Бэлтгэж байна…" : "⇩ Excel татах"}
          </button>
        </div>
      </div>
      {rangeErr && <p className="text-[12.5px] text-danger -mt-2 mb-3">{rangeErr}</p>}

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
            <span className="cdot" style={{ background: "#6756a4", boxShadow: "0 0 0 3px #eeeafa" }} />Бартерын үр дүн
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
            <span className="pill"
                  style={{ background: "rgba(255,255,255,.12)", color: p.net >= 0 ? "#7de8b8" : "#ffb3b6" }}>
              {p.net >= 0 ? "ашигтай ажиллав" : "алдагдалтай"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 items-start">
        {/* P&L statement — мөр нь СОНГОГДОЖ, задаргаа нь доорх бүтэн өргөн самбарт
            гарна: нарийхан картын дотор хүснэгт шахаж уншуулдаг байсныг болиулав. */}
        <div className="card p-6 col-span-5 max-lg:col-span-12">
          <h2 className="font-bold text-ink text-[14px] mb-1 flex items-center gap-2"><span className="cdot" />Ашиг, алдагдлын тайлан</h2>
          {dt && <p className="text-[12px] text-t3 mb-3">Мөр дээр дарахад задаргаа нь доор дэлгэгдэнэ.</p>}
          <Sect label="Орлого" />
          <XRow {...rowProps("rent", "Түрээсийн орлого", p.rent_income)} />
          <XRow {...rowProps("sale", "Худалдааны орлого", p.sale_income)} />
          <XRow {...rowProps("mach-in", "Механизмын орлого", p.machine_income)} />
          <XRow {...rowProps("penalty", "Алдангийн орлого", p.penalty_income)} />
          <Total label="Нийт орлого" val={p.total_income} tone="money" />
          <Sect label="Зардал" cls="mt-5" />
          <XRow {...rowProps("salary", "Цалин", -p.salary_expense)} />
          <XRow {...rowProps("interest", "Зээлийн хүү", -p.interest_expense)} />
          <XRow {...rowProps("mach-out", "Механизмын зарлага", -p.machine_expense)} />
          <Total label="Нийт зардал" val={-p.total_expense} tone="danger" />
          <div className="mt-5" />
          <XRow {...rowProps("barter", "Бартерын хэрэгжсэн үр дүн", p.barter_result, true)} />
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
            <h2 className="font-bold text-ink text-[14px] flex items-center gap-2"><span className="cdot" />Мөнгөн урсгал — сүүлийн 6 сар</h2>
          </div>
          <p className="text-[12px] text-t3 mb-3">Орсон: харилцагчийн төлбөр + механизм · Гарсан: зарлага + хүү + цалин</p>
          <CashBars s={d.series} />
        </div>
      </div>

      {/* Задаргааны самбар — БҮТЭН ӨРГӨН, сонгосон мөрөө дагана */}
      {dt && openRow && (
        <div ref={detailRef} id={panelId("pnl", openRow)}
             className="card p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-ink text-[14px] flex items-center gap-2">
              <span className="cdot" />Задаргаа — {DETAIL_TITLES[openRow]}
              <span className="text-[12px] text-t3 font-medium">{p.from} — {p.to}</span>
            </h2>
            <button className="btn-ghost !min-h-9 text-[13px]" onClick={() => setOpenRow(null)}
                    aria-label="Задаргааг хаах">✕ Хаах</button>
          </div>
          <DetailPanel id={openRow} dt={dt} />
        </div>
      )}
    </Refreshing>
  );
}

function Sect({ label, cls = "" }: any) {
  return <div className={`text-[12px] font-bold uppercase tracking-wider text-t3 pb-1.5 border-b border-line ${cls}`}>{label}</div>;
}

/** P&L-ийн СОНГОГДДОГ мөр — задаргаа нь доорх бүтэн өргөн самбарт гарна.
 *  `expandable` биш бол (хуучин сервер) энгийн мөр: задрахгүй зүйлд тэмдэг тавихгүй. */
function XRow({ id, label, val, colored, open, onToggle, expandable }: {
  id: string; label: string; val: number; colored?: boolean;
  open: boolean; onToggle: (id: string) => void; expandable: boolean;
}) {
  const cls = colored ? (val >= 0 ? "text-money" : "text-danger") : "text-ink";
  const amount = <b className={`tabular-nums text-[13px] ${cls}`}>{val > 0 && colored ? "+" : ""}{money(val)}</b>;
  if (!expandable) {
    return (
      <div className="flex justify-between items-center py-2 border-b border-line/60">
        <span className="text-[13px] text-t2">{label}</span>{amount}
      </div>
    );
  }
  return (
    <div className={`flex justify-between items-center py-2 border-b border-line/60 cursor-pointer transition ${open ? "bg-brand-50" : "hover:bg-canvas"}`}
         {...disclosureProps(open, panelId("pnl", id))}
         {...rowClickProps(() => onToggle(id), `${label} — задаргааг ${open ? "хаах" : "нээх"}`)}>
      <span className="text-[13px] text-t2 flex items-center gap-1.5"><Chevron open={open} />{label}</span>
      {amount}
    </div>
  );
}

/** Сонгогдсон мөрийн задаргаа — өргөн самбарт хүснэгтүүд амьсгалтай багтана. */
function DetailPanel({ id, dt }: { id: string; dt: any }) {
  const machines = (
    <Mini head={["Машин", "Орлого", "Зарлага", "Цэвэр"]} numCols={[1, 2, 3]}
          rows={dt.machines.map((r: any) => [r.machine, money(r.income),
                                             money(r.expense), money(r.net)])} />
  );
  switch (id) {
    case "rent":
      return (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 mb-4">
            <Split label="Цэвэр түрээс" v={dt.rent_net} />
            <Split label="Засварын нэхэлт" v={dt.charge.repair} />
            <Split label="Акталсан бүтээгдэхүүн" v={dt.charge.writeoff} />
            <Split label="Чөлөөт акт (±)" v={dt.charge.akt} />
            {dt.charge.other !== 0 && <Split label="Задаргаагүй" v={dt.charge.other} />}
          </div>
          <Mini head={["Цикл", "Харилцагч", "Гэрээ", "Түрээс", "Засвар/акт", "Дүн"]}
                numCols={[3, 4, 5]}
                rows={dt.rent_invoices.map((r: any) => [
                  cycleLabel(r.cycle_start, r.cycle_end), r.client, r.contract_no,
                  money(r.rent), money(r.charge), money(r.total)])} />
          {dt.charge.rows.length > 0 && (
            <>
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-t3 mt-4 mb-1.5">Засвар / актын мөрүүд</p>
              <Mini head={["Огноо", "Харилцагч", "Гэрээ", "Төрөл", "Дүн"]} numCols={[4]}
                    rows={dt.charge.rows.map((r: any) => [r.date, r.client, r.contract_no, r.desc, money(r.amount)])} />
            </>
          )}
        </>
      );
    case "sale":
      return <Mini head={["Огноо", "Харилцагч", "Гэрээ", "Нэхэмжлэл", "Дүн"]} numCols={[4]}
                   rows={dt.sale_invoices.map((r: any) => [r.date, r.client, r.contract_no, r.no, money(r.amount)])} />;
    case "mach-in":
    case "mach-out":
      return machines;
    case "penalty":
      return (
        <>
          <Mini head={["Огноо", "Харилцагч", "Нэхэмжлэл", "Дүн"]} numCols={[3]}
                rows={dt.penalty_paid.map((r: any) => [r.date, r.client, r.invoice_no, money(r.amount)])} />
          {/* Нэхэгдсэн ≠ орлого (R25/H2): төлөгдсөн нь л орлого, нэхэлт нь мэдээлэл */}
          {dt.penalty_booked.total > 0 && (
            <>
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-t3 mt-4 mb-1.5">
                Энэ хугацаанд нэхэгдсэн — {money(dt.penalty_booked.total)} (орлогод зөвхөн төлөгдсөн нь орно)
              </p>
              <Mini head={["Огноо", "Харилцагч", "Гэрээ", "Дүн", "Хэн нэхсэн"]} numCols={[3]}
                    rows={dt.penalty_booked.rows.map((r: any) => [r.date, r.client, r.contract_no, money(r.amount), r.user])} />
            </>
          )}
        </>
      );
    case "salary":
      return <Mini head={["Огноо", "Бодолт", "Ажилтан", "Дүн"]} numCols={[3]}
                   rows={dt.salary.map((r: any) => [r.date, r.label, r.employees, money(r.amount)])} />;
    case "interest":
      return <Mini head={["Огноо", "Зээлдүүлэгч", "Дүн"]} numCols={[2]}
                   rows={dt.interest.map((r: any) => [r.date, r.loan, money(r.amount)])} />;
    case "barter":
      return <Mini head={["Хөрөнгө", "Хэнээс", "Орж ирсэн огноо", "Орж ирсэн үнэ",
                          "Зарсан огноо", "Хэнд", "Зарсан үнэ", "Зөрүү"]} numCols={[3, 6, 7]}
                   rows={dt.barter.map((r: any) => [
                     r.name, r.client, r.date_in, money(r.value_in),
                     r.sold_date, r.sold_to,  money(r.sold_amount),
                     <b className={r.diff < 0 ? "text-danger" : "text-money"}>
                       {r.diff > 0 ? "+" : ""}{money(r.diff)}</b>])} />;
    default:
      return null;
  }
}

/** Түрээсийн орлогын дотоод хуваарилалт — нэг мөр нэг зүйл. */
function Split({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex justify-between text-[13px] border-b border-line/60 pb-1">
      <span className="text-t3">{label}</span>
      <b className="tabular-nums text-t1">{money(v)}</b>
    </div>
  );
}

/** Задаргааны хүснэгт. `numCols` — баруун зэрэгцүүлэх баганын индексүүд. */
function Mini({ head, rows, numCols = [] }: {
  head: string[]; rows: ReactNode[][]; numCols?: number[];
}) {
  if (!rows.length) return <p className="text-[13px] text-t3">Энэ хугацаанд мөр алга.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>{head.map((h, j) => (
            <th key={h} className={`text-[11.5px] font-bold uppercase tracking-wide text-t3 px-3 py-2 whitespace-nowrap border-b border-line ${numCols.includes(j) ? "text-right" : "text-left"}`}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-canvas/60">{r.map((c, j) => (
              <td key={j} className={`text-[13px] px-3 py-2 border-b border-line/60 ${numCols.includes(j) ? "text-right tabular-nums whitespace-nowrap" : ""}`}>{c}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
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

/* Өнгө нь ОЙЛГОЛТООС гардаг, графикаас биш: бартер бол violet (төлбөрийн
   pill, орлогын график, дээрх «Бартерын үр дүн» цэг бүгд violet). Энд ганцаараа
   улбар шар байсан нь НЭГ хуудсан дээр нэг ойлголтыг хоёр өнгөөр зурж байв. */
const CASH_C = "#1f8b69", BANK_C = "#253886", BARTER_C = "#6756a4", OUT_C = "#E5484D";

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

import { ReactNode, useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, money, fmt, user } from "../api";
import { Spinner, StatePill, TypePill, Prog, Modal, FormModal, SubmitButton, useToast,
         InlineEdit, Receipt, ConfirmModal } from "../ui";
import { allocationPreview } from "../lib/alloc";
import { endDateLabel } from "../lib/contract";
import { invoiceLabel } from "../lib/invoice";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { usePdf } from "../lib/docs";
import { rowClickProps } from "../lib/rowClick";

const today = () => new Date().toISOString().slice(0, 10);
/** Хөдөлгөөний нэр — мөрөн дээр ч, дуудагдах нэрэнд ч НЭГ эх сурвалж. */
const mvName = (t: string) => (t === "ISSUE" ? "Ачилт" : t === "RETURN" ? "Буцаалт" : "Акт");

export default function ContractDetail() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [modal, setModal] = useState<"" | "return" | "add" | "pay" | "extend" | "deposit" | "close">("");
  const [openMv, setOpenMv] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const toast = useToast();
  const pdf = usePdf();
  const u = user();
  /* Үйлдвэрийн дарга материал хөдөлгөх хүн — АВЛАГЫН хүн биш. Түүнд гэрээний
     үлдэгдэл, нэхэмжлэл, төлбөр, барьцаа, тарифтай PDF харагдах ёсгүй: тэр
     мэдээллийг агуулахын шалан дээр асуух хүн бий, тэр нь Отгоо. */
  const seesMoney = u?.role !== "factory";

  const load = () => api(`/api/contracts/${id}`).then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); api("/api/grades").then(setGrades); }, [id]);

  /* InlineEdit-ийн хадгалалт: алдааг toast-оор гаргаад ДАХИН шиднэ. Тэгснээр
     талбар засварын горимд үлдэж, бичсэн утга алдагдахгүй — Loans.tsx-ийн
     doPatch-тай яг ижил зан төлөв. Барихгүй бол алдаа чимээгүй залгигдана. */
  async function savePatch(path: string, body: any, okMsg: string) {
    try {
      await api(path, { method: "PATCH", body: JSON.stringify(body) });
      toast(okMsg); load();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  }

  /* Тооцоог хөндөх засвар: сервер "дахин бодогдоно" гэвэл эхлээд зөрүүг харуулна. */
  async function gatedPatch(path: string, body: any, okMsg: string) {
    try {
      const r = await api(path, { method: "PATCH", body: JSON.stringify(body) });
      if (r?.rebuild_required) {
        setPending({ path, body, okMsg, diffs: r.diffs || [], warnings: r.warnings || [] });
        return;
      }
      toast(okMsg);
      load();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  }

  if (!d) return <Spinner />;

  const cyc = d.cycle;
  const canManage = u?.role === "manager" || u?.role === "factory";

  return (
    <div>
      <Link to="/contracts" className="btn-ghost mb-3 inline-flex">← Гэрээнүүд рүү буцах</Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink tracking-tight flex items-center gap-2.5 flex-wrap">
            <Link to={`/clients/${d.client_id}`} className="hover:underline">{d.client}</Link>
            <StatePill state={d.state} /><TypePill type={d.type} />
          </h1>
          <div className="text-t2 text-[13.5px] mt-1.5 flex items-center gap-x-4 gap-y-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              Гэрээ №{d.no} ·{" "}
              {u?.role === "manager" ? (
                <InlineEdit type="date" label="Эхлэх огноо" value={d.start_date} display={`${d.start_date}-с`}
                  confirmText="Эхлэх огноо солих уу?" width="w-36"
                  onSave={(v) => gatedPatch(`/api/contracts/${d.id}`, { start_date: v },
                                            "Гэрээний эхлэх огноо шинэчлэгдлээ")} />
              ) : `${d.start_date}-с`}
            </span>
            {seesMoney ? (
              <>
                {/* Дуусах огноо нь ХООСОН байх нь хэвийн — компани гэрээндээ
                    хугацаа тавьдаггүй. «тодорхойгүй» гэдэг нь мэдээлэл дутуу
                    мэт сонсогддог байв; гэрээ үнэхээр хугацаагүй. */}
                <span className="inline-flex items-center gap-1.5">Дуусах:
                  <InlineEdit type="date" label="Дуусах огноо" value={d.end_date || ""}
                    display={endDateLabel(d.end_date)}
                    confirmText="Огноо солих уу?" width="w-36"
                    onSave={(v) => savePatch(`/api/contracts/${d.id}`,
                      v ? { end_date: v } : { clear_end_date: true }, "Дуусах огноо шинэчлэгдлээ")} />
                </span>
                <span className="inline-flex items-center gap-1.5">Алданги:
                  <InlineEdit type="number" label="Алданги" value={d.penalty_percent} suffix="%/хоног" width="w-20" right
                    confirmText="Алданги солих уу?"
                    onSave={(v) => savePatch(`/api/contracts/${d.id}`,
                      { penalty_percent: parseMoney(v) }, "Алдангийн хувь шинэчлэгдлээ")} />
                </span>
                {/* Барьцаа нь ГАНЦ гэрээний тодорхой дүн — доорх «Барьцаа»
                    хайрцаг үүнийг бүтнээр нь харуулдаг. Толгойд нь сая болгож
                    дугуйлбал нэг тоо хоёр өөр дүн болж харагдана. */}
                <span className="inline-flex items-center gap-1.5">Барьцаа:
                  <InlineEdit type="number" label="Барьцаа" value={d.deposit} display={d.deposit > 0 ? money(d.deposit) : "—"}
                    confirmText="Барьцаа солих уу?" width="w-28" right
                    onSave={(v) => savePatch(`/api/contracts/${d.id}`,
                      { deposit: parseMoney(v) }, "Барьцаа шинэчлэгдлээ")} />
                </span>
              </>
            ) : (
              <span>→ {endDateLabel(d.end_date)} · Алданги {d.penalty_percent}%/хоног</span>
            )}
          </div>
          {seesMoney && (
            <div className="text-t2 text-[13px] mt-1.5 inline-flex items-center gap-1.5">Тэмдэглэл:
              <InlineEdit label="Тэмдэглэл" value={d.note} display={d.note || "нэмэх…"} width="w-72"
                confirmText="Хадгалах уу?"
                onSave={(v) => savePatch(`/api/contracts/${d.id}`, { note: v }, "Тэмдэглэл хадгалагдлаа")} />
            </div>
          )}
        </div>
        <div className="flex gap-2.5 flex-wrap">
          {/* Гурван PDF-ийн аль нь ч тариф, дүн, алданги авч явдаг — үйлдвэрийн
              дарга эдгээрийг хэвлэдэггүй, харах ч ёсгүй. */}
          {seesMoney && (
            <>
              <PdfButton pdf={pdf} path={`/api/contracts/${d.id}/pdf`}
                         busyLabel="Гаргаж байна…">Гэрээ PDF</PdfButton>
              <PdfButton pdf={pdf} path={`/api/contracts/${d.id}/act-pdf`}
                         busyLabel="Гаргаж байна…">Акт PDF</PdfButton>
              {/* `cyc` нь явагдаж буй цикл — сервер яг үүн дээр л хавсралт гаргана. */}
              {d.type === "rent" && cyc && (
                <PdfButton pdf={pdf} path={`/api/contracts/${d.id}/cycle-appendix-pdf`}
                           busyLabel="Гаргаж байна…">Энэ циклийн хавсралт</PdfButton>
              )}
              <button className="btn-secondary" onClick={() => setModal("pay")}>Төлбөр бүртгэх</button>
            </>
          )}
          {canManage && d.type === "rent" && d.status === "active" && (
            <>
              <button className="btn-secondary" onClick={() => setModal("add")}>+ Нэмэлт олголт</button>
              <button className="btn-primary" onClick={() => setModal("return")}>Буцаалт бүртгэх</button>
            </>
          )}
        </div>
      </div>

      {/* Тоон хураангуй */}
      <div className="card p-5 mb-4 flex gap-8 flex-wrap items-center">
        {d.type === "rent" && <Num label="Өдрийн дүн" val={money(d.day_amount)} />}
        {cyc && <Num label="Энэ циклд хуримтлагдсан" val={money(cyc.accrued)} />}
        {/* Энэ мөрөнд «Өдрийн дүн», «Хуримтлагдсан» нь ТӨГРӨГӨӨРӨӨ зогсож
            байхад үлдэгдэл нь «12.3 сая» гэж дугуйлагддаг байв — Отгоо яг
            хэдийг нэхэхээ мэдэхгүй, доорх нэхэмжлэлүүдтэй нийлүүлж ч чадахгүй.
            Ганц гэрээний дүн энд бүтнээрээ зогсоно. */}
        {seesMoney && (
          <Num label="Нийт үлдэгдэл" val={money(d.balance)} danger={d.state === "overdue"} />
        )}
        {seesMoney && d.penalty > 0 && <Num label="Алданги (өнөөдрөөр)" val={money(d.penalty)} danger />}
        {cyc && (
          <div className="flex-1 min-w-[210px]">
            <div className="text-[12px] text-t3 font-semibold uppercase tracking-wider mb-2.5">
              Цикл {cyc.cycle_start} – {cyc.cycle_end} · {cyc.days_done}/{cyc.days_total} хоног
            </div>
            <Prog pct={(cyc.days_done / cyc.days_total) * 100} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 max-lg:grid-cols-1">
        <div className="space-y-4">
          {/* Материал */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 pt-4 pb-1">
              <h3 className="font-bold text-ink text-[15.5px]">
                {d.type === "rent" ? "Түрээсэнд байгаа материал" : "Худалдсан материал"}
              </h3>
              <span className="pill-grey">{fmt(d.items.reduce((s: number, i: any) => s + i.qty, 0))} ширхэг</span>
            </div>
            <table className="w-full min-w-[520px]">
              <thead><tr>
                <th className="th">Материал</th><th className="th">Зэрэглэл</th>
                <th className="th text-right">Тоо</th>
                <th className="th text-right">{d.type === "rent" ? "Тариф ₮/ш/хоног" : "Нэгж үнэ"}</th>
                <th className="th text-right">{d.type === "rent" ? "Өдрийн дүн" : "Нийт"}</th>
              </tr></thead>
              <tbody>
                {d.items.map((it: any, i: number) => (
                  <tr key={i}>
                    <td className="td font-bold text-ink">{it.material}</td>
                    <td className="td"><span className="pill-blue">{it.grade}</span></td>
                    <td className="td text-right tabular-nums">{fmt(it.qty)}</td>
                    <td className="td text-right tabular-nums">
                      {u?.role === "manager" ? (
                        <InlineEdit type="number" right width="w-24"
                          label={`${it.material} (${it.grade}) · ${d.type === "rent" ? "тариф" : "нэгж үнэ"}`}
                          value={d.type === "rent" ? it.daily_rate : it.unit_price}
                          display={fmt(d.type === "rent" ? it.daily_rate : it.unit_price)}
                          confirmText="Энэ циклээс шинэ үнээр?"
                          onSave={(v) => {
                            const num = parseMoney(v);
                            return savePatch(`/api/contracts/${d.id}/items`,
                              { material_id: it.material_id, grade_id: it.grade_id,
                                old_rate: d.type === "rent" ? it.daily_rate : it.unit_price,
                                ...(d.type === "rent" ? { daily_rate: num } : { unit_price: num }) },
                              "Үнэ шинэчлэгдлээ — одоогийн циклээс шинэ утгаар бодогдоно");
                          }} />
                      ) : fmt(d.type === "rent" ? it.daily_rate : it.unit_price)}
                    </td>
                    <td className="td text-right tabular-nums font-bold text-ink">
                      {money(d.type === "rent" ? it.day_amount : it.qty * it.unit_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Нэхэмжлэл */}
          {seesMoney && (
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 pt-4 pb-1">
              <h3 className="font-bold text-ink text-[15.5px]">Нэхэмжлэлүүд</h3>
            </div>
            <table className="w-full min-w-[640px]">
              <thead><tr>
                <th className="th">{d.type === "rent" ? "Үе" : "Нэхэмжлэл"}</th><th className="th text-right">Дүн</th>
                <th className="th text-right">Төлсөн</th><th className="th text-right">Үлдэгдэл</th>
                <th className="th">Төлөв</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {d.invoices.map((inv: any) => {
                  const lb = invoiceLabel(inv);
                  return (
                  <tr key={inv.id}>
                    <td className="td">
                      {/* Үеийн огноо хоёр мөр болж таслагдвал уншихад хүнд */}
                      <span className="font-semibold text-ink whitespace-nowrap">{lb.title}</span>
                      {lb.sub && <span className="block text-[12px] text-t3">{lb.sub}</span>}
                    </td>
                    <td className="td text-right tabular-nums">
                      {money(inv.total)}
                      {inv.penalty > 0 && <span className="block text-[12px] text-danger">+ алданги {money(inv.penalty)}</span>}
                      {inv.charge_amount > 0 && <span className="block text-[12px] text-t3">үүнд засвар/акт {money(inv.charge_amount)}</span>}
                    </td>
                    <td className="td text-right tabular-nums">{money(inv.paid)}</td>
                    {/* «Дүн − Төлсөн»-ийг Отгоо толгойдоо бодож сууж байв — 30
                        нэхэмжлэлийн аль нь хаагдаагүйг ялгах ганц багана. */}
                    <td className={`td text-right tabular-nums font-bold ${
                          inv.outstanding > 0 && inv.status === "overdue" ? "text-danger"
                          : inv.outstanding > 0 ? "text-ink" : "text-t3"}`}>
                      {inv.outstanding > 0 ? money(inv.outstanding) : "—"}
                    </td>
                    <td className="td"><StatePill state={inv.status} /></td>
                    <td className="td">
                      <div className="flex gap-1.5 flex-wrap">
                        <PdfButton pdf={pdf} className="btn-ghost btn-row"
                                   path={`/api/invoices/${inv.id}/pdf`}>PDF</PdfButton>
                        {/* Хавсралт нь ЗӨВХӨН түрээст: худалдааны нэхэмжлэлд
                            хоногийн цонх байхгүй тул сервер 400 буцаана. */}
                        {d.type === "rent" && (
                          <PdfButton pdf={pdf} className="btn-ghost btn-row"
                                     path={`/api/invoices/${inv.id}/appendix-pdf`}>Хавсралт</PdfButton>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {d.invoices.length === 0 && <p className="text-t3 text-sm px-4 pb-4">Эхний цикл дуусаагүй — нэхэмжлэл автоматаар үүснэ.</p>}
          </div>
          )}
        </div>

        {/* Хөдөлгөөн + төлбөр */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-bold text-ink text-[15.5px] mb-4">Хөдөлгөөний түүх</h3>
            <div className="relative pl-6 before:content-[''] before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-sunken">
              {d.movements.map((mv: any) => {
                const open = openMv === mv.id;
                return (
                <div key={mv.id} className="relative pb-4 last:pb-0">
                  <i className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-white border-[3px] ${
                    mv.type === "ISSUE" ? "border-brand" : mv.type === "RETURN" ? "border-warn" : "border-danger"}`} />
                  {/* Задардаг мөр — хулганаар ч, Tab+Enter-ээр ч нээгдэнэ */}
                  <div className="cursor-pointer" title="Дарж дэлгэрэнгүйг нээнэ"
                       aria-expanded={open}
                       {...rowClickProps(() => setOpenMv(open ? null : mv.id),
                         `${mv.date} · ${mvName(mv.type)} — дэлгэрэнгүйг ${open ? "хаах" : "нээх"}`)}>
                    <span className="text-[12px] text-t3 font-semibold">{mv.date}</span>
                    {mv.status === "pending" && <span className="pill-amber ml-2">хүлээгдэж буй</span>}
                    <b className="block text-[13.5px] text-ink font-semibold">
                      <span className="text-t3 font-normal mr-1">{open ? "▾" : "›"}</span>
                      {mvName(mv.type)} — {fmt(mv.lines.reduce((s: number, l: any) => s + l.qty, 0))}ш
                    </b>
                  </div>
                  {!open ? (
                    <div className="text-[12.5px] text-t2">
                      {mv.lines.slice(0, 3).map((l: any, i: number) => (
                        <span key={i}>{l.material} ({l.grade}) ×{fmt(l.qty)}{l.return_grade && l.return_grade !== l.grade ? ` → ${l.return_grade}` : ""}{i < Math.min(mv.lines.length, 3) - 1 ? " · " : ""}</span>
                      ))}
                      {mv.lines.some((l: any) => l.repair_fee > 0) &&
                        <span className="block text-warn">Засвар: {money(mv.lines.reduce((s: number, l: any) => s + l.repair_fee, 0))}</span>}
                      {mv.lines.some((l: any) => l.writeoff_fee > 0) &&
                        <span className="block text-danger">Акт: {money(mv.lines.reduce((s: number, l: any) => s + l.writeoff_fee, 0))}</span>}
                      {mv.note && <span className="block text-t3">{mv.note}</span>}
                    </div>
                  ) : (
                    <div className="mt-1.5 rounded-2xl border border-line-strong p-3 bg-sunken/40">
                      {u?.role === "manager" && (
                        <div className="text-[12px] text-t2 inline-flex items-center gap-1.5 mb-2">Огноо:
                          <InlineEdit type="date" label={`${mvName(mv.type)} — огноо`}
                            value={mv.date} display={mv.date} width="w-36"
                            confirmText="Огноо солих уу?"
                            onSave={(v) => gatedPatch(`/api/movements/${mv.id}`, { date: v },
                                                      "Хөдөлгөөний огноо шинэчлэгдлээ")} />
                        </div>
                      )}
                      {mv.lines.map((l: any) => (
                        <div key={l.id} className="flex items-center gap-2 py-1.5 border-b border-line last:border-0 flex-wrap">
                          <div className="min-w-0">
                            <b className="text-[12.5px] text-ink">{l.material}</b>
                            <span className="block text-[12px] text-t3">
                              {l.grade}{l.return_grade && l.return_grade !== l.grade ? ` → ${l.return_grade}` : ""}
                              {l.repair_fee > 0 && <span className="text-warn"> · засвар {money(l.repair_fee)}</span>}
                              {l.writeoff_fee > 0 && <span className="text-danger"> · акт {money(l.writeoff_fee)}</span>}
                            </span>
                          </div>
                          <span className="ml-auto text-[12px] text-t2 inline-flex items-center gap-1.5">Тоо:
                            {u?.role === "manager" ? (
                              <InlineEdit type="number" right width="w-20" label={`${l.material} — тоо`}
                                value={l.qty} display={fmt(l.qty)}
                                confirmText="Тоо солих уу?"
                                onSave={(v) => gatedPatch(`/api/movement-lines/${l.id}`,
                                                          { qty: parseMoney(v) },
                                                          "Хөдөлгөөний тоо шинэчлэгдлээ")} />
                            ) : fmt(l.qty)}
                          </span>
                          {mv.type === "ISSUE" && (
                            <span className="text-[12px] text-t2 inline-flex items-center gap-1.5">Тариф:
                              {u?.role === "manager" ? (
                                <InlineEdit type="number" right width="w-20" label={`${l.material} — тариф`}
                                  value={l.rate ?? ""}
                                  display={l.rate != null ? fmt(l.rate) : "—"}
                                  confirmText="Тариф солих уу?"
                                  onSave={(v) => gatedPatch(`/api/movement-lines/${l.id}`,
                                                            { rate: parseMoney(v) },
                                                            "Паданны тариф шинэчлэгдлээ")} />
                              ) : (l.rate != null ? fmt(l.rate) : "—")}
                            </span>
                          )}
                        </div>
                      ))}
                      {mv.note && <span className="block text-[12px] text-t3 mt-2">{mv.note}</span>}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {seesMoney && (
          <div className="card p-5">
            <h3 className="font-bold text-ink text-[15.5px] mb-3">Төлбөрүүд</h3>
            {d.payments.length === 0 && <p className="text-t3 text-sm">Төлбөр бүртгэгдээгүй.</p>}
            {d.payments.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-sunken last:border-0">
                <div>
                  <b className="text-[13.5px] tabular-nums text-ink">{money(p.amount)}</b>
                  <span className="block text-[12px] text-t3">{p.date}</span>
                </div>
                <span className={`ml-auto ${p.method === "BARTER" ? "pill-violet" : p.method === "CASH" ? "pill-green" : "pill-blue"}`}>
                  {p.method === "BARTER" ? `Бартер · ${p.barter_desc}` : p.method === "CASH" ? "Бэлэн" : "Данс"}
                </span>
              </div>
            ))}
          </div>
          )}

          {seesMoney && d.deposit > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-ink text-[15.5px] mb-3">Барьцаа</h3>
              <div className="flex justify-between items-baseline py-1.5">
                <span className="text-[13px] text-t2">Авсан барьцаа</span>
                <b className="tabular-nums">{money(d.deposit)}</b>
              </div>
              {d.deposit_status === "settled" ? (
                <>
                  {d.deposit_applied > 0 && (
                    <div className="flex justify-between items-baseline py-1.5 border-t border-line">
                      <span className="text-[13px] text-t2">Авлагад суутгасан</span>
                      <b className="tabular-nums text-money">{money(d.deposit_applied)}</b>
                    </div>
                  )}
                  {d.deposit_returned > 0 && (
                    <div className="flex justify-between items-baseline py-1.5 border-t border-line">
                      <span className="text-[13px] text-t2">Буцаасан</span>
                      <b className="tabular-nums">{money(d.deposit_returned)}</b>
                    </div>
                  )}
                  <div className="mt-2"><span className="pill-green">
                    {d.deposit_settled_date}-нд тооцоо хийгдсэн</span></div>
                </>
              ) : (
                <>
                  <div className="mt-1 mb-3"><span className="pill-amber">Тооцоо хийгдээгүй</span></div>
                  <button className="btn-primary w-full justify-center"
                          onClick={() => setModal("deposit")}>Барьцааны тооцоо хийх</button>
                </>
              )}
            </div>
          )}

          {u?.role === "manager" && d.status === "active" && (
            <div className="card p-5 flex gap-2.5 flex-wrap">
              <button className="btn-secondary" onClick={() => setModal("extend")}>Гэрээ сунгах</button>
              <button className="btn-ghost text-danger" onClick={() => setModal("close")}>Гэрээ хаах</button>
            </div>
          )}
        </div>
      </div>

      {modal === "return" && <ReturnModal d={d} grades={grades} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "add" && <AddModal d={d} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "pay" && <PayModal d={d} invoices={d.invoices} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "extend" && <ExtendModal d={d} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "deposit" && <DepositModal d={d} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "close" && (() => {
        /* Гэрээ хаах нь буцаагдахгүй үйлдэл — юу үлдэж байгааг эхлээд харуулна. */
        const depositOpen = d.deposit > 0 && d.deposit_status !== "settled";
        return (
          <ConfirmModal
            title="Гэрээ хаах"
            intro={<>Гэрээ №{d.no} · <b className="text-ink">{d.client}</b> — хаасны дараа шинэ хуримтлал
                    бодогдохгүй. Үлдэгдэл авлага, алданги хэвээр үлдэнэ.</>}
            rows={[
              { label: "Үлдэгдэл авлага", value: money(d.balance),
                accent: d.balance > 0 ? "danger" : undefined },
              ...(d.penalty > 0
                ? [{ label: "Алданги (өнөөдрөөр)", value: money(d.penalty), accent: "danger" as const }] : []),
              ...(depositOpen
                ? [{ label: "⚠ Барьцааны тооцоо хийгдээгүй байна", value: money(d.deposit),
                     accent: "danger" as const }] : []),
            ]}
            total={{ label: "Хаах үед үлдэх нийт тооцоо", value: money(d.balance + d.penalty),
                     accent: d.balance + d.penalty > 0 ? "danger" : "money" }}
            note={depositOpen
              ? "Барьцааг эхлээд «Барьцааны тооцоо хийх»-ээр суутгаж/буцааж дуусгахыг зөвлөе."
              : undefined}
            confirmLabel="Гэрээ хаах" danger
            onClose={() => setModal("")}
            onConfirm={async () => {
              try {
                await api(`/api/contracts/${d.id}/close`, { method: "POST" });
                toast("Гэрээ хаагдлаа"); setModal(""); load();
              } catch (e: any) { toast(e.message, "err"); }
            }} />
        );
      })()}
      {pending && <RebuildModal p={pending} onClose={() => setPending(null)}
                                onDone={() => { setPending(null); load(); }} />}
    </div>
  );
}

/* ---------- Дахин бодох баталгаажуулалт ---------- */
type Pending = { path: string; body: any; okMsg: string; diffs: any[]; warnings: string[] };

function RebuildModal({ p, onClose, onDone }: {
  p: Pending; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const oldSum = p.diffs.reduce((s, x) => s + x.old_total, 0);
  const newSum = p.diffs.reduce((s, x) => s + x.new_total, 0);

  return (
    <Modal title="Тооцоо дахин бодогдоно" onClose={onClose}>
      <p className="text-[13.5px] text-t2 mb-4">
        Энэ засвар аль хэдийн нэхэмжилсэн циклүүдэд хамаарч байна. Нэхэмжлэлүүд
        дахин бодогдож, төлбөрүүд шинэ дүнгүүд рүү дахин хуваарилагдана.
      </p>
      <Receipt
        rows={p.diffs.map((x) => ({
          label: `${x.cycle_start} – ${x.cycle_end}`,
          value: `${money(x.old_total)} → ${money(x.new_total)}`,
          accent: x.new_total < x.old_total ? "danger" as const
                : x.new_total > x.old_total ? "money" as const : undefined,
        }))}
        total={{ label: "Нэхэмжлэлийн нийт", value: `${money(oldSum)} → ${money(newSum)}`,
                 accent: newSum < oldSum ? "danger" : newSum > oldSum ? "money" : undefined }} />
      {p.warnings.length > 0 && (
        <div className="mt-3 text-[12.5px] text-warn space-y-1">
          {p.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await api(p.path, { method: "PATCH", body: JSON.stringify({ ...p.body, confirm: true }) });
            toast(p.okMsg + " — тооцоо дахин бодогдлоо");
            onDone();
          } catch (e: any) { toast(e.message, "err"); setBusy(false); }
        }}>{busy ? "…" : "Баталгаажуулж дахин бодох"}</button>
      </div>
    </Modal>
  );
}

function Num({ label, val, danger }: { label: string; val: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-t3 font-semibold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums ${danger ? "text-danger" : "text-ink"}`}>{val}</div>
    </div>
  );
}

/** PDF товч — дарсан агшнаас нээгдэх хүртэл өөрийгөө түгжиж, ЯВЖ БАЙГААГАА
 *  хэлнэ. Сервер PDF нийлүүлэхэд секундууд зарцуулагддаг: дохиогүй товч нь
 *  Отгоог дахин дарахад хүргэж, хоёр таб нээгддэг байв. Алдаа гарвал
 *  `usePdf` серверийн шалтгааныг мэдэгдэл болгож харуулна. */
function PdfButton({ pdf, path, children, className = "btn-secondary", busyLabel = "…" }: {
  pdf: ReturnType<typeof usePdf>;
  path: string;
  children: ReactNode;
  className?: string;
  busyLabel?: ReactNode;
}) {
  const mine = pdf.busyPath === path;
  return (
    <button className={className} disabled={pdf.busy} aria-busy={mine || undefined}
            onClick={() => pdf.open(path)}>
      {mine ? busyLabel : children}
    </button>
  );
}

/* ---------- Буцаалт ---------- */
function ReturnModal({ d, grades, onClose, onDone }: any) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<any[]>(
    d.items.filter((i: any) => i.qty > 0).map((i: any) => ({
      ...i, ret: 0, return_grade_id: i.grade_id, repair: 0, writeoff: 0,
    })));
  const [open, setOpen] = useState<number | null>(null);   // задарсан «Гэмтэл/акт» мөр
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const setRow = (i: number, patch: any) =>
    setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit() {
    const lines = rows.filter((r) => r.ret > 0).map((r) => ({
      material_id: r.material_id, grade_id: r.grade_id, qty: r.ret,
      return_grade_id: r.return_grade_id, repair_qty: r.repair, writeoff_qty: r.writeoff,
    }));
    if (!lines.length) { toast("Буцаах тоо оруулна уу", "err"); return; }
    for (const r of rows.filter((r) => r.ret > 0)) {
      if (r.ret > r.qty) { toast(`${r.material}: гадаа байгаагаас их байна`, "err"); return; }
      if (r.repair + r.writeoff > r.ret) { toast(`${r.material}: засвар + акт нь буцаалтаас их байна`, "err"); return; }
    }
    setBusy(true);
    try {
      await api(`/api/contracts/${d.id}/movements`, { method: "POST",
        body: JSON.stringify({ type: "RETURN", date, note: "", lines }) });
      toast("Буцаалт бүртгэгдлээ — тооцоо автоматаар шинэчлэгдэнэ");
      onDone();
    } catch (e: any) { toast(e.message, "err"); setBusy(false); }
  }

  // Ямар нэг тоо бөглөсөн бол санамсаргүй хаагдаж бүх мөр алдагдахаас хамгаална
  const dirty = date !== today() || rows.some((r) => r.ret > 0 || r.repair > 0 || r.writeoff > 0);

  return (
    <FormModal title="Буцаалт бүртгэх" onClose={onClose} wide dirty={dirty}>
      <label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
      <input id={`${uid}-date`} type="date" className="inp mb-4 max-w-[200px]" value={date} onChange={(e) => setDate(e.target.value)} />

      {/* Буцаалт нь агуулахын шалан дээр, планшетаар хийгддэг ажил — Тооллоготой
          ижил хэлбэр: мөр бүр нэг материал, том тоон талбар, засвар/акт нь
          хэрэгтэй үедээ л задардаг. Дөрвөн нүдтэй микро-хүснэгт байхгүй. */}
      <div className="divide-y divide-line border-t border-line">
        {rows.map((r, i) => {
          const ret = r.ret || 0;
          const over = ret > r.qty;
          const feeOver = r.repair + r.writeoff > ret;
          const expanded = open === i;
          const flagged = r.repair + r.writeoff;
          return (
            <div key={i} className="py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <b className="text-[15.5px] text-ink block leading-tight">{r.material}</b>
                  <span className="text-[12.5px] text-t2">
                    <span className="pill-grey !py-0 mr-1.5">{r.grade}</span>
                    гадаа <b className="tabular-nums">{fmt(r.qty)}</b>ш
                  </span>
                </div>
                <input type="number" inputMode="numeric" min={0} max={r.qty} placeholder="0"
                       aria-label={`${r.material} — буцаах тоо`}
                       className={`inp !w-24 !min-h-[52px] text-center !text-[17px] font-bold ${
                         over ? "!border-danger" : ret > 0 ? "!border-brand" : ""}`}
                       value={r.ret || ""} onChange={(e) => setRow(i, { ret: +e.target.value })} />
              </div>

              {ret > 0 && (
                <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
                  <label className="text-[12.5px] text-t2" htmlFor={`${uid}-rg-${i}`}>Очих зэрэглэл</label>
                  <select id={`${uid}-rg-${i}`} className="inp !w-24 !min-h-11 !py-2" value={r.return_grade_id}
                          onChange={(e) => setRow(i, { return_grade_id: +e.target.value })}>
                    {grades.map((g: any) => <option key={g.id} value={g.id}>{g.code}</option>)}
                  </select>
                  <button className="btn-ghost !min-h-11 text-[13px]" aria-expanded={expanded}
                          onClick={() => setOpen(expanded ? null : i)}>
                    <span className="text-t3">{expanded ? "▾" : "›"}</span> Гэмтэл/акт
                    {!expanded && flagged > 0 && <b className="text-warn"> · {fmt(flagged)}ш</b>}
                  </button>
                  <span className={`ml-auto text-[12.5px] tabular-nums ${
                        over ? "text-danger font-semibold" : "text-t2"}`}>
                    {over ? `гадаа байгаагаас ${fmt(ret - r.qty)}ш их`
                          : `${fmt(r.qty - ret)}ш гадаа үлдэнэ`}
                  </span>
                </div>
              )}

              {ret > 0 && expanded && (
                <div className="mt-2.5 rounded-[8px] p-3 flex gap-4 flex-wrap items-end"
                     style={{ background: "var(--color-sunken)" }}>
                  <div>
                    <label className="lbl" htmlFor={`${uid}-rep-${i}`}>Засварт</label>
                    <input id={`${uid}-rep-${i}`} type="number" min={0} inputMode="numeric" placeholder="0"
                           className="inp !w-20 !min-h-11 text-center font-bold"
                           value={r.repair || ""} onChange={(e) => setRow(i, { repair: +e.target.value })} />
                  </div>
                  <div>
                    <label className="lbl" htmlFor={`${uid}-wo-${i}`}>Актлах</label>
                    <input id={`${uid}-wo-${i}`} type="number" min={0} inputMode="numeric" placeholder="0"
                           className="inp !w-20 !min-h-11 text-center font-bold"
                           value={r.writeoff || ""} onChange={(e) => setRow(i, { writeoff: +e.target.value })} />
                  </div>
                  <p className="text-[12px] text-t2 flex-1 min-w-[170px]">
                    Засварын фикс үнэ, актын НБҮнэ нэхэмжлэлд автоматаар нэмэгдэнэ.
                  </p>
                </div>
              )}

              {ret > 0 && feeOver && (
                <p className="text-[12.5px] text-danger mt-2">
                  Засвар + акт ({fmt(flagged)}ш) нь буцаалтаас ({fmt(ret)}ш) их байна.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {(() => {
        const act = rows.filter((r) => r.ret > 0);
        const totRet = act.reduce((s, r) => s + r.ret, 0);
        const dayDrop = act.reduce((s, r) => s + r.ret * r.daily_rate, 0);
        const repQty = act.reduce((s, r) => s + r.repair, 0);
        const repFee = act.reduce((s, r) => s + r.repair * (r.repair_fee || 0), 0);
        const woQty = act.reduce((s, r) => s + r.writeoff, 0);
        const woFee = act.reduce((s, r) => s + r.writeoff * (r.writeoff_price || 0), 0);
        if (!totRet) return (
          <p className="text-[12.5px] text-t2 mt-3">
            Засварын фикс үнэ болон актын НБҮнэ автоматаар харилцагчийн тооцоонд нэмэгдэнэ.
          </p>
        );
        return (
          <Receipt className="mt-4"
            rows={[
              { label: "Буцаах нийт", value: `${fmt(totRet)} ш` },
              { label: "Өдрийн тооцоо буурна", value: "−" + money(dayDrop), accent: "money" },
              ...(repQty > 0 ? [{ label: `Засварын төлбөр (${fmt(repQty)}ш × фикс)`, value: "+" + money(repFee), accent: "danger" as const }] : []),
              ...(woQty > 0 ? [{ label: `Актын төлбөр (${fmt(woQty)}ш × НБҮнэ)`, value: "+" + money(woFee), accent: "danger" as const }] : []),
            ]}
            total={{ label: "Нэхэмжлэлд нэмэгдэх нийт", value: money(repFee + woFee),
                     accent: repFee + woFee > 0 ? "danger" : undefined }} />
        );
      })()}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary tap-lg" onClick={onClose}>Болих</button>
        <button className="btn-primary tap-lg px-6" disabled={busy} onClick={submit}>
          {busy ? "…" : "✓ Буцаалт бүртгэх"}
        </button>
      </div>
    </FormModal>
  );
}

/* ---------- Нэмэлт олголт ---------- */
function AddModal({ d, onClose, onDone }: any) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const rent = d.type === "rent";
  const [rows, setRows] = useState<any[]>(
    d.items.map((i: any) => ({ ...i, add: 0, rate: rent ? i.daily_rate : i.unit_price })));
  const [busy, setBusy] = useState(false);
  const uid = useId();
  /* Тоо оруулсан, тарифыг нь өөрчилсөн, эсвэл огноог хөдөлгөсөн бүхэн —
     санамсаргүй хаалтад алдагдах ёсгүй хөдөлмөр. */
  const dirty = date !== today()
    || rows.some((r) => r.add > 0 || r.rate !== (rent ? r.daily_rate : r.unit_price));

  async function submit() {
    const lines = rows.filter((r) => r.add > 0).map((r) => ({
      material_id: r.material_id, grade_id: r.grade_id, qty: r.add, rate: r.rate }));
    if (!lines.length) { toast("Нэмэх тоо оруулна уу", "err"); return; }
    setBusy(true);
    try {
      await api(`/api/contracts/${d.id}/movements`, { method: "POST",
        body: JSON.stringify({ type: "ISSUE", date, note: "Нэмэлт олголт", lines }) });
      toast("Нэмэлт олголт үүслээ — дарга баталгаажуулсны дараа тооцоонд орно");
      onDone();
    } catch (e: any) { toast(e.message, "err"); setBusy(false); }
  }

  return (
    <FormModal title="Нэмэлт олголт" onClose={onClose} dirty={dirty}>
      <label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
      <input id={`${uid}-date`} type="date" className="inp mb-4 max-w-[200px]" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="flex items-center gap-3 pb-1" aria-hidden="true">
        <span className="lbl !mb-0 ml-auto w-28 text-right">{rent ? "Тариф ₮/ш/хоног" : "Нэгж үнэ"}</span>
        <span className="lbl !mb-0 w-24 text-right">Нэмэх тоо</span>
      </div>
      {/* Багана дээрх гарчиг нь ХАРАХ хүнд л ажиллана — талбар бүрийг өөрийнх
          нь материалын нэрээр бүтнээр нэрлэнэ. */}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b border-sunken last:border-0">
          <div className="min-w-0">
            <b className="text-[13.5px] text-ink">{r.material}</b>
            <span className="block text-xs text-t3">{r.grade}</span>
          </div>
          <input type="number" min={0} className="inp !min-h-10 !py-2 w-28 ml-auto text-right" value={r.rate}
                 aria-label={`${r.material} (${r.grade}) — ${rent ? "тариф ₮/ш/хоног" : "нэгж үнэ"}`}
                 onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, rate: +e.target.value } : x))} />
          <input type="number" min={0} className="inp !min-h-10 !py-2 w-24 text-right" value={r.add}
                 aria-label={`${r.material} (${r.grade}) — нэмэх тоо`}
                 onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, add: +e.target.value } : x))} />
        </div>
      ))}
      <p className="text-[12px] text-t3 mt-2">
        Олголт бүр өөрийн тарифаа хадгална — өмнөх олголтын тариф хэвээр үлдэнэ.
      </p>
      {(() => {
        const addDay = rows.reduce((s, r) => s + (r.add > 0 ? r.add * r.rate : 0), 0);
        const addQty = rows.reduce((s, r) => s + (r.add > 0 ? r.add : 0), 0);
        if (!addQty) return null;
        return (
          <Receipt className="mt-4"
            rows={[
              { label: "Нэмж олгох", value: `${fmt(addQty)} ш` },
              { label: "Өдрийн тооцоо нэмэгдэнэ", value: "+" + money(addDay), accent: "money" },
            ]}
            total={{ label: "Шинэ өдрийн нийт (баталгаажсаны дараа)", value: money((d.day_amount || 0) + addDay) }} />
        );
      })()}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "…" : "Илгээх"}</button>
      </div>
    </FormModal>
  );
}

/* ---------- Төлбөр ---------- */
export function PayModal({ d, client_id, invoices, onClose, onDone }: any) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK");
  const [barter, setBarter] = useState("");
  const [busy, setBusy] = useState(false);
  const uid = useId();
  // null = автомат хуваарилалт (хуучин зам). Object = дарга гараар чиглүүлж байна.
  const [manual, setManual] = useState<Record<number, string> | null>(null);
  const amt = parseMoney(amount);
  // penalty = бүртгэгдсэн + амьд алданги; төлбөр бүртгэх агшинд яг энэ дүн хөлдөнө
  const list = (invoices || []).map((i: any) => ({
    id: i.id, no: i.no, outstanding: i.outstanding, due_date: i.due_date,
    cycle_start: i.cycle_start, cycle_end: i.cycle_end,
    penalty_due: i.penalty || 0 }));
  const preview = allocationPreview(amt, list);
  // Гэрээний нэхэмжлэлийн хүснэгттэй ИЖИЛ нэрээр дуудна — нэг объект, нэг нэр.
  const nameOf = (id: number, no: string) =>
    invoiceLabel(list.find((i: any) => i.id === id) ?? { no });
  const cand = list
    .filter((i: any) => i.outstanding > 0 || i.penalty_due > 0)
    .sort((a: any, b: any) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id));
  const auto: Record<number, number> = {};
  preview.rows.forEach((r) => { auto[r.id] = (auto[r.id] || 0) + r.take; });
  const manualSum = manual
    ? Object.values(manual).reduce((s, v) => s + parseMoney(v), 0) : 0;
  const manualLeft = amt - manualSum;
  // Хэтэрсэн хуваарилалтыг сервер аль хэдийн татгалздаг — товчийг идэвхгүй
  // болгож, дарга дэмий дараад алдаа хүлээхээс сэргийлнэ (DepositModal-тай ижил).
  const manualOver = !!manual && manualSum > amt + 0.01;

  function startManual() {
    const init: Record<number, string> = {};
    cand.forEach((i: any) => { init[i.id] = String(Math.round(auto[i.id] || 0)); });
    setManual(init);
  }

  async function submit() {
    if (!amt || amt <= 0) { toast("Дүн оруулна уу", "err"); return; }
    if (method === "BARTER" && !barter.trim()) { toast("Бартераар юу орж ирснийг бичнэ үү", "err"); return; }
    const body: any = { client_id: client_id ?? d.client_id, contract_id: d?.id ?? null,
                        date, amount: amt, method, barter_desc: barter };
    if (manual) {
      if (manualOver) { toast("Хуваарилсан дүн төлбөрөөс их байна", "err"); return; }
      body.allocations = Object.entries(manual)
        .map(([id, v]) => ({ invoice_id: +id, amount: parseMoney(v) }))
        .filter((a) => a.amount > 0);
    }
    setBusy(true);
    try {
      const r = await api("/api/payments", { method: "POST", body: JSON.stringify(body) });
      toast(`Төлбөр бүртгэгдлээ — ${money(r.allocated)} нэхэмжлэлүүдэд хуваарилагдав`);
      onDone();
    } catch (e: any) { toast(e.message, "err"); setBusy(false); }
  }

  return (
    /* Гараар хуваарилалт эхлүүлсэн бол тэр хөдөлмөр ч дүнтэй адил алдагдана */
    <FormModal title="Төлбөр бүртгэх" onClose={onClose}
               dirty={amt > 0 || barter.trim().length > 0 || date !== today() || manual !== null}>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amount`}>Дүн ₮</label>
          <input id={`${uid}-amount`} className="inp" inputMode="numeric" placeholder="0" value={amount}
                 onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      {/* Гурван товчны БҮЛЭГ — нэг талбар биш тул нэрлэсэн бүлэг болгоно */}
      <div className="lbl mt-4" id={`${uid}-method`}>Хэлбэр</div>
      <div className="flex gap-2 mb-4" role="group" aria-labelledby={`${uid}-method`}>
        {[["CASH", "Бэлэн"], ["BANK", "Данс"], ["BARTER", "Бартер"]].map(([v, l]) => (
          <button key={v} onClick={() => setMethod(v)} aria-pressed={method === v}
            className={`flex-1 rounded-[10px] border py-2.5 font-semibold text-sm transition min-h-11 ${
              method === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2 hover:border-line-strong"}`}>
            {l}
          </button>
        ))}
      </div>
      {method === "BARTER" && (
        <div className="mb-4">
          <label className="lbl" htmlFor={`${uid}-barter`}>Бартераар юу орж ирэв? (машин, байр, материал…)</label>
          <input id={`${uid}-barter`} className="inp" placeholder="ж: Автомашин 9957УКК" value={barter}
                 onChange={(e) => setBarter(e.target.value)} />
          <p className="text-[12px] text-t3 mt-1.5">Үнэлсэн дүнгээр нь авлагаас хасагдана. Бартер модуль Үе 2-т бүрэн болно.</p>
        </div>
      )}
      {amt > 0 ? (manual ? (
        <div className="rounded-2xl border border-line-strong p-3.5 mb-1">
          <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
            <div className="min-w-0">
              <b className="text-[13px] text-ink">Хуваарилалт — гараар</b>
              {/* Юуг хуваарилж байгаагаа хараагүй бол хэтрүүлэх нь амархан */}
              <span className="block text-[12px] text-t3">
                Хуваарилах төлбөр: <b className="tabular-nums text-t2">{money(amt)}</b>
              </span>
            </div>
            <button className="text-[12.5px] font-semibold text-brand-ink hover:underline shrink-0"
                    onClick={() => setManual(null)}>Автоматаар</button>
          </div>
          {cand.length === 0 && <p className="text-[12.5px] text-t2">Нээлттэй нэхэмжлэл алга — бүх дүн кредит болно.</p>}
          {cand.map((i: any) => {
            const n = nameOf(i.id, i.no);
            return (
            <div key={i.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <div className="text-[13px] text-ink truncate">
                  {n.title}
                  {n.sub && <span className="text-[12px] text-t3 ml-1.5">{n.sub}</span>}
                </div>
                <div className="text-[12px] text-t3">
                  Үлдэгдэл {money(i.outstanding)}
                  {i.penalty_due > 0 && <> · алданги {money(i.penalty_due)}</>}
                </div>
              </div>
              <input type="number" min={0} className="inp !min-h-10 !py-2 w-36 text-right"
                     aria-label={`${n.title}${n.sub ? " " + n.sub : ""} — хуваарилах дүн ₮`}
                     value={manual[i.id] ?? "0"}
                     onChange={(e) => setManual({ ...manual, [i.id]: e.target.value })} />
            </div>
            );
          })}
          <div className={`flex items-center justify-between pt-2.5 mt-1.5 border-t border-line text-[13px] font-semibold ${
                manualLeft < 0 ? "text-danger" : "text-t2"}`}>
            <span>{manualLeft < 0 ? "Төлбөрөөс хэтэрсэн" : "Хуваарилагдаагүй"}</span>
            <b className="tabular-nums">{money(Math.abs(manualLeft))}</b>
          </div>
          <p className="text-[12px] text-t3 mt-1.5">
            Хуваарилагдаагүй үлдсэн дүн хамгийн хуучин нэхэмжлэлээс эхэлж автоматаар хаагдана.
          </p>
        </div>
      ) : (
        <>
          <Receipt className="mb-1"
            rows={[
              ...preview.rows.map((r) => {
                const n = nameOf(r.id, r.no);
                return { label: r.part === "penalty" ? `Алданги · ${n.title}` : n.title,
                         sub: n.sub, value: money(r.take) };
              }),
              ...(preview.remainder > 0
                ? [{ label: "Илүү — кредит болно (дараагийнхад автоматаар хаагдана)",
                     value: money(preview.remainder), accent: "money" as const }] : []),
            ]}
            total={{ label: method === "BARTER" ? "Бартерын үнэлгээ" : "Нийт төлбөр", value: money(amt) }} />
          <button className="btn-ghost mt-2.5" onClick={startManual}>Хуваарилалт өөрчлөх</button>
        </>
      )) : (
        <p className="text-[12.5px] text-t2">Төлбөр хамгийн хуучин нэхэмжлэлээс эхэлж автоматаар хуваарилагдана.</p>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary !bg-money" disabled={busy || manualOver} onClick={submit}
                title={manualOver ? "Хуваарилсан дүн төлбөрөөс их байна" : undefined}>
          {busy ? "…" : "Бүртгэх"}
        </button>
      </div>
    </FormModal>
  );
}

/* ---------- Барьцааны тооцоо ---------- */
function DepositModal({ d, onClose, onDone }: any) {
  const toast = useToast();
  const debt = Math.max(d.balance, 0);
  const suggestApply = Math.min(d.deposit, debt);
  // Санал болгосон хуваарилалт нь ЭХНИЙ утга — үүнийг хөндөөгүй бол цэвэрхэн
  const f0 = { date: today(), apply: String(Math.round(suggestApply)),
               ret: String(Math.round(d.deposit - suggestApply)) };
  const [f, setF] = useState(f0);
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const apply = parseMoney(f.apply);
  const ret = parseMoney(f.ret);
  const over = apply + ret > d.deposit + 0.01;
  const left = d.deposit - apply - ret;

  return (
    <FormModal title="Барьцааны тооцоо" onClose={onClose} dirty={formDirty(f0, f)}>
      <p className="text-[13.5px] text-t2 mb-4">
        Гэрээ №{d.no} · <b className="text-ink">{d.client}</b>. Барьцаа{" "}
        <b className="text-ink tabular-nums">{money(d.deposit)}</b>
        {debt > 0 && <> · одоогийн үлдэгдэл өр <b className="text-danger tabular-nums">{money(debt)}</b></>}
      </p>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-apply`}>Авлагад суутгах ₮</label>
          <input id={`${uid}-apply`} className="inp" inputMode="numeric" value={f.apply}
                 onChange={(e) => setF({ ...f, apply: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-ret`}>Харилцагчид буцаах ₮</label>
          <input id={`${uid}-ret`} className="inp" inputMode="numeric" value={f.ret}
                 onChange={(e) => setF({ ...f, ret: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
        <input id={`${uid}-date`} type="date" className="inp max-w-[200px]" value={f.date}
               onChange={(e) => setF({ ...f, date: e.target.value })} /></div>

      <Receipt className="mt-4"
        rows={[
          { label: "Барьцааны дүн", value: money(d.deposit) },
          { label: "Авлагад суутгана", value: "−" + money(apply), accent: "money" },
          { label: "Буцаана", value: "−" + money(ret) },
        ]}
        total={{ label: over ? "Барьцаанаас хэтэрсэн!" : "Тооцогдоогүй үлдэх",
                 value: money(left), accent: over ? "danger" : left > 0 ? "dim" : undefined }} />
      {apply > debt && debt >= 0 && (
        <p className="text-[12px] text-t2 mt-2.5">
          Суутгах дүн өрөөс их байна — илүү нь кредит болж дараагийн нэхэмжлэлд автоматаар суусна.
        </p>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={busy || over || (apply + ret) <= 0} onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/contracts/${d.id}/settle-deposit`, { method: "POST",
              body: JSON.stringify({ date: f.date, apply_amount: apply, return_amount: ret }) });
            toast("Барьцааны тооцоо хийгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); setBusy(false); }
        }}>{busy ? "…" : "Тооцоо хийх"}</button>
      </div>
    </FormModal>
  );
}

/* ---------- Сунгах ---------- */
function ExtendModal({ d, onClose, onDone }: any) {
  const toast = useToast();
  const date0 = d.end_date || today();
  const [date, setDate] = useState(date0);
  const uid = useId();
  return (
    <FormModal title="Гэрээ сунгах" onClose={onClose} dirty={date !== date0}>
      <label className="lbl" htmlFor={`${uid}-end`}>Шинэ дуусах огноо</label>
      <input id={`${uid}-end`} type="date" className="inp mb-5" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="flex justify-end gap-2.5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        {/* Сунгалт нь давхар дарахад давхар бүртгэгддэг байв */}
        <SubmitButton onSubmit={async () => {
          try {
            await api(`/api/contracts/${d.id}/extend`, { method: "POST", body: JSON.stringify({ end_date: date }) });
            toast("Гэрээ сунгагдлаа"); onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Сунгах</SubmitButton>
      </div>
    </FormModal>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, sayaFmt, user } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty } from "../ui";
import { formDirty } from "../lib/dirty";
import { useDownload } from "../lib/docs";
import { rowClickProps } from "../lib/rowClick";
import { clientHref } from "../lib/links";
import { UNCHARGED } from "../lib/penalty";

export default function Clients() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dl = useDownload();
  const u = user();

  const load = () => api("/api/clients").then(setRows);
  useEffect(() => { load(); }, []);
  if (!rows) return <Spinner />;

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api("/api/import/clients", { method: "POST", body: fd });
      toast(`Импорт: ${r.created} нэмэгдэв, ${r.skipped} давхардал алгасав`);
      load();
    } catch (er: any) { toast(er.message, "err"); }
    e.target.value = "";
  }

  const EXPORT = "/api/export/receivables.xlsx";
  const shown = rows.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ХАРИЛЦАГЧ <span>•</span> {rows.length} БҮРТГЭЛТЭЙ</div>
          <h1 className="dashboard-title">Харилцагч</h1>
          <p className="dashboard-subtitle">Профайл дээр дарж бүх түүхийг нь үзнэ.</p>
        </div>
        {u?.role !== "factory" && (
          <div className="flex gap-2.5 flex-wrap">
            <input type="file" ref={fileRef} className="hidden" accept=".xlsx" onChange={importFile} />
            {/* Тайлан хуудас «Excel» гэдэг — нэг файлыг хоёр нэрээр дуудахгүй */}
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}>⇧ Excel-ээс импортлох</button>
            {/* Сервер алдаа буцаавал өмнө нь тэр алдааны JSON нь «avlaga.xlsx»
                нэрээр диск рүү буудаг байв — Excel л «эвдэрсэн файл» гэж хэлнэ. */}
            <button className="btn-secondary" disabled={dl.busy}
                    aria-busy={dl.busyPath === EXPORT || undefined}
                    onClick={() => dl.download(EXPORT, "avlaga.xlsx")}>
              {dl.busyPath === EXPORT ? "Бэлтгэж байна…" : "⇩ Авлага Excel-ээр"}
            </button>
            <button className="btn-primary command-action" onClick={() => setShow(true)}>+ Шинэ харилцагч</button>
          </div>
        )}
      </div>
      <input className="inp max-w-[300px] mb-4" placeholder="Хайх…" aria-label="Харилцагч хайх"
             value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead><tr>
            <th className="th">Харилцагч</th><th className="th text-right">Идэвхтэй гэрээ</th>
            <th className="th text-right">Авлагын үлдэгдэл</th><th className="th text-right">Барьцаа</th>
            <th className="th">Төлөв</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {shown.map((c) => (
              /* Мөр дарагддаг бол ГАРААР ч дарагдана — бусад бүх жагсаалттай
                 ижил дүрэм (Tab → Enter). Энэ хүснэгт л ганцаараа гацдаг байв. */
              <tr key={c.id} className="cursor-pointer hover:bg-canvas transition group"
                  {...rowClickProps(() => nav(clientHref(c.id)),
                                    `${c.name} — харилцагчийн хуудсыг нээх`, "row")}>
                <td className="td">
                  <span className="font-bold text-ink">{c.name}</span>
                  <span className="block text-xs text-t3">{c.person}{c.phone && ` · ${c.phone}`}</span>
                </td>
                <td className="td text-right tabular-nums">{c.active_contracts}</td>
                <td className="td text-right tabular-nums">
                  <span className={`font-bold ${c.overdue ? "text-danger" : "text-ink"}`}
                        title={money(c.receivable)}>{sayaFmt(c.receivable)}₮</span>
                  {/* Нэхэгдсэн нь ӨР (улаан «+»); нэхэгдээгүй нь зөвхөн
                      тооцоолол (бүдэг «≈» + шошго) — нийлүүлж болохгүй (H2). */}
                  {c.penalty_booked > 0 && <span className="block text-[12px] text-danger"
                                          title={money(c.penalty_booked)}>+ алданги {sayaFmt(c.penalty_booked)}₮</span>}
                  {c.penalty_unbooked > 0 && <span className="block text-[12px] text-t3"
                                          title={`Тооцоолол — ${money(c.penalty_unbooked)} · ${UNCHARGED}`}>
                    ≈{sayaFmt(c.penalty_unbooked)}₮ {UNCHARGED}</span>}
                </td>
                <td className="td text-right tabular-nums" title={c.deposit > 0 ? money(c.deposit) : undefined}>
                  {c.deposit > 0 ? sayaFmt(c.deposit) + "₮" : "—"}</td>
                <td className="td">
                  {c.overdue ? <span className="pill-red">Хэтэрсэн өртэй</span> :
                   c.receivable > 0 ? <span className="pill-amber">Үлдэгдэлтэй</span> :
                   <span className="pill-green">Хэвийн</span>}
                </td>
                <td className="td text-t3 group-hover:text-ink transition" aria-hidden="true">→</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty title="Харилцагч алга" />}
      </div>
      {show && <NewClientModal onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </div>
  );
}

function NewClientModal({ onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { name: "", reg: "", person: "", phone: "", note: "" };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    <FormModal title="Шинэ харилцагч" onClose={onClose} dirty={formDirty(f0, f)}>
      <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
        <div className="col-span-2 max-sm:col-span-1"><label className="lbl" htmlFor={`${uid}-name`}>Компанийн нэр *</label>
          <input id={`${uid}-name`} className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label className="lbl" htmlFor={`${uid}-reg`}>Регистр</label>
          <input id={`${uid}-reg`} className="inp" value={f.reg} onChange={(e) => setF({ ...f, reg: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-phone`}>Утас</label>
          <input id={`${uid}-phone`} className="inp" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="col-span-2 max-sm:col-span-1"><label className="lbl" htmlFor={`${uid}-person`}>Хариуцах хүн</label>
          <input id={`${uid}-person`} className="inp" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} /></div>
        <div className="col-span-2 max-sm:col-span-1"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
          <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim()} onSubmit={async () => {
          try { await api("/api/clients", { method: "POST", body: JSON.stringify(f) }); toast("Харилцагч бүртгэгдлээ"); onDone(); }
          catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

import { useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, money, sayaFmt, sayaFmtLike, user } from "../api";
import { Spinner, FormModal, Modal, SubmitButton, useToast, Empty,
         FinanceDisclosure, FinanceBlock } from "../ui";
import { formDirty } from "../lib/dirty";
import { useDownload } from "../lib/docs";
import { dialogOpen, useLive } from "../lib/live";
import { duplicateInfo, duplicateLinkText, type DuplicateInfo } from "../lib/clientAdmin";
import { rowClickProps } from "../lib/rowClick";
import { clientHref } from "../lib/links";
import { UNCHARGED } from "../lib/penalty";
import { receivableSplit, uninvoicedLine } from "../lib/receivable";

/** Импортын хариу — нэрсээ авч явна (`routers/reports.import_clients`). */
type ImportResult = { added_names?: string[]; skipped_names?: string[];
                      created: number; skipped: number };

export default function Clients() {
  const [rows, setRows] = useState<any[] | null>(null);
  /* АЧААЛАЛТ УНАВАЛ ЭРГЭЛДЭГЧ ҮҮРД ЭРГЭНЭ гэсэн үг байсан: `load()` нь
     `.catch`-гүй тул сүлжээ тасрахад «Ачаалж байна…» гэсэн мөр мөнхөд
     зогсоно. Отгоо тэр дэлгэцийг харж суугаад «систем гацлаа» гэж дүгнэнэ
     — дахин оролдох гарц ч байхгүй. */
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dl = useDownload();
  const u = user();
  /* Даргын хувьд энэ жагсаалт нь «хэн, хэдэн гэрээтэй» — авлага нь ХОЙНО,
     «Санхүү» задаргаа дотор (эзэний шийдвэр: нууц биш, ЦЭГЦ). */
  const seesMoney = u?.role !== "factory";

  const load = (background = false) => api("/api/clients")
    .then((r) => { setRows(r); setErr(""); })
    .catch((e) => {
      if (background) return;   // чимээгүй шинэчлэлт — хуучин тоо байрандаа
      setErr(e.message);
      toast(e.message, "err");
    });
  /* Жагсаалт АМЬД: төлбөр өөр компьютер дээр бүртгэгддэг тул авлагын тоо
     хуудсыг дахин нээхгүйгээр шинэчлэгдэнэ. Цонх нээлттэй бол хүлээнэ. */
  const busyForm = show || !!imported;
  useLive((bg) => { if (bg && (busyForm || dialogOpen())) return; load(bg); }, []);

  if (!rows) {
    return err ? (
      <div className="card p-6 text-center">
        <p className="text-[14px] font-semibold text-danger mb-1">Жагсаалт ачаалагдсангүй</p>
        <p className="text-[13px] text-t2 mb-4">{err}</p>
        <button className="btn-primary" onClick={() => { setErr(""); load(); }}>
          Дахин оролдох
        </button>
      </div>
    ) : <Spinner />;
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api("/api/import/clients", { method: "POST", body: fd });
      /* ҮР ДҮН НЬ ЦОНХОНД ЗОГСОНО. Урьд нь «Импорт: 12 нэмэгдэв, 3 давхардал
         алгасав» гэсэн 3.2 секундын мэдэгдэл байв: Отгоо ХЭН алгасагдсаныг
         мэдэхгүй тул файлаа Excel дээр нээж, 200 мөр дундуур нүдээрээ хайж
         эхэлнэ (эсвэл шалгахаа больж, дутуу орсон нэрийг хожим олно). */
      setImported(r as ImportResult);
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
        {/* Даргад мөнгөний хоёр багана огт БАЙХГҮЙ — хоосон нүд үлдээвэл
            «энд ямар нэг тоо байгаа» гэж заана. */}
        <table className={`w-full ${seesMoney ? "min-w-[680px]" : "min-w-[480px]"}`}>
          <thead><tr>
            <th className="th">Харилцагч</th><th className="th text-right">Идэвхтэй гэрээ</th>
            {seesMoney && (<>
              <th className="th text-right">Авлагын үлдэгдэл</th><th className="th text-right">Барьцаа</th>
            </>)}
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
                {seesMoney && (<>
                <td className="td text-right tabular-nums">
                  <span className={`font-bold ${c.overdue ? "text-danger" : "text-ink"}`}
                        title={money(c.receivable)}>{sayaFmt(c.receivable)}₮</span>
                  {/* АВЛАГА = нэхэмжилсэн + одоогийн циклийн хуримтлал (H9b).
                      Энэ тоо дашбоард, профайл, Авлага цуглуулах дээр ЯГ ижил.
                      Задаргаа нь доор — «үүнээс нэхэмжлэгдээгүй».
                      НҮДНИЙ БҮХ ДЭД МӨР ТОЛГОЙНХОО шатаар (`sayaFmtLike`):
                      авлага нь сая, циклийн хуримтлал/алданги нь мянгаар
                      хэмжигддэг тул тус тусынхаараа шатлуулбал «1.2 сая₮»
                      дээр «13,200₮» тогтож, нэг нүдэнд ХОЁР хэмжүүр
                      уншигдана. «0.01 сая₮» гэдэг нь богино ч БҮРЭН үнэн. */}
                  {receivableSplit(c.receivable, c.receivable_invoiced).showUninvoiced && (
                    <span className="block text-[12px] text-t3"
                          title={`Одоогийн цикл — ${money(c.receivable_uninvoiced)}`}>
                      {uninvoicedLine(c.receivable_uninvoiced, c.receivable)}</span>)}
                  {/* Нэхэгдсэн нь ӨР (улаан «+»); нэхэгдээгүй нь зөвхөн
                      тооцоолол (бүдэг «≈» + шошго) — нийлүүлж болохгүй (H2). */}
                  {c.penalty_booked > 0 && <span className="block text-[12px] text-danger"
                                          title={money(c.penalty_booked)}>+ алданги {sayaFmtLike(c.penalty_booked, c.receivable)}₮</span>}
                  {c.penalty_unbooked > 0 && <span className="block text-[12px] text-t3"
                                          title={`Тооцоолол — ${money(c.penalty_unbooked)} · ${UNCHARGED}`}>
                    ≈{sayaFmtLike(c.penalty_unbooked, c.receivable)}₮ {UNCHARGED}</span>}
                </td>
                <td className="td text-right tabular-nums" title={c.deposit > 0 ? money(c.deposit) : undefined}>
                  {c.deposit > 0 ? sayaFmt(c.deposit) + "₮" : "—"}</td>
                </>)}
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

      {/* САНХҮҮ — зөвхөн даргад, жагсаалтын ХОЙНО. Хураангуй нь §3-ын бүтэн
          нэрээрээ: «Авлагын үлдэгдэл» (харилцагчийн түвшний тоо). */}
      {!seesMoney && shown.length > 0 && (
        <FinanceDisclosure name="clients"
          summary={money(shown.reduce((s: number, c: any) => s + (c.receivable || 0), 0))}
          summaryLabel="Авлагын үлдэгдэл"
          hint="Харилцагч бүрийн авлага, алданги, барьцаа — дарж дэлгэнэ.">
          <FinanceBlock title="Харилцагч бүрээр">
            <table className="w-full">
              <thead><tr>
                <th className="th">Харилцагч</th>
                <th className="th text-right">Авлагын үлдэгдэл</th>
                <th className="th text-right">Барьцаа</th>
              </tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td className="td font-bold text-ink">{c.name}</td>
                    <td className="td text-right tabular-nums">
                      <b className={c.overdue ? "text-danger" : "text-ink"}>{money(c.receivable)}</b>
                      {receivableSplit(c.receivable, c.receivable_invoiced).showUninvoiced && (
                        <span className="block text-[12px] text-t3">
                          {uninvoicedLine(c.receivable_uninvoiced)}</span>)}
                      {c.penalty_booked > 0 && (
                        <span className="block text-[12px] text-danger">
                          + алданги {money(c.penalty_booked)}</span>)}
                      {c.penalty_unbooked > 0 && (
                        <span className="block text-[12px] text-t3">
                          ≈{money(c.penalty_unbooked)} {UNCHARGED}</span>)}
                    </td>
                    <td className="td text-right tabular-nums">
                      {c.deposit > 0 ? money(c.deposit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinanceBlock>
        </FinanceDisclosure>
      )}

      {/* ШИНЭ ХАРИЛЦАГЧ БҮРТГЭГДМЭГЦ ТҮҮНИЙ ХУУДАС РУУ ОРНО. Урьд нь
          жагсаалт А–Я эрэмбээр дахин ачаалагдаж, шинэ мөр 200 нэрийн дунд
          хаа нэгтээ суудаг байв: Отгоо түүнийг олохын тулд хайлт руу нэрээ
          дахин бичнэ. Бүртгэсэн хүн дараа нь ГЭРЭЭ хийнэ — тэр ажил
          профайл дээр эхэлдэг. */}
      {show && <NewClientModal onClose={() => setShow(false)}
                               onDone={(id) => { setShow(false); nav(clientHref(id)); }} />}
      {imported && <ImportResultModal r={imported} onClose={() => setImported(null)} />}
    </div>
  );
}

/* ---------- ИМПОРТЫН ҮР ДҮН ----------
 *
 * Хоёр тоо («12 нэмэгдэв, 3 алгасав») нь ХЭН алгасагдсаныг хэлдэггүй. Тэр
 * гурав нь аль хэдийн байсан ЯГ тэр гурав уу, эсвэл нэрээ өөрөөр бичсэн
 * гурав уу? Excel дээрээ 200 мөр дундуур нүдээрээ хайхаас өөр арга байхгүй
 * байв. Одоо нэр бүр өөрөө зогсоно; цонх нь «Хаах» дартал явахгүй.
 */
function ImportResultModal({ r, onClose }: { r: ImportResult; onClose: () => void }) {
  const added = r.added_names || [];
  const skipped = r.skipped_names || [];
  return (
    <Modal title="Импортын үр дүн" onClose={onClose}
           footer={<div className="flex justify-end">
             <button className="btn-primary" onClick={onClose}>Хаах</button>
           </div>}>
      <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
        <div>
          <h3 className="text-[13px] font-bold text-money mb-2">
            Нэмэгдсэн ({added.length})
          </h3>
          {added.length === 0
            ? <p className="text-[13px] text-t3">Шинэ харилцагч нэмэгдсэнгүй.</p>
            : <ul className="list-none p-0 m-0 space-y-1">
                {added.map((n) => (
                  <li key={n} className="text-[13px] text-ink border-b border-sunken py-1
                                         last:border-0">{n}</li>))}
              </ul>}
        </div>
        <div>
          <h3 className="text-[13px] font-bold text-t2 mb-2">
            Алгассан — аль хэдийн байсан ({skipped.length})
          </h3>
          {skipped.length === 0
            ? <p className="text-[13px] text-t3">Давхардал гараагүй.</p>
            : <ul className="list-none p-0 m-0 space-y-1">
                {skipped.map((n) => (
                  <li key={n} className="text-[13px] text-t2 border-b border-sunken py-1
                                         last:border-0">{n}</li>))}
              </ul>}
        </div>
      </div>
      {/* Нэрс ирээгүй хуучин сервертэй ярьж байвал тоонууд нь хэвээр */}
      {added.length === 0 && skipped.length === 0 && (r.created > 0 || r.skipped > 0) && (
        <p className="text-[13px] text-t2 mt-4">
          {r.created} нэмэгдэв, {r.skipped} давхардал алгасав.
        </p>
      )}
    </Modal>
  );
}

function NewClientModal({ onClose, onDone }: {
  onClose: () => void;
  /** Шинэ харилцагчийн дугаар — дуудагч тал ТҮҮНИЙ хуудас руу аваачна. */
  onDone: (id: number) => void;
}) {
  const toast = useToast();
  const f0 = { name: "", reg: "", person: "", phone: "", note: "" };
  const [f, setF] = useState(f0);
  /* ДАВХАРДАЛ нь ЦОНХОН ДОТОР зогсоно. Сервер 409-д «Энэ нэртэй харилцагч
     аль хэдийн бүртгэлтэй: Бутангууд (№4)» гэж хэлээд ХААНА байгааг нь ч
     хэлдэг (`existing_id`) — тэр өгүүлбэр 3.2 секундын мэдэгдэл болж
     өнгөрвөл Отгоо бөглөсөн цонхныхоо өмнө «яагаад болохгүй байна?» гэж
     сууна, дараа нь тэр харилцагчийг гараар хайж эхэлнэ. */
  const [dup, setDup] = useState<DuplicateInfo | null>(null);
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
      {dup && (
        <div className="mt-4 rounded-xl bg-danger-50 px-4 py-3" role="alert">
          <p className="text-[13.5px] font-semibold text-danger">⚠ {dup.msg}</p>
          {/* «Аль хэдийн бүртгэлтэй» гэдэг нь ХААНА байгааг хэлэхгүй бол
              мухардмал хана — тэр хүн рүү очих гарц энд зогсоно. */}
          <Link to={clientHref(dup.existingId)} onClick={onClose}
                className="tap-link mt-1 text-[13px] font-bold text-brand-ink hover:underline">
            {duplicateLinkText(dup)} →
          </Link>
        </div>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim()} onSubmit={async () => {
          setDup(null);
          try {
            const r = await api("/api/clients", { method: "POST", body: JSON.stringify(f) });
            toast("Харилцагч бүртгэгдлээ");
            onDone(r.id);
          } catch (e: any) {
            const info = duplicateInfo(e);
            if (info) setDup(info); else toast(e.message, "err");
          }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

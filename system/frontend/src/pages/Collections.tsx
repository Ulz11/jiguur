import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, sayaFmt } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty } from "../ui";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { useLive } from "../lib/live";
import { nextSort, ariaSort, sortByNumber, type SortState } from "../lib/sort";
import { clientHref } from "../lib/links";
import { todayIso } from "../lib/schedule";
import { UNCHARGED } from "../lib/penalty";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
/** «9911-2233» → «tel:99112233» — зай, зураас утасны програмыг төөрөгдүүлнэ. */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
const KINDS: [string, string][] = [["call", "Утсаар"], ["visit", "Уулзсан"],
                                   ["message", "Мессеж"], ["other", "Бусад"]];

type SortKey = "overdue" | "oldest";

export default function Collections() {
  const [d, setD] = useState<any>(null);
  const [note, setNote] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  /* Анхны эрэмбэ = хамгийн их хэтэрсэн нь дээрээ. Энэ жагсаалт «хэнд эхэлж
     залгах вэ» гэсэн нэг асуултад хариулдаг тул эрэмбэ нь ХООСОН байж болохгүй. */
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "overdue", dir: "desc" });
  const toast = useToast();

  const load = () => api("/api/collections").then(setD).catch((e) => toast(e.message, "err"));
  /** Фонд шинэчлэх — эргэлдэгч гаргахгүй, алдааг чимээгүй залгина. */
  const refresh = () => api("/api/collections").then(setD).catch(() => {});
  useLive((bg) => (bg ? refresh() : load()), []);
  if (!d) return <Spinner />;

  const FILTERS: [string, string, (r: any) => boolean][] = [
    ["all", "Бүгд", () => true],
    ["nocontact", "Холбогдоогүй", (r) => !r.last_contact],
    ["late", "Амлалт зөрчсөн", (r) => r.promise_late],
    ["promised", "Амласан", (r) => !!r.promise_date && !r.promise_late],
    ["old", "90+ хоног", (r) => r.oldest_days >= 90],
  ];
  const test = FILTERS.find((f) => f[0] === filter)![2];
  const rows = sortByNumber(
    d.rows.filter(test),
    (r: any) => (sort.key === "overdue" ? r.overdue : r.oldest_days),
    sort.dir);
  const SORT_ARROW = sort.dir === "desc" ? "↓" : "↑";
  /** Эрэмбэлдэг баганын толгой — дарагдана, ямар эрэмбэтэй байгаагаа хэлнэ. */
  const sortTh = (key: SortKey, label: string, right?: boolean) => (
    <th className={`th ${right ? "text-right" : ""}`} aria-sort={ariaSort(sort, key)}>
      {/* Сум нь ЧИМЭГ биш — энэ багана эрэмбэлэгддэг гэдгийг хэлдэг тайван дохио.
          Идэвхтэй үед брэнд өнгөөр чиглэлээ, идэвхгүй үед бүдэг ↕ хэлбэрээр. */}
      <button className="th-sort" onClick={() => setSort(nextSort(sort, key))}
              aria-label={`${label} — эрэмбэлэх`}>
        {label}
        <span className={sort.key === key ? "text-brand-ink" : "text-t3"} aria-hidden="true">
          {sort.key === key ? SORT_ARROW : "↕"}
        </span>
      </button>
    </th>
  );

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">АВЛАГА ЦУГЛУУЛАХ <span>•</span> {d.rows.length} ХАРИЛЦАГЧ</div>
          <h1 className="dashboard-title">Авлага цуглуулах</h1>
          <p className="dashboard-subtitle">Хэнд хэзээ залгах, хэн юу амласныг нэг дэлгэцээс.</p>
        </div>
      </div>

      <div className="command-metrics mb-4">
        <div className="command-hero">
          <div className="text-white/80 text-[12.5px] font-medium mb-2">Хугацаа хэтэрсэн нийт</div>
          <div className="text-[28px] font-extrabold text-white tabular-nums leading-tight">
            {sayaFmt(d.total_overdue)} <span className="text-sm text-white/70 font-semibold">₮</span>
          </div>
          <div className="mt-2"><span className="pill bg-white/10 text-white/80">{d.rows.length} харилцагч</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Огт холбоо аваагүй</div>
          <div className="text-[28px] font-extrabold text-danger tabular-nums leading-tight">{d.no_contact}</div>
          <div className="mt-2"><span className="pill-red">эхлээд эдгээрт залгана</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Амлалт зөрчсөн</div>
          <div className="text-[28px] font-extrabold text-warn tabular-nums leading-tight">{d.promises_late}</div>
          <div className="mt-2"><span className="pill-amber">дахин холбогдох</span></div>
        </div>
        <div className="command-metric">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Амласан дүн</div>
          <div className="text-[28px] font-extrabold text-money tabular-nums leading-tight">
            {sayaFmt(d.rows.reduce((s: number, r: any) => s + (r.promise_late ? 0 : r.promise_amount), 0))}
            <span className="text-sm text-t2 font-semibold"> ₮</span>
          </div>
        </div>
      </div>

      <div className="segment mb-4 flex-wrap" role="group" aria-label="Авлагыг байдлаар нь шүүх">
        {FILTERS.map(([v, l, fn]) => (
          <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
                  className={filter === v ? "on" : ""}>
            {l} · {d.rows.filter(fn).length}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead><tr>
            <th className="th">Харилцагч</th>
            {sortTh("overdue", "Хэтэрсэн", true)}
            <th className="th text-right">Нэхэгдсэн алданги</th>
            {sortTh("oldest", "Хамгийн хуучин")}
            <th className="th">Сүүлд холбогдсон</th>
            <th className="th">Амлалт</th>
            <th className="th"></th>
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.client_id} className="hover:bg-canvas transition">
                <td className="td">
                  {/* Нэр нь ӨӨРИЙН баганадаа зогсож байгаа тул холбоос:
                      залгах хүн профайл руу нь шууд орж түүхийг нь хардаг. */}
                  <Link to={clientHref(r.client_id)} className="font-bold text-ink hover:underline">
                    {r.client}
                  </Link>
                  {/* Энэ бол залгах жагсаалт — дугаар нь дарахад залгадаг байх
                      ёстой. Отгоо дугаарыг гараар хуулж бичихээ болино. */}
                  <span className="block text-xs text-t3">
                    {r.person || "—"}
                    {r.phone && (
                      <> · <a href={telHref(r.phone)} title={`${r.phone} руу залгах`}
                              className="text-t2 font-semibold hover:text-brand-ink hover:underline">
                            ☎ {r.phone}
                          </a></>
                    )}
                  </span>
                </td>
                {/* Жагсаалт нь «хэнд эхэлж залгах вэ» гэдгийг хэлдэг тул сая нь
                    зөв — харин залгахын өмнө нэхэх дүнгээ бүтнээр нь хардаг. */}
                <td className="td text-right tabular-nums font-bold text-danger" title={money(r.overdue)}>{sayaFmt(r.overdue)}₮</td>
                {/* Утсаар ярихад ХОЁР өөр зэвсэг: нэхсэн нь өр, нэхээгүй нь
                    хөшүүрэг. Отгоо хэдийг өршөөж байгаагаа энд харна (R25). */}
                <td className="td text-right tabular-nums text-t2"
                    title={r.penalty_booked > 0 ? money(r.penalty_booked) : undefined}>
                  {r.penalty_booked > 0 ? sayaFmt(r.penalty_booked) + "₮" : "—"}
                  {r.penalty_unbooked > 0 && (
                    <span className="block text-[12px] text-t3"
                          title={`Тооцоолол — ${money(r.penalty_unbooked)} · ${UNCHARGED}`}>
                      ≈{sayaFmt(r.penalty_unbooked)}₮ {UNCHARGED}</span>)}
                </td>
                <td className="td">
                  <span className={r.oldest_days >= 90 ? "pill-red" : r.oldest_days >= 30 ? "pill-amber" : "pill-grey"}>
                    {r.oldest_days} хоног
                  </span>
                </td>
                <td className="td">
                  {r.last_contact ? (
                    <>
                      <span className="text-[13px]">{r.last_contact}</span>
                      <span className="block text-[12px] text-t3 truncate max-w-[180px]">{r.last_note}</span>
                    </>
                  ) : <span className="pill-red">Огт холбогдоогүй</span>}
                </td>
                <td className="td">
                  {r.promise_date ? (
                    <span className={r.promise_late ? "pill-red" : "pill-green"}
                          title={money(r.promise_amount)}>
                      {r.promise_date} · {sayaFmt(r.promise_amount)}₮
                    </span>
                  ) : <span className="text-t3 text-[12.5px]">—</span>}
                </td>
                <td className="td">
                  <button className="btn-primary !min-h-9 !py-1.5 !px-3 text-[12.5px]"
                          onClick={() => setNote(r)}>+ Тэмдэглэл</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <Empty title="Илэрц алга" sub="Энэ шүүлтүүрт тохирох харилцагч байхгүй. 🎉"
                 action={filter !== "all"
                   ? { label: "Бүгдийг харах", onClick: () => setFilter("all") }
                   : undefined} />
        )}
      </div>

      {note && <NoteModal r={note} onClose={() => setNote(null)}
                          onDone={() => { setNote(null); load(); }} />}
    </div>
  );
}

function NoteModal({ r, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { date: today(), kind: "call", note: "", promise_date: "", promise_amount: "" };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    /* Ярианы тэмдэглэл нь дахин сэргээгдэхгүй мэдээлэл — залгасны дараа
       санамсаргүй товшилтод алдагдвал дахин залгах шаардлагатай болно. */
    <FormModal title={`Тэмдэглэл — ${r.client}`} onClose={onClose} dirty={formDirty(f0, f)}>
      <div className="bg-sunken rounded-lg px-3.5 py-2.5 mb-4 text-[13px] text-t2">
        Хэтэрсэн <b className="text-danger tabular-nums">{money(r.overdue)}</b>
        {r.penalty_booked > 0 && <> · нэхэгдсэн алданги <b className="tabular-nums">{money(r.penalty_booked)}</b></>}
        {r.penalty_unbooked > 0 && <> · тооцоолол <b className="tabular-nums text-t3">≈{money(r.penalty_unbooked)}</b> ({UNCHARGED})</>}
        {r.phone && <> · <a href={telHref(r.phone)} title={`${r.phone} руу залгах`}
                            className="font-bold text-ink hover:text-brand-ink hover:underline">☎ {r.phone}</a></>}
      </div>

      {/* Товчны бүлэг — ганц талбар биш тул `label` биш, нэрлэсэн бүлэг */}
      <div className="lbl" id={`${uid}-kind`}>Хэлбэр</div>
      <div className="flex gap-2 mb-3.5 flex-wrap" role="group" aria-labelledby={`${uid}-kind`}>
        {KINDS.map(([v, l]) => (
          <button key={v} onClick={() => setF({ ...f, kind: v })} aria-pressed={f.kind === v}
            className={`rounded-[7px] border px-4 py-2 font-semibold text-[13px] min-h-10 transition ${
              f.kind === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{l}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date}
                 onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-pamt`}>Амлах дүн ₮</label>
          <input id={`${uid}-pamt`} className="inp" inputMode="numeric" placeholder="0" value={f.promise_amount}
                 onChange={(e) => setF({ ...f, promise_amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-pdate`}>Амлах огноо</label>
        <input id={`${uid}-pdate`} type="date" className="inp" value={f.promise_date}
               onChange={(e) => setF({ ...f, promise_date: e.target.value })} /></div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Юу ярьсан бэ?</label>
        <input id={`${uid}-note`} className="inp" autoFocus placeholder="ж: Даваа гарагт 5 сая шилжүүлнэ гэв"
               value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>

      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.note.trim()} onSubmit={async () => {
          try {
            await api(`/api/clients/${r.client_id}/notes`, { method: "POST", body: JSON.stringify({
              date: f.date, kind: f.kind, note: f.note,
              promise_date: f.promise_date || null,
              promise_amount: parseMoney(f.promise_amount) }) });
            toast("Тэмдэглэл хадгалагдлаа");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

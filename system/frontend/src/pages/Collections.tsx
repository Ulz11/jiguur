import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, fmt, money, sayaFmt, sayaFmtLike } from "../api";
import { Spinner, useToast, Empty, PageError, Exact } from "../ui";
import { dialogOpen, useLive } from "../lib/live";
import { nextSort, ariaSort, sortByNumber } from "../lib/sort";
import { clientHref } from "../lib/links";
import { canClosePromise, collectionFilterFrom, collectionSortFrom, collectionsHref,
         promiseDoneText, promiseStatusPill, sortAria,
         type CollectionFilter, type CollectionSortKey, type PromiseStatus } from "../lib/collections";
import { contactRolePill, preferredContact, telHref } from "../lib/contact";
import { PromiseNoteModal, type PromiseTarget } from "../components/PromiseNote";
import { UNCHARGED } from "../lib/penalty";
import { uninvoicedLine } from "../lib/receivable";

type SortKey = CollectionSortKey;

export default function Collections() {
  const [d, setD] = useState<any>(null);
  const [note, setNote] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyPromise, setBusyPromise] = useState<number | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  /* ШҮҮЛТҮҮР БА ЭРЭМБЭ НЬ ХАЯГАН ДЭЭР (`lib/collections.ts`). Урьд нь
     `useState`-д сууж байсан: Отгоо «Амлалт зөрчсөн» гэж шүүгээд нэг
     харилцагч руу орж, буцах товч дарахад ЖАГСААЛТ БҮГД болж эргэн ирдэг —
     тэр дөнгөж хаана байснаа алдана. */
  const [params] = useSearchParams();
  const filter = collectionFilterFrom(params.get("state"));
  const sort = collectionSortFrom(params.get("sort"));
  const go = (state: CollectionFilter, so = sort) => nav(collectionsHref(state, so));
  const setFilter = (state: CollectionFilter) => go(state);
  const setSort = (so: typeof sort) => go(filter, so);

  const load = () => api("/api/collections")
    .then((v: any) => { setD(v); setErr(null); })
    .catch((e: any) => { toast(e.message, "err"); setErr(e.message); });
  /** Фонд шинэчлэх — эргэлдэгч гаргахгүй. Уналт нь ТОПБАРЫН заагчийг
   *  шарлуулна (`api.ts` → `lib/live.ts`). */
  const refresh = () => {
    /* ⚠ ЦОНХ НЭЭЛТТЭЙ БАЙВАЛ ТАТАХГҮЙ. Отгоо «+ Тэмдэглэл» цонхонд амлалтаа
       бичиж байхад доод давхарга нь шинэчлэгдэж `d.rows` солигдоно; цонх нь
       мөрөө барьж байдаг тул тоо нь гэнэт өөрчлөгдөж, бичиж байсан зүйл нь
       эргэлзээ болно. */
    if (dialogOpen()) return Promise.resolve();
    return api("/api/collections").then((v: any) => { setD(v); setErr(null); }).catch(() => {});
  };
  useLive((bg) => (bg ? refresh() : load()), []);
  if (err && !d) return <PageError error={err} onRetry={() => { setErr(null); load(); }} />;
  if (!d) return <Spinner />;

  /* АМЛАЛТ ХААХ. Хаагдахгүй амлалт нь «Амлалт зөрчсөн» тоолуурыг ХЭЗЭЭ Ч
     буулгахгүй: төлбөр орсон ч мөр нээлттэй хэвээр тоологдож, дашбоардын
     улаан мэдэгдэл үүрд үлдэнэ. */
  async function closePromise(r: any, status: PromiseStatus) {
    setBusyPromise(r.promise_id);
    try {
      await api(`/api/collections/notes/${r.promise_id}`, {
        method: "PATCH", body: JSON.stringify({ status }) });
      toast(promiseDoneText(r.client, status));
      await load();
    } catch (e: any) { toast(e.message, "err"); }
    finally { setBusyPromise(null); }
  }

  const FILTERS: [CollectionFilter, string, (r: any) => boolean][] = [
    ["all", "Бүгд", () => true],
    ["nocontact", "Холбогдоогүй", (r) => !r.last_contact],
    ["late", "Амлалт зөрчсөн", (r) => r.promise_late],
    ["promised", "Амласан", (r) => !!r.promise_date && !r.promise_late],
    ["old", "90+ хоног", (r) => r.oldest_days >= 90],
  ];
  const test = FILTERS.find((f) => f[0] === filter)![2];
  /** Амласан ДҮН — толгойн тоо ба доорх «яг …₮» хоёул эндээс. */
  const promisedTotal = d.rows.reduce(
    (s: number, r: any) => s + (r.promise_late ? 0 : r.promise_amount), 0);
  const rows = sortByNumber(
    d.rows.filter(test),
    (r: any) => (sort.key === "overdue" ? r.overdue : r.oldest_days),
    sort.dir);
  const SORT_ARROW = sort.dir === "desc" ? "↓" : "↑";
  /* 1366×768 (Отгоогийн ЖИНХЭНЭ дэлгэц) дээр энэ хүснэгт 1,044px хэрэгсэж,
     картын 1,018px-д багтдаггүй байв: мөр бүрийн «+ Тэмдэглэл» товч баруун
     ирмэгээс 12px гадуур үлдэнэ. Тэр товч дээр л энэ хуудасны БҮХ АЖИЛ
     эхэлдэг («залгасан, тэр амлав») — хажуу тийш гүйлгэх хөдөлгөөн нь
     Excel-ийн 20 жилд түүнд огт байгаагүй тул товч нь ОРШИН БАЙДАГГҮЙТЭЙ
     адил болдог.
     Багана нэг ч АЛГА БОЛООГҮЙ: толгойн үг хоёр мөр болж эвхэгдэж
     (`whitespace-normal` — `.th` анхдагчаараа `nowrap`), хэвтээ зай нь
     арай нягт боллоо. */
  const TH = "th !whitespace-normal !px-2.5";
  const TD = "td !px-2.5";
  /** Эрэмбэлдэг баганын толгой — дарагдана, ямар эрэмбэтэй байгаагаа хэлнэ. */
  const sortTh = (key: SortKey, label: string, right?: boolean) => (
    <th className={`${TH} ${right ? "text-right" : ""}`} aria-sort={ariaSort(sort, key)}>
      {/* Сум нь ЧИМЭГ биш — энэ багана эрэмбэлэгддэг гэдгийг хэлдэг тайван дохио.
          Идэвхтэй үед брэнд өнгөөр чиглэлээ, идэвхгүй үед бүдэг ↕ хэлбэрээр. */}
      {/* Товшилтын талбай 28px байв (12px бичиг + 2×5px дүүргэлт) — шатны доод
          хязгаар 36px. Гараа чичирдэг 60 настай хүн эрэмбийн толгойг гурав
          дарж байж ондог. Дүүргэлт нь СӨРӨГ захаар нөхөгдөнө: хүснэгтийн
          толгой хэвээрээ, зөвхөн онох талбай томроно (`index.css .th-sort`). */}
      <button className="th-sort" onClick={() => setSort(nextSort(sort, key))}
              aria-label={sortAria(label, sort, key)}>
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
          {/* БҮТЭН дүн нь ил: утсаар нэхэх гэж байгаа хүнд «77.4 сая» биш,
              ЯГ тэр тоо хэрэгтэй. Урьд нь энэ картад `title` ч байгаагүй. */}
          <Exact n={d.total_overdue} className="text-white/70" />
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
          <div className="text-[28px] font-extrabold text-money tabular-nums leading-tight"
               title={money(promisedTotal)}>
            {sayaFmt(promisedTotal)}
            <span className="text-sm text-t2 font-semibold"> ₮</span>
          </div>
          <Exact n={promisedTotal} />
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
        <table className="w-full min-w-[860px]">
          <thead><tr>
            <th className={TH}>Харилцагч</th>
            {sortTh("overdue", "Хэтэрсэн", true)}
            {/* НЭГ АВЛАГА (H9b): дашбоард, харилцагчийн жагсаалт, профайл
                дээрхтэй ЯГ ИЖИЛ тоо. «Хэтэрсэн» нь түүний ДОТОРХ хэсэг —
                нэхэгдсэн, хугацаа нь өнгөрсөн. Хоёр багана зэрэгцэж зогсох нь
                залгах эрэмбийг (хэтэрсэн) авлагын бүтэн үнэнээс салгана. */}
            <th className={`${TH} text-right`}>Авлага</th>
            <th className={`${TH} text-right`}>Нэхэгдсэн алданги</th>
            {sortTh("oldest", "Хамгийн хуучин")}
            <th className={TH}>Сүүлд холбогдсон</th>
            <th className={TH}>Амлалт</th>
            <th className={TH}></th>
          </tr></thead>
          <tbody>
            {rows.map((r: any) => {
              /* ХЭНД ЗАЛГАХ ВЭ (№72, 73). Тэр ЗАХИРАЛ руу залгадаггүй —
                 тооцоо нийлж, актад гарын үсэг зурдаг хүн нь НЯРАВ. Гарын
                 үсэгтнүүд бүртгэгдсэн бол мөр нь тэр хүнийг нэрлэнэ; эс
                 бөгөөс хуучин `person`/`phone` хос хэвээр. */
              const pick = preferredContact(r.contacts);
              const name = pick?.name || r.person;
              const phone = pick?.phone || r.phone;
              return (
              <tr key={r.client_id} className="hover:bg-canvas transition">
                <td className={TD}>
                  {/* Нэр нь ӨӨРИЙН баганадаа зогсож байгаа тул холбоос:
                      залгах хүн профайл руу нь шууд орж түүхийг нь хардаг. */}
                  <Link to={clientHref(r.client_id)} className="font-bold text-ink hover:underline">
                    {r.client}
                  </Link>
                  {/* Энэ бол залгах жагсаалт — дугаар нь дарахад залгадаг байх
                      ёстой. Отгоо дугаарыг гараар хуулж бичихээ болино. */}
                  <span className="block text-xs text-t3">
                    {name || "—"}
                    {pick?.role && (
                      <> <span className={contactRolePill(pick.role)}>{pick.role}</span></>
                    )}
                    {phone && (
                      /* Утасны дугаар 15px өндөртэй холбоос байв — Отгоо
                         эгчийн энэ хуудсан дээрх ГОЛ үйлдэл (залгах) нь
                         шатныхаа доод хязгаараас (36px) хоёр дахин намхан.
                         `tap-link` нь өндрийг барьж, дүүргэлт нь мөрийн зайд
                         шингэнэ — хүснэгтийн мөр өсөхгүй. */
                      /* ⚠ `aria-label` ӨГӨХГҮЙ: холбоосын НЭР нь дэлгэц дээрх
                         ЯГ тэр текст («☎ 99960025») байх ёстой — уншигчаар
                         ажилладаг хүн «☎ 99960025» гэж сонсоод дэлгэц дээрээс
                         тэр мөрийг олно. Нэрийг нь дахин зохиовол харагдах
                         текст ба дуудагдах нэр хоёр сална. */
                      <> · <a href={telHref(phone)} title={`${phone} руу залгах`}
                              className="tap-link text-t2 font-semibold hover:text-brand-ink hover:underline">
                            ☎ {phone}
                          </a></>
                    )}
                  </span>
                </td>
                {/* Жагсаалт нь «хэнд эхэлж залгах вэ» гэдгийг хэлдэг тул сая нь
                    зөв — харин залгахын өмнө нэхэх дүнгээ бүтнээр нь хардаг. */}
                <td className={`${TD} text-right tabular-nums font-bold text-danger`} title={money(r.overdue)}>{sayaFmt(r.overdue)}₮</td>
                {/* Авлагын НИЙТ дүн — бусад дэлгэцтэй ЯГ ижил, задаргаатайгаа */}
                {/* Дэд мөр нь ТОЛГОЙНХОО шатаар (`sayaFmtLike`): авлага нь
                    сая, циклийн хуримтлал нь мянгаар хэмжигддэг тул дэд мөрийг
                    өөрийнх нь хэмжээгээр шатлуулбал «1.2 сая₮» дээр «13,200₮»
                    тогтож, нэг нүдэнд хоёр өөр хэмжүүр уншигдана. */}
                <td className={`${TD} text-right tabular-nums font-bold text-ink`} title={money(r.balance)}>
                  {sayaFmt(r.balance)}₮
                  {uninvoicedLine(r.balance_uninvoiced, r.balance) && (
                    <span className="block text-[12px] text-t3 font-normal"
                          title={`Одоогийн цикл — ${money(r.balance_uninvoiced)}`}>
                      {uninvoicedLine(r.balance_uninvoiced, r.balance)}</span>)}
                </td>
                {/* Утсаар ярихад ХОЁР өөр зэвсэг: нэхсэн нь өр, нэхээгүй нь
                    хөшүүрэг. Отгоо хэдийг өршөөж байгаагаа энд харна (R25). */}
                {/* Нүдний ТОЛГОЙ нь нэхэгдсэн алданги; нэхэгдээгүй тооцоолол нь
                    ТҮҮНИЙ шатаар бичигдэнэ. Нэхэгдсэн нь 0 (толгой нь «—») бол
                    тооцоолол өөрөө толгой болно — өөрийнхөө шатаар. */}
                <td className={`${TD} text-right tabular-nums text-t2`}
                    title={r.penalty_booked > 0 ? money(r.penalty_booked) : undefined}>
                  {r.penalty_booked > 0 ? sayaFmt(r.penalty_booked) + "₮" : "—"}
                  {r.penalty_unbooked > 0 && (
                    <span className="block text-[12px] text-t3"
                          title={`Тооцоолол — ${money(r.penalty_unbooked)} · ${UNCHARGED}`}>
                      ≈{sayaFmtLike(r.penalty_unbooked,
                                    r.penalty_booked > 0 ? r.penalty_booked : r.penalty_unbooked)}₮ {UNCHARGED}</span>)}
                </td>
                <td className={TD}>
                  <span className={r.oldest_days >= 90 ? "pill-red" : r.oldest_days >= 30 ? "pill-amber" : "pill-grey"}>
                    {r.oldest_days} хоног
                  </span>
                </td>
                <td className={TD}>
                  {r.last_contact ? (
                    <>
                      <span className="text-[13px]">{r.last_contact}</span>
                      <span className="block text-[12px] text-t3 truncate max-w-[130px]">{r.last_note}</span>
                    </>
                  ) : <span className="pill-red">Огт холбогдоогүй</span>}
                </td>
                <td className={TD}>
                  {r.promise_date ? (
                    <>
                      <span className={r.promise_late ? "pill-red" : "pill-green"}
                            title={money(r.promise_amount)}>
                        {r.promise_date} · {sayaFmt(r.promise_amount)}₮
                      </span>
                      <span className="block text-[12px] text-t3 tabular-nums mt-0.5">
                        яг {fmt(r.promise_amount)}₮
                      </span>
                      {/* ТӨЛӨВ нь мөрөн дээрээ: хаагдсан амлалт «биелсэн үү,
                          зөрчсөн үү» гэдгээ өөрөө хэлнэ (тоолуурт ч,
                          мэдэгдэлд ч ОРОХГҮЙ болсон гэдгийн шалтгаан). */}
                      {promiseStatusPill(r.promise_status) && (
                        <span className="block mt-1">
                          <span className={promiseStatusPill(r.promise_status)![1]}>
                            {promiseStatusPill(r.promise_status)![0]}
                          </span>
                        </span>
                      )}
                      {/* Хаах хоёр товч — ЗӨВХӨН нээлттэй амлалт дээр.
                          Урьд нь амлалт хаагдах арга БАЙГААГҮЙ: харилцагч
                          мөнгөө төлсөн ч «Амлалт зөрчсөн» тоолуур буурахгүй,
                          дашбоардын улаан мэдэгдэл үүрд үлддэг байв. */}
                      {canClosePromise(r) && (
                        <span className="flex gap-1.5 mt-1.5 flex-wrap max-w-[152px]">
                          <button className="btn-secondary !min-h-9 !py-1.5 !px-2.5 text-[12px]"
                                  disabled={busyPromise === r.promise_id}
                                  aria-label={`${r.client} — амлалт биелсэн гэж хаах`}
                                  onClick={() => closePromise(r, "kept")}>Биелсэн ✓</button>
                          <button className="btn-secondary !min-h-9 !py-1.5 !px-2.5 text-[12px]"
                                  disabled={busyPromise === r.promise_id}
                                  aria-label={`${r.client} — амлалт зөрчсөн гэж хаах`}
                                  onClick={() => closePromise(r, "broken")}>Зөрчсөн</button>
                        </span>
                      )}
                    </>
                  ) : <span className="text-t3 text-[12.5px]">—</span>}
                </td>
                <td className={TD}>
                  <button className="btn-primary !min-h-9 !py-1.5 !px-3 text-[12.5px]"
                          onClick={() => setNote(r)}>+ Тэмдэглэл</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <Empty title="Илэрц алга" sub="Энэ шүүлтүүрт тохирох харилцагч байхгүй. 🎉"
                 action={filter !== "all"
                   ? { label: "Бүгдийг харах", onClick: () => setFilter("all") }
                   : undefined} />
        )}
      </div>

      {/* Цонх нь `components/PromiseNote.tsx`-д НҮҮСЭН: харилцагчийн профайл
          ЯГ тэр цонхыг дуудна. Нэг цонх хоёр газарт хоёр өөр асуулт болж
          салбал Отгоо аль нэгэнд нь итгэхээ болино. */}
      {note && <PromiseNoteModal t={collectionTarget(note)} onClose={() => setNote(null)}
                                 onDone={() => { setNote(null); load(); }} />}
    </div>
  );
}

/** Жагсаалтын мөр → цонхны оролт. «Авлага цуглуулах» дээр хугацаа хэтэрсэн
 *  ДҮН нь мэдэгддэг тул цонх түүнийг ч харуулна (профайл дээр байхгүй). */
function collectionTarget(r: any): PromiseTarget {
  return {
    clientId: r.client_id, client: r.client, overdue: r.overdue,
    balance: r.balance, balanceUninvoiced: r.balance_uninvoiced,
    penaltyBooked: r.penalty_booked, penaltyUnbooked: r.penalty_unbooked,
    contacts: r.contacts, person: r.person, phone: r.phone,
  };
}

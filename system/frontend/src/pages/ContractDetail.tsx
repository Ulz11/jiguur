import { Fragment, ReactNode, useEffect, useId, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, money, fmt, user } from "../api";
import { Spinner, StatePill, TypePill, Prog, Modal, FormModal, SubmitButton, useToast,
         InlineEdit, Receipt, ConfirmModal, Chevron, DisclosureCell, DisclosureHead } from "../ui";
import { panelId, disclosureProps } from "../lib/disclosure";
import { allocationPreview } from "../lib/alloc";
import { CYCLE_MODES, cycleModeHint, cycleModeLabel, endDateLabel } from "../lib/contract";
import { invoiceLabel } from "../lib/invoice";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { usePdf } from "../lib/docs";
import { rowClickProps } from "../lib/rowClick";
import { lotOptions, materialSections, MaterialSection } from "../lib/lots";
import { penaltySplit, penaltyChargeRows, penaltyChargeTotal, UNCHARGED } from "../lib/penalty";
import { clientHref, invoiceAnchorId, materialHref } from "../lib/links";
import { todayIso } from "../lib/schedule";
import { isVoided, movementStockRows, voidRowClass, voidTitle } from "../lib/void";
import { AKT_KINDS, AktKind, aktAmountText, aktCycleLabel, aktKind, aktLandingText,
         aktSigned } from "../lib/akt";
import { VoidButton, VoidPaymentModal } from "../components/VoidPayment";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
/** Хөдөлгөөний нэр — мөрөн дээр ч, дуудагдах нэрэнд ч НЭГ эх сурвалж. */
const mvName = (t: string) => (t === "ISSUE" ? "Ачилт" : t === "RETURN" ? "Буцаалт" : "Акт");

export default function ContractDetail() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [modal, setModal] = useState<"" | "return" | "add" | "pay" | "extend" | "deposit"
                                        | "close" | "penalty">("");
  const [openMv, setOpenMv] = useState<number | null>(null);
  /* Задарсан материалын мөр — `material_id:grade_id` түлхүүрээр санана, тул
     тоо засаад хуудас дахин ачаалагдахад ЯГ тэр мөр задарсан хэвээр үлдэнэ. */
  const [openMat, setOpenMat] = useState<string | null>(null);
  /* Хөдөлгөөний хуучин түүх нь ХОЁРДОГЧ болов (материал бүрийн доор задардаг
     дэвтэр нь үндсэн байрлал). null = хараахан шийдээгүй → хүлээгдэж буй
     ачилт байвал өөрөө нээлттэй, эс бөгөөс хумигдсан. */
  const [histOpen, setHistOpen] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /* Цуцлах гэж буй төлбөр — баталгаажуулах цонх нь мөрөө өөртөө авч явна. */
  const [voidPay, setVoidPay] = useState<any>(null);
  const [voidMv, setVoidMv] = useState<any>(null);
  /* Актын цонх: "new" = шинэ бичилт, мөр = тэр мөрийг засах, null = хаалттай.
     Нэг цонх хоёр горимд — шинээр бичих, засах хоёр ижил маягттай тул хоёр
     өөр цонх байвал хоёр өөр газарт өөр асуулт болно. */
  const [akt, setAkt] = useState<any | "new" | null>(null);
  const [voidAkt, setVoidAkt] = useState<any>(null);
  const toast = useToast();
  const pdf = usePdf();
  const u = user();
  /* Үйлдвэрийн дарга материал хөдөлгөх хүн — АВЛАГЫН хүн биш. Түүнд гэрээний
     үлдэгдэл, нэхэмжлэл, төлбөр, барьцаа, тарифтай PDF харагдах ёсгүй: тэр
     мэдээллийг агуулахын шалан дээр асуух хүн бий, тэр нь Отгоо. */
  const seesMoney = u?.role !== "factory";

  const load = () => api(`/api/contracts/${id}`).then(setD).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); api("/api/grades").then(setGrades); }, [id]);

  /* ---------- Хаягаар заасан мөр рүү ----------
     Дашбоардын «хугацаа хэтэрсэн» жагсаалт, мэдэгдэл хоёр ЯГ нэг нэхэмжлэлийг
     нэрлээд гэрээний ТОЛГОЙД буулгадаг байв. Одоо хаяг нь мөрөө авчирдаг:
     `#inv-{id}` → тэр мөрийг нүдний өмнө гаргаж, товч зуур асаана.
     Мөрүүд зурагдсаны ДАРАА л хайна (`ready`) — эс бөгөөс зангилаа хараахан
     төрөөгүй байна. Дараагийн ачаалалт (засвар хийхэд) дахин асаахгүй. */
  const { hash } = useLocation();
  const ready = !!d;
  useEffect(() => {
    if (!ready || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    /* ШУУД байрлуулна, гүйлгэж үзүүлэхгүй: энэ бол ХУУДАС СОЛИГДСОН мөч —
       өмнөх байрлалтай залгах орон зай алга, зөөлөн гүйлт нь зөвхөн хүлээлт
       нэмнэ (зарим хөтөч дээр огт ажиллахгүй ч байдаг). Хуудас нээгдэхдээ
       ЗААСАН мөрөө нүдний өмнө барьж, товч зуур асаана. */
    el.scrollIntoView({ block: "center" });
    el.classList.add("row-flash");
    const t = window.setTimeout(() => el.classList.remove("row-flash"), 1600);
    return () => window.clearTimeout(t);
  }, [hash, ready]);

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
  /* Цуцлалт бол МӨНГӨНИЙ засвар — менежер, санхүүчийнх (сервер ч тэгж
     хардаг). Үйлдвэрийн даргад төлбөрийн хэсэг огт харагддаггүй.
     ЧӨЛӨӨТ АКТ (бичих/засах/цуцлах) нь МӨН мөнгө тул ЯГ энэ хүрээгээр явна. */
  const canVoid = u?.role === "manager" || u?.role === "finance";
  /* Алданги НЭХЭХ нь мөнгөний шийдвэр — цуцлалттай ижил хүрээ. Товч нь
     нэхэх зүйл БАЙВАЛ л гарна: нэхэх юмгүй үед товч байх нь «дараад юу ч
     болсонгүй» гэсэн бүтэлгүй үйлдэл болно (Чадварын харьцуулалт H2). */
  const pen = penaltySplit(d.penalty, d.penalty_booked);
  const canCharge = canVoid && d.penalty_percent > 0 && pen.showUnbooked;
  const sections = materialSections(d.items || [], d.material_lines || []);
  const pendingMv = d.movements.filter((m: any) => m.status === "pending").length;
  const showHist = histOpen ?? pendingMv > 0;

  return (
    <div>
      <Link to="/contracts" className="btn-ghost mb-3 inline-flex">← Гэрээнүүд рүү буцах</Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink tracking-tight flex items-center gap-2.5 flex-wrap">
            <Link to={clientHref(d.client_id)} className="hover:underline">{d.client}</Link>
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
                {/* Харагдах нэр («Дуусах:») нь ХАРЦНЫХ. Уншигчид талбарын
                    нэрийг InlineEdit-ийн `label` аль хэдийн хэлдэг тул хоёуланг
                    зарлавал «Дуусах: Дуусах огноо: Хугацаагүй, засах» болно —
                    нэг талбар НЭГ л удаа нэрлэгдэнэ. */}
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true">Дуусах:</span>
                  <InlineEdit type="date" label="Дуусах огноо" value={d.end_date || ""}
                    display={endDateLabel(d.end_date)}
                    confirmText="Огноо солих уу?" width="w-36"
                    onSave={(v) => savePatch(`/api/contracts/${d.id}`,
                      v ? { end_date: v } : { clear_end_date: true }, "Дуусах огноо шинэчлэгдлээ")} />
                </span>
                {/* ТООЦООНЫ МӨЧЛӨГ (H3 / R5) — цөөнх гэрээ КАЛЕНДАРЬ САРААР
                    нэхэгддэг (31 хоногтой сар ×31/30 илүү). Горим солих нь
                    эхлэх огноо солихтой ижил хүндийн засвар: БҮХ цикл шинээр
                    зурагдана, тиймээс `gatedPatch` — нэхэмжлэлтэй гэрээнд
                    RebuildModal эхлээд зөрүүг харуулна. Дуусах огноо, алданги
                    шиг ЧӨЛӨӨТЭЙ хадгалагдаж БОЛОХГҮЙ. */}
                {d.type === "rent" && (
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true">Мөчлөг:</span>
                    {u?.role === "manager" ? (
                      <InlineEdit label="Тооцооны мөчлөг" value={d.cycle_mode || "days"}
                        display={cycleModeLabel(d.cycle_mode)} options={CYCLE_MODES}
                        width="w-36" confirmText="Мөчлөг солих уу?"
                        onSave={(v) => gatedPatch(`/api/contracts/${d.id}`, { cycle_mode: v },
                                                  "Тооцооны мөчлөг шинэчлэгдлээ")} />
                    ) : cycleModeLabel(d.cycle_mode)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true">Алданги:</span>
                  <InlineEdit type="number" label="Алданги" value={d.penalty_percent} suffix="%/хоног" width="w-20" right
                    confirmText="Алданги солих уу?"
                    onSave={(v) => savePatch(`/api/contracts/${d.id}`,
                      { penalty_percent: parseMoney(v) }, "Алдангийн хувь шинэчлэгдлээ")} />
                </span>
                {/* Барьцаа нь ГАНЦ гэрээний тодорхой дүн — доорх «Барьцаа»
                    хайрцаг үүнийг бүтнээр нь харуулдаг. Толгойд нь сая болгож
                    дугуйлбал нэг тоо хоёр өөр дүн болж харагдана. */}
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true">Барьцаа:</span>
                  <InlineEdit type="number" label="Барьцаа" value={d.deposit} display={d.deposit > 0 ? money(d.deposit) : "—"}
                    confirmText="Барьцаа солих уу?" width="w-28" right
                    onSave={(v) => savePatch(`/api/contracts/${d.id}`,
                      { deposit: parseMoney(v) }, "Барьцаа шинэчлэгдлээ")} />
                </span>
              </>
            ) : (
              /* Алдангийн ХУВЬ нь гэрээний мөнгөн нөхцөл — дуусах огноо нь
                 ажлын хуваарь. Даргад үлдэх нь хугацаа, явахгүй нь хувь. */
              <span>→ {endDateLabel(d.end_date)}</span>
            )}
          </div>
          {seesMoney && (
            <div className="text-t2 text-[13px] mt-1.5 inline-flex items-center gap-1.5">
              <span aria-hidden="true">Тэмдэглэл:</span>
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
              {/* Алданги нэхэх нь ТҮҮНИЙ шийдвэр — систем хэзээ ч өөрөө нэхэхгүй.
                  Товч нь нэхэгдээгүй тооцоолол байгаа үед л гарна. */}
              {canCharge && (
                <button className="btn-ghost text-danger" onClick={() => setModal("penalty")}>
                  Алданги нэхэх
                </button>
              )}
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
        {/* «Өдрийн дүн», «Энэ циклд хуримтлагдсан» нь ХУРИМТЛАЛ — авлагын хоёр
            нүүр. Дарга материал тоолдог хүн тул эдгээр нь түүнд харагдахгүй
            (сервер ч талбарыг нь илгээхээ больсон). */}
        {seesMoney && d.type === "rent" && <Num label="Өдрийн дүн" val={money(d.day_amount)} />}
        {seesMoney && cyc && <Num label="Энэ циклд хуримтлагдсан" val={money(cyc.accrued)} />}
        {/* Энэ мөрөнд «Өдрийн дүн», «Хуримтлагдсан» нь ТӨГРӨГӨӨРӨӨ зогсож
            байхад үлдэгдэл нь «12.3 сая» гэж дугуйлагддаг байв — Отгоо яг
            хэдийг нэхэхээ мэдэхгүй, доорх нэхэмжлэлүүдтэй нийлүүлж ч чадахгүй.
            Ганц гэрээний дүн энд бүтнээрээ зогсоно. */}
        {seesMoney && (
          <Num label="Нийт үлдэгдэл" val={money(d.balance)} danger={d.state === "overdue"} />
        )}
        {/* АЛДАНГИ ХОЁР НҮҮРТЭЙ (R25 / H2). «Нэхэгдсэн» нь МӨНГӨ — улаан,
            төлөгдөнө. «Тооцоолол» нь ХӨШҮҮРЭГ — бүдэг, ≈ угтвартай, доор нь
            «нэхэгдээгүй» гэж бичигдэнэ. Отгоо хэдийг өршөөж байгаагаа анх
            удаа харна; нийлүүлж нэг тоо болговол «машин өр зохиов» болно. */}
        {seesMoney && pen.booked > 0 && (
          <Num label="Нэхэгдсэн алданги" val={money(pen.booked)} danger />
        )}
        {seesMoney && pen.showUnbooked && (
          <Num label="Алдангийн тооцоолол" val={"≈" + money(pen.unbooked)}
               sub={UNCHARGED} dim />
        )}
        {cyc && (
          <div className="flex-1 min-w-[210px]">
            <div className="text-[12px] text-t3 font-semibold uppercase tracking-wider mb-2.5">
              Цикл {cyc.cycle_start} – {cyc.cycle_end} · {cyc.days_done}/{cyc.days_total} хоног
            </div>
            <Prog pct={(cyc.days_done / cyc.days_total) * 100} />
            {/* Календарь горимд «31 хоног» гэсэн тоо гэнэт гарч ирнэ (30 биш) —
                тэр нь алдаа биш, ГЭРЭЭНИЙ нөхцөл гэдгийг энд НЭГ мөрөөр хэлнэ. */}
            {d.cycle_mode === "month" && (
              <p className="text-[12px] text-t3 mt-2">{cycleModeHint(d.start_date)}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 max-lg:grid-cols-1">
        <div className="space-y-4">
          {/* Материал — мөр бүр өөрийнхөө хөдөлгөөний түүхийг доороо задална */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 pt-4 pb-1">
              <h2 className="font-bold text-ink text-[15.5px]">
                {d.type === "rent" ? "Түрээсэнд байгаа материал" : "Худалдсан материал"}
              </h2>
              <span className="pill-grey">{fmt(d.items.reduce((s: number, i: any) => s + i.qty, 0))} ширхэг</span>
            </div>
            {/* Даргад ҮНИЙН хоёр багана огт БАЙХГҮЙ — хоосон нүд үлдээвэл
                «энд ямар нэг тоо байгаа» гэж заана (Machines.tsx-ийн журам). */}
            {/* +30px — задрах тэмдгийн багана (`chev-cell`) */}
            <table className={`w-full ${seesMoney ? "min-w-[550px]" : "min-w-[390px]"}`}>
              <thead><tr>
                <DisclosureHead />
                <th className="th">Материал</th><th className="th">Зэрэглэл</th>
                <th className="th text-right">Тоо</th>
                {seesMoney && (
                  <>
                    <th className="th text-right">{d.type === "rent" ? "Тариф ₮/ш/хоног" : "Нэгж үнэ"}</th>
                    <th className="th text-right">{d.type === "rent" ? "Өдрийн дүн" : "Нийт"}</th>
                  </>
                )}
              </tr></thead>
              <tbody>
                {sections.map((sec) => {
                  const open = openMat === sec.key;
                  const has = sec.lines.length > 0;
                  const pid = panelId("mat", sec.key);
                  return (
                  <Fragment key={sec.key}>
                    {/* Хүснэгтэд мөргүй үлдсэн түүх (гэрээний мөрд ороогүй
                        материал) ч мөрөө авна — түүх чимээгүй алга болохгүй. */}
                    {(sec.rows.length ? sec.rows : [{ ...sec, orphan: true }]).map((it: any, i: number) => (
                      /* Нэг материал ХОЁР тарифаар гарсан бол хоёр мөр болно —
                         хоёулаа «Хэв хашмал 6012 (В) — түүхийг нээх» гэж ЯГ
                         ижилхэн дуудагдвал уншигчаар ажилладаг хүн хоёр өөр
                         мөрийг ялгаж чадахгүй. Ялгаж буй зүйл нь ТАРИФ. */
                      <tr key={i} className={has ? "cursor-pointer hover:bg-canvas transition" : undefined}
                          {...(has ? disclosureProps(open, pid) : {})}
                          {...(has ? rowClickProps(() => setOpenMat(open ? null : sec.key),
                                `${sec.material} (${sec.grade})${
                                  sec.rows.length > 1 && !it.orphan
                                    ? ` · ${fmt(it.qty)}ш${
                                        /* Мөрийг ялгах ТАРИФ нь даргад нууц —
                                           дуудагдах нэрэнд ч гарахгүй (өмнөх
                                           алдаа `title=`-д нуугдаж байсан).
                                           Түүнд тоо ширхэг өөрөө ялгана. */
                                        seesMoney
                                          ? ` · ${fmt(d.type === "rent" ? it.daily_rate : it.unit_price)}₮`
                                          : ""}`
                                    : ""} — хөдөлгөөний түүхийг ${open ? "хаах" : "нээх"}`,
                                "row") : {})}>
                        {/* Задрах тэмдэг ЗӨВХӨН эхний мөрөнд байв — атал доорх
                            тарифын мөрүүд ЧУХАМ ижилхэн задардаг (нэг л самбар).
                            Тэмдэггүй мөр дарахад дээд мөрийн самбар нээгддэг нь
                            хэнд ч ойлгогдохгүй: одоо бүлгийн МӨР БҮР тэмдэгтэй,
                            бүгд НЭГ самбарыг (`pid`) заана. */}
                        {has ? <DisclosureCell open={open} /> : <td className="td chev-cell" />}
                        <td className="td font-bold text-ink">
                          {sec.material}
                          {/* «Хэдэн мөр» биш «ХЭД ирж байна» — баталгаажаагүй
                              ачилтыг задлалгүйгээр мөрөн дээрээс уншина. */}
                          {i === 0 && sec.pending > 0 && (
                            <span className="pill-amber ml-2">+{fmt(sec.pendingQty)}ш хүлээгдэж буй</span>
                          )}
                        </td>
                        <td className="td"><span className="pill-blue">{it.grade}</span></td>
                        <td className="td text-right tabular-nums">{fmt(it.qty)}</td>
                        {seesMoney && (<>
                        <td className="td text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                          {it.orphan ? "—" : u?.role === "manager" ? (
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
                          {it.orphan ? "—" : money(d.type === "rent" ? it.day_amount : it.qty * it.unit_price)}
                        </td>
                        </>)}
                      </tr>
                    ))}
                    {open && (
                      <tr id={pid}><td colSpan={seesMoney ? 6 : 4} className="td !bg-canvas !p-0">
                        <MaterialLedger sec={sec} sale={d.type === "sale"} seesMoney={seesMoney}
                          canEdit={u?.role === "manager"} onEdit={gatedPatch}
                          onVoid={(mid) => setVoidMv(
                            d.movements.find((m: any) => m.id === mid))} />
                      </td></tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ЧӨЛӨӨТ АКТ (R12 / түр R15 / H4) — материал ба нэхэмжлэлийн ДУНД.
              Отгоогийн хуудасны блок нь ЯГ энэ дараалалтай: материалын мөрүүд ×
              хоног → АКТ → НӨАТ → Нийт төлөх дүн. Тиймээс акт нь материалын
              доор, нэхэмжлэлийн дээр зогсоно — түүний 20 жилийн нүдний хөдөлгөөн
              хэвээрээ үлдэнэ. Худалдааны гэрээнд цикл байхгүй тул хэсэг ч алга. */}
          {seesMoney && d.type === "rent" && (
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 pt-4 pb-1 gap-3 flex-wrap">
              <h2 className="font-bold text-ink text-[15.5px]">Акт бичилтүүд</h2>
              {canVoid && (
                <button className="btn-secondary btn-row"
                        onClick={() => setAkt("new")}>+ Акт бичих</button>
              )}
            </div>
            {(d.akt_entries || []).length === 0 ? (
              <p className="text-t3 text-sm px-4 pb-4">
                Акт бичигдээгүй. Тээвэр, цэвэрлэгээ, кран дуудлага, эсвэл тохирсон
                хөнгөлөлтийг «+ Акт бичих»-ээр тухайн циклд нэмнэ.
              </p>
            ) : (
              <table className="w-full min-w-[600px]">
                <thead><tr>
                  <th className="th">Огноо</th>
                  <th className="th text-right">Дүн</th>
                  <th className="th">Тэмдэглэл</th>
                  <th className="th">Цикл</th>
                  <th className="th"></th>
                </tr></thead>
                <tbody>
                  {d.akt_entries.map((a: any) => (
                    <tr key={a.id}>
                      <td className="td whitespace-nowrap">
                        <span className={voidRowClass(a)} title={voidTitle(a)}>{a.date}</span>
                      </td>
                      {/* Тэмдэг нь дүнгийнхээ ӨМНӨ зогсоно; хөнгөлөлт нь дээрээс
                          нь ҮГЭЭР ч нэрлэгдэнэ — өнгө дангаараа утга зөөхгүй. */}
                      <td className="td text-right tabular-nums whitespace-nowrap">
                        <b className={`${voidRowClass(a)} ${a.amount < 0 ? "text-money" : "text-ink"}`}>
                          {aktAmountText(a.amount)}
                        </b>
                        {a.amount < 0 && (
                          <span className="block text-[12px] text-t3">хөнгөлөлт</span>
                        )}
                      </td>
                      <td className="td">
                        <span className={voidRowClass(a)}>{a.note}</span>
                        {isVoided(a) && (
                          <span className="block text-[12px] text-danger">
                            Шалтгаан: {a.void_reason}
                            {a.voided_by && <span className="text-t3"> · {a.voided_by}</span>}
                          </span>
                        )}
                      </td>
                      <td className="td text-[12.5px] text-t2 whitespace-nowrap">
                        {aktCycleLabel(a.cycle_start && a.cycle_end
                          ? { start: a.cycle_start, end: a.cycle_end } : null)}
                      </td>
                      <td className="td">
                        {isVoided(a) ? (
                          <span className="pill-red" title={voidTitle(a)}>ХҮЧИНГҮЙ</span>
                        ) : canVoid && (
                          <div className="flex gap-1.5 flex-wrap">
                            <button className="btn-row" onClick={() => setAkt(a)}
                                    title="Актын бичилт засах">
                              Засах<span className="sr-only"> — {a.date} · {a.note}</span>
                            </button>
                            <VoidButton label={`${a.date} · ${a.note}`}
                                        onClick={() => setVoidAkt(a)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          )}

          {/* Нэхэмжлэл */}
          {seesMoney && (
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 pt-4 pb-1">
              <h2 className="font-bold text-ink text-[15.5px]">Нэхэмжлэлүүд</h2>
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
                  /* Мөр өөрөө хаягтай: дашбоард, мэдэгдэл хоёр ЭНЭ мөр рүү
                     шууд буудаг (lib/links.ts `invoiceAnchorId`). */
                  <tr key={inv.id} id={invoiceAnchorId(inv.id)}>
                    <td className="td">
                      {/* Үеийн огноо хоёр мөр болж таслагдвал уншихад хүнд */}
                      <span className="font-semibold text-ink whitespace-nowrap">{lb.title}</span>
                      {lb.sub && <span className="block text-[12px] text-t3">{lb.sub}</span>}
                    </td>
                    <td className="td text-right tabular-nums">
                      {money(inv.total)}
                      {/* Нэхэгдсэн нь ӨР (улаан «+»), нэхэгдээгүй нь зөвхөн
                          тооцоолол (бүдэг «≈») — нийлүүлж болохгүй. */}
                      {inv.penalty_due > 0 && <span className="block text-[12px] text-danger">+ алданги {money(inv.penalty_due)}</span>}
                      {inv.penalty_unbooked > 0 && <span className="block text-[12px] text-t3">≈{money(inv.penalty_unbooked)} алданги · {UNCHARGED}</span>}
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
          {/* Он цагийн дараалсан түүх — материалын доорх дэвтэр гарснаар
              ХОЁРДОГЧ болов. Гэхдээ хумигдсанаас өөр юу ч алдагдаагүй:
              хөдөлгөөний ОГНОО, тэмдэглэл нь ганц хөдөлгөөнд бүхэлд нь
              хамаардаг тул материалын мөрөнд бус, зөвхөн энд засагдана. */}
          <div className="card p-5">
            {/* Гарчиг нь ТОВЧИЙГ агуулна (button дотор heading биш) — уншигчаар
                ажилладаг хүн гарчгаар нь үсэрч, тэндээсээ задална. */}
            <h2 className="text-[15.5px]">
              {/* `aria-controls` нь БАЙГАА зангилаа заана: хумигдсан үед мөр нь
                  DOM-д огт байхгүй тул холбоос нь мухардмал болно. Нээлттэй
                  үедээ л заана — `aria-expanded` нь төлөвөө өөрөө хэлнэ. */}
              <button type="button" {...disclosureProps(showHist, "mv-history")}
                      className="flex items-center gap-2 w-full text-left font-bold text-ink"
                      onClick={() => setHistOpen(!showHist)}>
                <Chevron open={showHist} />
                Хөдөлгөөний түүх
                <span className="pill-grey ml-auto">{fmt(d.movements.length)}</span>
                {pendingMv > 0 && <span className="pill-amber">{fmt(pendingMv)} хүлээгдэж буй</span>}
              </button>
            </h2>
            {!showHist && (
              <p className="text-[12.5px] text-t3 mt-2">
                Он цагийн дараалал, хөдөлгөөний огноо/тэмдэглэлийн засвар энд.
                Материал бүрийн түүх дээд хүснэгтийн мөр дээр дарахад задарна.
              </p>
            )}
            {showHist && (
            <div id="mv-history" className="relative pl-6 mt-4 before:content-[''] before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-sunken">
              {d.movements.map((mv: any) => {
                const open = openMv === mv.id;
                const mvPid = panelId("mv", mv.id);
                return (
                <div key={mv.id} className="relative pb-4 last:pb-0">
                  <i className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-white border-[3px] ${
                    mv.type === "ISSUE" ? "border-brand" : mv.type === "RETURN" ? "border-warn" : "border-danger"}`} />
                  {/* Задардаг мөр — хулганаар ч, Tab+Enter-ээр ч нээгдэнэ */}
                  <div className="cursor-pointer" title={voidTitle(mv) || "Дарж дэлгэрэнгүйг нээнэ"}
                       {...disclosureProps(open, mvPid)}
                       {...rowClickProps(() => setOpenMv(open ? null : mv.id),
                         `${mv.date} · ${mvName(mv.type)} — дэлгэрэнгүйг ${open ? "хаах" : "нээх"}`)}>
                    <span className="text-[12px] text-t3 font-semibold">{mv.date}</span>
                    {mv.status === "pending" && !isVoided(mv) &&
                      <span className="pill-amber ml-2">хүлээгдэж буй</span>}
                    {isVoided(mv) && <span className="pill-red ml-2">ХҮЧИНГҮЙ</span>}
                    <b className={`block text-[13.5px] text-ink font-semibold ${voidRowClass(mv)}`}>
                      <Chevron open={open} />{" "}
                      {mvName(mv.type)} — {fmt(mv.lines.reduce((s: number, l: any) => s + l.qty, 0))}ш
                    </b>
                    {/* Шалтгаан нь ГОЛ мэдээлэл — tooltip дотор нуугдвал
                        Отгоо «яагаад» гэдгээ уншихын тулд хулгана барих
                        хэрэгтэй болно. Мөрөндөө ил гарна. */}
                    {isVoided(mv) && mv.void_reason && (
                      <span className="block text-[12px] text-danger">
                        {mv.void_reason}
                        {mv.voided_by && <span className="text-t3"> · {mv.voided_by}</span>}
                      </span>
                    )}
                  </div>
                  {!open ? (
                    <div className="text-[12.5px] text-t2">
                      {mv.lines.slice(0, 3).map((l: any, i: number) => (
                        <span key={i}>{l.material} ({l.grade}) ×{fmt(l.qty)}{l.return_grade && l.return_grade !== l.grade ? ` → ${l.return_grade}` : ""}{i < Math.min(mv.lines.length, 3) - 1 ? " · " : ""}</span>
                      ))}
                      {/* Засвар/акт нь ХОЁР зүйл: хэдэн ширхэг (даргын тоолол)
                          ба хэдэн төгрөг (харилцагчийн тооцоо). Даргад ТОО нь
                          үлдэж, ДҮН нь явахгүй — «450,000₮» гэсэн мөр байхгүй. */}
                      {mv.lines.some((l: any) => (seesMoney ? l.repair_fee : l.repair_qty) > 0) && (
                        <span className="block text-warn">
                          Засвар: {seesMoney
                            ? money(mv.lines.reduce((s: number, l: any) => s + l.repair_fee, 0))
                            : `${fmt(mv.lines.reduce((s: number, l: any) => s + l.repair_qty, 0))}ш`}
                        </span>
                      )}
                      {mv.lines.some((l: any) => (seesMoney ? l.writeoff_fee : l.writeoff_qty) > 0) && (
                        <span className="block text-danger">
                          Акт: {seesMoney
                            ? money(mv.lines.reduce((s: number, l: any) => s + l.writeoff_fee, 0))
                            : `${fmt(mv.lines.reduce((s: number, l: any) => s + l.writeoff_qty, 0))}ш`}
                        </span>
                      )}
                      {mv.note && <span className="block text-t3">{mv.note}</span>}
                    </div>
                  ) : (
                    <div id={mvPid} className="mt-1.5 rounded-2xl border border-line-strong p-3 bg-sunken/40">
                      {u?.role === "manager" && (
                        <div className="text-[12px] text-t2 inline-flex items-center gap-1.5 mb-2">
                          <span aria-hidden="true">Огноо:</span>
                          <InlineEdit type="date" label={`${mv.date} · ${mvName(mv.type)} — огноо`}
                            value={mv.date} display={mv.date} width="w-36"
                            confirmText="Огноо солих уу?"
                            onSave={(v) => gatedPatch(`/api/movements/${mv.id}`, { date: v },
                                                      "Хөдөлгөөний огноо шинэчлэгдлээ")} />
                        </div>
                      )}
                      {/* Хөдөлгөөн ЦУЦЛАХ нь менежерийн засварын зам: устгал
                          байхгүй тул буруу бичсэн ачилт/буцаалтыг зогсоох
                          ганц арга. Дэлгэрэнгүй дотор — жагсаалт дундуур
                          санамсаргүй дарагдахгүй. */}
                      {u?.role === "manager" && !isVoided(mv) && (
                        <div className="mb-2">
                          <VoidButton label={`${mv.date} · ${mvName(mv.type)}`}
                                      onClick={() => setVoidMv(mv)} />
                        </div>
                      )}
                      {mv.lines.map((l: any) => (
                        <div key={l.id} className="flex items-center gap-2 py-1.5 border-b border-line last:border-0 flex-wrap">
                          <div className="min-w-0">
                            <b className="text-[12.5px] text-ink">{l.material}</b>
                            <span className="block text-[12px] text-t3">
                              {l.grade}{l.return_grade && l.return_grade !== l.grade ? ` → ${l.return_grade}` : ""}
                              {(seesMoney ? l.repair_fee : l.repair_qty) > 0 && (
                                <span className="text-warn">
                                  {" "}· засвар {seesMoney ? money(l.repair_fee) : `${fmt(l.repair_qty)}ш`}
                                </span>
                              )}
                              {(seesMoney ? l.writeoff_fee : l.writeoff_qty) > 0 && (
                                <span className="text-danger">
                                  {" "}· акт {seesMoney ? money(l.writeoff_fee) : `${fmt(l.writeoff_qty)}ш`}
                                </span>
                              )}
                            </span>
                          </div>
                          <span className="ml-auto text-[12px] text-t2 inline-flex items-center gap-1.5">
                            <span aria-hidden="true">Тоо:</span>
                            {u?.role === "manager" ? (
                              <InlineEdit type="number" right width="w-20"
                                label={`${l.material} (${l.grade}) · ${mv.date} — тоо`}
                                value={l.qty} display={fmt(l.qty)}
                                confirmText="Тоо солих уу?"
                                onSave={(v) => gatedPatch(`/api/movement-lines/${l.id}`,
                                                          { qty: parseMoney(v) },
                                                          "Хөдөлгөөний тоо шинэчлэгдлээ")} />
                            ) : fmt(l.qty)}
                          </span>
                          {/* ---- БУЦААЛТЫН ДЭЛГЭРЭНГҮЙ — хяналттай засвар ----
                              H1/H5: дарга талбай дээр «энэ 40ш В зэрэглэл»
                              гэж шийдээд бичдэг, маргааш нь засварт орох нь
                              5ш байсныг олж мэднэ. Устгах зам байхгүй тул
                              ЗАСАХ зам байх ёстой. Дүн нь гараар бичигдэхгүй —
                              каталогоос дахин бодогдоно; нэхэмжлэгдсэн бол
                              `gatedPatch` эхлээд зөрүүг харуулна. */}
                          {mv.type === "RETURN" && u?.role === "manager" && (
                            <ReturnDetailEdits mv={mv} l={l} grades={grades}
                              sec={sections.find((s) => s.material_id === l.material_id
                                                        && s.grade_id === l.grade_id)}
                              onEdit={gatedPatch} />
                          )}
                          {/* Падангийн тариф нь МӨНГӨ — даргад талбар нь ч,
                              нэр нь ч гарахгүй (сервер утгыг нь илгээхгүй). */}
                          {seesMoney && mv.type === "ISSUE" && (
                            <span className="text-[12px] text-t2 inline-flex items-center gap-1.5">
                              <span aria-hidden="true">Тариф:</span>
                              {u?.role === "manager" ? (
                                <InlineEdit type="number" right width="w-20"
                                  label={`${l.material} (${l.grade}) · ${mv.date} — тариф`}
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
            )}
          </div>

          {seesMoney && (
          <div className="card p-5">
            <h2 className="font-bold text-ink text-[15.5px] mb-3">Төлбөрүүд</h2>
            {d.payments.length === 0 && <p className="text-t3 text-sm">Төлбөр бүртгэгдээгүй.</p>}
            {d.payments.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-sunken last:border-0 flex-wrap">
                {/* Цуцлагдсан бичилт УСТДАГГҮЙ — зурагдаж, бүдгэрч, дэргэдээ
                    «ХҮЧИНГҮЙ» гэсэн ҮГТЭЙГЭЭ үлдэнэ (өнгө дангаараа утга
                    зөөхгүй), шалтгаан нь tooltip дээр. */}
                <div className={voidRowClass(p)} title={voidTitle(p)}>
                  <b className="text-[13.5px] tabular-nums text-ink">{money(p.amount)}</b>
                  <span className="block text-[12px] text-t3">{p.date}</span>
                </div>
                {isVoided(p) && <span className="pill-red" title={voidTitle(p)}>ХҮЧИНГҮЙ</span>}
                <span className={`ml-auto ${voidRowClass(p)} ${p.method === "BARTER" ? "pill-violet" : p.method === "CASH" ? "pill-green" : "pill-blue"}`}>
                  {p.method === "BARTER" ? `Бартер · ${p.barter_desc}` : p.method === "CASH" ? "Бэлэн" : "Данс"}
                </span>
                {canVoid && !isVoided(p) && (
                  <VoidButton label={`${money(p.amount)} · ${p.date}`}
                              onClick={() => setVoidPay(p)} />
                )}
                {isVoided(p) && p.void_reason && (
                  <span className="basis-full text-[12px] text-danger">
                    Шалтгаан: {p.void_reason}
                    {p.voided_by && <span className="text-t3"> · {p.voided_by}</span>}
                    {p.voided_at && <span className="text-t3"> · {p.voided_at}</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
          )}

          {seesMoney && d.deposit > 0 && (
            <div className="card p-5">
              <h2 className="font-bold text-ink text-[15.5px] mb-3">Барьцаа</h2>
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

      {/* Буцаалт, нэмэлт олголт нь ДАРГЫН ажил (`canManage`) — цонх нь түүнд
          нээгддэг тул мөнгөний зураас цонх дотор ч үргэлжилнэ. */}
      {modal === "return" && <ReturnModal d={d} grades={grades} seesMoney={seesMoney}
                                          onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "add" && <AddModal d={d} seesMoney={seesMoney}
                                    onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "pay" && <PayModal d={d} invoices={d.invoices} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "extend" && <ExtendModal d={d} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "deposit" && <DepositModal d={d} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "penalty" && <ChargePenaltyModal d={d} onClose={() => setModal("")}
                                                  onDone={() => { setModal(""); load(); }} />}
      {modal === "close" && (() => {
        /* Гэрээ хаах нь буцаагдахгүй үйлдэл — юу үлдэж байгааг эхлээд харуулна. */
        const depositOpen = d.deposit > 0 && d.deposit_status !== "settled";
        return (
          <ConfirmModal
            title="Гэрээ хаах"
            intro={<>Гэрээ №{d.no} · <b className="text-ink">{d.client}</b> — хаасны дараа шинэ хуримтлал
                    бодогдохгүй. Үлдэгдэл авлага, нэхэгдсэн алданги хэвээр үлдэнэ.</>}
            rows={[
              { label: "Үлдэгдэл авлага", value: money(d.balance),
                accent: d.balance > 0 ? "danger" : undefined },
              /* НЭХЭГДСЭН нь нийлбэрт орно; НЭХЭГДЭЭГҮЙ нь зөвхөн мэдээлэл —
                 хаалтын дүнд оруулбал хэзээ ч шийдээгүй мөнгө өр болно. */
              ...(pen.booked > 0
                ? [{ label: "Нэхэгдсэн алданги", value: money(pen.booked), accent: "danger" as const }] : []),
              ...(pen.showUnbooked
                ? [{ label: `Алдангийн тооцоол — ${UNCHARGED}`,
                     value: "≈" + money(pen.unbooked), accent: "dim" as const }] : []),
              ...(depositOpen
                ? [{ label: "⚠ Барьцааны тооцоо хийгдээгүй байна", value: money(d.deposit),
                     accent: "danger" as const }] : []),
            ]}
            total={{ label: "Хаах үед үлдэх нийт тооцоо", value: money(d.balance + pen.booked),
                     accent: d.balance + pen.booked > 0 ? "danger" : "money" }}
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
      {voidPay && <VoidPaymentModal payment={voidPay} onClose={() => setVoidPay(null)}
                                    onDone={() => { setVoidPay(null); load(); }} />}
      {voidMv && <VoidMovementModal mv={voidMv} onClose={() => setVoidMv(null)}
                                    onDone={() => { setVoidMv(null); load(); }}
                                    onRebuild={(p) => { setVoidMv(null); setPending(p); }} />}
      {akt && <AktModal d={d} row={akt === "new" ? null : akt}
                        onClose={() => setAkt(null)}
                        onDone={() => { setAkt(null); load(); }}
                        onRebuild={(p) => { setAkt(null); setPending(p); }} />}
      {voidAkt && <VoidAktModal d={d} a={voidAkt} onClose={() => setVoidAkt(null)}
                                onDone={() => { setVoidAkt(null); load(); }}
                                onRebuild={(p) => { setVoidAkt(null); setPending(p); }} />}
    </div>
  );
}

/* ---------- Дахин бодох баталгаажуулалт ---------- */
/** `method` — хөдөлгөөн ЦУЦЛАХ нь POST-оор явдаг тул үйл үг нь тогтмол байхаа
 *  больсон. Заагаагүй бол PATCH (inline засварын хуучин зам). */
type Pending = { path: string; body: any; okMsg: string; diffs: any[];
                 warnings: string[]; method?: "PATCH" | "POST" };

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
            await api(p.path, { method: p.method || "PATCH",
                                body: JSON.stringify({ ...p.body, confirm: true }) });
            toast(p.okMsg + " — тооцоо дахин бодогдлоо");
            onDone();
          } catch (e: any) { toast(e.message, "err"); setBusy(false); }
        }}>{busy ? "…" : "Баталгаажуулж дахин бодох"}</button>
      </div>
    </Modal>
  );
}

/* ---------- ЧӨЛӨӨТ АКТ бичих / засах (R12 / түр R15 / H4) ----------
   Отгоогийн «акт» бол эвдрэлийн хөлс биш, хоёр талын гарын үсэгтэй ХЭЛЭЛЦЭЭР:
   тээвэр, цэвэрлэгээ, кран дуудлага нэг циклд эвхэгддэг, БАС хөнгөлөлт байдаг
   («нийт актнаас 15% хасч тооцлоо»).

   ТЭМДГИЙГ БИЧҮҮЛЭХГҮЙ, СОНГУУЛНА: тэр Excel дээрээ хасах тэмдэг бичдэггүй,
   «хасч тооцлоо» гэж ҮГЭЭР бичдэг. Хоёр товч + эерэг дүн нь хасах тэмдгээ
   мартаад хөнгөлөлтөө нэмэгдэл болгох боломжийг бүрмөсөн хаана.

   Нэг цонх ХОЁР горимд (шинэ / засвар) — маягт нь ижил, зам нь ижил хаалга. */
function AktModal({ d, row, onClose, onDone, onRebuild }: {
  d: any;
  /** null = шинэ бичилт; мөр = түүнийг засах */
  row: any | null;
  onClose: () => void;
  onDone: () => void;
  onRebuild: (p: Pending) => void;
}) {
  const toast = useToast();
  const uid = useId();
  const init = {
    date: row ? row.date : today(),
    kind: (row ? aktKind(row.amount) : "charge") as AktKind,
    amount: row ? String(Math.abs(row.amount)) : "",
    note: row ? row.note : "",
  };
  const [date, setDate] = useState(init.date);
  const [kind, setKind] = useState<AktKind>(init.kind);
  const [amount, setAmount] = useState(init.amount);
  const [note, setNote] = useState(init.note);

  const signed = aktSigned(kind, amount);
  const ok = Math.abs(signed) > 0 && note.trim().length > 0 && !!date;
  const okMsg = row ? "Актын бичилт шинэчлэгдлээ" : "Акт бичигдлээ";
  const path = row ? `/api/akt/${row.id}` : `/api/contracts/${d.id}/akt`;
  const method = row ? "PATCH" : "POST";

  async function submit() {
    const body = { date, amount: signed, note: note.trim() };
    try {
      const r = await api(path, { method, body: JSON.stringify(body) });
      if (r?.rebuild_required) {
        onRebuild({ path, body, method, okMsg,
                    diffs: r.diffs || [], warnings: r.warnings || [] });
        return;
      }
      toast(okMsg);
      onDone();
    } catch (e: any) { toast(e.message, "err"); }
  }

  return (
    <FormModal title={row ? "Актын бичилт засах" : "Акт бичих"} onClose={onClose}
               dirty={formDirty(init, { date, kind, amount, note })}>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={date}
                 onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amount`}>Дүн ₮</label>
          <input id={`${uid}-amount`} className="inp" inputMode="numeric" placeholder="0"
                 value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>

      {/* Тэмдгийн БҮЛЭГ — нэг талбар биш тул нэрлэсэн бүлэг (төлбөрийн
          «Хэлбэр»-тэй ижил хэв). Сонгосон нь дүнгээ өөрөө нэрлэнэ. */}
      <div className="lbl mt-4" id={`${uid}-kind`}>Төрөл</div>
      <div className="flex gap-2 mb-1.5" role="group" aria-labelledby={`${uid}-kind`}>
        {AKT_KINDS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setKind(v)} aria-pressed={kind === v}
            className={`flex-1 rounded-[10px] border py-2.5 font-semibold text-sm transition min-h-11 ${
              kind === v ? "border-brand bg-brand-50 text-brand-ink"
                         : "border-line-strong text-t2"}`}>
            {l}
          </button>
        ))}
      </div>
      {/* Хадгалагдах ЯГ тэр дүн — тэмдэгтэйгээ, нүдний өмнө */}
      <p className="text-[12.5px] text-t2 mb-4 tabular-nums">
        Циклд орох дүн: <b className={Math.abs(signed) > 0
          ? (signed < 0 ? "text-money" : "text-ink") : "text-t3"}>{aktAmountText(signed)}</b>
      </p>

      <label className="lbl" htmlFor={`${uid}-note`}>
        Тэмдэглэл <span className="text-danger">*</span>
      </label>
      <input id={`${uid}-note`} className="inp" value={note}
             placeholder="ж: кран дуудлага, тээвэр, нийт актнаас 15% хасав"
             aria-describedby={`${uid}-help`}
             onChange={(e) => setNote(e.target.value)} />
      <p id={`${uid}-help`} className="text-[12px] text-t3 mt-1.5">
        Энэ бичиг нэхэмжлэл, хавсралт, актын цаас гуравт хэвлэгдэнэ — «юуны төлөө»
        гэдэг нь гарын үсэгтэй мөрөндөө байх ёстой.
        {/* Бартерын +15% нь тусдаа хөдөлгүүр (P1) — түүнийг ХҮЛЭЭЛГЭХГҮЙ,
            эндээс гараар бичих зам нь өнөөдөр бий гэдгийг хэлнэ (түр R15). */}
        {" "}Бартерын 15% нэмэгдлийг түр энд бичиж болно.
      </p>

      {/* АМЬД мөр: бичиж буй огноо ХААШАА буухыг хадгалахаас ӨМНӨ хэлнэ.
          Циклийн нэр нь нэхэмжлэлийн мөртэй ижил хэлбэртэй тул Отгоо нүдээрээ
          тулгана. */}
      <p className="text-[12.5px] text-t2 mt-4 rounded-xl bg-sunken px-3.5 py-2.5">
        {aktLandingText(d, date) || "Огноо сонгоно уу"}
      </p>

      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton onSubmit={submit} disabled={!ok}
                      title={ok ? undefined : "Дүн ба тэмдэглэл заавал бөглөгдөнө"}>
          {row ? "Хадгалах" : "Акт бичих"}
        </SubmitButton>
      </div>
    </FormModal>
  );
}

/* ---------- Актын бичилт хүчингүй болгох ---------- */
function VoidAktModal({ d, a, onClose, onDone, onRebuild }: {
  d: any; a: any;
  onClose: () => void;
  onDone: () => void;
  onRebuild: (p: Pending) => void;
}) {
  const [reason, setReason] = useState("");
  const toast = useToast();
  const rid = useId();
  const path = `/api/akt/${a.id}/void`;

  return (
    <ConfirmModal
      title="Актын бичилт хүчингүй болгох"
      intro={<>
        <b className="text-ink">{a.date} · {a.note}</b> — энэ бичилт УСТАХГҮЙ:
        жагсаалтад «ХҮЧИНГҮЙ» тэмдэгтэй, шалтгаантайгаа хамт үлдэнэ. Нэхэмжлэл,
        хавсралт, актын цаасны аль нь ч түүнийг дахин хэвлэхгүй. Энэ үйлдлийг
        буцаах боломжгүй.
      </>}
      rows={[{ label: aktCycleLabel(a.cycle_start && a.cycle_end
                        ? { start: a.cycle_start, end: a.cycle_end } : null),
               sub: "энэ циклээс гарна",
               value: aktAmountText(-a.amount), accent: "danger" as const }]}
      total={{ label: `Гэрээ №${d.no} · циклийн дүн өөрчлөгдөнө`,
               value: aktAmountText(-a.amount), accent: "danger" }}
      note="Нэхэмжлэгдсэн циклд хамаарвал дараагийн алхамд зөрүүг харуулна."
      confirmLabel="Хүчингүй болгох"
      confirmDisabled={!reason.trim()}
      danger
      onClose={onClose}
      onConfirm={async () => {
        const body = { reason: reason.trim() };
        try {
          const r = await api(path, { method: "POST", body: JSON.stringify(body) });
          if (r?.rebuild_required) {
            onRebuild({ path, body, method: "POST", okMsg: "Актын бичилт хүчингүй болов",
                        diffs: r.diffs || [], warnings: r.warnings || [] });
            return;
          }
          toast("Актын бичилт хүчингүй болов");
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }}>
      <label className="block text-[12.5px] font-semibold text-t2 mb-1.5" htmlFor={rid}>
        Цуцлах шалтгаан <span className="text-danger">*</span>
      </label>
      <input id={rid} className="inp w-full" value={reason} autoFocus
             placeholder="ж: давхар бичсэн"
             onChange={(e) => setReason(e.target.value)} />
    </ConfirmModal>
  );
}

/* ---------- Буцаалтын дэлгэрэнгүйн хяналттай засвар ----------
   Дөрвөн шийдвэр — БҮГД даргын гараар бичигдсэн, тул бүгд засагдана:
   буцаж ирсэн зэрэглэл, засварт орсон тоо, актад орсон тоо, аль падангаас
   хасагдах (падан-pin, H5).

   Дүн (засварын хөлс, актын НБҮнэ) энд ОГТ БАЙХГҮЙ: тэдгээр нь тооноос
   каталогоор дахин бодогддог (сервер тал `_recompute_fees`). Гараар дүн
   бичих цонх байвал каталог ба баримт хоёр мөнхөд зөрнө.

   Зам нь хуучин `gatedPatch` — тоо/тарифын засвартай ЯГ ижил: нэхэмжлэгдсэн
   циклд хүрвэл RebuildModal эхлээд зөрүүг харуулна. */
function ReturnDetailEdits({ mv, l, grades, sec, onEdit }: {
  mv: any; l: any; grades: any[]; sec?: MaterialSection;
  onEdit: (path: string, body: any, okMsg: string) => Promise<void>;
}) {
  const path = `/api/movement-lines/${l.id}`;
  const name = `${l.material} (${l.grade}) · ${mv.date}`;
  const cur = l.return_grade_id ?? l.grade_id;
  const wrap = "text-[12px] text-t2 inline-flex items-center gap-1.5";
  return (
    <>
      <span className={wrap}>
        <span aria-hidden="true">Буцсан зэрэглэл:</span>
        <InlineEdit width="w-28" label={`${name} — буцаж ирсэн зэрэглэл`}
          options={grades.map((g: any) => [String(g.id), g.code] as [string, string])}
          value={String(cur)} display={l.return_grade || l.grade}
          confirmText="Зэрэглэл солих уу?"
          onSave={(v) => onEdit(path, { return_grade_id: Number(v) },
                                "Буцаж ирсэн зэрэглэл шинэчлэгдлээ")} />
      </span>
      <span className={wrap}>
        <span aria-hidden="true">Засвар:</span>
        <InlineEdit type="number" right width="w-16" label={`${name} — засварт орсон тоо`}
          value={l.repair_qty ?? 0} display={fmt(l.repair_qty ?? 0)}
          confirmText="Засварын тоо солих уу?"
          onSave={(v) => onEdit(path, { repair_qty: parseMoney(v) },
                                "Засварын тоо шинэчлэгдэж, дүн дахин бодогдлоо")} />
      </span>
      <span className={wrap}>
        <span aria-hidden="true">Акт:</span>
        <InlineEdit type="number" right width="w-16" label={`${name} — актад орсон тоо`}
          value={l.writeoff_qty ?? 0} display={fmt(l.writeoff_qty ?? 0)}
          confirmText="Актын тоо солих уу?"
          onSave={(v) => onEdit(path, { writeoff_qty: parseMoney(v) },
                                "Актын тоо шинэчлэгдэж, дүн дахин бодогдлоо")} />
      </span>
      <span className={wrap}>
        <span aria-hidden="true">Падан:</span>
        <InlineEdit width="w-56" label={`${name} — аль падангаас хасагдах`}
          options={lotOptions(sec, mv.date, l.id)}
          value={String(l.issue_line_id ?? 0)}
          display={l.issue_line_id ? `#${l.issue_line_id}` : "авто"}
          confirmText="Падан солих уу?"
          onSave={(v) => onEdit(path, { issue_line_id: Number(v) },
                                "Буцаалтын падан шинэчлэгдлээ")} />
      </span>
    </>
  );
}

/* ---------- Хөдөлгөөн хүчингүй болгох ----------
   Гэрээний түүх ба материалын дэвтэр ХОЁУЛАА энэ цонхыг дуудна.

   Хоёр шаттай зам: эхлээд нөөц ЮУ буцахыг Receipt дээр харуулж шалтгаан
   асууна; сервер «энэ нэхэмжлэгдсэн цонхонд байна» гэвэл ХОЁРДУГААР цонх
   (RebuildModal) циклүүдийн хуучин→шинэ дүнг харуулна. Отгоо мөнгө хөдөлгөх
   бүрд юу болохоо ХАРЖ байж зөвшөөрнө. */
function VoidMovementModal({ mv, onClose, onDone, onRebuild }: {
  mv: any;
  onClose: () => void;
  onDone: () => void;
  onRebuild: (p: Pending) => void;
}) {
  const [reason, setReason] = useState("");
  const toast = useToast();
  const rid = useId();
  const rows = movementStockRows(mv);
  const name = `${mv.date} · ${mvName(mv.type)}`;

  return (
    <ConfirmModal
      title={`${mvName(mv.type)} хүчингүй болгох`}
      intro={<>
        <b className="text-ink">{name}</b> — энэ бичилт УСТАХГҮЙ: түүхэндээ
        «ХҮЧИНГҮЙ» тэмдэгтэй, шалтгаантайгаа хамт үлдэнэ. Тооцоо түүнийг
        хараагүй мэт ажиллана. Энэ үйлдлийг буцаах боломжгүй.
      </>}
      rows={rows.length
        ? rows.map((r) => ({ label: r.label, sub: r.sub, value: r.value,
                             accent: "danger" as const }))
        : [{ label: "Нөөц хөдлөхгүй", sub: "хараахан баталгаажаагүй ачилт",
             value: "—", accent: "dim" as const }]}
      note="Нэхэмжлэгдсэн циклд хамаарвал дараагийн алхамд зөрүүг харуулна."
      confirmLabel="Хүчингүй болгох"
      confirmDisabled={!reason.trim()}
      danger
      onClose={onClose}
      onConfirm={async () => {
        const body = { reason: reason.trim() };
        try {
          const r = await api(`/api/movements/${mv.id}/void`, {
            method: "POST", body: JSON.stringify(body) });
          if (r?.rebuild_required) {
            onRebuild({ path: `/api/movements/${mv.id}/void`, body, method: "POST",
                        okMsg: `${mvName(mv.type)} хүчингүй болов`,
                        diffs: r.diffs || [], warnings: r.warnings || [] });
            return;
          }
          toast(`${mvName(mv.type)} хүчингүй болов`);
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }}>
      <label className="block text-[12.5px] font-semibold text-t2 mb-1.5" htmlFor={rid}>
        Цуцлах шалтгаан <span className="text-danger">*</span>
      </label>
      <input id={rid} className="inp w-full" value={reason} autoFocus
             placeholder="ж: буруу гэрээнд бичсэн"
             onChange={(e) => setReason(e.target.value)} />
    </ConfirmModal>
  );
}

/* ---------- Материалын хөдөлгөөний дэвтэр (задарсан мөр) ----------
   Отгоогийн Numbers дэвтрийн «материалын доорх түүх»: юу гарсан (падан), юу
   буцсан, БУЦААЛТ АЛЬ ПАДАНГААС хасагдсан, тэгээд мөр бүрийн дараа хэд гадаа
   үлдсэн. Хамаарлыг тооцооны хөдөлгүүр өөрөө бодож өгдөг (хадгалагддаггүй) —
   энд зөвхөн харагдана.

   Тоо/тарифын засвар нь Хөдөлгөөний түүхийн ЯГ тэр зам: `gatedPatch` →
   нэхэмжлэгдсэн циклд хүрвэл эхлээд зөрүүг харуулж, баталгаажуулсан үед л
   дахин бодно. Хөдөлгүүр татгалзвал (жишээ нь гадаа байгаагаас их буцаалт)
   серверийн монгол шалтгаан мэдэгдэл болж гарна. */
function MaterialLedger({ sec, sale, seesMoney, canEdit, onEdit, onVoid }: {
  sec: MaterialSection;
  sale: boolean;
  /** Даргад: тоо, огноо, падангийн ХАМААРАЛ, үлдэгдэл нь ажил тул ХЭВЭЭР;
   *  тариф/нэгж үнэ, засвар/актын дүн нь мөнгө тул багана нь ч байхгүй. */
  seesMoney: boolean;
  canEdit: boolean;
  onEdit: (path: string, body: any, okMsg: string) => Promise<void>;
  /** Дэвтрийн мөрөөс хөдөлгөөнөө цуцлах — цонхыг гэрээний хуудас эзэмшинэ. */
  onVoid: (movementId: number) => void;
}) {
  const th = "th !text-[11px] !py-1.5 !px-2.5";
  const td = "td !text-[12.5px] !py-2 !px-2.5 align-top";
  return (
    <div className="p-3 overflow-x-auto">
      {/* Худалдаанд падан гэж байхгүй, бараа «гадаа» ч байхгүй — зарагдсан.
          Нэг л толгойн мөр хоёр өөр бодит байдлыг зөв нэрлэнэ. */}
      {/* Дэвтрийн толгой дахь материалын нэр нь АГУУЛАХЫН хуудас руугаа:
          «энэ хэв өөр хаана байна вэ» гэдгийг нэг товшилтоор. Хүснэгтийн мөр
          өөрөө дэвтрээ задлах үүрэгтэй хэвээр — тэр үйлдлийг булаахгүй. */}
      <div className="text-[12px] text-t2 mb-2">
        <Link to={materialHref(sec.material_id)} className="font-bold text-ink hover:underline">
          {sec.material}
        </Link>{" "}({sec.grade}) —{" "}
        {sale ? "бүх олголтын түүх · нийт олгогдсон " : "бүх падангийн хөдөлгөөн · одоо түрээсэнд "}
        <b className="text-ink tabular-nums">{fmt(sec.qty)}</b>ш
      </div>
      <table className={`w-full ${seesMoney ? "min-w-[520px]" : "min-w-[420px]"}`}>
        <thead><tr>
          <th className={th}>Огноо</th>
          <th className={th}>Хөдөлгөөн</th>
          <th className={`${th} text-right`}>Тоо</th>
          {seesMoney && <th className={`${th} text-right`}>{sale ? "Нэгж үнэ" : "Тариф"}</th>}
          {!sale && <th className={th} title="Аль олголтын мөрөөс хасагдав">Падан</th>}
          <th className={`${th} text-right`}>{sale ? "Нийт олгогдсон" : "Түрээсэнд үлдсэн"}</th>
        </tr></thead>
        <tbody>
          {sec.lines.map((ln) => {
            const issue = ln.type === "ISSUE";
            const name = `${sec.material} · ${ln.date} · ${mvName(ln.type)}`;
            return (
            <tr key={ln.id} title={voidTitle(ln)}>
              <td className={`${td} whitespace-nowrap tabular-nums ${voidRowClass(ln)}`}>{ln.date}</td>
              <td className={td}>
                <b className={`text-ink ${voidRowClass(ln)}`}>{mvName(ln.type)}</b>
                {ln.status === "pending" && !isVoided(ln) &&
                  <span className="pill-amber ml-1.5">хүлээгдэж буй</span>}
                {isVoided(ln) && <span className="pill-red ml-1.5">ХҮЧИНГҮЙ</span>}
                {isVoided(ln) && ln.void_reason && (
                  <span className="block text-[12px] text-danger">{ln.void_reason}</span>
                )}
                {/* Дэвтрийн мөр дээр ч цуцлах зам байна: Отгоо материалын
                    түүхээ уншиж байгаад буруу мөрөө таньдаг — тэндээсээ
                    гарахгүйгээр засна. */}
                {canEdit && !isVoided(ln) && (
                  <VoidButton label={`${ln.date} · ${mvName(ln.type)}`}
                              onClick={() => onVoid(ln.movement_id)} />
                )}
                {!!ln.return_grade && ln.return_grade !== sec.grade && (
                  <span className="text-t3"> → {ln.return_grade}</span>
                )}
                {((seesMoney ? ln.repair_fee : ln.repair_qty) ?? 0) > 0 && (
                  <span className="block text-warn">
                    засвар {fmt(ln.repair_qty ?? 0)}ш
                    {seesMoney && ` · ${money(ln.repair_fee ?? 0)}`}
                  </span>
                )}
                {((seesMoney ? ln.writeoff_fee : ln.writeoff_qty) ?? 0) > 0 && (
                  <span className="block text-danger">
                    акт {fmt(ln.writeoff_qty ?? 0)}ш
                    {seesMoney && ` · ${money(ln.writeoff_fee ?? 0)}`}
                  </span>
                )}
                {ln.note ? <span className="block text-t3">{ln.note}</span> : null}
              </td>
              <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                {canEdit ? (
                  <InlineEdit type="number" right width="w-20" label={`${name} — тоо`}
                    value={ln.qty} display={(issue ? "+" : "−") + fmt(ln.qty)}
                    confirmText="Тоо солих уу?"
                    onSave={(v) => onEdit(`/api/movement-lines/${ln.id}`,
                                          { qty: parseMoney(v) },
                                          "Хөдөлгөөний тоо шинэчлэгдлээ")} />
                ) : (
                  <span className={issue ? "text-ink font-semibold" : "text-warn font-semibold"}>
                    {(issue ? "+" : "−") + fmt(ln.qty)}
                  </span>
                )}
              </td>
              {seesMoney && (
              <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                {!issue ? <span className="text-t3">—</span>
                  : canEdit ? (
                  <InlineEdit type="number" right width="w-20" label={`${name} — ${sale ? "нэгж үнэ" : "тариф"}`}
                    value={ln.rate ?? ""} display={ln.rate != null ? fmt(ln.rate) : "—"}
                    confirmText={sale ? "Нэгж үнэ солих уу?" : "Тариф солих уу?"}
                    onSave={(v) => onEdit(`/api/movement-lines/${ln.id}`,
                                          { rate: parseMoney(v) },
                                          "Паданны тариф шинэчлэгдлээ")} />
                ) : (ln.rate != null ? fmt(ln.rate) : "—")}
              </td>
              )}
              {!sale && (
                <td className={td}>
                  {issue ? (
                    /* Олголтын мөр өөрөө ПАДАН — доорх буцаалтууд энэ дугаараар
                       нь буцаж заана, тул Отгоо нүдээрээ холбож уншина. */
                    <span className="text-t3">#{ln.id} падан</span>
                  ) : ln.sources && ln.sources.length ? ln.sources.map((s, i) => (
                    /* ХАМААРАЛ нь даргын ажил: аль падангаас хэд буцав.
                       Тэр падангийн ТАРИФ нь мөнгө — зөвхөн мөнгөний хүнд. */
                    <span key={i} className="block whitespace-nowrap">
                      #{s.issue_line_id}{seesMoney && ` · ${fmt(s.rate)}₮`} → <b className="tabular-nums">{fmt(s.qty)}</b>ш
                      {s.pinned && <span className="text-t3"> (заасан)</span>}
                    </span>
                  )) : <span className="text-t3">—</span>}
                </td>
              )}
              <td className={`${td} text-right tabular-nums font-bold text-ink`}>
                {/* Хүлээгдэж буй ачилт үлдэгдлийг ХӨДӨЛГӨӨГҮЙ — давхардсан тоо
                    бичвэл «нэмэгдчихсэн юм болов уу» гэж уншигдана. */}
                {ln.counted ? fmt(ln.balance)
                  : <span className="text-t3 font-normal" title="Баталгаажаагүй тул үлдэгдэлд ороогүй">—</span>}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** `dim` — тоо нь БАРИМТ БИШ (тооцоолол, төсөөлөл). `sub` нь яагаад гэдгийг
 *  тооныхоо доор нэг үгээр хэлнэ («нэхэгдээгүй»). */
function Num({ label, val, danger, dim, sub }: {
  label: string; val: string; danger?: boolean; dim?: boolean; sub?: string;
}) {
  return (
    <div>
      <div className="text-[12px] text-t3 font-semibold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums ${
            danger ? "text-danger" : dim ? "text-t2" : "text-ink"}`}>{val}</div>
      {sub && <div className="text-[12px] text-t3 -mt-0.5">{sub}</div>}
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
function ReturnModal({ d, grades, seesMoney, onClose, onDone }: any) {
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
      if (r.ret > r.qty) { toast(`${r.material}: түрээсэнд байгаагаас их байна`, "err"); return; }
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
          const dmgPid = panelId(`${uid}-dmg`, i);
          return (
            <div key={i} className="py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <b className="text-[15.5px] text-ink block leading-tight">{r.material}</b>
                  <span className="text-[12.5px] text-t2">
                    <span className="pill-grey !py-0 mr-1.5">{r.grade}</span>
                    түрээсэнд <b className="tabular-nums">{fmt(r.qty)}</b>ш
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
                  <button className="btn-ghost !min-h-11 text-[13px]" {...disclosureProps(expanded, dmgPid)}
                          onClick={() => setOpen(expanded ? null : i)}>
                    <Chevron open={expanded} /> Гэмтэл/акт
                    {!expanded && flagged > 0 && <b className="text-warn"> · {fmt(flagged)}ш</b>}
                  </button>
                  <span className={`ml-auto text-[12.5px] tabular-nums ${
                        over ? "text-danger font-semibold" : "text-t2"}`}>
                    {over ? `түрээсэнд байгаагаас ${fmt(ret - r.qty)}ш их`
                          : `${fmt(r.qty - ret)}ш түрээсэнд үлдэнэ`}
                  </span>
                </div>
              )}

              {ret > 0 && expanded && (
                <div id={dmgPid} className="mt-2.5 rounded-[8px] p-3 flex gap-4 flex-wrap items-end"
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
        /* Даргад тооцоо нь ШИРХЭГЭЭР зогсоно: юу хэдийг буцаав, хэд нь
           засварт, хэд нь акт — тэр бол түүний бүртгэл. Тэдгээр ширхэг ямар
           дүн болж хувирахыг Отгоо гэрээний хуудсан дээрээ хардаг. */
        if (!seesMoney) return (
          <Receipt className="mt-4"
            rows={[
              ...(repQty > 0 ? [{ label: "Үүнээс засварт", value: `${fmt(repQty)} ш`, accent: "dim" as const }] : []),
              ...(woQty > 0 ? [{ label: "Үүнээс актлах", value: `${fmt(woQty)} ш`, accent: "dim" as const }] : []),
            ]}
            total={{ label: "Буцаах нийт", value: `${fmt(totRet)} ш` }} />
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
function AddModal({ d, seesMoney, onClose, onDone }: any) {
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
    /* Даргын олголтод тариф ЯВАХГҮЙ — сервер гэрээний мөрийн тарифыг өөрөө
       тамгална (`billing.default_rates`). Үнэ бол Отгоогийн шийдвэр. */
    const lines = rows.filter((r) => r.add > 0).map((r) => ({
      material_id: r.material_id, grade_id: r.grade_id, qty: r.add,
      ...(seesMoney ? { rate: r.rate } : {}) }));
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
        {seesMoney && (
          <span className="lbl !mb-0 ml-auto w-28 text-right">{rent ? "Тариф ₮/ш/хоног" : "Нэгж үнэ"}</span>
        )}
        <span className={`lbl !mb-0 w-24 text-right${seesMoney ? "" : " ml-auto"}`}>Нэмэх тоо</span>
      </div>
      {/* Багана дээрх гарчиг нь ХАРАХ хүнд л ажиллана — талбар бүрийг өөрийнх
          нь материалын нэрээр бүтнээр нэрлэнэ. */}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b border-sunken last:border-0">
          <div className="min-w-0">
            <b className="text-[13.5px] text-ink">{r.material}</b>
            <span className="block text-xs text-t3">{r.grade}</span>
          </div>
          {seesMoney && (
            <input type="number" min={0} className="inp !min-h-10 !py-2 w-28 ml-auto text-right" value={r.rate}
                   aria-label={`${r.material} (${r.grade}) — ${rent ? "тариф ₮/ш/хоног" : "нэгж үнэ"}`}
                   onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, rate: +e.target.value } : x))} />
          )}
          <input type="number" min={0} className={`inp !min-h-10 !py-2 w-24 text-right${seesMoney ? "" : " ml-auto"}`}
                 value={r.add}
                 aria-label={`${r.material} (${r.grade}) — нэмэх тоо`}
                 onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, add: +e.target.value } : x))} />
        </div>
      ))}
      <p className="text-[12px] text-t3 mt-2">
        {seesMoney
          ? "Олголт бүр өөрийн тарифаа хадгална — өмнөх олголтын тариф хэвээр үлдэнэ."
          : "Гэрээнд тохирсон тарифаар бүртгэгдэнэ — үнийг менежер тогтооно."}
      </p>
      {(() => {
        const addDay = rows.reduce((s, r) => s + (r.add > 0 ? r.add * r.rate : 0), 0);
        const addQty = rows.reduce((s, r) => s + (r.add > 0 ? r.add : 0), 0);
        if (!addQty) return null;
        if (!seesMoney) return (
          <Receipt className="mt-4" rows={[]}
            total={{ label: "Нэмж олгох (баталгаажсаны дараа)", value: `${fmt(addQty)} ш` }} />
        );
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
  /* Хуваарилалт ЗӨВХӨН НЭХЭГДСЭН алдангийг хааж чадна (`penalty_due`).
     Урьд нь энд `i.penalty` (нийт) бичигдсэн байсан: төлбөр бүртгэх агшинд
     сервер бүх амьд алдангийг өөрөө номжиж байсан тул тэр нь «зөв» байв.
     Нэхэлт ил болсон одоо тэр тоо ХУДАЛ болно — сервер нэхэгдээгүй
     алданги руу мөнгө оруулахгүй, баримт нь зөрнө (H2). */
  const list = (invoices || []).map((i: any) => ({
    id: i.id, no: i.no, outstanding: i.outstanding, due_date: i.due_date,
    cycle_start: i.cycle_start, cycle_end: i.cycle_end,
    penalty_due: i.penalty_due || 0 }));
  const preview = allocationPreview(amt, list);
  /* Нэхэгдээгүй тооцоолол — энэ төлбөр түүнийг ХӨНДӨХГҮЙ гэдгийг хадгалахаас
     ӨМНӨ хэлнэ. Урьд нь энд «энэ төлбөрийг бүртгэхэд алданги X₮ нэхэгдэнэ»
     гэсэн анхааруулга хэрэгтэй байсан; одоо чимээгүй номжих зүйл алга. */
  const uncharged = (invoices || []).reduce(
    (s: number, i: any) => s + (i.penalty_unbooked || 0), 0);
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
      {/* Хадгалахаас ӨМНӨ: энэ төлбөр алданги НЭХЭХГҮЙ гэдгийг ил хэлнэ.
          Урьд нь энд «энэ төлбөрийг бүртгэхэд алданги X₮ нэхэгдэнэ» гэсэн
          анхааруулга хэрэгтэй байсан — одоо чимээгүй номжих зүйл алга. */}
      {uncharged > 0.5 && (
        <p className="text-[12.5px] text-t3 mt-2.5">
          Алдангийн тооцоолол <b className="tabular-nums text-t2">≈{money(uncharged)}</b> — {UNCHARGED}.
          Энэ төлбөр түүнийг хөндөхгүй; нэхэх бол «Алданги нэхэх» товчоор нэхнэ.
        </p>
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
  const pen = penaltySplit(d.penalty, d.penalty_booked);
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
        {/* Суутгал ЗӨВХӨН үндсэн өрийг хаадаг — нэхэгдсэн алданги нь тусдаа
            үлдэнэ, тиймээс энд нэрлэгдэнэ. Нэхэгдээгүй тооцоолол нь энэ
            үйлдэлд огт хамаагүй тул мөрөнд ч, дүнд ч ОРОХГҮЙ (H2). */}
        {pen.booked > 0 && <> · нэхэгдсэн алданги{" "}
          <b className="text-danger tabular-nums">{money(pen.booked)}</b> (суутгалд ОРОХГҮЙ)</>}
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

/* ---------- Алданги НЭХЭХ ----------
   Отгоо эгч 20 жилийн Excel-дээ алданги ганц ч удаа тооцоогүй: хуудас бүр
   дээр «гэрээний 4.2-т зааснаар алданга тооцно» гэж зарладаг ч хэзээ ч
   нэхдэггүй — тэр бол утсаар ярихад хэрэглэдэг ХӨШҮҮРЭГ (R25 / H2).
   Систем нь урьд нь төлбөр бүртгэх агшинд ӨӨРӨӨ номжиж байсан. Одоо
   нэхэлт нь ЗӨВХӨН энэ цонхоор — нэхэмжлэл бүрийн тоог хараад л. */
function ChargePenaltyModal({ d, onClose, onDone }: any) {
  const toast = useToast();
  const [asOf, setAsOf] = useState(today());
  const uid = useId();
  const rows = penaltyChargeRows(d.invoices, d.penalty_percent, asOf);
  const total = penaltyChargeTotal(rows);
  const nameOf = (id: number, no: string) =>
    invoiceLabel((d.invoices || []).find((i: any) => i.id === id) ?? { no });

  return (
    <ConfirmModal
      title="Алданги нэхэх"
      intro={<>Гэрээ №{d.no} · <b className="text-ink">{d.client}</b> · алданги{" "}
             <b className="text-ink tabular-nums">{d.penalty_percent}%</b>/хоног.
             Нэхсэн алданги нь ӨР болж, төлбөрөөр хаагдана — энэ үйлдлийг буцаах боломжгүй.</>}
      rows={[
        ...rows.map((r) => {
          const n = nameOf(r.id, r.no);
          return { label: `${n.title} · ${r.days} хоног`, sub: n.sub,
                   value: money(r.amount), accent: "danger" as const };
        }),
        ...(rows.length === 0
          ? [{ label: `${asOf} өдрөөр нэхэх алданги алга`, value: money(0), accent: "dim" as const }]
          : []),
      ]}
      total={{ label: "Нийт нэхэгдэх алданги", value: money(total),
               accent: total > 0 ? "danger" : "dim" }}
      note="Аль хэдийн нэхсэн хоногууд дахин тоологдохгүй."
      confirmLabel="Алданги нэхэх" confirmDisabled={rows.length === 0} danger
      onClose={onClose}
      onConfirm={async () => {
        try {
          const r = await api(`/api/contracts/${d.id}/book-penalty`,
                              { method: "POST", body: JSON.stringify({ as_of: asOf }) });
          toast(`${money(r.total)} алданги нэхэгдлээ`);
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }}>
      {/* Огноо нь баримтын ДООР — тоонууд нь эндээс хамаарна гэдгийг
          дараалал нь өөрөө хэлнэ (өөрчлөхөд дээрх мөрүүд дахин бодогдоно). */}
      <label className="lbl" htmlFor={`${uid}-asof`}>Ямар өдрөөр нэхэх вэ</label>
      <input id={`${uid}-asof`} type="date" className="inp max-w-[200px]" value={asOf}
             onChange={(e) => setAsOf(e.target.value)} />
    </ConfirmModal>
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

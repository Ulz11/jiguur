import { Fragment, ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, money, fmt, user } from "../api";
import { Spinner, StatePill, TypePill, Prog, Modal, FormModal, SubmitButton, useToast,
         InlineEdit, Receipt, ConfirmModal, Chevron, DisclosureCell, DisclosureHead,
         FinanceDisclosure, FinanceBlock, FinanceRow } from "../ui";
import { panelId, disclosureProps } from "../lib/disclosure";
import { allocationPreview } from "../lib/alloc";
import { CYCLE_MODES, cycleModeHint, cycleModeLabel, endDateLabel } from "../lib/contract";
import { cycleLabel } from "../lib/cycle";
import { invoiceLabel } from "../lib/invoice";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { usePdf } from "../lib/docs";
import { rowClickProps } from "../lib/rowClick";
import { daysVarianceText, lotDaysHint, lotDaysMax, lotOptions, materialSections,
         overrideEffect, MaterialSection } from "../lib/lots";
import { penaltySplit, penaltyChargeRows, penaltyChargeTotal, UNCHARGED,
         chargeLabel, chargedTotal, laterLiveCharge } from "../lib/penalty";
import { clientHref, invoiceAnchorId, materialHref } from "../lib/links";
import { daysBetween, todayIso } from "../lib/schedule";
import { isVoided, movementStockRows, voidRowClass, voidTitle } from "../lib/void";
import { AKT_KINDS, AktKind, aktAmountText, aktCycle, aktCycleLabel, aktKind,
         aktLandingText, aktSigned, aktTotal } from "../lib/akt";
import { EffKey, RATE_RESTATE_WARN, effectiveDate, effectiveOptions,
         rateChangeScope, rateChangeText } from "../lib/rate";
import { ClosePreview, OutRow, Prefill, SalePrefill, StepKey, applyPrefill,
         applySalePrefill, closeSteps, outstandingQty, outstandingSale,
         outstandingWriteoff, returnPrefill, salePrefill, stepBlock,
         stepIndex } from "../lib/close";
import { mvName, mvTone, saleRowTotal, saleTotal } from "../lib/movement";
import { VoidButton, VoidPaymentModal } from "../components/VoidPayment";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
// Хөдөлгөөний нэр ба өнгө нь `lib/movement` дээр — MaterialDetail-тай ЯГ
// НЭГ толь (UI-ЗАРЧИМ §3: «хувирдаг үг» бол тархай мэдрэмжийн эх үүсвэр).
const MV_DOT: Record<string, string> = {
  brand: "border-brand", warn: "border-warn",
  danger: "border-danger", violet: "border-violet",
};

export default function ContractDetail() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [modal, setModal] = useState<"" | "return" | "sale" | "add" | "pay" | "extend"
                                        | "deposit" | "close" | "penalty">("");
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
  /* Тарифын цонх: аль материалын мөрийг дахин тохирч байна вэ (R3 / H6).
     InlineEdit байсныг СОЛИВ — «хэзээнээс» гэдэг асуултыг нэг мөрийн
     засвар зөөж чадахгүй. */
  const [rateRow, setRateRow] = useState<any>(null);
  const [voidRate, setVoidRate] = useState<any>(null);
  /* Цуцлах гэж буй алдангийн НЭХЭЛТ (R25 / H2) — хөшүүрэг суларна. */
  const [voidCharge, setVoidCharge] = useState<any>(null);
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
  /* Актын Σ (R12 / H4) — «нийт актнаас 15% хасч тооцлоо» гэдэг ТҮҮНИЙ
     дүрмийн суурь тоо. Хүчингүй мөр орохгүй. */
  const aktSum = aktTotal(d.akt_entries);
  const sections = materialSections(d.items || [], d.material_lines || []);
  const pendingMv = d.movements.filter((m: any) => m.status === "pending").length;
  const showHist = histOpen ?? pendingMv > 0;

  return (
    <div>
      <Link to="/contracts" className="btn-ghost mb-3 inline-flex">← Гэрээнүүд рүү буцах</Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink tracking-tight flex items-center gap-2.5 flex-wrap">
            {/* §4: дарагддаг юм 36px-ээс намхан байхгүй. Гарчгийн мөрөнд
                суусан ч энэ бол ХОЛБООС — 33px байсныг доод шатанд нь
                (`--target-sm`) хүргэнэ. `inline-flex items-center` байхгүй бол
                `min-h` нь inline элементэд огт үйлчлэхгүй. */}
            <Link to={clientHref(d.client_id)}
                  className="hover:underline inline-flex items-center min-h-[36px]">{d.client}</Link>
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
              {/* ХУДАЛДАА БОЛГОХ нь зөвхөн хаалтын үйл явдал БИШ — харилцагч
                  ажил дундаа ч худалдаж авдаг. Хөдөлгүүр нь ялгалгүй, тиймээс
                  хаалгыг нь энд ч нээв (H7). */}
              <button className="btn-secondary" onClick={() => setModal("sale")}>Худалдаа болгох</button>
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
              Цикл {cycleLabel(cyc.cycle_start, cyc.cycle_end)} · {cyc.days_done}/{cyc.days_total} хоног
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

      {/* АЛДАНГИЙН НЭХЭЛТ (R25 / H2 · H1) — дээрх «Нэхэгдсэн алданги» тооны
          АРД зогсох ШИЙДВЭРҮҮД. Урьд нь нэхэлт бүр явдал болж бичигдээд
          дэлгэц дээр ХЭЗЭЭ Ч гардаггүй байв: тэр хэзээ, хэдийг нэхснээ
          хаанаас ч уншиж чадахгүй. Одоо мөр мөрөөрөө гарч, ЦУЦЛАГДАЖ БАС
          чадна — хөшүүрэг гэдэг нь татагдаад СУЛАРДАГ гэсэн үг. */}
      {seesMoney && (d.penalty_charges || []).length > 0 && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
            <h2 className="font-bold text-ink text-[15.5px]">Алдангийн нэхэлт</h2>
            <span className="text-[12.5px] text-t2">
              Нийт нэхсэн{" "}
              <b className="text-ink tabular-nums">{money(chargedTotal(d.penalty_charges))}</b>
              {d.penalty_charges.some(isVoided) && (
                <span className="text-t3"> · хүчингүй нь орсонгүй</span>
              )}
            </span>
          </div>
          <ul className="space-y-1.5">
            {d.penalty_charges.map((ch: any) => (
              <li key={ch.id} className="text-[13px] flex items-center gap-2 flex-wrap">
                <span className={`${voidRowClass(ch)} text-t2`} title={voidTitle(ch)}>
                  <b className="text-ink tabular-nums">{ch.as_of}</b> өдрөөр{" "}
                  <b className="text-danger tabular-nums">{money(ch.amount)}</b>
                  {ch.user_name && <span className="text-t3"> · {ch.user_name}</span>}
                </span>
                {isVoided(ch) ? (
                  <span className="pill-red" title={voidTitle(ch)}>ХҮЧИНГҮЙ</span>
                ) : canVoid && (
                  <VoidButton label={chargeLabel(ch)}
                              onClick={() => setVoidCharge(ch)} />
                )}
                {isVoided(ch) && ch.void_reason && (
                  <span className="basis-full text-[12px] text-danger">
                    Шалтгаан: {ch.void_reason}
                    {ch.voided_by && <span className="text-t3"> · {ch.voided_by}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
                          {/* ТАРИФ нь нэг мөрийн засвар БИШ — «хэзээнээс» гэсэн
                              асуулттай ирдэг шийдвэр (R3 / H6). Тиймээс InlineEdit
                              биш, цонх нээгддэг: гурван хилийн аль нэгийг сонгоно.
                              Худалдаанд цикл байхгүй тул хуучин inline зам хэвээр —
                              гэхдээ одоо ХААЛГАТАЙ (`gatedPatch`). */}
                          {it.orphan ? "—" : u?.role !== "manager" ? (
                            fmt(d.type === "rent" ? it.daily_rate : it.unit_price)
                          ) : d.type === "rent" ? (
                            <button className="inline-val" onClick={() => setRateRow(it)}
                                    title="Дарж тарифыг дахин тохирно">
                              <span className="sr-only">{it.material} ({it.grade}) · тариф: </span>
                              <span>{fmt(it.daily_rate)}</span>
                              <span className="pen" aria-hidden="true">✎</span>
                              <span className="sr-only"> · дахин тохирох</span>
                            </button>
                          ) : (
                            <InlineEdit type="number" right width="w-24"
                              label={`${it.material} (${it.grade}) · нэгж үнэ`}
                              value={it.unit_price} display={fmt(it.unit_price)}
                              confirmText="Бүх түүхэнд шинэ үнээр?"
                              onSave={(v) => gatedPatch(`/api/contracts/${d.id}/items`,
                                { material_id: it.material_id, grade_id: it.grade_id,
                                  old_rate: it.orig_rate ?? it.unit_price,
                                  unit_price: parseMoney(v) },
                                "Нэгж үнэ шинэчлэгдлээ")} />
                          )}
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
            {/* ТАРИФЫН ТҮҮХ (R3 / H6) — Мөнхболдын 300 → 350 → 450 нь ЯВДАЛ
                болж мөр мөрөөрөө үлдэнэ: хэзээнээс, юунаас юу болов, ямар
                тохиролцооны дор. Хүчингүй болсон нь ч ХАРАГДАНА (H1). */}
            {seesMoney && (d.rate_changes || []).length > 0 && (
              <div className="px-4 pb-4 pt-1 border-t border-line mt-1">
                <h3 className="text-[12px] text-t3 font-semibold uppercase tracking-wider mb-2">
                  Тарифын өөрчлөлт
                </h3>
                <ul className="space-y-1.5">
                  {d.rate_changes.map((rc: any) => (
                    <li key={rc.id} className="text-[13px] flex items-center gap-2 flex-wrap">
                      <span className={`${voidRowClass(rc)} text-t2`} title={voidTitle(rc)}>
                        <b className="text-ink">{rc.material}</b>
                        {rc.grade && <span className="pill-grey !py-0 mx-1.5">{rc.grade}</span>}
                        <span className="tabular-nums">{rateChangeText(rc)}</span>
                        {rc.note && <span className="text-t3"> · {rc.note}</span>}
                      </span>
                      {isVoided(rc) ? (
                        <span className="pill-red" title={voidTitle(rc)}>ХҮЧИНГҮЙ</span>
                      ) : u?.role === "manager" && (
                        <VoidButton label={`${rc.material} · ${rateChangeText(rc)}`}
                                    onClick={() => setVoidRate(rc)} />
                      )}
                      {isVoided(rc) && rc.void_reason && (
                        <span className="basis-full text-[12px] text-danger">
                          Шалтгаан: {rc.void_reason}
                          {rc.voided_by && <span className="text-t3"> · {rc.voided_by}</span>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                {/* Σ — Отгоогийн ӨӨРИЙНХ нь дүрмийн СУУРЬ тоо: «нийт актнаас
                    15% хасч тооцлоо». Тэр «нийт акт» гэдэг тоо энэ систем дээр
                    хаана ч байгаагүй тул мөр бүрийг толгойдоо нэмэхээс өөр арга
                    үлддэггүй байв. Нэмэгдэл ба хөнгөлөлт НЭГ тэмдэгт дүнд
                    эвхэгдэнэ; ХҮЧИНГҮЙ мөр орохгүй (`aktTotal`). */}
                <tfoot>
                  <tr>
                    <td className="td font-bold text-ink">Нийт акт</td>
                    <td className="td text-right tabular-nums whitespace-nowrap">
                      <b className={aktSum < 0 ? "text-money" : "text-ink"}>
                        {aktAmountText(aktSum)}
                      </b>
                    </td>
                    <td className="td text-[12.5px] text-t2" colSpan={3}>
                      {d.akt_entries.some(isVoided)
                        ? "хүчинтэй бичилтүүдийн нийлбэр (хүчингүй нь орсонгүй)"
                        : "нэмэгдэл ба хөнгөлөлтийн нийлбэр"}
                    </td>
                  </tr>
                </tfoot>
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
                      className="flex items-center gap-2 w-full text-left font-bold text-ink min-h-[36px]"
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
                    MV_DOT[mvTone(mv.type)]}`} />
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
                      {/* ХУДАЛДАА БОЛГОВ (H7). Даргад мөрийн ТОО нь дээр аль
                          хэдийн харагдсан тул энд түүнд нэмэх юм алга — ДҮН нь
                          зөвхөн Отгоо, санхүүчид (мөнгөний хана). */}
                      {seesMoney && mv.type === "SALE" && (
                        <span className="block text-violet">
                          Худалдаа: {money(mv.lines.reduce(
                            (s: number, l: any) => s + (l.sale_fee || 0), 0))}
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
                              {seesMoney && (l.sale_fee || 0) > 0 && (
                                <span className="text-violet">
                                  {" "}· худалдаа {money(l.sale_fee)}
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

      {/* САНХҮҮ — ЗӨВХӨН үйлдвэрийн даргад, ажлынх нь агуулгын ХОЙНО.
          Отгоо, санхүүчид эдгээр тоо дээрээ, өөрийн хэсэгтээ хэвээр байна;
          дарга нь асуулт ирэхэд ЭНДЭЭС уншина (`ui.tsx` FinanceDisclosure). */}
      {!seesMoney && <ContractFinance d={d} cyc={cyc} pen={pen} aktSum={aktSum} />}

      {/* Буцаалт, нэмэлт олголт нь ДАРГЫН ажил (`canManage`) — цонх нь түүнд
          нээгддэг тул мөнгөний зураас цонх дотор ч үргэлжилнэ. */}
      {modal === "return" && <ReturnModal d={d} grades={grades} seesMoney={seesMoney}
                                          onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}

      {modal === "sale" && <SaleModal d={d} seesMoney={seesMoney} prefill={null}
                                      onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}

      {modal === "add" && <AddModal d={d} seesMoney={seesMoney}
                                    onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "pay" && <PayModal d={d} invoices={d.invoices} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "extend" && <ExtendModal d={d} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "deposit" && <DepositModal d={d} onClose={() => setModal("")} onDone={() => { setModal(""); load(); }} />}
      {modal === "penalty" && <ChargePenaltyModal d={d} onClose={() => setModal("")}
                                                  onDone={() => { setModal(""); load(); }} />}
      {/* ХААЛТЫН ЁСЛОЛ (H7) — нэг товчийн баталгаажуулалт байсныг СОЛИВ:
          гадаа үлдсэнээ шийд → эцсийн тасархай циклээ нэх → барьцаагаа
          цэвэрлэ → хаа. Дарааллыг ДАТА нь тодорхойлно (`closeSteps`). */}
      {modal === "close" && <CloseWizard d={d} grades={grades}
                                         onClose={() => setModal("")}
                                         onDone={() => { setModal(""); load(); }}
                                         onReload={load} pdf={pdf} />}
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
      {rateRow && <RateModal d={d} row={rateRow} onClose={() => setRateRow(null)}
                             onDone={() => { setRateRow(null); load(); }}
                             onRebuild={(p) => { setRateRow(null); setPending(p); }} />}
      {voidRate && <VoidRateModal d={d} rc={voidRate} onClose={() => setVoidRate(null)}
                                  onDone={() => { setVoidRate(null); load(); }}
                                  onRebuild={(p) => { setVoidRate(null); setPending(p); }} />}
      {voidCharge && <VoidChargeModal d={d} ch={voidCharge}
                                      onClose={() => setVoidCharge(null)}
                                      onDone={() => { setVoidCharge(null); load(); }}
                                      onRebuild={(p) => { setVoidCharge(null); setPending(p); }} />}
    </div>
  );
}

/* ---------- САНХҮҮ — гэрээний мөнгө, даргын дэлгэц дээр ----------
 *
 * ЭЗЭНИЙ ШИЙДВЭР: дарга гэрээний мөнгөний талаар асуухад ХАРИУЛЖ чаддаг байх
 * ёстой. Урьд нь сервер өөрөө талбаруудыг хасдаг байсан тул тэр хариулах
 * ЮМГҮЙ байв. Одоо дата бүтэн ирнэ — эмх цэгц нь ЭНД: ажлынх нь хүснэгтүүд
 * (материал, хөдөлгөөн) мөнгөгүй хэвээр, мөнгө нь бүхэлдээ ЭНЭ хумигдсан
 * задаргаа дотор.
 *
 * ХУРААНГУЙ ТОО = «Нийт үлдэгдэл». Гэрээний талаар «мөнгө нь юу болов»
 * гэсэн асуултын ГАНЦ хариу нь тэр (H9 — «НЭГ тоо»); бусад нь задаргаа.
 * Бүтэн төгрөгөөр — ганц баримтын дүн дугуйлагдахгүй (UI-ЗАРЧИМ §4).
 *
 * УНШИХ хэсэг: цуцлах, засах, PDF товч энд БАЙХГҮЙ — тэдгээр нь мөнгө
 * хөдөлгөх ЭРХ (сервер ч 403 буцаана), эмх цэгцийн асуудал биш.
 */
function ContractFinance({ d, cyc, pen, aktSum }: {
  d: any; cyc: any; pen: { booked: number; unbooked: number; showUnbooked: boolean };
  aktSum: number;
}) {
  const rent = d.type === "rent";
  const rates = (d.items || []).filter((it: any) => it.qty > 0);
  return (
    <FinanceDisclosure name={`contract-${d.id}`}
      summary={money(d.balance)} summaryLabel="Нийт үлдэгдэл"
      hint="Тариф, хуримтлал, нэхэмжлэл, төлбөр, барьцаа — дарж дэлгэнэ.">
      <FinanceBlock title="Хураангуй">
        {rent && <FinanceRow label="Өдрийн дүн" value={money(d.day_amount)} />}
        {rent && cyc && (
          <FinanceRow label="Энэ циклд хуримтлагдсан" value={money(cyc.accrued)}
                      sub={cycleLabel(cyc.cycle_start, cyc.cycle_end)} />
        )}
        <FinanceRow label="Нийт үлдэгдэл" value={money(d.balance)}
                    tone={d.state === "overdue" ? "danger" : undefined} />
        {pen.booked > 0 && (
          <FinanceRow label="Нэхэгдсэн алданги" value={money(pen.booked)} tone="danger" />
        )}
        {/* Нэхэгдээгүй нь ӨР БИШ — ≈ угтвар, бүдэг, дэргэдээ ҮГТЭЙ (H2) */}
        {pen.showUnbooked && (
          <FinanceRow label="Алдангийн тооцоолол" value={"≈" + money(pen.unbooked)}
                      sub={UNCHARGED} tone="dim" />
        )}
        {d.penalty_percent > 0 && (
          <FinanceRow label="Алдангийн хувь" value={`${fmt(d.penalty_percent)}%/хоног`} tone="dim" />
        )}
        {d.vat_percent > 0 && (
          <FinanceRow label="НӨАТ" value={`${fmt(d.vat_percent)}%`} tone="dim" />
        )}
        {d.deposit > 0 && (
          <FinanceRow label="Барьцаа" value={money(d.deposit)}
                      sub={d.deposit_status === "settled"
                        ? `${d.deposit_settled_date}-нд тооцоо хийгдсэн` : "тооцоо хийгдээгүй"} />
        )}
      </FinanceBlock>

      {rates.length > 0 && (
        <FinanceBlock title={rent ? "Тариф" : "Нэгж үнэ"}>
          <table className="w-full">
            <thead><tr>
              <th className="th">Материал</th><th className="th">Зэрэглэл</th>
              <th className="th text-right">Тоо</th>
              <th className="th text-right">{rent ? "Тариф ₮/ш/хоног" : "Нэгж үнэ"}</th>
              <th className="th text-right">{rent ? "Өдрийн дүн" : "Нийт"}</th>
            </tr></thead>
            <tbody>
              {rates.map((it: any, i: number) => (
                <tr key={i}>
                  <td className="td font-bold text-ink">{it.material}</td>
                  <td className="td"><span className="pill-blue">{it.grade}</span></td>
                  <td className="td text-right tabular-nums">{fmt(it.qty)}</td>
                  <td className="td text-right tabular-nums">
                    {fmt(rent ? it.daily_rate : it.unit_price)}</td>
                  <td className="td text-right tabular-nums font-bold text-ink">
                    {money(rent ? it.day_amount : it.qty * it.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FinanceBlock>
      )}

      <FinanceBlock title="Нэхэмжлэлүүд">
        {d.invoices.length === 0 ? (
          <p className="text-t3 text-[13px]">Нэхэмжлэл үүсээгүй байна.</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className="th">{rent ? "Үе" : "Нэхэмжлэл"}</th>
              <th className="th text-right">Дүн</th><th className="th text-right">Төлсөн</th>
              <th className="th text-right">Үлдэгдэл</th><th className="th">Төлөв</th>
            </tr></thead>
            <tbody>
              {d.invoices.map((inv: any) => {
                const lb = invoiceLabel(inv);
                return (
                  <tr key={inv.id}>
                    <td className="td">
                      <span className="font-semibold text-ink whitespace-nowrap">{lb.title}</span>
                      {lb.sub && <span className="block text-[12px] text-t3">{lb.sub}</span>}
                    </td>
                    <td className="td text-right tabular-nums">{money(inv.total)}</td>
                    <td className="td text-right tabular-nums">{money(inv.paid)}</td>
                    <td className={`td text-right tabular-nums font-bold ${
                          inv.outstanding > 0 && inv.status === "overdue" ? "text-danger"
                          : inv.outstanding > 0 ? "text-ink" : "text-t3"}`}>
                      {inv.outstanding > 0 ? money(inv.outstanding) : "—"}
                    </td>
                    <td className="td"><StatePill state={inv.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </FinanceBlock>

      <FinanceBlock title="Төлбөрүүд">
        {d.payments.length === 0 ? (
          <p className="text-t3 text-[13px]">Төлбөр бүртгэгдээгүй.</p>
        ) : d.payments.map((p: any) => (
          /* Цуцлагдсан бичилт УСТДАГГҮЙ — зурагдаж, «ХҮЧИНГҮЙ» ҮГТЭЙГЭЭ
             үлдэнэ (`lib/void.ts`), Отгоогийн дэлгэцтэй ижил дүрэм. */
          <div key={p.id} className="flex items-center gap-3 py-2 border-b border-sunken last:border-0 flex-wrap">
            <div className={voidRowClass(p)} title={voidTitle(p)}>
              <b className="text-[13.5px] tabular-nums text-ink">{money(p.amount)}</b>
              <span className="block text-[12px] text-t3">{p.date}</span>
            </div>
            {isVoided(p) && <span className="pill-red">ХҮЧИНГҮЙ</span>}
            <span className={`ml-auto ${voidRowClass(p)} ${
              p.method === "BARTER" ? "pill-violet" : p.method === "CASH" ? "pill-green" : "pill-blue"}`}>
              {p.method === "BARTER" ? `Бартер · ${p.barter_desc}` : p.method === "CASH" ? "Бэлэн" : "Данс"}
            </span>
          </div>
        ))}
      </FinanceBlock>

      {(d.akt_entries || []).length > 0 && (
        <FinanceBlock title="Акт бичилтүүд">
          {d.akt_entries.map((a: any) => (
            <FinanceRow key={a.id} label={`${a.date} · ${a.note}`}
                        sub={isVoided(a) ? "ХҮЧИНГҮЙ" : undefined}
                        value={aktAmountText(a.amount)}
                        tone={isVoided(a) ? "dim" : a.amount < 0 ? "money" : undefined} />
          ))}
          <FinanceRow label="Нийт акт" value={aktAmountText(aktSum)}
                      tone={aktSum < 0 ? "money" : undefined} />
        </FinanceBlock>
      )}

      {(d.rate_changes || []).length > 0 && (
        <FinanceBlock title="Тарифын өөрчлөлт">
          {d.rate_changes.map((rc: any) => (
            <FinanceRow key={rc.id}
                        label={`${rc.material}${rc.grade ? ` (${rc.grade})` : ""}`}
                        sub={isVoided(rc) ? "ХҮЧИНГҮЙ" : rc.note || undefined}
                        value={rateChangeText(rc)} tone={isVoided(rc) ? "dim" : undefined} />
          ))}
        </FinanceBlock>
      )}

      {(d.penalty_charges || []).length > 0 && (
        <FinanceBlock title="Алдангийн нэхэлт">
          {d.penalty_charges.map((ch: any) => (
            <FinanceRow key={ch.id} label={`${ch.as_of} өдрөөр`}
                        sub={isVoided(ch) ? "ХҮЧИНГҮЙ" : ch.user_name || undefined}
                        value={money(ch.amount)} tone={isVoided(ch) ? "dim" : "danger"} />
          ))}
          <FinanceRow label="Нийт нэхсэн" value={money(chargedTotal(d.penalty_charges))} />
        </FinanceBlock>
      )}
    </FinanceDisclosure>
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
          label: cycleLabel(x.cycle_start, x.cycle_end),
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

/* ---------- ТАРИФЫН ДАХИН ТОХИРОЛТ (R3 / H6) ----------
   Отгоо эгчийн Excel-д тариф циклүүдийн хооронд дахин тохирогддог (Мөнхболд
   300 → 350 → 450). Түүний семантик нэг мөр: ШИНЭ ТАРИФ ДАРААГИЙН ЦИКЛЭЭС,
   гарын үсэг зурсан өнгөрсөн нь ХЭВЭЭР.

   Урьд нь энэ нь нэг мөрийн InlineEdit байв: тоог дарж бичихэд падангийн
   тариф ЧИМЭЭГҮЙ ухарч, нэхэмжлэгдсэн циклүүд хуучин дүнгээ хэдэн сар авч
   яваад огт хамаагүй засварын үед гэнэт үсэрдэг байсан. Нэг нүд «хэзээнээс»
   гэсэн асуултыг зөөж чадахгүй — тиймээс ЦОНХ. Огноог UI таамаглахгүй:
   гурван хил СЕРВЕРЭЭС ирнэ (`cycle_bounds`). */
function RateModal({ d, row, onClose, onDone, onRebuild }: {
  d: any; row: any; onClose: () => void; onDone: () => void;
  onRebuild: (p: Pending) => void;
}) {
  const toast = useToast();
  const uid = useId();
  const opts = effectiveOptions(d.cycle_bounds);
  const f0 = { rate: String(Math.round(row.daily_rate || 0)),
               when: (opts[0]?.value || "next") as EffKey, note: "" };
  const [f, setF] = useState(f0);
  const [busy, setBusy] = useState(false);
  const rate = parseMoney(f.rate);
  const eff = effectiveDate(d.cycle_bounds, f.when);
  const chosen = opts.find((o) => o.value === f.when);
  const same = Math.abs(rate - (row.daily_rate || 0)) < 0.005;
  const scope = rateChangeScope(row);

  async function submit() {
    const body: any = { material_id: row.material_id, grade_id: row.grade_id,
                        new_rate: rate, effective_from: eff, note: f.note.trim() };
    if (scope !== undefined) body.old_rate = scope;
    const path = `/api/contracts/${d.id}/rate-change`;
    const okMsg = `Тариф ${fmt(rate)}₮ болов — ${eff}-ээс`;
    setBusy(true);
    try {
      const r = await api(path, { method: "POST", body: JSON.stringify(body) });
      if (r?.rebuild_required) {
        onRebuild({ path, body, method: "POST", okMsg,
                    diffs: r.diffs || [], warnings: r.warnings || [] });
        return;
      }
      toast(okMsg);
      onDone();
    } catch (e: any) { toast(e.message, "err"); setBusy(false); }
  }

  return (
    <FormModal title="Тариф дахин тохирох" onClose={onClose} dirty={formDirty(f0, f)}>
      <p className="text-[13.5px] text-t2 mb-4">
        <b className="text-ink">{row.material}</b>
        <span className="pill-grey !py-0 mx-1.5">{row.grade}</span>
        · одоогийн тариф <b className="text-ink tabular-nums">{fmt(row.daily_rate)}₮</b>/ш/хоног
        {scope !== undefined && scope !== row.daily_rate && (
          <span className="text-t3"> · падангийн төрөлх {fmt(scope)}₮</span>
        )}
      </p>

      <label className="lbl" htmlFor={`${uid}-rate`}>Шинэ тариф ₮/ш/хоног</label>
      <input id={`${uid}-rate`} className="inp max-w-[200px] text-right font-bold" autoFocus
             inputMode="numeric" value={f.rate}
             onChange={(e) => setF({ ...f, rate: e.target.value })} />

      {/* «Хэзээнээс» нь ТАРИФААС дутуугүй чухал — тиймээс дүнгийн ЯГ доор,
          нуугдсан сонголт биш ил радио. Огноо нь шошгондоо гарна. */}
      <fieldset className="mt-4">
        <legend className="lbl">Хэзээнээс</legend>
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o.value} className="flex items-start gap-2.5 cursor-pointer">
              <input type="radio" name={`${uid}-when`} className="mt-1" value={o.value}
                     checked={f.when === o.value}
                     onChange={() => setF({ ...f, when: o.value })} />
              <span className="text-[13.5px] text-ink">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {chosen?.restates && (
        <p className="text-[12.5px] text-warn mt-2.5">⚠ {RATE_RESTATE_WARN}</p>
      )}

      <div className="mt-4">
        <label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note}
               placeholder="ж: утсаар тохиров"
               onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>

      <Receipt className="mt-4"
        rows={[
          { label: "Одоогийн тариф", value: `${fmt(row.daily_rate)}₮` },
          { label: "Шинэ тариф", value: `${fmt(rate)}₮`,
            accent: rate > row.daily_rate ? "money" : rate < row.daily_rate ? "danger" : "dim" },
          { label: "Гадаа байгаа тоо", value: `${fmt(row.qty)} ш`, accent: "dim" },
        ]}
        total={{ label: `${eff}-ээс өдрийн дүн`, value: money(rate * (row.qty || 0)) }} />

      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={busy || same || rate < 0 || !eff}
                title={same ? "Тариф өөрчлөгдөөгүй байна" : undefined}
                onClick={submit}>{busy ? "…" : "Тариф тохирох"}</button>
      </div>
    </FormModal>
  );
}

function VoidRateModal({ d, rc, onClose, onDone, onRebuild }: {
  d: any; rc: any; onClose: () => void; onDone: () => void;
  onRebuild: (p: Pending) => void;
}) {
  const [reason, setReason] = useState("");
  const toast = useToast();
  const rid = useId();
  const path = `/api/rate-changes/${rc.id}/void`;

  return (
    <ConfirmModal
      title="Тарифын өөрчлөлт хүчингүй болгох"
      intro={<>
        <b className="text-ink">{rc.material} · {rateChangeText(rc)}</b> — энэ мөр
        УСТАХГҮЙ: «ХҮЧИНГҮЙ» тэмдэгтэй, шалтгаантайгаа үлдэнэ. Тариф нь падангийн
        төрөлх утгадаа эргэж очно. Энэ үйлдлийг буцаах боломжгүй.
      </>}
      rows={[{ label: `${rc.effective_from}-ээс хойших циклүүд`,
               sub: "тариф буцаж хуучин утгаараа бодогдоно",
               value: `${fmt(rc.new_rate)}₮ → ${rc.old_rate == null ? "төрөлх" : fmt(rc.old_rate) + "₮"}`,
               accent: "danger" as const }]}
      note="Нэхэмжлэгдсэн циклд хамаарвал дараагийн алхамд зөрүүг харуулна."
      confirmLabel="Хүчингүй болгох" confirmDisabled={!reason.trim()} danger
      onClose={onClose}
      onConfirm={async () => {
        const body = { reason: reason.trim() };
        try {
          const r = await api(path, { method: "POST", body: JSON.stringify(body) });
          if (r?.rebuild_required) {
            onRebuild({ path, body, method: "POST", okMsg: "Тарифын өөрчлөлт хүчингүй болов",
                        diffs: r.diffs || [], warnings: r.warnings || [] });
            return;
          }
          toast("Тарифын өөрчлөлт хүчингүй болов");
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }}>
      <label className="block text-[12.5px] font-semibold text-t2 mb-1.5" htmlFor={rid}>
        Цуцлах шалтгаан <span className="text-danger">*</span>
      </label>
      <input id={rid} className="inp w-full" value={reason} autoFocus
             placeholder="ж: андуурч бичсэн"
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
      {/* ГАР ХОНОГ (H5): хоёр тал хавсралт дээр гарын үсэг зурсан тоо. Хоосон
          үлдээвэл машины тоо. Тэр 12 гэж тоолсныг систем 11 гэж хэвлэвэл
          гарын үсэгтэй цаас зөрчигдөнө — тиймээс энэ нүд ЗААВАЛ байх ёстой. */}
      <span className={wrap}>
        <span aria-hidden="true">Хоног:</span>
        <InlineEdit width="w-20" label={`${name} — гараар тохирсон хоног (хоосон = авто)`}
          value={l.billed_days_override ?? ""}
          display={l.billed_days_override != null ? `${l.billed_days_override} (гараар)` : "авто"}
          confirmText="Хоног солих уу?"
          onSave={(v) => onEdit(path,
            { billed_days_override: v.trim() === "" ? null : Math.round(parseMoney(v)) },
            "Хоног шинэчлэгдэж, дүн дахин бодогдлоо")} />
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
                {/* Худалдаа болгосон мөрийн ДҮН — тоо нь баруун талын
                    баганад аль хэдийн (−40ш) зогссон тул давхардуулахгүй. */}
                {seesMoney && (ln.sale_fee ?? 0) > 0 && (
                  <span className="block text-violet">худалдаа · {money(ln.sale_fee ?? 0)}</span>
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
                      {/* ХОНОГ нь мөнгө биш, БАРИМТ: гарын үсэгтэй цаасан дээр
                          зогсох тоо энэ. Гараар тохирсон бол машины тоог
                          хажууд нь үлдээнэ — зөрүү нуугдвал Отгоо хоёр тоо
                          хоёр өөр газраас гарч ирлээ гэж уншина (H5). */}
                      {s.days !== undefined && (
                        <span className={`block ${s.override ? "text-warn" : "text-t3"}`}>
                          {daysVarianceText(s)}
                        </span>
                      )}
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

/* ---------- Буцаалт ----------
   `prefill` — хаалтын wizard-аас ирэх урьдчилсан утга (H7): гадаа үлдсэн
   мөрөн дээрх «Буцаалт бүртгэх» / «Дутагдуулсан» хоёр гарц ЯГ ЭНЭ цонхыг
   нээнэ, зөвхөн тоо нь бөглөгдсөн байна. Тусдаа «дутагдуулсан» цонх
   ХИЙХГҮЙ: тэр бол буцаалтын мөрийн АКТЛАХ багана, өөр үйлдэл биш. */
function ReturnModal({ d, grades, seesMoney, prefill, onClose, onDone }: any) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<any[]>(
    applyPrefill(d.items.filter((i: any) => i.qty > 0).map((i: any) => ({
      ...i, ret: 0, return_grade_id: i.grade_id, repair: 0, writeoff: 0,
      /* Аль падангаас хасах вэ («0» = авто, FIFO) ба ТҮҮНИЙ тоолсон хоног
         (хоосон = машины тоо) — хоёулаа бүртгэх агшинд шийдэгдэнэ (H5/R8). */
      pin: "0", days: "",
    })), prefill));
  /* Задарсан «Гэмтэл/акт» мөр. Дутагдуулсан гэж ирсэн бол тэр мөр НЭЭЛТТЭЙ
     төрнө — актлах тоо нуугдсан хэвээр «Бүртгэх» дарагдвал НБҮнээр нэхэгдэх
     мөнгө харагдалгүй өнгөрнө (R13). */
  const [open, setOpen] = useState<number | null>(
    prefill?.writeoff ? rows.findIndex((r: any) => r.writeoff > 0) : null);
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const setRow = (i: number, patch: any) =>
    setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  /* Буцаалт АЛЬ циклд бууж байна вэ — хоногийн сануулга ба дээд хязгаар
     хоёулаа тэр цонхноос гарна (серверийн `billing.cycle_of`-ийн толь). */
  const win = aktCycle(d, date);
  const cycleLen = win ? daysBetween(win.start, win.end) : 0;
  const groupOf = (r: any) => (d.material_lines || []).find(
    (g: any) => g.material_id === r.material_id && g.grade_id === r.grade_id);
  /* Хоногийн ДЭЭД ХЯЗГААР нь ЦИКЛИЙН УРТ БИШ, ПАДАНГИЙН цонх — сервер яг
     тэгж татгалздаг (`billing.override_cap`). Маягт нь өөр тоог зөвшөөрвөл
     Отгоо бичээд илгээж байж л «болохгүй» гэж сонсоно. */
  const rowMax = (r: any) => lotDaysMax(groupOf(r), date, win?.start, win?.end,
                                        Number(r.pin) || undefined) ?? (cycleLen || null);
  const rowHint = (r: any) => lotDaysHint(groupOf(r), date, win?.start,
                                          Number(r.pin) || undefined);
  const rowDays = (r: any) =>
    r.days.trim() === "" ? null : Math.round(parseMoney(r.days));

  async function submit() {
    const lines = rows.filter((r) => r.ret > 0).map((r) => ({
      material_id: r.material_id, grade_id: r.grade_id, qty: r.ret,
      return_grade_id: r.return_grade_id, repair_qty: r.repair, writeoff_qty: r.writeoff,
      issue_line_id: Number(r.pin) || undefined,
      billed_days_override: r.days.trim() === "" ? undefined : Math.round(parseMoney(r.days)),
    }));
    if (!lines.length) { toast("Буцаах тоо оруулна уу", "err"); return; }
    for (const r of rows.filter((r) => r.ret > 0)) {
      if (r.ret > r.qty) { toast(`${r.material}: түрээсэнд байгаагаас их байна`, "err"); return; }
      if (r.repair + r.writeoff > r.ret) { toast(`${r.material}: засвар + акт нь буцаалтаас их байна`, "err"); return; }
      const n = rowDays(r);
      if (n != null) {
        if (n < 0) { toast(`${r.material}: хоног сөрөг байж болохгүй`, "err"); return; }
        const cap = rowMax(r);
        if (cap != null && n > cap) {
          toast(`${r.material}: гар хоног ${cap} хоногоос их байж болохгүй`, "err");
          return;
        }
      }
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
  const dirty = date !== today() || rows.some(
    (r) => r.ret > 0 || r.repair > 0 || r.writeoff > 0 || r.days !== "" || r.pin !== "0");

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
          const grp = groupOf(r);
          /* Падан-сонгогч нь ХОЁР задгай падантай материал дээр л гарна:
             ганц падантай мөрөнд «аль падангаас» гэсэн асуулт нь хариултгүй
             чимээ (сонголт бүр нь шийдвэр гуйдаг). */
          const pins = lotOptions(grp, date);
          const hint = rowHint(r);
          const maxDays = rowMax(r);
          const typed = rowDays(r);
          const dayOver = typed != null && maxDays != null && typed > maxDays;
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

              {/* ХОНОГ ба ПАДАН — хоёулаа МӨНГӨНИЙ шийдвэр, тиймээс хоёулаа
                  бүртгэх агшинд гарна. Хоног нь хоосон бол машины тоо: тэр
                  тоог сануулга болгож ХАРУУЛЖ байж л дарж болно (H5). */}
              {ret > 0 && (
                <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
                  <label className="text-[12.5px] text-t2" htmlFor={`${uid}-days-${i}`}>
                    Хоног (гараар)
                  </label>
                  <input id={`${uid}-days-${i}`} type="number" inputMode="numeric" min={0}
                         max={maxDays ?? undefined}
                         placeholder={hint != null ? String(hint) : "авто"}
                         className={`inp !w-20 !min-h-11 !py-2 text-center font-bold${
                           dayOver ? " !border-danger" : ""}`}
                         value={r.days} onChange={(e) => setRow(i, { days: e.target.value })} />
                  <span className="text-[12.5px] text-t3">
                    {hint != null ? `системээр ${hint} хоног` : "хоосон = авто"}
                  </span>
                  {pins.length > 2 && (
                    <>
                      <label className="text-[12.5px] text-t2 ml-1" htmlFor={`${uid}-pin-${i}`}>
                        Аль падангаас
                      </label>
                      <select id={`${uid}-pin-${i}`} className="inp !w-64 !min-h-11 !py-2"
                              value={r.pin} onChange={(e) => setRow(i, { pin: e.target.value })}>
                        {pins.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
                      </select>
                    </>
                  )}
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

              {ret > 0 && dayOver && (
                <p className="text-[12.5px] text-danger mt-2">
                  Гар хоног {maxDays} хоногоос их байж болохгүй — энэ падан
                  циклдээ {maxDays} хоног л гадаа байсан.
                </p>
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
        /* ГАР ХОНОГ бол мөнгө: хөдөлгүүр яг (гараар − системээр) × тоо ×
           тарифаар хөдөлдөг. Тэр бичиж байхад нь дүн нь ЭНД харагдана —
           «ширхэг» дээр зогссон тооцоо нь H5-ийн шийдвэрийг нууж байв. */
        const eff = overrideEffect(act.map((r) => ({
          qty: r.ret, rate: r.daily_rate, days: rowDays(r), hint: rowHint(r) })));
        const net = repFee + woFee + eff.delta;
        const signed = (n: number) => (n < 0 ? "−" : "+") + money(Math.abs(n));
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
              ...(eff.count > 0 ? [{
                label: eff.manual != null && eff.auto != null
                  ? `Гар хоног (гараар ${eff.manual} / системээр ${eff.auto})`
                  : `Гар хоногийн зөрүү (${eff.count} мөр)`,
                value: signed(eff.delta),
                accent: eff.delta > 0 ? ("danger" as const)
                      : eff.delta < 0 ? ("money" as const) : ("dim" as const),
              }] : []),
              ...(repQty > 0 ? [{ label: `Засварын төлбөр (${fmt(repQty)}ш × фикс)`, value: "+" + money(repFee), accent: "danger" as const }] : []),
              ...(woQty > 0 ? [{ label: `Актын төлбөр (${fmt(woQty)}ш × НБҮнэ)`, value: "+" + money(woFee), accent: "danger" as const }] : []),
            ]}
            total={{ label: net < 0 ? "Нэхэмжлэлээс хасагдах нийт"
                                    : "Нэхэмжлэлд нэмэгдэх нийт",
                     value: (net < 0 ? "−" : "") + money(Math.abs(net)),
                     accent: net > 0 ? "danger" : net < 0 ? "money" : undefined }} />
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

/* ---------- ХУДАЛДАА БОЛГОХ (§3 H7-ийн гурав дахь гарц) ----------
   Ажлын төгсгөлд харилцагч хэвээ буцааж ачихын оронд ӨӨРТӨӨ АВЧ ҮЛДДЭГ.
   Тэр нь БУЦААЛТ БИШ (бараа ирээгүй) ба ДУТАГДУУЛСАН ч БИШ (алдагдаагүй,
   зарагдсан) — тиймээс өөрийн цонхтой. Буцаалтын цонхны «очих зэрэглэл»,
   «засварт», «актлах», «гар хоног» гэсэн асуултууд энд ОГТ утгагүй: тэр
   барааг бид дахин хэзээ ч харахгүй.

   Хоёр алхам: маягт (FormModal, `dirty`-тэй) → ҮР ДҮНГ ХАРУУЛСАН
   баталгаажуулалт (ConfirmModal + Receipt). Мөнгө хөдөлж байгаа тул
   UI-ЗАРЧИМ §4-ийн дүрэм: «болох гэж буйгаа ЭХЛЭЭД харуулаад л асууна». */
function SaleModal({ d, seesMoney, prefill, onClose, onDone }: any) {
  const toast = useToast();
  const uid = useId();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<any[]>(
    applySalePrefill(d.items.filter((i: any) => i.qty > 0)
      .map((i: any) => ({ ...i, sell: 0 })), prefill));
  const [ask, setAsk] = useState(false);
  const setRow = (i: number, patch: any) =>
    setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const act = rows.filter((r) => r.sell > 0);
  const totQty = act.reduce((s, r) => s + r.sell, 0);
  const total = saleTotal(act.map((r) => ({ qty: r.sell, sale_price: r.sale_price || 0 })));
  const over = rows.some((r) => r.sell > r.qty);
  const dirty = date !== today() || rows.some((r) => r.sell > 0);

  async function submit() {
    const lines = act.map((r) => ({
      material_id: r.material_id, grade_id: r.grade_id, qty: r.sell }));
    try {
      await api(`/api/contracts/${d.id}/movements`, { method: "POST",
        body: JSON.stringify({ type: "SALE", date, note: "Худалдаа болгов", lines }) });
      toast("Худалдаа бүртгэгдлээ — түрээс тэр өдрөөс зогсоно");
      onDone();
    } catch (e: any) { toast(e.message, "err"); setAsk(false); }
  }

  /* Мөр бүрийн ҮРЖВЭР — Отгоо дэлгэц дээрх тоог өөрөө дахин үржүүлж
     шалгана. Даргад дүн нь ирэхгүй тул ширхэг дээр зогсоно. */
  const receiptRows = act.map((r) => ({
    label: `${r.material} (${r.grade})`,
    sub: seesMoney
      ? `${fmt(r.sell)}ш × ${money(r.sale_price || 0)}`
      : `${fmt(r.sell)}ш`,
    value: seesMoney
      ? money(saleRowTotal({ qty: r.sell, sale_price: r.sale_price || 0 }))
      : `${fmt(r.sell)} ш`,
  }));

  return (
    <>
      <FormModal title="Худалдаа болгох" onClose={onClose} wide dirty={dirty}>
        <p className="text-[13.5px] text-t2 mb-4">
          Харилцагч түрээсэнд байгаа бараагаа <b className="text-ink">өөртөө авч
          үлдэх</b> бол энд бүртгэнэ. Тэр тооны түрээс энэ өдрөөс{" "}
          <b className="text-ink">зогсоно</b>, бараа паркаас гарна
          {seesMoney && <>, дүн нь <b className="text-ink">худалдах үнээр</b> тухайн
            циклийн нэхэмжлэлд нэмэгдэнэ</>}.
        </p>
        <label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
        <input id={`${uid}-date`} type="date" className="inp mb-4 max-w-[200px]"
               value={date} onChange={(e) => setDate(e.target.value)} />

        <div className="divide-y divide-line border-t border-line">
          {rows.map((r, i) => {
            const bad = r.sell > r.qty;
            return (
              <div key={i} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <b className="text-[15.5px] text-ink block leading-tight">{r.material}</b>
                  <span className="text-[12.5px] text-t2">
                    <span className="pill-grey !py-0 mr-1.5">{r.grade}</span>
                    түрээсэнд <b className="tabular-nums">{fmt(r.qty)}</b>ш
                    {seesMoney && <> · худалдах үнэ{" "}
                      <b className="tabular-nums">{money(r.sale_price || 0)}</b></>}
                  </span>
                  {seesMoney && r.sell > 0 && (
                    <span className="block text-[12.5px] text-violet tabular-nums">
                      {fmt(r.sell)} × {money(r.sale_price || 0)} ={" "}
                      <b>{money(saleRowTotal({ qty: r.sell, sale_price: r.sale_price || 0 }))}</b>
                    </span>
                  )}
                </div>
                <input type="number" inputMode="numeric" min={0} max={r.qty} placeholder="0"
                       aria-label={`${r.material} — худалдах тоо`}
                       className={`inp !w-24 !min-h-[52px] text-center !text-[17px] font-bold ${
                         bad ? "!border-danger" : r.sell > 0 ? "!border-brand" : ""}`}
                       value={r.sell || ""}
                       onChange={(e) => setRow(i, { sell: +e.target.value })} />
              </div>
            );
          })}
        </div>

        {over && (
          <p className="text-[12.5px] text-danger mt-3">
            Түрээсэнд байгаагаас их байна — тоогоо шалгана уу.
          </p>
        )}
        {totQty > 0 ? (
          <Receipt className="mt-4" rows={receiptRows}
            total={seesMoney
              ? { label: "Нэхэмжлэлд нэмэгдэх нийт", value: money(total), accent: "danger" }
              : { label: "Худалдах нийт", value: `${fmt(totQty)} ш` }} />
        ) : (
          <p className="text-[12.5px] text-t2 mt-3">
            Худалдах тоогоо оруулна уу — үржвэр нь доор гарна.
          </p>
        )}

        <div className="flex justify-end gap-2.5 mt-5">
          <button className="btn-secondary tap-lg" onClick={onClose}>Болих</button>
          <button className="btn-primary tap-lg px-6" disabled={!totQty || over}
                  onClick={() => setAsk(true)}>Худалдаа болгох</button>
        </div>
      </FormModal>

      {ask && (
        <ConfirmModal title="Худалдаа болгох уу?"
          intro={<>Гэрээ №{d.no} · <b className="text-ink">{d.client}</b> —{" "}
                 <b className="text-ink">{date}</b>-нээс эхлэн энэ бараа{" "}
                 <b className="text-ink">түрээс тооцогдохоо болино</b> ба паркаас
                 гарна. Хөдөлгөөнийг дараа нь хүчингүй болгож болно.</>}
          rows={receiptRows}
          total={seesMoney
            ? { label: "Нэхэмжлэлд нэмэгдэх нийт", value: money(total), accent: "danger" }
            : { label: "Худалдах нийт", value: `${fmt(totQty)} ш` }}
          confirmLabel="Тийм, худалдаа болгоё"
          onConfirm={submit} onClose={() => setAsk(false)} />
      )}
    </>
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

/* ---------- ХААЛТЫН ЁСЛОЛ (H7) ----------
   «Хэлцэл хаахад тоолуур зогсдоггүй» байв: эцсийн тасархай цикл ХЭЗЭЭ Ч
   нэхэмжлэл болдоггүй, ёслолыг чиглүүлэх юу ч байхгүй — ганц улаан товч.

   Отгоо эгчийн жинхэнэ дараалал: гадаа үлдсэнээ шийд (буцаалт эсвэл
   ДУТАГДУУЛСАН НБҮнээр) → эцсийн хагас циклээ нэх → барьцаагаа суутгаж
   /буцааж цэвэрлэ → «хаав» гэж бич. Wizard нь ЯГ энэ дарааллыг алхуулна.

   АЛХАМ НЬ ДАТАНААС: гадаа юу ч байхгүй, барьцаа ч алга бол хоёрхон алхам
   үлдэнэ (`closeSteps`) — хоосон дэлгэц дамжуулах нь ажил нэмнэ.

   БҮХ ТООГ СЕРВЕР ХЭЛНЭ (`/close-preview`): эцсийн нэхэмжлэлийн дүн нь
   хаах агшинд цаас болох ЯГ ТЭР функцээс (`derivable_invoice_specs`) гарна,
   тул урьдчилсан тоо ба хэвлэгдэх тоо ХОЁР ӨӨР байх боломжгүй. */
function CloseWizard({ d, grades, onClose, onDone, onReload, pdf }: {
  d: any; grades: any[]; onClose: () => void; onDone: () => void;
  onReload: () => void; pdf: any;
}) {
  const toast = useToast();
  const uid = useId();
  const [p, setP] = useState<ClosePreview | null>(null);
  const [closeDate, setCloseDate] = useState(today());
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  /* Дэд цонх: буцаалт (урьдчилсан утгатай) эсвэл барьцааны тооцоо.
     Хаагдмагц wizard нь СЕРВЕРЭЭС дахин уншина — «гадаа юу үлдэв» гэдэг
     нь дэлгэц дээрх таамаг биш, амьд байдал. */
  const [sub, setSub] = useState<null | { kind: "return"; prefill: Prefill }
                                      | { kind: "sale"; prefill: SalePrefill }
                                      | { kind: "deposit" }>(null);
  const [done, setDone] = useState<any[] | null>(null);

  const load = async () => {
    try {
      const q = closeDate ? `?close_date=${closeDate}` : "";
      setP(await api(`/api/contracts/${d.id}/close-preview${q}`));
    } catch (e: any) { toast(e.message, "err"); }
  };
  useEffect(() => { void load(); }, [closeDate]);

  const steps = closeSteps(p);
  const step = steps[Math.min(at, steps.length - 1)];
  const block = p && step ? stepBlock(p, step.key) : null;
  const last = at >= steps.length - 1;

  /* ⚠ СҮҮЛЧИЙН АЛХАМ ДЭЭР ФОКУС «БОЛИХ» ДЭЭР ОЧНО — `ConfirmModal`-ийн
     `danger` дүрэмтэй ЯГ ижил (UI-ЗАРЧИМ §4: «аюултай үйлдэлд фокус Болих
     дээр очно»).

     ЯАГААД ЗААВАЛ: «Цааш →» ба «Гэрээ хаах» хоёр нь JSX-ийн ЯГ НЭГ байрлалд
     сольж зурагддаг тул React нь ижил `<button>` DOM зангилааг ДАХИН
     АШИГЛАДАГ — товчны бичиг, өнгө нь солигдоод фокус нь ХЭВЭЭР үлдэнэ.
     Өөрөөр хэлбэл «Цааш →» дарсан хүний хурууны доор тэр агшинд УСТГАХ
     улаан товч зогсож, фокустай нь тэр болно: дараагийн НЭГ Enter гэрээг
     хаана. Отгоо эгч жагсаалт дундуур Enter дардаг зуршилтай — энэ бол
     онолын биш, тохиолдох алдаа. */
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (last) cancelRef.current?.focus(); }, [last]);

  const refresh = () => { setSub(null); void load(); onReload(); };

  async function doClose() {
    setBusy(true);
    try {
      const r = await api(`/api/contracts/${d.id}/close`, { method: "POST",
        body: JSON.stringify({ close_date: closeDate }) });
      toast(`Гэрээ ${r.closed_date}-нд хаагдлаа`);
      setDone(r.invoices || []);
      onReload();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  }

  /* ---- Амжилтын төлөв: төрсөн цаасаа ШУУД гартаа авна ---- */
  if (done) {
    return (
      <Modal title="Гэрээ хаагдлаа" onClose={onDone}>
        <p className="text-[13.5px] text-t2 mb-4">
          Гэрээ №{d.no} · <b className="text-ink">{d.client}</b> —{" "}
          <b className="text-ink">{closeDate}</b>-нд хаагдав. Энэ өдрөөс хойш
          хуримтлал бодогдохгүй.
        </p>
        {done.length === 0 ? (
          <p className="text-[13px] text-t2">Эцсийн циклд нэхэх зүйл гараагүй.</p>
        ) : done.map((inv: any) => (
          <div key={inv.id} className="rounded-xl bg-sunken p-3.5 mb-2.5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <b className="text-ink text-[14px]">{invoiceLabel(inv).title}</b>
              <b className="tabular-nums text-[15px]">{money(inv.total)}</b>
            </div>
            <span className="block text-[12px] text-t3 mb-2.5">
              Эцсийн тасархай цикл · №{inv.no}
            </span>
            <div className="flex gap-2 flex-wrap">
              <PdfButton pdf={pdf} className="btn-secondary btn-row"
                         path={`/api/invoices/${inv.id}/pdf`}>PDF</PdfButton>
              <PdfButton pdf={pdf} className="btn-ghost btn-row"
                         path={`/api/invoices/${inv.id}/appendix-pdf`}>Хавсралт</PdfButton>
            </div>
          </div>
        ))}
        <div className="flex justify-end mt-5">
          <button className="btn-primary" autoFocus onClick={onDone}>Хаах</button>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal title="Гэрээ хаах" onClose={onClose} wide>
        {/* Алхмын мөр — хэдэн алхам үлдсэнийг НЭГ харцаар */}
        <ol className="flex gap-2 flex-wrap mb-5 text-[12.5px]">
          {steps.map((s, i) => (
            <li key={s.key}
                className={`px-2.5 py-1 rounded-full ${
                  i === at ? "bg-brand-50 text-brand-ink font-bold"
                  : i < at ? "bg-sunken text-t2" : "bg-sunken text-t3"}`}>
              {i + 1}. {s.title}{i < at && <span aria-hidden="true"> ✓</span>}
              {i === at && <span className="sr-only"> — одоогийн алхам</span>}
            </li>
          ))}
        </ol>

        {!p ? <Spinner /> : step?.key === "goods" ? (
          <>
            <p className="text-[13.5px] text-t2 mb-4">
              Түрээсэнд <b className="text-ink tabular-nums">{fmt(outstandingQty(p.outstanding))}</b>ш
              байсаар байна. Мөр бүрийг шийднэ: ирсэн бол <b>буцаалт</b>, ирээгүй бол{" "}
              <b>дутагдуулсан</b> (НБҮнээр), харилцагч <b>өөртөө авч үлдсэн</b> бол{" "}
              <b>худалдаа болгоно</b> (худалдах үнээр).
            </p>
            <div className="divide-y divide-line border-t border-line">
              {p.outstanding.map((r: OutRow) => (
                <div key={`${r.material_id}:${r.grade_id}`}
                     className="py-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <b className="text-[14.5px] text-ink block leading-tight">{r.material}</b>
                    <span className="text-[12.5px] text-t2">
                      <span className="pill-grey !py-0 mr-1.5">{r.grade}</span>
                      гадаа <b className="tabular-nums">{fmt(r.qty)}</b>ш
                    </span>
                    {/* ХОЁР ҮНЭ ЗЭРЭГ, ҮРЖВЭРТЭЙГЭЭ. Отгоогийн арга нь бүх
                        арифметикээ дахин бодох явдал — үр дүн ганцаараа
                        зогсвол шалгах юмгүй болно (§4). */}
                    <span className="block text-[12.5px] text-t2 tabular-nums">
                      дутагдуулбал {fmt(r.qty)} × {money(r.nb_price)} ={" "}
                      <b className="text-danger">{money(r.writeoff_amount)}</b>
                      <span className="text-t3"> · </span>
                      худалдвал {fmt(r.qty)} × {money(r.sale_price)} ={" "}
                      <b className="text-violet">{money(r.sale_amount)}</b>
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn-secondary btn-row"
                            onClick={() => setSub({ kind: "return",
                                                    prefill: returnPrefill(r, "return") })}>
                      Буцаалт бүртгэх<span className="sr-only"> — {r.material} {r.grade}</span>
                    </button>
                    <button className="btn-ghost btn-row text-danger"
                            onClick={() => setSub({ kind: "return",
                                                    prefill: returnPrefill(r, "writeoff") })}>
                      Дутагдуулсан<span className="sr-only"> — {r.material} {r.grade}</span>
                    </button>
                    <button className="btn-ghost btn-row text-violet"
                            onClick={() => setSub({ kind: "sale", prefill: salePrefill(r) })}>
                      Худалдаа болгох<span className="sr-only"> — {r.material} {r.grade}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Receipt className="mt-4"
              rows={[
                { label: "Гадаа нийт", value: `${fmt(outstandingQty(p.outstanding))} ш` },
                { label: "Бүгдийг дутагдуулсан гэж бичвэл",
                  value: money(outstandingWriteoff(p.outstanding)), accent: "danger" },
              ]}
              total={{ label: "Бүгдийг худалдаа болговол",
                       value: money(outstandingSale(p.outstanding)), accent: "violet" }} />
          </>
        ) : step?.key === "final" ? (
          <>
            <label className="lbl" htmlFor={`${uid}-cd`}>Хаах огноо</label>
            <input id={`${uid}-cd`} type="date" className="inp max-w-[200px] mb-4"
                   value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            {p.close_error && (
              <p className="text-[12.5px] text-danger mb-3">⚠ {p.close_error}</p>
            )}
            {p.final_invoices.length > 0 ? (
              <Receipt
                rows={p.final_invoices.flatMap((fi) => [
                  { label: fi.label, sub: `№${fi.no} · эцсийн тасархай цикл`,
                    value: money(fi.rent_amount) },
                  ...(fi.charge_amount ? [{ label: "үүнд засвар/акт",
                                            value: money(fi.charge_amount),
                                            accent: "dim" as const }] : []),
                  ...(fi.vat_amount ? [{ label: "НӨАТ", value: money(fi.vat_amount),
                                         accent: "dim" as const }] : []),
                ])}
                total={{ label: "Эцсийн нэхэмжлэл",
                         value: money(p.final_invoices.reduce((s, f) => s + f.total, 0)) }} />
            ) : (
              <p className="text-[13px] text-t2">
                {p.close_error ? "Огноогоо зассаны дараа эцсийн тооцоо гарна."
                  : "Эцсийн циклд нэхэх зүйл алга — шинэ нэхэмжлэл гарахгүй."}
              </p>
            )}
            <Receipt className="mt-4"
              rows={[
                { label: "Төлөгдөөгүй нэхэмжлэл", value: money(p.unpaid),
                  accent: p.unpaid > 0 ? "danger" : undefined },
                ...(p.penalty_booked > 0
                  ? [{ label: "Нэхэгдсэн алданги", value: money(p.penalty_booked),
                       accent: "danger" as const }] : []),
                ...(p.penalty_unbooked > 0
                  ? [{ label: `Алдангийн тооцоол — ${UNCHARGED}`,
                       value: "≈" + money(p.penalty_unbooked), accent: "dim" as const }] : []),
              ]}
              total={{ label: "Хаалтын дараа үлдэх өр",
                       value: money(p.unpaid + p.penalty_booked
                                    + p.final_invoices.reduce((s, f) => s + f.total, 0)),
                       accent: "danger" }} />
            {p.penalty_unbooked > 0 && (
              <p className="text-[12.5px] text-t2 mt-2.5">
                Алдангийн тооцоолол нь нэхэгдээгүй тул хаалтын дүнд ОРОХГҮЙ.
                Нэхэх бол эхлээд «Алданги нэхэх» товчоор нэхнэ.
              </p>
            )}
          </>
        ) : step?.key === "deposit" ? (
          <>
            <p className="text-[13.5px] text-t2 mb-4">
              Барьцаа <b className="text-ink tabular-nums">{money(p.deposit.amount)}</b>{" "}
              тооцоо хийгдээгүй байна. Отгоо эгчийн журам: авлагад суутгаад,
              зөрүүг нь буцаана.
            </p>
            <Receipt
              rows={[{ label: "Барьцааны дүн", value: money(p.deposit.amount) },
                     { label: "Одоогийн өр", value: money(p.unpaid + p.penalty_booked),
                       accent: "danger" }]}
              total={{ label: "Суутгасны дараа буцаах",
                       value: money(Math.max(p.deposit.amount - p.unpaid, 0)), accent: "money" }} />
            <button className="btn-primary w-full justify-center mt-4"
                    onClick={() => setSub({ kind: "deposit" })}>
              Барьцааны тооцоо хийх
            </button>
            <p className="text-[12.5px] text-warn mt-2.5">
              ⚠ Алгасвал барьцаа тооцоогүй хэвээр үлдэнэ — дараа нь гэрээний
              хуудаснаас хийж болно.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13.5px] text-t2 mb-4">
              Гэрээ №{d.no} · <b className="text-ink">{d.client}</b> —{" "}
              <b className="text-ink">{closeDate}</b>-нд хаагдана. Энэ өдрөөс
              хойш шинэ хуримтлал бодогдохгүй, эцсийн тасархай цикл нэхэмжлэл
              болно. Гэрээ хаах үйлдлийг буцаах боломжгүй.
            </p>
            <Receipt
              rows={[
                ...(p.final_invoices.length
                  ? [{ label: "Эцсийн нэхэмжлэл төрнө",
                       value: money(p.final_invoices.reduce((s, f) => s + f.total, 0)),
                       accent: "money" as const }] : []),
                { label: "Төлөгдөөгүй нэхэмжлэл", value: money(p.unpaid),
                  accent: p.unpaid > 0 ? "danger" : undefined },
                ...(p.penalty_booked > 0
                  ? [{ label: "Нэхэгдсэн алданги", value: money(p.penalty_booked),
                       accent: "danger" as const }] : []),
                ...(p.deposit.amount > 0 && !p.deposit.settled
                  ? [{ label: "⚠ Барьцааны тооцоо хийгдээгүй",
                       value: money(p.deposit.amount), accent: "danger" as const }] : []),
              ]}
              total={{ label: "Хаах үед үлдэх нийт тооцоо",
                       value: money(p.unpaid + p.penalty_booked
                                    + p.final_invoices.reduce((s, f) => s + f.total, 0)),
                       accent: "danger" }} />
          </>
        )}

        {/* ЗОГСООХ ШАЛТГААН нь АЛХАМ БҮР дээр ил байна.
            Урьд нь энэ мөр зөвхөн СҮҮЛЧИЙН (хаах) алхам дотор байсан: «Гадаа
            үлдэгдэл» алхам дээр «Цааш →» товч чимээгүй идэвхгүй болж, шалтгаан
            нь товчны `title`-д НУУГДДАГ байв. Отгоо эгч идэвхгүй товч дээр
            хулгана БАРЬДАГГҮЙ (дэлгэц дээр болж буйг анзаардаггүй) — түүний
            хувьд тэр тайлбар БАЙХГҮЙТЭЙ адил: «дараад юу ч болсонгүй».
            Одоо шалтгаан нь товчныхоо дэргэд, алхмаас үл хамааран зурагдана. */}
        {block && (
          <p className="text-[12.5px] text-danger mt-3" role="status">⚠ {block}</p>
        )}

        <div className="flex justify-end gap-2.5 mt-5 flex-wrap">
          <button className="btn-secondary" ref={cancelRef} onClick={onClose}>Болих</button>
          {at > 0 && (
            <button className="btn-ghost" onClick={() => setAt(at - 1)}>← Буцах</button>
          )}
          {!last ? (
            <button className="btn-primary" disabled={!p || !!block}
                    title={block || undefined}
                    onClick={() => setAt(at + 1)}>Цааш →</button>
          ) : (
            <button className="btn-primary !bg-danger" disabled={busy || !p || !!block}
                    title={block || undefined} onClick={doClose}>
              {busy ? "…" : "Гэрээ хаах"}
            </button>
          )}
        </div>
      </Modal>

      {sub?.kind === "return" && (
        <ReturnModal d={d} grades={grades} seesMoney prefill={sub.prefill}
                     onClose={() => setSub(null)} onDone={refresh} />
      )}
      {sub?.kind === "sale" && (
        <SaleModal d={d} seesMoney prefill={sub.prefill}
                   onClose={() => setSub(null)} onDone={refresh} />
      )}
      {sub?.kind === "deposit" && (
        <DepositModal d={d} onClose={() => setSub(null)} onDone={refresh} />
      )}
    </>
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
      {/* НЭГ УДААГИЙН хаалга: сервер гэрээ бүрд `settle-deposit`-ыг ГАНЦ удаа
          хүлээж авдаг (дараа нь «Барьцаа аль хэдийн тооцогдсон») бөгөөд суутгал
          нь ЖИНХЭНЭ төлбөрийн бичилт болж авлагад суудаг. Тиймээс дүнгээ
          буруу хуваасан ч засах зам БАЙХГҮЙ — дарахаас ӨМНӨ хэлнэ.
          Цонх нь `FormModal` хэвээр: талбартай модал `dirty`-гүй байж
          БОЛОХГҮЙ (UI-ЗАРЧИМ §4) — `ConfirmModal` нь энгийн `Modal` дээр
          суудаг тул санамсаргүй гадна товшилт бичсэн дүнг чимээгүй устгана.
          Харин ГҮЙЦЭТГЭХ товч нь гэрээ хаах wizard-тай ижил улаан жинтэй. */}
      <p className="text-[12.5px] text-danger mt-2.5">
        ⚠ Барьцааны тооцоо гэрээнд НЭГ л удаа хийгдэнэ. Энэ үйлдлийг буцаах боломжгүй.
      </p>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary !bg-danger" disabled={busy || over || (apply + ret) <= 0} onClick={async () => {
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

/* ---------- Алдангийн нэхэлт ХҮЧИНГҮЙ болгох (H1-ийн тэгш хэм) ----------
   Отгоо утсаар ярьж байгаад «за яахав, алдангийг нь тавьж өгье» гэдэг нь
   ХЭВИЙН тохиолдол. Систем дээр төлбөр, хөдөлгөөн, акт, тариф бүгд хүчингүй
   болдог байхад мөнгө ҮҮСГЭДЭГ цорын ганц үйлдэл нь буцаагддаггүй байв.

   Цуцлалт нь ХАСАЛТ БИШ, ДАХИН ДЕРИВАЦИ: сервер тал явдлыг хүчингүй гэж
   тэмдэглээд нэхэмжлэлүүдийг дахин боддог. Тиймээс энэ цонх ТООГ ТААМАГЛАХГҮЙ
   — RebuildModal цикл бүрийн жинхэнэ зөрүүг дараагийн алхамд харуулна. */
function VoidChargeModal({ d, ch, onClose, onDone, onRebuild }: {
  d: any; ch: any; onClose: () => void; onDone: () => void;
  onRebuild: (p: Pending) => void;
}) {
  const [reason, setReason] = useState("");
  const toast = useToast();
  const rid = useId();
  const path = `/api/penalty-charges/${ch.id}/void`;
  /* Хожуу нэхэлт амьд байвал нэхэлтийн ХИЛ тэндээ үлдэнэ — дүн нь буурахгүй
     байж болно. «Дарлаа, юу ч болсонгүй» гэж уншигдахаас ӨМНӨ хэлнэ. */
  const later = laterLiveCharge(d.penalty_charges, ch);

  return (
    <ConfirmModal
      title="Алдангийн нэхэлт хүчингүй болгох"
      intro={<>
        <b className="text-ink">{ch.as_of} өдрөөр {money(ch.amount)}</b> — энэ нэхэлт
        УСТАХГҮЙ: жагсаалтад «ХҮЧИНГҮЙ» тэмдэгтэй, шалтгаантайгаа хамт үлдэнэ.
        Нэхэгдсэн алданги тооцооноос гарч, түүнд төлөгдсөн мөнгө ҮНДСЭН өр рүү
        буцаж хуваарилагдана. Энэ үйлдлийг буцаах боломжгүй.
      </>}
      rows={[{ label: `${ch.as_of} өдрийн нэхэлт`, sub: "тооцооноос гарна",
               value: "−" + money(ch.amount), accent: "danger" as const },
             ...(later
               ? [{ label: `${later.as_of} өдрийн нэхэлт`, sub: "хүчинтэй хэвээр",
                    value: money(later.amount), accent: "dim" as const }]
               : [])]}
      total={{ label: "Үлдэх нэхэлтийн нийлбэр",
               value: money(chargedTotal(d.penalty_charges) - ch.amount),
               accent: "danger" }}
      note={later
        ? "Түүнээс ХОЙШ нэхсэн мөр хүчинтэй хэвээр байна — нэхэлтийн хил тэндээ "
          + "үлдэж, нэхэгдсэн дүн буурахгүй байж болзошгүй. Дараагийн алхам "
          + "нэхэмжлэл бүрийн ЖИНХЭНЭ зөрүүг харуулна."
        : "Дараагийн алхам нэхэмжлэл бүрийн зөрүүг харуулна."}
      confirmLabel="Хүчингүй болгох"
      confirmDisabled={!reason.trim()}
      danger
      onClose={onClose}
      onConfirm={async () => {
        const body = { reason: reason.trim() };
        try {
          const r = await api(path, { method: "POST", body: JSON.stringify(body) });
          if (r?.rebuild_required) {
            onRebuild({ path, body, method: "POST",
                        okMsg: "Алдангийн нэхэлт хүчингүй болов",
                        diffs: r.diffs || [], warnings: r.warnings || [] });
            return;
          }
          toast("Алдангийн нэхэлт хүчингүй болов");
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }}>
      <label className="block text-[12.5px] font-semibold text-t2 mb-1.5" htmlFor={rid}>
        Цуцлах шалтгаан <span className="text-danger">*</span>
      </label>
      <input id={rid} className="inp w-full" value={reason} autoFocus
             placeholder="ж: утсаар ярьж өршөөв"
             onChange={(e) => setReason(e.target.value)} />
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

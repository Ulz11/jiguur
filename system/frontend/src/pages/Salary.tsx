import { Fragment, useEffect, useId, useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty, Receipt, ConfirmModal, InlineEdit,
         DisclosureCell, DisclosureHead } from "../ui";
import { ErrorCard, SideStrip } from "../components/SideStrip";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { empBody, type EmployeeBody } from "../lib/employee";
import { rowClickProps } from "../lib/rowClick";
import { panelId, disclosureProps } from "../lib/disclosure";
import { exactBelow } from "../lib/credit";
import { PAID_RUN_LOCKED, ndshLabel, runDeletable, trimPct } from "../lib/sideRows";
import { employeeOutcome, salaryPaidOutcome, salaryRunDeletedOutcome, salaryRunOutcome,
         type Outcome } from "../lib/outcomeSide";
import { todayIso } from "../lib/schedule";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
const TYPE_LABEL: Record<string, string> = { main: "Үндсэн", contract: "Гэрээт", daily: "Өдрийн" };
const TYPE_OPTIONS = Object.entries(TYPE_LABEL) as [string, string][];

export default function Salary() {
  const [emps, setEmps] = useState<any[] | null>(null);
  const [runs, setRuns] = useState<any[] | null>(null);
  const [modal, setModal] = useState<any>(null); // {kind:'emp'|'run'}
  const [open, setOpen] = useState<number | null>(null);
  const [payRun, setPayRun] = useState<any>(null); // олгохоор баталгаажуулж буй бодолт
  const [drop, setDrop] = useState<any>(null);     // жагсаалтаас хасахаар баталгаажуулж буй ажилтан
  const [delRun, setDelRun] = useState<any>(null); // буруу бодсоныг устгах (ЗӨВХӨН олгоогүй)
  /* Цалингийн сан нь СЕРВЕРИЙН нэг эх сурвалжаас (`/api/salary/summary`) —
     хуудас өөрөө «өдрийнхийг 22 хоногоор» гэж дахин боддог байсан нь
     Аналитик хуудсын тоотой зөрөх бүрэн боломжтой байв. */
  const [sum, setSum] = useState<any>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  /** Дөнгөж хасагдсан ажилтан — зурвас дээрх «Идэвхжүүлэх»-ийн бай. */
  const [backIn, setBackIn] = useState<any>(null);
  const [err, setErr] = useState("");
  const toast = useToast();
  const announce = (o?: Outcome | null) => { if (o) { setOutcome(o.text); setBackIn(null); } };

  /* Гурван хүсэлтийн ХОЁР нь баригчгүй байв (`runs`, `summary`): сервер
     унасан үед хуудас «Ачаалж байна…» дээрээ мөнхөд зогсоно. Одоо аль нэг нь
     унавал ШАЛТГААН ба «Дахин оролдох» гарна. */
  const load = () => {
    const fail = (e: any) => { setErr(e.message); toast(e.message, "err"); };
    api("/api/salary/employees").then((x) => { setEmps(x); setErr(""); }).catch(fail);
    api("/api/salary/runs").then(setRuns).catch(fail);
    api("/api/salary/summary").then(setSum).catch(fail);
  };
  useEffect(load, []);

  /* Мөр дээрх засвар. PUT нь БҮТЭН ажилтныг хүлээж авдаг тул зассан талбараа
     үлдсэнтэй нь хамт (`empBody`) явуулна — эс бөгөөс цалин чимээгүй 0 болно.
     Алдааг toast-оор гаргаад InlineEdit руу дахин throw хийнэ (засварын горимд үлдэнэ). */
  const saveEmp = async (e: any, patch: Partial<EmployeeBody>, msg: string) => {
    try {
      await api(`/api/salary/employees/${e.id}`, { method: "PUT", body: JSON.stringify(empBody(e, patch)) });
      toast(msg); load();
    } catch (er: any) { toast(er.message, "err"); throw er; }
  };
  if (err && (!emps || !runs)) {
    return <ErrorCard message={err} onRetry={() => { setErr(""); load(); }} />;
  }
  if (!emps || !runs) return <Spinner />;

  /* Сан нь СЕРВЕРИЙНХЭЭР. Хариу ирээгүй үед л хуудас өөрөө бодно (22 хоног) —
     тэр нь ЗӨВХӨН нөөц зам, гол тоо биш. */
  const monthlyFund = Number(sum?.payroll_monthly
    ?? emps.reduce((s, e) => s + (e.type === "daily" ? e.daily_rate * 22 : e.monthly_salary), 0));
  const netFund = Number(sum?.payroll_net ?? 0);
  const dailyDays = Number(sum?.daily_days ?? 22);
  const ndshPct = Number(sum?.ndsh_percent ?? 0);

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ЦАЛИН <span>•</span> {emps.length} АЖИЛТАН</div>
          <h1 className="dashboard-title">Цалин</h1>
          <p className="dashboard-subtitle">Үндсэн ба гэрээт — сард 2 удаа (15/15), өдрийн ажилтан — ажилласан өдрөөр.</p>
        </div>
        <div className="flex gap-2.5 command-action">
          <button className="btn-secondary" onClick={() => setModal({ kind: "emp" })}>+ Ажилтан</button>
          <button className="btn-primary" onClick={() => setModal({ kind: "run" })}>Цалин бодох</button>
        </div>
      </div>

      {outcome && (
        <div className="mb-4">
          <SideStrip text={outcome}
                     onClose={() => { setOutcome(null); setBackIn(null); }}
                     action={backIn ? {
                       label: "Идэвхжүүлэх",
                       onClick: async () => {
                         const who = backIn;
                         try {
                           await api(`/api/salary/employees/${who.id}/reactivate`, { method: "POST" });
                           toast(`${who.name} жагсаалтад буцлаа`);
                           announce(employeeOutcome("on", { name: who.name,
                                                            roleTitle: who.role_title }));
                           load();
                         } catch (e: any) { toast(e.message, "err"); }
                       },
                     } : undefined} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-4 max-sm:grid-cols-1">
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Идэвхтэй ажилтан</div>
          <div className="text-[26px] font-extrabold text-ink tabular-nums">{sum?.active_count ?? emps.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Сарын цалингийн сан</div>
          <div className="text-[26px] font-extrabold text-ink tabular-nums" title={money(monthlyFund)}>{sayaFmt(monthlyFund)}₮</div>
          {exactBelow(sayaFmt(monthlyFund) + "₮", money(monthlyFund)) && (
            <div className="text-[12px] text-t2 tabular-nums mt-0.5">{money(monthlyFund)}</div>
          )}
          {/* БРУТТО сан ба ГАРТ олгох дүн хоёр ӨӨР тоо. Урьд нь зөвхөн
              бруттог зурдаг байсан тул мөнгөн урсгал төлөвлөхөд Отгоо
              НДШ-ээ өөрөө хасах ёстой болдог. */}
          {netFund > 0 && (
            <span className="block text-[12px] text-t3 tabular-nums mt-0.5">
              гарт олгох {money(netFund)}
            </span>
          )}
          <span className="block text-[12px] text-t3 mt-0.5">өдрийнхийг {dailyDays} хоногоор тооцов</span>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Сүүлийн бодолт</div>
          {runs[0] ? (
            <>
              {/* Дугуйлсан «6 сая₮» нь доорх хүснэгтийн «5,950,000₮»-той ЯГ
                  зэрэгцэж, нэг бодолт хоёр өөр тоогоор харагддаг байв. Энэ бол
                  ойролцоо биш, БАРИМТ — hover-ийн title хангалттай биш. */}
              <div className="text-[26px] font-extrabold text-ink tabular-nums">{money(runs[0].total_net)}</div>
              <span className={`mt-1 ${runs[0].paid ? "pill-green" : "pill-amber"}`}>
                {runs[0].period} · {runs[0].half}-р хагас · {runs[0].paid ? "олгосон" : "олгоогүй"}
              </span>
            </>
          ) : <div className="text-t3">—</div>}
        </div>
      </div>

      {/* ЗАСАГДДАГ ХҮСНЭГТ НЬ НАРИЙН ЗАМД БАЙВ.
          `1fr_1.4fr` нь таван баганатай, мөр дээрээ засагддаг «Ажилчид»-д
          416px, зөвхөн уншдаг «Бодолтууд»-д 584px өгдөг байв. Ажилчид хүснэгт
          548px өргөн тул 132px нь картын ДОТООД хэвтээ гүйлгэлтийн ард үлдэж,
          НДШ багана ба «Хасах» товч огт олдохгүй байв — Excel-ээс ирсэн хүн
          картын дотор хажуу тийш гүйлгэх зуршилгүй.
          Хоёр хүснэгт хоёулаа хагас замдаа багтахгүй (548 ба 584 > 494) тул
          зэрэгцүүлэх нь ГАНЦ шийдэлгүй: доошоо давхарлав — хоёулаа 1018px-ийн
          бүтэн өргөнд, хэвтээ гүйлгэлтгүй. */}
      <div className="flex flex-col gap-4">
        <div className="card overflow-x-auto">
          <h2 className="font-bold text-ink text-[15.5px] px-4 pt-4 pb-1">Ажилчид</h2>
          <table className="w-full min-w-[420px]">
            <thead><tr><th className="th">Нэр</th><th className="th">Төрөл</th>
              <th className="th text-right">Цалин / Өдрийн хөлс</th><th className="th">НДШ</th><th className="th"></th></tr></thead>
            <tbody>
              {emps.map((e) => (
                /* Мөр бүрийн зогсоол ХЭНИЙХ болохоо өөрөө хэлнэ: «Сарын цалин:
                   1,500,000₮ · засах» гэж зургаан удаа ижилхэн дуудагдвал
                   уншигчаар ажилладаг хүн ХЭНИЙ цалинг заасныг мэдэхгүй. */
                <tr key={e.id}>
                  <td className="td">
                    <InlineEdit label={`${e.name} — нэр`} value={e.name} width="w-40" confirmText="Нэр солих уу?"
                      onSave={(v) => saveEmp(e, { name: v }, "Нэр шинэчлэгдлээ")} />
                    <span className="block text-xs text-t3 mt-0.5">
                      <InlineEdit label={`${e.name} — албан тушаал`} value={e.role_title}
                        display={e.role_title || "албан тушаал…"} width="w-36" confirmText="Хадгалах уу?"
                        onSave={(v) => saveEmp(e, { role_title: v }, "Албан тушаал шинэчлэгдлээ")} />
                    </span>
                  </td>
                  <td className="td">
                    <InlineEdit label={`${e.name} — ажлын төрөл`} value={e.type} display={TYPE_LABEL[e.type]}
                      width="w-28" options={TYPE_OPTIONS} confirmText="Төрөл солих уу?"
                      onSave={(v) => saveEmp(e, { type: v },
                        "Төрөл шинэчлэгдлээ — дараагийн бодолт үүгээр бодогдоно")} />
                  </td>
                  {/* Төрөлдөө тохирох ГАНЦ тоог засна: өдрийнх нь хөлс, бусад нь сарын цалин */}
                  <td className="td text-right tabular-nums font-bold">
                    {e.type === "daily" ? (
                      <InlineEdit type="number" right label={`${e.name} — өдрийн хөлс`} value={e.daily_rate}
                        display={`${money(e.daily_rate)}/өдөр`} width="w-28" confirmText="Өдрийн хөлс солих уу?"
                        onSave={(v) => saveEmp(e, { daily_rate: parseMoney(v) },
                          "Өдрийн хөлс шинэчлэгдлээ — дараагийн бодолтод тусна")} />
                    ) : (
                      <InlineEdit type="number" right label={`${e.name} — сарын цалин`} value={e.monthly_salary}
                        display={money(e.monthly_salary)} width="w-32" confirmText="Цалин солих уу?"
                        onSave={(v) => saveEmp(e, { monthly_salary: parseMoney(v) },
                          "Цалин шинэчлэгдлээ — дараагийн бодолтод тусна")} />
                    )}
                  </td>
                  <td className="td">
                    <InlineEdit label={`${e.name} — НДШ суутгах эсэх`} value={e.ndsh ? "1" : "0"}
                      display={e.ndsh ? "Тийм" : "Үгүй"} width="w-24"
                      options={[["1", "Тийм"], ["0", "Үгүй"]]} confirmText="НДШ солих уу?"
                      onSave={(v) => saveEmp(e, { ndsh: v === "1" },
                        v === "1" ? "НДШ суутгана" : "НДШ суутгахгүй боллоо")} />
                  </td>
                  {/* Зургаан «Хасах» товч нэг ижил нэртэй байв — уншигч аль
                      ажилтныг хасах гэж байгааг мэдэхгүй (Механизмын ✕-ийн журам). */}
                  <td className="td"><button className="btn-ghost btn-row"
                    aria-label={`${e.name} — ажилтныг жагсаалтаас хасах`}
                    onClick={() => setDrop(e)}>Хасах</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {emps.length === 0 && <Empty title="Ажилтан бүртгэгдээгүй" />}
        </div>

        <div className="card overflow-x-auto">
          <h2 className="font-bold text-ink text-[15.5px] px-4 pt-4 pb-1">Бодолтууд</h2>
          <table className="w-full min-w-[480px]">
            <thead><tr><DisclosureHead />
              <th className="th">Үе</th><th className="th text-right">Нийт</th>
              <th className="th text-right">НДШ</th><th className="th text-right">Гарт олгох</th>
              <th className="th">Төлөв</th><th className="th"></th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const isOpen = open === r.id;
                const pid = panelId("run", r.id);
                return (
                <Fragment key={r.id}>
                  {/* Мөр задардаг гэдгийг ЮУ Ч хэлдэггүй байв — Зээл, гэрээний
                      материалтай нэг хэлбэрийн тэмдэг мөрийн эхэнд зогсоно. */}
                  <tr className="cursor-pointer hover:bg-canvas" {...disclosureProps(isOpen, pid)}
                      {...rowClickProps(() => setOpen(isOpen ? null : r.id),
                        `${r.period} · ${r.half}-р хагас — задаргааг ${isOpen ? "хаах" : "нээх"}`,
                        "row")}>
                    <DisclosureCell open={isOpen} />
                    <td className="td"><b className="text-ink">{r.period}</b>
                      <span className="block text-xs text-t3">{r.half}-р хагас · {r.items.length} хүн</span></td>
                    <td className="td text-right tabular-nums">{money(r.total_base)}</td>
                    {/* Бодолт нь ХЭДЭН ХУВИАР суутгасныг ӨӨРӨӨ үүрнэ: тохиргоо
                        хожим өөрчлөгдвөл хуучин мөрийн шошго худал болохгүй. */}
                    <td className="td text-right tabular-nums text-t2">
                      {r.total_ndsh ? money(r.total_ndsh) : "—"}
                      {r.total_ndsh > 0 && r.ndsh_percent > 0 && (
                        <span className="block text-[11.5px] text-t3">{trimPct(r.ndsh_percent)}%</span>
                      )}
                    </td>
                    <td className="td text-right tabular-nums font-bold text-ink">{money(r.total_net)}</td>
                    <td className="td">{r.paid ? <span className="pill-green">Олгосон</span> : <span className="pill-amber">Олгоогүй</span>}</td>
                    {/* Бодолт бүр дээр «Олгох ✓» гэсэн ЯГ ижил нэртэй товч
                        зогсдог байв — уншигчаар ажилладаг хүн АЛЬ үеийн цалинг
                        олгож байгаагаа мэдэхгүй (дээрх «Хасах»-ын журам). ✓ нь
                        чимэг тул нуугдана: «шалгагдсан» гэж уншигдах ёсгүй. */}
                    <td className="td whitespace-nowrap text-right">
                      {runDeletable(r) && (
                        <>
                          <button className="btn-ghost btn-row text-money"
                            aria-label={`${r.period} · ${r.half}-р хагас — цалин олгох`}
                            onClick={(ev) => { ev.stopPropagation(); setPayRun(r); }}>
                            Олгох <span aria-hidden="true">✓</span></button>
                          {/* БУРУУ БОДСОНЫГ УСТГАХ зам огт байгаагүй: Отгоо
                              өдрийн ажилчдын хоногийг андуурч бөглөвөл тэр
                              бодолт үүрд жагсаалтад үлдэж, зөв нь дэргэд нь
                              хоёр дахь мөр болдог байв. Сервер зөвхөн
                              ОЛГООГҮЙ бодолтыг устгана — товч ч ялгаагүй. */}
                          <button className="btn-ghost btn-row !text-danger ml-1"
                            aria-label={`${r.period} · ${r.half}-р хагас — бодолт устгах`}
                            onClick={(ev) => { ev.stopPropagation(); setDelRun(r); }}>
                            Бодолт устгах</button>
                        </>
                      )}
                      {r.paid && (
                        <span className="text-[12px] text-t3">{PAID_RUN_LOCKED}</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={pid}><td colSpan={7} className="td !bg-canvas">
                      {r.items.map((i: any) => (
                        <div key={i.id} className="flex gap-4 text-[13px] py-0.5">
                          <span className="w-40 text-ink font-semibold">{i.employee}</span>
                          <span className="tabular-nums w-28 text-right">{money(i.base)}</span>
                          {i.days > 0 && <span className="text-t3">{i.days} өдөр</span>}
                          {i.ndsh_amount > 0 && <span className="text-t2">НДШ −{money(i.ndsh_amount)}</span>}
                          <b className="tabular-nums ml-auto">{money(i.net)}</b>
                        </div>
                      ))}
                    </td></tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
          {runs.length === 0 && <Empty title="Бодолт алга" sub="«Цалин бодох» товчоор эхний бодолтоо хийгээрэй." />}
        </div>
      </div>

      {modal?.kind === "emp" && (
        <EmpModal ndshPct={ndshPct} onClose={() => setModal(null)}
                  onDone={(o?: Outcome) => { setModal(null); announce(o); load(); }} />
      )}
      {modal?.kind === "run" && (
        <RunModal emps={emps} ndshPct={ndshPct} onClose={() => setModal(null)}
                  onDone={(o?: Outcome) => { setModal(null); announce(o); load(); }} />
      )}
      {drop && (
        <ConfirmModal
          title="Ажилтныг жагсаалтаас хасах"
          intro={<><b className="text-ink">{drop.name}</b> — хасагдсаны дараа ДАРААГИЙН цалингийн
                  бодолтод орохгүй. Өмнөх бодолтууд хэвээр үлдэнэ.</>}
          rows={[
            { label: "Албан тушаал", value: drop.role_title || "—" },
            { label: "Төрөл", value: TYPE_LABEL[drop.type] },
            { label: drop.type === "daily" ? "Өдрийн хөлс" : "Сарын цалин",
              value: drop.type === "daily" ? `${money(drop.daily_rate)}/өдөр` : money(drop.monthly_salary) },
          ]}
          total={{ label: "Сарын сангаас хасагдана",
                   value: "−" + money(drop.type === "daily" ? drop.daily_rate * dailyDays : drop.monthly_salary),
                   accent: "money" }}
          confirmLabel="Хасах" danger
          onClose={() => setDrop(null)}
          onConfirm={async () => {
            const gone = drop;
            try {
              await api(`/api/salary/employees/${gone.id}`, { method: "DELETE" });
              toast(`${gone.name} жагсаалтаас хасагдлаа`);
              /* БУЦАХ ЗАМ. Хасагдсан ажилтан жагсаалтаас гардаг (сервер зөвхөн
                 идэвхтэйг буцаана) тул андуурч дарсан бол түүнийг ДАХИН
                 үүсгэхээс өөр аргагүй болж, нэг хүн хоёр мөр болно — хуучин
                 бодолтууд нь нөгөө мөрөн дээр үлдэнэ. Зурвас дээрх
                 «Идэвхжүүлэх» нь `POST …/reactivate` рүү очиж ЯГ тэр мөрийг
                 эргүүлж авчирна. */
              setOutcome(employeeOutcome("off", { name: gone.name,
                                                  roleTitle: gone.role_title }).text);
              setBackIn(gone);
              setDrop(null); load();
            } catch (e: any) { toast(e.message, "err"); setDrop(null); }
          }} />
      )}
      {/* «буцаагдахгүй» гэж дотроо бичээд `danger` аваагүй байв: Enter нь ОЛГОХ
          товч дээр очиж, санамсаргүй нэг товшилт 5,950,000₮-ийн цалинг олгосон
          болгож бүртгэдэг байлаа (ui.tsx дахь `danger` дүрэм). */}
      {payRun && (
        <ConfirmModal
          title="Цалин олгох"
          intro={<><b className="text-ink">{payRun.period} · {payRun.half}-р хагас</b> — олгосон гэж
                  тэмдэглэхэд буцаагдахгүй.</>}
          rows={[
            { label: "Ажилтан", value: `${payRun.items.length} хүн` },
            { label: "Нийт цалин", value: money(payRun.total_base) },
            ...(payRun.total_ndsh > 0
              ? [{ label: "НДШ суутгал", value: "−" + money(payRun.total_ndsh), accent: "danger" as const }] : []),
          ]}
          total={{ label: "Гарт олгох нийт", value: money(payRun.total_net), accent: "money" }}
          note="Олгосны дараа зардалд тусна. Энэ үйлдлийг буцаах боломжгүй."
          confirmLabel="Олгох ✓" danger
          onClose={() => setPayRun(null)}
          onConfirm={async () => {
            const r = payRun;
            try {
              await api(`/api/salary/runs/${r.id}/pay`, { method: "POST",
                body: JSON.stringify({ date: today() }) });
              toast("Олгосон гэж тэмдэглэгдлээ — зардалд тусна");
              announce(salaryPaidOutcome({ period: r.period, half: r.half,
                                           net: r.total_net, date: today() }));
              setPayRun(null); load();
            } catch (e: any) { toast(e.message, "err"); }
          }} />
      )}

      {/* БУРУУ БОДСОНЫГ УСТГАХ — зөвхөн ОЛГООГҮЙ бодолт (сервер 400-аар
          хаана). Олгосон бодолт нь мөнгө гарсны баримт: түүн дээр тайлангийн
          цалингийн зардал ба мөнгөн урсгал сууна. */}
      {delRun && (
        <ConfirmModal
          title="Бодолт устгах"
          intro={<><b className="text-ink">{delRun.period} · {delRun.half}-р хагас</b> — устгасан
                  бодолт сэргэхгүй. Ажилчид, цалингийн хэмжээ хэвээр: ЭНЭ ҮЕИЙГ дахин бодож болно.</>}
          rows={[
            { label: "Ажилтан", value: `${delRun.items.length} хүн` },
            { label: "Нийт цалин", value: money(delRun.total_base) },
            ...(delRun.total_ndsh > 0
              ? [{ label: "НДШ суутгал", value: "−" + money(delRun.total_ndsh), accent: "dim" as const }] : []),
          ]}
          total={{ label: "Гарт олгох байсан", value: money(delRun.total_net), accent: "danger" }}
          confirmLabel="Устгах" danger
          onClose={() => setDelRun(null)}
          onConfirm={async () => {
            const r = delRun;
            try {
              await api(`/api/salary/runs/${r.id}`, { method: "DELETE" });
              toast("Бодолт устгагдлаа");
              announce(salaryRunDeletedOutcome({ period: r.period, half: r.half,
                                                 people: r.items.length, net: r.total_net }));
              setDelRun(null); load();
            } catch (e: any) { toast(e.message, "err"); setDelRun(null); }
          }} />
      )}
    </div>
  );
}

/** ШИНЭ ажилтан бүртгэх. Байгаа ажилтныг мөр дээр нь шууд заснаа (InlineEdit). */
function EmpModal({ ndshPct, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { name: "", role_title: "", type: "main", monthly_salary: "", daily_rate: "", ndsh: false };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    <FormModal title="Шинэ ажилтан" onClose={onClose} dirty={formDirty(f0, f)}>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-name`}>Нэр *</label>
          <input id={`${uid}-name`} className="inp" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} autoFocus /></div>
        <div><label className="lbl" htmlFor={`${uid}-role`}>Албан тушаал</label>
          <input id={`${uid}-role`} className="inp" value={f.role_title} onChange={(ev) => setF({ ...f, role_title: ev.target.value })} /></div>
      </div>
      <div className="lbl mt-3.5" id={`${uid}-type`}>Төрөл</div>
      <div className="flex gap-2 mb-3.5" role="group" aria-labelledby={`${uid}-type`}>
        {Object.entries(TYPE_LABEL).map(([v, lb]) => (
          <button key={v} onClick={() => setF({ ...f, type: v })} aria-pressed={f.type === v}
            className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
              f.type === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      {f.type === "daily" ? (
        <div><label className="lbl" htmlFor={`${uid}-daily`}>Өдрийн хөлс ₮</label>
          <input id={`${uid}-daily`} className="inp" inputMode="numeric" value={f.daily_rate}
                 onChange={(ev) => setF({ ...f, daily_rate: ev.target.value })} /></div>
      ) : (
        <div><label className="lbl" htmlFor={`${uid}-monthly`}>Сарын цалин ₮</label>
          <input id={`${uid}-monthly`} className="inp" inputMode="numeric" value={f.monthly_salary}
                 onChange={(ev) => setF({ ...f, monthly_salary: ev.target.value })} /></div>
      )}
      <label className="mt-4 flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" className="w-4.5 h-4.5" checked={f.ndsh}
               onChange={(ev) => setF({ ...f, ndsh: ev.target.checked })} />
        {/* Хувь нь ТОХИРГООНООС (`/api/salary/summary`). Урьд нь «11.5%» гэж
            хатуу бичигдсэн байв: Отгоо Тохиргоо дээр 13% болгосон ч энэ мөр
            11.5 гэж хэлсээр байсан тул аль нь үнэн болох нь мэдэгдэхгүй. */}
        <span className="text-[13.5px] font-medium">{ndshLabel(ndshPct)}</span>
      </label>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim()} onSubmit={async () => {
          const body = { ...f, monthly_salary: parseMoney(f.monthly_salary),
                         daily_rate: parseMoney(f.daily_rate) };
          try {
            await api("/api/salary/employees", { method: "POST", body: JSON.stringify(body) });
            toast("Ажилтан бүртгэгдлээ");
            onDone(employeeOutcome("add", {
              name: f.name, roleTitle: f.role_title,
              pay: f.type === "daily" ? `${money(parseMoney(f.daily_rate))}/өдөр`
                                      : money(parseMoney(f.monthly_salary)) }));
          } catch (er: any) { toast(er.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

function RunModal({ emps, ndshPct, onClose, onDone }: any) {
  const toast = useToast();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [half, setHalf] = useState(now.getDate() <= 15 ? 1 : 2);
  /* Хувь нь ХУУДСААС (`/api/salary/summary`) ирнэ — цонх нь өөрөө
     `/api/settings` рүү явдаг байсан ба тэр хүсэлт БАРИГЧГҮЙ: сервер унавал
     `pct` нь 11.5 дээрээ үлдэж, баримт нь ХУДАЛ суутгал зурна. */
  const [pct, setPct] = useState(ndshPct > 0 ? ndshPct : 11.5);
  useEffect(() => {
    if (ndshPct > 0) { setPct(ndshPct); return; }
    api("/api/settings")
      .then((s) => setPct(parseMoney(s.ndsh_percent) || 11.5))
      .catch(() => { /* уншигдаагүй — анхдагчаараа үлдэнэ, баримт нь хувиа нэрлэнэ */ });
  }, [ndshPct]);
  const dailies = emps.filter((e: any) => e.type === "daily");
  const days0 = Object.fromEntries(dailies.map((e: any) => [String(e.id), ""])) as Record<string, string>;
  const [days, setDays] = useState<Record<string, string>>(days0);
  const uid = useId();
  /* Өдрийн ажилчдын ажилласан хоногийг гараар бөглөдөг — цонх санамсаргүй
     хаагдвал тэр бүхнийг дахин цуглуулна. Сар/хагасыг хөдөлгөсөн ч мөн адил. */
  const now0 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dirty = period !== now0 || half !== (now.getDate() <= 15 ? 1 : 2) || formDirty(days0, days);

  const fixed = emps.filter((e: any) => e.type !== "daily");
  const fixedBase = fixed.reduce((s: number, e: any) => s + e.monthly_salary / 2, 0);
  const dailyBase = dailies.reduce((s: number, e: any) => s + (+days[String(e.id)] || 0) * e.daily_rate, 0);
  const ndshAmt = fixed.reduce((s: number, e: any) => s + (e.ndsh ? (e.monthly_salary / 2) * pct / 100 : 0), 0)
    + dailies.reduce((s: number, e: any) => s + (e.ndsh ? (+days[String(e.id)] || 0) * e.daily_rate * pct / 100 : 0), 0);
  return (
    <FormModal title="Цалин бодох" onClose={onClose} dirty={dirty}>
      <div className="grid grid-cols-2 gap-3.5 mb-3.5">
        <div><label className="lbl" htmlFor={`${uid}-period`}>Сар</label>
          <input id={`${uid}-period`} type="month" className="inp" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
        <div><div className="lbl" id={`${uid}-half`}>Хагас</div>
          <div className="flex gap-2" role="group" aria-labelledby={`${uid}-half`}>
            {[1, 2].map((h) => (
              <button key={h} onClick={() => setHalf(h)} aria-pressed={half === h}
                className={`flex-1 rounded-[10px] border py-2.5 font-semibold text-sm min-h-[46px] transition ${
                  half === h ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{h}-р хагас</button>
            ))}
          </div></div>
      </div>
      {dailies.length > 0 && (
        <>
          {/* Мөр бүр өөр ажилтных — нэг `label` бүгдийг нь нэрлэж чадахгүй */}
          <div className="lbl">Өдрийн ажилчдын ажилласан өдөр (энэ хагаст)</div>
          {dailies.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 py-1.5">
              <span className="text-[13.5px] flex-1"><b className="text-ink">{e.name}</b>
                <span className="text-t3"> · {money(e.daily_rate)}/өдөр</span></span>
              <input type="number" min={0} max={16} className="inp !min-h-10 !py-2 w-24 text-right"
                     aria-label={`${e.name} — ажилласан өдрийн тоо`}
                     placeholder="0" value={days[String(e.id)]}
                     onChange={(ev) => setDays({ ...days, [String(e.id)]: ev.target.value })} />
            </div>
          ))}
        </>
      )}
      <Receipt className="mt-4"
        rows={[
          { label: `Үндсэн ба гэрээт (${fixed.length} хүн × цалингийн тал)`, value: money(fixedBase) },
          ...(dailyBase > 0 ? [{ label: "Өдрийн ажилчид", value: money(dailyBase) }] : []),
          { label: `НДШ суутгал (${trimPct(pct)}%)`, value: "−" + money(ndshAmt), accent: "danger" as const },
        ]}
        total={{ label: "Гарт олгох нийт (урьдчилсан)", value: money(fixedBase + dailyBase - ndshAmt) }} />
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        {/* Хоёр удаа дарвал нэг үеийн цалин ХОЁР бодолт болж үүсдэг байв */}
        <SubmitButton onSubmit={async () => {
          try {
            const dd = Object.fromEntries(Object.entries(days).filter(([, v]) => +v > 0).map(([k, v]) => [k, +v]));
            const r = await api("/api/salary/runs", { method: "POST",
              body: JSON.stringify({ period, half, daily_days: dd }) });
            toast(`Бодолт үүслээ — гарт олгох нийт ${money(r.total_net)}`);
            onDone(salaryRunOutcome({ period: r.period ?? period, half: r.half ?? half,
                                      people: (r.items || []).length, net: r.total_net }));
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бодох</SubmitButton>
      </div>
    </FormModal>
  );
}

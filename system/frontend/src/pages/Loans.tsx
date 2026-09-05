import { Fragment, useEffect, useId, useState } from "react";
import { api, money, sayaFmt } from "../api";
import { Spinner, FormModal, SubmitButton, useToast, Empty, InlineEdit, Receipt, ConfirmModal,
         DisclosureCell, DisclosureHead } from "../ui";
import { ErrorCard, SideStrip } from "../components/SideStrip";
import { parseMoney } from "../lib/num";
import { formDirty } from "../lib/dirty";
import { rowClickProps } from "../lib/rowClick";
import { panelId, disclosureProps } from "../lib/disclosure";
import { partLabel, partSign, balanceAfterRemoving } from "../lib/loan";
import { exactBelow } from "../lib/credit";
import { balanceAfterPay, isOverdue, overdueHeroText, overdueText } from "../lib/sideRows";
import { loanAddedOutcome, loanPayDeletedOutcome, loanPayOutcome, loanStatusOutcome,
         type Outcome } from "../lib/outcomeSide";
import { todayIso } from "../lib/schedule";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();
const kindLabel = (k: string) => (k === "bank" ? "Банк" : k === "private" ? "Хувь" : "Кредит");

export default function Loans() {
  const [d, setD] = useState<any>(null);
  const [modal, setModal] = useState<any>(null); // {kind:'pay'|'add'|'topup', loan?}
  const [open, setOpen] = useState<number | null>(null);
  // Уугуул confirm() биш — системийн бусад мөнгөн үйлдэлтэй ижил Modal + Receipt
  const [ask, setAsk] = useState<any>(null);     // {kind:'del'|'status', loan, payment?}
  /* ҮР ДҮНГИЙН ЗУРВАС. Хамгийн чухал нь СЕРВЕРИЙН шийдвэрүүд: төлөлт бүртгэхэд
     үлдэгдэл 0 болбол зээл АВТОМАТААР хаагдаж (`closed: true`) мөр нь
     жагсаалтаас алга болно; төлөлт устгахад ЭРГЭЖ нээгдэнэ (`reopened: true`).
     Урьд нь хоёулаа чимээгүй болдог тул Отгоо «зээл минь хаана байна?» гэж
     асуудаг байв. Зурвас нь «Хаах» дартал зогсоно. */
  const [outcome, setOutcome] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const toast = useToast();
  const announce = (o?: Outcome | null) => { if (o) setOutcome(o.text); };

  const load = () => api("/api/loans")
    .then((x) => { setD(x); setErr(""); })
    .catch((e) => { setErr(e.message); if (d) toast(e.message, "err"); });
  useEffect(() => { load(); }, []);

  // Inline засвар: амжилтгүй бол алдааг toast-оор гаргаж, InlineEdit-д дахин throw хийнэ
  // (тэгснээр edit горимоос гарахгүй).
  const doPatch = async (url: string, body: any, msg: string) => {
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(body) });
      toast(msg); load();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  };
  const savePay = (l: any, p: any, body: any, msg?: string) =>
    doPatch(`/api/loans/${l.id}/payments/${p.id}`,
      { date: p.date, amount: p.amount, part: p.part, note: p.note, ...body },
      msg ?? (p.part === "topup" ? "Нэмэлт олголт шинэчлэгдлээ" : "Төлөлт шинэчлэгдлээ"));
  const delPay = async (l: any, p: any) => {
    try {
      /* Хариу нь ЗЭЭЛИЙН шинэ байдал: `reopened: true` бол сервер хаагдсан
         зээлийг ЭРГҮҮЛЭН нээсэн гэсэн үг. Тэр шийдвэр зурвас дээр үлдэнэ. */
      const r = await api(`/api/loans/${l.id}/payments/${p.id}`, { method: "DELETE" });
      const after = Number(r?.balance ?? balanceAfterRemoving(l.balance, p.part, p.amount));
      announce(loanPayDeletedOutcome({ name: l.name, amount: p.amount, part: p.part,
                                       date: p.date, before: l.balance, after,
                                       reopened: !!r?.reopened }));
      toast(p.part === "topup" ? "Нэмэлт олголт устгагдлаа" : "Төлөлт устгагдлаа");
      setAsk(null); load();
    } catch (e: any) { toast(e.message, "err"); setAsk(null); }
  };
  const toggleStatus = async (l: any) => {
    const closing = l.status === "active";
    try {
      await api(`/api/loans/${l.id}`, { method: "PATCH",
        body: JSON.stringify({ status: closing ? "closed" : "active" }) });
      announce(loanStatusOutcome(l.name, closing, l.balance));
      toast(closing ? "Зээл хаагдлаа" : "Зээл сэргээгдлээ"); setAsk(null); load();
    } catch (e: any) { toast(e.message, "err"); }
  };

  if (err && !d) return <ErrorCard message={err} onRetry={() => { setErr(""); load(); }} />;
  if (!d) return <Spinner />;
  const s = d.summary;
  const overdueCount = Number(s.overdue_count ?? 0);
  /* «Сарын хүү» ба «Тохирсон сарын төлөлт» нь ХОЁР ӨӨР тоо бөгөөд Аналитик
     хуудас нь ТОХИРСНООР нь уншдаг. Нэг нь энд, нөгөө нь тэнд гарвал хоёр
     дэлгэц зөрсөн мэт болно — хоёулаа НЭГ нүдэнд, нэрлэгдсэн байдлаар. */
  const monthlyInterest = Number(s.monthly_interest ?? s.monthly_burden ?? 0);
  const monthlyPlanned = Number(s.monthly_planned ?? 0);

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ЗЭЭЛ / ӨГЛӨГ <span>•</span> {s.active_count} ИДЭВХТЭЙ</div>
          <h1 className="dashboard-title">Зээл / Өглөг</h1>
          <p className="dashboard-subtitle">Банк + хувь зээлдүүлэгч — үлдэгдэл, сарын хүү, дараагийн төлөлт.</p>
        </div>
        <button className="btn-primary command-action"
                onClick={() => setModal({ kind: "add" })}>+ Шинэ зээл</button>
      </div>

      {/* ЗУРВАС — толгойн доор, ажлын дээр. */}
      {outcome && <div className="mb-4"><SideStrip text={outcome} onClose={() => setOutcome(null)} /></div>}

      {/* ДУГУЙЛСАН тоо нь ХАРЦНЫХ, БҮТЭН тоо нь доороо зогсоно. Урьд нь бүтэн
          тоо нь ЗӨВХӨН `title` дээр байсан: Отгоо хулгана хүргэж хүлээх
          зуршилгүй тул «2.04 тэрбум₮» гэсэн тоог дэвтэртээ бичиж чадахгүй. */}
      <div className="grid grid-cols-4 gap-4 mb-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <div className="card hero p-5">
          <div className="text-[12.5px] text-white/80 font-medium mb-2">Нийт өглөг</div>
          <div className="text-[26px] font-extrabold text-white tabular-nums leading-tight"
               title={money(s.total_debt)}>{sayaFmt(s.total_debt)}₮</div>
          {exactBelow(sayaFmt(s.total_debt) + "₮", money(s.total_debt)) && (
            <div className="text-[12px] text-white/70 tabular-nums mt-0.5">{money(s.total_debt)}</div>
          )}
          <div className="mt-2"><span className="pill bg-white/10 text-white/80">{s.active_count} идэвхтэй зээл</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Сарын хүүгийн дарамт</div>
          <div className="text-[26px] font-extrabold text-danger tabular-nums leading-tight"
               title={money(monthlyInterest)}>{sayaFmt(monthlyInterest)}₮</div>
          {exactBelow(sayaFmt(monthlyInterest) + "₮", money(monthlyInterest)) && (
            <div className="text-[12px] text-t2 tabular-nums mt-0.5">{money(monthlyInterest)}</div>
          )}
          {/* Аналитик хуудасны «Сарын зээлийн төлбөр» нь ЭНЭ тоо (тохирсон
              төлөлт) — хоёр дэлгэц зөрсөн мэт харагдахаа болино. */}
          <div className="text-[12px] text-t3 tabular-nums mt-0.5">
            Тохирсон сарын төлөлт: {money(monthlyPlanned)}
          </div>
          <div className="mt-2"><span className="pill-red">сар бүр</span></div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хоцорсон</div>
          <div className={`text-[26px] font-extrabold tabular-nums leading-tight ${
            overdueCount ? "text-danger" : "text-money"}`}>{overdueCount}</div>
          <div className="mt-2">
            <span className={overdueCount ? "pill-red" : "pill-green"}>{overdueHeroText(overdueCount)}</span>
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[12.5px] text-t2 font-medium mb-2">Хамгийн ойрын төлөлт</div>
          {s.upcoming[0] ? (
            <>
              <div className="text-[26px] font-extrabold text-ink tabular-nums leading-tight"
                   title={money(s.upcoming[0].amount)}>{sayaFmt(s.upcoming[0].amount)}₮</div>
              {exactBelow(sayaFmt(s.upcoming[0].amount) + "₮", money(s.upcoming[0].amount)) && (
                <div className="text-[12px] text-t2 tabular-nums mt-0.5">{money(s.upcoming[0].amount)}</div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="pill-amber">{s.upcoming[0].due} · {s.upcoming[0].name}</span>
                {/* Тохирсон дүн үү, эсвэл зөвхөн сарын хүү үү — тоо нь ЮУ болохыг хэлнэ */}
                <span className="pill-grey">{s.upcoming[0].planned ? "тохирсон төлөлт" : "сарын хүү"}</span>
              </div>
            </>
          ) : <div className="text-t3">—</div>}
        </div>
      </div>

      {/* ХОЁР ЖИЛИЙН ЗЭРЭГЦЭЭ ТОО НЭГ МӨРӨНД БАГТАНА.
          Өмнө нь есөн багана (1020px) байсны дөрөв нь ойролцоо утгатай:
          «Хүү %/сар · Сарын хүү · Сарын төлөлт · Төлсөн хүү». Мөр бүр 124–160px
          өндөр болж (нэр гурван мөр, огноо гурван мөр нугалаад) Отгоогийн
          1366×768 дэлгэцэнд хоёр хагас зээл багтдаг байв.
            · Хүүгийн ХУВЬ нь бодогдсон Сарын хүүгийнхээ дэргэд нэг нүдэнд орлоо
              («4.8 сая₮ 1.6%/сар») — тоо ба түүнийг гаргасан хувь зэрэгцэнэ.
            · Төлсөн хүү, Эхэлсэн огноо нь ХУРИМТЛАЛ/ЛАВЛАГАА болохоос өдөр
              тутмын шийдвэрийн тоо биш — мөрөө задлахад доор гарна.
          Мөр бүр НЭГ мөр өндөртэй: 36px (хүрэх талбайн доод шат) + 2×14px. */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead><tr>
            <DisclosureHead />
            <th className="th">Зээлдүүлэгч</th><th className="th text-right">Үндсэн дүн</th>
            <th className="th text-right">Үлдэгдэл</th>
            <th className="th text-right">Сарын хүү</th><th className="th text-right">Сарын төлөлт</th>
            <th className="th">Дараагийн</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {d.loans.map((l: any) => {
              const isOpen = open === l.id;
              const pid = panelId("loan", l.id);
              return (
              <Fragment key={l.id}>
                {/* Мөр задардаг гэдгийг ЮУ Ч хэлдэггүй байв — мөрийн хамгийн ил
                    зогсоол нь зээлдүүлэгчийн нэрэн дээрх ✎ засвар байсан тул
                    Отгоо түүнийг мөрийн үйлдэл гэж ойлгоно. Одоо тэмдэг мөрийн
                    эхэнд, өөрийн баганадаа (бүх хүснэгттэй нэг хэлбэр). */}
                <tr className="cursor-pointer hover:bg-canvas transition"
                    {...disclosureProps(isOpen, pid)}
                    {...rowClickProps(() => setOpen(isOpen ? null : l.id),
                                      `${l.name} — төлөлтийн түүхийг ${isOpen ? "хаах" : "нээх"}`,
                                      "row")}>
                  <DisclosureCell open={isOpen} />
                  {/* ⚠ МӨРИЙН ТОВШИЛТ — НЭГ ЖУРАМ. Урьд нь InlineEdit-тэй нүд
                      БҮХЭЛДЭЭ (нүдний хоосон талбай ч оруулаад) товшилтыг
                      залгидаг байв: Отгоо мөрийн зүүн хагаст дарвал задарч,
                      баруун хагаст дарвал ЮУ Ч БОЛОХГҮЙ. Одоо зөвхөн засварын
                      ЗОГСООЛ өөрөө залгина (`InlineEdit` дотроо `stopPropagation`
                      хийдэг) — нүдний бусад хэсэг мөртэйгөө хамт задарна. */}
                  <td className="td whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <InlineEdit label="Зээлдүүлэгч" value={l.name} width="w-44" confirmText="Нэр солих уу?"
                        onSave={(v) => doPatch(`/api/loans/${l.id}`, { name: v }, "Нэр шинэчлэгдлээ")} />
                      {l.status === "closed" && <span className="pill-grey">хаагдсан</span>}
                    </span>
                  </td>
                  <td className="td text-right tabular-nums whitespace-nowrap" title={money(l.principal)}>
                    {/* Мөрийн зогсоол бүр ЯМАР зээлийнх болохоо өөрөө үүрнэ —
                        «Үндсэн дүн: 250 сая₮ · засах» олон мөрөнд ижилхэн дуудагдана. */}
                    <InlineEdit type="number" label={`${l.name} — үндсэн дүн`} value={l.principal} display={sayaFmt(l.principal) + "₮"}
                      width="w-28" right confirmText="Үндсэн дүн солих уу?"
                      onSave={(v) => doPatch(`/api/loans/${l.id}`,
                        { principal: parseMoney(v) },
                        "Үндсэн дүн шинэчлэгдлээ — үлдэгдэл, сарын төлбөр дагаж өөрчлөгдөнө")} />
                  </td>
                  <td className="td text-right tabular-nums font-bold text-ink whitespace-nowrap" title={money(l.balance)}>
                    {sayaFmt(l.balance)}₮
                    {/* Үлдэгдэл нь үндсэн дүнгээс их байвал ЯАГААД гэдгийг мөр дээрээ хэлнэ */}
                    {l.topup_total > 0 && (
                      <span className="block text-[11.5px] font-medium text-warn"
                            title={`Нэмэлт олголт: ${money(l.topup_total)}`}>
                        +{sayaFmt(l.topup_total)}₮ олголт
                      </span>
                    )}
                  </td>
                  {/* Бодогдсон сарын хүү + түүнийг гаргасан ХУВЬ — нэг нүдэнд.
                      Тоо нь бодогддог, хувь нь засагдана: аль нь аль болохыг
                      хэмжээ, өнгө хоёр хэлнэ. */}
                  <td className="td text-right tabular-nums whitespace-nowrap" title={money(l.monthly_due)}>
                    <span className="inline-flex items-center gap-2">
                      <b className="font-bold text-danger">{sayaFmt(l.monthly_due)}₮</b>
                      <span className="text-[12px] text-t3 font-medium">
                        <InlineEdit type="number" label={`${l.name} — хүүгийн хувь`} value={l.monthly_rate} suffix="%/сар"
                          width="w-16" right confirmText="Хүү солих уу?"
                          onSave={(v) => doPatch(`/api/loans/${l.id}`, { monthly_rate: parseMoney(v) },
                            "Хүү шинэчлэгдлээ — сарын хүү дагаж өөрчлөгдөнө")} />
                      </span>
                    </span>
                  </td>
                  {/* Гэрээгээр тохирсон сарын төлөлт — бодогддог хүүгээс ТУСДАА тоо */}
                  <td className="td text-right tabular-nums whitespace-nowrap"
                      title={l.monthly_payment ? money(l.monthly_payment) : "Гэрээгээр тохирсон сарын төлөлт"}>
                    <InlineEdit type="number" label={`${l.name} — сарын төлөлт`} value={l.monthly_payment || ""}
                      display={l.monthly_payment ? sayaFmt(l.monthly_payment) + "₮" : "тохироогүй"}
                      width="w-28" right confirmText="Сарын төлөлт хадгалах уу?"
                      onSave={(v) => doPatch(`/api/loans/${l.id}`, { monthly_payment: parseMoney(v) },
                        "Сарын төлөлт шинэчлэгдлээ — ойрын төлөлт үүгээр харагдана")} />
                  </td>
                  {/* ХОЦРОЛТ нь МӨРӨН ДЭЭР зогсоно. Сервер `overdue`,
                      `days_late`, `due_day` гурвыг өгдөг мөртөө дэлгэц дээр
                      ЮУ Ч гардаггүй байв: «энэ сарынх төлөгдсөн үү» гэсэн
                      асуулт нь төлөлтийн түүхийг задалж, огноог нүдээр
                      тулгахаас өөр хариугүй. Улаан нь §4-ийн «хэтэрсэн»
                      шат — үг нь дэргэдээ (өнгө дангаараа утга зөөхгүй). */}
                  {/* ⚠ ӨРГӨН нь ХАТУУ ТӨСӨВТЭЙ. Энэ хүснэгт 1366×768 дээр 1,018px-д
                      багтдаг ба «Төлөлт хоцорсон · 12 хоног» гэсэн бүтэн өгүүлбэр
                      нэг мөрөнд 175px эзэлдэг — тэр 64px-ээр халиж, мөрийн
                      «Төлөлт» ба «+ Олголт» товчнууд гүйлтийн ард үлдэнэ
                      (`her/fits-her-screen.spec.ts` — Отгоо хажуу тийш гүйлгэдэггүй).
                      Тиймээс өгүүлбэр нь БҮТЭН хэвээр, зөвхөн ХОЁР МӨР болж эвхэгдэнэ. */}
                  <td className="td align-top max-w-[116px]">
                    {l.status !== "active" ? <span className="pill-grey">—</span>
                     : isOverdue(l) ? (
                       <>
                         <span className="pill-red !inline-block !whitespace-normal max-w-[104px]
                                          leading-[1.35]">{overdueText(l.days_late)}</span>
                         <span className="block text-[11.5px] text-t3 tabular-nums mt-0.5
                                          max-w-[104px] leading-tight">
                           {l.due_day}-нд төлөх байсан
                         </span>
                       </>
                     ) : <span className="pill-amber">{l.next_due}</span>}
                  </td>
                  <td className="td whitespace-nowrap">
                    {l.status === "active" && (
                      <span className="flex items-center gap-1 justify-end">
                        <button className="btn-ghost btn-row text-money"
                                aria-label={`${l.name} — төлөлт бүртгэх`}
                                onClick={(e) => { e.stopPropagation(); setModal({ kind: "pay", loan: l }); }}>Төлөлт</button>
                        <button className="btn-ghost btn-row"
                                aria-label={`${l.name} — нэмэлт олголт бүртгэх`}
                                onClick={(e) => { e.stopPropagation(); setModal({ kind: "topup", loan: l }); }}>+ Олголт</button>
                      </span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr id={pid}><td colSpan={8} className="td !bg-canvas">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap"
                           onClick={(e) => e.stopPropagation()}>
                        {/* Мөрөөс буусан лавлагаа: төрөл (нэр нь ихэвчлэн өөрөө
                            хэлдэг), хэзээ эхэлсэн, хүүд өнөөдрийг хүртэл хэдийг
                            өгсөн. Гурвуулаа засагдах хэвээр. */}
                        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-[13px]">
                          {/* Харагдах нэр нь ХАРЦНЫХ; уншигчид талбарын нэрийг
                              InlineEdit-ийн `label` аль хэдийн хэлж байгаа тул
                              давхар зарлахгүй (aria-hidden). */}
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3" aria-hidden="true">Төрөл:</span>
                            <InlineEdit label={`${l.name} — төрөл`} value={l.kind} display={kindLabel(l.kind)} width="w-24"
                              options={[["bank", "Банк"], ["private", "Хувь"], ["credit", "Кредит"]]}
                              confirmText="Төрөл солих уу?"
                              onSave={(v) => doPatch(`/api/loans/${l.id}`, { kind: v }, "Төрөл шинэчлэгдлээ")} />
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3" aria-hidden="true">Эхэлсэн:</span>
                            <InlineEdit type="date" label={`${l.name} — эхэлсэн огноо`} value={l.start_date}
                              display={l.start_date} width="w-36" confirmText="Огноо солих уу?"
                              onSave={(v) => doPatch(`/api/loans/${l.id}`, { start_date: v }, "Эхэлсэн огноо шинэчлэгдлээ")} />
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3">Төлсөн хүү:</span>
                            <b className="tabular-nums text-ink" title={money(l.interest_paid)}>
                              {sayaFmt(l.interest_paid)}₮
                            </b>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-t3" aria-hidden="true">Тэмдэглэл:</span>
                            <InlineEdit label={`${l.name} — тэмдэглэл`} value={l.note} display={l.note || "нэмэх…"} width="w-72"
                              confirmText="Хадгалах уу?"
                              onSave={(v) => doPatch(`/api/loans/${l.id}`, { note: v }, "Тэмдэглэл шинэчлэгдлээ")} />
                          </span>
                        </div>
                        <button className="btn-ghost btn-row"
                                aria-label={`${l.name} — зээлийг ${l.status === "active" ? "хаах" : "сэргээх"}`}
                                onClick={() => setAsk({ kind: "status", loan: l })}>
                          {l.status === "active" ? "Хаах" : "Сэргээх"}
                        </button>
                      </div>
                      {l.payments.length === 0 ? <span className="text-t3 text-[13px]">Төлөлт бүртгэгдээгүй.</span> : (
                        <div className="flex flex-col gap-1.5">
                          {l.payments.map((p: any) => {
                            /* Дөрвөн зогсоол дараалан «2026-03-01 · засах»,
                               «450,000₮ · засах» гэж дуудагдвал уншигчаар
                               ажилладаг хүн ЮУГ, ХААНААС засаж байгаагаа
                               мэдэхгүй — мөр бүр зээлээ ба огноогоо үүрнэ. */
                            const row = `${l.name} · ${p.date}`;
                            return (
                            <div key={p.id} className="flex items-center gap-3 text-[13px]"
                                 onClick={(e) => e.stopPropagation()}>
                              <InlineEdit type="date" label={`${row} — огноо`} value={p.date} display={p.date} width="w-32"
                                confirmText="Огноо солих уу?"
                                onSave={(v) => savePay(l, p, { date: v })} />
                              {/* Олголт нь ТӨЛӨЛТ БИШ — тэмдэг ба өнгөөр нь тусад нь ялгана */}
                              <span className={p.part === "topup" ? "text-warn font-semibold" : ""}>
                                <InlineEdit type="number" right
                                  label={`${row} — ${p.part === "topup" ? "олголтын дүн" : "төлөлтийн дүн"}`} value={p.amount}
                                  display={partSign(p.part) + money(p.amount)} width="w-28"
                                  confirmText="Дүн солих уу?"
                                  onSave={(v) => savePay(l, p, { amount: parseMoney(v) })} />
                              </span>
                              <InlineEdit label={`${row} — мөрийн төрөл`} value={p.part}
                                display={partLabel(p.part)}
                                options={[["interest", "Хүү"], ["principal", "Үндсэн"], ["topup", "Нэмэлт олголт"]]}
                                width="w-32"
                                confirmText="Төрөл солих уу?"
                                onSave={(v) => savePay(l, p, { part: v })} />
                              <InlineEdit label={`${row} — ${p.part === "topup" ? "олголтын тэмдэглэл" : "төлөлтийн тэмдэглэл"}`}
                                value={p.note}
                                display={p.note || "тэмдэглэл…"} width="w-40"
                                confirmText="Хадгалах уу?"
                                onSave={(v) => savePay(l, p, { note: v })} />
                              {/* 28px байсан — docs/UI-ЗАРЧИМ.md §4: дарагддаг юм
                                  36px-ээс намхан БАЙХГҮЙ (--target-sm) */}
                              <button className="w-9 h-9 rounded-lg bg-danger-50 text-danger shrink-0 ml-auto"
                                      title="Устгах"
                                      aria-label={`${row} · ${partLabel(p.part)} — устгах`}
                                      onClick={() => setAsk({ kind: "del", loan: l, payment: p })}>✕</button>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </td></tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        {d.loans.length === 0 && <Empty title="Зээл алга" />}
      </div>

      {/* Цонх хаагдана → ЗУРВАС үлдэнэ → хуудас дахин уншина (гэрээ ба
          харилцагчийн хуудсанд байдаг `finish` загвар). */}
      {modal?.kind === "pay" && (
        <PayLoanModal l={modal.loan} onClose={() => setModal(null)}
                      onDone={(o?: Outcome) => { setModal(null); announce(o); load(); }} />
      )}
      {modal?.kind === "topup" && (
        <TopUpModal l={modal.loan} onClose={() => setModal(null)}
                    onDone={(o?: Outcome) => { setModal(null); announce(o); load(); }} />
      )}
      {modal?.kind === "add" && (
        <AddLoanModal onClose={() => setModal(null)}
                      onDone={(o?: Outcome) => { setModal(null); announce(o); load(); }} />
      )}

      {ask?.kind === "del" && (
        <ConfirmModal
          title={ask.payment.part === "topup" ? "Нэмэлт олголт устгах" : "Төлөлт устгах"}
          intro={<><b className="text-ink">{ask.loan.name}</b> — устгасан бичилт сэргэхгүй. Зээлийн
                  үлдэгдэл, төлсөн хүү дагаж дахин бодогдоно.</>}
          rows={[
            { label: "Огноо", value: ask.payment.date },
            { label: ask.payment.part === "interest" ? "Хүүгийн төлөлт"
                     : ask.payment.part === "topup" ? "Нэмэлт олголт" : "Үндсэн төлөлт",
              value: partSign(ask.payment.part) + money(ask.payment.amount), accent: "danger" },
          ]}
          total={{ label: "Устгасны дараа үлдэгдэл",
                   value: sayaFmt(balanceAfterRemoving(ask.loan.balance, ask.payment.part,
                                                       ask.payment.amount)) + "₮" }}
          confirmLabel="Устгах" danger
          onClose={() => setAsk(null)}
          onConfirm={() => delPay(ask.loan, ask.payment)} />
      )}
      {ask?.kind === "status" && (() => {
        const closing = ask.loan.status === "active";
        return (
          <ConfirmModal
            title={closing ? "Зээл хаах" : "Зээл сэргээх"}
            intro={<><b className="text-ink">{ask.loan.name}</b> — {closing
              ? "хаасны дараа сарын хүүгийн дарамт болон ойрын төлөлтөөс хасагдана."
              : "сэргээсний дараа сарын хүү дахин тооцогдож эхэлнэ."}</>}
            rows={[
              { label: "Үлдэгдэл", value: sayaFmt(ask.loan.balance) + "₮" },
              { label: `Сарын хүү (${ask.loan.monthly_rate}%)`, value: money(ask.loan.monthly_due),
                accent: closing ? "money" : "danger" },
            ]}
            total={{ label: closing ? "Сарын дарамтаас хасагдана" : "Сарын дарамтад нэмэгдэнэ",
                     value: (closing ? "−" : "+") + money(ask.loan.monthly_due),
                     accent: closing ? "money" : "danger" }}
            confirmLabel={closing ? "Хаах" : "Сэргээх"} danger={closing}
            onClose={() => setAsk(null)}
            onConfirm={() => toggleStatus(ask.loan)} />
        );
      })()}
    </div>
  );
}

function PayLoanModal({ l, onClose, onDone }: any) {
  const toast = useToast();
  // Санал болгосон сарын хүү = ЭХНИЙ утга. Түүнийг хөндөөгүй бол алдах юм алга.
  const f0 = { date: today(), amount: String(l.monthly_due), part: "interest", note: "" };
  const [f, setF] = useState(f0);
  const amt = parseMoney(f.amount);
  const uid = useId();
  const after = balanceAfterPay(l.balance, f.part, amt);
  /* ЮУ БОЛОХЫГ ХАДГАЛАХЫН ӨМНӨ. Баримт нь гүйлтийн ГАДНА, гол товчны
     дэргэд зогсоно: Отгоо «Бүртгэх» дарахын өмнө «үлдэгдэл 2.04 тэрбум →
     2.03 тэрбум» гэсэн хоёр тоог нэг харцаар хардаг. */
  const receipt = amt > 0 ? (
    f.part === "principal" ? (
      <Receipt className="mb-3"
        rows={[
          { label: "Одоогийн үлдэгдэл", value: money(l.balance) },
          { label: "Үндсэн төлбөр", value: "−" + money(amt), accent: "money" },
          { label: "Шинэ сарын хүү", value: money(after * l.monthly_rate / 100), accent: "money" },
        ]}
        total={{ label: "Үлдэгдэл", value: `${sayaFmt(l.balance)}₮ → ${sayaFmt(after)}₮` }} />
    ) : (
      /* Хүү нь ҮЛДЭГДЛИЙГ хөндөхгүй — «X → X» гэсэн хоёр ижил тоо зурвал
         Отгоо «аль нь үнэн бэ» гэж асууна. Тиймээс энд ганц мөр. */
      <Receipt className="mb-3"
        rows={[
          { label: `Сарын хүү (${l.monthly_rate}% × үлдэгдэл)`, value: money(l.monthly_due), accent: "dim" },
          { label: "Үлдэгдэл өөрчлөгдөхгүй", value: sayaFmt(l.balance) + "₮", accent: "dim" },
        ]}
        total={{ label: "Төлөх хүү", value: money(amt) }} />
    )
  ) : null;
  return (
    <FormModal title={`Төлөлт — ${l.name}`} onClose={onClose} dirty={formDirty(f0, f)}
               footer={
                 <>
                   {receipt}
                   <div className="flex justify-end gap-2.5">
                     <button className="btn-secondary" onClick={onClose}>Болих</button>
                     <SubmitButton className="btn-primary !bg-money" disabled={!amt} onSubmit={async () => {
                       try {
                         /* Хариу нь ЗЭЭЛИЙН шинэ байдал (`closed: true` бол
                            сервер зээлийг автоматаар хаасан) — тэр шийдвэрийг
                            зурвас үүрч гарна. */
                         const r = await api(`/api/loans/${l.id}/payments`, { method: "POST",
                           body: JSON.stringify({ date: f.date, amount: amt, part: f.part, note: f.note }) });
                         toast("Төлөлт бүртгэгдлээ");
                         onDone(loanPayOutcome({
                           name: l.name, amount: amt, part: f.part as any, date: f.date,
                           before: l.balance, after: Number(r?.balance ?? after),
                           closed: !!r?.closed }));
                       } catch (e: any) { toast(e.message, "err"); }
                     }}>Бүртгэх</SubmitButton>
                   </div>
                 </>}>
      {/* Хүү/Үндсэн дүн нь ЮУГ төлж байгааг сонгодог — бүлгээ нэрлэнэ */}
      <div className="lbl" id={`${uid}-part`}>Юуг төлөх вэ</div>
      <div className="flex gap-2 mb-4" role="group" aria-labelledby={`${uid}-part`}>
        {[["interest", "Хүү"], ["principal", "Үндсэн дүн"]].map(([v, lb]) => (
          <button key={v} aria-pressed={f.part === v}
            onClick={() => setF({ ...f, part: v, amount: v === "interest" ? String(l.monthly_due) : "" })}
            className={`flex-1 rounded-[10px] border py-2.5 font-semibold text-sm min-h-11 transition ${
              f.part === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amt`}>Дүн ₮</label>
          <input id={`${uid}-amt`} className="inp" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      {/* Хүү нь ҮЛДЭГДЛИЙГ хөндөхгүй гэдгийг цонх өөрөө хэлнэ (баримт нь
          «→» -гүй хоёр ижил тоо зурахгүйн тулд доод мөрөнд). */}
      {amt > 0 && f.part === "interest" && (
        <p className="text-[12.5px] text-t3 mt-3.5">
          Хүүгийн төлөлт үндсэн үлдэгдлийг бууруулахгүй — үлдэгдэл {money(l.balance)} хэвээр.
        </p>
      )}
    </FormModal>
  );
}

/** Нэмэлт олголт — НЭГ гэрээн дээр дахин авсан мөнгө. Төлөлт биш тул үлдэгдэл
 *  ӨСНӨ, сарын хүү нь өссөн үлдэгдлээрээ дараагийн сараас бодогдоно. */
function TopUpModal({ l, onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { date: today(), amount: "", note: "" };
  const [f, setF] = useState(f0);
  const amt = parseMoney(f.amount);
  const uid = useId();
  return (
    <FormModal title={`Нэмэлт олголт — ${l.name}`} onClose={onClose} dirty={formDirty(f0, f)}>
      <p className="text-[13px] text-t2 mb-3.5">
        Энэ гэрээгээр ДАХИН авсан мөнгө. Үлдэгдэлд нэмэгдэж, сарын хүү шинэ үлдэгдлээр бодогдоно.
      </p>
      <div className="grid grid-cols-2 gap-3.5">
        <div><label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
          <input id={`${uid}-date`} type="date" className="inp" value={f.date}
                 onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-amt`}>Олгосон дүн ₮</label>
          <input id={`${uid}-amt`} className="inp" inputMode="numeric" autoFocus value={f.amount}
                 onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="mt-3.5"><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" value={f.note} placeholder="ж: 2 дахь олголт"
               onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      {amt > 0 && (
        <div className="mt-3.5">
          <Receipt
            rows={[
              { label: "Одоогийн үлдэгдэл", value: money(l.balance) },
              { label: "Нэмэлт олголт", value: "+" + money(amt), accent: "danger" },
              { label: `Шинэ сарын хүү (${l.monthly_rate}%)`,
                value: money((l.balance + amt) * l.monthly_rate / 100), accent: "danger" },
            ]}
            total={{ label: "Шинэ үлдэгдэл", value: money(l.balance + amt) }} />
        </div>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!amt} onSubmit={async () => {
          try {
            const r = await api(`/api/loans/${l.id}/payments`, { method: "POST",
              body: JSON.stringify({ date: f.date, amount: amt, part: "topup", note: f.note }) });
            toast("Нэмэлт олголт бүртгэгдлээ — үлдэгдэл нэмэгдлээ");
            onDone(loanPayOutcome({ name: l.name, amount: amt, part: "topup", date: f.date,
                                    before: l.balance,
                                    after: Number(r?.balance ?? l.balance + amt) }));
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

function AddLoanModal({ onClose, onDone }: any) {
  const toast = useToast();
  const f0 = { name: "", kind: "bank", principal: "", monthly_rate: "", start_date: today(),
               monthly_payment: "", note: "" };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    <FormModal title="Шинэ зээл бүртгэх" onClose={onClose} dirty={formDirty(f0, f)}>
      <label className="lbl" htmlFor={`${uid}-name`}>Зээлдүүлэгч *</label>
      <input id={`${uid}-name`} className="inp mb-3.5" value={f.name} placeholder="ж: Хаан банк — шугам №3" autoFocus
             onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="lbl" id={`${uid}-kind`}>Зээлийн төрөл</div>
      <div className="flex gap-2 mb-3.5" role="group" aria-labelledby={`${uid}-kind`}>
        {[["bank", "Банк"], ["private", "Хувь хүн"], ["credit", "Кредит"]].map(([v, lb]) => (
          <button key={v} onClick={() => setF({ ...f, kind: v })} aria-pressed={f.kind === v}
            className={`flex-1 rounded-[10px] border py-2 font-semibold text-[13px] min-h-10 transition ${
              f.kind === v ? "border-brand bg-brand-50 text-brand-ink" : "border-line-strong text-t2"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
        <div><label className="lbl" htmlFor={`${uid}-principal`}>Үндсэн дүн ₮ *</label>
          <input id={`${uid}-principal`} className="inp" inputMode="numeric" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-rate`}>Сарын хүү % *</label>
          <input id={`${uid}-rate`} className="inp" inputMode="decimal" value={f.monthly_rate} onChange={(e) => setF({ ...f, monthly_rate: e.target.value })} /></div>
        <div><label className="lbl" htmlFor={`${uid}-start`}>Эхэлсэн огноо</label>
          <input id={`${uid}-start`} type="date" className="inp" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        <div><label className="lbl" htmlFor={`${uid}-mpay`}>Сарын төлөлт ₮</label>
          <input id={`${uid}-mpay`} className="inp" inputMode="numeric" value={f.monthly_payment}
                 placeholder="тохирсон бол" onChange={(e) => setF({ ...f, monthly_payment: e.target.value })} />
          <span className="block text-[12px] text-t3 mt-1">Хоосон бол ойрын төлөлтөд сарын хүү харагдана</span></div>
        <div><label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
          <input id={`${uid}-note`} className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim() || !parseMoney(f.principal)} onSubmit={async () => {
          try {
            await api("/api/loans", { method: "POST", body: JSON.stringify({
              ...f, principal: parseMoney(f.principal), monthly_rate: parseMoney(f.monthly_rate),
              monthly_payment: parseMoney(f.monthly_payment) }) });
            toast("Зээл бүртгэгдлээ");
            onDone(loanAddedOutcome(f.name, parseMoney(f.principal), parseMoney(f.monthly_rate)));
          } catch (e: any) { toast(e.message, "err"); }
        }}>Бүртгэх</SubmitButton>
      </div>
    </FormModal>
  );
}

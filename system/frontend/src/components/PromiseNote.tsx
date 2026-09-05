import { useId, useState } from "react";
import { api, money } from "../api";
import { FormModal, SubmitButton, useToast } from "../ui";
import { formDirty } from "../lib/dirty";
import { parseMoney } from "../lib/num";
import { contactRolePill, preferredContact, telHref, type Contact } from "../lib/contact";
import { PROMISE_KINDS, promiseHead, promiseKindLabel, promiseLine, promiseState,
         type CollectionNote } from "../lib/promise";
import { promiseOutcome, type Outcome } from "../lib/outcome";
import { UNCHARGED } from "../lib/penalty";
import { uninvoicedLine } from "../lib/receivable";
import { todayIso } from "../lib/schedule";

/* АМЛАЛТ · ХОЛБОО БАРЬСАН ТҮҮХ — ХОЁР ДЭЛГЭЦИЙН НЭГ ДЭВТЭР.
 *
 * «Даваа гарагт 5 сая шилжүүлнэ» гэсэн мөрийг Отгоо эгч «Авлага цуглуулах»
 * дээрээс бичдэг. Сервер түүнийг харилцагчийн профайлын хариунд ч илгээдэг
 * атал хуудас нь ЗУРДАГГҮЙ байв: тэр харилцагчийн хуудас нээгээд «энэ хүн юу
 * гэж байсан билээ» гэдгээ мэдэхийн тулд өөр дэлгэц рүү явна.
 *
 * Цонх нь `Collections.tsx`-ээс ЯГ хэвээрээ нүүсэн (нэг цонх хоёр газарт
 * хоёр өөр асуулт болж салахгүй). Ганц ялгаа: `overdue` нь СОНГОЛТ болов —
 * харилцагчийн профайл дээр «хугацаа хэтэрсэн дүн» гэсэн ТОО байхгүй
 * (тэнд `overdue` нь туг), тул тэр мөр огт гарахгүй.
 */

/** Цонх ба самбарын хамтын оролт — хоёр хуудас өөр өөрийн хариунаас зурна. */
export type PromiseTarget = {
  clientId: number;
  client: string;
  /** Хугацаа хэтэрсэн ДҮН — зөвхөн «Авлага цуглуулах» мэднэ. */
  overdue?: number | null;
  balance: number;
  balanceUninvoiced?: number;
  penaltyBooked?: number;
  penaltyUnbooked?: number;
  contacts?: Contact[] | null;
  person?: string;
  phone?: string;
};

export function PromiseNoteModal({ t, onClose, onDone }: {
  t: PromiseTarget;
  onClose: () => void;
  /** Хийгдсэн зүйлээ ЗУРВАС болгож дамжуулна (`lib/outcome.ts`). */
  onDone: (o?: Outcome) => void;
}) {
  const toast = useToast();
  const f0 = { date: todayIso(), kind: "call", note: "",
               promise_date: "", promise_amount: "" };
  const [f, setF] = useState(f0);
  const uid = useId();
  return (
    /* Ярианы тэмдэглэл нь дахин сэргээгдэхгүй мэдээлэл — залгасны дараа
       санамсаргүй товшилтод алдагдвал дахин залгах шаардлагатай болно. */
    <FormModal title={`Тэмдэглэл — ${t.client}`} onClose={onClose} dirty={formDirty(f0, f)}
      footer={
        <div className="flex justify-end gap-2.5">
          <button className="btn-secondary" onClick={onClose}>Болих</button>
          <SubmitButton disabled={!f.note.trim()} onSubmit={async () => {
            try {
              const amount = parseMoney(f.promise_amount);
              const r = await api(`/api/clients/${t.clientId}/notes`, {
                method: "POST", body: JSON.stringify({
                  date: f.date, kind: f.kind, note: f.note,
                  promise_date: f.promise_date || null,
                  promise_amount: amount }) });
              toast("Тэмдэглэл хадгалагдлаа");
              onDone(promiseOutcome({
                date: f.date, kindLabel: promiseKindLabel(f.kind), note: f.note,
                promiseDate: f.promise_date || undefined, promiseAmount: amount,
                noteId: r?.id }));
            } catch (e: any) { toast(e.message, "err"); }
          }}>Хадгалах</SubmitButton>
        </div>}>
      <div className="bg-sunken rounded-lg px-3.5 py-2.5 mb-4 text-[13px] text-t2">
        {/* «Хэтэрсэн» нь ЗӨВХӨН залгах жагсаалтын тоо — профайл дээр байхгүй */}
        {t.overdue !== undefined && t.overdue !== null && (
          <>Хэтэрсэн <b className="text-danger tabular-nums">{money(t.overdue)}</b>{" · "}</>
        )}
        {/* Утсаар ярихад бүтэн авлага нь хэрэгтэй: «нийт X, үүнээс Y нь
            хугацаа хэтэрсэн» — хоёр тоо хоёулаа энд, дэлгэцтэйгээ ижил. */}
        авлага <b className="tabular-nums text-ink">{money(t.balance)}</b>
        {(t.balanceUninvoiced || 0) > 0 && (
          <> (<span className="tabular-nums">{uninvoicedLine(t.balanceUninvoiced!)}</span>)</>)}
        {(t.penaltyBooked || 0) > 0 && (
          <> · нэхэгдсэн алданги <b className="tabular-nums">{money(t.penaltyBooked!)}</b></>)}
        {(t.penaltyUnbooked || 0) > 0 && (
          <> · тооцоолол <b className="tabular-nums text-t3">≈{money(t.penaltyUnbooked!)}</b>{" "}
            ({UNCHARGED})</>)}
        {/* Залгах хүн нь мөрөн дээрхтэй ЯГ ижил дүрмээр (`lib/contact.ts`) —
            цонх өөр дугаар үзүүлбэл аль нь зөв бэ гэсэн асуулт төрнө. */}
        {(() => {
          const pick = preferredContact(t.contacts);
          const who = pick?.name || t.person;
          const phone = pick?.phone || t.phone;
          return phone ? (
            <> · {who ? `${who} · ` : ""}
              <a href={telHref(phone)} title={`${phone} руу залгах`}
                 className="font-bold text-ink hover:text-brand-ink hover:underline">☎ {phone}</a>
            </>
          ) : null;
        })()}
      </div>

      {/* Товчны бүлэг — ганц талбар биш тул `label` биш, нэрлэсэн бүлэг */}
      <div className="lbl" id={`${uid}-kind`}>Хэлбэр</div>
      <div className="flex gap-2 mb-3.5 flex-wrap" role="group" aria-labelledby={`${uid}-kind`}>
        {PROMISE_KINDS.map(([v, l]) => (
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
    </FormModal>
  );
}

/* ---------- Профайл дээрх самбар ---------- */

/** «Амлалт · холбоо барьсан түүх» — харилцагчийн хуудасны баруун багана.
 *
 *  Мөр бүр: ХЭЗЭЭ · ямар хэлбэрээр · ХЭН бичсэн / юу ярьсан / амлалт нь
 *  хэзээ хэдээр, ямар төлөвтэй. Түүх хоосон бол «залгаагүй» гэдгээ өөрөө
 *  хэлнэ — хоосон газар нь ажил ЭХЛЭХ цэг. */
export function PromisePanel({ notes, today, canWrite, onAdd, freshMark }: {
  notes: CollectionNote[] | null | undefined;
  today: string;
  canWrite: boolean;
  onAdd: () => void;
  /** Дөнгөж бичигдсэн мөрийн түлхүүр («note-11») — нүдэнд өөрөө оочихно. */
  freshMark?: string | null;
}) {
  const rows = notes || [];
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <h2 className="font-bold text-[14.5px]">Амлалт · холбоо барьсан түүх</h2>
        {canWrite && (
          <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[12.5px]"
                  onClick={onAdd}>+ Амлалт бичих</button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-t3 text-[13px]">
          Энэ харилцагчтай холбогдсон тэмдэглэл алга. Залгасан, амласан бүрээ
          энд үлдээвэл дараагийн удаа юу ярьсныг хайх шаардлагагүй.
        </p>
      ) : rows.map((n) => {
        const st = promiseState(n, today);
        const line = promiseLine(n, money);
        return (
          <div key={n.id}
               className={`py-2.5 border-b border-sunken last:border-0 ${
                 freshMark === `note-${n.id}` ? "row-fresh" : ""}`}>
            <div className="flex items-start justify-between gap-2.5 flex-wrap">
              <b className="text-[12.5px] text-t2 font-semibold">{promiseHead(n)}</b>
              {/* Өнгө дангаараа утга зөөхгүй — төлвийн ҮГ пилийн дотор */}
              {st && <span className={st.cls}>{st.label}</span>}
            </div>
            <span className="block text-[13px] text-ink">{n.note}</span>
            {line && (
              <span className="block text-[12.5px] text-t2 tabular-nums">
                Амласан: {line}
              </span>)}
          </div>
        );
      })}
    </div>
  );
}

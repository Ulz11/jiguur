import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { Chevron, ConfirmModal, FormModal, SubmitButton, useToast } from "../ui";
import { disclosureProps, panelId } from "../lib/disclosure";
import { formDirty } from "../lib/dirty";
import { orderNotes, noteSummary, type Note } from "../lib/note";
import { todayIso } from "../lib/schedule";
import { isVoided, voidRowClass, voidTitle } from "../lib/void";
import { VoidButton } from "./VoidPayment";

/* ЗАХЫН ТЭМДЭГЛЭЛИЙН ЗУРВАС — Отгоо эгчийн шийдвэрүүд мөр мөрөөрөө (P1-22).
 *
 * Түүний хуудсан дээр «7.06нд тооцов», «нөат шивсэн», «ирээгүй», «хаав» гэсэн
 * үгс тооны ХАЖУУД сууж, ШАР дүүргэлт нь «энэ рүү эргэж хар» гэж хэлдэг.
 * Систем дээр тэдгээрийн байр нь ГАНЦ Text талбар байсан тул гурав нь нэгэнд
 * нурж, огноогүй, зохиогчгүй болдог байв (№112 LOSSY).
 *
 * Зурвас нь ГЭРИЙН задаргааны хэлбэрээр (`Chevron` + `aria-expanded` +
 * нээлттэй үедээ `aria-controls`) — гэрээ, харилцагч, хөдөлгөөн ГУРВУУЛАА
 * ижил дүрсээр. Тугтай мөр байвал өөрөө задарна: тэр «дэлгэц дээрх зүйлийг
 * анзаардаггүй» тул нуугдсан ⚑ нь тугны утгыг устгана.
 */

export type NoteEntity = "client" | "contract" | "invoice" | "movement" | "material";

export function NotesStrip({ entityType, entityId, canWrite, compact }: {
  entityType: NoteEntity;
  entityId: number;
  /** Бичих эрх (менежер/санхүү үргэлж; дарга — гэрээ ба хөдөлгөөн дээр). */
  canWrite: boolean;
  /** Хөдөлгөөний мөрөнд суух хэлбэр — картгүй, жижиг. */
  compact?: boolean;
}) {
  const [rows, setRows] = useState<Note[] | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Note | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const opened = useRef(false);
  const toast = useToast();
  const pid = panelId("notes", `${entityType}-${entityId}`);

  const load = () =>
    api(`/api/notes?entity_type=${entityType}&entity_id=${entityId}`)
      .then((r: Note[]) => {
        setRows(r);
        /* Тугтай мөр байвал НЭГ УДАА өөрөө задарна — хумигдсан ⚑ нь
           «анхаарах» гэдгээ хэлж чадахгүй. Дараа нь түүний сонголт хэвээр. */
        if (!opened.current && noteSummary(r).flagged > 0) {
          opened.current = true;
          setOpen(true);
        }
      })
      .catch((e) => toast(e.message, "err"));
  useEffect(() => { void load(); }, [entityType, entityId]);

  const list = orderNotes(rows || []);
  const sum = noteSummary(rows || []);

  async function toggleFlag(n: Note) {
    setBusyId(n.id);
    try {
      await api(`/api/notes/${n.id}`, { method: "PATCH",
        body: JSON.stringify({ flag: !n.flag }) });
      toast(n.flag ? "Анхаарах тэмдэг авлаа" : "Анхаарах ⚑ тэмдэглэв");
      await load();
    } catch (e: any) { toast(e.message, "err"); }
    finally { setBusyId(null); }
  }

  const head = (
    <h2 className={compact ? "text-[12.5px]" : "text-[15.5px]"}>
      <button type="button" {...disclosureProps(open, pid)}
              className={`flex items-center gap-2 w-full text-left font-bold text-ink ${
                compact ? "min-h-9" : "min-h-[36px]"}`}
              onClick={() => { opened.current = true; setOpen(!open); }}>
        <Chevron open={open} />
        Тэмдэглэл
        <span className="pill-grey ml-auto">{sum.count}</span>
        {/* Өнгө дангаараа утга зөөхгүй (UI-ЗАРЧИМ §4) — ⚑-ийн хажууд ҮГ явна */}
        {sum.flagged > 0 && (
          <span className="pill-amber">⚑ {sum.flagged} анхаарах</span>
        )}
      </button>
    </h2>
  );

  const body = (
    <div id={pid} className="mt-3">
      {list.length === 0 && (
        <p className="text-[12.5px] text-t3">
          Тэмдэглэл алга. «7.06нд тооцов», «ирээгүй», «нөат шивсэн» гэх мэт
          шийдвэрээ энд огноотой нь үлдээнэ.
        </p>
      )}
      <ul className="space-y-1.5">
        {list.map((n) => {
          const lit = n.flag && !isVoided(n);
          return (
            <li key={n.id} title={voidTitle(n)}
                className={`rounded-xl px-3 py-2 border ${
                  lit ? "bg-warn-50 border-warn/30" : "border-line bg-sunken/40"}`}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[12px] text-t3 font-semibold tabular-nums shrink-0">
                  {n.date}
                </span>
                <b className={`text-[13px] text-ink font-semibold flex-1 min-w-[120px] break-words ${
                  voidRowClass(n)}`}>{n.text}</b>
                {lit && <span className="pill-amber shrink-0">⚑ Анхаарах</span>}
                {isVoided(n) && <span className="pill-red shrink-0">ХҮЧИНГҮЙ</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-[12px] text-t3">{n.author || "—"}</span>
                {isVoided(n) && n.void_reason && (
                  <span className="text-[12px] text-danger">{n.void_reason}</span>
                )}
                {canWrite && !isVoided(n) && (
                  <span className="ml-auto flex items-center gap-1.5">
                    {/* Мөрөн дээрх туг — хоёр төлөвтэй ГАНЦ товч. Нэр нь
                        ЮУГ тэмдэглэж байгааг хэлнэ (жагсаалт дундуур
                        «анхаарах, анхаарах» гэсэн зогсоол гарахгүй). */}
                    <button type="button" className="btn-row" aria-pressed={n.flag}
                            disabled={busyId === n.id}
                            onClick={() => void toggleFlag(n)}
                            title={n.flag ? "Анхаарах тэмдгийг авах" : "Анхаарах ⚑ тэмдэглэх"}>
                      ⚑ Анхаарах<span className="sr-only"> — {n.text}</span>
                    </button>
                    <VoidButton label={`${n.date} · ${n.text}`} onClick={() => setVoiding(n)} />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {canWrite && (
        <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[12.5px] mt-3"
                onClick={() => setAdding(true)}>+ Тэмдэглэл</button>
      )}
    </div>
  );

  const inner = (<>
    {head}
    {!open && (
      <p className={`text-t3 mt-1 ${compact ? "text-[11.5px]" : "text-[12.5px]"}`}>
        Огноо · шийдвэр · хэн бичсэн. Анхаарах мөр нь ⚑ тэмдэгтэй.
      </p>
    )}
    {open && body}
    {adding && (
      <AddNoteModal entityType={entityType} entityId={entityId}
                    onClose={() => setAdding(false)}
                    onDone={() => { setAdding(false); setOpen(true); void load(); }} />
    )}
    {voiding && (
      <VoidNoteModal note={voiding} onClose={() => setVoiding(null)}
                     onDone={() => { setVoiding(null); void load(); }} />
    )}
  </>);

  return compact
    ? <div className="rounded-xl border border-line px-3 py-2 mt-2">{inner}</div>
    : <div className="card p-5">{inner}</div>;
}

/* ---------- «+ Тэмдэглэл» ---------- */
function AddNoteModal({ entityType, entityId, onClose, onDone }: {
  entityType: NoteEntity; entityId: number; onClose: () => void; onDone: () => void;
}) {
  const f0 = { text: "", date: todayIso(), flag: false };
  const [f, setF] = useState(f0);
  const toast = useToast();
  const uid = useId();
  return (
    /* Тэмдэглэл нь дахин сэргээгдэхгүй мэдээлэл — санамсаргүй товшилтод
       алдагдвал тэр шийдвэрээ дахин санах хэрэгтэй болно (`dirty`). */
    <FormModal title="Тэмдэглэл нэмэх" onClose={onClose} dirty={formDirty(f0, f)}>
      <label className="lbl" htmlFor={`${uid}-text`}>Тэмдэглэл <span className="text-danger">*</span></label>
      <input id={`${uid}-text`} className="inp w-full" autoFocus
             placeholder="ж: 7.06нд тооцов"
             value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />

      <div className="mt-3.5">
        <label className="lbl" htmlFor={`${uid}-date`}>Огноо</label>
        <input id={`${uid}-date`} type="date" className="inp" value={f.date}
               onChange={(e) => setF({ ...f, date: e.target.value })} />
      </div>

      {/* ШАР НҮД — түүний Excel дээрх `FFFFFF00` дүүргэлт. Тэмдэглэсэн мөр
          дашбоардын «Анхаарах» самбарт гарна. */}
      <div className="mt-3.5">
        <button type="button" aria-pressed={f.flag}
                onClick={() => setF({ ...f, flag: !f.flag })}
                className={`rounded-[7px] border px-4 py-2 font-semibold text-[13px] min-h-10 transition ${
                  f.flag ? "border-warn bg-warn-50 text-warn" : "border-line-strong text-t2"}`}>
          Анхаарах ⚑
        </button>
        <p className="text-[12px] text-t3 mt-1.5">
          Тэмдэглэвэл дашбоардын «Анхаарах» самбарт гарна.
        </p>
      </div>

      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.text.trim()} onSubmit={async () => {
          try {
            await api("/api/notes", { method: "POST", body: JSON.stringify({
              entity_type: entityType, entity_id: entityId,
              date: f.date, text: f.text.trim(), flag: f.flag }) });
            toast("Тэмдэглэл хадгалагдлаа");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

/* ---------- Тэмдэглэл ХҮЧИНГҮЙ болгох (H1) ---------- */
function VoidNoteModal({ note, onClose, onDone }: {
  note: Note; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const toast = useToast();
  const rid = useId();
  return (
    <ConfirmModal
      title="Тэмдэглэл хүчингүй болгох"
      intro={<>
        <b className="text-ink">«{note.text}»</b> · {note.date} — энэ мөр УСТАХГҮЙ:
        «ХҮЧИНГҮЙ» тэмдэгтэй, шалтгаантайгаа хамт үлдэнэ. Анхаарах ⚑ нь
        унтарч, дашбоардын самбараас гарна. Энэ үйлдлийг буцаах боломжгүй.
      </>}
      rows={[{ label: note.date, sub: note.author || undefined, value: note.text },
             ...(note.flag ? [{ label: "Анхаарах ⚑", value: "унтарна",
                                accent: "danger" as const }] : [])]}
      confirmLabel="Хүчингүй болгох"
      confirmDisabled={!reason.trim()}
      danger
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api(`/api/notes/${note.id}/void`, {
            method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
          toast("Тэмдэглэл хүчингүй болов");
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }}>
      <label className="block text-[12.5px] font-semibold text-t2 mb-1.5" htmlFor={rid}>
        Цуцлах шалтгаан <span className="text-danger">*</span>
      </label>
      <input id={rid} className="inp w-full" value={reason} autoFocus
             placeholder="ж: өөр гэрээнийх байсан"
             onChange={(e) => setReason(e.target.value)} />
    </ConfirmModal>
  );
}

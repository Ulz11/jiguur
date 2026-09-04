import { useId, useState } from "react";
import { api } from "../api";
import { ConfirmModal, FormModal, InlineEdit, SubmitButton, useToast } from "../ui";
import { formDirty } from "../lib/dirty";
import { contactRolePill, telHref, type Contact } from "../lib/contact";

/* ХОЛБОО БАРИХ — харилцагчийн гарын үсэгтнүүд (№72, 73).
 *
 * Отгоо эгчийн хуудас бүр гарын үсгийн блокоор дуусдаг:
 *
 *   Бутангууд-7!E79 = 'Төслийн менежер: Н.Батцоож'  H79 = 96590908
 *                D80 = 'Нярав :' E80 = 'Н.Соль'      H80 = 99966285
 *                D81 = 'Захирал:' E81 = 'С.Лхагвасүрэн' H81 = 99113579
 *
 * Систем нь `Client.person` + `Client.phone` гэсэн НЭГ хосыг л барьдаг тул
 * үлдсэн нь бүгд унадаг байв. Тэр хос нь ҮНДСЭН холбоо болж ХЭВЭЭР үлдэнэ —
 * энэ карт нь НЭМЭЛТ.
 *
 * Дугаар бүр ДАРАГДАНА (`tel:`) — «Авлага цуглуулах» дээрхтэй ЯГ ижил зам
 * (`lib/contact.ts`). Отгоо дугаар хуулж бичихээ болино.
 */

export function ContactsCard({ clientId, contacts, canWrite, onChanged }: {
  clientId: number;
  contacts: Contact[] | null | undefined;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [off, setOff] = useState<Contact | null>(null);
  const toast = useToast();
  const rows = contacts || [];
  const live = rows.filter((c) => c.active !== false);

  /* Мөрөн дээрх засвар: талбар бүр `InlineEdit`-ээр (2 алхам), сервер рүү нь
     БҮТЭН мөр явна — эс бөгөөс PUT нь бөглөөгүй талбаруудыг цэвэрлэнэ. */
  async function saveField(c: Contact, patch: Partial<Contact>) {
    try {
      await api(`/api/contacts/${c.id}`, { method: "PUT", body: JSON.stringify({
        name: c.name, role: c.role || "", phone: c.phone || "",
        phone2: c.phone2 || "", note: c.note || "", ...patch }) });
      toast("Хадгалагдлаа");
      onChanged();
    } catch (e: any) { toast(e.message, "err"); throw e; }
  }

  const th = "th !text-[11px] !py-1.5 !px-2.5";
  const td = "td !text-[12.5px] !py-2 !px-2.5 align-top";

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-bold text-ink text-[15.5px]">Холбоо барих</h2>
        <span className="pill-grey">{live.length} хүн</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-[12.5px] text-t3 py-2">
          Хүн бүртгээгүй байна. Гэрээн дээр гарын үсэг зурдаг нярав, менежер,
          захирлаа нэрээр нь энд үлдээвэл залгах дугаар нь дараад л ажиллана.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[520px]">
            <thead><tr>
              <th className={th}>Нэр</th>
              <th className={th}>Албан тушаал</th>
              <th className={th}>Утас</th>
              {canWrite && <th className={th} />}
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const gone = c.active === false;
                return (
                  <tr key={c.id} className={gone ? "opacity-60" : undefined}>
                    <td className={td}>
                      {canWrite && !gone ? (
                        <InlineEdit label={`${c.name} — нэр`} value={c.name} width="w-36"
                          confirmText="Хадгалах уу?"
                          onSave={(v) => saveField(c, { name: v })} />
                      ) : <b className="text-ink">{c.name}</b>}
                      {c.note && <span className="block text-[12px] text-t3">{c.note}</span>}
                    </td>
                    <td className={td}>
                      {/* Албан тушаал нь ЧИМЭГ БИШ: тооцоо нийлдэг хүнийг
                          жагсаалт үүгээр л таньдаг (`lib/contact.ts`). Пил нь
                          ҮГЭЭ өөртөө авч явна — өнгө дангаараа утга зөөхгүй. */}
                      {c.role
                        ? <span className={contactRolePill(c.role)}>{c.role}</span>
                        : <span className="text-t3">—</span>}
                      {canWrite && !gone && (
                        <span className="ml-1.5">
                          <InlineEdit label={`${c.name} — албан тушаал`} value={c.role || ""}
                            display="солих" width="w-36" confirmText="Хадгалах уу?"
                            onSave={(v) => saveField(c, { role: v })} />
                        </span>
                      )}
                      {gone && <span className="pill-grey ml-1.5">Идэвхгүй</span>}
                    </td>
                    <td className={td}>
                      <Phone value={c.phone} label={`${c.name} — утас`}
                             canWrite={canWrite && !gone}
                             onSave={(v) => saveField(c, { phone: v })} />
                      {/* Ашид Донжийн `'88111935  99991491'` — НЭГ хүн, ХОЁР дугаар */}
                      <Phone value={c.phone2} label={`${c.name} — 2 дахь утас`}
                             canWrite={canWrite && !gone} second
                             onSave={(v) => saveField(c, { phone2: v })} />
                    </td>
                    {canWrite && (
                      <td className={`${td} text-right`}>
                        {!gone && (
                          <button type="button" className="btn-row text-t2"
                                  onClick={() => setOff(c)}>
                            Идэвхгүй<span className="sr-only"> болгох — {c.name}</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[12.5px] mt-3"
                onClick={() => setAdding(true)}>+ Хүн нэмэх</button>
      )}

      {adding && <AddContactModal clientId={clientId} onClose={() => setAdding(false)}
                                  onDone={() => { setAdding(false); onChanged(); }} />}
      {off && <DeactivateModal c={off} onClose={() => setOff(null)}
                               onDone={() => { setOff(null); onChanged(); }} />}
    </div>
  );
}

/** Дарагддаг дугаар. Хоосон бол хоёр дахь мөр огт гарахгүй — хий «—» нь
 *  «энд утас байх ёстой» гэж уншигдана. */
function Phone({ value, label, canWrite, second, onSave }: {
  value?: string; label: string; canWrite: boolean; second?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  if (!canWrite && !value) return second ? null : <span className="text-t3">—</span>;
  return (
    <span className={second ? "block mt-0.5" : "block"}>
      {value ? (
        <a href={telHref(value)} title={`${value} руу залгах`}
           className="text-t2 font-semibold tabular-nums hover:text-brand-ink hover:underline">
          ☎ {value}
        </a>
      ) : null}
      {canWrite && (
        <span className={value ? "ml-1.5" : ""}>
          <InlineEdit label={label} value={value || ""} display={value ? "засах" : "утас нэмэх…"}
                      width="w-32" confirmText="Хадгалах уу?" onSave={onSave} />
        </span>
      )}
    </span>
  );
}

/* ---------- «+ Хүн нэмэх» ---------- */
function AddContactModal({ clientId, onClose, onDone }: {
  clientId: number; onClose: () => void; onDone: () => void;
}) {
  const f0 = { name: "", role: "", phone: "", phone2: "", note: "" };
  const [f, setF] = useState(f0);
  const toast = useToast();
  const uid = useId();
  return (
    <FormModal title="Холбоо барих хүн нэмэх" onClose={onClose} dirty={formDirty(f0, f)}>
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label className="lbl" htmlFor={`${uid}-name`}>Нэр <span className="text-danger">*</span></label>
          <input id={`${uid}-name`} className="inp" autoFocus placeholder="ж: Н.Соль"
                 value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="lbl" htmlFor={`${uid}-role`}>Албан тушаал</label>
          {/* Хуудсан дээр гардаг нэршлүүд (№73) — бичихийг нь хөнгөвчилнө */}
          <input id={`${uid}-role`} className="inp" list={`${uid}-roles`}
                 placeholder="ж: Нярав" value={f.role}
                 onChange={(e) => setF({ ...f, role: e.target.value })} />
          <datalist id={`${uid}-roles`}>
            {["Нярав", "Төслийн менежер", "Талбайн менежер", "Захирал",
              "Гүйцэтгэх захирал", "Нягтлан"].map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        <div>
          <label className="lbl" htmlFor={`${uid}-p1`}>Утас</label>
          <input id={`${uid}-p1`} className="inp" inputMode="tel" placeholder="99966285"
                 value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div>
          <label className="lbl" htmlFor={`${uid}-p2`}>2 дахь утас</label>
          <input id={`${uid}-p2`} className="inp" inputMode="tel" placeholder="80118800"
                 value={f.phone2} onChange={(e) => setF({ ...f, phone2: e.target.value })} />
        </div>
      </div>
      <div className="mt-3.5">
        <label className="lbl" htmlFor={`${uid}-note`}>Тэмдэглэл</label>
        <input id={`${uid}-note`} className="inp" placeholder="ж: тооцоо нийлдэг"
               value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim()} onSubmit={async () => {
          try {
            await api(`/api/clients/${clientId}/contacts`, {
              method: "POST", body: JSON.stringify(f) });
            toast("Хүн нэмэгдлээ");
            onDone();
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

/* ---------- Идэвхгүй болгох (устгал БАЙХГҮЙ) ---------- */
function DeactivateModal({ c, onClose, onDone }: {
  c: Contact; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  return (
    <ConfirmModal
      title="Идэвхгүй болгох"
      intro={<>
        <b className="text-ink">{c.name}</b>{c.role ? ` · ${c.role}` : ""} — энэ хүн
        УСТАХГҮЙ: жагсаалтад «Идэвхгүй» тэмдэгтэй үлдэж, зөвхөн залгах
        жагсаалтаас гарна.
      </>}
      rows={[{ label: c.name, sub: c.role || undefined,
               value: c.phone || "—", accent: "dim" as const }]}
      confirmLabel="Идэвхгүй болгох"
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api(`/api/contacts/${c.id}/deactivate`, { method: "POST" });
          toast("Идэвхгүй боллоо");
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }} />
  );
}

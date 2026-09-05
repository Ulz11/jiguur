import { useId, useState } from "react";
import { api } from "../api";
import { ConfirmModal, FormModal, InlineEdit, SubmitButton, useToast } from "../ui";
import { formDirty } from "../lib/dirty";
import { contactNote, contactRolePill, telHref, type Contact } from "../lib/contact";
import { contactOutcome, type Outcome } from "../lib/outcome";

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

export function ContactsCard({ clientId, contacts, canWrite, onChanged, freshMark }: {
  clientId: number;
  contacts: Contact[] | null | undefined;
  canWrite: boolean;
  /** Хийгдсэн зүйлээ ЗУРВАС болгож дамжуулна (`lib/outcome.ts`) — хуудас
   *  түүнийг толгойн доор үлдээнэ. */
  onChanged: (o?: Outcome) => void;
  /** Дөнгөж хөндөгдсөн мөрийн түлхүүр («contact-2») — нүдэнд өөрөө оочихно. */
  freshMark?: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [off, setOff] = useState<Contact | null>(null);
  const [on, setOn] = useState<Contact | null>(null);
  const toast = useToast();
  const rows = contacts || [];
  const live = rows.filter((c) => c.active !== false);

  /* Мөрөн дээрх засвар: талбар бүр `InlineEdit`-ээр (2 алхам), сервер рүү нь
     БҮТЭН мөр явна — эс бөгөөс PUT нь бөглөөгүй талбаруудыг цэвэрлэнэ. */
  async function saveField(c: Contact, patch: Partial<Contact>) {
    try {
      const next = { name: c.name, role: c.role || "", phone: c.phone || "",
                     phone2: c.phone2 || "", note: c.note || "", ...patch };
      await api(`/api/contacts/${c.id}`, { method: "PUT", body: JSON.stringify(next) });
      toast("Хадгалагдлаа");
      onChanged(contactOutcome("edit", { name: next.name, role: next.role,
                                         phone: next.phone, contactId: c.id }));
    } catch (e: any) { toast(e.message, "err"); throw e; }
  }

  /* Толгойн үсэг 11px байв — Отгоо эгчийн 1366×768 дэлгэц дээр «Албан тушаал»
     гэсэн үг уншигдахаа больж, багана нь нэргүй мэт харагдана. §4-ийн доод
     шат нь 12.5px (мөрийн бичигтэй ижил). */
  const th = "th !text-[12.5px] !py-1.5 !px-2.5";
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
                  <tr key={c.id} className={[gone ? "opacity-60" : "",
                    freshMark === `contact-${c.id}` ? "row-fresh" : ""]
                    .filter(Boolean).join(" ") || undefined}>
                    <td className={td}>
                      {canWrite && !gone ? (
                        <InlineEdit label={`${c.name} — нэр`} value={c.name} width="w-36"
                          confirmText="Хадгалах уу?"
                          onSave={(v) => saveField(c, { name: v })} />
                      ) : <b className="text-ink">{c.name}</b>}
                      {/* ХҮНИЙ бичсэн тэмдэглэл нэрийнхээ доор гарна («тооцоо
                          нийлдэг», «амралттай»). Шилжүүлэг энэ талбарт
                          Excel-ийн НҮДНИЙ ХАЯГ хадгалсан байв («БЛҮҮМ-2!O39») —
                          тэр нь системийн дотоод тэмдэглэгээ, түүний мэдээлэл
                          БИШ тул НУУГДАНА (`lib/contact.contactNote`).
                          Өгөгдөл нь бүтнээрээ үлдэнэ (устгал байхгүй). */}
                      {contactNote(c.note) && (
                        <span className="block text-[12px] text-t3">{contactNote(c.note)}</span>
                      )}
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
                      /* ҮЙЛДЭЛ НЬ ҮЙЛ ҮГЭЭР (UI-ЗАРЧИМ §3). Урьд нь мөрийн
                         төгсгөлд «Идэвхгүй» гэсэн ГАНЦ үг зогсдог байсан —
                         тэр нь ТӨЛӨВИЙН шошготой (мөн «Идэвхгүй») яг ижил үг:
                         аль нь мэдээлэл, аль нь товч болох нь ялгарахгүй.
                         Одоо товч нь юу хийхээ бүтнээрээ хэлнэ, идэвхгүй мөр
                         нь буцаж ирэх ХААЛГАТАЙ болов. */
                      <td className={`${td} text-right`}>
                        {gone ? (
                          <button type="button" className="btn-row text-brand-ink"
                                  onClick={() => setOn(c)}>
                            Идэвхжүүлэх<span className="sr-only"> — {c.name}</span>
                          </button>
                        ) : (
                          <button type="button" className="btn-row text-t2"
                                  onClick={() => setOff(c)}>
                            Идэвхгүй болгох<span className="sr-only"> — {c.name}</span>
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
                                  onDone={(o) => { setAdding(false); onChanged(o); }} />}
      {off && <DeactivateModal c={off} onClose={() => setOff(null)}
                               onDone={(o) => { setOff(null); onChanged(o); }} />}
      {on && <ReactivateModal clientId={clientId} c={on} onClose={() => setOn(null)}
                              onDone={(o) => { setOn(null); onChanged(o); }} />}
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
        /* Дарагддаг дугаар нь 36px өндөртэй (`tap-link`) — 13px бичиг нь
           18px зогсоол өгдөг байсан тул Отгоо гурав дарж байж ононо. */
        <a href={telHref(value)} title={`${value} руу залгах`}
           className="tap-link text-t2 font-semibold tabular-nums hover:text-brand-ink hover:underline">
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
  clientId: number; onClose: () => void; onDone: (o?: Outcome) => void;
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
      {/* «Тэмдэглэл» талбар ЭНД БАЙХГҮЙ: түүний бичсэн юм хүснэгтэн дээр
          хэзээ ч эргэж гардаггүй байсан тул бичих газар нь ч байх ёсгүй
          (бичээд алга болдог талбар нь хамгийн муу төрлийн эвдрэл).
          Харилцагчийн тэмдэглэл нь «Тэмдэглэл» зурвас дээр, огноо ба
          зохиогчтойгоо үлддэг (`components/Notes.tsx`). */}
      <div className="flex justify-end gap-2.5 mt-5">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <SubmitButton disabled={!f.name.trim()} onSubmit={async () => {
          try {
            const r = await api(`/api/clients/${clientId}/contacts`, {
              method: "POST", body: JSON.stringify(f) });
            toast("Хүн нэмэгдлээ");
            onDone(contactOutcome("add", { name: f.name, role: f.role,
                                           phone: f.phone, contactId: r?.id }));
          } catch (e: any) { toast(e.message, "err"); }
        }}>Хадгалах</SubmitButton>
      </div>
    </FormModal>
  );
}

/* ---------- Идэвхгүй болгох (устгал БАЙХГҮЙ) ---------- */
function DeactivateModal({ c, onClose, onDone }: {
  c: Contact; onClose: () => void; onDone: (o?: Outcome) => void;
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
          onDone(contactOutcome("off", { name: c.name, role: c.role,
                                         phone: c.phone, contactId: c.id }));
        } catch (e: any) { toast(e.message, "err"); }
      }} />
  );
}

/* ---------- Идэвхжүүлэх (буцаж ирсэн хүн) ----------
 *
 * Хүн ажлаасаа гарч, дараа нь буцаж ирдэг; андуурч идэвхгүй болгосон ч байж
 * болно. Хаалга нь БАЙГААГҮЙ тул Отгоо эгч ганц гарцтай байв: ШИНЭ мөр нэмэх.
 * Тэгвэл нэг «Н.Соль» хоёр болж, аль нь одоогийнх болохыг мэдэх аргагүй.
 * Мөнгө хөдлөхгүй тул `danger` АВАХГҮЙ — улаан бол «хэтэрсэн · акт · устгах»-
 * ын өнгө (UI-ЗАРЧИМ §4).
 */
function ReactivateModal({ clientId, c, onClose, onDone }: {
  clientId: number; c: Contact; onClose: () => void; onDone: (o?: Outcome) => void;
}) {
  const toast = useToast();
  return (
    <ConfirmModal
      title="Идэвхжүүлэх"
      intro={<>
        <b className="text-ink">{c.name}</b>{c.role ? ` · ${c.role}` : ""} — энэ хүн
        залгах жагсаалтад буцаж орно. Шинэ мөр ҮҮСЭХГҮЙ: түүний хуучин
        дугаар, албан тушаал хэвээрээ.
      </>}
      rows={[{ label: c.name, sub: c.role || undefined,
               value: c.phone || "—", accent: "dim" as const }]}
      confirmLabel="Идэвхжүүлэх"
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api(`/api/clients/${clientId}/contacts/${c.id}/reactivate`,
                    { method: "POST" });
          toast("Идэвхтэй боллоо");
          onDone(contactOutcome("on", { name: c.name, role: c.role,
                                        phone: c.phone, contactId: c.id }));
        } catch (e: any) { toast(e.message, "err"); }
      }} />
  );
}

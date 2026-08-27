import { useId, useState } from "react";
import { api } from "../api";
import { FormModal, useToast } from "../ui";
import { formDirty } from "../lib/dirty";

export default function ChangePassword({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const f0 = { old_password: "", new_password: "", repeat: "" };
  const [f, setF] = useState(f0);
  const [busy, setBusy] = useState(false);
  const mismatch = f.repeat.length > 0 && f.new_password !== f.repeat;
  const uid = useId();

  async function submit() {
    if (f.new_password.trim().length < 4) { toast("Шинэ нууц үг дор хаяж 4 тэмдэгт", "err"); return; }
    if (mismatch) { toast("Шинэ нууц үг давтсантайгаа таарахгүй байна", "err"); return; }
    setBusy(true);
    try {
      await api("/api/auth/change-password", { method: "POST",
        body: JSON.stringify({ old_password: f.old_password, new_password: f.new_password }) });
      toast("Нууц үг солигдлоо");
      onClose();
    } catch (e: any) { toast(e.message, "err"); setBusy(false); }
  }

  return (
    <FormModal title="Нууц үг солих" onClose={onClose} dirty={formDirty(f0, f)}>
      <label className="lbl" htmlFor={`${uid}-old`}>Одоогийн нууц үг</label>
      <input id={`${uid}-old`} className="inp mb-3.5" type="password" autoFocus value={f.old_password}
             autoComplete="current-password"
             onChange={(e) => setF({ ...f, old_password: e.target.value })} />
      <label className="lbl" htmlFor={`${uid}-new`}>Шинэ нууц үг</label>
      <input id={`${uid}-new`} className="inp mb-3.5" type="password" value={f.new_password}
             autoComplete="new-password"
             onChange={(e) => setF({ ...f, new_password: e.target.value })} />
      <label className="lbl" htmlFor={`${uid}-rep`}>Шинэ нууц үг (давтах)</label>
      <input id={`${uid}-rep`} className={`inp ${mismatch ? "!border-danger" : ""}`} type="password" value={f.repeat}
             autoComplete="new-password"
             aria-invalid={mismatch || undefined} aria-describedby={mismatch ? `${uid}-mm` : undefined}
             onChange={(e) => setF({ ...f, repeat: e.target.value })}
             onKeyDown={(e) => e.key === "Enter" && submit()} />
      {mismatch && <p id={`${uid}-mm`} className="text-danger text-[12px] mt-1.5">Таарахгүй байна</p>}
      <div className="flex justify-end gap-2.5 mt-6">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={busy || !f.old_password || !f.new_password} onClick={submit}>
          {busy ? "…" : "Солих"}
        </button>
      </div>
    </FormModal>
  );
}

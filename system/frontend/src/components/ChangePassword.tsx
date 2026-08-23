import { useState } from "react";
import { api } from "../api";
import { Modal, useToast } from "../ui";

export default function ChangePassword({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ old_password: "", new_password: "", repeat: "" });
  const [busy, setBusy] = useState(false);
  const mismatch = f.repeat.length > 0 && f.new_password !== f.repeat;

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
    <Modal title="Нууц үг солих" onClose={onClose}>
      <label className="lbl">Одоогийн нууц үг</label>
      <input className="inp mb-3.5" type="password" autoFocus value={f.old_password}
             onChange={(e) => setF({ ...f, old_password: e.target.value })} />
      <label className="lbl">Шинэ нууц үг</label>
      <input className="inp mb-3.5" type="password" value={f.new_password}
             onChange={(e) => setF({ ...f, new_password: e.target.value })} />
      <label className="lbl">Шинэ нууц үг (давтах)</label>
      <input className={`inp ${mismatch ? "!border-danger" : ""}`} type="password" value={f.repeat}
             onChange={(e) => setF({ ...f, repeat: e.target.value })}
             onKeyDown={(e) => e.key === "Enter" && submit()} />
      {mismatch && <p className="text-danger text-[12px] mt-1.5">Таарахгүй байна</p>}
      <div className="flex justify-end gap-2.5 mt-6">
        <button className="btn-secondary" onClick={onClose}>Болих</button>
        <button className="btn-primary" disabled={busy || !f.old_password || !f.new_password} onClick={submit}>
          {busy ? "…" : "Солих"}
        </button>
      </div>
    </Modal>
  );
}

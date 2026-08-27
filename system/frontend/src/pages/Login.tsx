import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuth } from "../api";
import brandLogo from "../assets/jiguur-logo.png";

export default function Login() {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const uid = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setAuth(r.token, r.user);
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-stage px-4 py-10">
      <div className="w-full max-w-sm relative z-[1]">
        <form onSubmit={submit} className="login-card p-8">
          <img className="login-logo" src={brandLogo} alt="Жигүүр Зам ХХК" />
          <div className="login-rule" />
          <div className="mb-7">
            <div className="login-title">Удирдлагын систем</div>
            <div className="text-[11.5px] uppercase tracking-[0.11em] text-t3 font-semibold mt-1.5">
              Түрээс · Худалдаа · Тооцоо
            </div>
          </div>

          <label className="lbl" htmlFor={`${uid}-user`}>Нэвтрэх нэр</label>
          <input id={`${uid}-user`} className="inp mb-4" value={username} onChange={(e) => setU(e.target.value)}
                 placeholder="otgoo" autoFocus autoCapitalize="none" autoComplete="username" />
          <label className="lbl" htmlFor={`${uid}-pw`}>Нууц үг</label>
          <input id={`${uid}-pw`} className="inp mb-2" type="password" value={password} onChange={(e) => setP(e.target.value)}
                 placeholder="••••" autoComplete="current-password"
                 aria-describedby={err ? `${uid}-err` : undefined} />
          {err && (
            /* Алдаа гарсныг ХАРААГҮЙ хүн ч мэдэх ёстой — талбарын доор гарч
               ирэхэд шууд уншигдана. */
            <div id={`${uid}-err`} role="alert"
                 className="text-danger text-[12.5px] font-medium mb-2 bg-danger-50 rounded-md px-3 py-2">
              {err}
            </div>
          )}
          <button className="btn-primary w-full justify-center mt-3" disabled={busy || !username || !password}>
            {busy ? "Түр хүлээнэ үү…" : "Нэвтрэх"}
          </button>
        </form>
        <p className="text-[12px] text-t3 mt-5 text-center leading-relaxed">
          Нууц үгээ мартсан бол менежерт хандана уу.<br />
          © {new Date().getFullYear()} Жигүүр Зам ХХК
        </p>
      </div>
    </div>
  );
}

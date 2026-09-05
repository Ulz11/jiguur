import { RouterProvider, createBrowserRouter, createRoutesFromElements,
         Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api, user, setAuth, clearAuth } from "./api";
import { ToastProvider, ConfirmModal } from "./ui";
import ErrorBoundary from "./components/ErrorBoundary";
import { pageTitle, shellTitle } from "./lib/titles";
import { scopeFrom, scopeHref, type Scope } from "./lib/links";
import { canOpen, deniedMessage } from "./lib/guard";
import { anyDialogDirty, resetDirtyDialogs } from "./lib/dirty";
import { live, liveText, liveTitle, liveTone, useLiveState, useMinuteTick } from "./lib/live";
import { expiryWarning, parseExpiry, readSessionInfo, saveSessionInfo,
         shouldRefresh } from "./lib/session";
import { todayIso } from "./lib/schedule";
import ChangePassword from "./components/ChangePassword";
import brandLogo from "./assets/jiguur-logo.png";
import brandMark from "./assets/jiguur-mark.png";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Contracts from "./pages/Contracts";
import ContractDetail from "./pages/ContractDetail";
import ContractNew from "./pages/ContractNew";
import Clients from "./pages/Clients";
import ClientProfile from "./pages/ClientProfile";
import Warehouse from "./pages/Warehouse";
import Barter from "./pages/Barter";
import Machines from "./pages/Machines";
import Loans from "./pages/Loans";
import Salary from "./pages/Salary";
import Reports from "./pages/Reports";
import Collections from "./pages/Collections";
import Analytics from "./pages/Analytics";
import Stocktake from "./pages/Stocktake";
import MaterialDetail from "./pages/MaterialDetail";
import Audit from "./pages/Audit";
import SettingsPage from "./pages/SettingsPage";

/* ---------- Глобал Түрээс/Худалдаа scope ----------
   Хүрээ нь ХАЯГНААС уншигдана (`?scope=rent|sale`), контекст нь түүний амьд
   толь: хоёулаа рендер тутамд нэг эх сурвалжаас гардаг тул ЗӨРӨХ боломжгүй
   (өмнө нь useState байсан — хаяг түүнийг мэддэггүй, буцах товч ч мэддэггүй).

   Бичихдээ PUSH: хүрээ солих нь Отгоогийн ХИЙСЭН үйлдэл тул буцах товч
   түүнийг алхам алхмаар буцаана («яагаад тоо өөрчлөгдчихөв» → ← дарж хараад
   болно). Replace бол энэ алхмыг чимээгүй залгих байв. */
const ScopeCtx = createContext<{ scope: Scope; setScope: (s: Scope) => void }>({ scope: "all", setScope: () => {} });
export const useScope = () => useContext(ScopeCtx);

/** Түрээс/Худалдаа — хуудсын ГОЛ шилжүүлэгч. Дашбоард ба Гэрээнүүд дээр ЯГ
 *  ижил байрлал, ижил хэмжээ, ижил дуудагдах нэртэй байхын тулд НЭГ л газар
 *  бичигдэнэ (өмнө нь топбарын 36px саарал сегмент ба хуудасны 44px улбар шар
 *  товч гэсэн хоёр өөр биетэй, нэг төлөвтэй байв). */
const SCOPE_BUTTONS: [Scope, string][] = [["all", "Бүгд"], ["rent", "Түрээс"], ["sale", "Худалдаа"]];

export function ScopeSwitch({ className = "mb-3" }: { className?: string }) {
  const { scope, setScope } = useScope();
  return (
    <div className={className}>
      <div className="scope-switch" role="group" aria-label="Түрээс / Худалдаагаар шүүх">
        {SCOPE_BUTTONS.map(([v, l]) => (
          <button key={v} onClick={() => setScope(v)} aria-pressed={scope === v}
                  className={scope === v ? "on" : ""}>{l}</button>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  /* Цэсний нэр = хуудасны гарчиг = дээд мөрийн байршил: НЭГ хуудас НЭГ нэртэй.
     («Дашбоард» гэж зөвхөн энд бичигдэж, бусад гурван газар «Удирдлагын төв» байв.) */
  { to: "/", label: "Удирдлагын төв", icon: "▦" },
  { to: "/contracts", label: "Гэрээнүүд", icon: "▤" },
  { to: "/clients", label: "Харилцагч", icon: "◉" },
  { to: "/collections", label: "Авлага цуглуулах", icon: "☎", hide: "factory" },
  { to: "/warehouse", label: "Агуулах", icon: "▣" },
  { to: "/barter", label: "Бартер", icon: "⇄" },
  { to: "/machines", label: "Механизм", icon: "⛟" },
  { to: "/loans", label: "Зээл / Өглөг", icon: "▽", hide: "factory" },
  { to: "/salary", label: "Цалин", icon: "◔", hide: "factory" },
  { to: "/reports", label: "Тайлан", icon: "▲", hide: "factory" },
  { to: "/analytics", label: "Аналитик", icon: "◈", hide: "factory" },
  { to: "/audit", label: "Үйлдлийн бүртгэл", icon: "☰", role: "manager" },
  { to: "/settings", label: "Тохиргоо", icon: "⚙", role: "manager" },
];
/** Эхний хэсэг = өдөр тутмын ажил, дараах нь = байгууллагын удирдлага */
const WORK_COUNT = 7;

/* ══════════════════════════════════════════════════════════════════════════
   ТОПБАРЫН АМЬД ЗААГЧ — «ЭНЭ ТОО ХЭР ШИНЭ ВЭ?»

   Өмнө нь энд `<span className="top-pulse" title="Систем хэвийн ажиллаж
   байна" />` гэсэн НОГООН ЦЭГ 24 цаг зогсдог байв. Тэр өгүүлбэр нь HTML-д
   ХАТУУ бичигдсэн: сүлжээ тасарсан ч, сервер унасан ч, дэлгэц дээрх тоо
   гурван цагийн өмнөх байсан ч ЯГ ижилхэн гэрэлтэнэ. Отгоо эгч хуучирсан
   тоог хараад хэнд залгахаа шийдэж болно.

   Одоо цэг нь `lib/live.ts`-ийн үнэнийг зурна, дарахад дахин татна.
   ══════════════════════════════════════════════════════════════════════════ */
function LiveDot() {
  const s = useLiveState();
  const now = useMinuteTick();
  const tone = liveTone(s);
  return (
    <button type="button"
            className={`top-live ${tone === "warn" ? "is-warn" : tone === "down" ? "is-down"
                                  : tone === "idle" ? "is-idle" : ""}`}
            title={liveTitle(s, now)} aria-label={liveTitle(s, now)}
            /* Уншигчид: төлөв өөрчлөгдөхөд өөрөө уншина (хүн товч рүү
               явахгүйгээр «холболт тасарсан» гэдгийг мэднэ). */
            aria-live="polite"
            onClick={() => {
              /* Бүртгэгдсэн хуудас байвал ӨӨРИЙГӨӨ дахин татна; эс бөгөөс
                 зөвхөн холболтоо шалгана — Отгоогийн бөглөж байгаа зүйлийг
                 бүтэн дахин ачаалалт устгах ёсгүй. */
              if (!live.retry()) api("/api/auth/me").catch(() => {});
            }}>
      <span className="top-pulse" aria-hidden="true" />
      <span className="top-live-text">{liveText(s, now)}</span>
    </button>
  );
}

/* ---------- ТОГТМОЛ ЗУРВАС ----------
   Toast нь 3.2 секундын дараа арилдаг. Эрх хаагдсан, нэвтрэлт дуусах гэж
   байгаа, нууц үг анхныхаараа байгаа гурав нь ӨӨРӨӨ АРИЛАХ ЁСГҮЙ. */
function Strip({ tone, text, action, onDismiss }: {
  tone: "warn" | "danger"; text: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}) {
  return (
    <div className={`jz-strip ${tone === "danger" ? "jz-strip-danger" : "jz-strip-warn"}`}
         role="status">
      <span className="jz-strip-text">{text}</span>
      {action && (
        <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]"
                onClick={action.onClick}>{action.label}</button>
      )}
      {onDismiss && (
        <button className="btn-ghost !min-h-9 !py-1.5 !px-2 text-[13px]"
                aria-label="Мэдэгдлийг хаах" onClick={onDismiss}>✕</button>
      )}
    </div>
  );
}

/* ---------- СЕССИ ----------
   12 цагийн токен нь өглөө 9-д нэвтэрсэн Отгоог орой 9-д ГЭРЭЭ БӨГЛӨЖ
   БАЙХАД нь шиднэ. Сервер `POST /api/auth/refresh` гэсэн ГУЛСДАГ хугацаа
   өгсөн: хэрэглэж байгаа хүн дундуур нь гарахгүй, хэрэглээгүй сесси 12
   цагийн дараа өөрөө унтарна. Дэлгэцийн ажил нь гурав:
     1. хөдөлгөөн бүр дээр (токен 1 цагаас хөгширсөн бол) сунгах;
     2. 10 минут үлдэхэд САНУУЛАХ — «Үргэлжлүүлэх» товчтой;
     3. нууц үг нь «1234» хэвээр бол ил хэлэх (/audit-ийн «Хэн» багана
        утгагүй болдог: гурван хүн бүгд ижил нууц үгтэй). */
function useSession(active: boolean) {
  /* Нэвтрэх хариу нь хоёуланг нь аль хэдийн авч ирсэн (`lib/session.ts`) —
     хуудас ачаалах бүрд серверээс дахин асуухгүй. */
  const cached = useRef(readSessionInfo()).current;
  const [expiresAt, setExpiresAt] = useState<number | null>(
    () => parseExpiry(cached?.token_expires_at));
  const [mustChange, setMustChange] = useState(!!cached?.must_change_password);
  const expRef = useRef<number | null>(parseExpiry(cached?.token_expires_at));
  const busy = useRef(false);
  const now = useMinuteTick();

  const apply = useCallback((d: any) => {
    if (!d) return;
    /* Шинэ токен ирвэл ХУУЧНЫГ нь тэр дороо солино — эс бөгөөс дараагийн
       хүсэлт хугацаа нь дууссан токеноор явна. */
    const u = user();
    if (d.token && u) setAuth(d.token, u);
    if (d.token_expires_at) {
      const t = parseExpiry(d.token_expires_at);
      expRef.current = t;
      setExpiresAt(t);
    }
    if (typeof d.must_change_password === "boolean") setMustChange(d.must_change_password);
    saveSessionInfo({ token_expires_at: d.token_expires_at,
                      must_change_password: d.must_change_password });
  }, []);

  const renew = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try { apply(await api("/api/auth/refresh", { method: "POST" })); }
    catch { /* сүлжээ тасарсан — дараагийн хөдөлгөөнд дахин оролдоно */ }
    finally { busy.current = false; }
  }, [apply]);

  useEffect(() => {
    if (!active) return;
    /* ⚠ ЗӨВХӨН санамж ХООСОН үед. `GET /api/auth/me` нь «нууц үг анхныхаараа
       юу» гэдгийг шалгахдаа PBKDF2-ыг 100,000 давталтаар гүйлгэдэг
       (`auth.is_seed_password`) — хуудас ачаалах бүрд дуудвал сервер өдөрт
       хэдэн зуун нууц үг задлана. Нэвтрэх хариу тэр хоёр талбарыг аль хэдийн
       өгсөн; санамж алдагдсан (хуучин сесси, хувийн горим) үед л асууна. */
    if (cached?.token_expires_at) return;
    api("/api/auth/me").then(apply).catch(() => {});
  }, [active, apply, cached]);

  useEffect(() => {
    if (!active) return;
    /* ХӨДӨЛГӨӨН — товшилт, товчлуур. Рендер төрүүлэхгүй (ref унших):
       минут тутмын цохилт нь зурвасын тоог өөрөө шинэчилнэ. */
    const onAct = () => { if (shouldRefresh(expRef.current, Date.now())) renew(); };
    window.addEventListener("pointerdown", onAct, { passive: true });
    window.addEventListener("keydown", onAct);
    return () => {
      window.removeEventListener("pointerdown", onAct);
      window.removeEventListener("keydown", onAct);
    };
  }, [active, renew]);

  return { warning: expiryWarning(expiresAt, now), mustChange, renew,
           clearMustChange: () => {
             setMustChange(false);
             saveSessionInfo({ must_change_password: false });
           } };
}

function Shell({ children }: { children: ReactNode }) {
  const u = user();
  const nav = useNavigate();
  const loc = useLocation();
  /* Хүрээ нь хаягаас ГАРНА — рендер тутамд. Тиймээс буцах/урагшлах товч,
     хавчуурга, дахин ачаалалт гурвуулаа ямар ч нэмэлт кодгүйгээр ажиллана. */
  const scope = scopeFrom(new URLSearchParams(loc.search).get("scope"));
  const setScope = (s: Scope) => nav(scopeHref(loc.pathname, loc.search, s));
  const [pw, setPw] = useState(false);
  const [menu, setMenu] = useState(false);
  const [askLogout, setAskLogout] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("jz_nav") === "min");
  const session = useSession(!!u);
  /* Хаалттай хуудсыг НЭЭХГҮЙ. Шалтгаан нь Удирдлагын төв рүү ЗУРВАС болж
     дагана (`Navigate ... state`) — эс бөгөөс дарга хавчуургаа дараад
     тайлбаргүй самбар дээр буугаад «яагаад тайлан алга болов» гэж үлдэнэ. */
  const denied = canOpen(loc.pathname, u?.role) ? "" : deniedMessage(loc.pathname);
  const strip = (loc.state as any)?.denied as string | undefined;

  useEffect(() => {
    /* 404 дээр таб нь «Жигүүр Зам · Жигүүр Зам» болдог байв — `shellTitle`
       танихгүй замд «Хуудас олдсонгүй» гэсэн нэр өгнө. */
    document.title = `${shellTitle(loc.pathname)} · Жигүүр Зам`;
    setMenu(false);
  }, [loc.pathname]);

  /* Хуудас солигдлоо — амьд заагч ШИНЭ хуудасны тухай шинээр ярина
     (өмнөх хуудасны «Шинэчилсэн: 14:03» энд утгагүй). */
  useEffect(() => { live.reset(); }, [loc.pathname]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      localStorage.setItem("jz_nav", c ? "full" : "min");
      return !c;
    });
  };

  /** Гарах — /audit-д мөр үлдээгээд явна. Сервер хариулаагүй ч гарна:
   *  «гарч чадахгүй» гэдэг нь хамгийн муу хариулт. */
  const doLogout = () => {
    setAskLogout(false);
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    resetDirtyDialogs();
    clearAuth();
    nav("/login");
  };
  /** Бөглөж байгаа зүйл байвал АСУУНА — гарах нь буцаагдахгүй (бичсэн зүйл
   *  React-ийн санах ойд, хадгалагдаагүй). */
  const onLogout = () => (anyDialogDirty() ? setAskLogout(true) : doLogout());

  if (!u) return <Navigate to="/login" replace />;
  /* Хаалттай зам → Удирдлагын төв (тэнд ажил бий), зурвасаа авч. */
  if (denied) return <Navigate to="/" replace state={{ denied }} />;
  const availableNav = NAV.filter((n: any) => (!n.role || n.role === u.role) && n.hide !== u.role);
  const workNav = availableNav.slice(0, WORK_COUNT);
  const orgNav = availableNav.slice(WORK_COUNT);
  const roleLabel = u.role === "manager" ? "Менежер" : u.role === "factory" ? "Үйлдвэрийн дарга" : "Санхүүч";

  const navItem = (n: any) => (
    <NavLink key={n.to} to={n.to} end={n.to === "/"} title={n.label}
      className={({ isActive }) => `nav-btn ${isActive ? "on" : ""}`}>
      <span className="nav-icon" aria-hidden="true">{n.icon}</span>
      <span className="nav-label">{n.label}</span>
    </NavLink>
  );

  return (
    <ScopeCtx.Provider value={{ scope, setScope }}>
    <div className="jz-app-shell">
      {/* Гарын хүний ЭХНИЙ зогсоол — 13 мөрт цэсийг тойрч агуулга руу */}
      <a href="#jz-main" className="jz-skip">Агуулга руу алгасах</a>
      {menu && <div className="jz-scrim" onClick={() => setMenu(false)} />}
      <aside id="jz-sidebar" className={`jz-sidebar ${menu ? "open" : ""} ${collapsed ? "collapsed" : ""}`}
             aria-label="Үндсэн навигаци">
        <div className="brand-plate">
          <img src={collapsed ? brandMark : brandLogo} alt="Жигүүр Зам ХХК"
               className={collapsed ? "brand-mark-img" : ""} />
          <button className="jz-drawer-close" onClick={() => setMenu(false)} aria-label="Хаах">×</button>
        </div>
        {/* Намхан дэлгэцэнд цэс өөрөө гүйнэ — Тохиргоо, Үйлдлийн бүртгэл таслагдахгүй */}
        <div className="jz-nav-scroll">
          <div className="nav-caption">ҮЙЛ АЖИЛЛАГАА</div>
          <nav className="jz-nav">{workNav.map(navItem)}</nav>
          {orgNav.length > 0 && (
            <><div className="nav-caption">БАЙГУУЛЛАГА</div><nav className="jz-nav">{orgNav.map(navItem)}</nav></>
          )}
        </div>
        <div className="side-foot-card p-2.5">
          <div className="flex items-center gap-2.5 relative z-[1]">
            <div className="user-monogram">{u.name.slice(0, 2)}</div>
            <div className="min-w-0 flex-1 nav-label">
              <div className="text-[13px] font-semibold truncate">{u.name}</div>
              <div className="text-[12px] opacity-70 truncate">{roleLabel}</div>
            </div>
          </div>
          {/* Өөрийн мөрөнд гарсан тул нэр хумигдахгүй; nav-label ЗҮҮГДЭХГҮЙ —
              хураасан горимд ч гарах/нууц үг солих товч үлдэнэ */}
          <div className="side-foot-actions relative z-[1]">
            <button className="side-foot-btn" title="Нууц үг солих" aria-label="Нууц үг солих"
                    onClick={() => setPw(true)}>🔑</button>
            <button className="side-foot-btn" title="Гарах" aria-label="Гарах"
                    onClick={onLogout}>⎋</button>
          </div>
        </div>
      </aside>

      <main className="jz-main" id="jz-main" tabIndex={-1}>
        <div className="jz-topbar">
          {/* ☰ нь дүрс дээрээ л ярьдаг тул нэр ба ТӨЛӨВӨӨ хоёуланг хэлнэ */}
          <button className="jz-burger" onClick={() => setMenu((m) => !m)}
                  aria-label="Цэс" aria-expanded={menu} aria-controls="jz-sidebar">☰</button>
          <button className="jz-collapse" onClick={toggleCollapse}
                  title={collapsed ? "Цэсийг дэлгэх" : "Цэсийг хураах"}
                  aria-label={collapsed ? "Цэсийг дэлгэх" : "Цэсийг хураах"}>
            {collapsed ? "»" : "«"}
          </button>
          <span className="jz-location">
            {/* `toISOString()` нь UTC — Улаанбаатар (UTC+8) дээр орой 8 цагаас
                хойш МАРГААШИЙН огноог бичдэг байв. Топбарын огноо бол «өнөөдөр
                хэд вэ» гэсэн ганц хариу тул ЛОКАЛ хуанлигаар унших ёстой. */}
            ЖИГҮҮР ЗАМ ХХК <i /> {shellTitle(loc.pathname).toUpperCase()} <i /> {todayIso()}
          </span>
          {/* Түрээс/Худалдаа энд байсан: топбарын баруун дээд буланд, 36px
              саарал сегмент болж — Отгоо түүнийг ХЭЗЭЭ Ч анзаараагүй, атал тэр
              нь доорх бүх KPI-г сольж байв. Одоо хоёр хуудас дээрээ, KPI-н яг
              дээр, 44px улбар шар товч болж зогсоно (ScopeSwitch). */}
          <div className="jz-topbar-actions">
            <LiveDot />
          </div>
        </div>

        {/* ═══ ТОГТМОЛ ЗУРВАСУУД — топбарын доор, агуулгын дээр ═══ */}
        {/* 1. Хаалттай хуудсаас буцаагдсан (`Navigate ... state`) */}
        {strip && (
          <Strip tone="warn" text={strip}
                 onDismiss={() => nav(loc.pathname + loc.search, { replace: true, state: null })} />
        )}
        {/* 2. Нууц үг АНХНЫХААРАА («1234») — /audit-ийн «Хэн» багана утгагүй */}
        {session.mustChange && (
          <Strip tone="danger" text="Нууц үгээ солино уу — анхны нууц үг хэвээр байна"
                 action={{ label: "Нууц үг солих", onClick: () => setPw(true) }} />
        )}
        {/* 3. Нэвтрэлт дуусах гэж байна — «Үргэлжлүүлэх» нь сунгана */}
        {session.warning && (
          <Strip tone="warn" text={`${session.warning} — хийж байгаа ажлаа хадгална уу`}
                 action={{ label: "Үргэлжлүүлэх", onClick: session.renew }} />
        )}

        <div className="jz-content">
          <ErrorBoundary key={loc.pathname}>{children}</ErrorBoundary>
        </div>
      </main>

      {pw && <ChangePassword onClose={() => { setPw(false); session.clearMustChange(); }} />}
      {askLogout && (
        <ConfirmModal
          title="Гарах уу?"
          intro="Нээлттэй цонхонд бөглөсөн зүйл хадгалагдаагүй байна."
          note="Гарвал бөглөсөн мэдээлэл устана. Энэ үйлдлийг буцаах боломжгүй."
          confirmLabel="Гарах"
          danger
          onClose={() => setAskLogout(false)}
          onConfirm={doLogout} />
      )}
    </div>
    </ScopeCtx.Provider>
  );
}

function NotFound() {
  return (
    <div className="card p-12 text-center max-w-md mx-auto mt-10">
      <div className="text-4xl mb-3">🧭</div>
      <h3 className="font-bold text-ink text-[16px] mb-1">Хуудас олдсонгүй</h3>
      <p className="text-t2 text-[13px] mb-5">Хаяг буруу байна эсвэл устгагдсан хуудас байж магадгүй.</p>
      <NavLink to="/" className="btn-primary inline-flex">Удирдлагын төв рүү буцах</NavLink>
    </div>
  );
}

/* Замууд хэвээрээ — ГАНЦ ялгаа нь router-ийг `createBrowserRouter`-ээр угсарч
   байгаа явдал. Ингэснээр `useBlocker` ажиллах боломжтой болно: шинэ гэрээний
   визард дундуур цэс рүү дарахад бөглөсөн зүйл чимээгүй алдагдахаа болино
   (`BrowserRouter` дээр энэ дэгээ огт байдаггүй). */
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Shell><Dashboard /></Shell>} />
      <Route path="/contracts" element={<Shell><Contracts /></Shell>} />
      <Route path="/contracts/new" element={<Shell><ContractNew /></Shell>} />
      <Route path="/contracts/:id" element={<Shell><ContractDetail /></Shell>} />
      <Route path="/clients" element={<Shell><Clients /></Shell>} />
      <Route path="/clients/:id" element={<Shell><ClientProfile /></Shell>} />
      <Route path="/collections" element={<Shell><Collections /></Shell>} />
      <Route path="/analytics" element={<Shell><Analytics /></Shell>} />
      <Route path="/audit" element={<Shell><Audit /></Shell>} />
      <Route path="/warehouse" element={<Shell><Warehouse /></Shell>} />
      <Route path="/warehouse/stocktake" element={<Shell><Stocktake /></Shell>} />
      <Route path="/warehouse/materials/:id" element={<Shell><MaterialDetail /></Shell>} />
      <Route path="/barter" element={<Shell><Barter /></Shell>} />
      <Route path="/machines" element={<Shell><Machines /></Shell>} />
      <Route path="/loans" element={<Shell><Loans /></Shell>} />
      <Route path="/salary" element={<Shell><Salary /></Shell>} />
      <Route path="/reports" element={<Shell><Reports /></Shell>} />
      <Route path="/settings" element={<Shell><SettingsPage /></Shell>} />
      <Route path="*" element={<Shell><NotFound /></Shell>} />
    </Route>
  )
);

/* Хүрээний контекст нь ЭНД биш, `Shell` дотор — router-ийн дотор байж байж
   хаягаа уншина. Гадна нь useState барьж байсан нь яг тэр асуудал байв:
   хаяг нэг юм хэлж, төлөв өөр юм барьж чадна. */
export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}

import { RouterProvider, createBrowserRouter, createRoutesFromElements,
         Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, createContext, useContext, useState, useEffect } from "react";
import { user, clearAuth } from "./api";
import { ToastProvider } from "./ui";
import ErrorBoundary from "./components/ErrorBoundary";
import { pageTitle } from "./lib/titles";
import { scopeFrom, scopeHref, type Scope } from "./lib/links";
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("jz_nav") === "min");

  useEffect(() => {
    document.title = `${pageTitle(loc.pathname) || "Жигүүр Зам"} · Жигүүр Зам`;
    setMenu(false);
  }, [loc.pathname]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      localStorage.setItem("jz_nav", c ? "full" : "min");
      return !c;
    });
  };

  if (!u) return <Navigate to="/login" replace />;
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
                    onClick={() => { clearAuth(); nav("/login"); }}>⎋</button>
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
            ЖИГҮҮР ЗАМ ХХК <i /> {pageTitle(loc.pathname).toUpperCase()} <i /> {todayIso()}
          </span>
          {/* Түрээс/Худалдаа энд байсан: топбарын баруун дээд буланд, 36px
              саарал сегмент болж — Отгоо түүнийг ХЭЗЭЭ Ч анзаараагүй, атал тэр
              нь доорх бүх KPI-г сольж байв. Одоо хоёр хуудас дээрээ, KPI-н яг
              дээр, 44px улбар шар товч болж зогсоно (ScopeSwitch). */}
          <div className="jz-topbar-actions">
            <span className="top-pulse" title="Систем хэвийн ажиллаж байна" />
          </div>
        </div>
        <div className="jz-content">
          <ErrorBoundary key={loc.pathname}>{children}</ErrorBoundary>
        </div>
      </main>

      {pw && <ChangePassword onClose={() => setPw(false)} />}
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

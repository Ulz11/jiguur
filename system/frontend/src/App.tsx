import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, createContext, useContext, useState, useEffect } from "react";
import { user, clearAuth } from "./api";
import { ToastProvider } from "./ui";
import ErrorBoundary from "./components/ErrorBoundary";
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
import Audit from "./pages/Audit";
import SettingsPage from "./pages/SettingsPage";

/* ---------- Глобал Түрээс/Худалдаа scope ---------- */
const ScopeCtx = createContext<{ scope: string; setScope: (s: string) => void }>({ scope: "all", setScope: () => {} });
export const useScope = () => useContext(ScopeCtx);

const NAV = [
  { to: "/", label: "Дашбоард", icon: "▦" },
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

const TITLES: Record<string, string> = {
  "/": "Удирдлагын төв", "/contracts": "Гэрээнүүд", "/contracts/new": "Шинэ гэрээ",
  "/clients": "Харилцагч", "/collections": "Авлага цуглуулах", "/warehouse": "Агуулах",
  "/warehouse/stocktake": "Тооллого", "/barter": "Бартер",
  "/machines": "Механизм", "/loans": "Зээл / Өглөг", "/salary": "Цалин",
  "/reports": "Тайлан", "/analytics": "Аналитик", "/audit": "Үйлдлийн бүртгэл",
  "/settings": "Тохиргоо",
};

function Shell({ children }: { children: ReactNode }) {
  const u = user();
  const nav = useNavigate();
  const loc = useLocation();
  const { scope, setScope } = useScope();
  const [pw, setPw] = useState(false);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("jz_nav") === "min");

  useEffect(() => {
    document.title = `${TITLES[loc.pathname] || "Жигүүр Зам"} · Жигүүр Зам`;
    setMenu(false);
  }, [loc.pathname]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      localStorage.setItem("jz_nav", c ? "full" : "min");
      return !c;
    });
  };

  if (!u) return <Navigate to="/login" replace />;
  const showScope = ["/", "/contracts"].includes(loc.pathname);
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
    <div className="jz-app-shell">
      {menu && <div className="jz-scrim" onClick={() => setMenu(false)} />}
      <aside className={`jz-sidebar ${menu ? "open" : ""} ${collapsed ? "collapsed" : ""}`}
             aria-label="Үндсэн навигаци">
        <div className="brand-plate">
          <img src={collapsed ? brandMark : brandLogo} alt="Жигүүр Зам ХХК"
               className={collapsed ? "brand-mark-img" : ""} />
          <button className="jz-drawer-close" onClick={() => setMenu(false)} aria-label="Хаах">×</button>
        </div>
        <div className="nav-caption">ҮЙЛ АЖИЛЛАГАА</div>
        <nav className="jz-nav">{workNav.map(navItem)}</nav>
        {orgNav.length > 0 && (
          <><div className="nav-caption">БАЙГУУЛЛАГА</div><nav className="jz-nav">{orgNav.map(navItem)}</nav></>
        )}
        <div className="mt-auto side-foot-card p-3.5 flex items-center gap-2.5">
          <div className="user-monogram">{u.name.slice(0, 2)}</div>
          <div className="min-w-0 relative z-[1] nav-label">
            <div className="text-[13px] font-semibold truncate">{u.name}</div>
            <div className="text-[11px] opacity-70">{roleLabel}</div>
          </div>
          <div className="ml-auto relative z-[1] flex gap-2 shrink-0 nav-label">
            <button className="text-white/70 hover:text-white transition text-[13px]" title="Нууц үг солих"
                    onClick={() => setPw(true)}>🔑</button>
            <button className="text-white/70 hover:text-white transition" title="Гарах"
                    onClick={() => { clearAuth(); nav("/login"); }}>⎋</button>
          </div>
        </div>
      </aside>

      <main className="jz-main">
        <div className="jz-topbar">
          <button className="jz-burger" onClick={() => setMenu(true)} aria-label="Цэс">☰</button>
          <button className="jz-collapse" onClick={toggleCollapse}
                  title={collapsed ? "Цэсийг дэлгэх" : "Цэсийг хураах"}
                  aria-label={collapsed ? "Цэсийг дэлгэх" : "Цэсийг хураах"}>
            {collapsed ? "»" : "«"}
          </button>
          <span className="jz-location">
            ЖИГҮҮР ЗАМ ХХК <i /> {TITLES[loc.pathname]?.toUpperCase() || ""} <i /> {new Date().toISOString().slice(0, 10)}
          </span>
          <div className="jz-topbar-actions">
            {showScope && (
              <div className="segment">
                {[["all", "Бүгд"], ["rent", "Түрээс"], ["sale", "Худалдаа"]].map(([v, l]) => (
                  <button key={v} onClick={() => setScope(v)} className={scope === v ? "on" : ""}>{l}</button>
                ))}
              </div>
            )}
            <span className="top-pulse" title="Систем хэвийн ажиллаж байна" />
          </div>
        </div>
        <div className="jz-content">
          <ErrorBoundary key={loc.pathname}>{children}</ErrorBoundary>
        </div>
      </main>

      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
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

export default function App() {
  const [scope, setScope] = useState("all");
  return (
    <ToastProvider>
      <ScopeCtx.Provider value={{ scope, setScope }}>
        <BrowserRouter>
          <Routes>
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
            <Route path="/barter" element={<Shell><Barter /></Shell>} />
            <Route path="/machines" element={<Shell><Machines /></Shell>} />
            <Route path="/loans" element={<Shell><Loans /></Shell>} />
            <Route path="/salary" element={<Shell><Salary /></Shell>} />
            <Route path="/reports" element={<Shell><Reports /></Shell>} />
            <Route path="/settings" element={<Shell><SettingsPage /></Shell>} />
            <Route path="*" element={<Shell><NotFound /></Shell>} />
          </Routes>
        </BrowserRouter>
      </ScopeCtx.Provider>
    </ToastProvider>
  );
}

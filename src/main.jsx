import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Layers, LogOut } from "lucide-react";
import Workbench from "./features/workbench/Workbench.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import AssetsPage from "./pages/AssetsPage.jsx";
import ReviewPage from "./pages/ReviewPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import { authApi } from "./services/authApi.js";
import "./styles.css";
import "./pages/pages.css";
const routes = {
  home: "首页",
  assets: "素材池",
  workbench: "工作台",
  review: "复核记录",
  settings: "设置",
};
function App() {
  const readRoute = () => {
    const key = location.hash.slice(2).split("?")[0];
    return routes[key] ? key : "home";
  };
  const [page, setPage] = useState(readRoute);
  const [user, setUser] = useState(undefined);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    let live = true;
    authApi.me().then(({ user: current }) => {
      if (live) setUser(current);
    }).catch(() => {
      if (live) setUser(null);
    });
    const onUnauthorized = () => setUser(null);
    window.addEventListener("glads-auth-required", onUnauthorized);
    return () => {
      live = false;
      window.removeEventListener("glads-auth-required", onUnauthorized);
    };
  }, []);
  useEffect(() => {
    const onHash = () => setPage(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  async function logout() {
    setLogoutError("");
    try {
      await authApi.logout();
      setUser(null);
      location.hash = "#/login";
    } catch (error) {
      setLogoutError(error.message);
    }
  }
  if (user === undefined) return <div className="service-state">正在载入工作台…</div>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;
  return (
    <>
      <header className="app-header">
        <a className="brand" href="#/workbench">
          <span className="brand-mark">
            <Layers size={24} strokeWidth={1.3} />
          </span>
          <div>
            <strong>
              GLADS<span>studio</span>
            </strong>
            <small>敦煌壁画数字修复平台</small>
          </div>
        </a>
        <nav aria-label="主导航">
          {Object.entries(routes).map(([key, title]) => (
            <a
              key={key}
              href={`#/${key}`}
              className={page === key ? "active" : ""}
            >
              {title}
              {page === key && <span />}
            </a>
          ))}
        </nav>
        <div className="user-chip">
          <span className="avatar">{user.displayName.slice(0, 1)}</span>
          <div>
            {user.displayName}<small>项目成员</small>
          </div>
          <button className="header-logout" aria-label="退出登录" title="退出登录" onClick={logout}><LogOut size={16} /></button>
          {logoutError && <span role="alert">{logoutError}</span>}
        </div>
      </header>
      <div hidden={page !== "workbench"}>
        <Workbench active={page === "workbench"} user={user} />
      </div>
      {page === "home" && <HomePage />}
      {page === "assets" && <AssetsPage />}
      {page === "review" && <ReviewPage />}
      {page === "settings" && <SettingsPage user={user} onUserChanged={setUser} />}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);

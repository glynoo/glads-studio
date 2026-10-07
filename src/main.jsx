import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Layers } from "lucide-react";
import Workbench from "./features/workbench/Workbench.jsx";
import HomePage from "./pages/HomePage.jsx";
import AssetsPage from "./pages/AssetsPage.jsx";
import ReviewPage from "./pages/ReviewPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import "./styles.css";
import "./pages/pages.css";
const routes = {
  home: "首页",
  assets: "素材池",
  workbench: "工作台",
  review: "审核",
  settings: "设置",
};
function App() {
  const readRoute = () => {
    const key = location.hash.slice(2).split("?")[0];
    return routes[key] ? key : "workbench";
  };
  const [page, setPage] = useState(readRoute);
  useEffect(() => {
    const onHash = () => setPage(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
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
          <span className="avatar">G</span>
          <div>
            Golden20 项目<small>案例复核</small>
          </div>
        </div>
      </header>
      <div hidden={page !== "workbench"}>
        <Workbench active={page === "workbench"} />
      </div>
      {page === "home" && <HomePage />}
      {page === "assets" && <AssetsPage />}
      {page === "review" && <ReviewPage />}
      {page === "settings" && <SettingsPage />}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);

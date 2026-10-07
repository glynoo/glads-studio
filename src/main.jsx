import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Layers, ChevronDown } from "lucide-react";
import Workbench from "./features/workbench/Workbench.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import "./styles.css";
const routes = {
  home: "首页",
  assets: "素材池",
  workbench: "工作台",
  review: "审核",
  settings: "设置",
};
function App() {
  const readRoute = () => {
    const key = location.hash.slice(2);
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
          <span className="avatar">研</span>
          <div>
            项目研究组<small>Golden20 复核</small>
          </div>
        </div>
      </header>
      <div hidden={page !== "workbench"}>
        <Workbench />
      </div>
      {page !== "workbench" && <Placeholder title={routes[page]} />}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);

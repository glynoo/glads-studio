import React from "react";
import { FolderOpen, Search, FileImage } from "lucide-react";
import { Panel } from "../../components/UI.jsx";
import { statusLabel } from "./reviewLabels.js";
export default function CaseNavigation({
  filtered,
  cases,
  caseId,
  changeCase,
  query,
  setQuery,
  filter,
  setFilter,
}) {
  return (
    <aside className="left-column">
      <Panel
        title="案例导航"
        eyebrow="01 / CASES"
        extra={<FolderOpen size={16} />}
        className="explorer"
      >
        <div className="search">
          <Search size={15} />
          <input
            aria-label="搜索案例"
            placeholder="案例编号或文件名"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="task-filter"
          aria-label="筛选案例"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["全部", "待处理", "已有判断", "高风险"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <div className="file-list">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              className={`file-item ${entry.id === caseId ? "active" : ""}`}
              onClick={() => changeCase(entry.id)}
            >
              <img src={entry.assets.original} alt="" loading="lazy" />
              <span>
                <strong>{entry.id}</strong>
                <span className={entry.semanticRisk ? "text-amber" : ""}>
                  {statusLabel(entry)}
                </span>
              </span>
              {entry.id === caseId && <span className="active-mark" />}
            </button>
          ))}
        </div>
        <div className="file-footer">
          <FileImage size={14} />
          {cases.length} 个案例 ·{" "}
          {cases.filter((c) => c.latestReview).length} 个已有判断
        </div>
      </Panel>
      <Panel
        title="复核进度"
        eyebrow="02 / PROGRESS"
        extra={<span className="tiny">Golden20</span>}
        className="progress-panel"
      >
        <div className="progress-number">
          <strong>
            {cases.filter((c) => c.latestReview).length}
            <small> / {cases.length}</small>
          </strong>
          <span>已有判断记录</span>
        </div>
        <div className="progress-track">
          <span
            style={{
              width: `${(cases.filter((c) => c.latestReview).length / cases.length) * 100}%`,
            }}
          />
        </div>
        <div className="slice-map">
          {cases.map((entry, index) => (
            <button
              key={entry.id}
              className={`${entry.id === caseId ? "current" : ""} ${entry.latestReview ? "done" : ""}`}
              aria-label={`跳转 ${entry.id}`}
              onClick={() => changeCase(entry.id)}
            >
              {String(index + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
        <p className="tiny">
          按案例查看人工复核进度。
        </p>
      </Panel>
    </aside>
  );
}

import React, { useRef, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "../components/UI.jsx";
import { reviewApi } from "../services/reviewApi.js";
import { categoryLabels } from "./poolFilters.js";

export function PoolNavigation({
  view,
  project,
  pool,
  onNavigate,
  onCreateProject,
}) {
  return (
    <nav className="pool-navigation" aria-label="素材池内容视图">
      {[
        ["overview", "洞窟总览"],
        ["recent", "最近上传"],
        ["favorites", `我的收藏 (${pool.favorites.length})`],
        ["project", "我的项目"],
        ["mask", "掩码资产"],
        ["model", "模型资产"],
        ["evidence", "运行证据"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-current={view === value ? "page" : undefined}
          onClick={() => onNavigate(value)}
        >
          {label}
        </button>
      ))}
      {view === "project" && (
        <>
          <select
            aria-label="选择项目文件夹"
            value={project || ""}
            onChange={(e) => onNavigate("project", e.target.value)}
          >
            <option value="">选择项目</option>
            {pool.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={onCreateProject}>
            新建项目
          </button>
        </>
      )}
    </nav>
  );
}

export function PoolFilters({
  items,
  pool,
  filters,
  onChange,
  onReset,
  includeCave = false,
}) {
  const set = (key) => (event) =>
    onChange({ ...filters, [key]: event.target.value });
  const tags = [
    ...new Set([...pool.tags, ...items.flatMap((item) => item.tags || [])]),
  ];
  return (
    <div className="pool-filters">
      {includeCave && (
        <label>
          洞窟
          <select value={filters.cave || ""} onChange={set("cave")}>
            <option value="">全部洞窟</option>
            {pool.caves.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        壁面位置
        <select value={filters.mural || ""} onChange={set("mural")}>
          <option value="">全部区域</option>
          {[...new Set(items.map((item) => item.mural))].sort().map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label>
        图片分类
        <select value={filters.category || ""} onChange={set("category")}>
          <option value="">全部分类</option>
          {Object.entries(categoryLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        内容标签
        <select value={filters.tag || ""} onChange={set("tag")}>
          <option value="">全部标签</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        排序
        <select value={filters.sort || "recent"} onChange={set("sort")}>
          <option value="recent">最近上传</option>
          <option value="cave">洞窟编号</option>
          <option value="name">文件名称</option>
          {includeCave && <option value="count">素材数量</option>}
        </select>
      </label>
      <button className="text-link" type="button" onClick={onReset}>
        清除筛选
      </button>
    </div>
  );
}

export function PoolToolbar({ navigation, query, onQuery, ...filterProps }) {
  return (
    <div className="pool-toolbar">
      {navigation}
      <div
        className="pool-toolbar-controls"
        role="search"
        aria-label="素材筛选"
      >
        <label className="inline-search pool-toolbar-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="搜索洞窟、位置或文件名"
            aria-label="搜索洞窟、位置或文件名"
          />
        </label>
        <PoolFilters {...filterProps} />
      </div>
    </div>
  );
}

export function CaveEditor({ cave, onClose, onSaved }) {
  const [fields, setFields] = useState({
    name: cave?.name || "",
    period: cave?.period || "",
    note: cave?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(e) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const state = await reviewApi.saveCave({
        ...fields,
        previous: cave?.name,
      });
      onSaved(state, fields.name.trim());
      onClose();
    } catch (reason) {
      setError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={cave ? "编辑洞窟" : "新建洞窟"}
      onClose={() => !pending.current && onClose()}
    >
      <form className="upload-form" onSubmit={submit}>
        {[
          ["name", "洞窟编号或名称", 100],
          ["period", "时代", 100],
          ["note", "备注", 1000],
        ].map(([key, label, max]) => (
          <label key={key}>
            {label}
            {key === "note" ? (
              <textarea
                rows={3}
                value={fields[key]}
                maxLength={max}
                disabled={busy}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            ) : (
              <input
                required
                value={fields[key]}
                maxLength={max}
                placeholder={key === "name" ? "例如：第 285 窟" : "例如：北魏"}
                disabled={busy}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            )}
          </label>
        ))}
        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : "保存洞窟"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProjectCreator({ pool, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(e) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const state = await pool.change({ action: "project", name });
      onCreated(state.projects.at(-1).id);
      onClose();
    } catch (reason) {
      setError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title="新建项目文件夹" onClose={() => !pending.current && onClose()}>
      <form className="upload-form" onSubmit={submit}>
        <label>
          项目名称
          <input
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在创建…" : "创建项目"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

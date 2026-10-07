import CaseNavigation from "./CaseNavigation.jsx";
import AnnotationsPanel from "./AnnotationsPanel.jsx";
import CaseContext from "./CaseContext.jsx";
import DecisionPanel from "./DecisionPanel.jsx";
import { decisionLabels, statusLabel } from "./reviewLabels.js";
import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
  History,
  Save,
} from "lucide-react";
import { Badge, Modal } from "../../components/UI.jsx";
import { reviewApi } from "../../services/reviewApi.js";
import ImageViewer from "./ImageViewer.jsx";

const blankDraft = {
  candidate: null,
  decision: "approve",
  notes: "",
  reviewer: "",
};
const draftKey = (id) => `glads-reference-draft:${id}`;
function readDraft(id) {
  try {
    return { ...blankDraft, ...JSON.parse(localStorage.getItem(draftKey(id))) };
  } catch {
    return { ...blankDraft };
  }
}
function firstAvailable(item) {
  return (
    ["R3", "R7", "R12"].find((key) => item?.variants?.[key]?.image) || null
  );
}

function caseFromHash() {
  if (!location.hash.startsWith("#/workbench?")) return null;
  const id = new URLSearchParams(location.hash.split("?")[1]).get("case");
  return /^case_\d{4}$/.test(id || "") ? id : null;
}

export default function Workbench({ active = true }) {
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState(null);
  const [item, setItem] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState(null);
  const [draft, setDraft] = useState(blankDraft);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(null);
  const [note, setNote] = useState("");
  const [noteCategory, setNoteCategory] = useState("纹样延续");
  const [focus, setFocus] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    reviewApi
      .listCases()
      .then((result) => {
        if (!live) return;
        setCases(result.items);
        const linked = caseFromHash();
        setCaseId(result.items.some((entry) => entry.id === linked) ? linked : result.items[0]?.id || null);
        setLoadError("");
      })
      .catch((error) => {
        if (live) setLoadError(error.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const onHash = () => {
      const id = caseFromHash();
      if (id && cases.some((entry) => entry.id === id)) setCaseId(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [cases]);
  useEffect(() => {
    if (!caseId) return;
    let live = true;
    setItem(null);
    const stored = readDraft(caseId);
    setDraft(stored);
    reviewApi
      .getCase(caseId)
      .then((result) => {
        if (!live) return;
        setItem(result);
        setCandidate(
          result.variants[stored.candidate]?.image
            ? stored.candidate
            : firstAvailable(result),
        );
        setLoadError("");
      })
      .catch((error) => {
        if (live) setLoadError(error.message);
      });
    return () => {
      live = false;
    };
  }, [caseId]);
  useEffect(() => {
    document.body.classList.toggle("inspection-mode", full && active);
    return () => document.body.classList.remove("inspection-mode");
  }, [full, active]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const selected = item?.variants?.[candidate];
  const hasRisk = !!(item?.semanticRisk || item?.riskReasons?.length);
  const notes =
    item?.annotations?.filter((a) => a.candidate === candidate) || [];
  const views = item
    ? {
        original: item.assets.original,
        mask: item.assets.exactMask,
        R3: item.variants.R3?.image,
        R7: item.variants.R7?.image,
        R12: item.variants.R12?.image,
      }
    : null;
  function updateDraft(change) {
    setDraft((value) => ({ ...value, ...change }));
  }
  function saveDraft(announce = true) {
    try {
      localStorage.setItem(
        draftKey(caseId),
        JSON.stringify({ ...draft, candidate }),
      );
      if (announce) setToast("未提交的表单已保存在此浏览器");
      return true;
    } catch {
      setToast("草稿保存失败，请保留当前页面");
      return false;
    }
  }
  function changeCase(id) {
    saveDraft(false);
    setCaseId(id);
    setFocus(null);
    location.hash = `#/workbench?case=${id}`;
  }
  async function refreshCase(id = caseId) {
    const [detail, list] = await Promise.all([
      reviewApi.getCase(id),
      reviewApi.listCases(),
    ]);
    setItem(detail);
    setCases(list.items);
  }
  function startNote(point) {
    setNote("");
    setModal({ type: "note", point });
  }
  async function commitNote() {
    if (!note.trim() || !draft.reviewer.trim())
      return setToast("请填写复核人和批注内容");
    setBusy(true);
    try {
      await reviewApi.addAnnotation(caseId, {
        candidate: modal.point.candidate,
        x: modal.point.x,
        y: modal.point.y,
        category: noteCategory,
        text: note.trim(),
        reviewer: draft.reviewer.trim(),
      });
      await refreshCase();
      setModal(null);
      setToast("定位批注已保存到本地服务");
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy(false);
    }
  }
  function prepareReview() {
    if (!draft.reviewer.trim() || !draft.notes.trim())
      return setToast("请填写复核人与判断理由");
    if (draft.decision === "approve" && (!selected?.image || hasRisk))
      return setToast("该案例存在风险或候选缺失，请选择拒绝、二次修复或转专家");
    setModal({ type: "review" });
  }
  async function commitReview() {
    setBusy(true);
    try {
      await reviewApi.addReview(caseId, {
        candidate: selected?.image ? candidate : null,
        decision: draft.decision,
        reviewer: draft.reviewer.trim(),
        notes: draft.notes.trim(),
      });
      await refreshCase();
      saveDraft(false);
      setModal(null);
      setToast("人工复核已保存，历史记录不会覆盖");
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return <div className="service-state">正在读取 Golden20 案例…</div>;
  if (loadError)
    return (
      <div className="service-state">
        <AlertTriangle size={20} />
        <h2>无法读取复核数据</h2>
        <p>{loadError}</p>
        <p>在项目目录运行 npm run dev，再重新打开页面。</p>
      </div>
    );
  if (!item || !candidate)
    return <div className="service-state">正在载入案例…</div>;
  const currentIndex = cases.findIndex((entry) => entry.id === caseId);
  const filtered = cases.filter(
    (entry) =>
      (filter === "全部" ||
        (filter === "已复核" && entry.latestReview) ||
        (filter === "待复核" && !entry.latestReview) ||
        (filter === "高风险" && entry.semanticRisk)) &&
      `${entry.id} ${entry.imageName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const imageRun = {
    id: item.id,
    failed: false,
    annotations: item.annotations,
  };
  return (
    <div className={`workbench ${full ? "is-full" : ""}`}>
      <div className="task-heading">
        <div>
          <div className="breadcrumb">GLADS Restore / Golden20 / {item.id}</div>
          <div className="title-line">
            <h1>
              修复工作台<span>Case review</span>
            </h1>
            <Badge tone={hasRisk ? "warning" : ""}>{statusLabel(item)}</Badge>
          </div>
        </div>
        <div className="task-actions">
          <span className="demo-label">
            <span />
            人工复核
          </span>
          <button onClick={() => setModal({ type: "history" })}>
            <History size={15} />
            复核历史 <span className="count">{item.reviews.length}</span>
          </button>
          <button onClick={() => setModal({ type: "source" })}>
            来源与版本
          </button>
          {full && <button onClick={() => setDrawer(!drawer)}>判断依据</button>}
        </div>
      </div>
      <div className="workbench-grid">
        <CaseNavigation
          filtered={filtered}
          cases={cases}
          caseId={caseId}
          changeCase={changeCase}
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
        />
        <main className="center-column">
          <ImageViewer
            candidate={candidate}
            setCandidate={setCandidate}
            run={imageRun}
            assets={views}
            onPoint={startNote}
            focus={focus}
            full={full}
            setFull={setFull}
          />
          <AnnotationsPanel
            item={item}
            candidate={candidate}
            notes={notes}
            setFocus={setFocus}
          />
        </main>
        <aside className={`right-column ${drawer ? "drawer-open" : ""}`}>
          <CaseContext
            item={item}
            candidate={candidate}
            selected={selected}
            setModal={setModal}
          />
          <DecisionPanel
            item={item}
            candidate={candidate}
            selected={selected}
            draft={draft}
            hasRisk={hasRisk}
            setCandidate={setCandidate}
            updateDraft={updateDraft}
          />
        </aside>
      </div>
      <footer className="decision-bar">
        <div className="footer-context">
          <span className="save-dot" />
          本地复核服务
          <span className="footer-separator" />
          {item.id} · {candidate}
        </div>
        <div className="footer-buttons">
          <button
            className="arrow-button"
            disabled={currentIndex <= 0}
            aria-label="上一案例"
            onClick={() => changeCase(cases[currentIndex - 1].id)}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            className="arrow-button"
            disabled={currentIndex >= cases.length - 1}
            aria-label="下一案例"
            onClick={() => changeCase(cases[currentIndex + 1].id)}
          >
            <ArrowRight size={16} />
          </button>
          <a
            className="save-button export-button"
            href={reviewApi.exportUrl}
            download
          >
            <Download size={15} />
            导出记录
          </a>
          <button className="save-button" onClick={() => saveDraft()}>
            <Save size={15} />
            保存表单
          </button>
          <button className="primary" onClick={prepareReview}>
            记录人工复核 <ArrowUpRight size={16} />
          </button>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              note: "添加定位批注",
              review: "核对人工复核结论",
              source: "Golden20 来源信息",
              history: "人工复核历史",
            }[modal.type]
          }
          onClose={() => setModal(null)}
          wide={modal.type === "source"}
        >
          {modal.type === "note" && (
            <>
              <p className="modal-caption">
                {item.id} / {modal.point.candidate} · 图像坐标 (
                {Math.round(modal.point.x * 639)},{" "}
                {Math.round(modal.point.y * 639)})
              </p>
              <label className="field-label">
                问题类型
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value)}
                >
                  {["纹样延续", "边缘衔接", "色彩偏差", "文字残缺", "其他"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field-label">
                批注内容
                <textarea
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows="4"
                />
              </label>
              <label className="field-label">
                复核人
                <input
                  value={draft.reviewer}
                  onChange={(e) => updateDraft({ reviewer: e.target.value })}
                />
              </label>
              <div className="modal-actions">
                <button onClick={() => setModal(null)}>取消</button>
                <button
                  className="primary"
                  disabled={busy || !note.trim() || !draft.reviewer.trim()}
                  onClick={commitNote}
                >
                  保存批注
                </button>
              </div>
            </>
          )}
          {modal.type === "review" && (
            <>
              <p className="modal-caption">
                该结论会追加到本地记录，之前的决定会保留。
              </p>
              <dl className="confirm-details">
                <div>
                  <dt>案例</dt>
                  <dd>{item.id}</dd>
                </div>
                <div>
                  <dt>来源</dt>
                <dd>Golden20 / Big-LaMa</dd>
                </div>
                <div>
                  <dt>候选</dt>
                  <dd>
                    {candidate} · {selected?.sha256?.slice(0, 16)}…
                  </dd>
                </div>
                <div>
                  <dt>结论</dt>
                  <dd>{decisionLabels[draft.decision]}</dd>
                </div>
                <div>
                  <dt>复核人</dt>
                  <dd>{draft.reviewer}</dd>
                </div>
                <div>
                  <dt>依据</dt>
                  <dd>{draft.notes}</dd>
                </div>
                <div>
                  <dt>批注</dt>
                  <dd>{notes.length} 条</dd>
                </div>
              </dl>
              <p className="quiet-note">
                结论绑定当前案例与候选版本；历史记录会继续保留。
              </p>
              <div className="modal-actions">
                <button onClick={() => setModal(null)}>继续检查</button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={commitReview}
                >
                  确认保存结论
                </button>
              </div>
            </>
          )}
          {modal.type === "source" && (
            <>
              <p className="modal-caption">
                GLADS v1.0 · Golden20
              </p>
              <div className="source-images">
                <img src={item.assets.original} alt="原图" />
                <img src={item.assets.maskOverlay} alt="融合掩码标记图" />
              </div>
              <p>
                本案例包含原图、精确二值融合掩码与不同边界上下文的候选。
                处理来源：Big-LaMa。
              </p>
              <ol className="source-chain">
                <li>
                  {item.imageName}
                  <span>原图 / 640 × 640</span>
                </li>
                <li>
                  融合执行掩码<span>已关联当前案例</span>
                </li>
                <li>
                  R3 / R7 / R12<span>有图的候选可比较；缺失项明确标注</span>
                </li>
                <li>
                  人工复核<span>独立保存，之前记录继续保留</span>
                </li>
              </ol>
            </>
          )}
          {modal.type === "history" && (
            <>
              {item.reviews.length ? (
                item.reviews
                  .slice()
                  .reverse()
                  .map((event) => (
                    <article className="history-item" key={event.id}>
                      <Badge>{decisionLabels[event.decision]}</Badge>
                      <strong>{event.candidate || "整组候选"}</strong>
                      <p>{event.notes}</p>
                      <small>
                        {event.reviewer} · {event.created_at} · {event.source}
                      </small>
                    </article>
                  ))
              ) : (
                <div className="empty-history">
                  <History size={32} />
                  <p>还没有人工复核记录</p>
                  <small>保存表单与定位批注不会自动批准候选。</small>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

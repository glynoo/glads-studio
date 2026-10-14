import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Search } from "lucide-react";
import { decisionLabels, riskLabels } from "../features/workbench/reviewLabels.js";
import { reviewApi } from "../services/reviewApi.js";
import { useCases } from "./useCases.js";
import { CaseAnchor, DataState, humanTime, PageFrame } from "./PageParts.jsx";
import "./review-redesign.css";

const FILTERS = [["all", "全部"], ["pending", "待处理"], ["recorded", "已有判断"], ["risk", "风险案例"]];
const hasRisk = (item) => !!(item.semanticRisk || item.riskReasons.length);
const pending = (item) => !item.latestReview || ["reject", "defer_expert", "secondary_repair_required"].includes(item.latestReview.decision);
function initialFilter() {
  const key = new URLSearchParams(location.hash.split("?")[1] || "").get("filter");
  return FILTERS.some(([value]) => value === key) ? key : "all";
}

export default function ReviewPage() {
  const { cases, loading, error, refresh } = useCases();
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [candidate, setCandidate] = useState("R3");
  const [decision, setDecision] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const visible = useMemo(() => cases.filter((item) => {
    const matchesFilter = filter === "all" || (filter === "pending" && pending(item)) ||
      (filter === "recorded" && !!item.latestReview) || (filter === "risk" && hasRisk(item));
    return matchesFilter && `${item.id} ${item.imageName} ${item.latestReview?.reviewer || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [cases, filter, query]);
  const selected = visible.find((item) => item.id === selectedId) || visible[0];
  const counts = {
    all: cases.length,
    pending: cases.filter(pending).length,
    recorded: cases.filter((item) => item.latestReview).length,
    risk: cases.filter(hasRisk).length,
    approved: cases.filter((item) => item.latestReview?.decision === "approve").length,
    secondary: cases.filter((item) => item.latestReview?.decision === "secondary_repair_required").length,
  };

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let live = true;
    setDetail(null); setDetailError(""); setMessage(""); setDecision(""); setNotes("");
    reviewApi.getCase(selected.id).then((result) => {
      if (!live) return;
      setDetail(result);
      const latestCandidate = result.reviews.at(-1)?.candidate;
      setCandidate(latestCandidate && result.variants[latestCandidate]?.image
        ? latestCandidate : ["R3", "R7", "R12"].find((key) => result.variants[key]?.image) || "R3");
    }).catch((reason) => { if (live) setDetailError(reason.message); });
    return () => { live = false; };
  }, [selected?.id]);

  async function submit(event) {
    event.preventDefault();
    if (!selected || !candidate || !decision || !notes.trim()) return;
    setBusy(true); setMessage("");
    try {
      await reviewApi.addReview(selected.id, { candidate, decision, notes: notes.trim() });
      const [nextDetail] = await Promise.all([reviewApi.getCase(selected.id), refresh()]);
      setDetail(nextDetail); setDecision(""); setNotes(""); setMessage("判断已记录");
    } catch (reason) { setMessage(reason.message); }
    finally { setBusy(false); }
  }

  const latest = detail?.reviews.at(-1);
  const selectedCandidate = detail?.variants[candidate];
  return (
    <PageFrame eyebrow="图像证据与判断" title="人工复核" subtitle="对照原图和修复候选，记录选择依据并回看历史。" className="page-review review-redesign"
      actions={<a className="inner-primary-link" href={reviewApi.exportUrl} download><Download size={16} /> 导出复核记录</a>}>
      <DataState loading={loading} error={error}>
        <div className="review-stat-ribbon">
          <div><strong>{counts.all}</strong><span>案例总数</span></div>
          <div><strong>{counts.pending}</strong><span>待处理</span></div>
          <div><strong>{counts.approved}</strong><span>已采纳</span></div>
          <div><strong>{counts.secondary}</strong><span>二次处理</span></div>
          <div className="review-stat-progress"><span>已有人工判断</span><strong>{counts.recorded} / {counts.all}</strong><i><b style={{ width: `${counts.all ? counts.recorded / counts.all * 100 : 0}%` }} /></i></div>
        </div>
        <div className="review-filter-row review-filter-redesign">
          <div className="pill-tabs">{FILTERS.map(([key, label]) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}<span>{counts[key]}</span></button>)}</div>
          <label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索案例、文件或复核人" aria-label="搜索复核记录" /></label>
        </div>
        <div className="review-workspace">
          <aside className="review-case-rail">
            <div className="review-rail-head"><span>CASE QUEUE / 案例</span><strong>{visible.length}</strong></div>
            <div className="review-case-scroll">{visible.map((item) => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
              <img src={item.assets.original} alt="" loading="lazy" /><span><strong>{item.id}</strong><small>{item.latestReview ? decisionLabels[item.latestReview.decision] : "待人工判断"}{hasRisk(item) ? " · 风险" : ""}</small></span><ArrowRight size={14} />
            </button>)}</div>
          </aside>
          {selected ? <>
            <section className="review-visual-stage">
              <div className="review-stage-head"><div><span>CASE / {selected.id}</span><h2>{selected.imageName}</h2></div><CaseAnchor id={selected.id} className="review-workbench-link">在工作台检查</CaseAnchor></div>
              {detailError && <p className="detail-error">{detailError}</p>}
              <div className="review-main-visual">
                {selectedCandidate?.image ? <img src={selectedCandidate.image} alt={`${selected.id} ${candidate} 候选`} /> : <div className="review-image-empty">暂无候选图像</div>}
                <span className="review-image-corner">{candidate} / 数字修复候选</span>
              </div>
              <div className="review-evidence-strip">
                <div><img src={selected.assets.original} alt={`${selected.id} 原图`} /><span>原图</span></div>
                <div><img src={selected.assets.maskOverlay} alt={`${selected.id} 融合掩码`} /><span>执行掩码</span></div>
                {["R3", "R7", "R12"].map((key) => <button key={key} disabled={!selected.variants[key]?.image} className={candidate === key ? "active" : ""} onClick={() => setCandidate(key)}>
                  {selected.variants[key]?.image ? <img src={selected.variants[key].image} alt="" /> : <span className="review-thumb-empty">—</span>}<span>{key}{!selected.variants[key]?.image && " 未生成"}</span>
                </button>)}
              </div>
              <div className="review-stage-foot"><span>{detail?.annotations.length || 0} 条定位批注</span><span>掩码外改动：{selectedCandidate?.outsideMaskChangedPixels ?? "—"} 像素</span></div>
            </section>
            <aside className="review-inspector">
              <div className="review-inspector-title"><span>HUMAN REVIEW / 判断</span><h2>复核依据</h2></div>
              <div className="review-inspector-summary"><span>最近判断</span><strong>{latest ? decisionLabels[latest.decision] : "待人工判断"}</strong>{latest && <p>{latest.reviewer} · {humanTime(latest.created_at)}</p>}</div>
              {hasRisk(selected) && <div className="review-inspector-risk"><strong>风险提示</strong>{selected.riskReasons.length ? selected.riskReasons.map((reason) => <span key={reason}>{riskLabels[reason] || reason}</span>) : <span>请检查图像结构</span>}</div>}
              <form onSubmit={submit} className="review-decision-form"><h3>记录当前判断</h3><label>当前候选<select value={candidate} onChange={(event) => setCandidate(event.target.value)}>{["R3", "R7", "R12"].map((key) => <option key={key} value={key} disabled={!selected.variants[key]?.image}>{key}</option>)}</select></label><label>复核结论<select value={decision} onChange={(event) => setDecision(event.target.value)} required><option value="">请选择</option>{Object.entries(decisionLabels).map(([key, label]) => <option key={key} value={key} disabled={key === "approve" && hasRisk(selected)}>{label}</option>)}</select></label><label>判断理由<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="说明纹样、边缘或掩码范围的判断依据" rows={4} required /></label><button type="submit" disabled={busy || !detail}>{busy ? "正在保存…" : "保存判断"}</button>{message && <p role="status">{message}</p>}</form>
              <div className="review-inspector-history"><h3>判断历史</h3>{detail?.reviews.length ? <ol>{detail.reviews.slice().reverse().map((entry) => <li key={entry.id}><strong>{decisionLabels[entry.decision]} · {entry.candidate || "整组候选"}</strong><small>{entry.reviewer} · {humanTime(entry.created_at)}</small><p>{entry.notes}</p></li>)}</ol> : <p>尚无判断记录</p>}</div>
            </aside>
          </> : <div className="review-no-case">当前筛选下没有案例。</div>}
        </div>
      </DataState>
    </PageFrame>
  );
}

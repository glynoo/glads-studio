import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileImage,
  ScanEye,
} from "lucide-react";
import { decisionLabels, riskLabels } from "../features/workbench/reviewLabels.js";
import { reviewApi } from "../services/reviewApi.js";
import { useCases } from "./useCases.js";
import { CaseAnchor, DataState, humanTime, PageFrame } from "./PageParts.jsx";

function needsAttention(item) {
  return (
    !item.latestReview ||
    ["reject", "defer_expert", "secondary_repair_required"].includes(
      item.latestReview.decision,
    )
  );
}

export default function HomePage() {
  const { cases, loading, error } = useCases();
  const [uploads, setUploads] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [selectedUploadId, setSelectedUploadId] = useState(null);

  useEffect(() => {
    let live = true;
    reviewApi.listMyUploads().then(({ items }) => { if (live) setUploads(items); })
      .catch((reason) => { if (live) setUploadError(reason.message); })
      .finally(() => { if (live) setUploadLoading(false); });
    return () => { live = false; };
  }, []);

  async function confirm(item) {
    setBusyId(item.id);
    setUploadError("");
    try {
      const updated = await reviewApi.confirmUpload(item.id, !item.confirmedAt);
      setUploads((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (reason) { setUploadError(reason.message); }
    finally { setBusyId(null); }
  }

  const pendingUploads = uploads.filter((item) => !item.confirmedAt);
  const confirmedUploads = uploads.length - pendingUploads.length;
  const selectedUpload = uploads.find((item) => item.id === selectedUploadId);
  const recorded = cases.filter((item) => item.latestReview);
  const risk = cases.filter(
    (item) => item.semanticRisk || item.riskReasons.length,
  );
  const waiting = cases.filter(needsAttention);
  const generated = cases.reduce(
    (sum, item) =>
      sum + Object.values(item.variants).filter((v) => v.image).length,
    0,
  );
  const queue = waiting
    .slice()
    .sort(
      (a, b) =>
        Number(!!(b.semanticRisk || b.riskReasons.length)) -
        Number(!!(a.semanticRisk || a.riskReasons.length)),
    )
    .slice(0, 6);
  const recent = recorded
    .slice()
    .sort((a, b) =>
      b.latestReview.created_at.localeCompare(a.latestReview.created_at),
    )
    .slice(0, 4);
  const decisions = [
    ["approve", "已采纳", "#637e62"],
    ["secondary_repair_required", "二次处理", "#ca8c52"],
    ["defer_expert", "转专家", "#a68b58"],
    ["reject", "已驳回", "#ad665a"],
    ["unreviewed", "待判断", "#d1c5b3"],
  ].map(([key, label, color]) => ({
    key, label, color,
    count: cases.filter((item) => key === "unreviewed" ? !item.latestReview : item.latestReview?.decision === key).length,
  }));
  const candidateCoverage = ["R3", "R7", "R12"].map((key) => ({
    key, count: cases.filter((item) => item.variants[key]?.image).length,
  }));
  const completeCandidates = cases.filter((item) => ["R3", "R7", "R12"].every((key) => item.variants[key]?.image)).length;
  const riskCounts = Object.entries(risk.reduce((acc, item) => {
    const reasons = item.riskReasons.length ? item.riskReasons : ["semantic_risk"];
    reasons.forEach((reason) => { acc[reason] = (acc[reason] || 0) + 1; });
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  let colorStart = 0;
  const decisionRing = decisions.map((item) => {
    const stop = colorStart + (cases.length ? item.count / cases.length * 100 : 0);
    const segment = `${item.color} ${colorStart}% ${stop}%`;
    colorStart = stop;
    return segment;
  }).join(", ");

  return (
    <PageFrame
      eyebrow="工作入口"
      title="项目首页"
      subtitle="集中查看案例进度、待办事项与最近的复核记录。"
      className="page-home"
      actions={
        <a className="inner-primary-link" href="#/review">
          查看复核总览 <ArrowRight size={16} />
        </a>
      }
    >
      <DataState loading={loading} error={error}>
        <div className="home-layout">
          <aside className="content-card home-my-tasks">
            <div className="content-head"><div><span className="eyebrow">MY WORK / 素材</span><h2>我的待办</h2></div><span className="soft-count">{pendingUploads.length} 项</span></div>
            {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
            <div className="home-my-task-list">
              {uploadLoading ? <p className="quiet-empty">正在读取上传素材…</p> : pendingUploads.length ? pendingUploads.map((item) => <button key={item.id} onClick={() => { setSelectedUploadId(item.id); document.getElementById("home-upload-tasks")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className={selectedUploadId === item.id ? "active" : ""}><img src={item.imageUrl} alt="" loading="lazy" /><span><strong>{item.cave} · {item.mural}</strong><small>{item.filename}</small></span><ArrowRight size={14} /></button>) : <p className="quiet-empty">当前没有待核对的上传素材。</p>}
            </div>
            <div className="home-my-task-foot"><span>已核对 {confirmedUploads} 项</span><a href="#/assets?section=uploads">查看上传素材 <ArrowRight size={13} /></a></div>
            <div className="home-sidebar-cases"><div className="content-head"><div><span className="eyebrow">GOLDEN20 / 案例</span><h2>待复核案例</h2></div><span className="soft-count">{waiting.length} 例</span></div>{queue.slice(0, 4).map((item) => <CaseAnchor key={item.id} id={item.id} className="home-sidebar-case"><img src={item.assets.original} alt="" loading="lazy" /><span><strong>{item.id}</strong><small>{item.semanticRisk || item.riskReasons.length ? "风险复核" : "待人工判断"}</small></span></CaseAnchor>)}</div>
          </aside>
          <div className="home-main">
        <div className="home-dashboard-grid">
          <section className="content-card home-dashboard-panel">
            <div className="content-head"><div><span className="eyebrow">REVIEW / 状态</span><h2>复核进度分布</h2></div><a href="#/review">查看记录 <ArrowRight size={14} /></a></div>
            <div className="home-decision-chart">
              <div className="home-donut" style={{ background: `conic-gradient(${decisionRing})` }}><div><strong>{recorded.length}</strong><span>已有判断</span></div></div>
              <div className="home-chart-legend">{decisions.map((entry) => <div key={entry.key}><i style={{ background: entry.color }} /><span>{entry.label}</span><strong>{entry.count}</strong></div>)}</div>
            </div>
          </section>
          <section className="content-card home-dashboard-panel">
            <div className="content-head"><div><span className="eyebrow">CANDIDATES / 图像</span><h2>候选图像覆盖</h2></div></div>
            <p className="home-dashboard-caption"><strong>{completeCandidates}</strong> / {cases.length} 个案例有完整三组候选</p>
            <div className="home-coverage-bars">{candidateCoverage.map((entry) => <div key={entry.key}><span>{entry.key}</span><div><i style={{ width: `${cases.length ? entry.count / cases.length * 100 : 0}%` }} /></div><strong>{entry.count}/{cases.length}</strong></div>)}</div>
            <a className="home-dashboard-link" href="#/assets">查看图像资料 <ArrowRight size={14} /></a>
          </section>
          <section className="content-card home-dashboard-panel">
            <div className="content-head"><div><span className="eyebrow">RISK / 提示</span><h2>需要关注的证据</h2></div></div>
            <p className="home-dashboard-caption"><strong>{risk.length}</strong> 个案例带有风险提示</p>
            <div className="home-risk-list">{riskCounts.slice(0, 4).map(([key, count]) => <div key={key}><span>{riskLabels[key] || (key === "semantic_risk" ? "语义结构风险" : key)}</span><strong>{count}</strong></div>)}</div>
            <a className="home-dashboard-link" href="#/review?filter=risk">查看风险案例 <ArrowRight size={14} /></a>
          </section>
        </div>
        <section className="content-card home-upload-panel" id="home-upload-tasks">
          <div className="content-head"><div><span className="eyebrow">UPLOAD / 处理进度</span><h2>任务列表</h2></div><a href="#/assets?section=uploads">管理素材 <ArrowRight size={14} /></a></div>
          <div className="home-upload-stages">
            <div><span>01</span><strong>图像接收</strong><small>{uploads.length}/{uploads.length}</small></div>
            <div><span>02</span><strong>文件校验</strong><small>{uploads.length}/{uploads.length}</small></div>
            <div><span>03</span><strong>素材归档</strong><small>{uploads.length}/{uploads.length}</small></div>
            <div><span>04</span><strong>人工核对</strong><small>{confirmedUploads}/{uploads.length}</small></div>
          </div>
          {uploadLoading ? <p className="quiet-empty">正在读取任务…</p> : uploads.length ? <div className="home-upload-list">{uploads.map((item) => <article key={item.id} className={selectedUpload?.id === item.id ? "selected" : ""}><img src={item.imageUrl} alt="" loading="lazy" /><div className="home-upload-name"><strong>{item.cave} / {item.mural}</strong><small>{item.parentId ? "切片" : "图片"} · {item.filename}</small></div><div className="home-upload-progress"><span>{item.confirmedAt ? "已完成核对" : "待人工核对"} <b>{item.confirmedAt ? 100 : 75}%</b></span><i><em style={{ width: `${item.confirmedAt ? 100 : 75}%` }} /></i></div><a href={`#/assets?section=uploads&asset=${encodeURIComponent(item.id)}`}>查看</a><button disabled={busyId === item.id} onClick={() => confirm(item)}>{item.confirmedAt ? "撤销核对" : "完成核对"}</button></article>)}</div> : <div className="home-upload-empty"><p>上传图片后，接收、校验、归档和人工核对状态会显示在这里。</p><a className="inner-primary-link" href="#/assets?section=uploads">上传素材 <ArrowRight size={14} /></a></div>}
          {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
        </section>
        <div className="summary-grid-page">
          <a href="#/review?filter=pending" className="summary-tile"><ScanEye size={21} /><span>待继续处理</span><strong>{waiting.length}</strong><small>未记录判断，或仍需后续处置</small></a>
          <a href="#/review?filter=recorded" className="summary-tile"><CheckCircle2 size={21} /><span>已有判断</span><strong>{recorded.length}</strong><small>每次提交均保留历史</small></a>
          <a href="#/review?filter=risk" className="summary-tile"><CircleAlert size={21} /><span>风险案例</span><strong>{risk.length}</strong><small>需要逐例查看判断依据</small></a>
          <a href="#/assets" className="summary-tile"><FileImage size={21} /><span>候选图像</span><strong>{generated}</strong><small>可供查看与比较的结果</small></a>
        </div>
        <div className="home-columns">
          <section className="content-card">
            <div className="content-head">
              <div>
                <span className="eyebrow">NEXT / 待处理</span>
                <h2>优先查看</h2>
              </div>
              <a href="#/review?filter=pending">
                查看全部 <ArrowRight size={14} />
              </a>
            </div>
            {queue.length ? (
              <div className="home-queue">
                {queue.map((item) => (
                  <article key={item.id}>
                    <img
                      src={item.assets.original}
                      alt={`${item.id} 原图`}
                      loading="lazy"
                    />
                    <div>
                      <strong>{item.id}</strong>
                      <small>{item.imageName}</small>
                    </div>
                    <span
                      className={`queue-state ${item.semanticRisk || item.riskReasons.length ? "risk" : ""}`}
                    >
                      {item.semanticRisk || item.riskReasons.length
                        ? "风险复核"
                        : item.latestReview
                          ? "继续处置"
                          : "待人工判断"}
                    </span>
                    <CaseAnchor id={item.id} className="icon-case-link">
                      进入
                    </CaseAnchor>
                  </article>
                ))}
              </div>
            ) : (
              <p className="quiet-empty">目前没有待继续处理的案例。</p>
            )}
          </section>
          <section className="content-card">
            <div className="content-head">
              <div>
                <span className="eyebrow">RECENT / 最近记录</span>
                <h2>人工判断</h2>
              </div>
              <a href="#/review?filter=recorded">
                查看历史 <ArrowRight size={14} />
              </a>
            </div>
            {recent.length ? (
              <div className="recent-list">
                {recent.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>
                        {item.id} · {item.latestReview.candidate || "整组候选"}
                      </strong>
                      <p>{decisionLabels[item.latestReview.decision]}</p>
                      <small>
                        {item.latestReview.reviewer} ·{" "}
                        {humanTime(item.latestReview.created_at)}
                      </small>
                    </div>
                    <CaseAnchor id={item.id} className="icon-case-link">
                      查看
                    </CaseAnchor>
                  </article>
                ))}
              </div>
            ) : (
              <p className="quiet-empty">
                尚无人工判断。可从左侧待处理案例开始。
              </p>
            )}
          </section>
        </div>
          </div>
        </div>
      </DataState>
    </PageFrame>
  );
}

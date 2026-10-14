import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  decisionLabels,
  riskLabels,
} from "../features/workbench/reviewLabels.js";
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
    reviewApi
      .listMyUploads()
      .then(({ items }) => {
        if (live) setUploads(items);
      })
      .catch((reason) => {
        if (live) setUploadError(reason.message);
      })
      .finally(() => {
        if (live) setUploadLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  async function confirm(item) {
    setBusyId(item.id);
    setUploadError("");
    try {
      const updated = await reviewApi.confirmUpload(item.id, !item.confirmedAt);
      setUploads((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (reason) {
      setUploadError(reason.message);
    } finally {
      setBusyId(null);
    }
  }

  const pendingUploads = uploads.filter((item) => !item.confirmedAt);
  const confirmedUploads = uploads.length - pendingUploads.length;
  const recorded = cases.filter((item) => item.latestReview);
  const risk = cases.filter(
    (item) => item.semanticRisk || item.riskReasons.length,
  );
  const waiting = cases.filter(needsAttention);
  const queue = waiting
    .slice()
    .sort(
      (a, b) =>
        Number(!!(b.semanticRisk || b.riskReasons.length)) -
        Number(!!(a.semanticRisk || a.riskReasons.length)),
    )
    .slice(0, 8);
  const recent = recorded
    .slice()
    .sort((a, b) =>
      b.latestReview.created_at.localeCompare(a.latestReview.created_at),
    )
    .slice(0, 3);
  const decisions = [
    ["approve", "已采纳", "#637e62"],
    ["secondary_repair_required", "二次处理", "#ca8c52"],
    ["defer_expert", "转专家", "#a68b58"],
    ["reject", "已驳回", "#ad665a"],
    ["unreviewed", "待判断", "#d1c5b3"],
  ].map(([key, label, color]) => ({
    key,
    label,
    color,
    count: cases.filter((item) =>
      key === "unreviewed"
        ? !item.latestReview
        : item.latestReview?.decision === key,
    ).length,
  }));
  const candidateCoverage = ["R3", "R7", "R12"].map((key) => ({
    key,
    count: cases.filter((item) => item.variants[key]?.image).length,
  }));
  const completeCandidates = cases.filter((item) =>
    ["R3", "R7", "R12"].every((key) => item.variants[key]?.image),
  ).length;
  const riskCounts = Object.entries(
    risk.reduce((acc, item) => {
      const reasons = item.riskReasons.length
        ? item.riskReasons
        : ["semantic_risk"];
      reasons.forEach((reason) => {
        acc[reason] = (acc[reason] || 0) + 1;
      });
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  let colorStart = 0;
  const decisionRing = decisions
    .map((item) => {
      const stop =
        colorStart + (cases.length ? (item.count / cases.length) * 100 : 0);
      const segment = `${item.color} ${colorStart}% ${stop}%`;
      colorStart = stop;
      return segment;
    })
    .join(", ");

  return (
    <PageFrame
      eyebrow="首页"
      title="工作总览"
      subtitle="待办、复核与素材入库"
      className="page-home"
      actions={
        <a className="inner-primary-link" href="#/assets?section=uploads">
          上传素材 <ArrowRight size={16} />
        </a>
      }
    >
      <DataState loading={loading} error={error}>
        <div className="home-layout">
          <aside className="content-card home-my-tasks">
            <div className="content-head">
              <div>
                <span className="eyebrow">MY WORK / 快捷入口</span>
                <h2>我的待办</h2>
              </div>
            </div>
            {uploadError && (
              <p className="upload-error" role="alert">
                {uploadError}
              </p>
            )}
            <section className="home-todo-group">
              <div className="home-todo-head">
                <h3>待核对素材</h3>
                <span>{pendingUploads.length} 项</span>
              </div>
              {uploadLoading ? (
                <p className="quiet-empty">正在读取上传素材…</p>
              ) : pendingUploads.length ? (
                <>
                  <button
                    className="home-todo-feature"
                    onClick={() => {
                      setSelectedUploadId(pendingUploads[0].id);
                      document
                        .getElementById("home-upload-tasks")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                    }}
                  >
                    <img
                      src={pendingUploads[0].imageUrl}
                      alt=""
                      loading="lazy"
                    />
                    <span>
                      <strong>
                        {pendingUploads[0].cave} · {pendingUploads[0].mural}
                      </strong>
                      <small>{pendingUploads[0].filename}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                  {pendingUploads.length > 1 && (
                    <button
                      className="home-todo-link"
                      onClick={() => {
                        setSelectedUploadId(pendingUploads[1].id);
                        document
                          .getElementById("home-upload-tasks")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                      }}
                    >
                      另有 {pendingUploads.length - 1} 项待核对{" "}
                      <ArrowRight size={13} />
                    </button>
                  )}
                </>
              ) : (
                <p className="quiet-empty">当前没有待核对的上传素材。</p>
              )}
            </section>
            <section className="home-sidebar-cases home-todo-group">
              <div className="home-todo-head">
                <h3>项目待复核案例</h3>
                <span>{waiting.length} 例</span>
              </div>
              {queue.map((item) => (
                <CaseAnchor
                  key={item.id}
                  id={item.id}
                  className="home-sidebar-case"
                >
                  <img src={item.assets.original} alt="" loading="lazy" />
                  <span>
                    <strong>{item.id}</strong>
                    <small>
                      {item.semanticRisk || item.riskReasons.length
                        ? "风险复核"
                        : item.latestReview
                          ? "继续处置"
                          : "待人工判断"}
                    </small>
                  </span>
                  <ArrowRight size={13} />
                </CaseAnchor>
              ))}
              {!queue.length && (
                <p className="quiet-empty">当前没有待继续处理的案例。</p>
              )}
              <a className="home-todo-link" href="#/review?filter=pending">
                查看全部案例 <ArrowRight size={13} />
              </a>
            </section>
          </aside>
          <div className="home-main">
            <div className="home-dashboard-grid">
              <section className="content-card home-dashboard-panel">
                <div className="content-head">
                  <div>
                    <span className="eyebrow">REVIEW / 状态</span>
                    <h2>复核状态</h2>
                  </div>
                  <a href="#/review">
                    查看记录 <ArrowRight size={14} />
                  </a>
                </div>
                <div className="home-decision-chart">
                  <div
                    className="home-donut"
                    style={{ background: `conic-gradient(${decisionRing})` }}
                  >
                    <div>
                      <strong>
                        {recorded.length}
                        <small> / {cases.length}</small>
                      </strong>
                      <span>已有人工判断</span>
                    </div>
                  </div>
                  <div className="home-chart-legend">
                    {decisions.map((entry) => (
                      <div key={entry.key}>
                        <i style={{ background: entry.color }} />
                        <span>{entry.label}</span>
                        <strong>{entry.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <section className="content-card home-dashboard-panel">
                <div className="content-head">
                  <div>
                    <span className="eyebrow">CANDIDATES / 图像</span>
                    <h2>候选图像覆盖</h2>
                  </div>
                  <a href="#/assets">
                    查看素材 <ArrowRight size={14} />
                  </a>
                </div>
                <p className="home-dashboard-caption">
                  <strong>{completeCandidates}</strong> / {cases.length}{" "}
                  个案例有完整三组候选
                </p>
                <div className="home-coverage-bars">
                  {candidateCoverage.map((entry) => (
                    <div key={entry.key}>
                      <span>{entry.key}</span>
                      <div>
                        <i
                          style={{
                            width: `${cases.length ? (entry.count / cases.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>
                        {entry.count}/{cases.length}
                      </strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <section
              className="content-card home-upload-panel"
              id="home-upload-tasks"
            >
              <div className="content-head">
                <div>
                  <span className="eyebrow">UPLOAD / 我的素材</span>
                  <h2>素材入库任务</h2>
                  <p>接收、校验、归档和人工核对状态</p>
                </div>
                <a href="#/assets?section=uploads">
                  管理素材 <ArrowRight size={14} />
                </a>
              </div>
              <div className="home-task-summary">
                <span>{uploads.length} 项上传素材</span>
                <span>{pendingUploads.length} 项待核对</span>
                <span>{confirmedUploads} 项已核对</span>
              </div>
              {uploadLoading ? (
                <p className="quiet-empty">正在读取任务…</p>
              ) : uploads.length ? (
                <div className="home-upload-list">
                  {uploads.map((item) => (
                    <article
                      key={item.id}
                      className={selectedUploadId === item.id ? "selected" : ""}
                    >
                      <img src={item.imageUrl} alt="" loading="lazy" />
                      <div className="home-upload-name">
                        <strong>
                          {item.cave} / {item.mural}
                        </strong>
                        <small>
                          {item.parentId ? "切片" : "图片"} · {item.filename}
                        </small>
                      </div>
                      <div className="home-upload-progress">
                        <span>
                          {item.confirmedAt ? "人工核对完成" : "等待人工核对"}{" "}
                          <b>{item.confirmedAt ? "4 / 4 步" : "3 / 4 步"}</b>
                        </span>
                        <i aria-hidden="true">
                          <em
                            style={{ width: item.confirmedAt ? "100%" : "75%" }}
                          />
                        </i>
                      </div>
                      <a
                        href={`#/assets?section=uploads&asset=${encodeURIComponent(item.id)}`}
                      >
                        查看
                      </a>
                      <button
                        disabled={busyId === item.id}
                        onClick={() => confirm(item)}
                      >
                        {item.confirmedAt ? "撤销核对" : "完成核对"}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="home-upload-empty">
                  <p>上传图片后，素材入库状态会显示在这里。</p>
                  <a
                    className="inner-primary-link"
                    href="#/assets?section=uploads"
                  >
                    上传素材 <ArrowRight size={14} />
                  </a>
                </div>
              )}
              {uploadError && (
                <p className="upload-error" role="alert">
                  {uploadError}
                </p>
              )}
            </section>
            <div className="home-columns home-bottom-modules">
              <section className="content-card">
                <div className="content-head">
                  <div>
                    <span className="eyebrow">RISK / 证据</span>
                    <h2>风险提示分布</h2>
                  </div>
                  <a href="#/review?filter=risk">
                    查看案例 <ArrowRight size={14} />
                  </a>
                </div>
                <p className="home-module-intro">
                  {risk.length} 个案例带有风险提示，按风险类型汇总。
                </p>
                {riskCounts.length ? (
                  <div className="home-risk-list">
                    {riskCounts.slice(0, 4).map(([key, count]) => (
                      <div key={key}>
                        <span>
                          {riskLabels[key] ||
                            (key === "semantic_risk" ? "语义结构风险" : key)}
                        </span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="quiet-empty">当前没有风险提示。</p>
                )}
              </section>
              <section className="content-card">
                <div className="content-head">
                  <div>
                    <span className="eyebrow">RECENT / 记录</span>
                    <h2>最近人工判断</h2>
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
                            {item.id} ·{" "}
                            {item.latestReview.candidate || "整组候选"}
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
                  <p className="quiet-empty">尚无人工判断记录。</p>
                )}
              </section>
            </div>
          </div>
        </div>
      </DataState>
    </PageFrame>
  );
}

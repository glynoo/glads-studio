import React from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileImage,
  ScanEye,
} from "lucide-react";
import { decisionLabels } from "../features/workbench/reviewLabels.js";
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
        <section className="home-lead">
          <div className="home-lead-copy">
            <span className="eyebrow">CURRENT COLLECTION / 当前案例集</span>
            <h2>
              Golden20 <em>案例复核</em>
            </h2>
            <p>
              从图像证据进入判断：查看原图与执行掩码，比较不同处理尺度的候选，再记录理由和局部问题。
            </p>
            <a href="#/assets">
              查看资料来源 <ArrowRight size={15} />
            </a>
          </div>
          <div className="home-lead-figure">
            <strong>
              {recorded.length}
              <span> / {cases.length}</span>
            </strong>
            <small>案例已有人工判断记录</small>
            <div className="progress-track">
              <i
                style={{
                  width: `${cases.length ? (recorded.length / cases.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </section>
        <div className="summary-grid-page">
          <a href="#/review?filter=pending" className="summary-tile">
            <ScanEye size={21} />
            <span>待继续处理</span>
            <strong>{waiting.length}</strong>
            <small>未记录判断，或仍需后续处置</small>
          </a>
          <a href="#/review?filter=recorded" className="summary-tile">
            <CheckCircle2 size={21} />
            <span>已有判断</span>
            <strong>{recorded.length}</strong>
            <small>每次提交均保留历史</small>
          </a>
          <a href="#/review?filter=risk" className="summary-tile">
            <CircleAlert size={21} />
            <span>风险案例</span>
            <strong>{risk.length}</strong>
            <small>需要逐例查看判断依据</small>
          </a>
          <a href="#/assets" className="summary-tile">
            <FileImage size={21} />
            <span>候选图像</span>
            <strong>{generated}</strong>
            <small>可供查看与比较的结果</small>
          </a>
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
      </DataState>
    </PageFrame>
  );
}

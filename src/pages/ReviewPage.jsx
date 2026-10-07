import React, { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import {
  decisionLabels,
  riskLabels,
} from "../features/workbench/reviewLabels.js";
import { reviewApi } from "../services/reviewApi.js";
import { useCases } from "./useCases.js";
import { CaseAnchor, DataState, humanTime, PageFrame } from "./PageParts.jsx";

const FILTERS = [
  ["all", "全部"],
  ["pending", "待处理"],
  ["recorded", "已有判断"],
  ["risk", "风险案例"],
];
const hasRisk = (item) => !!(item.semanticRisk || item.riskReasons.length);
const pending = (item) =>
  !item.latestReview ||
  ["reject", "defer_expert", "secondary_repair_required"].includes(
    item.latestReview.decision,
  );
function initialFilter() {
  const key = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "filter",
  );
  return FILTERS.some(([value]) => value === key) ? key : "all";
}

export default function ReviewPage() {
  const { cases, loading, error } = useCases();
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const visible = useMemo(
    () =>
      cases.filter((item) => {
        const match =
          filter === "all" ||
          (filter === "pending" && pending(item)) ||
          (filter === "recorded" && !!item.latestReview) ||
          (filter === "risk" && hasRisk(item));
        return (
          match &&
          `${item.id} ${item.imageName} ${item.latestReview?.reviewer || ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        );
      }),
    [cases, filter, query],
  );
  const selected = visible.find((item) => item.id === selectedId) || visible[0];

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let live = true;
    setDetail(null);
    setDetailError("");
    reviewApi
      .getCase(selected.id)
      .then((result) => {
        if (live) setDetail(result);
      })
      .catch((reason) => {
        if (live) setDetailError(reason.message);
      });
    return () => {
      live = false;
    };
  }, [selected?.id]);

  const counts = {
    all: cases.length,
    pending: cases.filter(pending).length,
    recorded: cases.filter((item) => item.latestReview).length,
    risk: cases.filter(hasRisk).length,
  };
  const latest = detail?.reviews.at(-1);
  const previewCandidate =
    latest?.candidate && detail?.variants[latest.candidate]?.image
      ? latest.candidate
      : ["R3", "R7", "R12"].find((key) => detail?.variants[key]?.image);
  const resultImage =
    previewCandidate && detail?.variants[previewCandidate]?.image;

  return (
    <PageFrame
      eyebrow="质量与记录"
      title="审核总览"
      subtitle="按案例查看风险、判断理由和留存的复核历史。"
      className="page-review"
      actions={
        <a className="inner-primary-link" href={reviewApi.exportUrl} download>
          <Download size={16} /> 导出复核记录
        </a>
      }
    >
      <DataState loading={loading} error={error}>
        <div className="review-filter-row">
          <div className="pill-tabs">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
                <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <label className="inline-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索案例或复核人"
              aria-label="搜索审核记录"
            />
          </label>
        </div>
        <div className="review-layout">
          <section className="content-card review-table-card">
            <div className="content-head">
              <div>
                <span className="eyebrow">CASE QUEUE / 案例队列</span>
                <h2>{FILTERS.find(([key]) => key === filter)?.[1]}</h2>
              </div>
              <span className="soft-count">{visible.length} 项</span>
            </div>
            <div className="table-scroll">
              <table className="review-table">
                <thead>
                  <tr>
                    <th>案例</th>
                    <th>风险</th>
                    <th>当前判断</th>
                    <th>复核人</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr
                      key={item.id}
                      className={item.id === selected?.id ? "selected" : ""}
                      tabIndex={0}
                      aria-selected={item.id === selected?.id}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(item.id);
                        }
                      }}
                    >
                      <td>
                        <span className="table-case">
                          <img
                            src={item.assets.original}
                            alt=""
                            loading="lazy"
                          />
                          <strong>{item.id}</strong>
                        </span>
                      </td>
                      <td>
                        <span
                          className={`table-pill ${hasRisk(item) ? "risk" : ""}`}
                        >
                          {hasRisk(item) ? "需关注" : "常规"}
                        </span>
                      </td>
                      <td>
                        {item.latestReview
                          ? decisionLabels[item.latestReview.decision]
                          : "待人工判断"}
                      </td>
                      <td>{item.latestReview?.reviewer || "—"}</td>
                      <td>
                        {item.latestReview
                          ? humanTime(item.latestReview.created_at)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <p className="quiet-empty">当前筛选下没有案例。</p>
            )}
          </section>
          <aside className="content-card review-detail">
            {selected ? (
              <>
                <div className="content-head">
                  <div>
                    <span className="eyebrow">EVIDENCE / 案例摘要</span>
                    <h2>{selected.id}</h2>
                  </div>
                  <CaseAnchor id={selected.id} className="icon-case-link">
                    查看图像
                  </CaseAnchor>
                </div>
                <div className="review-images">
                  <img
                    src={selected.assets.original}
                    alt={`${selected.id} 原图`}
                  />
                  {resultImage ? (
                    <img
                      src={resultImage}
                      alt={`${selected.id} ${previewCandidate} 候选`}
                    />
                  ) : (
                    <div className="review-image-empty">候选图像</div>
                  )}
                </div>
                <div className="review-image-labels">
                  <span>原图</span>
                  <span>
                    {resultImage ? `${previewCandidate} 候选` : "暂无候选"}
                  </span>
                </div>
                {hasRisk(selected) && (
                  <div className="review-risk">
                    <strong>风险提示</strong>
                    {selected.riskReasons.length ? (
                      selected.riskReasons.map((reason) => (
                        <span key={reason}>{riskLabels[reason] || reason}</span>
                      ))
                    ) : (
                      <span>请核对图像结构与执行范围</span>
                    )}
                  </div>
                )}
                {detailError && <p className="detail-error">{detailError}</p>}
                {detail ? (
                  <>
                    <div className="review-detail-block">
                      <span className="eyebrow">LATEST / 最近判断</span>
                      {latest ? (
                        <>
                          <strong>
                            {decisionLabels[latest.decision]} ·{" "}
                            {latest.candidate || "整组候选"}
                          </strong>
                          <p>{latest.notes}</p>
                          <small>
                            {latest.reviewer} · {humanTime(latest.created_at)}
                          </small>
                        </>
                      ) : (
                        <p>尚无人工判断。进入工作台比较候选并记录依据。</p>
                      )}
                    </div>
                    <div className="review-detail-block">
                      <span className="eyebrow">HISTORY / 历史记录</span>
                      {detail.reviews.length ? (
                        <ol className="review-history">
                          {detail.reviews
                            .slice()
                            .reverse()
                            .map((event) => (
                              <li key={event.id}>
                                <strong>
                                  {decisionLabels[event.decision]}
                                </strong>
                                <span>
                                  {event.candidate || "整组候选"} ·{" "}
                                  {event.reviewer} ·{" "}
                                  {humanTime(event.created_at)}
                                </span>
                              </li>
                            ))}
                        </ol>
                      ) : (
                        <p>暂无记录</p>
                      )}
                    </div>
                    <div className="review-detail-foot">
                      <span>{detail.annotations.length} 条定位批注</span>
                      <CaseAnchor id={selected.id} className="text-link">
                        在工作台查看
                      </CaseAnchor>
                    </div>
                  </>
                ) : (
                  !detailError && (
                    <p className="quiet-empty">正在读取案例记录…</p>
                  )
                )}
              </>
            ) : (
              <p className="quiet-empty">请选择案例查看摘要。</p>
            )}
          </aside>
        </div>
      </DataState>
    </PageFrame>
  );
}

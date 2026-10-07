import React from "react";
import { AlertTriangle, Check, Info } from "lucide-react";
import { Badge, Panel } from "../../components/UI.jsx";
import { decisionLabels, riskLabels } from "./reviewLabels.js";
export default function DecisionPanel({
  item,
  candidate,
  selected,
  draft,
  hasRisk,
  setCandidate,
  updateDraft,
}) {
  return (
    <Panel
      title="人工判断"
      eyebrow="05 / DECISION"
      extra={<Badge tone="green">{candidate}</Badge>}
      className="decision-panel"
    >
      <div className="candidate-options">
        {["R3", "R7", "R12"].map((key) => (
          <button
            key={key}
            disabled={!item.variants[key]?.image}
            className={candidate === key ? "active" : ""}
            onClick={() => setCandidate(key)}
          >
            <span>{key}</span>
            {!item.variants[key]?.image ? (
              <small>未生成</small>
            ) : candidate === key ? (
              <Check size={14} />
            ) : null}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="reviewer">
        复核人 <span>必填</span>
      </label>
      <input
        id="reviewer"
        aria-label="复核人"
        value={draft.reviewer}
        onChange={(e) => updateDraft({ reviewer: e.target.value })}
        placeholder="填写姓名或组内代号"
      />
      <label className="field-label" htmlFor="decision">
        复核结论
      </label>
      <select
        id="decision"
        value={draft.decision}
        onChange={(e) => updateDraft({ decision: e.target.value })}
      >
        {Object.entries(decisionLabels).map(([key, label]) => (
          <option key={key} value={key} disabled={key === "approve" && hasRisk}>
            {label}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="reason">
        判断理由 <span>必填</span>
      </label>
      <textarea
        id="reason"
        value={draft.notes}
        onChange={(e) => updateDraft({ notes: e.target.value })}
        placeholder="对照原图、掩码、纹样和边缘，说明判断依据…"
        rows="4"
      />
      <div className="risks">
        <div className="row">
          <span className="field-label">风险与检查依据</span>
          <span className="tiny">{item.riskReasons.length} 项</span>
        </div>
        {item.riskReasons.length ? (
          item.riskReasons.map((key) => (
            <div className="risk" key={key}>
              <div className="risk-title">
                <AlertTriangle size={14} />
                {riskLabels[key] || key}
              </div>
              <p>交付清单标记的风险；请结合图像与周边资料判断。</p>
            </div>
          ))
        ) : (
          <p className="quiet-note">
            <Info size={13} />
            清单未标记高风险，仍需人工检查。
          </p>
        )}
        {selected?.lowTextureWarning && (
          <div className="risk">
            <div className="risk-title">
              <AlertTriangle size={14} />
              当前候选低纹理警告
            </div>
            <p>该指标提示检查纹样；不自动决定采用或拒绝。</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

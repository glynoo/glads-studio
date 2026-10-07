import React from "react";
import { ArrowUpRight } from "lucide-react";
import { Panel } from "../../components/UI.jsx";
export default function CaseContext({ item, candidate, selected, setModal }) {
  return (
    <Panel
      title="案例信息"
      eyebrow="04 / CONTEXT"
      extra={
        <button
          className="icon-button"
          aria-label="查看来源"
          onClick={() => setModal({ type: "source" })}
        >
          <ArrowUpRight size={17} />
        </button>
      }
      className="context-panel"
    >
      <div className="context-preview">
        <img src={item.assets.original} alt="案例原图预览" />
        <div>
          <strong>{item.id}</strong>
          <p>{item.imageName}</p>
          <button
            className="text-button"
            onClick={() => setModal({ type: "source" })}
          >
            查看来源与图像清单 ↗
          </button>
        </div>
      </div>
      <dl>
        <div>
          <dt>来源</dt>
          <dd>Golden20 · Big-LaMa</dd>
        </div>
        <div>
          <dt>图像尺寸</dt>
          <dd>640 × 640 px</dd>
        </div>
        <div>
          <dt>当前候选</dt>
          <dd>
            {candidate} / {selected?.sha256?.slice(0, 9)}…
          </dd>
        </div>
        <div>
          <dt>掩码外改动</dt>
          <dd>
            {selected?.outsideMaskChangedPixels ?? "无候选数据"}{" "}
            像素（清单记录）
          </dd>
        </div>
      </dl>
      <p className="context-note">
        候选哈希与图像来源已关联至当前案例。
      </p>
    </Panel>
  );
}

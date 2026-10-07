import React from "react";
import { MapPin } from "lucide-react";
import { Panel } from "../../components/UI.jsx";
export default function AnnotationsPanel({ item, candidate, notes, setFocus }) {
  return (
    <Panel
      title="定位批注"
      eyebrow="03 / REASONING"
      extra={
        <span className="tiny">
          {item.id} / {candidate} · {notes.length} 条
        </span>
      }
      className="notes-panel"
    >
      {notes.length ? (
        <div className="notes-list">
          {notes.map((entry, index) => (
            <div className="note-item" key={entry.id}>
              <button
                className="note-locate"
                onClick={() => setFocus({ ...entry, stamp: Date.now() })}
              >
                <MapPin size={15} />
                {index + 1}
              </button>
              <div>
                <strong>{entry.category}</strong>
                <p>{entry.text}</p>
                <small>
                  {entry.reviewer} · ({Math.round(entry.x * 639)},{" "}
                  {Math.round(entry.y * 639)}) · {entry.created_at}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="notes-empty">
          <span className="empty-pin">
            <MapPin size={19} />
          </span>
          <div>
            <strong>当前候选尚无批注</strong>
            <p>选择图像上方的定位工具，再点击候选中的问题位置。</p>
          </div>
        </div>
      )}
      <div className="notes-bottom">
        <span>批注绑定案例、候选、坐标与复核人</span>
      </div>
    </Panel>
  );
}

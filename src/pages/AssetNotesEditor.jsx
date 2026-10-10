import React, { useRef, useState } from "react";
import { Modal } from "../components/UI.jsx";
import { reviewApi } from "../services/reviewApi.js";
import PoolTagField from "./PoolTagField.jsx";
import { categoryLabels } from "./poolFilters.js";

export default function AssetNotesEditor({
  asset,
  onClose,
  onSaved,
  availableTags,
}) {
  const [source, setSource] = useState(asset.source);
  const [note, setNote] = useState(asset.note);
  const [tags, setTags] = useState(asset.tags || []);
  const [category, setCategory] = useState(asset.category || "original");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  function close() {
    if (!saving.current) onClose();
  }
  async function submit(event) {
    event.preventDefault();
    if (saving.current) return;
    if (!source.trim()) return setError("请填写图像来源");
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await reviewApi.updateUploadMetadata(asset.id, {
        source: source.trim(),
        note: note.trim(),
        tags,
        category,
      });
      onSaved(updated);
      onClose();
    } catch (reason) {
      setError(reason.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title="编辑素材信息与标签" onClose={close}>
      <form className="upload-form asset-note-form" onSubmit={submit}>
        <p className="modal-caption">{asset.filename}</p>
        <label>
          图像来源
          <input
            required
            maxLength={300}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          备注
          <textarea
            rows={5}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
            placeholder="补充采集时间或图像说明"
          />
        </label>
        {error && (
          <p role="alert" className="upload-error">
            {error}
          </p>
        )}
        <label>
          图片分类
          <select
            disabled={busy}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(categoryLabels).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <PoolTagField
          tags={tags}
          available={availableTags}
          onChange={setTags}
          disabled={busy}
        />
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={busy}>
            取消
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "正在保存…" : "保存修改"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

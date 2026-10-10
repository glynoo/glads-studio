import React, { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Modal } from "../components/UI.jsx";
import { reviewApi } from "../services/reviewApi.js";
import PoolTagField from "./PoolTagField.jsx";
import { categoryLabels } from "./poolFilters.js";

export default function UploadDialog({
  cave,
  parent,
  pool,
  onClose,
  onSaved,
  onCompleted,
}) {
  const [queue, setQueue] = useState([]);
  const [fields, setFields] = useState({
    cave: parent?.cave || cave || "",
    mural: parent?.mural || "",
    source: parent?.source || "",
    note: "",
    category: "original",
  });
  const [tags, setTags] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCave, setNewCave] = useState(false);
  const [period, setPeriod] = useState("");
  const [caveNote, setCaveNote] = useState("");
  const pending = useRef(false);
  const urls = useRef(new Set());
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  function change(key, value) {
    setFields((old) => ({ ...old, [key]: value }));
  }
  function addFiles(files) {
    if (pending.current) return;
    const incoming = Array.from(files || []);
    if (
      incoming.some(
        (file) =>
          !file.size ||
          file.size > 20 * 1024 * 1024 ||
          !["image/png", "image/jpeg", "image/webp"].includes(file.type),
      )
    ) {
      setError("请选择非空 JPG、PNG 或 WebP 图片，单张不超过 20 MB");
      return;
    }
    if (incoming.length + queue.length > 50) {
      setError("每批最多选择 50 张图片");
      return;
    }
    setError("");
    setQueue((old) => {
      const next = [...old];
      incoming.forEach((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!next.some((item) => item.key === key)) {
          const url = URL.createObjectURL(file);
          urls.current.add(url);
          next.push({ key, file, url, status: "pending" });
        }
      });
      return next;
    });
  }
  async function createCave() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const state = await reviewApi.saveCave({
        name: fields.cave,
        period,
        note: caveNote,
      });
      pool.setState(state);
      setNewCave(false);
    } catch (reason) {
      setError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (pending.current) return;
    const remaining = queue.filter((item) => item.status !== "saved");
    if (!remaining.length) {
      setError("请选择图片文件");
      return;
    }
    if (newCave) {
      setError("请先保存新洞窟资料");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    let last;
    try {
      for (const item of remaining) {
        setQueue((old) =>
          old.map((row) =>
            row.key === item.key ? { ...row, status: "uploading" } : row,
          ),
        );
        const form = new FormData();
        form.append("file", item.file);
        Object.entries(fields).forEach(([key, value]) =>
          form.append(key, value.trim()),
        );
        form.append("tags", JSON.stringify(tags));
        if (parent) form.append("parentId", parent.id);
        try {
          last = await reviewApi.upload(form);
          onSaved(last);
          setQueue((old) =>
            old.map((row) =>
              row.key === item.key ? { ...row, status: "saved" } : row,
            ),
          );
        } catch (reason) {
          setQueue((old) =>
            old.map((row) =>
              row.key === item.key ? { ...row, status: "failed" } : row,
            ),
          );
          throw reason;
        }
      }
      await pool.reload();
      onCompleted(last);
    } catch (reason) {
      setError(
        `部分文件尚未上传：${reason.message}。已保存的文件不会重复上传。`,
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={parent ? "添加图片切片" : "上传壁画素材"}
      onClose={() => !pending.current && onClose()}
    >
      <form className="upload-form" onSubmit={submit}>
        <p className="modal-caption">
          {parent
            ? `关联到 ${parent.filename}`
            : "选择洞窟与区域，可一次上传多张图片，单张不超过 20 MB。"}
        </p>
        <label
          className="upload-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <ImagePlus size={28} />
          <strong>
            {queue.length
              ? `已选择 ${queue.length} 张图片`
              : "选择或拖入图像文件"}
          </strong>
          <span>支持 JPG、PNG、WebP，可多选</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            aria-label="选择上传图片"
            disabled={busy}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {!!queue.length && (
          <div className="pool-upload-queue" aria-label="待上传文件">
            {queue.map((item) => (
              <div key={item.key}>
                <img src={item.url} alt="" />
                <span>
                  <strong>{item.file.name}</strong>
                  <small>
                    {(item.file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                    {
                      {
                        pending: "待上传",
                        uploading: "正在上传",
                        saved: "已保存",
                        failed: "等待重试",
                      }[item.status]
                    }
                  </small>
                </span>
                <button
                  type="button"
                  disabled={busy || item.status === "saved"}
                  onClick={() => {
                    URL.revokeObjectURL(item.url);
                    urls.current.delete(item.url);
                    setQueue((old) =>
                      old.filter((row) => row.key !== item.key),
                    );
                  }}
                >
                  移除
                </button>
              </div>
            ))}
            <p role="status">
              已保存 {queue.filter((item) => item.status === "saved").length} /{" "}
              {queue.length} 张
            </p>
          </div>
        )}
        {!parent && (
          <>
            <div className="upload-form-grid">
              <label>
                所属洞窟
                <input
                  required
                  maxLength={100}
                  list="pool-cave-options"
                  value={fields.cave}
                  disabled={busy}
                  onChange={(e) => change("cave", e.target.value)}
                />
                <datalist id="pool-cave-options">
                  {pool.caves.map((c) => (
                    <option key={c.name} value={c.name} />
                  ))}
                </datalist>
              </label>
              <label>
                所属区域
                <input
                  required
                  maxLength={100}
                  value={fields.mural}
                  disabled={busy}
                  placeholder="例如：西壁"
                  onChange={(e) => change("mural", e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => setNewCave((old) => !old)}
            >
              {newCave ? "取消新建洞窟" : "新建洞窟并填写时代与备注"}
            </button>
            {newCave && (
              <div className="pool-new-cave">
                <label>
                  时代
                  <input
                    maxLength={100}
                    value={period}
                    disabled={busy}
                    onChange={(e) => setPeriod(e.target.value)}
                  />
                </label>
                <label>
                  洞窟备注
                  <textarea
                    maxLength={1000}
                    value={caveNote}
                    disabled={busy}
                    onChange={(e) => setCaveNote(e.target.value)}
                  />
                </label>
                <button type="button" disabled={busy} onClick={createCave}>
                  保存新洞窟
                </button>
              </div>
            )}
          </>
        )}
        <label>
          图像来源
          <input
            required
            maxLength={300}
            value={fields.source}
            disabled={busy}
            placeholder="填写采集或资料来源"
            onChange={(e) => change("source", e.target.value)}
          />
        </label>
        <label>
          图片分类
          <select
            value={fields.category}
            disabled={busy}
            onChange={(e) => change("category", e.target.value)}
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
          available={pool.tags}
          onChange={setTags}
          disabled={busy}
        />
        <label>
          备注
          <textarea
            maxLength={1000}
            rows={3}
            value={fields.note}
            disabled={busy}
            onChange={(e) => change("note", e.target.value)}
          />
        </label>
        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : "保存素材"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

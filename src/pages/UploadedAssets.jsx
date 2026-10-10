import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileImage, ImagePlus, Search } from "lucide-react";
import { Modal } from "../components/UI.jsx";
import { reviewApi } from "../services/reviewApi.js";

export default function UploadedAssets({ showForm, setShowForm }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState({ cave: "", mural: "", source: "", note: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    reviewApi.listUploads().then(({ items }) => {
      if (live) {
        setItems(items);
        setError("");
      }
    }).catch((reason) => {
      if (live) setError(reason.message);
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const filtered = useMemo(() => items.filter((item) =>
    `${item.filename} ${item.cave} ${item.mural} ${item.source}`.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const selected = filtered.find((item) => item.id === selectedId) || filtered[0];

  function change(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!file) return setError("请选择图片文件");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      Object.entries(fields).forEach(([key, value]) => form.append(key, value));
      const uploaded = await reviewApi.upload(form);
      setItems((current) => [uploaded, ...current]);
      setSelectedId(uploaded.id);
      setShowForm(false);
      setFile(null);
      setFields({ cave: "", mural: "", source: "", note: "" });
      setMessage("图片已保存到素材池");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="assets-layout uploaded-assets">
        <aside className="content-card asset-browser">
          <div className="content-head">
            <div><span className="eyebrow">COLLECTION / 上传素材</span><h2>图像资料</h2></div>
            <span className="soft-count">{filtered.length} / {items.length}</span>
          </div>
          <label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索洞窟、位置或文件名" aria-label="搜索上传素材" /></label>
          <div className="asset-case-list">
            {loading && <p className="quiet-empty">正在读取素材…</p>}
            {!loading && error && !showForm && <p className="upload-error" role="alert">{error}</p>}
            {!loading && !filtered.length && !error && <p className="quiet-empty">这里还没有图像。使用“上传素材”添加第一张。</p>}
            {filtered.map((item) => (
              <button key={item.id} className={`asset-case ${item.id === selected?.id ? "selected" : ""}`} aria-pressed={item.id === selected?.id} onClick={() => setSelectedId(item.id)}>
                <img src={item.imageUrl} alt="" loading="lazy" />
                <span><strong>{item.cave} · {item.mural}</strong><small>{item.filename}</small></span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </aside>
        <section className="asset-detail">
          {message && <p className="upload-success" role="status">{message}</p>}
          {selected ? (
            <>
              <div className="asset-detail-head">
                <div><div className="eyebrow">ASSET / {selected.id.slice(-8)}</div><h2>{selected.cave} · {selected.mural}</h2><p>{selected.filename}</p></div>
                <a className="inner-primary-link" href={selected.imageUrl} download={selected.filename}>下载原图</a>
              </div>
              <div className="content-card upload-preview"><img src={selected.imageUrl} alt={`${selected.cave} ${selected.mural} 上传图像`} /></div>
              <div className="content-card upload-metadata">
                <div className="content-head"><div><span className="eyebrow">PROVENANCE / 来源记录</span><h2>素材信息</h2></div><FileImage size={20} /></div>
                <dl>
                  <div><dt>洞窟</dt><dd>{selected.cave}</dd></div>
                  <div><dt>壁画位置</dt><dd>{selected.mural}</dd></div>
                  <div><dt>图像来源</dt><dd>{selected.source}</dd></div>
                  <div><dt>上传人</dt><dd>{selected.uploadedBy}</dd></div>
                  <div><dt>上传时间</dt><dd>{new Date(selected.uploadedAt).toLocaleString("zh-CN")}</dd></div>
                  <div><dt>文件校验</dt><dd title={selected.sha256}>{selected.sha256.slice(0, 20)}…</dd></div>
                </dl>
                {selected.note && <p className="upload-note">{selected.note}</p>}
              </div>
            </>
          ) : (
            <div className="content-card upload-empty"><ImagePlus size={35} /><h2>上传壁画图像</h2><p>记录洞窟、壁画位置与图像来源，方便后续查找和核对。</p><button className="inner-primary-link" onClick={() => setShowForm(true)}>上传素材</button></div>
          )}
        </section>
      </div>
      {showForm && (
        <Modal title="上传壁画素材" onClose={() => setShowForm(false)} wide>
          <form className="upload-form" onSubmit={submit}>
            <p className="modal-caption">填写来源信息并选择 JPG、PNG 或 WebP 图片，单张不超过 20 MB。</p>
            <label className="upload-drop"><ImagePlus size={28} /><strong>{file ? file.name : "选择图像文件"}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "点击选择本地图片"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(""); }} required /></label>
            <div className="upload-form-grid">
              <label>所属洞窟<input value={fields.cave} onChange={(event) => change("cave", event.target.value)} placeholder="例如：第 17 窟" maxLength={100} required /></label>
              <label>壁画位置<input value={fields.mural} onChange={(event) => change("mural", event.target.value)} placeholder="例如：西壁" maxLength={100} required /></label>
            </div>
            <label>图像来源<input value={fields.source} onChange={(event) => change("source", event.target.value)} placeholder="填写采集或资料来源" maxLength={300} required /></label>
            <label>备注<textarea value={fields.note} onChange={(event) => change("note", event.target.value)} placeholder="可补充采集时间或图像说明" maxLength={1000} rows={3} /></label>
            {error && <p className="upload-error" role="alert">{error}</p>}
            <div className="modal-actions"><button type="button" onClick={() => setShowForm(false)}>取消</button><button className="primary" type="submit" disabled={busy}>{busy ? "正在上传…" : "保存素材"}</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

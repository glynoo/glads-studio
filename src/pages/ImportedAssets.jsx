import React, { useEffect, useState } from "react";
import { Search, FileImage } from "lucide-react";
import { Modal } from "../components/UI.jsx";
import { reviewApi } from "../services/reviewApi.js";

const labels = { mask: "掩码资产", model: "模型资产", evidence: "运行证据" };
export default function ImportedAssets({ kind }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({
    items: [],
    categories: [],
    total: 0,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        reviewApi
          .catalog({ kind, query, category, page })
          .then((next) => {
            if (live) setData(next);
          })
          .catch((reason) => {
            if (live) setError(reason.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          }),
      180,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, query, category, page, retry]);
  return (
    <div className="assets-layout">
      <aside className="content-card asset-browser">
        <div className="content-head">
          <div>
            <span className="eyebrow">COLLECTION / 资产目录</span>
            <h2>{labels[kind]}</h2>
          </div>
          <span className="soft-count">
            {data.total.toLocaleString("zh-CN")}
          </span>
        </div>
        <label className="inline-search">
          <Search size={16} />
          <input
            aria-label="搜索资产目录"
            placeholder="名称、来源图像或案例"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="pool-filters">
          <label>
            资产类型
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部类型</option>
              {data.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button
            className="text-link"
            onClick={() => {
              setQuery("");
              setCategory("");
              setPage(1);
            }}
          >
            清除筛选
          </button>
        </div>
        <p className="quiet-empty">
          {kind === "model"
            ? data.modelPolicy || "仅登记已有模型；文件未导入时不能下载。"
            : "保留原版资产目录的来源、案例和文件校验信息。"}
        </p>
      </aside>
      <section className="asset-detail">
        <div className="asset-detail-head">
          <div>
            <span className="eyebrow">LIBRARY / 素材资料</span>
            <h2>{labels[kind]}</h2>
            <p>
              {data.sourceTotal?.toLocaleString("zh-CN") || 0} 项资产 · 当前匹配{" "}
              {data.total.toLocaleString("zh-CN")} 项
            </p>
          </div>
        </div>
        {loading ? (
          <div className="content-card asset-overview-empty" role="status">
            正在读取资产…
          </div>
        ) : error ? (
          <div className="content-card asset-overview-empty" role="alert">
            <strong>资产目录读取失败</strong>
            <span>{error}</span>
            <button onClick={() => setRetry((v) => v + 1)}>重新读取</button>
          </div>
        ) : (
          <>
            <div className="asset-card-grid">
              {data.items.map((item) => (
                <button
                  className="asset-card pool-library-item"
                  key={item.id}
                  onClick={() => setSelected(item)}
                >
                  <div className="asset-image">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <FileImage size={28} />
                    )}
                  </div>
                  <div className="asset-card-body">
                    <span className="asset-type">{item.category}</span>
                    <h3>{item.name}</h3>
                    <p>{item.caseId || item.sourceImage || item.storage}</p>
                  </div>
                </button>
              ))}
            </div>
            {!data.items.length && (
              <div className="content-card asset-overview-empty">
                没有匹配的资产，请调整筛选。
              </div>
            )}
            <div className="pool-pagination">
              <button
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
              >
                上一页
              </button>
              <span>
                第 {data.page} / {data.pages} 页
              </span>
              <button
                disabled={data.page >= data.pages}
                onClick={() => setPage(data.page + 1)}
              >
                下一页
              </button>
            </div>
          </>
        )}
      </section>
      {selected && (
        <Modal wide title={selected.name} onClose={() => setSelected(null)}>
          {selected.imageUrl && (
            <div className="upload-preview">
              <img src={selected.imageUrl} alt={selected.name} />
            </div>
          )}
          <div className="upload-metadata">
            <dl>
              {Object.entries({
                资产类型: selected.category,
                案例: selected.caseId,
                来源图像: selected.sourceImage,
                来源包: selected.sourceArchive,
                文件路径: selected.path,
                存储状态: selected.storage,
                文件大小: `${selected.bytes?.toLocaleString("zh-CN")} 字节`,
                校验状态: selected.verification,
                SHA256: selected.sha256,
              })
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
          {selected.fileUrl ? (
            <div className="modal-actions">
              <a
                className="inner-primary-link"
                href={selected.fileUrl}
                download={selected.name}
              >
                下载资产
              </a>
            </div>
          ) : (
            <p className="modal-caption">
              该资产仅登记元数据，当前没有可下载文件。
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

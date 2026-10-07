import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileImage, Filter, Layers3, Search } from "lucide-react";
import { useCases } from "./useCases.js";
import { CaseAnchor, DataState, PageFrame } from "./PageParts.jsx";

const TYPES = ["全部", "原图", "掩码", "候选"];

function assetsFor(item) {
  return [
    {
      key: "original",
      type: "原图",
      title: "原始图像",
      url: item.assets.original,
      note: item.imageName,
    },
    {
      key: "mask",
      type: "掩码",
      title: "融合执行掩码",
      url: item.assets.maskOverlay,
      note: "执行范围可视预览",
    },
    ...["R3", "R7", "R12"].map((key) => ({
      key,
      type: "候选",
      title: `${key} 候选`,
      url: item.variants[key]?.image,
      note: item.variants[key]?.sha256 || "暂无图像",
      sha: item.variants[key]?.sha256,
    })),
  ];
}

export default function AssetsPage() {
  const { cases, loading, error } = useCases();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("全部");
  const [selectedId, setSelectedId] = useState(null);
  const filtered = useMemo(
    () =>
      cases.filter((item) =>
        `${item.id} ${item.imageName} ${item.categories.join(" ")}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [cases, query],
  );
  const item = filtered.find((entry) => entry.id === selectedId) || filtered[0];
  const visibleAssets = item
    ? assetsFor(item).filter((asset) => type === "全部" || asset.type === type)
    : [];

  useEffect(() => {
    if (!selectedId && cases.length) setSelectedId(cases[0].id);
  }, [cases, selectedId]);

  return (
    <PageFrame
      eyebrow="资料与来源"
      title="素材池"
      subtitle="以案例为线索，查找原图、执行掩码和各版本候选。"
      className="page-assets"
    >
      <DataState loading={loading} error={error}>
        <div className="assets-layout">
          <aside className="content-card asset-browser">
            <div className="content-head">
              <div>
                <span className="eyebrow">COLLECTION / 案例索引</span>
                <h2>Golden20</h2>
              </div>
              <span className="soft-count">
                {filtered.length} / {cases.length}
              </span>
            </div>
            <label className="inline-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索案例、文件名或类别"
                aria-label="搜索素材"
              />
            </label>
            <div className="asset-case-list">
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  className={`asset-case ${entry.id === item?.id ? "selected" : ""}`}
                  aria-pressed={entry.id === item?.id}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <img src={entry.assets.original} alt="" loading="lazy" />
                  <span>
                    <strong>{entry.id}</strong>
                    <small>{entry.imageName}</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
              {!filtered.length && (
                <p className="quiet-empty">没有符合条件的案例。</p>
              )}
            </div>
          </aside>
          <section className="asset-detail">
            {item ? (
              <>
                <div className="asset-detail-head">
                  <div>
                    <div className="eyebrow">CASE / {item.id}</div>
                    <h2>{item.imageName}</h2>
                    <p>当前案例的图像证据与候选关系</p>
                  </div>
                  <CaseAnchor id={item.id} className="inner-primary-link">
                    进入工作台
                  </CaseAnchor>
                </div>
                <div className="asset-lineage">
                  <span>
                    <FileImage size={16} /> 原图
                  </span>
                  <i />
                  <span>
                    <Layers3 size={16} /> 执行掩码
                  </span>
                  <i />
                  <span>R3 · R7 · R12</span>
                  <i />
                  <span>人工复核</span>
                </div>
                <div className="asset-toolbar">
                  <span>
                    <Filter size={15} /> 资产类型
                  </span>
                  <div className="pill-tabs">
                    {TYPES.map((value) => (
                      <button
                        key={value}
                        className={value === type ? "active" : ""}
                        onClick={() => setType(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="asset-card-grid">
                  {visibleAssets.map((asset) => (
                    <article className="asset-card" key={asset.key}>
                      <div
                        className={`asset-image ${asset.key === "mask" ? "mask-image" : ""}`}
                      >
                        {asset.url ? (
                          <img
                            src={asset.url}
                            alt={`${item.id} ${asset.title}`}
                            loading="lazy"
                          />
                        ) : (
                          <div className="asset-missing">暂无图像</div>
                        )}
                      </div>
                      <div className="asset-card-body">
                        <span className="asset-type">{asset.type}</span>
                        <h3>{asset.title}</h3>
                        <p title={asset.note}>{asset.note}</p>
                        {asset.sha && (
                          <dl>
                            <dt>SHA256</dt>
                            <dd title={asset.sha}>{asset.sha.slice(0, 18)}…</dd>
                          </dl>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="asset-context">
                  <div>
                    <span className="eyebrow">PROVENANCE / 关联信息</span>
                    <h3>资产对应关系</h3>
                  </div>
                  <p>
                    此案例按 {item.id} 关联一张原图、一张精确融合掩码和{" "}
                    {Object.values(item.variants).filter((v) => v.image).length}{" "}
                    张候选。选择候选后，可在工作台查看掩码外改动、风险与人工记录。
                  </p>
                </div>
              </>
            ) : (
              <div className="page-state">请选择左侧案例。</div>
            )}
          </section>
        </div>
      </DataState>
    </PageFrame>
  );
}

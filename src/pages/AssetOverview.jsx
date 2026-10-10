import React from "react";
import { ArrowRight, FolderOpen, Upload } from "lucide-react";
import { PoolFilters } from "./PoolTools.jsx";

export default function AssetOverview({
  caves,
  loading,
  error,
  onOpenCave,
  onUpload,
  onRetry,
  filters,
  onFilters,
  items,
  pool,
  onEditCave,
}) {
  const imageCount = caves.reduce((sum, cave) => sum + cave.images.length, 0);
  const sliceCount = caves.reduce((sum, cave) => sum + cave.sliceCount, 0);

  return (
    <div className="asset-overview-layout">
      <aside className="content-card asset-overview-rail">
        <span className="eyebrow">COLLECTION / 索引</span>
        <h2>洞窟素材池</h2>
        <p>从洞窟进入，按区域、图片和切片逐层查找。</p>
        <div className="asset-overview-counts">
          <div>
            <strong>{caves.length}</strong>
            <span>洞窟</span>
          </div>
          <div>
            <strong>{imageCount}</strong>
            <span>原始图片</span>
          </div>
          <div>
            <strong>{sliceCount}</strong>
            <span>切片</span>
          </div>
        </div>
        <label className="inline-search pool-overview-search">
          <input
            aria-label="搜索洞窟或壁画"
            placeholder="搜索洞窟或壁画"
            value={filters.query || ""}
            onChange={(e) => onFilters({ ...filters, query: e.target.value })}
          />
        </label>
        <PoolFilters
          includeCave
          items={items}
          pool={pool}
          filters={filters}
          onChange={onFilters}
          onReset={() => onFilters({ query: "", sort: "cave" })}
        />
        <button onClick={onUpload}>
          <Upload size={15} /> 上传素材
        </button>
      </aside>

      <div className="asset-overview-content">
        <div className="asset-overview-heading">
          <div>
            <span className="eyebrow">CAVES / 浏览</span>
            <h2>按洞窟浏览</h2>
            <p>选择洞窟，再进入区域与图片。</p>
          </div>
          <span>{caves.length} 个洞窟</span>
        </div>
        {error && (
          <p className="upload-error" role="alert">
            {error}
            <button type="button" onClick={onRetry}>
              重新读取
            </button>
          </p>
        )}
        {loading ? (
          <div className="content-card asset-overview-empty">
            正在读取洞窟素材…
          </div>
        ) : error ? null : caves.length ? (
          <div className="asset-cave-list">
            {caves.map((cave) => (
              <div className="pool-cave-row" key={cave.name}>
                <button
                  className="asset-cave-folder content-card"
                  key={cave.name}
                  onClick={() => onOpenCave(cave.name)}
                >
                  <div className="asset-cave-identity">
                    <span className="asset-folder-icon">
                      <FolderOpen size={23} />
                    </span>
                    <div>
                      <small>洞窟</small>
                      <h3>{cave.name}</h3>
                      {(cave.period || cave.note) && (
                        <p>
                          {cave.period} {cave.note}
                        </p>
                      )}
                      <p>
                        {cave.regions.size} 个区域 · {cave.images.length} 张图片
                        · {cave.sliceCount} 张切片
                      </p>
                    </div>
                  </div>
                  <div className="asset-cave-preview">
                    {cave.images.slice(0, 4).map((image) => (
                      <img
                        key={image.id}
                        src={image.imageUrl}
                        alt=""
                        loading="lazy"
                      />
                    ))}
                  </div>
                  <ArrowRight className="asset-folder-arrow" size={18} />
                </button>
                {cave.canEdit && (
                  <button
                    className="text-link pool-cave-edit"
                    type="button"
                    onClick={() => onEditCave(cave)}
                    aria-label={`编辑 ${cave.name}`}
                  >
                    编辑洞窟
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="content-card asset-overview-empty">
            <FolderOpen size={31} />
            <strong>
              {filters.query ||
              filters.cave ||
              filters.mural ||
              filters.category ||
              filters.tag
                ? "没有匹配的洞窟或素材"
                : "还没有上传的洞窟素材"}
            </strong>
            <span>可调整筛选，或上传图片并填写洞窟和区域。</span>
            <button
              onClick={
                filters.query ||
                filters.cave ||
                filters.mural ||
                filters.category ||
                filters.tag
                  ? () => onFilters({ query: "", sort: "cave" })
                  : onUpload
              }
            >
              {filters.query ||
              filters.cave ||
              filters.mural ||
              filters.category ||
              filters.tag
                ? "清除筛选"
                : "上传第一张图片"}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

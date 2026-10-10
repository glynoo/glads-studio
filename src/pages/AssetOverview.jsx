import React from "react";
import { ArrowRight, FolderOpen, Upload } from "lucide-react";

export default function AssetOverview({
  caves,
  loading,
  error,
  onOpenCave,
  onUpload,
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
          </p>
        )}
        {loading ? (
          <div className="content-card asset-overview-empty">
            正在读取洞窟素材…
          </div>
        ) : caves.length ? (
          <div className="asset-cave-list">
            {caves.map((cave) => (
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
                    <p>
                      {cave.regions.size} 个区域 · {cave.images.length} 张图片 ·{" "}
                      {cave.sliceCount} 张切片
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
            ))}
          </div>
        ) : (
          <div className="content-card asset-overview-empty">
            <FolderOpen size={31} />
            <strong>还没有上传的洞窟素材</strong>
            <span>上传图片时填写洞窟和区域，素材会按层级归入这里。</span>
            <button onClick={onUpload}>
              上传第一张图片 <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileImage, ImagePlus } from "lucide-react";
import { Modal } from "../components/UI.jsx";
import { reviewApi } from "../services/reviewApi.js";
import AssetNotesEditor from "./AssetNotesEditor.jsx";
import UploadDialog from "./UploadDialog.jsx";
import { PoolToolbar } from "./PoolTools.jsx";
import { categoryLabels, filterPoolItems } from "./poolFilters.js";
import {
  AssetHierarchyTree,
  uploadedHierarchy,
} from "./AssetHierarchyTree.jsx";

export default function UploadedAssets({
  scopeCave = null,
  cases = [],
  showForm,
  setShowForm,
  selectedId,
  onSelect,
  onUploaded,
  user,
  pool,
  view,
  projectId,
  onEditCave,
  navigation,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState(false);
  const [parentId, setParentId] = useState(null);
  const [filters, setFilters] = useState({ sort: "recent" });
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const mutation = useRef(false);
  useEffect(() => {
    if (!showForm) setParentId(null);
  }, [showForm]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    reviewApi
      .listUploads()
      .then(({ items }) => {
        if (live) {
          setItems(items);
          setError("");
        }
      })
      .catch((reason) => {
        if (live) setError(reason.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [reloadKey, scopeCave]);

  useEffect(() => {
    setQuery("");
    setEditing(false);
  }, [scopeCave]);

  const project = pool.projects.find((item) => item.id === projectId);
  const { items: filtered, count: matchedCount } = useMemo(
    () =>
      filterPoolItems(items, {
        ...filters,
        query,
        cave: scopeCave || filters.cave,
        view,
        favorites: pool.favorites,
        project,
      }),
    [items, query, scopeCave, filters, view, pool.favorites, project],
  );
  const hierarchy = useMemo(() => uploadedHierarchy(filtered), [filtered]);
  const selected =
    filtered.find((item) => item.id === selectedId) ||
    (scopeCave || selectedId ? null : filtered[0]);
  const regions = useMemo(() => {
    const groups = new Map();
    filtered
      .filter((item) => !item.parentId)
      .forEach((image) => {
        if (!groups.has(image.mural)) groups.set(image.mural, []);
        groups.get(image.mural).push(image);
      });
    return [...groups.entries()];
  }, [filtered]);
  const selectedParent = selected?.parentId
    ? items.find((item) => item.id === selected.parentId)
    : null;
  const sourceImage = selectedParent || selected;
  const relatedCase = sourceImage
    ? cases.find(
        (item) =>
          item.originalSha256 && item.originalSha256 === sourceImage.sha256,
      )
    : null;
  const processedAssets = relatedCase
    ? [
        {
          key: "mask",
          type: "掩码",
          title: "执行掩码",
          image: relatedCase.assets.maskOverlay,
        },
        ...["R3", "R7", "R12"].map((key) => ({
          key,
          type: "候选",
          title: `${key} 修复候选`,
          image: relatedCase.variants[key]?.image,
        })),
      ].filter((asset) => asset.image)
    : [];
  const children =
    selected && !selected.parentId
      ? items.filter((item) => item.parentId === selected.id)
      : [];

  function addSlice(parent) {
    setParentId(parent.id);
    setShowForm(true);
  }

  async function changeCollection(value) {
    if (mutation.current) return;
    mutation.current = true;
    setActionBusy(true);
    setOperationError("");
    try {
      await pool.change(value);
      if (
        !value.enabled &&
        ((view === "favorites" && value.action === "favorite") ||
          (view === "project" &&
            value.action === "projectMember" &&
            value.projectId === projectId))
      )
        onSelect(null);
    } catch (reason) {
      setOperationError(reason.message);
    } finally {
      mutation.current = false;
      setActionBusy(false);
    }
  }

  async function deleteSelected() {
    if (mutation.current || !selected) return;
    mutation.current = true;
    setActionBusy(true);
    setOperationError("");
    try {
      const result = await reviewApi.deleteUpload(selected.id);
      setItems((old) =>
        old.filter((item) => !result.deleted.includes(item.id)),
      );
      await pool.reload();
      setDeleting(false);
      onSelect(null);
      setMessage("素材已删除");
    } catch (reason) {
      setOperationError(reason.message);
    } finally {
      mutation.current = false;
      setActionBusy(false);
    }
  }

  return (
    <>
      <PoolToolbar
        navigation={navigation}
        query={query}
        onQuery={setQuery}
        items={
          scopeCave ? items.filter((item) => item.cave === scopeCave) : items
        }
        pool={pool}
        filters={filters}
        includeCave={!scopeCave}
        onChange={setFilters}
        onReset={() => {
          setQuery("");
          setFilters({ sort: "recent" });
        }}
      />
      <div className="assets-layout uploaded-assets">
        <aside className="content-card asset-browser">
          <div className="content-head">
            <div>
              <span className="eyebrow">COLLECTION / 空间索引</span>
              <h2>洞窟 / 区域 / 图片 / 切片</h2>
            </div>
            <span className="soft-count">
              {matchedCount} / {items.length}
            </span>
          </div>
          {scopeCave &&
            pool.caves.find((cave) => cave.name === scopeCave)?.canEdit && (
              <button
                className="text-link"
                onClick={() =>
                  onEditCave(pool.caves.find((cave) => cave.name === scopeCave))
                }
              >
                编辑洞窟资料
              </button>
            )}
          <div className="asset-case-list">
            {loading && <p className="quiet-empty">正在读取素材…</p>}
            {!loading && error && (
              <p className="upload-error" role="alert">
                {error}
                <button
                  type="button"
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  重新读取
                </button>
              </p>
            )}
            {!loading && !filtered.length && !error && (
              <p className="quiet-empty">
                {query.trim()
                  ? "没有匹配的素材，请更换关键词。"
                  : "这里还没有图像。使用“上传素材”添加第一张。"}
                {query.trim() && (
                  <button className="text-link" onClick={() => setQuery("")}>
                    清除搜索
                  </button>
                )}
              </p>
            )}
            {!!filtered.length && (
              <AssetHierarchyTree
                nodes={hierarchy}
                selectedId={selected?.id}
                onSelect={onSelect}
              />
            )}
          </div>
        </aside>
        <section className="asset-detail">
          {operationError && (
            <p role="alert" className="upload-error">
              {operationError}
            </p>
          )}
          {message && (
            <p className="upload-success" role="status">
              {message}
            </p>
          )}
          {loading && !selected ? (
            <div className="content-card asset-overview-empty">
              正在读取{scopeCave ? ` ${scopeCave} 的` : ""}素材…
            </div>
          ) : selected ? (
            <>
              <div className="asset-detail-head">
                <div>
                  <div className="eyebrow">
                    {selected.cave} / {selected.mural} /{" "}
                    {selectedParent?.filename || selected.filename}
                    {selectedParent ? ` / ${selected.filename}` : ""}
                  </div>
                  <h2>{selected.filename}</h2>
                  <p>
                    {selected.parentId ? "切片" : "图片"} · {selected.source}
                  </p>
                </div>
                <div className="asset-detail-actions">
                  <button
                    type="button"
                    className="inner-primary-link"
                    aria-pressed={pool.favorites.includes(selected.id)}
                    disabled={actionBusy || pool.loading}
                    onClick={() =>
                      changeCollection({
                        action: "favorite",
                        assetId: selected.id,
                        enabled: !pool.favorites.includes(selected.id),
                      })
                    }
                  >
                    {pool.favorites.includes(selected.id)
                      ? "取消收藏"
                      : "加入收藏"}
                  </button>
                  {!!pool.projects.length && (
                    <select
                      className="pool-project-picker"
                      aria-label="将素材加入或移出项目"
                      value=""
                      disabled={actionBusy}
                      onChange={(e) => {
                        const p = pool.projects.find(
                          (item) => item.id === e.target.value,
                        );
                        if (p)
                          changeCollection({
                            action: "projectMember",
                            assetId: selected.id,
                            projectId: p.id,
                            enabled: !p.assetIds.includes(selected.id),
                          });
                      }}
                    >
                      <option value="">加入或移出项目</option>
                      {pool.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.assetIds.includes(selected.id)
                            ? "（点击移出）"
                            : "（点击加入）"}
                        </option>
                      ))}
                    </select>
                  )}
                  {selected.uploadedById === user?.id && (
                    <button
                      type="button"
                      className="text-link"
                      disabled={actionBusy}
                      onClick={() => {
                        setOperationError("");
                        setDeleting(true);
                      }}
                    >
                      删除素材
                    </button>
                  )}
                  {!selected.parentId && (
                    <button
                      className="inner-primary-link"
                      onClick={() => addSlice(selected)}
                    >
                      添加切片
                    </button>
                  )}
                  <a
                    className="inner-primary-link"
                    href={selected.imageUrl}
                    download={selected.filename}
                  >
                    下载图像
                  </a>
                </div>
              </div>
              <div className="content-card upload-preview">
                <button
                  className="pool-preview-open"
                  type="button"
                  aria-label="查看图片大图"
                  onClick={() => setPreviewing(true)}
                >
                  <img
                    src={selected.imageUrl}
                    alt={`${selected.cave} ${selected.mural} 上传图像`}
                  />
                </button>
              </div>
              <div className="content-card upload-metadata">
                <div className="content-head">
                  <div>
                    <span className="eyebrow">PROVENANCE / 来源记录</span>
                    <h2>素材信息</h2>
                  </div>
                  <FileImage size={20} />
                </div>
                <dl>
                  <div>
                    <dt>洞窟</dt>
                    <dd>{selected.cave}</dd>
                  </div>
                  <div>
                    <dt>所属区域</dt>
                    <dd>{selected.mural}</dd>
                  </div>
                  <div>
                    <dt>资产层级</dt>
                    <dd>{selected.parentId ? "切片" : "图片"}</dd>
                  </div>
                  <div>
                    <dt>图像来源</dt>
                    <dd>{selected.source}</dd>
                  </div>
                  <div>
                    <dt>上传人</dt>
                    <dd>{selected.uploadedBy}</dd>
                  </div>
                  <div>
                    <dt>上传时间</dt>
                    <dd>
                      {new Date(selected.uploadedAt).toLocaleString("zh-CN")}
                    </dd>
                  </div>
                  <div>
                    <dt>文件校验</dt>
                    <dd title={selected.sha256}>
                      {selected.sha256.slice(0, 20)}…
                    </dd>
                  </div>
                </dl>
                <div className="pool-tag-list">
                  {(selected.tags || []).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setFilters({ ...filters, tag });
                        onSelect(null);
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                  <span>{categoryLabels[selected.category || "original"]}</span>
                </div>
                <p className="upload-note">{selected.note || "暂无备注"}</p>
                {selected.uploadedById === user?.id && (
                  <button
                    className="text-link"
                    onClick={() => setEditing(true)}
                  >
                    编辑素材信息与标签
                  </button>
                )}
              </div>
              {!!processedAssets.length && (
                <section className="content-card uploaded-related-results">
                  <div className="content-head">
                    <div>
                      <span className="eyebrow">RESTORATION / 处理资产</span>
                      <h2>关联修复结果</h2>
                    </div>
                    <span className="soft-count">
                      {processedAssets.length} 项
                    </span>
                  </div>
                  <div className="asset-card-grid">
                    {processedAssets.map((asset) => (
                      <article className="asset-card" key={asset.key}>
                        <div className="asset-image">
                          <img
                            src={asset.image}
                            alt={asset.title}
                            loading="lazy"
                          />
                        </div>
                        <div className="asset-card-body">
                          <span className="asset-type">{asset.type}</span>
                          <h3>{asset.title}</h3>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {!!children.length && (
                <div className="content-card upload-children">
                  <div className="content-head">
                    <div>
                      <span className="eyebrow">SLICES / 切片</span>
                      <h2>关联切片</h2>
                    </div>
                    <span className="soft-count">{children.length} 张</span>
                  </div>
                  <div>
                    {children.map((slice) => (
                      <button key={slice.id} onClick={() => onSelect(slice.id)}>
                        <img src={slice.imageUrl} alt="" />
                        <span>{slice.filename}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : scopeCave && regions.length ? (
            <div className="asset-region-overview">
              <div className="asset-source-heading">
                <span className="eyebrow">CAVE / {scopeCave}</span>
                <h2>按区域浏览</h2>
                <p>选择区域中的图片，再查看切片和关联资料。</p>
              </div>
              {regions.map(([region, images]) => (
                <section
                  className="content-card asset-region-folder"
                  key={region}
                >
                  <div className="content-head">
                    <div>
                      <span className="eyebrow">REGION / 区域</span>
                      <h3>{region}</h3>
                    </div>
                    <span className="soft-count">{images.length} 张图片</span>
                  </div>
                  <div className="asset-region-images">
                    {images.map((image) => (
                      <button key={image.id} onClick={() => onSelect(image.id)}>
                        <img src={image.imageUrl} alt="" loading="lazy" />
                        <span>{image.filename}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : error ? (
            <div className="content-card asset-overview-empty">
              <strong>素材读取失败</strong>
              <span>{error}</span>
              <button onClick={() => setReloadKey((value) => value + 1)}>
                重新读取
              </button>
            </div>
          ) : query.trim() ||
            filters.mural ||
            filters.category ||
            filters.tag ||
            view === "favorites" ||
            view === "project" ? (
            <div className="content-card asset-overview-empty">
              <Search size={31} />
              <strong>
                {view === "favorites"
                  ? "还没有匹配的收藏"
                  : view === "project"
                    ? "此项目还没有匹配的素材"
                    : "没有匹配的素材"}
              </strong>
              <span>试试洞窟、区域、文件名、来源或备注。</span>
              <button
                onClick={() => {
                  setQuery("");
                  setFilters({ sort: "recent" });
                }}
              >
                清除筛选
              </button>
            </div>
          ) : selectedId ? (
            <div className="content-card asset-overview-empty">
              <strong>当前素材无法找到</strong>
              <span>素材可能不在当前洞窟中，请返回洞窟列表查看。</span>
              <button onClick={() => onSelect(null)}>返回图片列表</button>
            </div>
          ) : (
            <div className="content-card upload-empty">
              <ImagePlus size={35} />
              <h2>上传壁画图像</h2>
              <p>记录洞窟、壁画位置与图像来源，方便后续查找和核对。</p>
              <button
                className="inner-primary-link"
                onClick={() => setShowForm(true)}
              >
                上传素材
              </button>
            </div>
          )}
        </section>
      </div>
      {editing && selected && (
        <AssetNotesEditor
          key={selected.id}
          asset={selected}
          availableTags={[
            ...new Set([
              ...pool.tags,
              ...items.flatMap((item) => item.tags || []),
            ]),
          ]}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setItems((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setMessage("来源与备注已保存");
          }}
        />
      )}
      {previewing && selected && (
        <Modal
          wide
          title={selected.filename}
          onClose={() => setPreviewing(false)}
        >
          <div className="upload-preview">
            <img
              src={selected.imageUrl}
              alt={`${selected.cave} ${selected.mural}`}
            />
          </div>
        </Modal>
      )}
      {deleting && selected && (
        <Modal
          title="确认删除素材"
          onClose={() => !mutation.current && setDeleting(false)}
        >
          <p className="modal-caption">
            删除“{selected.filename}”及其 {children.length}{" "}
            张切片？此操作无法撤销。
          </p>
          {operationError && (
            <p className="upload-error" role="alert">
              {operationError}
            </p>
          )}
          <div className="modal-actions">
            <button disabled={actionBusy} onClick={() => setDeleting(false)}>
              取消
            </button>
            <button
              className="primary"
              disabled={actionBusy}
              onClick={deleteSelected}
            >
              {actionBusy ? "正在删除…" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
      {showForm && (
        <UploadDialog
          cave={scopeCave}
          parent={items.find((item) => item.id === parentId)}
          pool={{
            ...pool,
            tags: [
              ...new Set([
                ...pool.tags,
                ...items.flatMap((item) => item.tags || []),
              ]),
            ],
          }}
          onClose={() => setShowForm(false)}
          onSaved={(asset) => setItems((old) => [asset, ...old])}
          onCompleted={(asset) => {
            setQuery("");
            setFilters({ sort: "recent" });
            onUploaded(asset);
            setMessage("所选图片已保存到素材池");
          }}
        />
      )}
    </>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { useCases } from "./useCases.js";
import { PageFrame } from "./PageParts.jsx";
import UploadedAssets from "./UploadedAssets.jsx";
import AssetOverview from "./AssetOverview.jsx";
import { reviewApi } from "../services/reviewApi.js";
import { navigateAssets, useAssetRoute } from "./assetRoute.js";
import "./assets.css";
import useMaterialPool from "./useMaterialPool.js";
import { PoolNavigation, CaveEditor, ProjectCreator } from "./PoolTools.jsx";
import { filterPoolItems } from "./poolFilters.js";
import ImportedAssets from "./ImportedAssets.jsx";

export default function AssetsPage({ user }) {
  const { cases } = useCases();
  const route = useAssetRoute();
  const pool = useMaterialPool(user.id);
  const [caveEditor, setCaveEditor] = useState(null);
  const [createProject, setCreateProject] = useState(false);
  const [filters, setFilters] = useState({ query: "", sort: "cave" });
  const section = route.section;
  const activeCave = route.cave;
  const [uploads, setUploads] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const showUploadForm = route.upload;
  const setShowUploadForm = (upload) => navigateAssets({ ...route, upload });

  const caveGroups = useMemo(() => {
    const caves = new Map();
    if (!filters.mural && !filters.category && !filters.tag) {
      pool.caves
        .filter(
          (cave) =>
            (!filters.cave || cave.name === filters.cave) &&
            (!filters.query ||
              `${cave.name} ${cave.period} ${cave.note}`
                .toLocaleLowerCase()
                .includes(filters.query.trim().toLocaleLowerCase())),
        )
        .forEach((cave) =>
          caves.set(cave.name, {
            ...cave,
            images: [],
            regions: new Set(),
            sliceCount: 0,
          }),
        );
    }
    const sliceCounts = new Map();
    uploads.forEach((asset) => {
      if (asset.parentId)
        sliceCounts.set(
          asset.parentId,
          (sliceCounts.get(asset.parentId) || 0) + 1,
        );
    });
    const parents = filterPoolItems(uploads, filters).items.filter(
      (asset) => !asset.parentId,
    );
    parents.forEach((asset) => {
      if (!caves.has(asset.cave)) {
        caves.set(asset.cave, {
          name: asset.cave,
          images: [],
          regions: new Set(),
          sliceCount: 0,
        });
      }
      const cave = caves.get(asset.cave);
      cave.images.push(asset);
      cave.regions.add(asset.mural);
      cave.sliceCount += sliceCounts.get(asset.id) || 0;
    });
    const result = [...caves.values()];
    result.forEach((cave) =>
      Object.assign(
        cave,
        pool.caves.find((c) => c.name === cave.name),
      ),
    );
    return result.sort((a, b) =>
      filters.sort === "count"
        ? b.images.length - a.images.length
        : filters.sort === "recent"
          ? (b.images[0]?.uploadedAt || "").localeCompare(
              a.images[0]?.uploadedAt || "",
            )
          : a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
    );
  }, [uploads, pool.caves, filters]);

  useEffect(() => {
    if (section !== "overview") return;
    let live = true;
    setUploadLoading(true);
    setUploadError("");
    reviewApi
      .listUploads()
      .then(({ items }) => {
        if (live) {
          setUploads(items);
          setUploadError("");
        }
      })
      .catch((reason) => {
        if (live) setUploadError(reason.message);
      })
      .finally(() => {
        if (live) setUploadLoading(false);
      });
    return () => {
      live = false;
    };
  }, [section, reloadKey]);

  function showUploads(cave = null, showForm = false) {
    navigateAssets({ section: "uploads", cave, upload: showForm });
  }

  return (
    <PageFrame
      eyebrow="资料与来源"
      title="素材池"
      subtitle="从洞窟进入区域、图片与切片，再查看关联的修复资产。"
      className="page-assets"
      actions={
        <div className="asset-detail-actions">
          <button
            type="button"
            className="inner-primary-link"
            onClick={() => setCaveEditor({})}
          >
            新建洞窟
          </button>
          <button
            className="inner-primary-link"
            onClick={() => showUploads(null, true)}
          >
            <Upload size={16} /> 上传素材
          </button>
        </div>
      }
    >
      <div className="asset-path" aria-label="素材位置">
        <button
          onClick={() => {
            navigateAssets();
          }}
        >
          素材池
        </button>
        {section === "uploads" && (
          <>
            <span>/</span>
            <span>{activeCave || "上传素材"}</span>
          </>
        )}
      </div>
      <PoolNavigation
        view={route.view}
        project={route.project}
        pool={pool}
        onCreateProject={() => setCreateProject(true)}
        onNavigate={(view, project) =>
          navigateAssets({
            view,
            project:
              view === "project" ? project || pool.projects[0]?.id : null,
          })
        }
      />
      {pool.error && (
        <p className="upload-error" role="alert">
          {pool.error}{" "}
          <button type="button" onClick={pool.reload}>
            重新读取收藏与洞窟
          </button>
        </p>
      )}
      {["mask", "model", "evidence"].includes(route.view) ? (
        <ImportedAssets key={route.view} kind={route.view} />
      ) : section === "overview" ? (
        <AssetOverview
          caves={caveGroups}
          loading={uploadLoading}
          error={uploadError}
          onRetry={() => setReloadKey((value) => value + 1)}
          onOpenCave={(cave) => showUploads(cave)}
          onUpload={() => showUploads(null, true)}
          onEditCave={(cave) => setCaveEditor(cave)}
          filters={filters}
          onFilters={setFilters}
          items={uploads}
          pool={pool}
        />
      ) : (
        <UploadedAssets
          user={user}
          pool={pool}
          view={route.view}
          projectId={route.project}
          onEditCave={(cave) => setCaveEditor(cave)}
          scopeCave={activeCave}
          cases={cases}
          showForm={showUploadForm}
          setShowForm={setShowUploadForm}
          selectedId={route.asset}
          onSelect={(asset) =>
            navigateAssets({ ...route, asset, upload: false })
          }
          onUploaded={(asset) =>
            navigateAssets({
              section: "uploads",
              cave: asset.cave,
              asset: asset.id,
            })
          }
        />
      )}
      {caveEditor && (
        <CaveEditor
          cave={caveEditor.name ? caveEditor : null}
          onClose={() => setCaveEditor(null)}
          onSaved={(state, name) => {
            pool.setState(state);
            setReloadKey((v) => v + 1);
            if (activeCave) navigateAssets({ ...route, cave: name });
          }}
        />
      )}
      {createProject && (
        <ProjectCreator
          pool={pool}
          onClose={() => setCreateProject(false)}
          onCreated={(project) => navigateAssets({ view: "project", project })}
        />
      )}
    </PageFrame>
  );
}

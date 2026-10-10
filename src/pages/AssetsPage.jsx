import React, { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { useCases } from "./useCases.js";
import { PageFrame } from "./PageParts.jsx";
import UploadedAssets from "./UploadedAssets.jsx";
import AssetOverview from "./AssetOverview.jsx";
import { reviewApi } from "../services/reviewApi.js";
import { navigateAssets, useAssetRoute } from "./assetRoute.js";
import "./assets.css";

export default function AssetsPage({ user }) {
  const { cases } = useCases();
  const route = useAssetRoute();
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
    const sliceCounts = new Map();
    uploads.forEach((asset) => {
      if (asset.parentId)
        sliceCounts.set(
          asset.parentId,
          (sliceCounts.get(asset.parentId) || 0) + 1,
        );
    });
    const parents = uploads.filter((asset) => !asset.parentId);
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
    return [...caves.values()];
  }, [uploads]);

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
        <button
          className="inner-primary-link"
          onClick={() => showUploads(null, true)}
        >
          <Upload size={16} /> 上传素材
        </button>
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
      {section === "overview" ? (
        <AssetOverview
          caves={caveGroups}
          loading={uploadLoading}
          error={uploadError}
          onRetry={() => setReloadKey((value) => value + 1)}
          onOpenCave={(cave) => showUploads(cave)}
          onUpload={() => showUploads(null, true)}
        />
      ) : (
        <UploadedAssets
          user={user}
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
    </PageFrame>
  );
}

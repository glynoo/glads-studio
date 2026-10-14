import React, { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { useCases } from "./useCases.js";
import { PageFrame } from "./PageParts.jsx";
import UploadedAssets from "./UploadedAssets.jsx";
import AssetOverview from "./AssetOverview.jsx";
import { reviewApi } from "../services/reviewApi.js";

export default function AssetsPage() {
  const { cases } = useCases();
  const [section, setSection] = useState(() =>
    new URLSearchParams(location.hash.split("?")[1] || "").get("section") ===
    "uploads"
      ? "uploads"
      : "overview",
  );
  const [activeCave, setActiveCave] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);

  const caveGroups = useMemo(() => {
    const caves = new Map();
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
      cave.sliceCount += uploads.filter(
        (slice) => slice.parentId === asset.id,
      ).length;
    });
    return [...caves.values()];
  }, [uploads]);

  useEffect(() => {
    if (section !== "overview") return;
    let live = true;
    setUploadLoading(true);
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
  }, [section]);

  function showUploads(cave = null, showForm = false) {
    setActiveCave(cave);
    setSection("uploads");
    setShowUploadForm(showForm);
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
            setSection("overview");
            setActiveCave(null);
            setShowUploadForm(false);
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
          onOpenCave={(cave) => showUploads(cave)}
          onUpload={() => showUploads(null, true)}
        />
      ) : (
        <UploadedAssets
          scopeCave={activeCave}
          cases={cases}
          showForm={showUploadForm}
          setShowForm={setShowUploadForm}
        />
      )}
    </PageFrame>
  );
}

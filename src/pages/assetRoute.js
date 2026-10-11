import { useEffect, useState } from "react";

export function readAssetRoute(hash = location.hash) {
  const params = new URLSearchParams(hash.split("?")[1] || "");
  const view = [
    "recent",
    "favorites",
    "project",
    "mask",
    "model",
    "evidence",
  ].includes(params.get("view"))
    ? params.get("view")
    : "overview";
  return {
    section:
      params.get("section") === "uploads" ||
      params.has("asset") ||
      params.has("cave") ||
      view !== "overview"
        ? "uploads"
        : "overview",
    cave: params.get("cave") || null,
    asset: params.get("asset") || null,
    upload: params.get("upload") === "1",
    view,
    project: params.get("project") || null,
  };
}

export function navigateAssets({
  section = "overview",
  cave,
  asset,
  upload = false,
  view = "overview",
  project,
} = {}) {
  const params = new URLSearchParams();
  if (section === "uploads") params.set("section", "uploads");
  if (cave) params.set("cave", cave);
  if (asset) params.set("asset", asset);
  if (upload) params.set("upload", "1");
  if (view !== "overview") params.set("view", view);
  if (project) params.set("project", project);
  location.hash = `#/assets${params.size ? `?${params}` : ""}`;
}

export function useAssetRoute() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return readAssetRoute(hash);
}

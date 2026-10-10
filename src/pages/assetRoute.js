import { useEffect, useState } from "react";

export function readAssetRoute(hash = location.hash) {
  const params = new URLSearchParams(hash.split("?")[1] || "");
  return {
    section:
      params.get("section") === "uploads" ||
      params.has("asset") ||
      params.has("cave")
        ? "uploads"
        : "overview",
    cave: params.get("cave") || null,
    asset: params.get("asset") || null,
    upload: params.get("upload") === "1",
  };
}

export function navigateAssets({
  section = "overview",
  cave,
  asset,
  upload = false,
} = {}) {
  const params = new URLSearchParams();
  if (section === "uploads") params.set("section", "uploads");
  if (cave) params.set("cave", cave);
  if (asset) params.set("asset", asset);
  if (upload) params.set("upload", "1");
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

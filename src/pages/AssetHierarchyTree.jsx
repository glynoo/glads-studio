import React, { useState } from "react";
import { ChevronDown, FileImage, Grid2X2, MapPin, Scan } from "lucide-react";

const icons = { cave: MapPin, region: Grid2X2, image: FileImage, slice: Scan };

function Branch({ node, depth, selectedId, onSelect, collapsed, setCollapsed }) {
  const hasChildren = !!node.children?.length;
  const folded = !!collapsed[node.key];
  const Icon = icons[node.level] || FileImage;
  return (
    <div className={`hierarchy-branch depth-${depth}`}>
      <div className={`hierarchy-row ${node.id === selectedId ? "selected" : ""}`}>
        <button
          className="hierarchy-main"
          onClick={() => node.id ? onSelect(node.id) : hasChildren && setCollapsed((value) => ({ ...value, [node.key]: !value[node.key] }))}
          aria-current={node.id === selectedId ? "true" : undefined}
          title={node.title || node.label}
        >
          {node.url ? <img src={node.url} alt="" loading="lazy" /> : <Icon size={15} />}
          <span><strong>{node.label}</strong>{node.meta && <small>{node.meta}</small>}</span>
        </button>
        {hasChildren && <button className="hierarchy-toggle" aria-label={`${folded ? "展开" : "收起"} ${node.label}`} aria-expanded={!folded} onClick={() => setCollapsed((value) => ({ ...value, [node.key]: !value[node.key] }))}><ChevronDown size={14} /></button>}
      </div>
      {hasChildren && !folded && <div className="hierarchy-children">{node.children.map((child) => <Branch key={child.key} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} collapsed={collapsed} setCollapsed={setCollapsed} />)}</div>}
    </div>
  );
}

export function AssetHierarchyTree({ nodes, selectedId, onSelect }) {
  const [collapsed, setCollapsed] = useState({});
  return <nav className="asset-hierarchy" aria-label="洞窟、区域、图片与切片">{nodes.map((node) => <Branch key={node.key} node={node} depth={0} selectedId={selectedId} onSelect={onSelect} collapsed={collapsed} setCollapsed={setCollapsed} />)}</nav>;
}

export function referenceHierarchy(cases) {
  const groups = new Map();
  cases.forEach((item) => {
    const stem = item.imageName.replace(/\.[^.]+$/, "");
    const separator = stem.lastIndexOf("_");
    const parent = separator > 0 ? stem.slice(0, separator) : stem;
    const slice = separator > 0 ? stem.slice(separator + 1) : String(item.id);
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push({ key: item.id, id: item.id, level: "slice", label: `切片 ${slice}`, meta: item.id, url: item.assets.original });
  });
  return [{
    key: "reference-cave", level: "cave", label: "洞窟资料待关联", meta: `${cases.length} 张切片`,
    children: [{
      key: "reference-region", level: "region", label: "区域资料待关联", meta: `${groups.size} 组来源图像`,
      children: [...groups.entries()].map(([parent, slices]) => ({
        key: parent, level: "image", label: parent, meta: `${slices.length} 张切片`, title: parent, children: slices,
      })),
    }],
  }];
}

export function uploadedHierarchy(items) {
  const caves = new Map();
  const parents = items.filter((item) => !item.parentId);
  parents.forEach((image) => {
    if (!caves.has(image.cave)) caves.set(image.cave, new Map());
    const regions = caves.get(image.cave);
    if (!regions.has(image.mural)) regions.set(image.mural, []);
    regions.get(image.mural).push({
      key: image.id, id: image.id, level: "image", label: image.filename, url: image.imageUrl,
      meta: `${items.filter((item) => item.parentId === image.id).length} 张切片`,
      children: items.filter((item) => item.parentId === image.id).map((slice) => ({
        key: slice.id, id: slice.id, level: "slice", label: slice.filename, url: slice.imageUrl,
      })),
    });
  });
  return [...caves.entries()].map(([cave, regions]) => ({
    key: `cave-${cave}`, level: "cave", label: cave, meta: `${regions.size} 个区域`,
    children: [...regions.entries()].map(([region, images]) => ({
      key: `region-${cave}-${region}`, level: "region", label: region,
      meta: `${images.length} 张图片`, children: images,
    })),
  }));
}

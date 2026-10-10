export const categoryLabels = {
  original: "原始图像",
  clean: "清洁图像",
  validation: "验证图像",
};

export function filterPoolItems(
  items,
  {
    cave,
    query = "",
    mural = "",
    category = "",
    tag = "",
    view,
    favorites = [],
    project,
    sort = "recent",
  } = {},
) {
  const needle = query.trim().toLocaleLowerCase();
  const matches = items.filter(
    (item) =>
      (!cave || item.cave === cave) &&
      (!mural || item.mural === mural) &&
      (!category || (item.category || "original") === category) &&
      (!tag || (item.tags || []).includes(tag)) &&
      (view !== "favorites" || favorites.includes(item.id)) &&
      (view !== "project" || (project?.assetIds || []).includes(item.id)) &&
      `${item.filename} ${item.cave} ${item.mural} ${item.source} ${item.note} ${(item.tags || []).join(" ")}`
        .toLocaleLowerCase()
        .includes(needle),
  );
  const matchedIds = new Set(matches.map((item) => item.id));
  const contextIds = new Set(
    matches.map((item) => item.parentId).filter(Boolean),
  );
  const visible = items.filter(
    (item) => matchedIds.has(item.id) || contextIds.has(item.id),
  );
  visible.sort((a, b) =>
    sort === "name"
      ? a.filename.localeCompare(b.filename, "zh-CN")
      : sort === "cave"
        ? a.cave.localeCompare(b.cave, "zh-CN", { numeric: true })
        : b.uploadedAt.localeCompare(a.uploadedAt),
  );
  return { items: visible, count: matches.length };
}

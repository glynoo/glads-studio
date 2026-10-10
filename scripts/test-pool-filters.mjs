import assert from "node:assert/strict";
import test from "node:test";
import { filterPoolItems } from "../src/pages/poolFilters.js";
import { readAssetRoute } from "../src/pages/assetRoute.js";

const items = [
  {
    id: "root",
    filename: "parent.png",
    cave: "第 2 窟",
    mural: "西壁",
    tags: [],
    category: "original",
    uploadedAt: "2026-01-01",
  },
  {
    id: "slice",
    parentId: "root",
    filename: "slice.png",
    cave: "第 2 窟",
    mural: "西壁",
    tags: ["飞天"],
    category: "clean",
    uploadedAt: "2026-03-01",
  },
  {
    id: "other",
    filename: "other.png",
    cave: "第 10 窟",
    mural: "东壁",
    tags: ["飞天"],
    category: "validation",
    uploadedAt: "2026-02-01",
  },
];
test("tag filter retains slice ancestry without adding unrelated images", () => {
  const result = filterPoolItems(items, { tag: "飞天", category: "clean" });
  assert.equal(result.count, 1);
  assert.deepEqual(
    new Set(result.items.map((i) => i.id)),
    new Set(["root", "slice"]),
  );
});
test("favorites use exact membership and retain only required ancestors", () => {
  const result = filterPoolItems(items, {
    view: "favorites",
    favorites: ["slice"],
  });
  assert.equal(result.count, 1);
  assert.equal(result.items.length, 2);
  assert.equal(filterPoolItems(items, { view: "favorites" }).count, 0);
});
test("project view with no selected project is empty", () => {
  assert.equal(filterPoolItems(items, { view: "project" }).count, 0);
  assert.deepEqual(
    filterPoolItems(items, {
      view: "project",
      project: { assetIds: ["other"] },
    }).items.map((i) => i.id),
    ["other"],
  );
});
test("combined filters restrict cave and wall and can be cleared", () => {
  assert.equal(
    filterPoolItems(items, { cave: "第 2 窟", mural: "东壁" }).count,
    0,
  );
  assert.equal(filterPoolItems(items).count, 3);
  assert.equal(
    filterPoolItems(items, { query: "飞天", cave: "第 10 窟" }).count,
    1,
  );
});
test("recent order and numeric cave ordering", () => {
  assert.deepEqual(
    filterPoolItems(items).items.map((i) => i.id),
    ["slice", "other", "root"],
  );
  assert.equal(
    filterPoolItems(items, { sort: "cave" }).items.at(-1).id,
    "other",
  );
});
test("new view deep links preserve project and asset selection", () => {
  const route = readAssetRoute("#/assets?view=project&project=p1&asset=slice");
  assert.equal(route.section, "uploads");
  assert.equal(route.project, "p1");
  assert.equal(route.asset, "slice");
  assert.equal(readAssetRoute("#/assets?view=favorites").view, "favorites");
  assert.equal(readAssetRoute("#/assets?view=invalid").view, "overview");
});

import { describe, expect, test } from "bun:test";

import * as timeline from "./slice-timeline.ts";

describe("slice timeline selection", () => {
  test("selects alternating slice identifiers by displayed position", () => {
    const assets = ["a", "b", "c", "d"].map((id) => ({ id }));

    expect(timeline.getAlternatingAssetIds?.(assets, 0)).toEqual(["a", "c"]);
    expect(timeline.getAlternatingAssetIds?.(assets, 1)).toEqual(["b", "d"]);
  });

  test("keeps selected identifiers that remain in the active set", () => {
    expect(
      timeline.filterAssetIdsBySet?.(
        ["missing", "active-b", "active-a"],
        new Set(["active-a", "active-b"]),
      ),
    ).toEqual(["active-b", "active-a"]);
  });
});

describe("slice timeline changes", () => {
  test("removes a requested set without reordering remaining slices", () => {
    expect(
      timeline.removeAssetIds?.(
        ["a", "b", "c", "d"],
        new Set(["b", "d"]),
      ),
    ).toEqual(["a", "c"]);
  });

  test("finds deleted slices and only changed sort positions", () => {
    const assets = [
      { id: "a", sortOrder: 10 },
      { id: "b", sortOrder: 11 },
      { id: "c", sortOrder: 12 },
    ];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const nextOrder = ["c", "a"];

    expect(
      timeline.getPendingDeletedAssetIds?.(
        assets.map((asset) => asset.id),
        nextOrder,
      ),
    ).toEqual(["b"]);
    expect(
      timeline.getPendingSliceSortUpdates?.({
        baseAssets: assets,
        baseOrder: assets.map((asset) => asset.id),
        nextOrder,
        assetsById,
      }),
    ).toEqual([
      { asset: assets[2], nextSortOrder: 10 },
      { asset: assets[0], nextSortOrder: 11 },
    ]);
  });

  test("returns no sort updates when the order is unchanged", () => {
    const assets = [
      { id: "a", sortOrder: 4 },
      { id: "b", sortOrder: 5 },
    ];

    expect(
      timeline.getPendingSliceSortUpdates?.({
        baseAssets: assets,
        baseOrder: ["a", "b"],
        nextOrder: ["a", "b"],
        assetsById: new Map(assets.map((asset) => [asset.id, asset])),
      }),
    ).toEqual([]);
  });
});

describe("slice timeline history", () => {
  test("filters removed identifiers while preserving historical order", () => {
    expect(
      timeline.getValidHistoryOrder?.(
        ["removed", "c", "a"],
        new Set(["a", "b", "c"]),
      ),
    ).toEqual(["c", "a"]);
    expect(
      timeline.getValidHistoryOrder?.(["removed"], new Set(["a", "b"])),
    ).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";

import {
  buildAssetImageSourceMap,
  buildViewerSliceItems,
  getAssetImageSource,
  getSortedSliceAssets,
  mergeSliceTimelineIds,
  orderAssetsByIds,
} from "./viewer-data.ts";

function createAsset(overrides) {
  return {
    id: "slice-a",
    label: "Slice A",
    assetKind: "slice",
    weightingCode: null,
    imageUrl: "/slice-a.png",
    thumbnailUrl: "/slice-a-thumb.png",
    sortOrder: 0,
    notes: null,
    ingestJobId: null,
    storageBackend: null,
    storageKey: null,
    checksum: null,
    mimeType: "image/png",
    sizeBytes: null,
    width: 100,
    height: 100,
    sourceRelativePath: null,
    seriesUid: null,
    seriesLabel: null,
    instanceUid: null,
    sliceIndex: null,
    orientationCode: "axial",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("viewer slice data", () => {
  test("filters and sorts slice assets without mutating the response order", () => {
    const laterTie = createAsset({
      id: "slice-c",
      sortOrder: 2,
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    const reference = createAsset({
      id: "reference",
      assetKind: "reference",
      sortOrder: 0,
    });
    const first = createAsset({ id: "slice-a", sortOrder: 1 });
    const earlierTie = createAsset({
      id: "slice-b",
      assetKind: "derived_slice",
      sortOrder: 2,
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const assets = [laterTie, reference, first, earlierTie];

    expect(getSortedSliceAssets(assets).map((asset) => asset.id)).toEqual([
      "slice-a",
      "slice-b",
      "slice-c",
    ]);
    expect(assets.map((asset) => asset.id)).toEqual([
      "slice-c",
      "reference",
      "slice-a",
      "slice-b",
    ]);
  });

  test("resolves atlas images and keeps asset images as the fallback", () => {
    const atlasAsset = createAsset({ id: "slice-atlas" });
    const plainAsset = createAsset({
      id: "slice-plain",
      imageUrl: "/plain.png",
    });
    const atlasPage = {
      id: "atlas-1",
      imageUrl: "/atlas.png",
      width: 512,
      height: 512,
      sliceCount: 2,
    };
    const atlasFrame = {
      assetId: atlasAsset.id,
      atlasId: atlasPage.id,
      x: 0,
      y: 0,
      width: 256,
      height: 256,
    };

    const sources = buildAssetImageSourceMap(
      [atlasAsset, plainAsset],
      new Map([[atlasAsset.id, atlasFrame]]),
      new Map([[atlasPage.id, atlasPage]]),
    );

    expect(sources.get(atlasAsset.id)).toEqual({
      atlasFrame,
      atlasPage,
      cacheKey: atlasPage.id,
      imageUrl: atlasPage.imageUrl,
    });
    expect(sources.get(plainAsset.id)).toEqual({
      atlasFrame: null,
      atlasPage: null,
      cacheKey: plainAsset.id,
      imageUrl: plainAsset.imageUrl,
    });
  });

  test("orders known assets by timeline id and ignores stale ids", () => {
    const first = createAsset({ id: "slice-a" });
    const second = createAsset({ id: "slice-b" });
    const assetsById = new Map([
      [first.id, first],
      [second.id, second],
    ]);

    expect(
      orderAssetsByIds(["slice-b", "removed", "slice-a"], assetsById).map(
        (asset) => asset.id,
      ),
    ).toEqual(["slice-b", "slice-a"]);
  });

  test("builds indexed filmstrip items with thumbnail fallback", () => {
    const first = createAsset({ id: "slice-a" });
    const second = createAsset({
      id: "slice-b",
      imageUrl: "/slice-b.png",
      thumbnailUrl: "/slice-b-thumb.png",
    });
    const source = {
      atlasFrame: null,
      atlasPage: null,
      cacheKey: first.id,
      imageUrl: "/resolved-a.png",
    };

    const items = buildViewerSliceItems(
      [first, second],
      new Map([[first.id, source]]),
    );

    expect(items.map(({ assetId, assetIndex, thumbnailSrc }) => ({
      assetId,
      assetIndex,
      thumbnailSrc,
    }))).toEqual([
      { assetId: "slice-a", assetIndex: 0, thumbnailSrc: "/resolved-a.png" },
      {
        assetId: "slice-b",
        assetIndex: 1,
        thumbnailSrc: "/slice-b-thumb.png",
      },
    ]);
  });

  test("uses the thumbnail source when an asset is absent from the source map", () => {
    const asset = createAsset({
      id: "slice-fallback",
      imageUrl: "/full.png",
      thumbnailUrl: "/thumb.png",
    });

    expect(getAssetImageSource(asset, new Map())).toEqual({
      atlasFrame: null,
      atlasPage: null,
      cacheKey: asset.id,
      imageUrl: asset.thumbnailUrl,
    });
  });

  test("preserves current slice order, removes stale ids, and appends new ids", () => {
    expect(
      mergeSliceTimelineIds(
        ["slice-b", "removed", "slice-a"],
        ["slice-a", "slice-b", "slice-c"],
      ),
    ).toEqual(["slice-b", "slice-a", "slice-c"]);
  });
});

import type {
  ZoneModalityAsset,
  ZoneModalityAtlasFrame,
  ZoneModalityAtlasPage,
} from "@/lib/playground/types";

export type ViewerAssetImageSource = {
  atlasFrame: ZoneModalityAtlasFrame | null;
  atlasPage: ZoneModalityAtlasPage | null;
  cacheKey: string;
  imageUrl: string;
};

export type ViewerSliceItem = {
  asset: ZoneModalityAsset;
  assetId: string;
  assetIndex: number;
  atlasFrame: ZoneModalityAtlasFrame | null;
  atlasPage: ZoneModalityAtlasPage | null;
  thumbnailSrc: string;
};

export function isSliceAsset(asset: ZoneModalityAsset) {
  return asset.assetKind === "slice" || asset.assetKind === "derived_slice";
}

export function getSortedSliceAssets(assets: ZoneModalityAsset[]) {
  return assets
    .filter(isSliceAsset)
    .sort((left, right) =>
      left.sortOrder === right.sortOrder
        ? left.createdAt.localeCompare(right.createdAt)
        : left.sortOrder - right.sortOrder,
    );
}

export function buildAssetImageSourceMap(
  assets: ZoneModalityAsset[],
  atlasFramesByAssetId: ReadonlyMap<string, ZoneModalityAtlasFrame>,
  atlasPagesById: ReadonlyMap<string, ZoneModalityAtlasPage>,
) {
  return new Map(
    assets.map((asset) => {
      const atlasFrame = atlasFramesByAssetId.get(asset.id) ?? null;
      const atlasPage = atlasFrame
        ? (atlasPagesById.get(atlasFrame.atlasId) ?? null)
        : null;

      return [
        asset.id,
        {
          atlasFrame,
          atlasPage,
          cacheKey: atlasPage?.id ?? asset.id,
          imageUrl: atlasPage?.imageUrl ?? asset.imageUrl,
        },
      ] as const;
    }),
  );
}

export function orderAssetsByIds(
  assetIds: string[],
  assetsById: ReadonlyMap<string, ZoneModalityAsset>,
) {
  return assetIds
    .map((assetId) => assetsById.get(assetId))
    .filter((asset): asset is ZoneModalityAsset => Boolean(asset));
}

export function getAssetImageSource(
  asset: ZoneModalityAsset,
  imageSourcesByAssetId: ReadonlyMap<string, ViewerAssetImageSource>,
) {
  return (
    imageSourcesByAssetId.get(asset.id) ?? {
      atlasFrame: null,
      atlasPage: null,
      cacheKey: asset.id,
      imageUrl: asset.thumbnailUrl || asset.imageUrl,
    }
  );
}

export function buildViewerSliceItems(
  assets: ZoneModalityAsset[],
  imageSourcesByAssetId: ReadonlyMap<string, ViewerAssetImageSource>,
) {
  return assets.map((asset, assetIndex) => {
    const source = getAssetImageSource(asset, imageSourcesByAssetId);

    return {
      asset,
      assetId: asset.id,
      assetIndex,
      atlasFrame: source.atlasFrame,
      atlasPage: source.atlasPage,
      thumbnailSrc: source.imageUrl,
    };
  });
}

export function mergeSliceTimelineIds(
  currentAssetIds: string[],
  baseAssetIds: string[],
) {
  const baseAssetIdSet = new Set(baseAssetIds);
  const preservedAssetIds = currentAssetIds.filter((assetId) =>
    baseAssetIdSet.has(assetId),
  );
  const preservedAssetIdSet = new Set(preservedAssetIds);
  const appendedAssetIds = baseAssetIds.filter(
    (assetId) => !preservedAssetIdSet.has(assetId),
  );

  return [...preservedAssetIds, ...appendedAssetIds];
}

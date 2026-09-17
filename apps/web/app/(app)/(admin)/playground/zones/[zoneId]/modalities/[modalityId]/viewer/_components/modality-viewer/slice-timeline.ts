export function areAssetIdOrdersEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function getAlternatingAssetIds<Asset extends { id: string }>(
  assets: Asset[],
  parity: 0 | 1,
) {
  return assets
    .filter((_, index) => index % 2 === parity)
    .map((asset) => asset.id);
}

export function filterAssetIdsBySet(
  assetIds: string[],
  allowedAssetIds: ReadonlySet<string>,
) {
  return assetIds.filter((assetId) => allowedAssetIds.has(assetId));
}

export function removeAssetIds(
  assetIds: string[],
  removedAssetIds: ReadonlySet<string>,
) {
  return assetIds.filter((assetId) => !removedAssetIds.has(assetId));
}

export function getPendingDeletedAssetIds(
  baseOrder: string[],
  nextOrder: string[],
) {
  const nextOrderSet = new Set(nextOrder);

  return baseOrder.filter((assetId) => !nextOrderSet.has(assetId));
}

export function getPendingSliceSortUpdates<
  Asset extends { id: string; sortOrder: number },
>({
  assetsById,
  baseAssets,
  baseOrder,
  nextOrder,
}: {
  assetsById: Map<string, Asset>;
  baseAssets: Asset[];
  baseOrder: string[];
  nextOrder: string[];
}) {
  if (areAssetIdOrdersEqual(nextOrder, baseOrder)) {
    return [];
  }

  const sortStart = baseAssets.reduce(
    (minimum, asset) => Math.min(minimum, asset.sortOrder),
    Number.POSITIVE_INFINITY,
  );
  const startSortOrder = Number.isFinite(sortStart) ? sortStart : 0;

  return nextOrder
    .map((assetId, index) => {
      const asset = assetsById.get(assetId);

      if (!asset) {
        return null;
      }

      const nextSortOrder = startSortOrder + index;

      return asset.sortOrder === nextSortOrder
        ? null
        : { asset, nextSortOrder };
    })
    .filter(
      (value): value is { asset: Asset; nextSortOrder: number } =>
        value !== null,
    );
}

export function getValidHistoryOrder(
  historicalOrder: string[],
  availableAssetIds: ReadonlySet<string>,
) {
  const validOrder = filterAssetIdsBySet(
    historicalOrder,
    availableAssetIds,
  );

  return validOrder.length > 0 ? validOrder : null;
}

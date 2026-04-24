import { formatModalityWeightingLabel } from "@/lib/playground/modality-options";
import type { ZoneModality, ZoneModalityAsset } from "@/lib/playground/types";

export type WeightingSelectOption = {
  label: string;
  value: string;
};

export function getAssetWeightings(assets: ZoneModalityAsset[]) {
  const specificValues = Array.from(
    new Set(
      assets.flatMap((asset) => (asset.weightingCode ? [asset.weightingCode] : [])),
    ),
  );

  if (specificValues.length === 0) {
    return ["all"];
  }

  return ["all", ...specificValues];
}

export function createAssetWeightingOptions(
  weightings: string[],
): WeightingSelectOption[] {
  return weightings.map((weighting) => ({
    label: formatModalityWeightingLabel(weighting),
    value: weighting,
  }));
}

export function createVariantWeightingOptions(
  variants: ZoneModality[],
): WeightingSelectOption[] {
  const seenLabels = new Map<string, number>();

  return variants.map((variant) => {
    const baseLabel = formatModalityWeightingLabel(variant.weightingCode);
    const seenCount = seenLabels.get(baseLabel) ?? 0;

    seenLabels.set(baseLabel, seenCount + 1);

    return {
      label: seenCount === 0 ? baseLabel : `${baseLabel} ${seenCount + 1}`,
      value: variant.id,
    };
  });
}

export function filterAssetsByWeighting(
  assets: ZoneModalityAsset[],
  weighting: string,
) {
  if (weighting === "all") {
    return assets;
  }

  const weightedAssets = assets.filter(
    (asset) => (asset.weightingCode ?? "all") === weighting,
  );

  return weightedAssets.length > 0 ? weightedAssets : assets;
}

export function findNearestWeightingAsset(
  assets: ZoneModalityAsset[],
  currentAsset: ZoneModalityAsset | null,
) {
  if (assets.length === 0) {
    return null;
  }

  if (!currentAsset) {
    return assets[0] ?? null;
  }

  return assets.reduce<ZoneModalityAsset | null>((nearestAsset, asset) => {
    if (!nearestAsset) {
      return asset;
    }

    const currentDistance = Math.abs(asset.sortOrder - currentAsset.sortOrder);
    const nearestDistance = Math.abs(
      nearestAsset.sortOrder - currentAsset.sortOrder,
    );

    return currentDistance < nearestDistance ? asset : nearestAsset;
  }, null);
}

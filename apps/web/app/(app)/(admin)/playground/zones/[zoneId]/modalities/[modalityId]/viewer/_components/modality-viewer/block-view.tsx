import { cn } from "@/lib/utils";
import type { ZoneModalityAsset } from "@/lib/playground/types";

type ViewerBlockViewProps = {
  activeAssetId: string | null;
  assets: ZoneModalityAsset[];
  onClose: () => void;
  onSelectAsset: (assetIndex: number) => void;
};

export function ViewerBlockView({
  activeAssetId,
  assets,
  onClose,
  onSelectAsset,
}: ViewerBlockViewProps) {
  return (
    <div className="absolute inset-0 z-40 overflow-hidden overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-base font-semibold text-white">
          All series - {assets.length} images
        </div>
        <button
          type="button"
          className="inline-flex rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="grid max-h-[calc(100vh-49px)] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8 :grid-cols-10">
        {assets.map((asset, assetIndex) => (
          <button
            key={`block-${asset.id}`}
            type="button"
            className={cn(
              "overflow-hidden rounded-sm border bg-black/40 transition",
              asset.id === activeAssetId
                ? "border-indigo-300 ring-1 ring-indigo-300/70"
                : "border-white/10 hover:border-white/30",
            )}
            onClick={() => onSelectAsset(assetIndex)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={asset.label}
              className="aspect-square w-full object-cover"
              decoding="async"
              fetchPriority="low"
              loading="lazy"
              src={asset.thumbnailUrl || asset.imageUrl}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

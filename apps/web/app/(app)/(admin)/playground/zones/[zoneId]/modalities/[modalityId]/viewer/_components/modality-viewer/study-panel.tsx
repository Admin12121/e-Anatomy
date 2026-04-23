import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import type {
  ViewerAnnotation,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";

import {
  ReferenceCard,
  StructureDrawer,
  TriViewStudyPanel,
} from "./study-sidebar";

type StudySearchHit = {
  asset: ZoneModalityAsset | null;
  structure: ViewerStructure;
};

type RelatedAsset = {
  annotation: ViewerAnnotation;
  asset: ZoneModalityAsset;
};

type StudyPanelProps = {
  activeAssetId: string | null;
  darkMode: boolean;
  readOnly: boolean;
  referenceAssets: ZoneModalityAsset[];
  relatedAssets: RelatedAsset[];
  searchHits: StudySearchHit[];
  searchQuery: string;
  selectedAnnotation: ViewerAnnotation | null;
  selectedStructure: ViewerStructure | null;
  triViewAssets: ZoneModalityAsset[];
  onJumpToAsset: (assetId: string) => void;
  onJumpToStructure: (structureId: string) => void;
  onSearchQueryChange: (value: string) => void;
};

export function StudyPanel({
  activeAssetId,
  darkMode,
  readOnly,
  referenceAssets,
  relatedAssets,
  searchHits,
  searchQuery,
  selectedAnnotation,
  selectedStructure,
  triViewAssets,
  onJumpToAsset,
  onJumpToStructure,
  onSearchQueryChange,
}: StudyPanelProps) {
  return (
    <aside className="space-y-4 overflow-y-auto p-2">
      <div className="space-y-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <Input
            className="pl-9"
            placeholder="Search in this module"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>
        {searchHits.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3">
            {searchHits.map(({ asset, structure }) => (
              <button
                key={structure.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-white/6"
                onClick={() => onJumpToStructure(structure.id)}
              >
                <span>{structure.title}</span>
                {asset ? (
                  <span className="text-xs text-white/45">{asset.label}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {referenceAssets.length > 0 ? (
        <div className="space-y-3">
          <TriViewStudyPanel
            activeAssetId={activeAssetId}
            assets={triViewAssets}
            onSelectAsset={onJumpToAsset}
          />

          {referenceAssets.slice(3).map((asset, index) => (
            <ReferenceCard
              key={asset.id}
              active={asset.id === activeAssetId}
              asset={asset}
              index={index + 3}
              onSelect={() => onJumpToAsset(asset.id)}
            />
          ))}
        </div>
      ) : null}

      {selectedStructure ? (
        <StructureDrawer
          darkMode={darkMode}
          readOnly={readOnly}
          relatedAssets={relatedAssets}
          selectedAnnotation={selectedAnnotation}
          selectedStructure={selectedStructure}
          onJumpToAsset={onJumpToAsset}
        />
      ) : null}
    </aside>
  );
}

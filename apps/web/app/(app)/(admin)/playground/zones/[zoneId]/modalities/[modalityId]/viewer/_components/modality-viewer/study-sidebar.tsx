import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import type {
  ViewerAnnotation,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import { cn } from "@/lib/utils";

export function ReferenceCard({
  active,
  asset,
  index,
  onSelect,
}: {
  active: boolean;
  asset: ZoneModalityAsset;
  index: number;
  onSelect: () => void;
}) {
  const labels = ["Sagittal", "Coronal", "3D"];

  return (
    <button
      type="button"
      className={cn(
        "w-full overflow-hidden rounded-[1.35rem] border text-left transition",
        active
          ? "border-indigo-400/70 bg-indigo-500/8"
          : "border-white/8 bg-black/20",
      )}
      onClick={onSelect}
    >
      <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">
        {labels[index] ?? `Ref ${index + 1}`}
      </div>
      <div className="p-4 pt-2">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={asset.label}
            className="h-40 w-full object-cover"
            decoding="async"
            fetchPriority="low"
            loading="lazy"
            src={asset.thumbnailUrl || asset.imageUrl}
          />
        </div>
      </div>
    </button>
  );
}

export function TriViewStudyPanel({
  activeAssetId,
  assets,
  onSelectAsset,
}: {
  activeAssetId: string | null;
  assets: ZoneModalityAsset[];
  onSelectAsset: (assetId: string) => void;
}) {
  const labels = ["SAGITTAL", "CORONAL", "3D"];

  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="px-3">
      {assets.map((asset, index) => (
        <button
          key={`tri-${asset.id}`}
          type="button"
          className={cn(
            "w-full rounded-xl border p-2 text-left transition",
            asset.id === activeAssetId
              ? "border-indigo-300/70 bg-indigo-500/10"
              : "border-white/8 bg-black/20 hover:bg-white/5",
          )}
          onClick={() => onSelectAsset(asset.id)}
        >
          <div className="mb-2 text-xs font-semibold tracking-[0.18em] text-indigo-300">
            {labels[index] ?? `REF ${index + 1}`}
          </div>
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/35">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={asset.label}
              className="h-28 w-full object-cover"
              decoding="async"
              fetchPriority="low"
              loading="lazy"
              src={asset.thumbnailUrl || asset.imageUrl}
            />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-indigo-300/75" />
          </div>
        </button>
      ))}
    </div>
  );
}

export function StructureDrawer({
  darkMode,
  readOnly,
  selectedAnnotation,
  selectedStructure,
}: {
  darkMode: boolean;
  readOnly: boolean;
  selectedAnnotation: ViewerAnnotation | null;
  selectedStructure: ViewerStructure;
}) {
  void darkMode;
  const isLocked = selectedStructure.accessLevel === "subscription";
  const visibleLearningPoints = selectedStructure.learningPoints.filter(
    (point) => !point.startsWith("interaction:"),
  );

  return (
    <div className={cn("px-2")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">
            {selectedStructure.title}
          </div>
          {selectedStructure.latinName ? (
            <div className="mt-1 text-sm text-indigo-300">
              {selectedStructure.latinName}
            </div>
          ) : null}
        </div>
        <Badge variant={isLocked ? "outline" : "secondary"}>
          {isLocked ? "Subscriber lesson" : "Open lesson"}
        </Badge>
      </div>

      {selectedStructure.shortDescription ? (
        <MarkdownContent
          className="mt-4"
          content={selectedStructure.shortDescription}
        />
      ) : null}

      {isLocked ? (
        <div className="mt-4 rounded-2xl border border-lime-400/40 bg-lime-400/8 p-4 text-sm">
          {readOnly
            ? "This topic is available with a subscription."
            : "Learners will only see the subscriber version of this topic until you publish broader access."}
        </div>
      ) : selectedStructure.longDescription ? (
        <MarkdownContent
          className="mt-4"
          content={selectedStructure.longDescription}
        />
      ) : null}

      {visibleLearningPoints.length > 0 ? (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.2em] text-white/40">
            Learning points
          </div>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {visibleLearningPoints.map((point) => (
              <li
                key={point}
                className="rounded-xl border border-white/8 px-3 py-2"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedAnnotation?.note ? (
        <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/65">
          {selectedAnnotation.note}
        </div>
      ) : null}
    </div>
  );
}

function MarkdownContent({
  className,
  content,
}: {
  className?: string;
  content: string;
}) {
  return (
    <div
      className={cn(
        "text-sm leading-6 text-white/75 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

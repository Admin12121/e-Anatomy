import { useState } from "react";
import { ArrowLeft, LoaderCircleIcon, Plus, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone";
import { Input } from "@/components/ui/input";
import type {
  ViewerAnnotation,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";

import {
  parseCrossReferenceCalibration,
  ReferenceCard,
  ReferenceCalibrationEditor,
  serializeCrossReferenceCalibration,
  StructureDrawer,
} from "./study-sidebar";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { uploadThumbnail } from "@/lib/playground/thumbnail-upload";
import { Frame, FrameHeader, FramePanel } from "@/components/ui/frame";

type StudySearchHit = {
  asset: ZoneModalityAsset | null;
  structure: ViewerStructure;
};

type StudyPanelProps = {
  readOnly: boolean;
  referenceAssets: ZoneModalityAsset[];
  referenceBusy: boolean;
  referenceDisabled: boolean;
  referenceProgress: number;
  searchHits: StudySearchHit[];
  searchQuery: string;
  selectedAnnotation: ViewerAnnotation | null;
  selectedStructure: ViewerStructure | null;
  onCloseStructure: () => void;
  onCreateReferenceAsset: (input: {
    imageUrl: string;
    notes: string;
    title: string;
  }) => Promise<boolean>;
  onDeleteReferenceAsset: (assetId: string) => Promise<boolean>;
  onReferenceProgressChange: (progress: number) => void;
  onUpdateReferenceAsset: (
    assetId: string,
    input: {
      imageUrl: string;
      notes: string;
      title: string;
    },
  ) => Promise<boolean>;
  onJumpToStructure: (structureId: string) => void;
  onSearchQueryChange: (value: string) => void;
};

export function StudyPanel({
  readOnly,
  referenceAssets,
  referenceBusy,
  referenceDisabled,
  referenceProgress,
  searchHits,
  searchQuery,
  selectedAnnotation,
  selectedStructure,
  onCloseStructure,
  onCreateReferenceAsset,
  onDeleteReferenceAsset,
  onReferenceProgressChange,
  onUpdateReferenceAsset,
  onJumpToStructure,
  onSearchQueryChange,
}: StudyPanelProps) {
  const [editingReferenceAssetId, setEditingReferenceAssetId] = useState<
    string | null
  >(null);
  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [referenceCalibration, setReferenceCalibration] = useState(() =>
    parseCrossReferenceCalibration(null),
  );
  const [showCrossReferencesPanel, setShowCrossReferencesPanel] =
    useState(true);
  const [isUploadingReferenceImage, setIsUploadingReferenceImage] =
    useState(false);
  const showStructureDrawer = Boolean(selectedStructure);
  const isEditingReferenceAsset = Boolean(editingReferenceAssetId);
  const referenceFormTitle = isEditingReferenceAsset
    ? "Edit Cross Reference"
    : "Cross References";
  const referenceSaveLabel = isEditingReferenceAsset ? "Update" : "Save";

  const handleReferenceImageSelection = (file: File) => {
    setIsUploadingReferenceImage(true);
    uploadThumbnail(file)
      .then((nextImageUrl) => {
        setReferenceImageUrl(nextImageUrl);
        setReferenceCalibration(parseCrossReferenceCalibration(null));
      })
      .catch(() => toast.error("Unable to upload cross reference image."))
      .finally(() => setIsUploadingReferenceImage(false));
  };

  const resetReferenceForm = () => {
    setEditingReferenceAssetId(null);
    setReferenceTitle("");
    setReferenceImageUrl("");
    setReferenceCalibration(parseCrossReferenceCalibration(null));
  };

  const handleEditReferenceAsset = (asset: ZoneModalityAsset) => {
    setEditingReferenceAssetId(asset.id);
    setReferenceTitle(asset.label);
    setReferenceImageUrl(asset.thumbnailUrl || asset.imageUrl);
    setReferenceCalibration(parseCrossReferenceCalibration(asset.notes));
  };

  const handleSaveReferenceAsset = async () => {
    const input = {
      imageUrl: referenceImageUrl,
      notes: serializeCrossReferenceCalibration(referenceCalibration),
      title: referenceTitle,
    };
    const saved = editingReferenceAssetId
      ? await onUpdateReferenceAsset(editingReferenceAssetId, input)
      : await onCreateReferenceAsset(input);

    if (!saved) {
      return;
    }

    resetReferenceForm();
  };

  const handleDeleteReferenceAsset = async (asset: ZoneModalityAsset) => {
    const deleted = await onDeleteReferenceAsset(asset.id);

    if (deleted && editingReferenceAssetId === asset.id) {
      resetReferenceForm();
    }

    return deleted;
  };

  const handleToggleCrossReferences = () => {
    if (showStructureDrawer) {
      onCloseStructure();
      setShowCrossReferencesPanel(true);
      return;
    }

    setShowCrossReferencesPanel((current) => !current);
  };

  return (
    <aside className="h-full min-h-0 space-y-4 overflow-y-auto p-2">
      <div className="space-y-2">
        <span className={cn(readOnly ? "flex items-center flex-row gap-2" : "flex items-center gap-2")}>
          {readOnly && (
            <Link
              href={"/"}
              className={cn(
                buttonVariants({ variant: "secondary", size: "icon" }),
              )}
            >
              <ArrowLeft className="size-5" />
            </Link>
          )}
          <div className="relative w-full">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search in this module"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
          </div>
          {!readOnly && (
            <Button
              aria-label={
                showStructureDrawer || !showCrossReferencesPanel
                  ? "Open cross references"
                  : "Hide cross references"
              }
              variant="secondary"
              size="icon"
              onClick={handleToggleCrossReferences}
            >
              <Plus className="size-5" />
            </Button>
          )}
        </span>
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

      {!showStructureDrawer && !readOnly && showCrossReferencesPanel ? (
        <Frame>
          <FrameHeader className="px-3 py-2 flex flex-row items-center justify-between">
            <div className="text-sm font-semibold">{referenceFormTitle}</div>
            <div className="flex items-center gap-2">
              {isEditingReferenceAsset ? (
                <Button
                  disabled={referenceBusy || isUploadingReferenceImage}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={resetReferenceForm}
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                disabled={
                  referenceBusy ||
                  isUploadingReferenceImage ||
                  !referenceTitle.trim() ||
                  !referenceImageUrl.trim()
                }
                size="sm"
                type="button"
                onClick={() => void handleSaveReferenceAsset()}
              >
                {(referenceBusy || isUploadingReferenceImage) && (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                )}
                {referenceSaveLabel}
              </Button>
            </div>
          </FrameHeader>
          <FramePanel className="space-y-3 p-3">
            <Input
              placeholder="Reference title"
              value={referenceTitle}
              onChange={(event) => setReferenceTitle(event.target.value)}
            />
            <ImageUploadDropzone
              disabled={isUploadingReferenceImage}
              emptyTitle="Drop cross reference image here"
              onClear={() => {
                setReferenceImageUrl("");
                setReferenceCalibration(parseCrossReferenceCalibration(null));
              }}
              onFileAccepted={handleReferenceImageSelection}
              previewAlt="Cross reference"
              value={referenceImageUrl}
            />
            {referenceImageUrl ? (
              <ReferenceCalibrationEditor
                imageUrl={referenceImageUrl}
                value={referenceCalibration}
                onChange={setReferenceCalibration}
              />
            ) : null}
          </FramePanel>
        </Frame>
      ) : null}

      {!showStructureDrawer && referenceAssets.length > 0 ? (
        <div className="space-y-3">
          {referenceAssets.map((asset, index) => (
            <ReferenceCard
              key={asset.id}
              allowEditing={!readOnly}
              asset={asset}
              busy={referenceBusy}
              disabled={referenceDisabled}
              index={index}
              progress={referenceProgress}
              onDelete={() => handleDeleteReferenceAsset(asset)}
              onEdit={() => handleEditReferenceAsset(asset)}
              onProgressChange={onReferenceProgressChange}
            />
          ))}
        </div>
      ) : null}

      {selectedStructure ? (
        <StructureDrawer
          readOnly={readOnly}
          selectedAnnotation={selectedAnnotation}
          selectedStructure={selectedStructure}
          onClose={onCloseStructure}
        />
      ) : null}
    </aside>
  );
}

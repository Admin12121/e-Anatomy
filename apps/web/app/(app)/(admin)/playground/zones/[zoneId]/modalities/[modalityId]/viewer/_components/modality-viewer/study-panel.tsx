import { useState } from "react";
import { ArrowLeft, LoaderCircleIcon, Plus, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const MAX_REFERENCE_ASSET_COUNT = 3;

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
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [isUploadingReferenceImage, setIsUploadingReferenceImage] =
    useState(false);
  const showStructureDrawer = Boolean(selectedStructure);
  const isEditingReferenceAsset = Boolean(editingReferenceAssetId);
  const referenceFormTitle = isEditingReferenceAsset
    ? "Edit Cross Reference"
    : "Cross References";
  const referenceSaveLabel = isEditingReferenceAsset ? "Update" : "Save";
  const visibleReferenceAssets = referenceAssets.slice(
    0,
    MAX_REFERENCE_ASSET_COUNT,
  );
  const referenceLimitReached =
    !isEditingReferenceAsset &&
    referenceAssets.length >= MAX_REFERENCE_ASSET_COUNT;

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

  const handleReferenceDialogOpenChange = (open: boolean) => {
    setReferenceDialogOpen(open);

    if (!open) {
      resetReferenceForm();
    }
  };

  const handleOpenReferenceDialog = () => {
    if (showStructureDrawer) {
      onCloseStructure();
    }

    if (referenceLimitReached) {
      toast.error("Only 3 cross references are allowed.");
      return;
    }

    resetReferenceForm();
    setReferenceDialogOpen(true);
  };

  const handleEditReferenceAsset = (asset: ZoneModalityAsset) => {
    setEditingReferenceAssetId(asset.id);
    setReferenceTitle(asset.label);
    setReferenceImageUrl(asset.thumbnailUrl || asset.imageUrl);
    setReferenceCalibration(parseCrossReferenceCalibration(asset.notes));
    setReferenceDialogOpen(true);
  };

  const handleSaveReferenceAsset = async () => {
    if (referenceLimitReached) {
      toast.error("Only 3 cross references are allowed.");
      return;
    }

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
    setReferenceDialogOpen(false);
  };

  const handleDeleteReferenceAsset = async (asset: ZoneModalityAsset) => {
    const deleted = await onDeleteReferenceAsset(asset.id);

    if (deleted && editingReferenceAssetId === asset.id) {
      resetReferenceForm();
      setReferenceDialogOpen(false);
    }

    return deleted;
  };

  return (
    <aside
      className={cn(
        "h-full min-h-0 p-2",
        showStructureDrawer
          ? "flex flex-col gap-4 overflow-hidden max-xl:fixed max-xl:inset-x-0 max-xl:bottom-14 max-xl:top-0 max-xl:z-50 max-xl:bg-background max-xl:p-4"
          : "flex flex-col gap-4 overflow-hidden max-xl:border-r max-xl:border-border/70 max-xl:bg-background/95 max-xl:p-1",
      )}
    >
      <div className={cn("shrink-0 space-y-2", showStructureDrawer && "max-xl:hidden")}>
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
              aria-label="Add cross reference"
              disabled={referenceLimitReached}
              variant="secondary"
              size="icon"
              onClick={handleOpenReferenceDialog}
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

      {!showStructureDrawer && visibleReferenceAssets.length > 0 ? (
        <div
          className={cn(
            "grid h-[calc(100dvh-100px)] min-h-0 flex-1 auto-rows-min content-start gap-3 pr-1",
            readOnly ? "overflow-hidden" : "overflow-y-auto",
          )}
          style={{
            gridTemplateRows: `repeat(${visibleReferenceAssets.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleReferenceAssets.map((asset, index) => (
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

      {!readOnly ? (
        <Dialog
          open={referenceDialogOpen}
          onOpenChange={handleReferenceDialogOpenChange}
        >
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{referenceFormTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Reference title"
                value={referenceTitle}
                onChange={(event) => setReferenceTitle(event.target.value)}
              />
              <ImageUploadDropzone
                disabled={isUploadingReferenceImage}
                dropzoneClassName="max-xl:min-h-32 max-xl:p-2"
                emptyDescriptionClassName="max-xl:hidden"
                emptyTitleClassName="max-xl:sr-only"
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
            </div>
            <DialogFooter className="mt-4">
              <Button
                disabled={referenceBusy || isUploadingReferenceImage}
                type="button"
                variant="secondary"
                onClick={() => handleReferenceDialogOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  referenceBusy ||
                  isUploadingReferenceImage ||
                  referenceLimitReached ||
                  !referenceTitle.trim() ||
                  !referenceImageUrl.trim()
                }
                type="button"
                onClick={() => void handleSaveReferenceAsset()}
              >
                {(referenceBusy || isUploadingReferenceImage) && (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                )}
                {referenceSaveLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

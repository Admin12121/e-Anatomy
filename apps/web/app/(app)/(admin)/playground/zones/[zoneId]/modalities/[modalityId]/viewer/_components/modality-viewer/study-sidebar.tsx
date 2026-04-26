import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ViewerAnnotation,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Pencil, Trash2, X } from "lucide-react";
import Image from "next/image";

export type CrossReferenceCalibration = {
  endY: number;
  startY: number;
};

type CalibrationHandle = "end" | "start";

const DEFAULT_REFERENCE_CALIBRATION: CrossReferenceCalibration = {
  endY: 0.92,
  startY: 0.08,
};
const MIN_CALIBRATION_GAP = 0.04;

function clampProgress(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? clampProgress(value)
    : fallback;
}

export function parseCrossReferenceCalibration(
  notes: string | null,
): CrossReferenceCalibration {
  if (!notes) {
    return DEFAULT_REFERENCE_CALIBRATION;
  }

  try {
    const parsed = JSON.parse(notes) as {
      crossReference?: Partial<CrossReferenceCalibration>;
    };
    const calibration = parsed.crossReference ?? {};

    return {
      endY: readNumber(calibration.endY, DEFAULT_REFERENCE_CALIBRATION.endY),
      startY: readNumber(
        calibration.startY,
        DEFAULT_REFERENCE_CALIBRATION.startY,
      ),
    };
  } catch {
    return DEFAULT_REFERENCE_CALIBRATION;
  }
}

export function serializeCrossReferenceCalibration(
  calibration: CrossReferenceCalibration,
) {
  const normalized = normalizeCalibration(calibration);

  return JSON.stringify({
    crossReference: {
      endY: normalized.endY,
      startY: normalized.startY,
    },
  });
}

function normalizeCalibration(
  calibration: CrossReferenceCalibration,
): CrossReferenceCalibration {
  const startY = clampProgress(calibration.startY);
  const endY = clampProgress(calibration.endY);

  if (Math.abs(endY - startY) >= MIN_CALIBRATION_GAP) {
    return { endY, startY };
  }

  const nextEndY = clampProgress(startY + MIN_CALIBRATION_GAP);
  const nextStartY =
    nextEndY === startY ? clampProgress(endY - MIN_CALIBRATION_GAP) : startY;

  return { endY: nextEndY, startY: nextStartY };
}

function getReferenceLineY(
  calibration: CrossReferenceCalibration,
  progress: number,
) {
  const normalized = normalizeCalibration(calibration);

  return clampProgress(
    normalized.startY + (normalized.endY - normalized.startY) * progress,
  );
}

export function ReferenceCard({
  allowEditing,
  asset,
  busy,
  disabled,
  index,
  progress,
  onDelete,
  onEdit,
  onProgressChange,
}: {
  allowEditing: boolean;
  asset: ZoneModalityAsset;
  busy: boolean;
  disabled: boolean;
  index: number;
  progress: number;
  onDelete: () => Promise<boolean>;
  onEdit: () => void;
  onProgressChange: (progress: number) => void;
}) {
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const labels = ["SAGITTAL", "CORONAL", "3D"];
  const calibration = useMemo(
    () => parseCrossReferenceCalibration(asset.notes),
    [asset.notes],
  );
  const lineY = getReferenceLineY(calibration, progress);

  const updateProgressFromClientY = useCallback(
    (clientY: number) => {
      const frame = imageFrameRef.current;

      if (!frame) {
        return;
      }

      const rect = frame.getBoundingClientRect();

      if (rect.height <= 0) {
        return;
      }

      const normalizedY = clampProgress((clientY - rect.top) / rect.height);
      const axis = calibration.endY - calibration.startY;
      const nextProgress =
        Math.abs(axis) < MIN_CALIBRATION_GAP
          ? 0
          : (normalizedY - calibration.startY) / axis;

      onProgressChange(clampProgress(nextProgress));
    },
    [calibration.endY, calibration.startY, onProgressChange],
  );

  useEffect(() => {
    if (!isDragging || disabled) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateProgressFromClientY(event.clientY);
    };
    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [disabled, isDragging, updateProgressFromClientY]);

  return (
    <div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 px-4">
        <span aria-hidden="true" />
        <div className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">
          {labels[index] ?? `Ref ${index + 1}`}
        </div>
        {allowEditing ? (
          <div className="flex items-center gap-1">
            <Button
              aria-label={`Edit ${asset.label}`}
              disabled={busy}
              size="icon"
              type="button"
              variant="ghost"
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            <DeleteConfirmationDialog
              confirmationLabel="Cross reference name"
              confirmationValue={asset.label}
              descriptionPrefix="Delete this cross reference. To confirm, enter the"
              disabled={busy}
              onConfirm={async () => {
                const deleted = await onDelete();

                if (!deleted) {
                  throw new Error("Unable to delete cross reference.");
                }
              }}
              placeholder={asset.label}
              pending={busy}
              title="Delete cross reference"
              trigger={
                <Button
                  aria-label={`Delete ${asset.label}`}
                  disabled={busy}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
      <div className="p-4 pt-2">
        <div
          ref={imageFrameRef}
          className={cn(
            "relative overflow-hidden",
            disabled ? "cursor-not-allowed opacity-70" : "cursor-ns-resize",
          )}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) {
              return;
            }

            event.preventDefault();
            setIsDragging(true);
            updateProgressFromClientY(event.clientY);
          }}
        >
          <Image
            alt={asset.label}
            className="h-96 w-full select-none object-cover"
            decoding="async"
            draggable={false}
            fetchPriority="low"
            loading="lazy"
            src={asset.thumbnailUrl || asset.imageUrl}
            width={400}
            height={400}
          />
          <div
            className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-indigo-500 shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_10px_rgba(56,189,248,0.55)]"
            style={{ top: `${lineY * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ReferenceCalibrationEditor({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: CrossReferenceCalibration;
  onChange: (value: CrossReferenceCalibration) => void;
}) {
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const [dragHandle, setDragHandle] = useState<CalibrationHandle | null>(null);

  const updateHandleFromClientY = useCallback(
    (clientY: number, handle: CalibrationHandle) => {
      const frame = imageFrameRef.current;

      if (!frame) {
        return;
      }

      const rect = frame.getBoundingClientRect();

      if (rect.height <= 0) {
        return;
      }

      const y = clampProgress((clientY - rect.top) / rect.height);

      onChange(
        handle === "start"
          ? {
              endY: value.endY,
              startY: clampProgress(
                Math.min(y, value.endY - MIN_CALIBRATION_GAP),
              ),
            }
          : {
              endY: clampProgress(
                Math.max(y, value.startY + MIN_CALIBRATION_GAP),
              ),
              startY: value.startY,
            },
      );
    },
    [onChange, value.endY, value.startY],
  );

  useEffect(() => {
    if (!dragHandle) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateHandleFromClientY(event.clientY, dragHandle);
    };
    const handlePointerUp = () => {
      setDragHandle(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragHandle, updateHandleFromClientY]);

  const normalizedValue = normalizeCalibration(value);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-white/70">
        Set start and end slice positions
      </div>
      <div
        ref={imageFrameRef}
        className="relative h-56 overflow-hidden rounded-xl border border-white/10 bg-black"
      >
        <Image
          alt="Cross reference calibration"
          className="h-full w-full select-none object-cover"
          draggable={false}
          src={imageUrl}
          width={400}
          height={260}
        />
        {(["start", "end"] as const).map((handle) => {
          const y =
            handle === "start" ? normalizedValue.startY : normalizedValue.endY;

          return (
            <button
              key={handle}
              type="button"
              className="absolute inset-x-0 z-10 h-5 -translate-y-1/2 cursor-ns-resize touch-none"
              style={{ top: `${y * 100}%` }}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                event.preventDefault();
                setDragHandle(handle);
                updateHandleFromClientY(event.clientY, handle);
              }}
            >
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-sky-400 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-200">
                {handle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StructureDrawer({
  readOnly,
  selectedAnnotation,
  selectedStructure,
  onClose,
}: {
  onClose: () => void;
  readOnly: boolean;
  selectedAnnotation: ViewerAnnotation | null;
  selectedStructure: ViewerStructure;
}) {
  const isLocked = selectedStructure.accessLevel === "subscription";
  const visibleLearningPoints = selectedStructure.learningPoints.filter(
    (point) => !point.startsWith("interaction:"),
  );

  return (
    <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-2 pb-8">
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
        <Button
          aria-label="Close topic"
          variant="secondary"
          size="icon"
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>
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
        "text-sm leading-6 dark:text-white/75 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

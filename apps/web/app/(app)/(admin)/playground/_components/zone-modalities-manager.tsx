"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  FileArchiveIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  Plus,
  SaveIcon,
  SquareArrowOutUpRight,
  Trash,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone";
import { Input } from "@/components/ui/input";
import {
  analyzeModalityUploadFiles,
  isLikelyDicomFilename,
  isZipFilename,
  type DetectedModalityUpload,
  ModalityUploadValidationError,
} from "@/lib/playground/modality-upload-shared";
import type {
  ModalityType,
  UpdateZoneModalityFamilyInput,
  ZoneModality,
  ZoneModalityFamily,
  ZoneModalityFamilyListResponse,
} from "@/lib/playground/types";
import {
  MODALITY_TYPE_OPTIONS,
  MODALITY_WEIGHTING_OPTIONS,
  type ModalityWeightingSelectValue,
} from "@/lib/playground/modality-options";
import { uploadThumbnail } from "@/lib/playground/thumbnail-upload";
import { useAppDispatch } from "@/lib/store/hooks";
import {
  playgroundApi,
  useDeleteZoneModalityMutation,
  useGetZoneModalitiesQuery,
  useUpdateZoneModalityFamilyMutation,
} from "@/lib/store/services/playground-api";
import { PlaygroundSelect } from "./playground-select";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";

const EMPTY_MODALITY_FAMILIES: ZoneModalityFamily[] = [];

type EditorMode = "create" | "edit";
type CreateContext =
  | {
      kind: "new";
    }
  | {
      kind: "variant";
      familyId: string;
      modalityType: ModalityType;
      name: string;
      thumbnailUrl: string;
    };

type ModalityFamilySaveInput = {
  modalityType: ModalityType;
  name: string;
  thumbnailUrl: string;
  weightingByVariantId: Record<string, ModalityWeightingSelectValue>;
};

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

type FileSystemEntryWithWebkitApi = {
  isDirectory?: boolean;
  isFile?: boolean;
};

type FileSystemFileEntryWithWebkitApi = FileSystemEntryWithWebkitApi & {
  file?: (
    success: (file: File) => void,
    error?: (error: unknown) => void,
  ) => void;
};

type FileSystemDirectoryReaderWithWebkitApi = {
  readEntries?: (
    success: (entries: FileSystemEntryWithWebkitApi[]) => void,
    error?: (error: unknown) => void,
  ) => void;
};

type FileSystemDirectoryEntryWithWebkitApi = FileSystemEntryWithWebkitApi & {
  createReader?: () => FileSystemDirectoryReaderWithWebkitApi;
};

type DataTransferItemWithWebkitEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryWithWebkitApi | null;
};

type StudyUploadProgressState = {
  loadedBytes: number;
  phase: "uploading" | "processing";
  percent: number | null;
  totalBytes: number | null;
};

const UPLOAD_READY_PREVIEW_SRC = "/upload%20_ready.png";
const MAX_UPLOAD_PATH_LENGTH = 260;
const MAX_UPLOAD_FILES = 512;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const DANGEROUS_PATH_PATTERN = /(^|[\\/])\.\.($|[\\/])/;

function isSuspiciousUploadPath(pathValue: string) {
  const normalized = pathValue.trim();

  if (!normalized) {
    return true;
  }

  if (normalized.length > MAX_UPLOAD_PATH_LENGTH) {
    return true;
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("\\") ||
    normalized.includes(":") ||
    DANGEROUS_PATH_PATTERN.test(normalized) ||
    CONTROL_CHAR_PATTERN.test(normalized)
  ) {
    return true;
  }

  return normalized
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .some((segment) => !segment || segment === "." || segment === "..");
}

function getClientUploadValidationError(files: File[]) {
  if (files.length === 0) {
    return null;
  }

  if (files.length > MAX_UPLOAD_FILES) {
    return "Too many files were dropped. Split the upload into smaller batches.";
  }

  const hasZip = files.some((file) => isZipFilename(file.name));

  if (hasZip && files.length !== 1) {
    return "ZIP packages must be uploaded by themselves.";
  }

  if (!hasZip && files.some((file) => !isLikelyDicomFilename(file.name))) {
    return "Only one ZIP package or DICOM files are allowed.";
  }

  for (const file of files) {
    if (file.size <= 0) {
      return "Empty files are not allowed.";
    }

    if (isSuspiciousUploadPath(file.name)) {
      return "A suspicious file name was detected. Upload was blocked.";
    }

    const relativePath = (
      file as FileWithRelativePath
    ).webkitRelativePath?.trim();

    if (relativePath && isSuspiciousUploadPath(relativePath)) {
      return "A suspicious folder path was detected. Upload was blocked.";
    }
  }

  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    if (
      "data" in error &&
      error.data &&
      typeof error.data === "object" &&
      "error" in error.data &&
      error.data.error &&
      typeof error.data.error === "object" &&
      "message" in error.data.error &&
      error.data.error.message
    ) {
      return String(error.data.error.message);
    }

    if ("message" in error && error.message) {
      return String(error.message);
    }
  }

  return fallback;
}

function formatModalityVariantCount(count: number) {
  return `${count} variant${count === 1 ? "" : "s"}`;
}

function formatFamilyProcessingStatus(family: ZoneModalityFamily) {
  if (family.totalVariantCount === 1) {
    return family.variants[0]?.processingStatus.replaceAll("_", " ") ?? "draft";
  }

  return `${family.readyVariantCount}/${family.totalVariantCount} (ready / total)`;
}

function buildFamilyWeightingState(family: ZoneModalityFamily) {
  return Object.fromEntries(
    family.variants.map((variant) => [variant.id, variant.weightingCode ?? ""]),
  ) as Record<string, ModalityWeightingSelectValue>;
}

function hasActiveModalityIngest(families: ZoneModalityFamily[]) {
  return families.some((family) =>
    family.variants.some(
      (modality) =>
        modality.processingStatus === "processing" ||
        modality.processingStatus === "uploaded",
    ),
  );
}

function getSelectedSourceLabel(files: File[]) {
  const firstRelativePath = files
    .map((file) => (file as FileWithRelativePath).webkitRelativePath?.trim())
    .find((value): value is string => Boolean(value));

  if (firstRelativePath) {
    const folderName = firstRelativePath.split("/")[0]?.trim();

    if (folderName) {
      return folderName;
    }
  }

  return files[0]?.name?.trim() || null;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getUploadErrorMessage(xhr: XMLHttpRequest, fallback: string) {
  const rawResponse = xhr.responseText || xhr.response;

  if (typeof rawResponse === "string" && rawResponse.trim().length > 0) {
    try {
      const payload = JSON.parse(rawResponse) as {
        error?: {
          message?: string;
        };
      };

      if (payload.error?.message) {
        return payload.error.message;
      }
    } catch {
      // Ignore non-JSON error payloads.
    }
  }

  return fallback;
}

async function uploadStudyIntakeWithProgress({
  formData,
  onProgress,
  zoneId,
}: {
  formData: FormData;
  onProgress: (state: StudyUploadProgressState) => void;
  zoneId: string;
}) {
  return new Promise<ZoneModality>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoadedBytes = 0;
    let lastTotalBytes: number | null = null;
    xhr.open("POST", `/api/playground/zones/${zoneId}/modalities/intake`);
    xhr.responseType = "text";
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : null;
      const loadedBytes = event.loaded;
      lastLoadedBytes = loadedBytes;
      lastTotalBytes = totalBytes;
      const percent =
        totalBytes && totalBytes > 0
          ? Math.min(100, (loadedBytes / totalBytes) * 100)
          : null;

      onProgress({
        loadedBytes,
        percent,
        phase: "uploading",
        totalBytes,
      });
    };

    xhr.onerror = () => {
      reject(new Error("Unable to upload the selected study."));
    };

    xhr.onabort = () => {
      reject(new Error("Study upload was cancelled."));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(
            getUploadErrorMessage(xhr, "Unable to create the modality draft."),
          ),
        );
        return;
      }

      onProgress({
        loadedBytes: lastLoadedBytes,
        percent: 100,
        phase: "processing",
        totalBytes: lastTotalBytes,
      });

      try {
        const payload = JSON.parse(
          xhr.responseText || xhr.response,
        ) as ZoneModality;
        resolve(payload);
      } catch {
        reject(new Error("The server returned an invalid modality response."));
      }
    };

    xhr.send(formData);
  });
}

function readDirectoryBatch(
  reader: FileSystemDirectoryReaderWithWebkitApi,
): Promise<FileSystemEntryWithWebkitApi[]> {
  return new Promise((resolve, reject) => {
    if (!reader.readEntries) {
      resolve([]);
      return;
    }

    reader.readEntries(resolve, reject);
  });
}

function readFileEntry(
  entry: FileSystemFileEntryWithWebkitApi,
): Promise<File | null> {
  return new Promise((resolve) => {
    if (!entry.file) {
      resolve(null);
      return;
    }

    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

async function collectFilesFromEntry(
  entry: FileSystemEntryWithWebkitApi,
): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntryWithWebkitApi);
    return file ? [file] : [];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const directoryEntry = entry as FileSystemDirectoryEntryWithWebkitApi;
  const reader = directoryEntry.createReader?.();

  if (!reader) {
    return [];
  }

  const files: File[] = [];

  while (true) {
    const entries = await readDirectoryBatch(reader);

    if (!entries.length) {
      break;
    }

    for (const childEntry of entries) {
      const childFiles = await collectFilesFromEntry(childEntry);
      files.push(...childFiles);
    }
  }

  return files;
}

async function extractFilesFromDroppedItems(
  items: DataTransferItem[],
  fallbackFiles: File[],
) {
  if (!items.length) {
    return fallbackFiles;
  }

  const extractedFiles: File[] = [];

  for (const item of items) {
    if (item.kind !== "file") {
      continue;
    }

    const itemWithEntry = item as DataTransferItemWithWebkitEntry;
    const entry = itemWithEntry.webkitGetAsEntry?.() ?? null;

    if (entry) {
      const entryFiles = await collectFilesFromEntry(entry);
      extractedFiles.push(...entryFiles);
      continue;
    }

    const file = item.getAsFile();

    if (file) {
      extractedFiles.push(file);
    }
  }

  return extractedFiles.length > 0 ? extractedFiles : fallbackFiles;
}

export function ZoneModalitiesManager({ zoneId }: { zoneId: string }) {
  const dispatch = useAppDispatch();
  const { data, isLoading } = useGetZoneModalitiesQuery(zoneId);
  const modalityFamilies = data?.items ?? EMPTY_MODALITY_FAMILIES;
  const modalities = useMemo(
    () => modalityFamilies.flatMap((family) => family.variants),
    [modalityFamilies],
  );
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [createContext, setCreateContext] = useState<CreateContext>({
    kind: "new",
  });
  const [activeModalityId, setActiveModalityId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createThumbnailUrl, setCreateThumbnailUrl] = useState("");
  const [createThumbnailUploading, setCreateThumbnailUploading] = useState(false);
  const [createDetectedUpload, setCreateDetectedUpload] =
    useState<DetectedModalityUpload | null>(null);
  const [createModalityTypeOverride, setCreateModalityTypeOverride] =
    useState<ModalityType>("other");
  const [createWeightingCode, setCreateWeightingCode] =
    useState<ModalityWeightingSelectValue>("");
  const [selectedSourceLabel, setSelectedSourceLabel] = useState<string | null>(
    null,
  );
  const [selectedSourceFiles, setSelectedSourceFiles] = useState<File[]>([]);
  const [isAnalyzingSource, setIsAnalyzingSource] = useState(false);
  const [isCreatingFromStudy, setIsCreatingFromStudy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [showReadyPreview, setShowReadyPreview] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<StudyUploadProgressState | null>(null);
  const [updateModalityFamily, { isLoading: isUpdatingFamily }] =
    useUpdateZoneModalityFamilyMutation();
  const [deleteModality, { isLoading: isDeleting }] =
    useDeleteZoneModalityMutation();
  const dragCounterRef = useRef(0);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const sourceFolderInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedActiveModalityId =
    activeModalityId &&
    modalities.some((modality) => modality.id === activeModalityId)
      ? activeModalityId
      : null;
  const activeModality = resolvedActiveModalityId
    ? (modalities.find(
        (modality) => modality.id === resolvedActiveModalityId,
      ) ?? null)
    : null;
  const activeModalityFamily = activeModality
    ? (modalityFamilies.find((family) =>
        family.variants.some((variant) => variant.id === activeModality.id),
      ) ?? null)
    : null;
  const isPending =
    isAnalyzingSource || isCreatingFromStudy || isUpdatingFamily || isDeleting;
  const hasActiveIngest = hasActiveModalityIngest(modalityFamilies);

  useEffect(() => {
    if (!hasActiveIngest) {
      return;
    }

    const stream = new EventSource(
      `/api/playground/zones/${zoneId}/modalities/stream`,
    );

    function handleModalitiesEvent(event: MessageEvent<string>) {
      try {
        const payload = JSON.parse(
          event.data,
        ) as ZoneModalityFamilyListResponse;
        dispatch(
          playgroundApi.util.updateQueryData(
            "getZoneModalities",
            zoneId,
            (draft) => {
              draft.total = payload.total;
              draft.items.splice(0, draft.items.length, ...payload.items);
            },
          ),
        );
      } catch {
        // Ignore malformed stream payloads and wait for the next event.
      }
    }

    function handleDoneEvent() {
      stream.close();
    }

    stream.addEventListener(
      "modalities",
      handleModalitiesEvent as EventListener,
    );
    stream.addEventListener("done", handleDoneEvent as EventListener);

    return () => {
      stream.removeEventListener(
        "modalities",
        handleModalitiesEvent as EventListener,
      );
      stream.removeEventListener("done", handleDoneEvent as EventListener);
      stream.close();
    };
  }, [dispatch, hasActiveIngest, zoneId]);

  useEffect(() => {
    const folderInput = sourceFolderInputRef.current as
      | (HTMLInputElement & { webkitdirectory?: boolean })
      | null;

    if (!folderInput) {
      return;
    }

    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
    folderInput.webkitdirectory = true;
  }, []);

  useEffect(() => {
    const sourceInput = sourceInputRef.current;

    if (!sourceInput) {
      return;
    }

    const handleCancel = () => {
      if (isPending || selectedSourceFiles.length > 0) {
        return;
      }

      sourceFolderInputRef.current?.click();
    };

    sourceInput.addEventListener("cancel", handleCancel as EventListener);

    return () => {
      sourceInput.removeEventListener("cancel", handleCancel as EventListener);
    };
  }, [isPending, selectedSourceFiles.length]);

  function clearSelectedSource(options?: { preserveModalityType?: boolean }) {
    const preserveModalityType =
      options?.preserveModalityType ?? createContext.kind === "variant";

    setCreateDetectedUpload(null);
    if (!preserveModalityType) {
      setCreateModalityTypeOverride("other");
    }
    setSelectedSourceLabel(null);
    setSelectedSourceFiles([]);
    setShowReadyPreview(false);
    setUploadProgress(null);
    setUploadErrors([]);
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (sourceInputRef.current) {
      sourceInputRef.current.value = "";
    }

    if (sourceFolderInputRef.current) {
      sourceFolderInputRef.current.value = "";
    }
  }

  function resetCreateState(nextContext: CreateContext = { kind: "new" }) {
    setCreateContext(nextContext);
    setCreateName(nextContext.kind === "variant" ? nextContext.name : "");
    setCreateThumbnailUrl(
      nextContext.kind === "variant" ? nextContext.thumbnailUrl : "",
    );
    setCreateModalityTypeOverride(
      nextContext.kind === "variant" ? nextContext.modalityType : "other",
    );
    setCreateWeightingCode("");
    clearSelectedSource({
      preserveModalityType: nextContext.kind === "variant",
    });
  }

  function startCreateMode() {
    setEditorMode("create");
    resetCreateState();
  }

  function startVariantCreateMode(family: ZoneModalityFamily) {
    setEditorMode("create");
    resetCreateState({
      kind: "variant",
      familyId: family.id,
      modalityType: family.modalityType,
      name: family.name,
      thumbnailUrl: family.thumbnailUrl ?? "",
    });
  }

  function selectModality(family: ZoneModalityFamily) {
    const nextActiveVariantId = family.variants.some(
      (variant) => variant.id === resolvedActiveModalityId,
    )
      ? resolvedActiveModalityId
      : (family.variants[0]?.id ?? null);

    setActiveModalityId(nextActiveVariantId);
    setEditorMode("edit");
  }

  async function processSelectedSourceFiles(files: File[]) {
    const clientValidationError = getClientUploadValidationError(files);

    if (clientValidationError) {
      clearSelectedSource();
      setUploadErrors([clientValidationError]);
      toast.error(clientValidationError);
      return;
    }

    setSelectedSourceFiles(files);
    const sourceLabel = getSelectedSourceLabel(files);
    setSelectedSourceLabel(sourceLabel);
    setUploadErrors([]);
    setShowReadyPreview(false);

    if (files.length === 0) {
      clearSelectedSource();
      return;
    }

    setIsAnalyzingSource(true);

    try {
      const detectedUpload = await analyzeModalityUploadFiles(files);
      setCreateDetectedUpload(detectedUpload);
      if (createContext.kind === "new") {
        setCreateModalityTypeOverride(detectedUpload.detectedModalityType);
      }
      setShowReadyPreview(true);
    } catch (error) {
      setCreateDetectedUpload(null);
      if (createContext.kind === "new") {
        setCreateModalityTypeOverride("other");
      }
      const message =
        error instanceof ModalityUploadValidationError
          ? error.message
          : "Select one ZIP package or a folder of DICOM files.";
      setUploadErrors([message]);
      setShowReadyPreview(false);
      toast.error(message);
    } finally {
      setIsAnalyzingSource(false);
    }
  }

  async function handleSourceSelection(nextFiles: FileList | null) {
    const files = Array.from(nextFiles ?? []);
    await processSelectedSourceFiles(files);
  }

  function openFileDialog() {
    if (isPending) {
      return;
    }

    sourceInputRef.current?.click();
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);

    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const droppedItems = Array.from(event.dataTransfer.items ?? []);
    const droppedFiles = Array.from(event.dataTransfer.files ?? []);

    void (async () => {
      const resolvedFiles = await extractFilesFromDroppedItems(
        droppedItems,
        droppedFiles,
      );
      await processSelectedSourceFiles(resolvedFiles);
    })();
  }

  async function handleCreateModality() {
    if (!createDetectedUpload || selectedSourceFiles.length === 0) {
      toast.error("Choose a DICOM folder or one ZIP package first.");
      return;
    }

    try {
      setIsCreatingFromStudy(true);
      const formData = new FormData();
      formData.append(
        "name",
        createName.trim() || createDetectedUpload.suggestedName,
      );
      if (createContext.kind === "variant") {
        formData.append("familyId", createContext.familyId);
      }
      formData.append("modalityType", createModalityTypeOverride);
      if (createWeightingCode) {
        formData.append("weightingCode", createWeightingCode);
      }
      formData.append("thumbnailUrl", createThumbnailUrl.trim());
      formData.append("sourceKind", createDetectedUpload.sourceKind);
      formData.append(
        "sourceLabel",
        selectedSourceLabel?.trim() || createDetectedUpload.sourceLabel,
      );
      formData.append(
        "sourceFileCount",
        String(createDetectedUpload.sourceFileCount),
      );
      formData.append(
        "relativePathsJson",
        JSON.stringify(
          selectedSourceFiles.map(
            (file) =>
              (file as FileWithRelativePath).webkitRelativePath?.trim() || "",
          ),
        ),
      );

      for (const file of selectedSourceFiles) {
        formData.append("file", file);
      }

      setUploadProgress({
        loadedBytes: 0,
        percent: 0,
        phase: "uploading",
        totalBytes: selectedSourceFiles.reduce(
          (total, file) => total + file.size,
          0,
        ),
      });
      const createdModality = await uploadStudyIntakeWithProgress({
        formData,
        onProgress: setUploadProgress,
        zoneId,
      });
      dispatch(
        playgroundApi.util.updateQueryData(
          "getZoneModalities",
          zoneId,
          (draft) => {
            const existingFamily = draft.items.find(
              (family) => family.id === createdModality.familyId,
            );

            if (existingFamily) {
              const existingVariantIndex = existingFamily.variants.findIndex(
                (variant) => variant.id === createdModality.id,
              );

              if (existingVariantIndex >= 0) {
                existingFamily.variants[existingVariantIndex] = createdModality;
              } else {
                existingFamily.variants.unshift(createdModality);
                existingFamily.totalVariantCount += 1;
                if (createdModality.processingStatus === "ready") {
                  existingFamily.readyVariantCount += 1;
                }
              }

              return;
            }

            draft.items.unshift({
              id: createdModality.familyId,
              modalityType: createdModality.modalityType,
              name: createdModality.name,
              notes: createdModality.notes,
              thumbnailUrl: createdModality.coverImageUrl,
              readyVariantCount:
                createdModality.processingStatus === "ready" ? 1 : 0,
              totalVariantCount: 1,
              variants: [createdModality],
            });
            draft.total += 1;
          },
        ),
      );

      toast.success(
        "Upload finished. Study intake is processing in the background.",
      );
      setShowReadyPreview(true);
      setActiveModalityId(createdModality.id);
      setEditorMode("edit");
      resetCreateState();
    } catch (error) {
      setUploadProgress(null);
      toast.error(
        getErrorMessage(error, "Unable to create the modality draft."),
      );
    } finally {
      setIsCreatingFromStudy(false);
    }
  }

  async function handleSaveModalityFamilyChanges(
    family: ZoneModalityFamily,
    input: ModalityFamilySaveInput,
  ) {
    const nextName = input.name.trim();
    const nextThumbnailUrl = input.thumbnailUrl.trim() || null;
    const hasChanges =
      nextName !== family.name ||
      input.modalityType !== family.modalityType ||
      nextThumbnailUrl !== (family.thumbnailUrl ?? null) ||
      family.variants.some(
        (variant) =>
          (input.weightingByVariantId[variant.id] || "") !==
          (variant.weightingCode ?? ""),
      );

    if (!hasChanges) {
      return;
    }

    const nextInput: UpdateZoneModalityFamilyInput = {
      name: nextName,
      modalityType: input.modalityType,
      notes: family.notes,
      thumbnailUrl: nextThumbnailUrl,
      variants: family.variants.map((variant) => ({
        modalityId: variant.id,
        weightingCode: input.weightingByVariantId[variant.id] || null,
      })),
    };

    try {
      await updateModalityFamily({
        zoneId,
        familyId: family.id,
        input: nextInput,
      }).unwrap();
      toast.success(
        family.totalVariantCount === 1
          ? "Modality updated."
          : "Modality variants updated.",
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Unable to update the modality variants."),
      );
    }
  }

  async function handleDeleteModality(
    modality: ZoneModality,
    family: ZoneModalityFamily,
  ) {
    try {
      await deleteModality({
        zoneId,
        modalityId: modality.id,
      }).unwrap();

      if (activeModalityId === modality.id) {
        const nextActiveVariant = family.variants.find(
          (variant) => variant.id !== modality.id,
        );
        setActiveModalityId(nextActiveVariant?.id ?? null);
      }

      toast.success(
        family.variants.length > 1
          ? "Modality source variant deleted."
          : "Modality deleted.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to delete the modality."));
      throw error;
    }
  }

  return (
    <div className="flex gap-3 flex-col">
      <div className="p-1 m-0">
        <Frame className="shrink-0 outline-offset-2 outline outline-border/50">
          <FrameHeader className="p-2 flex items-center justify-between flex-row">
            <FrameTitle>Modalities</FrameTitle>
            <Button
              type="button"
              size="sm"
              variant="link"
              onClick={startCreateMode}
            >
              <UploadIcon />
              Attach source
            </Button>
          </FrameHeader>
        </Frame>
      </div>
      <Frame className="shrink-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modality</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    Loading modalities...
                  </div>
                </TableCell>
              </TableRow>
            ) : modalityFamilies.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No modalities are attached to this zone yet.
                </TableCell>
              </TableRow>
            ) : (
              modalityFamilies.map((family) => {
                const isActive =
                  editorMode === "edit" &&
                  family.variants.some(
                    (variant) => variant.id === resolvedActiveModalityId,
                  );

                return (
                  <TableRow
                    key={family.id}
                    className="cursor-pointer"
                    data-state={isActive ? "selected" : undefined}
                    onClick={() => selectModality(family)}
                  >
                    <TableCell className="font-medium text-foreground truncate w-[10ch]">
                      {family.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatModalityVariantCount(family.totalVariantCount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {family.modalityType}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {formatFamilyProcessingStatus(family)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Frame>

      {editorMode === "create" ? (
        <Frame>
          <FrameHeader className="p-2">
            <FrameTitle className="text-base">
              {createContext.kind === "variant"
                ? "Attach Source Variant"
                : "Attach Source Study"}
            </FrameTitle>
          </FrameHeader>
          <FramePanel>
            <input
              ref={sourceInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                void handleSourceSelection(event.target.files);
              }}
            />
            <input
              ref={sourceFolderInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                void handleSourceSelection(event.target.files);
              }}
            />

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Choose source study</FieldLabel>
                <div className="relative">
                  <div
                    className="relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-input p-4 transition-colors hover:bg-accent/50 data-[dragging=true]:bg-accent/50"
                    data-dragging={isDragging || undefined}
                    onClick={openFileDialog}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={-1}
                  >
                    {showReadyPreview ? (
                      <div className="absolute inset-0">
                        <Image
                          alt="Upload ready"
                          className="size-full object-cover"
                          src={UPLOAD_READY_PREVIEW_SRC}
                          fill
                          sizes="(max-width: 1280px) 100vw, 30rem"
                        />
                      </div>
                    ) : (
                      <div className="relative z-10 flex flex-col items-center justify-center px-4 py-3 text-center">
                        <div
                          aria-hidden="true"
                          className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background"
                        >
                          <ImageUpIcon className="size-4 opacity-60" />
                        </div>
                        <p className="mb-1.5 text-sm font-medium">
                          Drop study files here or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ZIP packages or DICOM files, max size: 512MB
                        </p>
                        {selectedSourceLabel ? (
                          <p className="mt-2 max-w-xs truncate text-xs text-muted-foreground">
                            {selectedSourceLabel}
                          </p>
                        ) : null}
                      </div>
                    )}

                    {selectedSourceFiles.length > 0 ? (
                      <div className="absolute right-4 top-4 z-20">
                        <button
                          aria-label="Remove selected upload"
                          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                          onClick={(event) => {
                            event.stopPropagation();
                            clearSelectedSource();
                          }}
                          type="button"
                        >
                          <XIcon aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    ) : null}

                    {uploadProgress ? (
                      <div className="absolute inset-x-3 bottom-3 z-20 rounded-lg border border-border/70 bg-background/85 p-2 backdrop-blur">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground">
                            {uploadProgress.phase === "uploading"
                              ? `Uploading ${Math.round(uploadProgress.percent ?? 0)}%`
                              : "Queueing study..."}
                          </span>
                          <span className="text-muted-foreground">
                            {uploadProgress.phase === "uploading" &&
                            uploadProgress.totalBytes
                              ? `${formatBytes(uploadProgress.loadedBytes)} / ${formatBytes(uploadProgress.totalBytes)}`
                              : "Preparing ingest job"}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.max(
                                6,
                                uploadProgress.percent ??
                                  (uploadProgress.phase === "processing"
                                    ? 100
                                    : 0),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {uploadErrors.length > 0 ? (
                  <div
                    className="mt-2 flex items-center gap-1 text-xs text-destructive"
                    role="alert"
                  >
                    <AlertCircleIcon className="size-3 shrink-0" />
                    <span>{uploadErrors[0]}</span>
                  </div>
                ) : null}
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`modality-name-${zoneId}`}>
                    Modality name
                  </FieldLabel>
                  <Input
                    id={`modality-name-${zoneId}`}
                    disabled={createContext.kind === "variant"}
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder={
                      createDetectedUpload?.suggestedName ??
                      "Leave blank to use the detected draft name"
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={`modality-type-${zoneId}`}>
                    Modality type
                  </FieldLabel>
                  <PlaygroundSelect
                    id={`modality-type-${zoneId}`}
                    options={MODALITY_TYPE_OPTIONS}
                    value={createModalityTypeOverride}
                    disabled={createContext.kind === "variant"}
                    onValueChange={setCreateModalityTypeOverride}
                  />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <Field>
                  <FieldLabel htmlFor={`modality-weighting-${zoneId}`}>
                    Weighting
                  </FieldLabel>
                  <PlaygroundSelect
                    id={`modality-weighting-${zoneId}`}
                    options={MODALITY_WEIGHTING_OPTIONS}
                    value={createWeightingCode}
                    onValueChange={setCreateWeightingCode}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>Thumbnail image</FieldLabel>
                <ImageUploadDropzone
                  disabled={createThumbnailUploading}
                  emptyTitle="Drop thumbnail image here"
                  onClear={() => setCreateThumbnailUrl("")}
                  onFileAccepted={(file) => {
                    setCreateThumbnailUploading(true);
                    uploadThumbnail(file)
                      .then(setCreateThumbnailUrl)
                      .catch(() => toast.error("Unable to upload thumbnail."))
                      .finally(() => setCreateThumbnailUploading(false));
                  }}
                  previewAlt="Modality thumbnail"
                  value={createThumbnailUrl}
                />
              </Field>
            </FieldGroup>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                type="button"
                disabled={
                  !createDetectedUpload || isPending || createThumbnailUploading
                }
                onClick={handleCreateModality}
              >
                {isPending || createThumbnailUploading ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <FileArchiveIcon />
                )}
                {createContext.kind === "variant"
                  ? "Create source variant"
                  : "Create modality draft"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => {
                  resetCreateState();
                  setEditorMode("edit");
                }}
              >
                Cancel
              </Button>
            </div>
          </FramePanel>
        </Frame>
      ) : (
        activeModalityFamily &&
        activeModality && (
          <ZoneModalityEditorCard
            key={`modality-editor-${activeModalityFamily.id}-${activeModalityFamily.variants
              .map(
                (variant) =>
                  `${variant.id}:${variant.name}:${variant.modalityType}:${variant.weightingCode ?? ""}:${variant.notes ?? ""}:${variant.updatedAt}`,
              )
              .join("|")}`}
            activeVariantId={activeModality.id}
            family={activeModalityFamily}
            onActiveVariantChange={setActiveModalityId}
            onAddVariant={startVariantCreateMode}
            onDelete={handleDeleteModality}
            pending={isPending}
            zoneId={zoneId}
            onSave={handleSaveModalityFamilyChanges}
          />
        )
      )}
    </div>
  );
}

function ZoneModalityEditorCard({
  activeVariantId,
  family,
  onActiveVariantChange,
  onAddVariant,
  onDelete,
  onSave,
  pending,
  zoneId,
}: {
  activeVariantId: string;
  family: ZoneModalityFamily;
  onActiveVariantChange: (modalityId: string) => void;
  onAddVariant: (family: ZoneModalityFamily) => void;
  onDelete: (
    modality: ZoneModality,
    family: ZoneModalityFamily,
  ) => Promise<void>;
  onSave: (
    family: ZoneModalityFamily,
    input: ModalityFamilySaveInput,
  ) => Promise<void>;
  pending: boolean;
  zoneId: string;
}) {
  const [name, setName] = useState(family.name);
  const [modalityType, setModalityType] = useState<ModalityType>(
    family.modalityType,
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(family.thumbnailUrl ?? "");
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [weightingByVariantId, setWeightingByVariantId] = useState<
    Record<string, ModalityWeightingSelectValue>
  >(() => buildFamilyWeightingState(family));
  const activeVariant =
    family.variants.find((variant) => variant.id === activeVariantId) ??
    family.variants[0] ??
    null;
  const isViewerReady = activeVariant?.processingStatus === "ready";
  const isViewerPreparing =
    activeVariant?.processingStatus === "uploaded" ||
    activeVariant?.processingStatus === "processing";
  const viewerHref = activeVariant
    ? `/playground/zones/${zoneId}/modalities/${activeVariant.id}/viewer`
    : null;
  const hasChanges =
    name.trim() !== family.name ||
    modalityType !== family.modalityType ||
    thumbnailUrl.trim() !== (family.thumbnailUrl ?? "") ||
    family.variants.some(
      (variant) =>
        (weightingByVariantId[variant.id] ?? "") !==
        (variant.weightingCode ?? ""),
    );

  async function handleSave() {
    const nextName = name.trim();

    if (!nextName) {
      toast.error("Modality name is required.");
      return;
    }

    await onSave(family, {
      name: nextName,
      modalityType,
      thumbnailUrl,
      weightingByVariantId,
    });
  }

  return (
    <>
      <Frame>
        <FrameHeader className="p-2 flex flex-row justify-between items-center">
          <FrameTitle className="text-base">Edit Modality</FrameTitle>
          {isViewerReady && viewerHref ? (
            <Link href={viewerHref}>Open viewer</Link>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              {isViewerPreparing ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              {isViewerPreparing ? "Preparing viewer..." : "Viewer not ready"}
            </span>
          )}
        </FrameHeader>
        <FramePanel>
          <FieldGroup className="gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`edit-modality-name-${family.id}`}>
                  Modality name
                </FieldLabel>
                <Input
                  id={`edit-modality-name-${family.id}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={`edit-modality-type-${family.id}`}>
                  Modality type
                </FieldLabel>
                <PlaygroundSelect
                  id={`edit-modality-type-${family.id}`}
                  options={MODALITY_TYPE_OPTIONS}
                  value={modalityType}
                  onValueChange={setModalityType}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Thumbnail image</FieldLabel>
              <ImageUploadDropzone
                disabled={isUploadingThumbnail || pending}
                emptyTitle="Drop thumbnail image here"
                onClear={() => setThumbnailUrl("")}
                onFileAccepted={(file) => {
                  setIsUploadingThumbnail(true);
                  uploadThumbnail(file)
                    .then(setThumbnailUrl)
                    .catch(() => toast.error("Unable to upload thumbnail."))
                    .finally(() => setIsUploadingThumbnail(false));
                }}
                previewAlt="Modality thumbnail"
                value={thumbnailUrl}
              />
            </Field>
          </FieldGroup>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!hasChanges || pending || isUploadingThumbnail}
              onClick={handleSave}
            >
              {pending || isUploadingThumbnail ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <SaveIcon />
              )}
              Save modality
            </Button>
          </div>
        </FramePanel>
      </Frame>
      <Frame>
        <FrameHeader className="flex flex-row items-center justify-between p-2">
          <FrameTitle className="text-base">Source Variants</FrameTitle>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onAddVariant(family)}
          >
            <Plus />
            Add source
          </Button>
        </FrameHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SN</TableHead>
              <TableHead>Modality Name</TableHead>
              <TableHead>Weighting</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {family.variants.map((variant, index) => {
              const variantViewerReady = variant.processingStatus === "ready";
              const variantViewerPreparing =
                variant.processingStatus === "uploaded" ||
                variant.processingStatus === "processing";
              const variantDeleteDisabled = pending || variantViewerPreparing;

              return (
                <TableRow
                  key={variant.id}
                  className="cursor-pointer"
                  data-state={
                    variant.id === activeVariantId ? "selected" : undefined
                  }
                  onClick={() => onActiveVariantChange(variant.id)}
                >
                  <TableCell className="font-medium text-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium text-foreground truncate w-[10ch]">
                    {name}
                  </TableCell>
                  <TableCell className="min-w-44 text-muted-foreground">
                    <PlaygroundSelect
                      id={`edit-modality-weighting-${variant.id}`}
                      options={MODALITY_WEIGHTING_OPTIONS}
                      value={weightingByVariantId[variant.id] ?? ""}
                      onValueChange={(value) => {
                        onActiveVariantChange(variant.id);
                        setWeightingByVariantId((current) => ({
                          ...current,
                          [variant.id]: value,
                        }));
                      }}
                    />
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    <span className="flex gap-2">
                      {variantViewerReady ? (
                        <Button asChild size="icon-sm" variant="secondary">
                          <Link
                            href={`/playground/zones/${zoneId}/modalities/${variant.id}/viewer`}
                          >
                            <SquareArrowOutUpRight />
                          </Link>
                        </Button>
                      ) : variantViewerPreparing ? (
                        <Button
                          size={"icon-sm"}
                          variant="secondary"
                          disabled
                        >
                          <Spinner />
                        </Button>
                      ) : (
                        <Button size={"icon-sm"} variant="secondary" disabled>
                          <AlertCircleIcon />
                        </Button>
                      )}
                      <DeleteConfirmationDialog
                        confirmationLabel={
                          family.variants.length > 1
                            ? "source label"
                            : "modality name"
                        }
                        confirmationValue={
                          family.variants.length > 1
                            ? variant.sourceLabel?.trim() ||
                              `Source ${index + 1}`
                            : family.name
                        }
                        disabled={variantDeleteDisabled}
                        pending={pending}
                        placeholder={
                          family.variants.length > 1
                            ? "Type the source label"
                            : "Type the modality name"
                        }
                        title={
                          family.variants.length > 1
                            ? "Delete source variant"
                            : "Delete modality"
                        }
                        descriptionPrefix={
                          family.variants.length > 1
                            ? "This will permanently remove this source variant and its derived study data. To confirm, enter the"
                            : "This will permanently remove the modality and its derived study data. To confirm, enter the"
                        }
                        onConfirm={() => onDelete(variant, family)}
                        trigger={
                          <Button
                            size={"icon-sm"}
                            variant="destructive"
                            disabled={variantDeleteDisabled}
                          >
                            <Trash />
                          </Button>
                        }
                      />
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Frame>
    </>
  );
}

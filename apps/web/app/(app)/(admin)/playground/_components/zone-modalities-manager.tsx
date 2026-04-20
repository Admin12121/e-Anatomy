"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  FileArchiveIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeModalityUploadFiles,
  formatSourceKindLabel,
  isLikelyDicomFilename,
  isZipFilename,
  type DetectedModalityUpload,
  ModalityUploadValidationError,
} from "@/lib/playground/modality-upload-shared";
import type {
  ModalityType,
  UpdateZoneModalityInput,
  ZoneModality,
  ZoneModalityListResponse,
} from "@/lib/playground/types";
import { useAppDispatch } from "@/lib/store/hooks";
import {
  playgroundApi,
  useDeleteZoneModalityMutation,
  useGetZoneModalitiesQuery,
  useUpdateZoneModalityMutation,
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

const EMPTY_MODALITIES: ZoneModality[] = [];

const MODALITY_TYPE_OPTIONS: Array<{ label: string; value: ModalityType }> = [
  { label: "MRI", value: "mri" },
  { label: "CT", value: "ct" },
  { label: "MRA", value: "mra" },
  { label: "MRV", value: "mrv" },
  { label: "Angiography", value: "angiography" },
  { label: "CBCT", value: "cbct" },
  { label: "Illustration", value: "illustration" },
  { label: "Photography", value: "photography" },
  { label: "Endoscopy", value: "endoscopy" },
  { label: "Other", value: "other" },
];

type EditorMode = "create" | "edit";

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

    const relativePath = (file as FileWithRelativePath).webkitRelativePath?.trim();

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

function formatModalitySourceKindLabel(kind: ZoneModality["sourceKind"]) {
  if (kind === "manual") {
    return "Manual metadata";
  }

  return formatSourceKindLabel(kind);
}

function hasActiveModalityIngest(modalities: ZoneModality[]) {
  return modalities.some(
    (modality) =>
      modality.processingStatus === "processing" ||
      modality.processingStatus === "uploaded",
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
  const modalities = data?.items ?? EMPTY_MODALITIES;
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [activeModalityId, setActiveModalityId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createDetectedUpload, setCreateDetectedUpload] =
    useState<DetectedModalityUpload | null>(null);
  const [createModalityTypeOverride, setCreateModalityTypeOverride] =
    useState<ModalityType>("other");
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
  const [updateModality, { isLoading: isUpdating }] =
    useUpdateZoneModalityMutation();
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
  const isPending =
    isAnalyzingSource || isCreatingFromStudy || isUpdating || isDeleting;
  const hasActiveIngest = hasActiveModalityIngest(modalities);

  useEffect(() => {
    if (!hasActiveIngest) {
      return;
    }

    const stream = new EventSource(
      `/api/playground/zones/${zoneId}/modalities/stream`,
    );

    function handleModalitiesEvent(event: MessageEvent<string>) {
      try {
        const payload = JSON.parse(event.data) as ZoneModalityListResponse;
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

  function clearSelectedSource() {
    setCreateDetectedUpload(null);
    setCreateModalityTypeOverride("other");
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

  function resetCreateState() {
    setCreateName("");
    setCreateNotes("");
    clearSelectedSource();
  }

  function startCreateMode() {
    setEditorMode("create");
    resetCreateState();
  }

  function selectModality(modalityId: string) {
    setActiveModalityId(modalityId);
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
      setCreateModalityTypeOverride(detectedUpload.detectedModalityType);
      setShowReadyPreview(true);
    } catch (error) {
      setCreateDetectedUpload(null);
      setCreateModalityTypeOverride("other");
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
      formData.append("modalityType", createModalityTypeOverride);
      formData.append("notes", createNotes.trim());
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
            const existingIndex = draft.items.findIndex(
              (item) => item.id === createdModality.id,
            );

            if (existingIndex >= 0) {
              draft.items[existingIndex] = createdModality;
              return;
            }

            draft.items.unshift(createdModality);
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

  async function handleSaveModalityChanges(
    modality: ZoneModality,
    input: UpdateZoneModalityInput,
  ) {
    try {
      await updateModality({
        zoneId,
        modalityId: modality.id,
        input,
      }).unwrap();

      toast.success("Modality updated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update the modality."));
    }
  }

  async function handleDeleteModality(modality: ZoneModality) {
    try {
      await deleteModality({
        zoneId,
        modalityId: modality.id,
      }).unwrap();

      if (activeModalityId === modality.id) {
        setActiveModalityId(null);
      }

      toast.success("Modality deleted.");
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
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Files</TableHead>
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
            ) : modalities.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No modalities are attached to this zone yet.
                </TableCell>
              </TableRow>
            ) : (
              modalities.map((modality) => {
                const isActive =
                  editorMode === "edit" &&
                  resolvedActiveModalityId === modality.id;

                return (
                  <TableRow
                    key={modality.id}
                    className="cursor-pointer"
                    data-state={isActive ? "selected" : undefined}
                    onClick={() => selectModality(modality.id)}
                  >
                    <TableCell className="font-medium text-foreground">
                      {modality.name}
                    </TableCell>
                    <TableCell>
                      <Badge>
                        {formatModalitySourceKindLabel(modality.sourceKind)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {modality.sourceFileCount}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {modality.processingStatus.replaceAll("_", " ")}
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
            <FrameTitle className="text-base">Attach Source Study</FrameTitle>
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
                    onValueChange={setCreateModalityTypeOverride}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`modality-notes-${zoneId}`}>
                  Internal notes
                </FieldLabel>
                <Textarea
                  id={`modality-notes-${zoneId}`}
                  value={createNotes}
                  onChange={(event) => setCreateNotes(event.target.value)}
                  placeholder="Internal guidance about this uploaded study or series."
                />
              </Field>
            </FieldGroup>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                type="button"
                disabled={!createDetectedUpload || isPending}
                onClick={handleCreateModality}
              >
                {isPending ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <FileArchiveIcon />
                )}
                Create modality draft
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
        activeModality && (
          <ZoneModalityEditorCard
            key={`modality-editor-${activeModality.id}`}
            modality={activeModality}
            onDelete={handleDeleteModality}
            pending={isPending}
            zoneId={zoneId}
            onSave={handleSaveModalityChanges}
          />
        )
      )}
    </div>
  );
}

function ZoneModalityEditorCard({
  modality,
  onDelete,
  onSave,
  pending,
  zoneId,
}: {
  modality: ZoneModality;
  onDelete: (modality: ZoneModality) => Promise<void>;
  onSave: (
    modality: ZoneModality,
    input: UpdateZoneModalityInput,
  ) => Promise<void>;
  pending: boolean;
  zoneId: string;
}) {
  const [name, setName] = useState(modality.name);
  const [modalityType, setModalityType] = useState<ModalityType>(
    modality.modalityType,
  );
  const [notes, setNotes] = useState(modality.notes ?? "");
  const isViewerReady = modality.processingStatus === "ready";
  const isViewerPreparing =
    modality.processingStatus === "uploaded" ||
    modality.processingStatus === "processing";
  const viewerHref = `/playground/zones/${zoneId}/modalities/${modality.id}/viewer`;
  const hasChanges =
    name.trim() !== modality.name ||
    modalityType !== modality.modalityType ||
    notes.trim() !== (modality.notes ?? "");

  async function handleSave() {
    const nextName = name.trim();

    if (!nextName) {
      toast.error("Modality name is required.");
      return;
    }

    await onSave(modality, {
      name: nextName,
      modalityType,
      notes: notes.trim() || null,
      coverImageUrl: modality.coverImageUrl,
      processingStatus: modality.processingStatus,
      sourceFileCount: modality.sourceFileCount,
      sourceKind: modality.sourceKind,
      sourceLabel: modality.sourceLabel,
    });
  }

  return (
    <Frame>
      <FrameHeader className="p-2 flex flex-row justify-between items-center">
        <FrameTitle className="text-base">Edit Modality</FrameTitle>
        {isViewerReady ? (
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
              <FieldLabel htmlFor={`edit-modality-name-${modality.id}`}>
                Modality name
              </FieldLabel>
              <Input
                id={`edit-modality-name-${modality.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`edit-modality-type-${modality.id}`}>
                Modality type
              </FieldLabel>
              <PlaygroundSelect
                id={`edit-modality-type-${modality.id}`}
                options={MODALITY_TYPE_OPTIONS}
                value={modalityType}
                onValueChange={setModalityType}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={`edit-modality-notes-${modality.id}`}>
              Internal notes
            </FieldLabel>
            <Textarea
              id={`edit-modality-notes-${modality.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Internal guidance about this study, series, or presentation."
            />
          </Field>
        </FieldGroup>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!hasChanges || pending}
            onClick={handleSave}
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <SaveIcon />
            )}
            Save modality
          </Button>
          <DeleteConfirmationDialog
            confirmationLabel="modality name"
            confirmationValue={modality.name}
            disabled={pending}
            pending={pending}
            placeholder="Type the modality name"
            title="Delete modality"
            descriptionPrefix="This will permanently remove the modality and its derived study data. To confirm, enter the"
            onConfirm={() => onDelete(modality)}
            trigger={
              <Button type="button" variant="destructive-outline">
                <Trash2Icon />
                Delete modality
              </Button>
            }
          />
        </div>
      </FramePanel>
    </Frame>
  );
}

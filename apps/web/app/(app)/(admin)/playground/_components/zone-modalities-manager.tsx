"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileArchiveIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
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
  type DetectedModalityUpload,
  ModalityUploadValidationError,
} from "@/lib/playground/modality-upload-shared";
import type {
  ModalityType,
  UpdateZoneModalityInput,
  ZoneDetail,
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

type StudyUploadProgressState = {
  loadedBytes: number;
  phase: "uploading" | "processing";
  percent: number | null;
  totalBytes: number | null;
};

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

export function ZoneModalitiesManager({ zone }: { zone: ZoneDetail }) {
  const dispatch = useAppDispatch();
  const { data, isLoading } = useGetZoneModalitiesQuery(zone.id);
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
  const [uploadProgress, setUploadProgress] =
    useState<StudyUploadProgressState | null>(null);
  const [updateModality, { isLoading: isUpdating }] =
    useUpdateZoneModalityMutation();
  const [deleteModality, { isLoading: isDeleting }] =
    useDeleteZoneModalityMutation();
  const dicomFolderInputRef = useRef<HTMLInputElement | null>(null);
  const zipPackageInputRef = useRef<HTMLInputElement | null>(null);
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
      `/api/playground/zones/${zone.id}/modalities/stream`,
    );

    function handleModalitiesEvent(event: MessageEvent<string>) {
      try {
        const payload = JSON.parse(event.data) as ZoneModalityListResponse;
        dispatch(
          playgroundApi.util.updateQueryData(
            "getZoneModalities",
            zone.id,
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
  }, [dispatch, hasActiveIngest, zone.id]);

  useEffect(() => {
    const input = dicomFolderInputRef.current as
      | (HTMLInputElement & { webkitdirectory?: boolean })
      | null;

    if (!input) {
      return;
    }

    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.webkitdirectory = true;
  }, []);

  function resetCreateState() {
    setCreateName("");
    setCreateNotes("");
    setCreateDetectedUpload(null);
    setCreateModalityTypeOverride("other");
    setSelectedSourceLabel(null);
    setSelectedSourceFiles([]);
    setUploadProgress(null);

    if (dicomFolderInputRef.current) {
      dicomFolderInputRef.current.value = "";
    }

    if (zipPackageInputRef.current) {
      zipPackageInputRef.current.value = "";
    }
  }

  function startCreateMode() {
    setEditorMode("create");
    resetCreateState();
  }

  function selectModality(modalityId: string) {
    setActiveModalityId(modalityId);
    setEditorMode("edit");
  }

  async function handleSourceSelection(nextFiles: FileList | null) {
    const files = Array.from(nextFiles ?? []);
    setSelectedSourceFiles(files);
    const sourceLabel = getSelectedSourceLabel(files);
    setSelectedSourceLabel(sourceLabel);

    if (files.length === 0) {
      setCreateDetectedUpload(null);
      setCreateModalityTypeOverride("other");
      return;
    }

    setIsAnalyzingSource(true);

    try {
      const detectedUpload = await analyzeModalityUploadFiles(files);
      setCreateDetectedUpload(detectedUpload);
      setCreateModalityTypeOverride(detectedUpload.detectedModalityType);
    } catch (error) {
      setCreateDetectedUpload(null);
      setCreateModalityTypeOverride("other");
      toast.error(
        error instanceof ModalityUploadValidationError
          ? error.message
          : "Select one ZIP package or a folder of DICOM files.",
      );
    } finally {
      setIsAnalyzingSource(false);
    }
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
        zoneId: zone.id,
      });
      dispatch(
        playgroundApi.util.updateQueryData("getZoneModalities", zone.id, (draft) => {
          const existingIndex = draft.items.findIndex(
            (item) => item.id === createdModality.id,
          );

          if (existingIndex >= 0) {
            draft.items[existingIndex] = createdModality;
            return;
          }

          draft.items.unshift(createdModality);
          draft.total += 1;
        }),
      );

      toast.success(
        "Upload finished. Study intake is processing in the background.",
      );
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
        zoneId: zone.id,
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
        zoneId: zone.id,
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
    <div className="space-y-5">
      <div className="p-1">
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
              ref={dicomFolderInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                void handleSourceSelection(event.target.files);
              }}
            />
            <input
              ref={zipPackageInputRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(event) => {
                void handleSourceSelection(event.target.files);
              }}
            />

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Choose source study</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="justify-start"
                    onClick={() => dicomFolderInputRef.current?.click()}
                  >
                    <FolderOpenIcon />
                    Choose DICOM folder
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="justify-start"
                    onClick={() => zipPackageInputRef.current?.click()}
                  >
                    <FileArchiveIcon />
                    Choose ZIP package
                  </Button>
                </div>
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`modality-name-${zone.id}`}>
                    Modality name
                  </FieldLabel>
                  <Input
                    id={`modality-name-${zone.id}`}
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder={
                      createDetectedUpload?.suggestedName ??
                      "Leave blank to use the detected draft name"
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={`modality-type-${zone.id}`}>
                    Modality type
                  </FieldLabel>
                  <PlaygroundSelect
                    id={`modality-type-${zone.id}`}
                    options={MODALITY_TYPE_OPTIONS}
                    value={createModalityTypeOverride}
                    onValueChange={setCreateModalityTypeOverride}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`modality-notes-${zone.id}`}>
                  Internal notes
                </FieldLabel>
                <Textarea
                  id={`modality-notes-${zone.id}`}
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
                {uploadProgress?.phase === "uploading"
                  ? `Uploading ${Math.round(uploadProgress.percent ?? 0)}%`
                  : uploadProgress?.phase === "processing"
                    ? "Queueing study..."
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

            {uploadProgress ? (
              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {uploadProgress.phase === "uploading"
                      ? "Uploading source study"
                      : "Handing off to background processing"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {uploadProgress.phase === "uploading" &&
                    uploadProgress.totalBytes
                      ? `${formatBytes(uploadProgress.loadedBytes)} / ${formatBytes(uploadProgress.totalBytes)}`
                      : "Preparing ingest job"}
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${Math.max(
                        6,
                        uploadProgress.percent ??
                          (uploadProgress.phase === "processing" ? 100 : 0),
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {uploadProgress.phase === "uploading"
                    ? "Keep this page open until the upload completes."
                    : "The modality is being created now. Slice derivation continues after the response returns."}
                </p>
              </div>
            ) : null}
          </FramePanel>
        </Frame>
      ) : isLoading ? (
        <Frame>
          <FramePanel className="flex min-h-[14rem] items-center justify-center px-6 py-10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading modality details...
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
            zoneId={zone.id}
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
        <Button asChild size="sm" variant="link">
          <Link
            href={`/playground/zones/${zoneId}/modalities/${modality.id}/viewer`}
          >
            Open viewer
          </Link>
        </Button>
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

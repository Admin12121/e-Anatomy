"use client"

import { useEffect, useRef, useState } from "react"
import {
  FileArchiveIcon,
  FileImageIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  SaveIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  analyzeModalityUploadFiles,
  formatSourceKindLabel,
  type DetectedModalityUpload,
  ModalityUploadValidationError,
} from "@/lib/playground/modality-upload-shared"
import type {
  ModalityType,
  UpdateZoneModalityInput,
  ZoneDetail,
  ZoneModality,
} from "@/lib/playground/types"
import {
  useGetZoneModalitiesQuery,
  useUpdateZoneModalityMutation,
} from "@/lib/store/services/playground-api"
import { ModalityAssetsWorkspace } from "./modality-assets-workspace"
import { PlaygroundSelect } from "./playground-select"

const EMPTY_MODALITIES: ZoneModality[] = []

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
]

type EditorMode = "create" | "edit"

type FileWithRelativePath = File & {
  webkitRelativePath?: string
}

type StudyUploadProgressState = {
  loadedBytes: number
  phase: "uploading" | "processing"
  percent: number | null
  totalBytes: number | null
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
      return String(error.data.error.message)
    }

    if ("message" in error && error.message) {
      return String(error.message)
    }
  }

  return fallback
}

function formatModalityTypeLabel(value: ModalityType) {
  switch (value) {
    case "mri":
      return "MRI"
    case "ct":
      return "CT"
    case "mra":
      return "MRA"
    case "mrv":
      return "MRV"
    case "cbct":
      return "CBCT"
    default:
      return value.charAt(0).toUpperCase() + value.slice(1)
  }
}

function formatModalitySourceKindLabel(kind: ZoneModality["sourceKind"]) {
  if (kind === "manual") {
    return "Manual metadata"
  }

  return formatSourceKindLabel(kind)
}

function hasActiveModalityIngest(modalities: ZoneModality[]) {
  return modalities.some(
    (modality) =>
      modality.processingStatus === "processing" || modality.processingStatus === "uploaded",
  )
}

function getSelectedSourceLabel(files: File[]) {
  const firstRelativePath = files
    .map((file) => (file as FileWithRelativePath).webkitRelativePath?.trim())
    .find((value): value is string => Boolean(value))

  if (firstRelativePath) {
    const folderName = firstRelativePath.split("/")[0]?.trim()

    if (folderName) {
      return folderName
    }
  }

  return files[0]?.name?.trim() || null
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function getUploadErrorMessage(xhr: XMLHttpRequest, fallback: string) {
  const rawResponse = xhr.responseText || xhr.response

  if (typeof rawResponse === "string" && rawResponse.trim().length > 0) {
    try {
      const payload = JSON.parse(rawResponse) as {
        error?: {
          message?: string
        }
      }

      if (payload.error?.message) {
        return payload.error.message
      }
    } catch {
      // Ignore non-JSON error payloads.
    }
  }

  return fallback
}

async function uploadStudyIntakeWithProgress({
  formData,
  onProgress,
  zoneId,
}: {
  formData: FormData
  onProgress: (state: StudyUploadProgressState) => void
  zoneId: string
}) {
  return new Promise<ZoneModality>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let lastLoadedBytes = 0
    let lastTotalBytes: number | null = null
    xhr.open("POST", `/api/playground/zones/${zoneId}/modalities/intake`)
    xhr.responseType = "text"
    xhr.withCredentials = true
    xhr.setRequestHeader("Accept", "application/json")

    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : null
      const loadedBytes = event.loaded
      lastLoadedBytes = loadedBytes
      lastTotalBytes = totalBytes
      const percent =
        totalBytes && totalBytes > 0 ? Math.min(100, (loadedBytes / totalBytes) * 100) : null

      onProgress({
        loadedBytes,
        percent,
        phase: "uploading",
        totalBytes,
      })
    }

    xhr.onerror = () => {
      reject(new Error("Unable to upload the selected study."))
    }

    xhr.onabort = () => {
      reject(new Error("Study upload was cancelled."))
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(getUploadErrorMessage(xhr, "Unable to create the modality draft.")))
        return
      }

      onProgress({
        loadedBytes: lastLoadedBytes,
        percent: 100,
        phase: "processing",
        totalBytes: lastTotalBytes,
      })

      try {
        const payload = JSON.parse(xhr.responseText || xhr.response) as ZoneModality
        resolve(payload)
      } catch {
        reject(new Error("The server returned an invalid modality response."))
      }
    }

    xhr.send(formData)
  })
}

export function ZoneModalitiesManager({ zone }: { zone: ZoneDetail }) {
  const [modalitiesPollingInterval, setModalitiesPollingInterval] = useState(0)
  const { data, isFetching, isLoading, refetch } = useGetZoneModalitiesQuery(zone.id, {
    pollingInterval: modalitiesPollingInterval,
    skipPollingIfUnfocused: true,
  })
  const modalities = data?.items ?? EMPTY_MODALITIES
  const [editorMode, setEditorMode] = useState<EditorMode>("edit")
  const [activeModalityId, setActiveModalityId] = useState<string | null>(null)
  const [createName, setCreateName] = useState("")
  const [createNotes, setCreateNotes] = useState("")
  const [createDetectedUpload, setCreateDetectedUpload] =
    useState<DetectedModalityUpload | null>(null)
  const [createModalityTypeOverride, setCreateModalityTypeOverride] =
    useState<ModalityType>("other")
  const [selectedSourceLabel, setSelectedSourceLabel] = useState<string | null>(null)
  const [selectedSourceFiles, setSelectedSourceFiles] = useState<File[]>([])
  const [isAnalyzingSource, setIsAnalyzingSource] = useState(false)
  const [isCreatingFromStudy, setIsCreatingFromStudy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<StudyUploadProgressState | null>(
    null,
  )
  const [updateModality, { isLoading: isUpdating }] =
    useUpdateZoneModalityMutation()
  const dicomFolderInputRef = useRef<HTMLInputElement | null>(null)
  const zipPackageInputRef = useRef<HTMLInputElement | null>(null)
  const resolvedActiveModalityId =
    activeModalityId && modalities.some((modality) => modality.id === activeModalityId)
      ? activeModalityId
      : modalities[0]?.id ?? null
  const activeModality =
    modalities.find((modality) => modality.id === resolvedActiveModalityId) ?? null
  const isPending = isAnalyzingSource || isCreatingFromStudy || isUpdating

  useEffect(() => {
    const nextPollingInterval = hasActiveModalityIngest(modalities) ? 4000 : 0

    setModalitiesPollingInterval((current) =>
      current === nextPollingInterval ? current : nextPollingInterval,
    )
  }, [modalities])

  useEffect(() => {
    const input = dicomFolderInputRef.current as
      | (HTMLInputElement & { webkitdirectory?: boolean })
      | null

    if (!input) {
      return
    }

    input.setAttribute("webkitdirectory", "")
    input.setAttribute("directory", "")
    input.webkitdirectory = true
  }, [])

  function resetCreateState() {
    setCreateName("")
    setCreateNotes("")
    setCreateDetectedUpload(null)
    setCreateModalityTypeOverride("other")
    setSelectedSourceLabel(null)
    setSelectedSourceFiles([])
    setUploadProgress(null)

    if (dicomFolderInputRef.current) {
      dicomFolderInputRef.current.value = ""
    }

    if (zipPackageInputRef.current) {
      zipPackageInputRef.current.value = ""
    }
  }

  function startCreateMode() {
    setEditorMode("create")
    resetCreateState()
  }

  function selectModality(modalityId: string) {
    setActiveModalityId(modalityId)
    setEditorMode("edit")
  }

  async function handleSourceSelection(nextFiles: FileList | null) {
    const files = Array.from(nextFiles ?? [])
    setSelectedSourceFiles(files)
    const sourceLabel = getSelectedSourceLabel(files)
    setSelectedSourceLabel(sourceLabel)

    if (files.length === 0) {
      setCreateDetectedUpload(null)
      setCreateModalityTypeOverride("other")
      return
    }

    setIsAnalyzingSource(true)

    try {
      const detectedUpload = await analyzeModalityUploadFiles(files)
      setCreateDetectedUpload(detectedUpload)
      setCreateModalityTypeOverride(detectedUpload.detectedModalityType)
    } catch (error) {
      setCreateDetectedUpload(null)
      setCreateModalityTypeOverride("other")
      toast.error(
        error instanceof ModalityUploadValidationError
          ? error.message
          : "Select one ZIP package or a folder of DICOM files.",
      )
    } finally {
      setIsAnalyzingSource(false)
    }
  }

  async function handleCreateModality() {
    if (!createDetectedUpload || selectedSourceFiles.length === 0) {
      toast.error("Choose a DICOM folder or one ZIP package first.")
      return
    }

    try {
      setIsCreatingFromStudy(true)
      const formData = new FormData()
      formData.append("name", createName.trim() || createDetectedUpload.suggestedName)
      formData.append("modalityType", createModalityTypeOverride)
      formData.append("notes", createNotes.trim())
      formData.append("sourceKind", createDetectedUpload.sourceKind)
      formData.append(
        "sourceLabel",
        selectedSourceLabel?.trim() || createDetectedUpload.sourceLabel,
      )
      formData.append("sourceFileCount", String(createDetectedUpload.sourceFileCount))
      formData.append(
        "relativePathsJson",
        JSON.stringify(
          selectedSourceFiles.map(
            (file) => (file as FileWithRelativePath).webkitRelativePath?.trim() || "",
          ),
        ),
      )

      for (const file of selectedSourceFiles) {
        formData.append("file", file)
      }

      setUploadProgress({
        loadedBytes: 0,
        percent: 0,
        phase: "uploading",
        totalBytes: selectedSourceFiles.reduce((total, file) => total + file.size, 0),
      })
      const createdModality = await uploadStudyIntakeWithProgress({
        formData,
        onProgress: setUploadProgress,
        zoneId: zone.id,
      })
      await refetch()

      toast.success("Upload finished. Study intake is processing in the background.")
      setActiveModalityId(createdModality.id)
      setEditorMode("edit")
      resetCreateState()
    } catch (error) {
      setUploadProgress(null)
      toast.error(getErrorMessage(error, "Unable to create the modality draft."))
    } finally {
      setIsCreatingFromStudy(false)
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
      }).unwrap()

      toast.success("Modality updated.")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update the modality."))
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border border-border/70 bg-muted/10 shadow-none">
        <CardHeader className="border-b border-border/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Modalities</CardTitle>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={startCreateMode}
            >
              <UploadIcon />
              Attach source
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading modalities...
            </div>
          ) : modalities.length > 0 ? (
            <div className="grid gap-2">
              {modalities.map((modality) => {
                const isActive =
                  editorMode === "edit" && resolvedActiveModalityId === modality.id

                return (
                  <button
                    key={modality.id}
                    type="button"
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/70 bg-background/70 hover:bg-muted/35"
                    }`}
                    onClick={() => selectModality(modality.id)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="font-medium text-foreground">
                          {modality.name}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {formatModalityTypeLabel(modality.modalityType)}
                          </Badge>
                          <Badge variant="outline">
                            {formatModalitySourceKindLabel(modality.sourceKind)}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>
                          {modality.sourceFileCount} file
                          {modality.sourceFileCount === 1 ? "" : "s"}
                        </div>
                        {modality.sourceLabel ? (
                          <div className="mt-1 max-w-[12rem] truncate">
                            {modality.sourceLabel}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
              No modalities are attached to this zone yet. Start by attaching a
              source study below.
            </div>
          )}
          {isFetching && !isLoading ? (
            <div className="text-xs text-muted-foreground">Refreshing modalities...</div>
          ) : null}
        </CardContent>
      </Card>

      {editorMode === "create" ? (
        <Card className="border border-border/70 bg-muted/10 shadow-none">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="text-base">Attach Source Study</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <input
              ref={dicomFolderInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                void handleSourceSelection(event.target.files)
              }}
            />
            <input
              ref={zipPackageInputRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(event) => {
                void handleSourceSelection(event.target.files)
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
                <p className="text-xs leading-5 text-muted-foreground">
                  Up to two source studies can be processed at the same time. Large
                  studies upload first, then continue slice derivation in the background.
                </p>
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

            <div className="flex flex-wrap gap-2">
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
                  resetCreateState()
                  setEditorMode("edit")
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
                    {uploadProgress.phase === "uploading" && uploadProgress.totalBytes
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
                        uploadProgress.percent ?? (uploadProgress.phase === "processing" ? 100 : 0),
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
          </CardContent>
        </Card>
      ) : activeModality ? (
        <>
          <ZoneModalityEditorCard
            key={`modality-editor-${activeModality.id}`}
            modality={activeModality}
            pending={isPending}
            onSave={handleSaveModalityChanges}
          />

          <ModalityAssetsWorkspace
            key={`modality-assets-${activeModality.id}`}
            modality={activeModality}
            zoneId={zone.id}
          />
        </>
      ) : (
        <Card className="border border-border/70 bg-muted/10 shadow-none">
          <CardContent className="flex min-h-[14rem] flex-col items-center justify-center px-6 py-10 text-center">
            <FileImageIcon className="size-8 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium text-foreground">
              No modality selected
            </p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
              Choose an existing modality above or attach a new source study for{" "}
              {zone.name}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ZoneModalityEditorCard({
  modality,
  onSave,
  pending,
}: {
  modality: ZoneModality
  onSave: (modality: ZoneModality, input: UpdateZoneModalityInput) => Promise<void>
  pending: boolean
}) {
  const [name, setName] = useState(modality.name)
  const [modalityType, setModalityType] = useState<ModalityType>(
    modality.modalityType,
  )
  const [notes, setNotes] = useState(modality.notes ?? "")
  const hasChanges =
    name.trim() !== modality.name ||
    modalityType !== modality.modalityType ||
    notes.trim() !== (modality.notes ?? "")

  async function handleSave() {
    const nextName = name.trim()

    if (!nextName) {
      toast.error("Modality name is required.")
      return
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
    })
  }

  return (
    <Card className="border border-border/70 bg-muted/10 shadow-none">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="text-base">Edit Modality</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
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

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Source
            </div>
            <div className="mt-1 text-sm text-foreground">
              {formatModalitySourceKindLabel(modality.sourceKind)}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Source label
            </div>
            <div className="mt-1 text-sm text-foreground">
              {modality.sourceLabel || "Auto-detected"}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Files
            </div>
            <div className="mt-1 text-sm text-foreground">
              {modality.sourceFileCount} file
              {modality.sourceFileCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <Button type="button" disabled={!hasChanges || pending} onClick={handleSave}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
          Save modality
        </Button>
      </CardContent>
    </Card>
  )
}

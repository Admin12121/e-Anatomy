"use client"

import { useMemo, useState } from "react"
import {
  DatabaseZapIcon,
  FileArchiveIcon,
  FileImageIcon,
  LoaderCircleIcon,
  SaveIcon,
  ShieldCheckIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  createClientModalityUploadPreview,
  formatSourceKindLabel,
  type DetectedModalityUpload,
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
  useUploadZoneModalityMutation,
} from "@/lib/store/services/playground-api"
import { PlaygroundSelect } from "./playground-select"
import { ModalityAssetsWorkspace } from "./modality-assets-workspace"

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

export function ZoneModalitiesManager({ zone }: { zone: ZoneDetail }) {
  const { data, isFetching } = useGetZoneModalitiesQuery(zone.id)
  const modalities = data?.items ?? EMPTY_MODALITIES
  const [editorMode, setEditorMode] = useState<EditorMode>("edit")
  const [activeModalityId, setActiveModalityId] = useState<string | null>(null)
  const [createName, setCreateName] = useState("")
  const [createNotes, setCreateNotes] = useState("")
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [createDetectedUpload, setCreateDetectedUpload] =
    useState<DetectedModalityUpload | null>(null)
  const [createModalityTypeOverride, setCreateModalityTypeOverride] =
    useState<ModalityType>("other")
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [uploadModality, { isLoading: isUploading }] =
    useUploadZoneModalityMutation()
  const [updateModality, { isLoading: isUpdating }] =
    useUpdateZoneModalityMutation()
  const resolvedActiveModalityId =
    activeModalityId && modalities.some((modality) => modality.id === activeModalityId)
      ? activeModalityId
      : modalities[0]?.id ?? null
  const activeModality =
    modalities.find((modality) => modality.id === resolvedActiveModalityId) ?? null
  const isPending = isUploading || isUpdating

  const detectedSummary = useMemo(() => {
    if (!createDetectedUpload) {
      return null
    }

    return [
      {
        label: "Detected type",
        value: formatModalityTypeLabel(createDetectedUpload.detectedModalityType),
      },
      {
        label: "Source",
        value: formatSourceKindLabel(createDetectedUpload.sourceKind),
      },
      {
        label: "Files",
        value: String(createDetectedUpload.sourceFileCount),
      },
      {
        label: "Suggested name",
        value: createDetectedUpload.suggestedName,
      },
    ]
  }, [createDetectedUpload])

  function resetCreateState() {
    setCreateName("")
    setCreateNotes("")
    setCreateFiles([])
    setCreateDetectedUpload(null)
    setCreateModalityTypeOverride("other")
    setUploadInputKey((current) => current + 1)
  }

  function startCreateMode() {
    setEditorMode("create")
    resetCreateState()
  }

  function selectModality(modalityId: string) {
    setActiveModalityId(modalityId)
    setEditorMode("edit")
  }

  function handleUploadSelection(nextFiles: FileList | null) {
    const files = Array.from(nextFiles ?? [])
    setCreateFiles(files)

    const preview = createClientModalityUploadPreview(files)
    setCreateDetectedUpload(preview)
    setCreateModalityTypeOverride(preview?.detectedModalityType ?? "other")

    if (files.length > 0 && !preview) {
      toast.error("Upload one ZIP package or one or more DICOM files.")
    }
  }

  async function handleCreateModality() {
    if (createFiles.length === 0) {
      toast.error("Upload one ZIP package or one or more DICOM files first.")
      return
    }

    const formData = new FormData()

    for (const file of createFiles) {
      formData.append("files", file)
    }

    if (createName.trim()) {
      formData.append("name", createName.trim())
    }

    if (createNotes.trim()) {
      formData.append("notes", createNotes.trim())
    }

    formData.append("modalityTypeOverride", createModalityTypeOverride)

    try {
      const createdModality = await uploadModality({
        zoneId: zone.id,
        formData,
      }).unwrap()

      toast.success("Modality created from upload.")
      setActiveModalityId(createdModality.id)
      setEditorMode("edit")
      resetCreateState()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create the modality."))
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
              <CardDescription>
                Upload one ZIP package or one or more DICOM files. The server
                verifies the upload and detects the modality metadata.
              </CardDescription>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={startCreateMode}>
              <UploadIcon />
              New upload
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {isFetching ? (
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
              No modalities attached to this zone yet. Start with one secure
              upload below.
            </div>
          )}
        </CardContent>
      </Card>

      {editorMode === "create" ? (
        <Card className="border border-border/70 bg-muted/10 shadow-none">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="text-base">Create Modality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor={`modality-upload-${zone.id}`}>
                  Upload package or DICOM files
                </FieldLabel>
                <Input
                  key={uploadInputKey}
                  id={`modality-upload-${zone.id}`}
                  type="file"
                  multiple
                  accept=".zip,.dcm,.dicom,.ima,application/zip,application/dicom"
                  onChange={(event) => handleUploadSelection(event.target.files)}
                />
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
                      "Leave blank to use the detected name"
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
                disabled={createFiles.length === 0 || isPending}
                onClick={handleCreateModality}
              >
                {isPending ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <FileArchiveIcon />
                )}
                Create modality
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
          </CardContent>
        </Card>
      ) : activeModality ? (
        <>
          <ZoneModalityEditorCard
            key={activeModality.id}
            modality={activeModality}
            pending={isPending}
            onSave={handleSaveModalityChanges}
          />

          <ModalityAssetsWorkspace
            key={activeModality.id}
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
              Choose an existing modality above or start a new secure upload for{" "}
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
        <CardDescription>
          Keep only the editorial fields here. Upload detection stays in the
          intake flow.
        </CardDescription>
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

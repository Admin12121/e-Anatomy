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
  CreateZoneModalityInput,
  ModalityType,
  UpdateZoneModalityInput,
  ZoneDetail,
  ZoneModality,
} from "@/lib/playground/types"
import {
  useCreateZoneModalityMutation,
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

export function ZoneModalitiesManager({ zone }: { zone: ZoneDetail }) {
  const { data, isFetching } = useGetZoneModalitiesQuery(zone.id)
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
  const [isAnalyzingSource, setIsAnalyzingSource] = useState(false)
  const [createModality, { isLoading: isCreatingModality }] =
    useCreateZoneModalityMutation()
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
  const isPending = isAnalyzingSource || isCreatingModality || isUpdating

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
    if (!createDetectedUpload) {
      toast.error("Choose a DICOM folder or one ZIP package first.")
      return
    }

    const input: CreateZoneModalityInput = {
      name: createName.trim() || createDetectedUpload.suggestedName,
      modalityType: createModalityTypeOverride,
      coverImageUrl: null,
      notes: createNotes.trim() || null,
      processingStatus: "uploaded",
      sourceFileCount: createDetectedUpload.sourceFileCount,
      sourceKind: createDetectedUpload.sourceKind,
      sourceLabel: selectedSourceLabel?.trim() || createDetectedUpload.sourceLabel,
    }

    try {
      const createdModality = await createModality({
        zoneId: zone.id,
        input,
      }).unwrap()

      toast.success("Modality draft created from the source study.")
      setActiveModalityId(createdModality.id)
      setEditorMode("edit")
      resetCreateState()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create the modality draft."))
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
              No modalities are attached to this zone yet. Start by attaching a
              source study below.
            </div>
          )}
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
                Create modality draft
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

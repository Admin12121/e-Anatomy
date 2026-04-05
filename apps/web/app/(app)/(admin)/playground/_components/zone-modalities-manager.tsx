"use client"

import { useState } from "react"
import {
  FileArchiveIcon,
  FileImageIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  PlusIcon,
  SaveIcon,
  WavesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type {
  CreateZoneModalityInput,
  ModalityProcessingStatus,
  ModalitySourceKind,
  ModalityType,
  ZoneDetail,
  ZoneModality,
} from "@/lib/playground/types"
import {
  useCreateZoneModalityMutation,
  useGetZoneModalitiesQuery,
  useUpdateZoneModalityMutation,
} from "@/lib/store/services/playground-api"
import { ModalityAssetsWorkspace } from "./modality-assets-workspace"

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

const SOURCE_KIND_OPTIONS: Array<{ label: string; value: ModalitySourceKind }> = [
  { label: "Manual", value: "manual" },
  { label: "ZIP package", value: "zip" },
  { label: "DICOM files", value: "dicom_files" },
]

const PROCESSING_STATUS_OPTIONS: Array<{
  label: string
  value: ModalityProcessingStatus
}> = [
  { label: "Draft", value: "draft" },
  { label: "Uploaded", value: "uploaded" },
  { label: "Processing", value: "processing" },
  { label: "Ready", value: "ready" },
  { label: "Failed", value: "failed" },
]

type ModalityFormState = {
  coverImageUrl: string
  modalityType: ModalityType
  name: string
  notes: string
  processingStatus: ModalityProcessingStatus
  sourceFileCount: string
  sourceKind: ModalitySourceKind
  sourceLabel: string
}

function createEmptyFormState(): ModalityFormState {
  return {
    coverImageUrl: "",
    modalityType: "mri",
    name: "",
    notes: "",
    processingStatus: "draft",
    sourceFileCount: "0",
    sourceKind: "manual",
    sourceLabel: "",
  }
}

function createFormStateFromModality(modality: ZoneModality): ModalityFormState {
  return {
    coverImageUrl: modality.coverImageUrl ?? "",
    modalityType: modality.modalityType,
    name: modality.name,
    notes: modality.notes ?? "",
    processingStatus: modality.processingStatus,
    sourceFileCount: String(modality.sourceFileCount),
    sourceKind: modality.sourceKind,
    sourceLabel: modality.sourceLabel ?? "",
  }
}

export function ZoneModalitiesManager({ zone }: { zone: ZoneDetail }) {
  const { data, isFetching } = useGetZoneModalitiesQuery(zone.id)
  const modalities = data?.items ?? []
  const [activeModalityId, setActiveModalityId] = useState<string | null>(null)
  const [formState, setFormState] = useState<ModalityFormState>(createEmptyFormState)
  const [createModality, { isLoading: isCreating }] = useCreateZoneModalityMutation()
  const [updateModality, { isLoading: isUpdating }] = useUpdateZoneModalityMutation()

  const activeModality =
    (activeModalityId &&
      modalities.find((modality) => modality.id === activeModalityId)) ||
    null
  const isPending = isCreating || isUpdating
  const hasChanges = activeModality
    ? JSON.stringify(formState) !== JSON.stringify(createFormStateFromModality(activeModality))
    : hasDraftContent(formState)

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

  function selectModality(modality: ZoneModality) {
    setActiveModalityId(modality.id)
    setFormState(createFormStateFromModality(modality))
  }

  function startCreateMode() {
    setActiveModalityId(null)
    setFormState(createEmptyFormState())
  }

  function updateField<Key extends keyof ModalityFormState>(
    key: Key,
    value: ModalityFormState[Key],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleZipSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setFormState((current) => ({
      ...current,
      processingStatus: "uploaded",
      sourceFileCount: "1",
      sourceKind: "zip",
      sourceLabel: file.name,
    }))
  }

  function handleDicomSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files

    if (!files || files.length === 0) {
      return
    }

    const label =
      files.length === 1 ? files[0]?.name ?? "1 file selected" : `${files.length} files selected`

    setFormState((current) => ({
      ...current,
      processingStatus: "uploaded",
      sourceFileCount: String(files.length),
      sourceKind: "dicom_files",
      sourceLabel: label,
    }))
  }

  async function handleSave() {
    const name = formState.name.trim()

    if (!name) {
      toast.error("Modality name is required.")
      return
    }

    const input: CreateZoneModalityInput = {
      name,
      modalityType: formState.modalityType,
      coverImageUrl: formState.coverImageUrl.trim() || null,
      notes: formState.notes.trim() || null,
      processingStatus: formState.processingStatus,
      sourceFileCount: normalizeFileCount(formState.sourceFileCount),
      sourceKind: formState.sourceKind,
      sourceLabel: formState.sourceLabel.trim() || null,
    }

    try {
      if (activeModality) {
        const modality = await updateModality({
          zoneId: zone.id,
          modalityId: activeModality.id,
          input,
        }).unwrap()

        toast.success("Modality updated.")
        selectModality(modality)
        return
      }

      const modality = await createModality({
        zoneId: zone.id,
        input,
      }).unwrap()

      toast.success("Modality created.")
      selectModality(modality)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to save the modality."))
    }
  }

  return (
    <div className="space-y-4 border-t border-border/70 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">Modalities</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Add zone-level MRI, CT, illustration, and source-package metadata.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={startCreateMode}>
          <PlusIcon />
          New
        </Button>
      </div>

      <div className="space-y-2">
        {isFetching ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            Loading modalities...
          </div>
        ) : modalities.length > 0 ? (
          modalities.map((modality) => (
            <button
              key={modality.id}
              type="button"
              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                activeModalityId === modality.id
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/80 bg-muted/15 hover:bg-muted/30"
              }`}
              onClick={() => selectModality(modality)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {modality.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{modality.modalityType}</Badge>
                    <Badge variant="secondary">{modality.processingStatus}</Badge>
                  </div>
                </div>
                <PencilLineIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </div>
            </button>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            No modalities attached to this zone yet.
          </div>
        )}
      </div>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="modality-name">Modality name</FieldLabel>
          <Input
            id="modality-name"
            value={formState.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="MRI axial brain, CT neck, skull illustration..."
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="modality-type">Modality type</FieldLabel>
          <NativeSelect
            id="modality-type"
            value={formState.modalityType}
            onChange={(event) =>
              updateField("modalityType", event.target.value as ModalityType)
            }
          >
            {MODALITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor="modality-cover-image">Cover image URL</FieldLabel>
          <Input
            id="modality-cover-image"
            value={formState.coverImageUrl}
            onChange={(event) => updateField("coverImageUrl", event.target.value)}
            placeholder="https://..."
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="modality-source-kind">Source kind</FieldLabel>
            <NativeSelect
              id="modality-source-kind"
              value={formState.sourceKind}
              onChange={(event) =>
                updateField("sourceKind", event.target.value as ModalitySourceKind)
              }
            >
              {SOURCE_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="modality-status">Processing status</FieldLabel>
            <NativeSelect
              id="modality-status"
              value={formState.processingStatus}
              onChange={(event) =>
                updateField(
                  "processingStatus",
                  event.target.value as ModalityProcessingStatus,
                )
              }
            >
              {PROCESSING_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="modality-source-label">Source label</FieldLabel>
            <Input
              id="modality-source-label"
              value={formState.sourceLabel}
              onChange={(event) => updateField("sourceLabel", event.target.value)}
              placeholder="brain_mri_axial.zip"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="modality-source-count">Source file count</FieldLabel>
            <Input
              id="modality-source-count"
              inputMode="numeric"
              value={formState.sourceFileCount}
              onChange={(event) => updateField("sourceFileCount", event.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="modality-zip">ZIP package</FieldLabel>
            <Input
              id="modality-zip"
              accept=".zip,application/zip"
              type="file"
              onChange={handleZipSelection}
            />
            <FieldDescription>
              Metadata only for now. Binary ingestion comes in the next milestone.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="modality-dicom">DICOM files</FieldLabel>
            <Input
              id="modality-dicom"
              accept=".dcm,application/dicom"
              multiple
              type="file"
              onChange={handleDicomSelection}
            />
            <FieldDescription>
              Use this to capture file count and source label from selected DICOM files.
            </FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="modality-notes">Notes</FieldLabel>
          <Textarea
            id="modality-notes"
            value={formState.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            placeholder="Internal notes about series, weightings, or viewer setup."
          />
        </Field>

        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <WavesIcon className="size-4" />
            Source package helpers
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">
              <FileArchiveIcon />
              ZIP metadata
            </Badge>
            <Badge variant="outline">
              <FolderOpenIcon />
              DICOM file metadata
            </Badge>
            <Badge variant="outline">
              <FileImageIcon />
              Thumbnail URL
            </Badge>
          </div>
        </div>

        <Button type="button" disabled={!hasChanges || isPending} onClick={handleSave}>
          {isPending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
          {activeModality ? "Save modality" : "Create modality"}
        </Button>
      </FieldGroup>

      {activeModality ? (
        <ModalityAssetsWorkspace
          key={activeModality.id}
          modality={activeModality}
          zoneId={zone.id}
        />
      ) : null}
    </div>
  )
}

function hasDraftContent(form: ModalityFormState) {
  return (
    form.name.trim().length > 0 ||
    form.notes.trim().length > 0 ||
    form.coverImageUrl.trim().length > 0 ||
    form.sourceLabel.trim().length > 0 ||
    form.sourceFileCount !== "0" ||
    form.sourceKind !== "manual" ||
    form.processingStatus !== "draft" ||
    form.modalityType !== "mri"
  )
}

function normalizeFileCount(value: string) {
  const parsed = Number.parseInt(value.trim(), 10)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return parsed
}

"use client"

import { useState } from "react"
import {
  ImageIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PlusIcon,
  SaveIcon,
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
import type {
  CreateZoneModalityAssetInput,
  ModalityAssetKind,
  ModalityWeightingCode,
  UpdateZoneModalityAssetInput,
  ZoneModality,
  ZoneModalityAsset,
} from "@/lib/playground/types"
import {
  useCreateZoneModalityAssetMutation,
  useGetZoneModalityAssetsQuery,
  useUpdateZoneModalityAssetMutation,
} from "@/lib/store/services/playground-api"
import { PlaygroundSelect } from "./playground-select"

const ASSET_KIND_OPTIONS: Array<{ label: string; value: ModalityAssetKind }> = [
  { label: "Slice", value: "slice" },
  { label: "Cover", value: "cover" },
  { label: "Overview", value: "overview" },
  { label: "Reference", value: "reference" },
]

const WEIGHTING_OPTIONS: Array<{ label: string; value: ModalityWeightingCode | "" }> = [
  { label: "None", value: "" },
  { label: "T1", value: "t1" },
  { label: "T1 Gado", value: "t1_gado" },
  { label: "T2", value: "t2" },
  { label: "T2*", value: "t2_star" },
  { label: "FLAIR", value: "flair" },
  { label: "ADC", value: "adc" },
  { label: "DWI", value: "dwi" },
  { label: "Other", value: "other" },
]

const EMPTY_ASSETS: ZoneModalityAsset[] = []

type AssetFormState = {
  assetKind: ModalityAssetKind
  imageUrl: string
  label: string
  notes: string
  sortOrder: string
  thumbnailUrl: string
  weightingCode: ModalityWeightingCode | ""
}

function createEmptyAssetFormState(
  modality: ZoneModality,
  sortOrder: number,
): AssetFormState {
  return {
    assetKind: "slice",
    imageUrl: modality.coverImageUrl ?? "",
    label: modality.name,
    notes: "",
    sortOrder: String(sortOrder),
    thumbnailUrl: modality.coverImageUrl ?? "",
    weightingCode: "",
  }
}

function createFormStateFromAsset(asset: ZoneModalityAsset): AssetFormState {
  return {
    assetKind: asset.assetKind,
    imageUrl: asset.imageUrl,
    label: asset.label,
    notes: asset.notes ?? "",
    sortOrder: String(asset.sortOrder),
    thumbnailUrl: asset.thumbnailUrl ?? "",
    weightingCode: asset.weightingCode ?? "",
  }
}

export function ModalityAssetsWorkspace({
  modality,
  zoneId,
}: {
  modality: ZoneModality
  zoneId: string
}) {
  const { data, isFetching } = useGetZoneModalityAssetsQuery({
    zoneId,
    modalityId: modality.id,
  })
  const assets = data?.items ?? EMPTY_ASSETS
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  const [formState, setFormState] = useState<AssetFormState>(() =>
    createEmptyAssetFormState(modality, 0),
  )
  const [createAsset, { isLoading: isCreating }] = useCreateZoneModalityAssetMutation()
  const [updateAsset, { isLoading: isUpdating }] = useUpdateZoneModalityAssetMutation()
  const activeAsset =
    (activeAssetId && assets.find((asset) => asset.id === activeAssetId)) || null
  const isPending = isCreating || isUpdating
  const previewImageUrl = formState.imageUrl.trim() || modality.coverImageUrl || ""
  const emptyDraftState = createEmptyAssetFormState(modality, assets.length)
  const hasChanges = activeAsset
    ? JSON.stringify(formState) !== JSON.stringify(createFormStateFromAsset(activeAsset))
    : JSON.stringify(formState) !== JSON.stringify(emptyDraftState)
  const orderedAssets = [...assets].sort((left, right) =>
    left.sortOrder === right.sortOrder
      ? left.createdAt.localeCompare(right.createdAt)
      : left.sortOrder - right.sortOrder,
  )

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

  function updateField<Key extends keyof AssetFormState>(
    key: Key,
    value: AssetFormState[Key],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function startCreateMode() {
    setActiveAssetId(null)
    setFormState(createEmptyAssetFormState(modality, assets.length))
  }

  function selectAsset(asset: ZoneModalityAsset) {
    setActiveAssetId(asset.id)
    setFormState(createFormStateFromAsset(asset))
  }

  async function handleSave() {
    const label = formState.label.trim()
    const imageUrl = formState.imageUrl.trim()

    if (!label) {
      toast.error("Asset label is required.")
      return
    }

    if (!imageUrl) {
      toast.error("Image URL is required.")
      return
    }

    const input: CreateZoneModalityAssetInput | UpdateZoneModalityAssetInput = {
      label,
      assetKind: formState.assetKind,
      weightingCode: formState.weightingCode || null,
      imageUrl,
      thumbnailUrl: formState.thumbnailUrl.trim() || null,
      sortOrder: normalizeSortOrder(formState.sortOrder),
      notes: formState.notes.trim() || null,
    }

    try {
      if (activeAsset) {
        const asset = await updateAsset({
          zoneId,
          modalityId: modality.id,
          assetId: activeAsset.id,
          input,
        }).unwrap()

        toast.success("Viewer asset updated.")
        selectAsset(asset)
        return
      }

      const asset = await createAsset({
        zoneId,
        modalityId: modality.id,
        input,
      }).unwrap()

      toast.success("Viewer asset added.")
      selectAsset(asset)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to save the viewer asset."))
    }
  }

  return (
    <Card className="border border-border/70 bg-muted/10 shadow-none">
      <CardHeader className="border-b border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Viewer Assets</CardTitle>
            <CardDescription>
              Build the image set for this modality before the dedicated imaging canvas.
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={startCreateMode}>
            <PlusIcon />
            New asset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-[#090b0f]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-white">
                {formState.label.trim() || "Preview workspace"}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{formState.assetKind}</Badge>
                {formState.weightingCode ? (
                  <Badge variant="outline">{formatWeightingLabel(formState.weightingCode)}</Badge>
                ) : null}
              </div>
            </div>
            <div className="text-xs text-white/55">
              {activeAsset ? "Existing asset" : "Draft asset"}
            </div>
          </div>

          <div className="flex min-h-[18rem] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.18),transparent_45%),linear-gradient(180deg,#08090d_0%,#10131a_100%)] p-4">
            {previewImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={formState.label || modality.name}
                className="max-h-[22rem] w-full rounded-lg border border-white/10 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
                src={previewImageUrl}
              />
            ) : (
              <div className="flex h-full min-h-[14rem] w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-6 text-center text-white/65">
                <ImageIcon className="size-8" />
                <p className="mt-3 text-sm font-medium">No preview image yet</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-white/50">
                  Add an image URL to create the first viewer asset for this modality.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/45">
              <ImagesIcon className="size-3.5" />
              Asset strip
            </div>
            {isFetching ? (
              <div className="text-xs text-white/55">Loading assets...</div>
            ) : orderedAssets.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {orderedAssets.map((asset) => {
                  const isActive = asset.id === activeAssetId

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`min-w-[8.5rem] overflow-hidden rounded-lg border text-left transition-colors ${
                        isActive
                          ? "border-primary/70 bg-primary/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                      }`}
                      onClick={() => selectAsset(asset)}
                    >
                      <div className="aspect-[4/3] bg-black/40">
                        {asset.thumbnailUrl || asset.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={asset.label}
                            className="h-full w-full object-cover"
                            src={asset.thumbnailUrl || asset.imageUrl}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-white/35">
                            <ImageIcon className="size-5" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 px-3 py-2">
                        <div className="truncate text-xs font-medium text-white">
                          {asset.label}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary">{asset.assetKind}</Badge>
                          {asset.weightingCode ? (
                            <Badge variant="outline">
                              {formatWeightingLabel(asset.weightingCode)}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-white/55">
                No viewer assets yet. Add one below to start building the modality workspace.
              </div>
            )}
          </div>
        </div>

        <FieldGroup className="gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`asset-label-${modality.id}`}>Asset label</FieldLabel>
              <Input
                id={`asset-label-${modality.id}`}
                value={formState.label}
                onChange={(event) => updateField("label", event.target.value)}
                placeholder="Axial slice 01, frontal overview..."
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`asset-sort-${modality.id}`}>Sort order</FieldLabel>
              <Input
                id={`asset-sort-${modality.id}`}
                inputMode="numeric"
                value={formState.sortOrder}
                onChange={(event) => updateField("sortOrder", event.target.value)}
                placeholder="0"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`asset-kind-${modality.id}`}>Asset kind</FieldLabel>
              <PlaygroundSelect
                id={`asset-kind-${modality.id}`}
                options={ASSET_KIND_OPTIONS}
                value={formState.assetKind}
                onValueChange={(value) => updateField("assetKind", value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`asset-weighting-${modality.id}`}>Weighting</FieldLabel>
              <PlaygroundSelect
                id={`asset-weighting-${modality.id}`}
                options={WEIGHTING_OPTIONS}
                value={formState.weightingCode}
                onValueChange={(value) => updateField("weightingCode", value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={`asset-image-url-${modality.id}`}>Image URL</FieldLabel>
            <Input
              id={`asset-image-url-${modality.id}`}
              value={formState.imageUrl}
              onChange={(event) => updateField("imageUrl", event.target.value)}
              placeholder="https://..."
            />
            <FieldDescription>
              This milestone stores viewer-ready image metadata. Binary upload/processing comes next.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`asset-thumbnail-url-${modality.id}`}>
              Thumbnail URL
            </FieldLabel>
            <Input
              id={`asset-thumbnail-url-${modality.id}`}
              value={formState.thumbnailUrl}
              onChange={(event) => updateField("thumbnailUrl", event.target.value)}
              placeholder="https://..."
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`asset-notes-${modality.id}`}>Notes</FieldLabel>
            <Textarea
              id={`asset-notes-${modality.id}`}
              value={formState.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Internal guidance about this slice, plane, or viewer configuration."
            />
          </Field>

          <Button type="button" disabled={!hasChanges || isPending} onClick={handleSave}>
            {isPending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
            {activeAsset ? "Save asset" : "Create asset"}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function normalizeSortOrder(value: string) {
  const parsed = Number.parseInt(value.trim(), 10)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return parsed
}

function formatWeightingLabel(value: ModalityWeightingCode) {
  switch (value) {
    case "t1_gado":
      return "T1 Gado"
    case "t2_star":
      return "T2*"
    default:
      return value.toUpperCase()
  }
}

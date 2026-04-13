"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { AlertCircleIcon, DatabaseIcon, Layers3Icon, ScanSearchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ZoneModality, ZoneModalityAsset } from "@/lib/playground/types"
import { useGetZoneModalityViewerManifestQuery } from "@/lib/store/services/playground-api"

function formatWeightingLabel(value: string | null | undefined) {
  if (!value) {
    return "Unclassified"
  }

  switch (value) {
    case "t1_gado":
      return "T1 Gado"
    case "t2_star":
      return "T2*"
    default:
      return value.toUpperCase()
  }
}

function formatIngestStatus(value: string | null | undefined) {
  if (!value) {
    return "Unknown"
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function countSeries(assets: ZoneModalityAsset[]) {
  return new Set(
    assets.map((asset) => asset.seriesUid || asset.seriesLabel || asset.id),
  ).size
}

function isProcessingStatus(value: string | null | undefined) {
  return (
    value === "processing" ||
    value === "queued" ||
    value === "uploaded" ||
    value === "validating" ||
    value === "deriving"
  )
}

function describeIngestProgress(ingestJob: { summaryJson: Record<string, unknown> } | null) {
  if (!ingestJob) {
    return "Ready for authoring when derivation completes"
  }

  const stagedFileCount = ingestJob.summaryJson.stagedFileCount
  const derivedSliceCount = ingestJob.summaryJson.derivedSliceCount

  if (typeof derivedSliceCount === "number") {
    return `${derivedSliceCount} slices derived so far`
  }

  if (typeof stagedFileCount === "number") {
    return `${stagedFileCount} files staged for validation`
  }

  return "Ready for authoring when derivation completes"
}

export function ModalityAssetsWorkspace({
  modality,
  zoneId,
}: {
  modality: ZoneModality
  zoneId: string
}) {
  const { data, isFetching, isLoading } = useGetZoneModalityViewerManifestQuery(
    {
      zoneId,
      modalityId: modality.id,
    },
    {
      pollingInterval: isProcessingStatus(modality.processingStatus) ? 3000 : 0,
      skipPollingIfUnfocused: true,
    },
  )
  const ingestJob = data?.ingestJob ?? null
  const sourceAssets = data?.sourceAssets ?? []
  const assets = data?.assets ?? []
  const viewerStatus = ingestJob?.status || modality.processingStatus
  const derivedSlices = assets.filter((asset) => asset.assetKind === "slice")
  const weightings = Array.from(
    new Set(derivedSlices.map((asset) => formatWeightingLabel(asset.weightingCode))),
  )
  const seriesCards = Array.from(
    new Map(
      derivedSlices.map((asset) => [
        asset.seriesUid || asset.seriesLabel || asset.id,
        {
          id: asset.seriesUid || asset.seriesLabel || asset.id,
          label: asset.seriesLabel || asset.label,
          weighting: formatWeightingLabel(asset.weightingCode),
          orientation: asset.orientationCode || "axial",
          slices: 0,
        },
      ]),
    ).values(),
  ).map((item) => ({
    ...item,
    slices: derivedSlices.filter(
      (asset) => (asset.seriesUid || asset.seriesLabel || asset.id) === item.id,
    ).length,
  }))

  return (
    <Card className="border border-border/70 bg-muted/10 shadow-none">
      <CardHeader className="border-b border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Study Intake</CardTitle>
            <CardDescription>
              This modality now uses the uploaded ZIP or DICOM study as the source of
              truth. Viewer slices are derived automatically.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={viewerStatus === "ready" ? "secondary" : "outline"}>
              {formatIngestStatus(viewerStatus)}
            </Badge>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/playground/zones/${zoneId}/modalities/${modality.id}/viewer`}>
                Open viewer
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryTile
            icon={<DatabaseIcon className="size-4" />}
            label="Source files"
            value={`${ingestJob?.sourceFileCount ?? modality.sourceFileCount}`}
            note={modality.sourceLabel || "Uploaded study"}
          />
          <SummaryTile
            icon={<Layers3Icon className="size-4" />}
            label="Derived slices"
            value={`${derivedSlices.length}`}
            note={derivedSlices.length > 0 ? `${countSeries(derivedSlices)} series` : "No slices yet"}
          />
          <SummaryTile
            icon={<ScanSearchIcon className="size-4" />}
            label="Weightings"
            value={`${weightings.length}`}
            note={weightings.slice(0, 3).join(", ") || "Pending derivation"}
          />
          <SummaryTile
            icon={<AlertCircleIcon className="size-4" />}
            label="Status"
            value={formatIngestStatus(viewerStatus)}
            note={ingestJob?.errorMessage || describeIngestProgress(ingestJob)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1.6fr]">
          <div className="rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="text-sm font-medium text-foreground">Uploaded source study</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Raw source files are now persisted and tracked before slice derivation.
            </p>

            {isLoading ? (
              <div className="mt-4 text-sm text-muted-foreground">Loading study metadata...</div>
            ) : sourceAssets.length > 0 ? (
              <div className="mt-4 space-y-2">
                {sourceAssets.slice(0, 12).map((asset) => (
                  <div
                    key={asset.id}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                  >
                    <div className="truncate text-sm font-medium text-foreground">
                      {asset.relativePath || asset.originalFileName}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>{asset.assetRole === "source_bundle" ? "ZIP bundle" : "Source file"}</span>
                      <span>{asset.mimeType}</span>
                      <span>{formatBytes(asset.sizeBytes)}</span>
                    </div>
                  </div>
                ))}
                {sourceAssets.length > 12 ? (
                  <div className="text-xs text-muted-foreground">
                    +{sourceAssets.length - 12} more source files
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
                No persisted source files are attached to this modality yet.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="text-sm font-medium text-foreground">Derived viewer stack</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              These slices are generated from the source study and power the viewer
              directly. Manual per-slice uploads are no longer the primary workflow.
            </p>

            {derivedSlices.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {seriesCards.map((series) => (
                  <div
                    key={series.id}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3"
                  >
                    <div className="text-sm font-medium text-foreground">{series.label}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant="secondary">{series.weighting}</Badge>
                      <Badge variant="outline">{series.orientation}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {series.slices} derived slice{series.slices === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
                {isProcessingStatus(viewerStatus)
                  ? "The study is still processing. This panel will update automatically when slices are ready."
                  : "The source study has not produced a derived viewer stack yet."}
              </div>
            )}
          </div>
        </div>
        {isFetching && !isLoading ? (
          <div className="text-xs text-muted-foreground">Refreshing study status...</div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SummaryTile({
  icon,
  label,
  note,
  value,
}: {
  icon: ReactNode
  label: string
  note: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{note}</div>
    </div>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

import { ExternalLinkIcon } from "lucide-react"

import { ContentFilters } from "./_components/content-filters"
import { ContentLiveRefresh } from "./_components/content-live-refresh"
import { ProcessingProgress } from "@/components/processing-progress"
import { Badge } from "@/components/ui/badge"
import { Frame } from "@/components/ui/frame"
import { LinkButton } from "@/components/ui/link-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TablePagination } from "@/components/ui/table-pagination"
import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { serverApiFetch } from "@/lib/api/server"
import { requireCapabilitySession } from "@/lib/auth/session"
import type {
  ModalityProcessingStatus,
  ZoneListResponse,
  ZoneModalityFamily,
  ZoneModalityFamilyListResponse,
} from "@/lib/playground/types"

const PAGE_SIZE = 25
const STATUSES = new Set(["draft", "uploaded", "processing", "ready", "failed"])

type ContentItem = ZoneModalityFamily & {
  latestUpdatedAt: string
  primaryModalityId: string
  zoneId: string
  zoneName: string
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown"
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value))
}

function badgeVariant(status: string) {
  if (status === "ready") {
    return "outline" as const
  }

  return "secondary" as const
}

function getContentStatus(item: ZoneModalityFamily): ModalityProcessingStatus {
  const statuses = new Set(
    item.variants.map((variant) => variant.processingStatus),
  )

  if (item.totalVariantCount > 0 && item.readyVariantCount === item.totalVariantCount) {
    return "ready"
  }

  if (statuses.has("processing")) return "processing"
  if (statuses.has("uploaded")) return "uploaded"
  if (statuses.has("failed")) return "failed"

  return "draft"
}

function getContentProgress(item: ZoneModalityFamily) {
  const activeVariant = item.variants.find(
    (variant) =>
      variant.processingStatus === "processing" ||
      variant.processingStatus === "uploaded",
  )

  if (!activeVariant) return null

  const status = getContentStatus(item)
  const summary = activeVariant.ingestSummaryJson
  const message =
    typeof summary?.message === "string" && summary.message.trim()
      ? summary.message.trim()
      : typeof summary?.phase === "string"
        ? summary.phase.replaceAll("_", " ")
        : status.replaceAll("_", " ")
  const rawPercent = summary?.progressPercent
  const percent =
    typeof rawPercent === "number" && Number.isFinite(rawPercent)
      ? Math.min(100, Math.max(0, Math.round(rawPercent)))
      : null

  return { message, percent }
}


function getContentFailure(item: ZoneModalityFamily) {
  const failedVariant = item.variants.find(
    (variant) => variant.processingStatus === "failed",
  )

  if (!failedVariant) return null

  const summary = failedVariant.ingestSummaryJson
  const phase = typeof summary?.phase === "string" ? summary.phase : null
  const message =
    typeof summary?.message === "string" && summary.message.trim()
      ? summary.message.trim()
      : "Study processing failed."

  return {
    label: phase === "interrupted" ? "Interrupted" : "Failed",
    message,
  }
}

function getContentStatusLabel(item: ZoneModalityFamily) {
  const status = getContentStatus(item)
  return item.totalVariantCount > 1
    ? `${status.replaceAll("_", " ")} · ${item.readyVariantCount}/${item.totalVariantCount} ready`
    : status.replaceAll("_", " ")
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireCapabilitySession("manage_content", "/content")
  const params = await searchParams
  const search = readParam(params.search).trim()
  const requestedStatus = readParam(params.status)
  const status = STATUSES.has(requestedStatus) ? requestedStatus : "all"
  const requestedPage = Number.parseInt(readParam(params.page), 10)
  let contentItems: ContentItem[] = []
  let loadError: string | null = null

  try {
    const zonesResponse = await serverApiFetch<ZoneListResponse>(
      "/playground/zones",
      {
        cache: "no-store",
        includeCookie: false,
        headers: buildInternalAdminHeaders(user),
      },
    )
    const modalityResponses = await Promise.all(
      zonesResponse.items.map(async (zone) => ({
        response: await serverApiFetch<ZoneModalityFamilyListResponse>(
          `/playground/zones/${zone.id}/modalities`,
          {
            cache: "no-store",
            includeCookie: false,
            headers: buildInternalAdminHeaders(user),
          },
        ),
        zone,
      })),
    )

    contentItems = modalityResponses
      .flatMap(({ response, zone }) =>
        response.items.flatMap((family) => {
          const primaryModality = family.variants[0]

          if (!primaryModality) {
            return []
          }

          const latestUpdatedAt = family.variants.reduce(
            (latest, variant) =>
              variant.updatedAt.localeCompare(latest) > 0
                ? variant.updatedAt
                : latest,
            primaryModality.updatedAt,
          )

          return [
            {
              ...family,
              latestUpdatedAt,
              primaryModalityId: primaryModality.id,
              zoneId: zone.id,
              zoneName: zone.name,
            },
          ]
        }),
      )
      .sort((left, right) =>
        right.latestUpdatedAt.localeCompare(left.latestUpdatedAt),
      )
  } catch (error) {
    loadError =
      error instanceof ApiClientError
        ? error.message
        : "Content is temporarily unavailable."
  }

  const filteredItems = contentItems.filter((item) => {
    const normalizedSearch = search.toLowerCase()
    const contentStatus = getContentStatus(item)
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(normalizedSearch) ||
      item.zoneName.toLowerCase().includes(normalizedSearch) ||
      item.modalityType.toLowerCase().includes(normalizedSearch) ||
      item.variants.some(
        (variant) =>
          variant.name.toLowerCase().includes(normalizedSearch) ||
          variant.slug.toLowerCase().includes(normalizedSearch) ||
          variant.weightingCode?.toLowerCase().includes(normalizedSearch),
      )
    const matchesStatus = status === "all" || contentStatus === status

    return matchesSearch && matchesStatus
  })
  const total = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages,
  )
  const items = filteredItems.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  )
  const baseParams = new URLSearchParams()

  if (search) baseParams.set("search", search)
  if (status !== "all") baseParams.set("status", status)

  const baseUrl = baseParams.size
    ? `/content?${baseParams.toString()}`
    : "/content"
  const hasActiveContentIngest = contentItems.some((item) =>
    item.variants.some(
      (variant) =>
        variant.processingStatus === "processing" ||
        variant.processingStatus === "uploaded",
    ),
  )

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <ContentLiveRefresh enabled={hasActiveContentIngest} />
      <ContentFilters initialSearch={search} initialStatus={status} />

      <Frame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Content — {total}</TableHead>
              <TableHead className="w-44">Zone</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="w-44">Updated</TableHead>
              <TableHead className="w-28 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-28 text-center text-destructive"
                >
                  {loadError}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-28 text-center text-muted-foreground"
                >
                  No content found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const contentStatus = getContentStatus(item)

                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.modalityType.toUpperCase()} · {item.totalVariantCount}{" "}
                        {item.totalVariantCount === 1 ? "variant" : "variants"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.zoneName}
                    </TableCell>
                    <TableCell className="max-w-72">
                      {(() => {
                        const progress = getContentProgress(item)
                        const failure = getContentFailure(item)
                        return progress ? (
                          <ProcessingProgress
                            compact
                            label={progress.message}
                            percent={progress.percent}
                          />
                        ) : failure ? (
                          <Badge
                            variant={badgeVariant(contentStatus)}
                            title={failure.message}
                          >
                            {failure.label}
                          </Badge>
                        ) : (
                          <Badge variant={badgeVariant(contentStatus)}>
                            {getContentStatusLabel(item)}
                          </Badge>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(item.latestUpdatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <LinkButton
                        href={`/playground/zones/${item.zoneId}/modalities/${item.primaryModalityId}/viewer`}
                        size="sm"
                        variant="ghost"
                      >
                        Manage
                        <ExternalLinkIcon />
                      </LinkButton>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Frame>

      <TablePagination
        baseUrl={baseUrl}
        currentPage={page}
        pageSize={PAGE_SIZE}
        totalItems={total}
        totalPages={totalPages}
      />
    </div>
  )
}

import { ExternalLinkIcon } from "lucide-react"

import { ContentFilters } from "./_components/content-filters"
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
import type { ModuleListResponse } from "@/lib/auth/types"

const PAGE_SIZE = 25
const STATUSES = new Set(["draft", "active", "published", "archived"])

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not published"
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value))
}

function badgeVariant(status: string) {
  if (status === "published" || status === "active") {
    return "outline" as const
  }

  return "secondary" as const
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
  let response: ModuleListResponse = { items: [], total: 0 }
  let loadError: string | null = null

  try {
    response = await serverApiFetch<ModuleListResponse>("/modules", {
      cache: "no-store",
      includeCookie: false,
      headers: buildInternalAdminHeaders(user),
    })
  } catch (error) {
    loadError =
      error instanceof ApiClientError
        ? error.message
        : "Content is temporarily unavailable."
  }

  const filteredItems = response.items.filter((item) => {
    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.slug.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = status === "all" || item.status === status

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

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <ContentFilters initialSearch={search} initialStatus={status} />

      <Frame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Content — {total}</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="w-36">Latest version</TableHead>
              <TableHead className="w-44">Published</TableHead>
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
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant(item.status)}>
                      {item.status.replaceAll("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.latestVersionNo
                      ? `v${item.latestVersionNo}${
                          item.latestVersionState
                            ? ` · ${item.latestVersionState}`
                            : ""
                        }`
                      : "No version"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(item.currentReleasePublishedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <LinkButton href="/playground" size="sm" variant="ghost">
                      Manage
                      <ExternalLinkIcon />
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))
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

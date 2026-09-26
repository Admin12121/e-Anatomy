import { ArrowRightIcon } from "lucide-react"

import { AnalyticsFilters } from "../_components/analytics-filters"
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
import { requireCapabilitySession } from "@/lib/auth/session"
import { loadContentCatalog } from "@/lib/content/catalog-server"

const PAGE_SIZE = 25

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  )
}

export default async function ContentAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireCapabilitySession(
    "view_analytics",
    "/analytics/content",
  )
  const params = await searchParams
  const requestedDays = Number.parseInt(readParam(params.days), 10)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const requestedPage = Number.parseInt(readParam(params.page), 10)
  const items = await loadContentCatalog(user)
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages,
  )
  const visibleItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const baseUrl = days === 30 ? "/analytics/content" : `/analytics/content?days=${days}`

  return (
    <div className="space-y-4">
      <AnalyticsFilters days={days} />
      <Frame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Content — {items.length}</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Collection</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.length === 0 ? (
              <TableRow>
                <TableCell className="h-28 text-center text-muted-foreground" colSpan={6}>
                  No content found.
                </TableCell>
              </TableRow>
            ) : (
              visibleItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.modalityType.toUpperCase()}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.zoneName}</TableCell>
                  <TableCell className="tabular-nums">
                    {item.readyVariantCount}/{item.totalVariantCount} ready
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning">Not connected</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(item.latestUpdatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <LinkButton
                      href={`/content/${item.primarySlug}`}
                      size="sm"
                      variant="ghost"
                    >
                      View analytics
                      <ArrowRightIcon />
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
        totalItems={items.length}
        totalPages={totalPages}
      />
    </div>
  )
}

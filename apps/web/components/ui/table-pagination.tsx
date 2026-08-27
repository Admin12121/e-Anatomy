"use client"

import Link from "next/link"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination"
import { Button } from "@/components/ui/button"

type TablePaginationProps = {
  baseUrl: string
  className?: string
  currentPage: number
  maxVisiblePages?: number
  pageParam?: string
  pageSize?: number
  totalItems?: number
  totalPages: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function getPageHref(baseUrl: string, pageParam: string, page: number) {
  const separator = baseUrl.includes("?") ? "&" : "?"
  return `${baseUrl}${separator}${encodeURIComponent(pageParam)}=${page}`
}

function PageControl({
  active = false,
  children,
  disabled = false,
  href,
  label,
}: {
  active?: boolean
  children: React.ReactNode
  disabled?: boolean
  href: string
  label?: string
}) {
  const className = cn(
    "size-9 min-w-9 rounded-lg",
    active &&
      "border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:text-primary-foreground",
  )

  if (disabled) {
    return (
      <Button
        aria-label={label}
        className={className}
        data-slot="table-pagination-button"
        disabled
        size="icon"
        variant="ghost"
      >
        {children}
      </Button>
    )
  }

  return (
    <PaginationLink
      aria-label={label}
      className={className}
      isActive={active}
      render={<Link href={href} scroll={false} />}
    >
      {children}
    </PaginationLink>
  )
}

export function TablePagination({
  baseUrl,
  className,
  currentPage: requestedPage,
  maxVisiblePages = 5,
  pageParam = "page",
  pageSize = 25,
  totalItems,
  totalPages: requestedTotalPages,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.trunc(requestedTotalPages))
  const currentPage = clamp(Math.trunc(requestedPage), 1, totalPages)
  const visiblePages = Math.max(1, Math.trunc(maxVisiblePages))
  const halfWindow = Math.floor(visiblePages / 2)
  let startPage = Math.max(1, currentPage - halfWindow)
  let endPage = Math.min(totalPages, startPage + visiblePages - 1)

  if (endPage - startPage + 1 < visiblePages) {
    startPage = Math.max(1, endPage - visiblePages + 1)
  }

  endPage = Math.min(totalPages, startPage + visiblePages - 1)

  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index,
  )
  const rangeStart =
    totalItems === undefined || totalItems === 0
      ? 0
      : (currentPage - 1) * pageSize + 1
  const rangeEnd =
    totalItems === undefined
      ? 0
      : Math.min(currentPage * pageSize, totalItems)
  const hrefFor = (page: number) =>
    getPageHref(baseUrl, pageParam, clamp(page, 1, totalPages))

  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      data-slot="table-pagination"
    >
      <div
        className="hidden text-sm text-muted-foreground sm:block"
        data-slot="table-pagination-summary"
      >
        {totalItems === undefined
          ? `Page ${currentPage} of ${totalPages}`
          : totalItems > 0
            ? `Showing ${rangeStart}-${rangeEnd} of ${totalItems}`
            : "Showing 0 of 0"}
      </div>
      <Pagination className="mx-0 w-auto justify-center md:justify-end">
        <PaginationContent className="flex-wrap">
          <PaginationItem>
            <PageControl
              disabled={currentPage === 1}
              href={hrefFor(1)}
              label="First page"
            >
              <ChevronsLeftIcon />
            </PageControl>
          </PaginationItem>
          <PaginationItem>
            <PageControl
              disabled={currentPage === 1}
              href={hrefFor(currentPage - 1)}
              label="Previous page"
            >
              <ChevronLeftIcon />
            </PageControl>
          </PaginationItem>

          {startPage > 1 ? (
            <>
              <PaginationItem>
                <PageControl
                  active={currentPage === 1}
                  href={hrefFor(1)}
                  label="Page 1"
                >
                  1
                </PageControl>
              </PaginationItem>
              {startPage > 2 ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
            </>
          ) : null}

          {pageNumbers.map((page) => (
            <PaginationItem key={page}>
              <PageControl
                active={page === currentPage}
                href={hrefFor(page)}
                label={`Page ${page}`}
              >
                {page}
              </PageControl>
            </PaginationItem>
          ))}

          {endPage < totalPages ? (
            <>
              {endPage < totalPages - 1 ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <PageControl
                  active={currentPage === totalPages}
                  href={hrefFor(totalPages)}
                  label={`Page ${totalPages}`}
                >
                  {totalPages}
                </PageControl>
              </PaginationItem>
            </>
          ) : null}

          <PaginationItem>
            <PageControl
              disabled={currentPage === totalPages}
              href={hrefFor(currentPage + 1)}
              label="Next page"
            >
              <ChevronRightIcon />
            </PageControl>
          </PaginationItem>
          <PaginationItem>
            <PageControl
              disabled={currentPage === totalPages}
              href={hrefFor(totalPages)}
              label="Last page"
            >
              <ChevronsRightIcon />
            </PageControl>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

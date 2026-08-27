"use client"

import { useState } from "react"
import { PlusIcon, SearchIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ContentFilters({
  initialSearch,
  initialStatus,
}: {
  initialSearch: string
  initialStatus: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)

  function navigate(next: Partial<{ search: string; status: string }>) {
    const params = new URLSearchParams(window.location.search)
    const values = {
      search: next.search ?? search,
      status: next.status ?? initialStatus,
    }

    params.delete("page")

    for (const [key, value] of Object.entries(values)) {
      if (!value || value === "all") {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }

    const query = params.toString()
    router.push(query ? `/content?${query}` : "/content")
  }

  const hasFilters = Boolean(initialSearch) || initialStatus !== "all"

  return (
    <form
      className="grid gap-3 lg:grid-cols-[minmax(18rem,26rem)_minmax(1rem,1fr)_13rem_auto]"
      onSubmit={(event) => {
        event.preventDefault()
        navigate({ search: search.trim() })
      }}
    >
      <InputGroup>
        <InputGroupInput
          aria-label="Search content"
          placeholder="Search content..."
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>

      <div aria-hidden className="hidden lg:block" />

      <Select
        value={initialStatus}
        onValueChange={(value) => navigate({ status: value ?? "all" })}
      >
        <SelectTrigger aria-label="Filter by status">
          <SelectValue>
            {initialStatus === "all"
              ? "All statuses"
              : initialStatus.replaceAll("_", " ")}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="published">Published</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectPopup>
      </Select>

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="outline">
          Search
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Clear filters"
            onClick={() => {
              setSearch("")
              router.push("/content")
            }}
          >
            <XIcon />
          </Button>
        ) : null}
        <Button asChild>
          <Link href="/playground">
            <PlusIcon />
            Add content
          </Link>
        </Button>
      </div>
    </form>
  )
}

"use client"

import { useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"
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

type UsersFiltersProps = {
  initialRole: string
  initialSearch: string
  initialStatus: string
}

function getRoleLabel(value: string) {
  switch (value) {
    case "admin":
      return "Owner/Admin"
    case "editor":
      return "Editor"
    case "viewer":
      return "Viewer"
    default:
      return "All roles"
  }
}

function getStatusLabel(value: string) {
  switch (value) {
    case "active":
      return "Active"
    case "inactive":
      return "Inactive"
    default:
      return "All statuses"
  }
}

export function UsersFilters({
  initialRole,
  initialSearch,
  initialStatus,
}: UsersFiltersProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)

  function navigate(
    next: Partial<{ role: string; search: string; status: string }>,
  ) {
    const params = new URLSearchParams(window.location.search)
    const values = {
      role: next.role ?? initialRole,
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
    router.push(query ? `/users?${query}` : "/users")
  }

  const hasFilters =
    Boolean(initialSearch) || initialRole !== "all" || initialStatus !== "all"

  return (
    <form
      className="grid gap-3 lg:grid-cols-[minmax(18rem,26rem)_minmax(1rem,1fr)_13rem_13rem_auto]"
      onSubmit={(event) => {
        event.preventDefault()
        navigate({ search: search.trim() })
      }}
    >
      <InputGroup>
        <InputGroupInput
          aria-label="Search users"
          placeholder="Search users..."
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
        value={initialRole}
        onValueChange={(value) => navigate({ role: value ?? "all" })}
      >
        <SelectTrigger aria-label="Filter by role">
          <SelectValue>{getRoleLabel(initialRole)}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="all">All roles</SelectItem>
          <SelectItem value="admin">Owner/Admin</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </SelectPopup>
      </Select>

      <Select
        value={initialStatus}
        onValueChange={(value) => navigate({ status: value ?? "all" })}
      >
        <SelectTrigger aria-label="Filter by status">
          <SelectValue>{getStatusLabel(initialStatus)}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectPopup>
      </Select>

      <div className="flex gap-2">
        {hasFilters ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Clear filters"
            onClick={() => {
              setSearch("")
              router.push("/users")
            }}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </form>
  )
}

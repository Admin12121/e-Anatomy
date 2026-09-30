"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Filters = {
  search: string;
  status: string;
};
const statuses = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "unpublished_changes", label: "Unpublished changes" },
];

export function ResourceFilters({
  base,
  initial,
}: {
  base: string;
  initial: Filters;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initial.search);
  const [pending, startTransition] = useTransition();
  function navigate(next: Partial<Filters>) {
    const values = { ...initial, search: search.trim(), ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values))
      if (value && value !== "all") query.set(key, value);
    startTransition(() =>
      router.push(query.size ? `${base}?${query}` : base, { scroll: false }),
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        navigate({});
      }}
    >
      <InputGroup className="w-full sm:max-w-80">
        <InputGroupInput
          aria-label="Search resources"
          placeholder="Search modalities…"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <Button
            type="submit"
            variant="ghost"
            size="icon-xs"
            aria-label="Search resources"
            disabled={pending}
          >
            <SearchIcon />
          </Button>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <Select
          items={statuses}
          value={initial.status}
          onValueChange={(value) => navigate({ status: value ?? "all" })}
          disabled={pending}
        >
          <SelectTrigger
            className="w-full sm:w-44"
            aria-label="Filter by publication status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {statuses.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        {initial.search || initial.status !== "all" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear resource filters"
            disabled={pending}
            onClick={() => {
              setSearch("");
              startTransition(() => router.push(base, { scroll: false }));
            }}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </form>
  );
}

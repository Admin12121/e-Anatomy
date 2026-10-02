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

type Filters = {
  search: string;
};

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
        {initial.search ? (
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

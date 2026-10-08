"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckIcon, ImagesIcon, LoaderCircleIcon, SearchIcon, Settings2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { readLibraryResponse, type LibraryStudy } from "@/lib/image-library/types";
import type { ModalityType } from "@/lib/playground/types";
import { cn } from "@/lib/utils";

/** Ready library studies, picked instead of uploading. Sits beside the upload drop zone. */
export function LibraryPanel({ value, onSelect, modalityType, disabled, className }: {
  value: LibraryStudy | null;
  onSelect: (study: LibraryStudy) => void;
  /** Restricts the list, e.g. a variant must match its family's type. */
  modalityType?: ModalityType;
  disabled?: boolean;
  className?: string;
}) {
  const [studies, setStudies] = useState<LibraryStudy[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/image-library", { signal: abort.signal, cache: "no-store" })
      .then(readLibraryResponse<LibraryStudy[]>)
      .then(setStudies)
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load images."); });
    return () => abort.abort();
  }, []);

  const ready = useMemo(() => (studies ?? []).filter((study) =>
    study.status === "ready" && (!modalityType || study.modalityType === modalityType)), [studies, modalityType]);
  const query = search.trim().toLocaleLowerCase();
  const shown = query
    ? ready.filter((study) => study.name.toLocaleLowerCase().includes(query) || study.modalityType.includes(query))
    : ready;

  return (
    <div className={cn("flex min-h-0 flex-col rounded-xl border border-input p-2", className)}>
      <div className="flex items-center gap-1">
        <InputGroup className="h-8">
          <InputGroupInput aria-label="Search library" placeholder="Search library" type="search"
            value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)} />
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
        </InputGroup>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Open image library" asChild>
          <Link href="/image-library"><Settings2Icon /></Link>
        </Button>
      </div>
      <div role="listbox" aria-label="Saved images" className="mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {studies === null && !error ? (
          <p role="status" className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin" />Loading library…
          </p>
        ) : null}
        {error ? <p role="alert" className="px-2 py-3 text-xs text-destructive">{error}</p> : null}
        {studies !== null && !shown.length ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {query ? "No matching studies." : "No ready studies yet."}
          </p>
        ) : null}
        {shown.map((study) => {
          const selected = value?.id === study.id;
          return (
            <button key={study.id} type="button" role="option" aria-selected={selected} disabled={disabled}
              onClick={() => onSelect(study)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/60 disabled:pointer-events-none disabled:opacity-60 aria-selected:bg-accent">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                <ImagesIcon className="size-4 opacity-70" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{study.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {study.modalityType.toUpperCase()} · {study.sliceCount} slices
                </span>
              </span>
              {selected ? <CheckIcon aria-hidden="true" className="size-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

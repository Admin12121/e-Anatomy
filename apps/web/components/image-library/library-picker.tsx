"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readLibraryResponse, type LibraryStudy } from "@/lib/image-library/types";
import type { ModalityType } from "@/lib/playground/types";

export function LibraryPicker({ modalityType, value, onChange, disabled }: {
  modalityType: ModalityType;
  value: LibraryStudy | null;
  onChange: (study: LibraryStudy | null) => void;
  disabled?: boolean;
}) {
  const [studies, setStudies] = useState<LibraryStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/image-library", { signal: abort.signal, cache: "no-store" })
      .then(readLibraryResponse<LibraryStudy[]>)
      .then(setStudies)
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load images."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  const available = studies.filter((study) => study.status === "ready" && study.modalityType === modalityType);
  const selected = available.find((study) => study.id === value?.id) ?? null;
  const items = available.map((study) => ({ value: study.id, label: `${study.name} · ${study.sliceCount} slices · revision ${study.revision}` }));
  return (
    <Field>
      <FieldLabel htmlFor="library-study">Saved images</FieldLabel>
      <Select items={items} value={selected?.id ?? null} onValueChange={(id) => onChange(available.find((study) => study.id === id) ?? null)} disabled={disabled || loading || !available.length}>
        <SelectTrigger id="library-study" size="lg"><SelectValue placeholder={loading ? "Loading saved images…" : "Select a library study"} /></SelectTrigger>
        <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!loading && !available.length && !error ? <p className="text-sm text-muted-foreground">No ready {modalityType.toUpperCase()} studies. Import and reupload an edited PNG package first.</p> : null}
      <div><Button variant="outline" size="sm" asChild><Link href="/image-library">Open image library</Link></Button></div>
    </Field>
  );
}

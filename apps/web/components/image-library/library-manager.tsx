"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, LoaderCircleIcon, MoreHorizontalIcon, PlusIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { ProcessingProgress } from "@/components/processing-progress";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Frame } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isLibraryBusy, MAX_LIBRARY_ZIP_BYTES, readLibraryResponse, type LibraryStudy } from "@/lib/image-library/types";
import { MODALITY_TYPE_OPTIONS } from "@/lib/playground/modality-options";
import type { ModalityType } from "@/lib/playground/types";

const PAGE_SIZE = 20;
const statusLabels: Record<LibraryStudy["status"], string> = {
  queued: "Queued", processing: "Converting", editable: "Ready to edit",
  encoding: "Encoding", ready: "Ready", failed: "Failed",
};

export function LibraryManager({ initialStudies }: { initialStudies: LibraryStudy[] }) {
  const [studies, setStudies] = useState(initialStudies);
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ModalityType>("mri");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const uploadRef = useRef<XMLHttpRequest | null>(null);
  const editedInputRef = useRef<HTMLInputElement | null>(null);
  const editedStudyRef = useRef<string | null>(null);
  const hasJobs = studies.some(isLibraryBusy);
  const pending = !!uploading || !!deleting;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/image-library", { cache: "no-store", signal });
    setStudies(await readLibraryResponse<LibraryStudy[]>(response));
  }, []);

  useEffect(() => {
    if (!hasJobs) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { if (!document.hidden) await refresh(abort.signal); }
      catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to refresh images."); }
      if (!abort.signal.aborted) timer = setTimeout(poll, 2500);
    };
    timer = setTimeout(poll, 2500);
    return () => { abort.abort(); clearTimeout(timer); };
  }, [hasJobs, refresh]);
  useEffect(() => () => { uploadRef.current?.abort(); }, []);

  const filtered = useMemo(() => studies.filter((study) =>
    study.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (filter === "all" || study.modalityType === filter)), [studies, search, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function upload(url: string, packageFile: File, studyId: string) {
    if (pending) return;
    const reportError = studyId === "new" ? setImportError : setError;
    if (!packageFile.name.toLowerCase().endsWith(".zip") || !packageFile.size || packageFile.size > MAX_LIBRARY_ZIP_BYTES) {
      reportError("Choose a non-empty ZIP, up to 1024 MB."); return;
    }
    setError(""); setImportError(""); setUploading(studyId); setPercent(0);
    const data = new FormData();
    data.append("file", packageFile);
    if (studyId === "new") { data.append("name", name.trim()); data.append("modalityType", kind); }
    try {
      const study = await new Promise<LibraryStudy>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); uploadRef.current = xhr;
        xhr.open("POST", url);
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) setPercent(Math.round(event.loaded * 100 / event.total)); };
        xhr.onerror = () => reject(new Error("Upload interrupted. Please try again."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.onload = () => {
          readLibraryResponse<LibraryStudy>(new Response(xhr.responseText, { status: xhr.status || 502 })).then(resolve, reject);
        };
        xhr.send(data);
      });
      setStudies((previous) => [study, ...previous.filter((item) => item.id !== study.id)]);
      if (studyId === "new") { setName(""); setFile(null); setImportOpen(false); }
    } catch (cause) { reportError(cause instanceof Error ? cause.message : "Unable to upload images."); }
    finally { uploadRef.current = null; setUploading(null); }
  }

  async function removeStudy(study: LibraryStudy) {
    if (pending || isLibraryBusy(study)) throw new Error("Wait for the current operation to finish.");
    setError(""); setDeleting(study.id);
    try {
      const response = await fetch(`/api/image-library/${study.id}`, { method: "DELETE" });
      if (!response.ok) await readLibraryResponse(response);
      setStudies((previous) => previous.filter((item) => item.id !== study.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this study.");
      throw cause;
    } finally { setDeleting(null); }
  }

  const filterItems = [{ value: "all", label: "All modalities" }, ...MODALITY_TYPE_OPTIONS];
  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input type="search" aria-label="Search image library" placeholder="Search studies…" value={search} className="max-w-xs" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <div className="flex items-center gap-2">
          <Select items={filterItems} value={filter} onValueChange={(value) => { if (value) { setFilter(value); setPage(1); } }}>
            <SelectTrigger aria-label="Filter by modality"><SelectValue /></SelectTrigger>
            <SelectContent>{filterItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh image library" onClick={() => { void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Refresh failed.")); }}><RefreshCwIcon /></Button>
          <Button type="button" size="icon" aria-label="Import DICOM study" disabled={pending} onClick={() => { setImportError(""); setImportOpen(true); }}><PlusIcon /></Button>
        </div>
      </div>
      {uploading && uploading !== "new" ? <ProcessingProgress label="Uploading" percent={percent} className="text-sm" /> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Frame>
        <Table>
          <TableHeader><TableRow><TableHead>Study</TableHead><TableHead>Modality</TableHead><TableHead>Slices</TableHead><TableHead>Status</TableHead><TableHead>Revision</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((study) => (
              <TableRow key={study.id}>
                <TableCell className="max-w-sm"><span className="font-medium">{study.name}</span>{study.errorMessage ? <p className="mt-1 whitespace-normal text-xs text-destructive">{study.errorMessage}</p> : null}</TableCell>
                <TableCell>{study.modalityType.toUpperCase()}</TableCell>
                <TableCell className="tabular-nums">{study.sliceCount}</TableCell>
                <TableCell><span className={`inline-flex items-center gap-1.5 text-sm ${study.status === "failed" ? "text-destructive" : ""}`} role={isLibraryBusy(study) ? "status" : undefined}>{isLibraryBusy(study) ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}{statusLabels[study.status]}</span></TableCell>
                <TableCell className="tabular-nums">{study.revision}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${study.name}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {["editable", "ready"].includes(study.status) ? <>
                        <DropdownMenuItem asChild><a href={`/api/image-library/${study.id}/png`}><DownloadIcon />{study.modalityType === "mpr" ? "Download all planes" : "Download PNG"}</a></DropdownMenuItem>
                        <DropdownMenuItem disabled={pending} onSelect={() => { editedStudyRef.current = study.id; editedInputRef.current?.click(); }}><UploadIcon />Reupload PNG</DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </> : null}
                      <DeleteConfirmationDialog
                        trigger={<DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}><Trash2Icon />Delete</DropdownMenuItem>}
                        confirmationValue={study.name} confirmationLabel="Study name" placeholder="Study name"
                        title="Delete study?" descriptionPrefix="Existing modalities stay unchanged. To permanently delete the library images, enter"
                        disabled={pending || isLibraryBusy(study)} pending={deleting === study.id}
                        onConfirm={() => removeStudy(study)}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{studies.length ? "No matching studies." : "No studies yet."}</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Frame>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}` : "0 studies"}</span>
        <div className="flex items-center gap-3"><Button type="button" variant="ghost" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>{currentPage} / {pages}</span><Button type="button" variant="ghost" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
      </div>
      <input ref={editedInputRef} type="file" accept=".zip,application/zip" hidden aria-label="Edited PNG ZIP" onChange={(event) => {
        const edited = event.target.files?.[0]; const id = editedStudyRef.current;
        event.target.value = ""; editedStudyRef.current = null;
        if (edited && id) void upload(`/api/image-library/${id}/edited`, edited, id);
      }} />
      <Dialog open={importOpen} onOpenChange={(open) => { if (uploading !== "new") { setImportOpen(open); if (!open) setFile(null); } }}>
        <DialogContent className="p-6" showCloseButton={uploading !== "new"}>
          <DialogHeader><DialogTitle>Import study</DialogTitle><DialogDescription>DICOM ZIP · up to 1024 MB</DialogDescription></DialogHeader>
          <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); if (file) void upload("/api/image-library", file, "new"); }}>
            <Field><FieldLabel htmlFor="library-name">Study name</FieldLabel><Input type="text" id="library-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} disabled={pending} /></Field>
            <Field><FieldLabel htmlFor="library-kind">Modality type</FieldLabel>
              <Select items={MODALITY_TYPE_OPTIONS} value={kind} disabled={pending} onValueChange={(value) => { if (value) setKind(value as ModalityType); }}>
                <SelectTrigger id="library-kind" size="lg"><SelectValue /></SelectTrigger>
                <SelectContent>{MODALITY_TYPE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
              <FieldDescription>Choose MPR to rebuild coronal and sagittal planes from a CT or MRI series. Other types keep only the uploaded slices.</FieldDescription>
            </Field>
            <Field><FieldLabel htmlFor="library-dicom">DICOM ZIP</FieldLabel><Input id="library-dicom" type="file" accept=".zip,application/zip" required disabled={pending} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>
            {importError ? <p role="alert" className="text-sm text-destructive">{importError}</p> : null}
            {uploading === "new" ? <ProcessingProgress label="Uploading" percent={percent} className="text-sm" /> : null}
            <DialogFooter className="pt-2"><Button type="button" variant="ghost" disabled={pending} onClick={() => { setImportOpen(false); setFile(null); }}>Cancel</Button><Button type="submit" disabled={pending || !file || !name.trim()}>{uploading === "new" ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}Import</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

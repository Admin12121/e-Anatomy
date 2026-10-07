"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon, SaveIcon } from "lucide-react";
import { ContentSidebarToggle } from "@/components/content/nested-sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ProjectRichTextEditor,
  ProjectRichTextViewer,
} from "@/components/anatomy/project-rich-text";
import { Button } from "@/components/ui/button";
import {
  documentValue,
  documentSaveInput,
  DocumentSaveError,
  readDocumentSaveResponse,
} from "@/lib/content/documents";
import {
  editorDraftKey,
  parseEditorDraft,
  type EditorDraft,
} from "@/lib/content/editor-draft";
import type { ContentDocument } from "@/lib/content/types";

export function ResourceEditor({
  initialDocument,
  familyId,
  target,
  title,
  canEdit,
}: {
  initialDocument: ContentDocument;
  familyId: string;
  target: string;
  title: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [document, setDocument] = useState(initialDocument);
  const [initialBody] = useState(() => documentValue(initialDocument));
  const [editorValue, setEditorValue] = useState(initialBody);
  const body = useRef(initialBody);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<EditorDraft | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);
  const initialized = useRef(false);
  const savedBody = useRef(initialBody);
  const editVersion = useRef(0);
  const saving = useRef(false);
  const revision = useRef(initialDocument.revision);
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftKey] = useState(() => editorDraftKey(familyId, target));

  const persistDraft = useCallback(() => {
    if (backupTimer.current) clearTimeout(backupTimer.current);
    backupTimer.current = null;
    if (!dirtyRef.current) return true;
    try {
      window.sessionStorage.setItem(
        draftKey,
        JSON.stringify({ version: 1, revision: revision.current, body: body.current }),
      );
      setBackupFailed(false);
      return true;
    } catch {
      setBackupFailed(true);
      return false;
    }
  }, [draftKey]);

  useEffect(() => {
    if (!canEdit) return;
    try {
      const draft = parseEditorDraft(window.sessionStorage.getItem(draftKey));
      if (draft && draft.body !== savedBody.current) {
        setRecoveryDraft(draft);
      } else if (draft) {
        window.sessionStorage.removeItem(draftKey);
      }
    } catch {
      setBackupFailed(true);
    }
  }, [canEdit, draftKey]);

  const onBodyChange = useCallback((value: string) => {
    // BlockNote owns its live state; do not rerender the page on every keystroke.
    body.current = value;
    if (!initialized.current) {
      initialized.current = true;
      savedBody.current = value;
    } else {
      editVersion.current += 1;
      const changed = value !== savedBody.current;
      dirtyRef.current = changed;
      setDirty(changed);
      if (changed) {
        if (backupTimer.current) clearTimeout(backupTimer.current);
        backupTimer.current = setTimeout(persistDraft, 400);
      }
      setNotice("");
    }
    setReady(true);
  }, [persistDraft]);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      persistDraft();
      event.preventDefault();
      event.returnValue = "";
    }
    function beforeNavigation(event: MouseEvent) {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.href === window.location.href
      ) return;
      if (!persistDraft()) {
        event.preventDefault();
        event.stopPropagation();
        setError("Automatic draft backup is unavailable. Download a copy before leaving.");
        return;
      }
      if (!window.confirm("Leave this article? Your unsaved draft will be available to restore when you return.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", beforeNavigation, true);
      persistDraft();
    };
  }, [dirty, persistDraft]);

  function downloadDraft() {
    const content = body.current;
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `article-draft-${target.replace(/[^a-z0-9-]/gi, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function reloadLatest() {
    if (!persistDraft()) {
      setError("Automatic draft backup is unavailable. Download your draft before reloading.");
      return;
    }
    window.location.reload();
  }

  function restoreDraft() {
    if (!recoveryDraft) return;
    body.current = recoveryDraft.body;
    dirtyRef.current = true;
    setDirty(true);
    setReady(false);
    setEditorValue(recoveryDraft.body);
    setRecoveryDraft(null);
  }

  function discardDraft() {
    try {
      window.sessionStorage.removeItem(draftKey);
    } catch {
      setBackupFailed(true);
    }
    setRecoveryDraft(null);
  }

  async function save() {
    if (saving.current || !ready || !canEdit || conflict || recoveryDraft) return;
    saving.current = true;
    const submittedVersion = editVersion.current;
    const submittedBody = body.current;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(
        `/api/content/families/${encodeURIComponent(familyId)}/documents/${encodeURIComponent(target)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(documentSaveInput(document, submittedBody)),
        },
      );
      const result = await readDocumentSaveResponse(response);
      setDocument(result);
      revision.current = result.revision;
      savedBody.current = submittedBody;
      const stillDirty = editVersion.current !== submittedVersion;
      dirtyRef.current = stillDirty;
      setDirty(stillDirty);
      if (stillDirty) {
        persistDraft();
      } else {
        if (backupTimer.current) clearTimeout(backupTimer.current);
        backupTimer.current = null;
        try {
          window.sessionStorage.removeItem(draftKey);
        } catch {
          setBackupFailed(true);
        }
      }
      setNotice("Article saved.");
      router.refresh();
    } catch (reason) {
      if (reason instanceof DocumentSaveError && reason.status === 409) {
        setConflict(true);
        persistDraft();
      }
      setError(
        reason instanceof Error ? reason.message : "Unable to save article.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
        <ContentSidebarToggle placement="content" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
        <span role="status" aria-live="polite" className="sr-only">
          {busy
            ? "Saving article"
            : notice || (dirty ? "Unsaved changes" : "Saved")}
        </span>
        {canEdit ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label={busy ? "Saving article" : "Save article"}
                  size="icon-sm"
                  disabled={busy || !dirty || !ready || conflict || !!recoveryDraft}
                  onClick={() => save()}
                >
                  {busy ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <SaveIcon />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save article</TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </header>
      {recoveryDraft ? (
        <div role="status" className="shrink-0 border-b px-4 py-2 text-sm">
          <p>
            An unsaved draft was found in this tab.
            {recoveryDraft.revision !== document.revision
              ? " The article changed since this draft was made; review it before saving."
              : " Restore it to continue editing."}
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={restoreDraft}>Restore draft</Button>
            <Button type="button" size="sm" variant="outline" onClick={discardDraft}>Discard draft</Button>
          </div>
        </div>
      ) : null}
      {conflict ? (
        <div role="alert" className="shrink-0 border-b px-4 py-2 text-sm">
          <p>Your edits remain here. Download a backup or reload the latest version, then choose whether to restore your draft.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={downloadDraft}>Download draft</Button>
            <Button type="button" size="sm" variant="outline" onClick={reloadLatest}>Reload latest</Button>
          </div>
        </div>
      ) : null}
      {backupFailed && dirty ? (
        <p role="alert" className="shrink-0 border-b px-4 py-2 text-sm text-destructive">
          Automatic draft backup is unavailable. <button type="button" className="underline" onClick={downloadDraft}>Download a copy</button> before leaving.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="shrink-0 border-b px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div
        className="min-h-0 min-w-0 flex-1"
        aria-label="Article content"
        data-lenis-prevent
      >
        {canEdit ? (
          <ProjectRichTextEditor
            value={editorValue}
            onChange={onBodyChange}
            storageFormat="json"
            variant="workspace"
            disabled={busy || !!recoveryDraft}
            className="resource-document rounded-none border-0 bg-transparent"
          />
        ) : (
          <ProjectRichTextViewer
            value={initialBody}
            variant="workspace"
            className="resource-document rounded-none border-0 bg-transparent"
          />
        )}
      </div>
    </div>
  );
}

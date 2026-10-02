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
import { documentValue, documentSaveInput } from "@/lib/content/documents";
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
  const body = useRef(initialBody);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const initialized = useRef(false);
  const savedBody = useRef(initialBody);
  const editVersion = useRef(0);
  const saving = useRef(false);

  const onBodyChange = useCallback((value: string) => {
    // BlockNote owns its live state; do not rerender the page on every keystroke.
    body.current = value;
    if (!initialized.current) {
      initialized.current = true;
      savedBody.current = value;
      setReady(true);
    } else {
      editVersion.current += 1;
      setDirty(value !== savedBody.current);
      setNotice("");
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function beforeNavigation(event: MouseEvent) {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        link instanceof HTMLAnchorElement &&
        link.target !== "_blank" &&
        link.href !== window.location.href &&
        !window.confirm("Leave this article and discard unsaved changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", beforeNavigation, true);
    };
  }, [dirty]);

  async function save() {
    if (saving.current || !ready || !canEdit) return;
    saving.current = true;
    const submittedVersion = editVersion.current;
    const submittedBody = body.current;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(
        `/api/content/families/${familyId}/documents/${target}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(documentSaveInput(document, submittedBody)),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "Unable to save article.");
      setDocument(result as ContentDocument);
      savedBody.current = submittedBody;
      setDirty(editVersion.current !== submittedVersion);
      setNotice("Article saved.");
      router.refresh();
    } catch (reason) {
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
                  disabled={busy || !dirty || !ready}
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
            value={initialBody}
            onChange={onBodyChange}
            storageFormat="json"
            variant="workspace"
            disabled={busy}
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

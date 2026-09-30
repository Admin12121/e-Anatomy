"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  SaveIcon,
} from "lucide-react";
import { ContentSidebarToggle } from "@/components/content/nested-sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ProjectRichTextEditor,
  ProjectRichTextViewer,
} from "@/components/anatomy/project-rich-text";
import { Button } from "@/components/ui/button";
import {
  documentValue,
  documentStatus,
  documentSaveInput,
} from "@/lib/content/documents";
import type { ContentDocument } from "@/lib/content/types";

export function ResourceEditor({
  initialDocument,
  familyId,
  target,
  title,
  canEdit,
  publicHref,
}: {
  initialDocument: ContentDocument;
  familyId: string;
  target: string;
  title: string;
  canEdit: boolean;
  publicHref?: string;
}) {
  const router = useRouter();
  const [document, setDocument] = useState(initialDocument);
  const [body, setBody] = useState(() => documentValue(initialDocument));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const initialized = useRef(false);
  const savedBody = useRef(body);
  const editVersion = useRef(0);
  const saving = useRef(false);

  const onBodyChange = useCallback((value: string) => {
    setBody(value);
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

  async function save(action: "save" | "publish" | "unpublish") {
    if (saving.current || !ready || !canEdit) return;
    if (
      action === "unpublish" &&
      !window.confirm(
        "Remove this article from public pages and the viewer description panel? Your draft will be kept.",
      )
    )
      return;
    saving.current = true;
    const submittedVersion = editVersion.current;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(
        `/api/content/families/${familyId}/documents/${target}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(documentSaveInput(document, body, action)),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "Unable to save article.");
      setDocument(result as ContentDocument);
      savedBody.current = body;
      setDirty(editVersion.current !== submittedVersion);
      setNotice(
        action === "publish"
          ? "Article published."
          : action === "unpublish"
            ? "Article unpublished."
            : "Draft saved. Live content is unchanged.",
      );
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

  const publicationLabel =
    document.publishedRevision === null
      ? "Draft"
      : document.publishedRevision === document.revision
        ? "Published"
        : "Changes";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
        <ContentSidebarToggle />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
        <span role="status" aria-live="polite" className="sr-only">
          {busy
            ? "Saving article"
            : notice || (dirty ? "Unsaved changes" : documentStatus(document))}
        </span>
        {canEdit ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                  aria-label={`Publication options: ${documentStatus(document)}${dirty ? ", unsaved changes" : ""}`}
                  disabled={busy || !ready}
                >
                  {dirty ? "Unsaved" : publicationLabel}
                  <ChevronDownIcon className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  disabled={busy || !ready || !dirty}
                  onSelect={() => save("save")}
                >
                  Save draft
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={
                    busy ||
                    !ready ||
                    (!dirty &&
                      document.publishedRevision === document.revision &&
                      document.accessLevel === "free")
                  }
                  onSelect={() => save("publish")}
                >
                  Publish article
                </DropdownMenuItem>
                {publicHref &&
                document.publishedRevision !== null &&
                document.accessLevel === "free" ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={publicHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View published <ExternalLinkIcon />
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {document.publishedRevision !== null ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={busy || !ready}
                      onSelect={() => save("unpublish")}
                    >
                      Unpublish article
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label={busy ? "Saving article" : "Save draft"}
                  size="icon-sm"
                  disabled={busy || !dirty || !ready}
                  onClick={() => save("save")}
                >
                  {busy ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <SaveIcon />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save draft</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            {documentStatus(document)}
          </span>
        )}
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
            value={body}
            onChange={onBodyChange}
            storageFormat="json"
            variant="workspace"
            disabled={busy}
            className="resource-document rounded-none border-0 bg-transparent"
          />
        ) : (
          <ProjectRichTextViewer
            value={body}
            variant="workspace"
            className="resource-document rounded-none border-0 bg-transparent"
          />
        )}
      </div>
    </div>
  );
}

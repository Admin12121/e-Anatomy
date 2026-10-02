"use client";

import dynamic from "next/dynamic";
import { memo } from "react";

import { cn } from "@/lib/utils";

import type { ProjectRichTextProps } from "./project-rich-text-browser";

const ProjectRichTextEditorDynamic = dynamic(
  () =>
    import("./project-rich-text-browser").then(
      (module) => module.ProjectRichTextEditorBrowser,
    ),
  {
    ssr: false,
    loading: () => <RichTextLoadingState />,
  },
);

const ProjectRichTextViewerDynamic = dynamic(
  () =>
    import("./project-rich-text-browser").then(
      (module) => module.ProjectRichTextViewerBrowser,
    ),
  {
    ssr: false,
    loading: () => <RichTextLoadingState message="Loading document..." />,
  },
);

/** Start the browser-only chunk while an article link is hovered or focused. */
export function preloadProjectRichText() {
  void import("./project-rich-text-browser").catch(() => {
    // A failed prefetch must not prevent navigation; the dynamic loader retries.
  });
}

function RichTextLoadingState({
  className,
  variant = "default",
  message = "Loading editor...",
}: {
  className?: string;
  variant?: "default" | "workspace";
  message?: string;
}) {
  return (
    <div
      className={cn(
        "project-rich-text rounded-xl border bg-background",
        variant === "workspace"
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
          : "min-h-72",
        className,
      )}
      data-layout={variant}
    >
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground",
          variant === "workspace" ? "h-full min-h-0" : "min-h-72",
        )}
      >
        {message}
      </div>
    </div>
  );
}

export const ProjectRichTextEditor = memo(function ProjectRichTextEditor({
  disabled = false,
  storageFormat = "markdown",
  value,
  onChange,
  className,
  variant = "default",
}: ProjectRichTextProps & {
  onChange: (value: string) => void;
}) {
  return (
    <ProjectRichTextEditorDynamic
      disabled={disabled}
      storageFormat={storageFormat}
      value={value}
      onChange={onChange}
      className={className}
      variant={variant}
    />
  );
});

export function ProjectRichTextViewer({
  value,
  emptyMessage = "No content added yet.",
  className,
  variant = "default",
}: ProjectRichTextProps & {
  emptyMessage?: string;
}) {
  return (
    <ProjectRichTextViewerDynamic
      value={value}
      emptyMessage={emptyMessage}
      className={className}
      variant={variant}
    />
  );
}

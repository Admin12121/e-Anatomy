"use client";

import type { PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import {
  GridSuggestionMenuController,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { MantineProvider } from "@mantine/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const EMPTY_DOCUMENT: PartialBlock[] = [
  { type: "paragraph" as const, content: "" },
];

function inlineContentHasText(content: unknown): boolean {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((item) => {
    if (typeof item === "string") {
      return item.trim().length > 0;
    }

    if (!item || typeof item !== "object") {
      return false;
    }

    if ("text" in item && typeof item.text === "string") {
      return item.text.trim().length > 0;
    }

    if ("content" in item) {
      return inlineContentHasText(item.content);
    }

    return false;
  });
}

function blockHasContent(block: PartialBlock | undefined): boolean {
  if (!block) {
    return false;
  }

  if (
    block.props &&
    "url" in block.props &&
    typeof block.props.url === "string" &&
    block.props.url.trim()
  ) {
    return true;
  }

  if (inlineContentHasText(block.content)) {
    return true;
  }

  if (
    block.content &&
    typeof block.content === "object" &&
    "rows" in block.content
  ) {
    return (
      Array.isArray(block.content.rows) &&
      block.content.rows.some(
        (row) =>
          Array.isArray(row.cells) &&
          row.cells.some((cell) => inlineContentHasText(cell)),
      )
    );
  }

  return (
    Array.isArray(block.children) &&
    block.children.some((child) => blockHasContent(child))
  );
}

function documentHasContent(blocks: PartialBlock[]) {
  return blocks.some((block) => blockHasContent(block));
}

function createDefaultDocument(title: string | undefined): PartialBlock[] {
  const normalizedTitle = title?.trim();

  if (!normalizedTitle) {
    return EMPTY_DOCUMENT;
  }

  return [
    {
      type: "heading" as const,
      props: { level: 1 },
      content: normalizedTitle,
    } as PartialBlock,
    { type: "paragraph" as const, content: "" },
  ];
}

function parseStoredDocument(
  value: string | null | undefined,
  title?: string,
): PartialBlock[] {
  if (!value?.trim()) {
    return createDefaultDocument(title);
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.length ? (parsed as PartialBlock[]) : EMPTY_DOCUMENT;
    }
  } catch {
    // Legacy support: fallback to paragraph blocks from plain text markdown.
  }

  const paragraphs = value
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(
      (segment) => ({
        type: "paragraph" as const,
        content: segment,
      }) as PartialBlock,
    );

  return paragraphs.length > 0 ? paragraphs : EMPTY_DOCUMENT;
}

function getEditorTheme(resolvedTheme: string | undefined) {
  return resolvedTheme === "dark" ? "dark" : "light";
}

export type ProjectRichTextProps = {
  disabled?: boolean;
  storageFormat?: "markdown" | "json";
  value: string | null | undefined;
  title?: string;
  className?: string;
  variant?: "default" | "workspace";
};

export function ProjectRichTextEditorBrowser({
  disabled = false,
  storageFormat = "markdown",
  value,
  title,
  onChange,
  className,
  variant = "default",
}: ProjectRichTextProps & {
  onChange: (value: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [initialContent] = useState(() => parseStoredDocument(value, title));
  const lastEmittedValueRef = useRef<string>("");
  const lastAppliedExternalValueRef = useRef<string>("");
  const editor = useCreateBlockNote(
    {
      initialContent,
    },
    [],
  );
  const theme = getEditorTheme(resolvedTheme);
  const floatingUIOptions = useMemo(
    () => ({
      elementProps: {
        style: {
          zIndex: 320,
        },
      },
      useFloatingOptions: {
        strategy: "fixed" as const,
      },
    }),
    [],
  );

  useEffect(() => {
    const incomingValue = value?.trim() ?? "";

    if (incomingValue === lastEmittedValueRef.current.trim()) {
      return;
    }

    if (incomingValue === lastAppliedExternalValueRef.current.trim()) {
      return;
    }

    let nextBlocks: PartialBlock[];

    if (!incomingValue) {
      nextBlocks = createDefaultDocument(title);
    } else {
      try {
        const parsed = JSON.parse(incomingValue);

        if (Array.isArray(parsed)) {
          nextBlocks = parsed.length ? (parsed as PartialBlock[]) : EMPTY_DOCUMENT;
        } else {
          const markdownBlocks = editor.tryParseMarkdownToBlocks(incomingValue);
          nextBlocks =
            markdownBlocks.length > 0
              ? (markdownBlocks as unknown as PartialBlock[])
              : createDefaultDocument(title);
        }
      } catch {
        const markdownBlocks = editor.tryParseMarkdownToBlocks(incomingValue);
        nextBlocks =
          markdownBlocks.length > 0
            ? (markdownBlocks as unknown as PartialBlock[])
            : createDefaultDocument(title);
      }
    }

    editor.replaceBlocks(editor.document, nextBlocks);
    lastAppliedExternalValueRef.current = incomingValue;
    if (storageFormat === "json") {
      const serialized = JSON.stringify(editor.document);
      lastEmittedValueRef.current = serialized;
      onChange(serialized);
    }
  }, [editor, title, value, storageFormat, onChange]);

  return (
    <div
      className={cn(
        "project-rich-text",
        variant === "workspace" && "flex h-full min-h-0 flex-col overflow-visible",
        className,
      )}
      data-layout={variant}
    >
      <MantineProvider
        forceColorScheme={theme}
        withCssVariables={false}
        theme={{
          components: {
            Popover: {
              defaultProps: {
                zIndex: 140,
              },
            },
            Menu: {
              defaultProps: {
                zIndex: 140,
              },
            },
            HoverCard: {
              defaultProps: {
                zIndex: 140,
              },
            },
          },
        }}
      >
        <BlockNoteView
          editor={editor}
          theme={theme}
          editable={!disabled}
          sideMenu={false}
          slashMenu={false}
          emojiPicker={false}
          formattingToolbar={!disabled}
          linkToolbar={!disabled}
          filePanel={!disabled}
          tableHandles={!disabled}
          onChange={(currentEditor) => {
            const nextValue =
              storageFormat === "json"
                ? JSON.stringify(currentEditor.document)
                : documentHasContent(currentEditor.document)
                  ? currentEditor.blocksToMarkdownLossy(currentEditor.document).trim()
                  : "";
            lastEmittedValueRef.current = nextValue;
            onChange(nextValue);
          }}
        >
          <SideMenuController floatingUIOptions={floatingUIOptions} />
          <SuggestionMenuController
            triggerCharacter="/"
            floatingUIOptions={floatingUIOptions}
          />
          <GridSuggestionMenuController
            triggerCharacter=":"
            columns={8}
            floatingUIOptions={floatingUIOptions}
          />
        </BlockNoteView>
      </MantineProvider>
    </div>
  );
}

export function ProjectRichTextViewerBrowser({
  value,
  emptyMessage = "No content added yet.",
  className,
  variant = "default",
}: ProjectRichTextProps & {
  emptyMessage?: string;
}) {
  const { resolvedTheme } = useTheme();
  const initialContent = useMemo(() => parseStoredDocument(value), [value]);
  const editor = useCreateBlockNote(
    {
      initialContent,
    },
    [initialContent],
  );
  const theme = getEditorTheme(resolvedTheme);

  useEffect(() => {
    if (!value?.trim()) return;
    try {
      if (Array.isArray(JSON.parse(value))) return;
    } catch {
      // Legacy Markdown is parsed by the editor, not displayed as plain text.
    }
    const blocks = editor.tryParseMarkdownToBlocks(value);
    editor.replaceBlocks(editor.document, blocks.length ? blocks : EMPTY_DOCUMENT);
  }, [editor, value]);

  if (!documentHasContent(initialContent)) {
    return <div className="text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div
      className={cn(
        "project-rich-text",
        variant === "workspace" && "flex h-full min-h-0 flex-col overflow-hidden",
        className,
      )}
      data-readonly="true"
      data-layout={variant}
    >
      <MantineProvider forceColorScheme={theme} withCssVariables={false}>
        <BlockNoteView
          editor={editor}
          theme={theme}
          editable={false}
          sideMenu={false}
          slashMenu={false}
          formattingToolbar={false}
          linkToolbar={false}
          filePanel={false}
          tableHandles={false}
          comments={false}
        />
      </MantineProvider>
    </div>
  );
}

import type { ContentDocument } from "./types";

export function documentValue(
  document: Pick<ContentDocument, "bodyJson" | "legacyMarkdown">,
) {
  return document.bodyJson.length
    ? JSON.stringify(document.bodyJson)
    : document.legacyMarkdown?.trim()
      ? document.legacyMarkdown
      : "[]";
}
export function parseDocumentValue(value: string): Record<string, unknown>[] {
  const blocks: unknown = JSON.parse(value);
  if (
    !Array.isArray(blocks) ||
    blocks.some(
      (block) =>
        !block || typeof block !== "object" || typeof block.type !== "string",
    )
  ) {
    throw new Error("The editor has not finished loading this document.");
  }
  return blocks;
}

/** This phase edits only the native document; hidden legacy metadata is retained. */
export function documentSaveInput(document: ContentDocument, value: string) {
  return {
    revision: document.revision,
    summary: document.summary,
    bodyJson: parseDocumentValue(value),
    accessLevel: "free" as const,
    resources: document.resources,
    action: "save" as const,
  };
}

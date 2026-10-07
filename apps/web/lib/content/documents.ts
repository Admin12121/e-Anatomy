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
    accessLevel: document.accessLevel,
    resources: document.resources,
    action: "save" as const,
  };
}

export class DocumentSaveError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "DocumentSaveError";
  }
}

export async function readDocumentSaveResponse(
  response: Response,
): Promise<ContentDocument> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DocumentSaveError(
      "The content save service returned an invalid response. Your edits are still in the editor; please try again after the service is available.",
      response.status,
    );
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : null;
    const message =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "Unable to save article.";
    throw new DocumentSaveError(message, response.status);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("revision" in payload) ||
    typeof payload.revision !== "number" ||
    !("bodyJson" in payload) ||
    !Array.isArray(payload.bodyJson)
  ) {
    throw new DocumentSaveError(
      "The content save service returned an invalid document.",
      response.status,
    );
  }
  return payload as ContentDocument;
}

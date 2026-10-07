import { parseDocumentValue } from "./documents";

export type EditorDraft = {
  version: 1;
  revision: number;
  body: string;
};

export function editorDraftKey(familyId: string, target: string) {
  return `anatomy:content-draft:v1:${encodeURIComponent(familyId)}:${encodeURIComponent(target)}`;
}

export function parseEditorDraft(value: string | null): EditorDraft | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("revision" in parsed) ||
      typeof parsed.revision !== "number" ||
      !Number.isInteger(parsed.revision) ||
      parsed.revision < 0 ||
      !("body" in parsed) ||
      typeof parsed.body !== "string"
    ) return null;
    parseDocumentValue(parsed.body);
    return parsed as EditorDraft;
  } catch {
    return null;
  }
}

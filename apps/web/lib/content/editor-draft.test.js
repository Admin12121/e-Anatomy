import { describe, expect, test } from "bun:test";
import { editorDraftKey, parseEditorDraft } from "./editor-draft";

describe("article draft recovery", () => {
  test("keeps drafts scoped to each family and label", () => {
    expect(editorDraftKey("family", "modality")).not.toBe(
      editorDraftKey("family", "labels/one"),
    );
    expect(editorDraftKey("family", "labels/one")).not.toBe(
      editorDraftKey("other", "labels/one"),
    );
  });
  test("accepts native block drafts and rejects malformed storage", () => {
    const draft = {
      version: 1,
      revision: 3,
      body: JSON.stringify([{ type: "paragraph", content: "Keep me" }]),
    };
    expect(parseEditorDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parseEditorDraft(null)).toBeNull();
    expect(parseEditorDraft("not json")).toBeNull();
    expect(parseEditorDraft(JSON.stringify({ ...draft, body: "markdown" }))).toBeNull();
  });
});

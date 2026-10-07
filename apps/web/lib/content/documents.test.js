import { describe, expect, test } from "bun:test";
import {
  documentValue,
  parseDocumentValue,
  documentSaveInput,
  DocumentSaveError,
  readDocumentSaveResponse,
} from "./documents";

describe("editorial documents", () => {
  test("normalizes blank legacy content so a new native editor initializes", () => {
    expect(documentValue({ bodyJson: [], legacyMarkdown: "" })).toBe("[]");
    expect(documentValue({ bodyJson: [], legacyMarkdown: "  \n" })).toBe("[]");
  });
  test("keeps media, styles and nested blocks in the canonical document", () => {
    const body = [
      {
        type: "heading",
        content: [{ type: "text", text: "Brain", styles: { bold: true } }],
        children: [{ type: "image", props: { url: "/image.png" } }],
      },
    ];
    expect(
      parseDocumentValue(
        documentValue({ bodyJson: body, legacyMarkdown: "old" }),
      ),
    ).toEqual(body);
  });
  test("retains legacy Markdown until the editor converts it", () => {
    expect(
      documentValue({
        bodyJson: [],
        legacyMarkdown: "## Legacy\n\nDescription",
      }),
    ).toBe("## Legacy\n\nDescription");
    expect(() => parseDocumentValue("## Legacy")).toThrow();
    expect(() => parseDocumentValue('{"type":"paragraph"}')).toThrow();
  });
  test("body-only saves retain existing metadata, revision and access level", () => {
    const original = {
      id: "article",
      summary: "Existing summary",
      resources: [
        {
          kind: "image",
          title: "Existing image",
          url: "/image.png",
          caption: "Keep this",
        },
      ],
      bodyJson: [],
      legacyMarkdown: null,
      accessLevel: "subscription",
      revision: 7,
      publishedRevision: 6,
      publishedAt: "2026-10-01T00:00:00Z",
    };
    const body = [{ type: "paragraph", content: "Updated document" }];
    const input = documentSaveInput(original, JSON.stringify(body));
    expect(input).toEqual({
      revision: 7,
      summary: original.summary,
      resources: original.resources,
      bodyJson: body,
      accessLevel: "subscription",
      action: "save",
    });
    expect(original.accessLevel).toBe("subscription");
    expect(original.publishedRevision).toBe(6);
  });
  test("saving needs no publication option", () => {
    const document = { revision: 1, summary: "", resources: [], accessLevel: "free" };
    expect(documentSaveInput(document, "[]").action).toBe("save");
    expect(() => documentSaveInput(document, "not json")).toThrow();
  });
  test("shows a useful error when a missing route returns HTML", async () => {
    const response = new Response("<!DOCTYPE html><html></html>", {
      status: 404,
      headers: { "content-type": "text/html" },
    });
    expect(readDocumentSaveResponse(response)).rejects.toThrow(
      "Your edits are still in the editor",
    );
  });
  test("preserves structured save errors and accepts a saved revision", async () => {
    const denied = new Response(
      JSON.stringify({ error: { message: "Content editing is not permitted." } }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
    expect(readDocumentSaveResponse(denied)).rejects.toThrow(
      "Content editing is not permitted.",
    );
    const saved = { revision: 1, bodyJson: [], summary: "" };
    expect(
      await readDocumentSaveResponse(
        new Response(JSON.stringify(saved), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ).toEqual(saved);
  });
  test("exposes revision conflicts for draft recovery", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "Another editor saved this article." } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
    await expect(readDocumentSaveResponse(response)).rejects.toMatchObject({
      message: "Another editor saved this article.",
      status: 409,
      name: "DocumentSaveError",
    });
    expect(DocumentSaveError).toBeDefined();
  });
});

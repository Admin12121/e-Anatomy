import { describe, expect, test } from "bun:test";
import { imageLibraryApiPath, isLibraryBusy, readLibraryResponse } from "./types";

describe("image library workflow", () => {
  test("only pending conversion states need polling", () => {
    for (const status of ["queued", "processing", "encoding", "editable", "ready", "failed"]) {
      expect(isLibraryBusy({ status })).toBe(["queued", "processing", "encoding"].includes(status));
    }
  });
  test("root API route has no trailing slash", () => {
    expect(imageLibraryApiPath()).toBe("/image-library");
    expect(imageLibraryApiPath(["study", "png"])).toBe("/image-library/study/png");
  });
  test("readable service errors replace HTML JSON-parser errors", async () => {
    await expect(readLibraryResponse(new Response("<!DOCTYPE html>", { status: 502 }))).rejects.toThrow("invalid response");
    await expect(readLibraryResponse(new Response(JSON.stringify({ error: { message: "Study revision changed" } }), { status: 409 }))).rejects.toThrow("Study revision changed");
  });
  test("accepted imports return their job state", async () => {
    const study = { id: "study", status: "queued", revision: 1 };
    expect(await readLibraryResponse(new Response(JSON.stringify(study), { status: 202 }))).toEqual(study);
  });
});

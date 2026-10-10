import { describe, expect, test } from "bun:test";

import {
  isBundledNonDicomEntry,
  keepDicomFiles,
} from "./modality-upload-shared.ts";

function dicomFile(name) {
  const bytes = new Uint8Array(140);
  bytes.set([0x44, 0x49, 0x43, 0x4d], 128);
  return new File([bytes], name);
}

describe("isBundledNonDicomEntry", () => {
  test("keeps UID-named and extension-less slices", () => {
    for (const name of [
      "DICOM/IM0001",
      "1.3.12.2.1107.5.2.43.66012.2020",
      "MR.1.2.840.113619.2.55",
      "I.001",
      "study/IMG0001.dcm",
    ]) {
      expect(isBundledNonDicomEntry(name)).toBe(false);
    }
  });

  test("skips viewers, documents and OS metadata", () => {
    for (const name of [
      "README.TXT",
      "Viewer/viewer.exe",
      "__MACOSX/DICOM/._IM0001",
      ".DS_Store",
      "Thumbs.db",
    ]) {
      expect(isBundledNonDicomEntry(name)).toBe(true);
    }
  });
});

describe("keepDicomFiles", () => {
  test("keeps DICOM by content whatever the file is called", async () => {
    const kept = await keepDicomFiles([
      dicomFile("1.3.12.2.1107.5.2.43"),
      dicomFile("IM0002"),
      new File(["notes"], "README.TXT"),
      new File([new Uint8Array(200)], "DICOMDIR.bak"),
    ]);

    expect(kept.files.map((file) => file.name)).toEqual([
      "1.3.12.2.1107.5.2.43",
      "IM0002",
    ]);
    expect(kept.skipped).toBe(2);
  });
});

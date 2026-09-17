import { describe, expect, test } from "bun:test";

import {
  buildStructureSearchHits,
  filterVisibleAnnotations,
} from "./annotation-visibility.ts";

function createStructure(overrides) {
  return {
    id: "structure-a",
    groupId: "group-a",
    slug: "structure-a",
    title: "Hepatic artery",
    colorHex: "#ef476f",
    latinName: "Arteria hepatica",
    shortDescription: "Artery of the liver",
    longDescription: null,
    synonyms: ["liver artery"],
    learningPoints: [],
    accessLevel: "free",
    isPinnedDefault: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createAnnotation(overrides) {
  return {
    id: "annotation-a",
    assetId: "slice-a",
    structureId: "structure-a",
    ...overrides,
  };
}

describe("viewer structure search", () => {
  test("matches normalized structure metadata and resolves the first related asset", () => {
    const hepatic = createStructure({ id: "hepatic" });
    const renal = createStructure({
      id: "renal",
      title: "Renal cortex",
      latinName: null,
      shortDescription: "Kidney outer layer",
      synonyms: [],
    });
    const renalAnnotation = createAnnotation({
      id: "renal-annotation",
      assetId: "slice-b",
      structureId: renal.id,
    });
    const hepaticAnnotation = createAnnotation({
      id: "hepatic-annotation",
      assetId: "slice-a",
      structureId: hepatic.id,
    });
    const sliceA = { id: "slice-a" };
    const sliceB = { id: "slice-b" };

    const hits = buildStructureSearchHits({
      annotations: [renalAnnotation, hepaticAnnotation],
      assetsById: new Map([
        [sliceA.id, sliceA],
        [sliceB.id, sliceB],
      ]),
      query: "  LIVER ARTERY ",
      structures: [renal, hepatic],
    });

    expect(hits).toEqual([{ asset: sliceA, structure: hepatic }]);
  });

  test("returns no search hits for an empty query", () => {
    expect(
      buildStructureSearchHits({
        annotations: [],
        assetsById: new Map(),
        query: "   ",
        structures: [createStructure({})],
      }),
    ).toEqual([]);
  });
});

describe("viewer annotation visibility", () => {
  test("keeps only annotations allowed by group, target, and search filters", () => {
    const visible = createStructure({ id: "visible", groupId: "group-a" });
    const hiddenGroup = createStructure({
      id: "hidden-group",
      groupId: "group-b",
    });
    const wrongTarget = createStructure({
      id: "wrong-target",
      groupId: "group-a",
    });
    const annotations = [
      createAnnotation({ id: "visible-annotation", structureId: visible.id }),
      createAnnotation({ id: "hidden-annotation", structureId: hiddenGroup.id }),
      createAnnotation({ id: "wrong-target-annotation", structureId: wrongTarget.id }),
      createAnnotation({ id: "orphan", structureId: "missing" }),
    ];

    const result = filterVisibleAnnotations({
      annotations,
      query: "hepatic",
      selectedStructureId: visible.id,
      structuresById: new Map([
        [visible.id, visible],
        [hiddenGroup.id, hiddenGroup],
        [wrongTarget.id, wrongTarget],
      ]),
      targetedLabeling: true,
      visibleGroupIds: ["group-a"],
    });

    expect(result.map((annotation) => annotation.id)).toEqual([
      "visible-annotation",
    ]);
  });

  test("allows ungrouped annotations when no search or target filter is active", () => {
    const ungrouped = createStructure({ id: "ungrouped", groupId: null });
    const annotation = createAnnotation({ structureId: ungrouped.id });

    expect(
      filterVisibleAnnotations({
        annotations: [annotation],
        query: "",
        selectedStructureId: null,
        structuresById: new Map([[ungrouped.id, ungrouped]]),
        targetedLabeling: false,
        visibleGroupIds: [],
      }),
    ).toEqual([annotation]);
  });
});

import { describe, expect, test } from "bun:test"

import { buildContentCatalog, findContentBySlug } from "@/lib/content/catalog"

function family(id, variants) {
  return {
    id,
    modalityType: "mri",
    name: `Family ${id}`,
    notes: null,
    readyVariantCount: variants.filter(
      (variant) => variant.processingStatus === "ready",
    ).length,
    thumbnailUrl: null,
    totalVariantCount: variants.length,
    variants,
  }
}

function variant(id, slug, updatedAt) {
  return {
    coverImageUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    familyId: "family",
    id,
    ingestStatus: null,
    ingestSummaryJson: null,
    modalityType: "mri",
    name: id,
    notes: null,
    processingStatus: "ready",
    slug,
    sourceFileCount: 1,
    sourceKind: "manual",
    sourceLabel: null,
    updatedAt,
    weightingCode: null,
  }
}

const zone = {
  anchor: { x: 0, y: 0, z: 0 },
  bodyView: "front",
  id: "zone-1",
  name: "Head",
  slug: "head",
}

describe("content catalog", () => {
  test("canonical URLs take priority over another family's variant alias", () => {
    const items = buildContentCatalog([
      {
        families: [
          {
            ...family("alias-owner", [
              variant("alias", "brain", "2026-02-01T00:00:00.000Z"),
            ]),
            slug: "another-topic",
          },
          {
            ...family("brain", [
              variant("brain-primary", "brain-t1", "2026-01-01T00:00:00.000Z"),
            ]),
            slug: "brain",
          },
        ],
        zone,
      },
    ])
    expect(findContentBySlug(items, "brain")?.id).toBe("brain")
  })

  test("fallback primary matches the API: ready, oldest creation, then identifier", () => {
    const items = buildContentCatalog([
      {
        families: [
          family("brain", [
            {
              ...variant("a-pending", "pending", "2026-02-01T00:00:00.000Z"),
              processingStatus: "processing",
            },
            {
              ...variant("b-new", "new", "2026-02-01T00:00:00.000Z"),
              createdAt: "2026-02-01T00:00:00.000Z",
            },
            variant("z-original", "original", "2026-02-01T00:00:00.000Z"),
          ]),
        ],
        zone,
      },
    ])
    expect(items[0].viewerSlug).toBe("original")
  })

  test("keeps the family URL and explicit primary variant stable", () => {
    const brain = {
      ...family("brain", [
        variant("brain-t1", "brain-t1", "2026-01-02T00:00:00.000Z"),
        variant("brain-t2", "brain-t2", "2026-01-03T00:00:00.000Z"),
      ]),
      slug: "brain",
      primaryModalityId: "brain-t2",
    }
    const items = buildContentCatalog([{ families: [brain], zone }])
    expect(items[0].primarySlug).toBe("brain")
    expect(items[0].primaryModalityId).toBe("brain-t2")
    expect(items[0].viewerSlug).toBe("brain-t2")
    expect(findContentBySlug(items, "brain")?.id).toBe("brain")
    expect(findContentBySlug(items, "brain-t1")?.id).toBe("brain")
  })

  test("builds content rows from modality families and sorts by latest update", () => {
    const older = family("older", [
      variant("older-t1", "brain-mri-t1", "2026-01-02T00:00:00.000Z"),
    ])
    const newer = family("newer", [
      variant("newer-t1", "brain-mri-t2", "2026-01-03T00:00:00.000Z"),
      variant("newer-t2", "brain-mri-flair", "2026-01-04T00:00:00.000Z"),
    ])

    const result = buildContentCatalog([
      { families: [older, family("empty", []), newer], zone },
    ])

    expect(result.map((item) => item.id)).toEqual(["newer", "older"])
    expect(result[0]).toMatchObject({
      latestUpdatedAt: "2026-01-04T00:00:00.000Z",
      primaryModalityId: "newer-t1",
      primarySlug: "brain-mri-t2",
      zoneId: "zone-1",
      zoneName: "Head",
      zoneSlug: "head",
    })
  })

  test("finds a content family from any of its variant slugs", () => {
    const items = buildContentCatalog([
      {
        families: [
          family("brain", [
            variant("brain-t1", "brain-t1", "2026-01-02T00:00:00.000Z"),
            variant("brain-t2", "brain-t2", "2026-01-03T00:00:00.000Z"),
          ]),
        ],
        zone,
      },
    ])

    expect(findContentBySlug(items, "brain-t2")?.id).toBe("brain")
    expect(findContentBySlug(items, "missing")).toBeNull()
  })
})

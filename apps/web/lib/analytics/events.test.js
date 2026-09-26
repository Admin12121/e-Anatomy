import { expect, test } from "bun:test"

import {
  createContentEngagedProperties,
  isPublicAnalyticsPath,
} from "@/lib/analytics/events"
import { normalizeAnalyticsReferrer } from "@/lib/analytics/client"

test("keeps content and selected structure identifiers separate", () => {
  expect(
    createContentEngagedProperties({
      contentId: "family-1",
      durationSeconds: 30,
      modalityId: "modality-1",
      structureId: "structure-1",
      zoneId: "zone-1",
    }),
  ).toEqual({
    contentId: "family-1",
    durationSeconds: 30,
    modalityId: "modality-1",
    structureId: "structure-1",
    threshold: "30_seconds",
    zoneId: "zone-1",
  })
})

test("excludes authenticated administration paths from visitor analytics", () => {
  expect(isPublicAnalyticsPath("/")).toBe(true)
  expect(isPublicAnalyticsPath("/head/brain-mri")).toBe(true)
  expect(isPublicAnalyticsPath("/dashboard")).toBe(false)
  expect(isPublicAnalyticsPath("/content/brain-mri")).toBe(false)
  expect(isPublicAnalyticsPath("/analytics/events")).toBe(false)
  expect(isPublicAnalyticsPath("/login")).toBe(false)
})

test("keeps external referrers and ignores internal navigation", () => {
  expect(
    normalizeAnalyticsReferrer(
      "https://example.com/article?campaign=private#section",
      "https://anatomy.test",
    ),
  ).toBe("https://example.com/article")
  expect(
    normalizeAnalyticsReferrer(
      "https://anatomy.test/head/brain-mri",
      "https://anatomy.test",
    ),
  ).toBeNull()
})

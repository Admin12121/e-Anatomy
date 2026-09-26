import { describe, expect, test } from "bun:test"

import {
  buildAnalyticsUrl,
  formatMetricComparison,
  resolveRouteTab,
} from "@/lib/analytics/presentation"

describe("formatMetricComparison", () => {
  test("describes an unchanged metric", () => {
    expect(formatMetricComparison(4, 4)).toEqual({
      label: "No change",
      tone: "neutral",
    })
  })

  test("describes a new metric when the previous period was empty", () => {
    expect(formatMetricComparison(3, 0)).toEqual({
      label: "3 new this period",
      tone: "positive",
    })
  })

  test("calculates positive and negative percentage changes", () => {
    expect(formatMetricComparison(15, 10)).toEqual({
      label: "+50% vs previous",
      tone: "positive",
    })
    expect(formatMetricComparison(5, 10)).toEqual({
      label: "-50% vs previous",
      tone: "negative",
    })
  })
})

describe("buildAnalyticsUrl", () => {
  test("keeps the active analytics section while updating filters", () => {
    expect(
      buildAnalyticsUrl("/analytics/audience", "days=30&page=2", {
        days: "7",
      }),
    ).toBe("/analytics/audience?days=7")
  })

  test("removes default filters from the URL", () => {
    expect(
      buildAnalyticsUrl("/analytics/events", "days=7&event=page_view", {
        event: "all",
      }),
    ).toBe("/analytics/events?days=7")
  })
})

describe("resolveRouteTab", () => {
  const tabs = ["overview", "sessions", "security", "activity"]

  test("keeps an allowed route tab", () => {
    expect(resolveRouteTab("security", tabs, "overview")).toBe("security")
  })

  test("falls back for missing, repeated, or unknown route tabs", () => {
    expect(resolveRouteTab(undefined, tabs, "overview")).toBe("overview")
    expect(resolveRouteTab(["activity", "security"], tabs, "overview")).toBe(
      "overview",
    )
    expect(resolveRouteTab("unknown", tabs, "overview")).toBe("overview")
  })
})

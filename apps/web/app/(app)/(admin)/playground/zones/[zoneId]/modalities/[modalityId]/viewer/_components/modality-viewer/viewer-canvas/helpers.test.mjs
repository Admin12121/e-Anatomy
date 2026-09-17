import { describe, expect, test } from "bun:test";

import * as helpers from "./helpers.ts";

const { calculateViewerLayout, resolveViewerImageDimensions } = helpers;

describe("resolveViewerImageDimensions", () => {
  test("skips invalid stored dimensions and uses the first complete valid pair", () => {
    const resolved = resolveViewerImageDimensions([
      { height: 900, width: 0 },
      { height: null, width: 1600 },
      { height: 720, width: 1280 },
      { height: 600, width: 800 },
    ]);

    expect(resolved).toEqual({ height: 720, width: 1280 });
  });
});

describe("calculateViewerLayout", () => {
  test("fits a landscape image inside a center viewport with label gutters", () => {
    const layout = calculateViewerLayout({
      imageHeight: 900,
      imageWidth: 1600,
      reserveLabelSpace: true,
      rotationQuarterTurns: 0,
      stageHeight: 800,
      stageWidth: 1200,
    });

    expect(layout.stagePadding).toBeCloseTo(28);
    expect(layout.labelGutter).toBeCloseTo(210);
    expect(layout.surfaceWidth).toBeCloseTo(724);
    expect(layout.surfaceHeight).toBeCloseTo(407.25);
    expect(layout.boundsWidth).toBeCloseTo(724);
    expect(layout.boundsHeight).toBeCloseTo(407.25);
    expect(layout.coordinateWidth).toBeCloseTo(1777.7778);
    expect(layout.coordinateHeight).toBe(1000);
  });

  test("swaps the fitted bounds for a quarter-turn rotation without distorting the surface", () => {
    const layout = calculateViewerLayout({
      imageHeight: 900,
      imageWidth: 1600,
      reserveLabelSpace: true,
      rotationQuarterTurns: 1,
      stageHeight: 800,
      stageWidth: 1200,
    });

    expect(layout.surfaceWidth).toBeCloseTo(744);
    expect(layout.surfaceHeight).toBeCloseTo(418.5);
    expect(layout.boundsWidth).toBeCloseTo(418.5);
    expect(layout.boundsHeight).toBeCloseTo(744);
  });

  test("reduces label text and box width on a narrow viewer stage", () => {
    const layout = calculateViewerLayout({
      imageHeight: 900,
      imageWidth: 1600,
      reserveLabelSpace: true,
      rotationQuarterTurns: 0,
      stageHeight: 720,
      stageWidth: 480,
    });

    expect(layout.labelScale).toBeCloseTo(0.65);
    expect(layout.fontSize).toBeCloseTo(11.7);
    expect(layout.labelBoxMaxWidth).toBeCloseTo(88.8);
  });

  test("keeps the normal responsive label width when side gutters are not reserved", () => {
    const layout = calculateViewerLayout({
      imageHeight: 900,
      imageWidth: 1600,
      reserveLabelSpace: false,
      rotationQuarterTurns: 0,
      stageHeight: 800,
      stageWidth: 1200,
    });

    expect(layout.labelGutter).toBe(0);
    expect(layout.labelBoxMaxWidth).toBeCloseTo(180);
  });
});

describe("getAnnotationFocusOpacity", () => {
  test("dims only annotations unrelated to the active hover", () => {
    const getOpacity = helpers.getAnnotationFocusOpacity;

    expect([
      getOpacity?.({ annotationId: "hovered", hoveredId: "hovered", selectedId: null }),
      getOpacity?.({ annotationId: "other", hoveredId: "hovered", selectedId: null }),
      getOpacity?.({ annotationId: "selected", hoveredId: "hovered", selectedId: "selected" }),
      getOpacity?.({ annotationId: "other", hoveredId: null, selectedId: null }),
    ]).toEqual([1, 0.28, 1, 1]);
  });
});

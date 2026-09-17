import { describe, expect, test } from "bun:test";

import {
  areAnnotationFormsEqual,
  areAnnotationPointsEqual,
  buildAnnotationFormState,
  moveAnnotationPolygonPoint,
  replaceAnnotationPolygon,
} from "./annotation-form.ts";

describe("buildAnnotationFormState", () => {
  test("uses the current viewer defaults when no annotation is selected", () => {
    expect(
      buildAnnotationFormState({
        annotation: null,
        fallbackColor: "#123456",
      }),
    ).toEqual({
      anchorX: 0.5,
      anchorY: 0.5,
      colorHex: "#123456",
      labelX: 0.65,
      labelY: 0.35,
      leaderColorHex: "#123456",
      overlayColorHex: "#123456",
      overlayOpacity: 0.55,
      polygonPoints: [],
    });
  });

  test("keeps annotation geometry and falls back only for invalid colors", () => {
    const polygonPoints = [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
      { x: 0.5, y: 0.6 },
    ];

    const form = buildAnnotationFormState({
      annotation: {
        anchorX: 0.2,
        anchorY: 0.3,
        colorHex: "#ABCDEF",
        labelX: 0.7,
        labelY: 0.8,
        leaderColorHex: "invalid",
        overlayColorHex: "#112233",
        overlayOpacity: 0.42,
        polygonPoints,
      },
      fallbackColor: "#123456",
    });

    expect(form).toEqual({
      anchorX: 0.2,
      anchorY: 0.3,
      colorHex: "#ABCDEF",
      labelX: 0.7,
      labelY: 0.8,
      leaderColorHex: "#ABCDEF",
      overlayColorHex: "#112233",
      overlayOpacity: 0.42,
      polygonPoints,
    });
  });
});

describe("annotation draft equality", () => {
  test("treats sub-epsilon coordinate changes and color casing as equal", () => {
    const baseline = buildAnnotationFormState({
      annotation: null,
      fallbackColor: "#abcdef",
    });
    const nearby = {
      ...baseline,
      anchorX: baseline.anchorX + 0.0004,
      colorHex: "#ABCDEF",
      polygonPoints: [{ x: 0.2, y: 0.3 }],
    };
    const matching = {
      ...baseline,
      polygonPoints: [{ x: 0.2004, y: 0.3004 }],
    };

    expect(areAnnotationFormsEqual(nearby, matching)).toBe(true);
    expect(
      areAnnotationPointsEqual(nearby.polygonPoints, matching.polygonPoints),
    ).toBe(true);
  });

  test("detects meaningful geometry changes", () => {
    const baseline = buildAnnotationFormState({
      annotation: null,
      fallbackColor: "#abcdef",
    });

    expect(
      areAnnotationFormsEqual(baseline, {
        ...baseline,
        labelY: baseline.labelY + 0.001,
      }),
    ).toBe(false);
    expect(
      areAnnotationPointsEqual([{ x: 0.2, y: 0.3 }], [
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.5 },
      ]),
    ).toBe(false);
  });
});

describe("annotation polygon editing", () => {
  test("moves only the requested polygon point and ignores invalid indexes", () => {
    const form = {
      ...buildAnnotationFormState({
        annotation: null,
        fallbackColor: "#abcdef",
      }),
      polygonPoints: [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
    };

    const moved = moveAnnotationPolygonPoint(form, 1, { x: 0.8, y: 0.9 });

    expect(moved).toEqual({
      ...form,
      polygonPoints: [
        { x: 0.1, y: 0.2 },
        { x: 0.8, y: 0.9 },
      ],
    });
    expect(moveAnnotationPolygonPoint(form, 3, { x: 0.8, y: 0.9 })).toBe(
      form,
    );
  });

  test("centers a new completed polygon while preserving existing label geometry", () => {
    const form = {
      ...buildAnnotationFormState({
        annotation: null,
        fallbackColor: "#abcdef",
      }),
      anchorX: 0.1,
      anchorY: 0.2,
      labelX: 0.3,
      labelY: 0.4,
    };
    const points = [
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 },
    ];

    expect(replaceAnnotationPolygon(form, points, false)).toEqual({
      ...form,
      anchorX: 0.5,
      anchorY: 0.5,
      labelX: 0.74,
      labelY: 0.5,
      polygonPoints: points,
    });
    expect(replaceAnnotationPolygon(form, points, true)).toEqual({
      ...form,
      polygonPoints: points,
    });
  });
});

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

describe("annotation hover intent", () => {
  test("ignores touch entry without blocking a real mouse hover", () => {
    const createHoverIntent = helpers.createAnnotationHoverIntent;

    expect(createHoverIntent).toBeFunction();
    if (!createHoverIntent) return;

    let now = 0;
    let nextHandle = 1;
    const tasks = new Map();
    const changes = [];
    const advanceBy = (duration) => {
      now += duration;

      while (true) {
        const due = [...tasks.entries()]
          .filter(([, task]) => task.at <= now)
          .sort((left, right) => left[1].at - right[1].at)[0];

        if (!due) break;
        tasks.delete(due[0]);
        due[1].callback();
      }
    };
    const hoverIntent = createHoverIntent({
      bridgeMs: 100,
      dwellMs: 350,
      onChange: (annotationId) => changes.push(annotationId),
      cancel: (handle) => tasks.delete(handle),
      schedule: (callback, delay) => {
        const handle = nextHandle++;
        tasks.set(handle, { at: now + delay, callback });
        return handle;
      },
    });

    hoverIntent.enter("touch-label", "touch");
    advanceBy(350);
    expect(changes).toEqual([]);

    hoverIntent.enter("mouse-label", "mouse");
    advanceBy(350);
    expect(changes).toEqual(["mouse-label"]);
  });

  test("shows only a settled label and cancels transient hover targets", () => {
    const createHoverIntent = helpers.createAnnotationHoverIntent;

    expect(createHoverIntent).toBeFunction();
    if (!createHoverIntent) return;

    let now = 0;
    let nextHandle = 1;
    const tasks = new Map();
    const changes = [];
    const advanceBy = (duration) => {
      now += duration;

      while (true) {
        const due = [...tasks.entries()]
          .filter(([, task]) => task.at <= now)
          .sort((left, right) => left[1].at - right[1].at)[0];

        if (!due) break;
        tasks.delete(due[0]);
        due[1].callback();
      }
    };
    const hoverIntent = createHoverIntent({
      bridgeMs: 100,
      dwellMs: 350,
      onChange: (annotationId) => changes.push(annotationId),
      cancel: (handle) => tasks.delete(handle),
      schedule: (callback, delay) => {
        const handle = nextHandle++;
        tasks.set(handle, { at: now + delay, callback });
        return handle;
      },
    });

    hoverIntent.enter("label-a");
    advanceBy(200);
    hoverIntent.enter("label-b");
    advanceBy(349);
    expect(changes).toEqual([]);

    advanceBy(1);
    expect(changes).toEqual(["label-b"]);

    hoverIntent.leave();
    advanceBy(99);
    hoverIntent.enter("label-b");
    advanceBy(1);
    expect(changes).toEqual(["label-b"]);

    hoverIntent.leave();
    advanceBy(100);
    expect(changes).toEqual(["label-b", null]);
  });
});

describe("annotation interaction routing", () => {
  test("identifies annotation UI without treating the surrounding viewport as annotation UI", () => {
    const isAnnotationInteractionTarget =
      helpers.isViewerAnnotationInteractionTarget;

    expect(isAnnotationInteractionTarget).toBeFunction();
    if (!isAnnotationInteractionTarget) return;

    const annotationTarget = {
      closest: (selector) =>
        selector === "[data-viewer-annotation-interaction]"
          ? { dataset: { viewerAnnotationInteraction: "" } }
          : null,
    };
    const viewportTarget = { closest: () => null };

    expect(isAnnotationInteractionTarget(annotationTarget)).toBe(true);
    expect(isAnnotationInteractionTarget(viewportTarget)).toBe(false);
    expect(isAnnotationInteractionTarget(null)).toBe(false);
  });

  test("opens the correct details surface for each viewer mode", () => {
    const resolveDetailsSurface = helpers.resolveAnnotationDetailsSurface;

    expect(resolveDetailsSurface).toBeFunction();
    if (!resolveDetailsSurface) return;

    expect(
      resolveDetailsSurface({ isMprViewer: true, readOnly: true }),
    ).toBe("mpr-drawer");
    expect(
      resolveDetailsSurface({ isMprViewer: false, readOnly: true }),
    ).toBe("study-panel");
    expect(
      resolveDetailsSurface({ isMprViewer: false, readOnly: false }),
    ).toBe("study-panel");
    expect(
      resolveDetailsSurface({ isMprViewer: true, readOnly: false }),
    ).toBeNull();
  });
});

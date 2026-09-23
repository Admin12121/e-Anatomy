import { describe, expect, test } from "bun:test";

import {
  findRegionInteriorAnchor,
  layoutAnnotationLabels,
} from "./annotation-layout.ts";

describe("annotation rail layout", () => {
  test("places automatic labels on the side of their image anchor", () => {
    const labels = layoutAnnotationLabels(
      [
        { anchorX: 210, anchorY: 300, color: "#fff", id: "left", label: "Left" },
        { anchorX: 790, anchorY: 300, color: "#fff", id: "right", label: "Right" },
      ],
      1000,
      700,
    );
    const byId = new Map(labels.map((label) => [label.id, label]));

    expect(byId.get("left")?.sideResolved).toBe("left");
    expect(byId.get("right")?.sideResolved).toBe("right");
  });

  test("keeps dense label rails collision free and within the viewport", () => {
    const labels = layoutAnnotationLabels(
      Array.from({ length: 100 }, (_, index) => ({
        anchorX: index % 2 === 0 ? 260 : 940,
        anchorY: 80 + (index % 45) * 12,
        color: "#fff",
        id: `label-${index}`,
        label: `Structure ${index}`,
        priority: index,
      })),
      1200,
      760,
    );

    for (const side of ["left", "right"]) {
      const rail = labels
        .filter((label) => label.sideResolved === side)
        .sort((left, right) => left.y - right.y);

      for (let index = 1; index < rail.length; index += 1) {
        expect(rail[index].y).toBeGreaterThanOrEqual(
          rail[index - 1].y + rail[index - 1].height,
        );
      }

      expect(rail.every((label) => label.y >= 64)).toBe(true);
      expect(rail.every((label) => label.y + label.height <= 754)).toBe(true);
    }
  });
});

describe("region label anchor", () => {
  test("derives a stable point inside the final area instead of using a drawing endpoint", () => {
    const polygon = [
      { x: 0.1, y: 0.1 },
      { x: 0.42, y: 0.1 },
      { x: 0.42, y: 0.42 },
      { x: 0.1, y: 0.42 },
    ];
    const anchor = findRegionInteriorAnchor(polygon);

    expect(anchor.x).toBeGreaterThan(0.1);
    expect(anchor.x).toBeLessThan(0.42);
    expect(anchor.y).toBeGreaterThan(0.1);
    expect(anchor.y).toBeLessThan(0.42);
    expect(anchor).not.toEqual(polygon[0]);
  });
});

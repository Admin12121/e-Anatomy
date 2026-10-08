import { describe, expect, test } from "bun:test";

import {
  findRegionInteriorAnchor,
  layoutAnnotationLabels,
  wrapLabelText,
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

describe("label auto sizing", () => {
  const anchors = (count, label = "Structure") =>
    Array.from({ length: count }, (_, index) => ({
      anchorX: 300,
      anchorY: 120 + index * 4,
      color: "#fff",
      id: `label-${index}`,
      label: `${label} ${index}`,
    }));

  test("few labels get the largest font and spread out", () => {
    const labels = layoutAnnotationLabels(anchors(3), 1200, 800);
    expect(labels.every((label) => label.fontSize === 20)).toBe(true);
    const ys = labels.map((label) => label.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThan(30);
  });

  test("many labels shrink toward the minimum font", () => {
    const few = layoutAnnotationLabels(anchors(3), 1200, 800);
    const many = layoutAnnotationLabels(anchors(30), 1200, 800);
    expect(many[0].fontSize).toBeLessThan(few[0].fontSize);
    expect(many[0].fontSize).toBeGreaterThanOrEqual(12);
  });

  test("long names wrap to at most two lines within the rail", () => {
    const [label] = layoutAnnotationLabels(
      [
        {
          anchorX: 300,
          anchorY: 300,
          color: "#fff",
          id: "long",
          label: "Superior mesenteric artery and inferior pancreaticoduodenal branch",
        },
      ],
      900,
      700,
    );
    expect(label.lines.length).toBeLessThanOrEqual(2);
    expect(label.lines.length).toBe(2);
    expect(label.height).toBe(label.lines.length * label.lineHeight);
  });

  test("wrapLabelText ellipsizes what does not fit in two lines", () => {
    const wrapped = wrapLabelText("one two three four five six seven eight", 20, 80);
    expect(wrapped.lines.length).toBe(2);
    expect(wrapped.lines[1].endsWith("…")).toBe(true);
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

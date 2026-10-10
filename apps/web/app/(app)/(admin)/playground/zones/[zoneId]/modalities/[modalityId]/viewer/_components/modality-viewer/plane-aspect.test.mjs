import { describe, expect, test } from "bun:test";

import { mprPlanePixelAspect } from "./utils.ts";

describe("mprPlanePixelAspect", () => {
  // The live head CT: 0.47 mm pixels, 1.5 mm slices.
  const headCt = [0.474609375, 0.474609375, 1.5];

  test("thick slices make coronal and sagittal pixels taller than wide", () => {
    expect(mprPlanePixelAspect("coronal", headCt)).toBeCloseTo(3.16, 2);
    expect(mprPlanePixelAspect("sagittal", headCt)).toBeCloseTo(3.16, 2);
    expect(mprPlanePixelAspect("axial", headCt)).toBe(1);
  });

  test("isotropic volumes and missing spacing keep square pixels", () => {
    expect(mprPlanePixelAspect("coronal", [0.7, 0.7, 0.7])).toBe(1);
    expect(mprPlanePixelAspect("coronal", undefined)).toBe(1);
    expect(mprPlanePixelAspect("sagittal", [0.5, 0, 2])).toBe(1);
  });

  test("thin slices and extreme ratios stay within bounds", () => {
    expect(mprPlanePixelAspect("coronal", [1, 1, 0.5])).toBe(0.5);
    expect(mprPlanePixelAspect("coronal", [0.2, 0.2, 10])).toBe(8);
  });
});

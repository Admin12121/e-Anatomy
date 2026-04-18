"use client";

import { useEffect, useRef, useState } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";

import { DEFAULT_GROUP_COLOR } from "../../modality-viewer.types";
import { toColorInputValue } from "./utils";

type HsvColor = {
  h: number;
  s: number;
  v: number;
};

function normalizeHue(value: number) {
  const normalized = value % 360;

  return normalized < 0 ? normalized + 360 : normalized;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHsv(color: HsvColor): HsvColor {
  return {
    h: normalizeHue(color.h),
    s: clampNumber(color.s, 0, 1),
    v: clampNumber(color.v, 0, 1),
  };
}

function hsvToHex(color: HsvColor) {
  const normalized = normalizeHsv(color);
  const chroma = normalized.v * normalized.s;
  const hueSection = normalized.h / 60;
  const component = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = normalized.v - chroma;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hueSection >= 0 && hueSection < 1) {
    rPrime = chroma;
    gPrime = component;
  } else if (hueSection < 2) {
    rPrime = component;
    gPrime = chroma;
  } else if (hueSection < 3) {
    gPrime = chroma;
    bPrime = component;
  } else if (hueSection < 4) {
    gPrime = component;
    bPrime = chroma;
  } else if (hueSection < 5) {
    rPrime = component;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = component;
  }

  const red = Math.round((rPrime + match) * 255)
    .toString(16)
    .padStart(2, "0");
  const green = Math.round((gPrime + match) * 255)
    .toString(16)
    .padStart(2, "0");
  const blue = Math.round((bPrime + match) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${red}${green}${blue}`.toUpperCase();
}

function hexToHsv(hex: string): HsvColor {
  const normalizedHex = toColorInputValue(hex, DEFAULT_GROUP_COLOR).slice(1);
  const red = parseInt(normalizedHex.slice(0, 2), 16) / 255;
  const green = parseInt(normalizedHex.slice(2, 4), 16) / 255;
  const blue = parseInt(normalizedHex.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
  }

  const saturation = max === 0 ? 0 : delta / max;

  return normalizeHsv({
    h: hue * 60,
    s: saturation,
    v: max,
  });
}

export function AnatomicalAreaColorPicker({
  colorHex,
  onColorChange,
}: {
  colorHex: string;
  onColorChange: (value: string) => void;
}) {
  const [hsvColor, setHsvColor] = useState<HsvColor>(() => hexToHsv(colorHex));
  const hsvColorRef = useRef(hsvColor);
  const saturationRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    hsvColorRef.current = hsvColor;
  }, [hsvColor]);

  useEffect(() => {
    const nextHsvColor = hexToHsv(colorHex);

    // Keep the local drag state aligned when the parent color changes externally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHsvColor((current) => {
      const hueDelta = Math.abs(
        normalizeHue(current.h) - normalizeHue(nextHsvColor.h),
      );
      const isCloseHue = Math.min(hueDelta, 360 - hueDelta) < 0.25;
      const isCloseSaturation = Math.abs(current.s - nextHsvColor.s) < 0.002;
      const isCloseValue = Math.abs(current.v - nextHsvColor.v) < 0.002;

      if (isCloseHue && isCloseSaturation && isCloseValue) {
        return current;
      }

      return nextHsvColor;
    });
  }, [colorHex]);

  const commitColor = (next: HsvColor) => {
    const normalized = normalizeHsv(next);
    const nextHex = hsvToHex(normalized);

    hsvColorRef.current = normalized;
    setHsvColor(normalized);

    if (nextHex.toLowerCase() !== colorHex.toLowerCase()) {
      onColorChange(nextHex);
    }
  };

  const updateSaturationValue = (clientX: number, clientY: number) => {
    const element = saturationRef.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const nextSaturation = clampNumber(
      (clientX - rect.left) / rect.width,
      0,
      1,
    );
    const nextValue = clampNumber(1 - (clientY - rect.top) / rect.height, 0, 1);
    const current = hsvColorRef.current;

    commitColor({
      h: current.h,
      s: nextSaturation,
      v: nextValue,
    });
  };

  const updateHue = (clientX: number) => {
    const element = hueRef.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const ratio = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const current = hsvColorRef.current;

    commitColor({
      h: ratio * 360,
      s: current.s,
      v: current.v,
    });
  };

  const saturationCursorLeft = `${hsvColor.s * 100}%`;
  const saturationCursorTop = `${(1 - hsvColor.v) * 100}%`;
  const hueCursorLeft = `${(normalizeHue(hsvColor.h) / 360) * 100}%`;
  const hueBaseColor = hsvToHex({ h: hsvColor.h, s: 1, v: 1 });
  const displayHex = hsvToHex(hsvColor);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className="flex items-center gap-3 text-left" />
        }
      >
        <span
          className="size-5 rounded-full"
          style={{ backgroundColor: displayHex }}
        />
        <span className="text-[14px] font-semibold leading-none">
          Pick a color
        </span>
      </PopoverTrigger>

      <PopoverPopup
        align="start"
        sideOffset={8}
        className="w-60 rounded-2xl border-none p-0 shadow-none before:hidden [--viewport-inline-padding:0]"
        viewport="p-0"
      >
        <div className="p-2">
          <div
            ref={saturationRef}
            role="presentation"
            tabIndex={0}
            className="relative aspect-square w-full cursor-crosshair touch-none overflow-hidden rounded-2xl outline-none"
            style={{ backgroundColor: hueBaseColor }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateSaturationValue(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }

              updateSaturationValue(event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black to-transparent" />
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
              style={{ left: saturationCursorLeft, top: saturationCursorTop }}
            >
              <span className="absolute inset-1 rounded-full bg-transparent" />
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between px-0.5 text-sm">
            <span>Hue</span>
            <span className="tabular-nums">{hsvColor.h.toFixed(2)} deg</span>
          </div>

          <div
            ref={hueRef}
            role="presentation"
            className="relative mt-1 h-5 w-full cursor-ew-resize touch-none overflow-hidden rounded-full border border-white/15"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateHue(event.clientX);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }

              updateHue(event.clientX);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)]" />
            <span
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{ left: hueCursorLeft }}
            >
              <span className="absolute inset-1 rounded-full bg-transparent" />
            </span>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

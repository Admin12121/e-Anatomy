"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Frame, FrameHeader } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Shared with the home catalog; only the destination and color context differ. */
export function ModalityPreviewCard({
  name,
  modalityType,
  href,
  previewSrc,
  loading = false,
  tone = "dark",
  linkLabel = `Explore ${name}`,
}: {
  name: string;
  modalityType: string;
  href: string;
  previewSrc: string | null | undefined;
  loading?: boolean;
  tone?: "dark" | "theme";
  linkLabel?: string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  useEffect(() => {
    // Cached images can finish before hydration attaches the load handler.
    // Read their actual state instead of resetting a completed preview.
    const image = imageRef.current;
    setImageFailed(Boolean(image?.complete && image.naturalWidth === 0));
    setImageLoaded(Boolean(image?.complete && image.naturalWidth > 0));
  }, [previewSrc]);
  const dark = tone === "dark";
  return (
    <Link
      href={href}
      aria-label={linkLabel}
      className={cn(
        "block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        dark
          ? "focus-visible:ring-white/45 focus-visible:ring-offset-[#141414]"
          : "focus-visible:ring-ring focus-visible:ring-offset-background",
      )}
    >
      <Frame
        className={cn(
          "group w-full transition-[background-color,transform] duration-300 ease-out hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
          dark
            ? "bg-white/[0.05] hover:bg-white/[0.07]"
            : "bg-muted/60 hover:bg-muted/80",
        )}
      >
        <FrameHeader className="flex h-10 shrink-0 flex-row items-center justify-between gap-2 px-2 py-0 text-sm">
          <p
            className={cn(
              "min-w-0 truncate font-medium",
              dark ? "text-white/92" : "text-foreground",
            )}
          >
            {name}
          </p>
          <span
            className={cn(
              "shrink-0 truncate text-[0.66rem] font-medium uppercase tracking-[0.1em] transition-colors",
              dark
                ? "text-white/34 group-hover:text-white/52"
                : "text-muted-foreground",
            )}
          >
            {modalityType}
          </span>
        </FrameHeader>
        <div className="relative aspect-[1.55] w-full overflow-hidden rounded-xl bg-[#0d0d0d]">
          {previewSrc && !imageFailed ? (
            <>
              {!imageLoaded ? (
                <Skeleton
                  aria-label={`Loading ${name} preview`}
                  className="absolute inset-0 z-10 size-full rounded-xl"
                  role="status"
                />
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                alt={`${name} preview`}
                src={previewSrc}
                loading="lazy"
                className={cn(
                  "absolute inset-0 h-full w-full bg-black object-contain transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none",
                  imageLoaded ? "opacity-100" : "opacity-0",
                )}
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageLoaded(false);
                  setImageFailed(true);
                }}
              />
            </>
          ) : loading ? (
            <Skeleton
              aria-label={`Loading ${name} preview`}
              className="absolute inset-0 size-full rounded-xl"
              role="status"
            />
          ) : (
            <div
              aria-label={`${name} preview is unavailable`}
              className="absolute inset-0 flex items-center justify-center text-[0.62rem] font-medium uppercase tracking-[0.16em] text-white/20"
              role="img"
            >
              Preview unavailable
            </div>
          )}
        </div>
      </Frame>
    </Link>
  );
}

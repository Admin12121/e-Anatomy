"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftIcon } from "lucide-react";

import { Frame, FrameHeader } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import type {
  ModalityType,
  PublicZoneModalitySummary,
  PublicZoneSummary,
  ZoneModalityAsset,
  ZoneModalityFamily,
} from "@/lib/playground/types";
import { useGetZoneModalitiesQuery } from "@/lib/store/services/playground-api";
import {
  useGetPublicZoneModalitiesQuery,
  useGetPublicZoneModalityViewerManifestQuery,
} from "@/lib/store/services/public-playground-api";

type HomeCatalogProps = {
  isZonesError: boolean;
  isZonesLoading: boolean;
  onBack: () => void;
  zones: readonly PublicZoneSummary[];
  zonesErrorMessage?: string;
};

type PreviewablePublicModality = PublicZoneModalitySummary & {
  coverImageUrl?: string | null;
  modalityType?: ModalityType | null;
  thumbnailUrl?: string | null;
};

function resolveManifestPreview(
  assets: readonly ZoneModalityAsset[] | undefined,
) {
  if (!assets?.length) {
    return null;
  }

  const preferredAsset =
    assets.find(
      (asset) =>
        asset.assetKind === "cover" && (asset.thumbnailUrl || asset.imageUrl),
    ) ??
    assets.find(
      (asset) =>
        asset.assetKind === "overview" && (asset.thumbnailUrl || asset.imageUrl),
    ) ??
    assets.find((asset) => asset.thumbnailUrl || asset.imageUrl);

  return preferredAsset?.thumbnailUrl ?? preferredAsset?.imageUrl ?? null;
}

function findAdminFamily(
  families: readonly ZoneModalityFamily[] | undefined,
  modality: PublicZoneModalitySummary,
) {
  const modalityName = modality.name.trim().toLowerCase();

  return families?.find(
    (family) =>
      family.id === modality.id ||
      family.name.trim().toLowerCase() === modalityName ||
      family.variants.some(
        (variant) => variant.id === modality.id || variant.slug === modality.slug,
      ),
  );
}

function CatalogModalityCard({
  adminFamily,
  adminPreviewLoading = false,
  modality,
  zone,
}: {
  adminFamily?: ZoneModalityFamily;
  adminPreviewLoading?: boolean;
  modality: PublicZoneModalitySummary;
  zone: PublicZoneSummary;
}) {
  const previewableModality = modality as PreviewablePublicModality;
  const suppliedPreview =
    adminFamily?.thumbnailUrl ??
    previewableModality.thumbnailUrl ??
    previewableModality.coverImageUrl ??
    null;
  const shouldLoadManifest = !suppliedPreview && !adminPreviewLoading;
  const { data: viewerManifest, isFetching: isManifestFetching } =
    useGetPublicZoneModalityViewerManifestQuery(
      {
        modalitySlug: modality.slug,
        zoneSlug: zone.slug,
      },
      { skip: !shouldLoadManifest },
    );
  const previewSrc = useMemo(
    () =>
      suppliedPreview ??
      viewerManifest?.modality.coverImageUrl ??
      resolveManifestPreview(viewerManifest?.assets),
    [suppliedPreview, viewerManifest],
  );
  const modalityType =
    adminFamily?.modalityType ??
    previewableModality.modalityType ??
    viewerManifest?.modality.modalityType ??
    modality.slug;
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
  }, [previewSrc]);

  return (
    <Link
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]"
      href={`/${encodeURIComponent(zone.slug)}/${encodeURIComponent(modality.slug)}`}
    >
      <Frame className="group w-full bg-white/[0.05] transition-[background-color,transform] duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/[0.07]">
        <FrameHeader className="flex h-10 shrink-0 flex-row items-center justify-between gap-2 px-2 py-0 text-sm">
          <p className="min-w-0 truncate font-medium text-white/92">
            {modality.name}
          </p>
          <span className="shrink-0 truncate text-[0.66rem] font-medium uppercase tracking-[0.1em] text-white/34 transition-colors group-hover:text-white/52">
            {modalityType}
          </span>
        </FrameHeader>

        <div className="relative aspect-[1.55] w-full overflow-hidden rounded-xl bg-[#0d0d0d]">
          {previewSrc && !imageFailed ? (
            <>
              {!imageLoaded ? (
                <Skeleton
                  aria-label={`Loading ${modality.name} preview`}
                  className="absolute inset-0 z-10 size-full rounded-xl"
                  role="status"
                />
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`${modality.name} preview`}
                className={`absolute inset-0 h-full w-full bg-black object-contain transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.015] ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                loading="lazy"
                onError={() => {
                  setImageLoaded(false);
                  setImageFailed(true);
                }}
                onLoad={() => setImageLoaded(true)}
                src={previewSrc}
              />
            </>
          ) : isManifestFetching || adminPreviewLoading ? (
            <Skeleton
              aria-label={`Loading ${modality.name} preview`}
              className="absolute inset-0 size-full rounded-xl"
              role="status"
            />
          ) : (
            <div
              aria-label={`${modality.name} preview is unavailable`}
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

function CatalogLoadingCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="aspect-[1.35] animate-pulse rounded-2xl bg-white/[0.035]"
          key={index}
        />
      ))}
    </div>
  );
}

function CatalogZoneSection({
  canLoadAdminThumbnails,
  zone,
}: {
  canLoadAdminThumbnails: boolean;
  zone: PublicZoneSummary;
}) {
  const prefersReducedMotion = useReducedMotion();
  const {
    data: modalitiesResponse,
    isError,
    isLoading,
  } = useGetPublicZoneModalitiesQuery(zone.id);
  const {
    data: adminFamiliesResponse,
    isFetching: isAdminFamiliesFetching,
  } = useGetZoneModalitiesQuery(zone.id, {
    skip: !canLoadAdminThumbnails,
  });
  const modalities = modalitiesResponse?.items ?? [];
  const adminFamilies = adminFamiliesResponse?.items;

  return (
    <section
      className="scroll-mt-24 py-7 first:pt-0 md:py-9"
      data-catalog-section
      id={`zone-${zone.id}`}
    >
      <div className="mb-4 flex items-center justify-between gap-4 md:mb-5">
        <div className="text-sm font-semibold uppercase tracking-[0.08em] text-white/88 md:text-base">
          {zone.name}
        </div>
      </div>

      {isLoading ? <CatalogLoadingCards /> : null}

      {isError ? (
        <div className="rounded-xl bg-red-400/[0.055] px-4 py-5 text-sm text-red-200/70">
          Unable to load modalities for this region.
        </div>
      ) : null}

      {!isLoading && !isError && modalities.length === 0 ? (
        <div className="rounded-xl bg-white/[0.025] px-4 py-7 text-sm text-white/30">
          No modalities are attached to this zone yet.
        </div>
      ) : null}

      {!isLoading && !isError && modalities.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modalities.map((modality, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              key={modality.id}
              transition={{
                delay: prefersReducedMotion ? 0 : Math.min(index * 0.03, 0.12),
                duration: prefersReducedMotion ? 0 : 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <CatalogModalityCard
                adminFamily={findAdminFamily(adminFamilies, modality)}
                adminPreviewLoading={
                  canLoadAdminThumbnails && isAdminFamiliesFetching
                }
                modality={modality}
                zone={zone}
              />
            </motion.div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function HomeCatalog({
  isZonesError,
  isZonesLoading,
  onBack,
  zones,
  zonesErrorMessage,
}: HomeCatalogProps) {
  const { data: session } = authClient.useSession();
  const canLoadAdminThumbnails = Boolean(session?.user.apiAccountId);

  return (
    <div className="w-full px-4 pb-24 pt-24 sm:px-5 md:px-6 md:pb-32 md:pt-28 lg:px-9">
      <div
        className="mb-8 flex min-h-9 items-center gap-2 md:mb-10"
        data-catalog-header
      >
        <div
          aria-level={1}
          className="text-sm font-semibold uppercase leading-none tracking-[0.1em] text-white/88 md:text-base"
          role="heading"
        >
          Regions / Zone
        </div>
        <button
          aria-label="Back to atlas"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.055] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          onClick={onBack}
          title="Back to atlas"
          type="button"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
        </button>
      </div>

      {isZonesLoading ? (
        <div className="space-y-9" data-catalog-section>
          {Array.from({ length: 4 }, (_, index) => (
            <div className="space-y-4" key={index}>
              <div className="h-4 w-28 animate-pulse rounded bg-white/7" />
              <CatalogLoadingCards />
            </div>
          ))}
        </div>
      ) : null}

      {isZonesError ? (
        <div
          className="rounded-xl bg-red-400/[0.055] px-4 py-6 text-sm text-red-200/70"
          data-catalog-section
        >
          {zonesErrorMessage ?? "Unable to load regions."}
        </div>
      ) : null}

      {!isZonesLoading && !isZonesError && zones.length === 0 ? (
        <div
          className="rounded-xl bg-white/[0.025] px-4 py-9 text-sm text-white/30"
          data-catalog-section
        >
          No zones are available yet.
        </div>
      ) : null}

      {!isZonesLoading && !isZonesError && zones.length > 0 ? (
        <div className="min-w-0">
          {zones.map((zone) => (
            <CatalogZoneSection
              canLoadAdminThumbnails={canLoadAdminThumbnails}
              key={zone.id}
              zone={zone}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

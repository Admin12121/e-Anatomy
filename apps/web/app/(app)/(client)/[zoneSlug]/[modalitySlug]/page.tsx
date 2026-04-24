import type { Metadata } from "next";

import { PublicModalityViewer } from "@/app/(app)/(admin)/playground/zones/[zoneId]/modalities/[modalityId]/viewer/_components/modality-viewer";
import {
  getPublicZoneModalities,
  getPublicZones,
} from "@/lib/playground/public-server";
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  humanizeSlug,
} from "@/lib/seo";

type PublicViewerPageProps = {
  params: Promise<{
    modalitySlug: string;
    zoneSlug: string;
  }>;
};

const PUBLIC_METADATA_REVALIDATE_SECONDS = 60 * 60;

export async function generateMetadata({
  params,
}: PublicViewerPageProps): Promise<Metadata> {
  const { modalitySlug, zoneSlug } = await params;
  const canonicalPath = `/${encodeURIComponent(zoneSlug)}/${encodeURIComponent(
    modalitySlug,
  )}`;
  let zoneName = humanizeSlug(zoneSlug);
  let modalityName = humanizeSlug(modalitySlug);

  try {
    const zones = await getPublicZones({
      next: { revalidate: PUBLIC_METADATA_REVALIDATE_SECONDS },
    });
    const zone = zones.items.find((item) => item.slug === zoneSlug);

    if (zone) {
      zoneName = zone.name;

      const modalities = await getPublicZoneModalities(zone.id, {
        next: { revalidate: PUBLIC_METADATA_REVALIDATE_SECONDS },
      });
      const modality = modalities.items.find(
        (item) => item.slug === modalitySlug,
      );

      if (modality) {
        modalityName = modality.name;
      }
    }
  } catch {
    // Keep metadata rendering reliable even if the API is unavailable.
  }

  const title = `${zoneName} ${modalityName}`;
  const description = `Explore ${zoneName} anatomy with the ${modalityName} interactive viewer on ${SITE_NAME}.`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} ${modalityName} preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function PublicViewerPage({
  params,
}: PublicViewerPageProps) {
  const { modalitySlug, zoneSlug } = await params;

  return (
    <PublicModalityViewer modalitySlug={modalitySlug} zoneSlug={zoneSlug} />
  );
}

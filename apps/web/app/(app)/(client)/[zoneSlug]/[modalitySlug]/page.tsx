import { PublicModalityViewer } from "@/app/(app)/(admin)/playground/zones/[zoneId]/modalities/[modalityId]/viewer/_components/modality-viewer";

type PublicViewerPageProps = {
  params: Promise<{
    modalitySlug: string;
    zoneSlug: string;
  }>;
};

export default async function PublicViewerPage({
  params,
}: PublicViewerPageProps) {
  const { modalitySlug, zoneSlug } = await params;

  return (
    <PublicModalityViewer modalitySlug={modalitySlug} zoneSlug={zoneSlug} />
  );
}

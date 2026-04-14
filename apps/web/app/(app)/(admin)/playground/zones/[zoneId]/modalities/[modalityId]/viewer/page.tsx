import { DraftModalityViewer } from "./_components/modality-viewer"

type ViewerPageProps = {
  params: Promise<{
    zoneId: string
    modalityId: string
  }>
}

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { modalityId, zoneId } = await params

  return <DraftModalityViewer modalityId={modalityId} zoneId={zoneId} />
}

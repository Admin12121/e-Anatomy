import { StructureRichTextPage } from "./_components/structure-rich-text-page"

type StructureRichTextRoutePageProps = {
  params: Promise<{
    zoneId: string
    modalityId: string
    structureId: string
  }>
}

export default async function StructureRichTextRoutePage({
  params,
}: StructureRichTextRoutePageProps) {
  const { modalityId, structureId, zoneId } = await params

  return (
    <StructureRichTextPage
      modalityId={modalityId}
      structureId={structureId}
      zoneId={zoneId}
    />
  )
}

import { notFound, redirect } from "next/navigation"
import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { serverApiFetch } from "@/lib/api/server"
import { requireCapabilitySession } from "@/lib/auth/session"
import { loadContentCatalog } from "@/lib/content/catalog-server"
import type { ZoneModalityViewerManifest } from "@/lib/playground/types"

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

  const { user } = await requireCapabilitySession("view_content", "/content")
  const manifest = await serverApiFetch<ZoneModalityViewerManifest>(`/playground/zones/${zoneId}/modalities/${modalityId}/viewer`, {
    cache: "no-store", includeCookie: false, headers: buildInternalAdminHeaders(user),
  })
  if (!manifest.structures.some((item) => item.id === structureId)) notFound()
  const content = (await loadContentCatalog(user)).find((item) => item.id === manifest.modality.familyId)
  if (!content) notFound()
  redirect(`/content/${content.slug}/resources/labels/${structureId}`)
}

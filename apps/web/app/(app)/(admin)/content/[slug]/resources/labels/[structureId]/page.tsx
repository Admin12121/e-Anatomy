import { notFound } from "next/navigation"
import { ResourceEditor } from "@/components/content/resource-editor"
import { hasCapability } from "@/lib/auth/access"
import { loadContentContext, loadContentDocument } from "@/lib/content/server"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; structureId: string }>
}) {
  const { slug, structureId } = await params
  const { user, content, workspace } = await loadContentContext(slug)
  const label = workspace.labels.find((item) => item.id === structureId)
  if (!label) notFound()
  const document = await loadContentDocument(user, content.id, structureId)
  return (
    <ResourceEditor
      key={structureId}
      initialDocument={document}
      title={label.title}
      familyId={content.id}
      target={structureId}
      canEdit={hasCapability(user.roleCode, "manage_content")}
      publicHref={
        label.isPrimary
          ? `/structures/${content.zoneSlug}/${content.primarySlug}/${label.slug}`
          : undefined
      }
    />
  )
}

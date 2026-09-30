import { ResourceEditor } from "@/components/content/resource-editor"
import { hasCapability } from "@/lib/auth/access"
import { loadContentContext, loadContentDocument } from "@/lib/content/server"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { user, content } = await loadContentContext((await params).slug)
  const document = await loadContentDocument(user, content.id, "modality")
  return (
    <ResourceEditor
      key={content.id}
      initialDocument={document}
      title={content.name}
      familyId={content.id}
      target="modality"
      canEdit={hasCapability(user.roleCode, "manage_content")}
      publicHref={`/structures/${content.zoneSlug}/${content.primarySlug}`}
    />
  )
}

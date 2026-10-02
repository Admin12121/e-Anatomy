import { notFound } from "next/navigation";
import { ResourceEditor } from "@/components/content/resource-editor";
import { hasCapability } from "@/lib/auth/access";
import { loadContentContext, loadContentDocument } from "@/lib/content/server";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; structureId: string }>;
}) {
  const { slug, structureId } = await params;
  const { user, content, workspace } = await loadContentContext(slug);
  // Resolve the actual structure identifier, never a content-document id.
  const label = workspace.labels.find(
    (item) => item.id.toLowerCase() === structureId.toLowerCase(),
  );
  if (!label) notFound();
  const document = await loadContentDocument(user, content.id, label.id);
  return (
    <ResourceEditor
      key={label.id}
      initialDocument={document}
      title={label.title}
      familyId={content.id}
      target={label.id}
      canEdit={hasCapability(user.roleCode, "manage_content")}
    />
  );
}

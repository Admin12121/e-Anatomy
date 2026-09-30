import { redirect } from "next/navigation"
import { hasCapability } from "@/lib/auth/access"
import { loadContentContext } from "@/lib/content/server"

export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { user, content } = await loadContentContext(slug)
  redirect(
    `/content/${content.primarySlug}/${hasCapability(user.roleCode, "view_analytics") ? "overview" : "resources"}`,
  )
}

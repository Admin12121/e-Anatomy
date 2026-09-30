import type { Metadata } from "next"
import { PublicArticle } from "@/components/content/public-article"
import { loadPublicArticle } from "@/lib/content/server"

type Params = { zoneSlug: string; contentSlug: string; structureSlug: string }
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { zoneSlug, contentSlug, structureSlug } = await params
  const article = await loadPublicArticle(zoneSlug, contentSlug, structureSlug)
  return {
    title: article.title,
    description: article.document.summary,
    alternates: {
      canonical: `/structures/${article.family.zoneSlug}/${article.family.slug}/${article.structureSlug}`,
    },
  }
}
export default async function Page({ params }: { params: Promise<Params> }) {
  return <PublicArticle {...await params} />
}

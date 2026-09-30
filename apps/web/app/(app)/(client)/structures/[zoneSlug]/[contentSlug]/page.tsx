import type { Metadata } from "next"
import { PublicArticle } from "@/components/content/public-article"
import { loadPublicArticle } from "@/lib/content/server"

type Params = { zoneSlug: string; contentSlug: string }
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { zoneSlug, contentSlug } = await params
  const article = await loadPublicArticle(zoneSlug, contentSlug)
  return {
    title: article.title,
    description: article.document.summary,
    alternates: {
      canonical: `/structures/${article.family.zoneSlug}/${article.family.slug}`,
    },
  }
}
export default async function Page({ params }: { params: Promise<Params> }) {
  return <PublicArticle {...await params} />
}

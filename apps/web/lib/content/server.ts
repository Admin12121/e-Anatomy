import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { serverApiFetch } from "@/lib/api/server"
import { requireCapabilitySession } from "@/lib/auth/session"
import type { SessionUser } from "@/lib/auth/types"
import { findContentBySlug } from "./catalog"
import { loadContentCatalog } from "./catalog-server"
import type {
  ContentArticle,
  ContentDocument,
  ContentWorkspace,
  PublicContentTopic,
} from "./types"

export const loadContentContext = cache(async (slug: string) => {
  const { user } = await requireCapabilitySession(
    "view_content",
    `/content/${slug}`,
  )
  const content = findContentBySlug(await loadContentCatalog(user), slug)
  if (!content) notFound()
  const workspace = await serverApiFetch<ContentWorkspace>(
    `/content/families/${content.id}`,
    {
      cache: "no-store",
      includeCookie: false,
      headers: buildInternalAdminHeaders(user),
    },
  )
  return { user, content, workspace }
})
export function loadContentDocument(
  user: Pick<SessionUser, "apiAccountId" | "id">,
  familyId: string,
  target: string,
) {
  return serverApiFetch<ContentDocument>(
    `/content/families/${familyId}/documents/${encodeURIComponent(target)}`,
    {
      cache: "no-store",
      includeCookie: false,
      headers: buildInternalAdminHeaders(user),
    },
  )
}
export const loadPublicArticle = cache(
  async (zone: string, slug: string, label?: string) => {
    try {
      return await serverApiFetch<ContentArticle>(
        `/public/content/structures/${encodeURIComponent(zone)}/${encodeURIComponent(slug)}${label ? `/${encodeURIComponent(label)}` : ""}`,
        { cache: "no-store", includeCookie: false },
      )
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) notFound()
      throw error
    }
  },
)

export const loadPublicContentTopics = cache(() =>
  serverApiFetch<PublicContentTopic[]>("/public/content/catalog", {
    cache: "no-store",
    includeCookie: false,
  }),
)

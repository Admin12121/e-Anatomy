import "server-only"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { serverApiFetch } from "@/lib/api/server"
import type { SessionUser } from "@/lib/auth/types"
import { buildContentCatalog } from "@/lib/content/catalog"
import type {
  ZoneListResponse,
  ZoneModalityFamilyListResponse,
} from "@/lib/playground/types"

export async function loadContentCatalog(
  user: Pick<SessionUser, "apiAccountId" | "id">,
) {
  const headers = buildInternalAdminHeaders(user)
  const zonesResponse = await serverApiFetch<ZoneListResponse>(
    "/playground/zones",
    {
      cache: "no-store",
      headers,
      includeCookie: false,
    },
  )
  const groups = await Promise.all(
    zonesResponse.items.map(async (zone) => ({
      families: (
        await serverApiFetch<ZoneModalityFamilyListResponse>(
          `/playground/zones/${zone.id}/modalities`,
          {
            cache: "no-store",
            headers,
            includeCookie: false,
          },
        )
      ).items,
      zone,
    })),
  )

  return buildContentCatalog(groups)
}

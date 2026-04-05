import "server-only"

import type { SessionUser } from "@/lib/auth/types"

function getInternalApiKey() {
  const internalApiKey = process.env.INTERNAL_WEB_API_KEY

  if (!internalApiKey) {
    throw new Error("INTERNAL_WEB_API_KEY is not configured.")
  }

  return internalApiKey
}

export function buildInternalAdminHeaders(
  user: Pick<SessionUser, "apiAccountId" | "id">,
) {
  if (!user.apiAccountId) {
    throw new Error("Admin API request requires an account id.")
  }

  return {
    "x-account-id": user.apiAccountId,
    "x-internal-api-key": getInternalApiKey(),
    "x-user-id": user.id,
  }
}

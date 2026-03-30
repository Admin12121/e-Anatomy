import "server-only"

import { serverApiFetch } from "@/lib/api/server"
import type { ModuleListResponse } from "@/lib/auth/types"

export async function getModules() {
  return serverApiFetch<ModuleListResponse>("/modules")
}

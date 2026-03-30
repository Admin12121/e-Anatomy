import { BROWSER_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { parseApiError } from "@/lib/api/errors"

export async function browserApiFetch<T = void>(path: string, init: RequestInit = {}) {
  const response = await fetch(buildApiUrl(BROWSER_API_BASE_URL, path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw await parseApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.text()

  if (!body) {
    return undefined as T
  }

  return JSON.parse(body) as T
}

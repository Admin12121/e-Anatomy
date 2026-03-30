export const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ?? "http://api:8080/api/v1"

export const BROWSER_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1"

export function buildApiUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`
}

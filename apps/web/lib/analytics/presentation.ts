export type MetricComparison = {
  label: string
  tone: "negative" | "neutral" | "positive"
}

export function formatMetricComparison(
  current: number,
  previous: number,
): MetricComparison {
  if (current === previous) {
    return { label: "No change", tone: "neutral" }
  }

  if (previous === 0) {
    return {
      label: `${current} new this period`,
      tone: current > 0 ? "positive" : "neutral",
    }
  }

  const change = Math.round(((current - previous) / previous) * 100)

  return {
    label: `${change > 0 ? "+" : ""}${change}% vs previous`,
    tone: change > 0 ? "positive" : "negative",
  }
}

export function buildAnalyticsUrl(
  pathname: string,
  currentSearch: string,
  next: Partial<{ days: string; event: string }>,
) {
  const params = new URLSearchParams(currentSearch)
  params.delete("page")

  for (const [key, value] of Object.entries(next)) {
    if (!value || value === "all") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function resolveRouteTab<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback
}

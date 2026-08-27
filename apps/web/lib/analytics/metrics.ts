import "server-only"

import { and, count, countDistinct, gte, lt } from "drizzle-orm"

import { session, user } from "@/lib/db/auth-schema"
import { db } from "@/lib/db/client"

export type AnalyticsMetric = {
  current: number
  previous: number
}

export type AnalyticsOverview = {
  activeAccounts: AnalyticsMetric
  newcomers: AnalyticsMetric
  rangeDays: number
}

function getCount(
  result: { value: number | string | bigint | null | undefined } | undefined,
) {
  return Number(result?.value ?? 0)
}

export async function getAnalyticsOverview(
  requestedRangeDays: number,
): Promise<AnalyticsOverview> {
  const rangeDays = [7, 30, 90].includes(requestedRangeDays)
    ? requestedRangeDays
    : 30
  const now = new Date()
  const rangeMs = rangeDays * 24 * 60 * 60 * 1000
  const currentStart = new Date(now.getTime() - rangeMs)
  const previousStart = new Date(currentStart.getTime() - rangeMs)

  const [
    currentNewcomers,
    previousNewcomers,
    currentActiveAccounts,
    previousActiveAccounts,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(user)
      .where(gte(user.createdAt, currentStart)),
    db
      .select({ value: count() })
      .from(user)
      .where(and(gte(user.createdAt, previousStart), lt(user.createdAt, currentStart))),
    db
      .select({ value: countDistinct(session.userId) })
      .from(session)
      .where(gte(session.updatedAt, currentStart)),
    db
      .select({ value: countDistinct(session.userId) })
      .from(session)
      .where(
        and(
          gte(session.updatedAt, previousStart),
          lt(session.updatedAt, currentStart),
        ),
      ),
  ])

  return {
    activeAccounts: {
      current: getCount(currentActiveAccounts[0]),
      previous: getCount(previousActiveAccounts[0]),
    },
    newcomers: {
      current: getCount(currentNewcomers[0]),
      previous: getCount(previousNewcomers[0]),
    },
    rangeDays,
  }
}

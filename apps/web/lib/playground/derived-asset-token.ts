import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { AUTH_SECRET } from "@/lib/auth/runtime-config"

export type DerivedAssetVariant = "image" | "thumbnail"

type DerivedAssetTokenPayload = {
  accountId: string
  assetId: string
  expires: number
  userId: string
  variant: DerivedAssetVariant
}

const DERIVED_ASSET_TOKEN_TTL_SECONDS = 60 * 60 * 8
const DERIVED_ASSET_TOKEN_CACHE_WINDOW_SECONDS = 60 * 5
const DERIVED_ASSET_TOKEN_NAMESPACE = "playground-derived-asset-v1"

function signDerivedAssetPayload({
  accountId,
  assetId,
  expires,
  userId,
  variant,
}: DerivedAssetTokenPayload) {
  return createHmac("sha256", `${AUTH_SECRET}:${DERIVED_ASSET_TOKEN_NAMESPACE}`)
    .update([accountId, userId, assetId, variant, String(expires)].join(":"))
    .digest("base64url")
}

export function createDerivedAssetSearchParams({
  accountId,
  assetId,
  now = Date.now(),
  userId,
  variant,
}: {
  accountId: string
  assetId: string
  now?: number
  userId: string
  variant: DerivedAssetVariant
}) {
  const nowSeconds = Math.floor(now / 1000)
  const cacheWindowBoundarySeconds =
    Math.floor(nowSeconds / DERIVED_ASSET_TOKEN_CACHE_WINDOW_SECONDS) *
    DERIVED_ASSET_TOKEN_CACHE_WINDOW_SECONDS
  const expires =
    cacheWindowBoundarySeconds +
    DERIVED_ASSET_TOKEN_CACHE_WINDOW_SECONDS +
    DERIVED_ASSET_TOKEN_TTL_SECONDS
  const token = signDerivedAssetPayload({
    accountId,
    assetId,
    expires,
    userId,
    variant,
  })

  return new URLSearchParams({
    accountId,
    expires: String(expires),
    token,
    userId,
  })
}

export function verifyDerivedAssetToken({
  accountId,
  assetId,
  expires,
  token,
  userId,
  variant,
}: DerivedAssetTokenPayload & {
  token: string
}) {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
    return false
  }

  const expectedToken = signDerivedAssetPayload({
    accountId,
    assetId,
    expires,
    userId,
    variant,
  })

  if (expectedToken.length !== token.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(expectedToken), Buffer.from(token))
}

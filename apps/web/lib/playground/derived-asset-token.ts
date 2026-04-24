import "server-only"

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
} from "node:crypto"

import { AUTH_SECRET } from "@/lib/auth/runtime-config"

export type DerivedAssetVariant = "image"

type DerivedAssetTokenPayload = {
  accountId: string
  assetId: string
  expires: number
  userId: string
  variant: DerivedAssetVariant
}

export const DERIVED_ASSET_TOKEN_TTL_SECONDS = 60 * 60
const DERIVED_ASSET_TOKEN_CACHE_WINDOW_SECONDS = 60 * 2
const DERIVED_ASSET_TOKEN_NAMESPACE = "playground-derived-asset-v1"
const DERIVED_ASSET_TOKEN_VERSION = 1
const DERIVED_ASSET_TOKEN_SEPARATOR = "."

function getTokenEncryptionKey() {
  return createHash("sha256")
    .update(`${AUTH_SECRET}:${DERIVED_ASSET_TOKEN_NAMESPACE}:key`)
    .digest()
}

function getTokenInitializationVector(plaintext: string) {
  // Stable per payload so manifest refreshes can reuse cached image URLs,
  // while keeping account/user identifiers out of query parameters.
  return createHmac(
    "sha256",
    `${AUTH_SECRET}:${DERIVED_ASSET_TOKEN_NAMESPACE}:iv`,
  )
    .update(plaintext)
    .digest()
    .subarray(0, 12)
}

function encodeDerivedAssetToken(payload: DerivedAssetTokenPayload) {
  const plaintext = JSON.stringify({
    ...payload,
    version: DERIVED_ASSET_TOKEN_VERSION,
  })
  const iv = getTokenInitializationVector(plaintext)
  const cipher = createCipheriv("aes-256-gcm", getTokenEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [iv, authTag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(DERIVED_ASSET_TOKEN_SEPARATOR)
}

function decodeDerivedAssetToken(token: string): DerivedAssetTokenPayload | null {
  const [ivRaw, authTagRaw, encryptedRaw] = token.split(
    DERIVED_ASSET_TOKEN_SEPARATOR,
  )

  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    return null
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getTokenEncryptionKey(),
      Buffer.from(ivRaw, "base64url"),
    )

    decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"))

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8")
    const payload = JSON.parse(plaintext) as Partial<
      DerivedAssetTokenPayload & { version: number }
    >

    if (
      payload.version !== DERIVED_ASSET_TOKEN_VERSION ||
      typeof payload.accountId !== "string" ||
      typeof payload.assetId !== "string" ||
      typeof payload.expires !== "number" ||
      typeof payload.userId !== "string" ||
      payload.variant !== "image"
    ) {
      return null
    }

    return {
      accountId: payload.accountId,
      assetId: payload.assetId,
      expires: payload.expires,
      userId: payload.userId,
      variant: payload.variant,
    }
  } catch {
    return null
  }
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
  const payload: DerivedAssetTokenPayload = {
    accountId,
    assetId,
    expires,
    userId,
    variant,
  }
  const token = encodeDerivedAssetToken(payload)

  return new URLSearchParams({
    token,
  })
}

export function verifyDerivedAssetToken({
  assetId,
  token,
  variant,
}: Pick<DerivedAssetTokenPayload, "assetId" | "variant"> & {
  token: string
}): DerivedAssetTokenPayload | null {
  const payload = decodeDerivedAssetToken(token)

  if (!payload) {
    return null
  }

  const { expires } = payload

  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
    return null
  }

  if (payload.assetId !== assetId || payload.variant !== variant) {
    return null
  }

  return payload
}

import "server-only"

import { timingSafeEqual, webcrypto } from "node:crypto"

import { cookies } from "next/headers"

import { AUTH_SECRET } from "@/lib/auth/config"

const SECOND_FACTOR_COOKIE_NAME = "anatomy_2fa_verified"

async function signSecondFactorValue(sessionId: string) {
  const data = new TextEncoder().encode(sessionId)
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_SECRET),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  )
  const signature = await webcrypto.subtle.sign("HMAC", key, data)

  return Buffer.from(signature).toString("base64url")
}

async function createSecondFactorCookieValue(sessionId: string) {
  const signature = await signSecondFactorValue(sessionId)
  return `${sessionId}.${signature}`
}

async function isSecondFactorCookieValueValid(
  sessionId: string,
  cookieValue?: string | null,
) {
  if (!cookieValue) {
    return false
  }

  const [storedSessionId, storedSignature] = cookieValue.split(".")

  if (!storedSessionId || !storedSignature || storedSessionId !== sessionId) {
    return false
  }

  const expectedSignature = await signSecondFactorValue(sessionId)

  if (storedSignature.length !== expectedSignature.length) {
    return false
  }

  return timingSafeEqual(
    Buffer.from(storedSignature),
    Buffer.from(expectedSignature),
  )
}

function readSecondFactorCookieValueFromHeader(cookieHeader?: string | null) {
  if (!cookieHeader) {
    return null
  }

  const segments = cookieHeader.split(";")

  for (const segment of segments) {
    const [rawName, ...rest] = segment.trim().split("=")

    if (rawName === SECOND_FACTOR_COOKIE_NAME) {
      return rest.join("=")
    }
  }

  return null
}

export async function hasVerifiedSecondFactor(sessionId: string) {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(SECOND_FACTOR_COOKIE_NAME)?.value

  return isSecondFactorCookieValueValid(sessionId, cookieValue)
}

export async function hasVerifiedSecondFactorFromCookieHeader(
  sessionId: string,
  cookieHeader?: string | null,
) {
  return isSecondFactorCookieValueValid(
    sessionId,
    readSecondFactorCookieValueFromHeader(cookieHeader),
  )
}

export async function markSecondFactorVerified(sessionId: string) {
  const cookieStore = await cookies()

  cookieStore.set(SECOND_FACTOR_COOKIE_NAME, await createSecondFactorCookieValue(sessionId), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export async function clearSecondFactorVerification() {
  const cookieStore = await cookies()
  cookieStore.delete(SECOND_FACTOR_COOKIE_NAME)
}

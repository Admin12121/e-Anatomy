function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "")
}

export const AUTH_APP_NAME = "Anatomy Platform"

export const AUTH_BASE_URL = normalizeOrigin(
  process.env.BETTER_AUTH_URL ?? "http://localhost",
)

export const AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ??
  "anatomy_better_auth_dev_secret_that_is_long_enough"

export const AUTH_TRUSTED_ORIGINS = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

export const AUTH_GOOGLE_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
)

export const AUTH_PASSKEY_RP_ID =
  process.env.BETTER_AUTH_PASSKEY_RP_ID ?? new URL(AUTH_BASE_URL).hostname

export const AUTH_PASSKEY_ORIGINS = Array.from(
  new Set([AUTH_BASE_URL, ...AUTH_TRUSTED_ORIGINS].map(normalizeOrigin)),
)

export const AUTH_EMAIL_FROM =
  process.env.RESEND_FROM ??
  process.env.AUTH_EMAIL_FROM ??
  "Anatomy Platform <no-reply@localhost>"

export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? null

export function getAuthFeatureFlags() {
  const mailDeliveryConfigured = Boolean(RESEND_API_KEY)

  return {
    emailOtpEnabled: true,
    googleEnabled: AUTH_GOOGLE_ENABLED,
    mailDeliveryConfigured,
    passkeyEnabled: true,
    twoFactorEmailOtpEnabled: true,
    twoFactorTotpEnabled: true,
  }
}

import "server-only"

import { render, toPlainText } from "@react-email/render"
import { Resend } from "resend"
import { createElement, type ReactElement } from "react"

import { AuthOtpEmail } from "@/emails/auth-otp-email"
import {
  AUTH_BASE_URL,
  AUTH_EMAIL_FROM,
  RESEND_API_KEY,
} from "@/lib/auth/config"

type AuthEmailPayload = {
  react: ReactElement
  subject: string
  text: string
  to: string
}

const globalForResend = globalThis as typeof globalThis & {
  __anatomy_resend__?: Resend
}

function getResendClient() {
  if (!RESEND_API_KEY) {
    return null
  }

  if (globalForResend.__anatomy_resend__) {
    return globalForResend.__anatomy_resend__
  }

  const client = new Resend(RESEND_API_KEY)

  if (process.env.NODE_ENV !== "production") {
    globalForResend.__anatomy_resend__ = client
  }

  return client
}

export async function sendAuthEmail(payload: AuthEmailPayload) {
  const resend = getResendClient()

  if (!resend) {
    const preview = [
      "[auth-email]",
      `to=${payload.to}`,
      `subject=${payload.subject}`,
      payload.text,
    ].join("\n")

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Auth email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM.",
      )
    }

    console.info(preview)
    return
  }

  const { error } = await resend.emails.send({
    from: AUTH_EMAIL_FROM,
    react: payload.react,
    subject: payload.subject,
    text: payload.text,
    to: payload.to,
  })

  if (error) {
    throw new Error(
      `Resend email delivery failed: ${error.message ?? JSON.stringify(error)}`,
    )
  }
}

export async function formatOtpEmail({
  email,
  otp,
  type,
}: {
  email: string
  otp: string
  type:
    | "change-email"
    | "sign-in"
    | "email-verification"
    | "forget-password"
    | "two-factor"
}) {
  const subjectByType = {
    "change-email": "Confirm your email change",
    "email-verification": "Verify your email",
    "forget-password": "Reset your password",
    "sign-in": "Your sign-in code",
    "two-factor": "Your two-factor code",
  } as const

  const actionByType = {
    "change-email": "confirm your email change",
    "email-verification": "verify your email address",
    "forget-password": "reset your password",
    "sign-in": "sign in to your account",
    "two-factor": "finish signing in",
  } as const

  const subject = `${subjectByType[type]} | Anatomy Platform`
  const template = createElement(AuthOtpEmail, {
    actionLabel: actionByType[type],
    email,
    logoUrl: `${AUTH_BASE_URL}/logo.webp`,
    otp,
  })
  const html = await renderEmailTemplate(template)

  return {
    react: template,
    subject,
    text: toPlainText(html, {
      selectors: [
        {
          format: "skip",
          selector: "img",
        },
        {
          format: "skip",
          selector: "[data-skip-in-text=true]",
        },
        {
          options: {
            hideLinkHrefIfSameAsText: true,
            linkBrackets: false,
          },
          selector: "a",
        },
      ],
      wordwrap: false,
    }),
  }
}

async function renderEmailTemplate(template: ReactElement) {
  return render(template)
}

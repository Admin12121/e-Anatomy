import "server-only"

import { render, toPlainText } from "@react-email/render"
import nodemailer from "nodemailer"
import { createElement } from "react"

import { AuthOtpEmail } from "@/components/emails/auth-otp-email"
import {
  AUTH_BASE_URL,
  AUTH_EMAIL_FROM,
  AUTH_SMTP_HOST,
  AUTH_SMTP_PASSWORD,
  AUTH_SMTP_PORT,
  AUTH_SMTP_SECURE,
  AUTH_SMTP_URL,
  AUTH_SMTP_USER,
} from "@/lib/auth/config"

type AuthEmailPayload = {
  html: string
  subject: string
  text: string
  to: string
}

const globalForMailer = globalThis as typeof globalThis & {
  __anatomy_auth_mailer__?: nodemailer.Transporter
}

function getTransporter() {
  if (globalForMailer.__anatomy_auth_mailer__) {
    return globalForMailer.__anatomy_auth_mailer__
  }

  let transporter: nodemailer.Transporter | null = null

  if (AUTH_SMTP_URL) {
    transporter = nodemailer.createTransport(AUTH_SMTP_URL)
  } else if (AUTH_SMTP_HOST && AUTH_SMTP_PORT) {
    transporter = nodemailer.createTransport({
      auth:
        AUTH_SMTP_USER && AUTH_SMTP_PASSWORD
          ? {
              pass: AUTH_SMTP_PASSWORD,
              user: AUTH_SMTP_USER,
            }
          : undefined,
      host: AUTH_SMTP_HOST,
      port: AUTH_SMTP_PORT,
      secure: AUTH_SMTP_SECURE,
    })
  }

  if (!transporter) {
    return null
  }

  if (process.env.NODE_ENV !== "production") {
    globalForMailer.__anatomy_auth_mailer__ = transporter
  }

  return transporter
}

export async function sendAuthEmail(payload: AuthEmailPayload) {
  const transporter = getTransporter()

  if (!transporter) {
    const preview = [
      "[auth-email]",
      `to=${payload.to}`,
      `subject=${payload.subject}`,
      payload.text,
    ].join("\n")

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Auth email delivery is not configured. Set SMTP_URL or SMTP_HOST/SMTP_PORT.",
      )
    }

    console.info(preview)
    return
  }

  await transporter.sendMail({
    from: AUTH_EMAIL_FROM,
    html: payload.html,
    subject: payload.subject,
    text: payload.text,
    to: payload.to,
  })
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
    logoUrl: `${AUTH_BASE_URL}/logo.png`,
    otp,
  })
  const html = await renderEmailTemplate(template)

  return {
    html,
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

async function renderEmailTemplate(template: ReturnType<typeof createElement>) {
  return render(template)
}

import { passkey } from "@better-auth/passkey"
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import {
  customSession,
  emailOTP,
  twoFactor,
} from "better-auth/plugins"

import { hasAdminAccess } from "@/lib/auth/access"
import { baseAuthOptions } from "@/lib/auth/base-auth"
import {
  AUTH_APP_NAME,
  AUTH_PASSKEY_ORIGINS,
  AUTH_PASSKEY_RP_ID,
} from "@/lib/auth/config"
import { formatOtpEmail, sendAuthEmail } from "@/lib/auth/email"

const authOptions = {
  ...baseAuthOptions,
  plugins: [
    nextCookies(),
    emailOTP({
      changeEmail: {
        enabled: true,
      },
      disableSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        void formatOtpEmail({
          email,
          otp,
          type,
        })
          .then((message) =>
            sendAuthEmail({
              ...message,
              to: email,
            }),
          )
          .catch((error) => {
            console.error("Failed to send auth email OTP.", error)
          })
      },
    }),
    twoFactor({
      issuer: AUTH_APP_NAME,
      otpOptions: {
        async sendOTP({ otp, user }) {
          void formatOtpEmail({
            email: user.email,
            otp,
            type: "two-factor",
          })
            .then((message) =>
              sendAuthEmail({
                ...message,
                to: user.email,
              }),
            )
            .catch((error) => {
              console.error("Failed to send two-factor email OTP.", error)
            })
        },
      },
      totpOptions: {},
    }),
    passkey({
      origin: AUTH_PASSKEY_ORIGINS,
      rpID: AUTH_PASSKEY_RP_ID,
      rpName: AUTH_APP_NAME,
    }),
  ],
}

export const auth = betterAuth({
  ...authOptions,
  plugins: [
    ...(authOptions.plugins ?? []),
    customSession(
      async ({ user, session }) => {
        return {
          user: {
            ...user,
            canAccessAdmin: hasAdminAccess({
              apiAccountId: user.apiAccountId,
              roleCode: user.role,
            }),
          },
          session,
        }
      },
      authOptions,
    ),
  ],
})

export type AuthSession = typeof auth.$Infer.Session

import { betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { customSession } from "better-auth/plugins"

import { hasAdminAccess } from "@/lib/auth/access"
import { db } from "@/lib/db/client"
import * as authSchema from "@/lib/db/auth-schema"

const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const authOptions = {
  appName: "Anatomy Platform",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "anatomy_better_auth_dev_secret_that_is_long_enough",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "compact",
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false,
        required: false,
        defaultValue: "reviewer",
      },
      status: {
        type: "string",
        input: false,
        required: false,
        defaultValue: "active",
      },
      apiAccountId: {
        type: "string",
        input: false,
        required: false,
      },
      apiAccountSlug: {
        type: "string",
        input: false,
        required: false,
      },
      apiAccountName: {
        type: "string",
        input: false,
        required: false,
      },
      apiAccountType: {
        type: "string",
        input: false,
        required: false,
      },
    },
  },
  trustedOrigins: trustedOrigins.length > 0 ? trustedOrigins : undefined,
  plugins: [nextCookies()],
} satisfies BetterAuthOptions

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

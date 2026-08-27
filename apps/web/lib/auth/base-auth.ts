import { betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"

import {
  AUTH_APP_NAME,
  AUTH_BASE_URL,
  AUTH_GOOGLE_ENABLED,
  AUTH_SECRET,
  AUTH_TRUSTED_ORIGINS,
} from "@/lib/auth/runtime-config"
import { db } from "@/lib/db/client"
import * as authSchema from "@/lib/db/auth-schema"

export const baseAuthOptions = {
  appName: AUTH_APP_NAME,
  baseURL: AUTH_BASE_URL,
  secret: AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [sessionUser] = await db
            .select({ status: authSchema.user.status })
            .from(authSchema.user)
            .where(eq(authSchema.user.id, session.userId))
            .limit(1)

          if (sessionUser?.status && sessionUser.status !== "active") {
            throw new APIError("FORBIDDEN", {
              message:
                "This account is inactive. Contact an administrator for access.",
            })
          }

          return { data: session }
        },
        after: async (session) => {
          await db
            .update(authSchema.user)
            .set({ lastLoginAt: new Date() })
            .where(eq(authSchema.user.id, session.userId))
        },
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
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
        defaultValue: "viewer",
      },
      status: {
        type: "string",
        input: false,
        required: false,
        defaultValue: "active",
      },
      lastLoginAt: {
        type: "date",
        input: false,
        required: false,
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
      twoFactorEnabled: {
        type: "boolean",
        input: false,
        required: false,
        defaultValue: false,
      },
    },
  },
  socialProviders: AUTH_GOOGLE_ENABLED
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,
  trustedOrigins:
    AUTH_TRUSTED_ORIGINS.length > 0 ? AUTH_TRUSTED_ORIGINS : undefined,
} satisfies BetterAuthOptions

export function createBootstrapAuth() {
  return betterAuth(baseAuthOptions)
}

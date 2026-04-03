"use client"

import { passkeyClient } from "@better-auth/passkey/client"
import { createAuthClient } from "better-auth/react"
import {
  customSessionClient,
  emailOTPClient,
  inferAdditionalFields,
  twoFactorClient,
} from "better-auth/client/plugins"

import type { auth } from "@/lib/auth"

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    customSessionClient<typeof auth>(),
    emailOTPClient(),
    twoFactorClient(),
    passkeyClient(),
  ],
})

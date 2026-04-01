import { browserApiFetch } from "@/lib/api/browser"
import { ApiClientError } from "@/lib/api/errors"
import type { SessionResponse } from "@/lib/auth/types"

type AuthClientResult<T = unknown> = {
  data?: T
  error?: {
    message: string
  }
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message
  }

  return fallbackMessage
}

function unsupportedResult<T = unknown>(message: string): AuthClientResult<T> {
  return {
    error: {
      message,
    },
  }
}

export const authClient = {
  signIn: {
    async email({
      email,
      password,
    }: {
      email: string
      password: string
      callbackURL?: string
    }): Promise<AuthClientResult<SessionResponse>> {
      try {
        const session = await browserApiFetch<SessionResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        })

        return { data: session }
      } catch (error) {
        return unsupportedResult(getErrorMessage(error, "Unable to sign in"))
      }
    },
    async social({
      provider,
    }: {
      provider: "google" | "github"
      callbackURL?: string
    }): Promise<AuthClientResult> {
      const providerLabel = provider === "google" ? "Google" : "GitHub"

      return unsupportedResult(
        `${providerLabel} sign-in is not configured in this app yet`
      )
    },
    async passkey(_: { autoFill?: boolean }): Promise<AuthClientResult> {
      return unsupportedResult("Passkey sign-in is not configured in this app yet")
    },
  },
  signUp: {
    async email(_: {
      name: string
      email: string
      password: string
      callbackURL?: string
    }): Promise<AuthClientResult> {
      return unsupportedResult("Account creation is not configured in this app yet")
    },
  },
}

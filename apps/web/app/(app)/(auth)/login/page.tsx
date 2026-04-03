import { redirect } from "next/navigation"

import { LoginForm } from "./_components/login-form"
import { getAuthFeatureFlags } from "@/lib/auth/config"
import { getLoginMethodsForEmail } from "@/lib/auth/login-methods"
import { hasVerifiedSecondFactor } from "@/lib/auth/second-factor"
import {
  resolveAuthenticatedRedirectPath,
  sanitizeNextPath,
} from "@/lib/auth/access"
import { getSession } from "@/lib/auth/session"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const nextPath = sanitizeNextPath(params.next)
  const session = await getSession()
  const featureFlags = getAuthFeatureFlags()

  if (session) {
    const secondFactorVerified = session.user.twoFactorEnabled
      ? await hasVerifiedSecondFactor(session.session.id)
      : true

    if (!secondFactorVerified) {
      return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
          <div className="flex w-full max-w-sm flex-col gap-2">
            <LoginForm
              nextPath={nextPath ?? undefined}
              initialDiscovery={await getLoginMethodsForEmail(session.user.email)}
              initialEmail={session.user.email}
              initialStep="second-factor"
              googleConfigured={featureFlags.googleEnabled}
              resumeTwoFactorSession
            />
          </div>
        </div>
      )
    }

    redirect(
      resolveAuthenticatedRedirectPath({
        hasApiAccountId: Boolean(session.user.apiAccountId),
        nextPath,
        roleCode: session.user.role,
      }),
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-2">
        <LoginForm
          googleConfigured={featureFlags.googleEnabled}
          nextPath={nextPath ?? undefined}
        />
      </div>
    </div>
  )
}

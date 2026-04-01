import { redirect } from "next/navigation"

import { LoginForm } from "@/components/login-form"
import {
  DEFAULT_AUTHENTICATED_REDIRECT,
  sanitizeNextPath,
} from "@/lib/auth/access"
import { getSession } from "@/lib/auth/session"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const nextPath =
    sanitizeNextPath(params.next) ?? DEFAULT_AUTHENTICATED_REDIRECT
  const session = await getSession()

  if (session) {
    redirect(nextPath)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-2">
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  )
}

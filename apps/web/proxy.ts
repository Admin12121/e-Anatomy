import type { NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"
import { NextResponse } from "next/server"

import { createLoginRedirectPath } from "@/lib/auth/access"

// Better Auth recommends proxy for optimistic redirects only.
// Authoritative session and role checks stay in server routes/layouts.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (getSessionCookie(request)) {
    return NextResponse.next()
  }

  const loginUrl = new URL(
    createLoginRedirectPath(`${pathname}${search}`),
    request.url,
  )

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/dashboard/:path*", "/playground/:path*", "/settings/:path*"],
}

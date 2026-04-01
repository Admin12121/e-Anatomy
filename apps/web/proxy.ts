import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { AUTH_COOKIE_NAME, createLoginRedirectPath } from "@/lib/auth/access"

// Proxy only performs an optimistic cookie presence check.
// Secure session and role validation stay in the server-side auth DAL.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (request.cookies.has(AUTH_COOKIE_NAME)) {
    return NextResponse.next()
  }

  const loginUrl = new URL(
    createLoginRedirectPath(`${pathname}${search}`),
    request.url,
  )

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/admin/:path*"],
}

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { AUTH_COOKIE_NAME, isProtectedRoute } from "@/lib/auth/access"

export function proxy(request: NextRequest) {
  const { nextUrl } = request
  const { pathname, search } = nextUrl

  if (!isProtectedRoute(pathname)) {
    return NextResponse.next()
  }

  const hasSessionCookie = request.cookies.has(AUTH_COOKIE_NAME)

  if (hasSessionCookie) {
    return NextResponse.next()
  }

  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set("next", `${pathname}${search}`)

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.[^/]+$).*)",
  ],
}

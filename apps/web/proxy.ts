import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import {
  createLoginRedirectPath,
  hasAdminAccess,
  resolveAuthenticatedRedirectPath,
} from "@/lib/auth/access"

// Keep authoritative auth checks in layouts and route handlers.
// The proxy performs a fast server-side session validation so protected admin
// routes do not bounce on stale or missing client cookie cache state.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    })

    if (!session) {
      const loginUrl = new URL(
        createLoginRedirectPath(`${pathname}${search}`),
        request.url,
      )

      return NextResponse.redirect(loginUrl)
    }

    if (
      !hasAdminAccess({
        apiAccountId: session.user.apiAccountId,
        roleCode: session.user.role,
      })
    ) {
      const destination = resolveAuthenticatedRedirectPath({
        hasApiAccountId: Boolean(session.user.apiAccountId),
        roleCode: session.user.role,
      })

      if (destination !== pathname) {
        return NextResponse.redirect(new URL(destination, request.url))
      }
    }

    return NextResponse.next()
  } catch {
    const loginUrl = new URL(
      createLoginRedirectPath(`${pathname}${search}`),
      request.url,
    )

    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/playground/:path*", "/settings/:path*"],
}

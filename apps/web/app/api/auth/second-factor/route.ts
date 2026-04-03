import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import {
  clearSecondFactorVerification,
  markSecondFactorVerified,
} from "@/lib/auth/second-factor"

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: {
      disableCookieCache: true,
    },
  })

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.twoFactorEnabled) {
    await markSecondFactorVerified(session.session.id)
  } else {
    await clearSecondFactorVerification()
  }

  return NextResponse.json({ success: true })
}

export async function DELETE() {
  await clearSecondFactorVerification()
  return NextResponse.json({ success: true })
}

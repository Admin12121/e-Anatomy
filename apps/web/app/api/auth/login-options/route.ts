import { NextResponse } from "next/server"

import { getLoginMethodsForEmail } from "@/lib/auth/login-methods"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email") ?? ""

  if (!email.trim()) {
    return NextResponse.json(
      { error: "Email is required." },
      { status: 400 },
    )
  }

  return NextResponse.json(await getLoginMethodsForEmail(email))
}

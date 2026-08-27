import { and, eq, ne } from "drizzle-orm"
import { NextResponse } from "next/server"

import {
  hasCapability,
  normalizeRoleCode,
  type RoleCode,
} from "@/lib/auth/access"
import { requireApiSession } from "@/lib/auth/session"
import { session, user } from "@/lib/db/auth-schema"
import { db } from "@/lib/db/client"

const ALLOWED_ROLES = new Set<RoleCode>(["admin", "editor", "viewer"])
const ALLOWED_STATUSES = new Set(["active", "inactive"])

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actor = await requireApiSession(request.headers)

  if (!actor) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  if (!hasCapability(actor.user.roleCode, "manage_users")) {
    return jsonError(
      403,
      "forbidden",
      "Only Owner/Admin users can manage accounts.",
    )
  }

  const { userId } = await params

  if (userId === actor.user.id) {
    return jsonError(
      409,
      "self_update_blocked",
      "Use account settings for your own security-sensitive changes.",
    )
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonError(400, "invalid_json", "Provide a valid JSON body.")
  }

  if (!body || typeof body !== "object") {
    return jsonError(400, "invalid_request", "No user changes were provided.")
  }

  const input = body as { role?: unknown; status?: unknown }
  const role =
    typeof input.role === "string" &&
    ALLOWED_ROLES.has(input.role as RoleCode)
      ? (input.role as RoleCode)
      : undefined
  const status = typeof input.status === "string" ? input.status : undefined

  if (input.role !== undefined && !role) {
    return jsonError(400, "invalid_role", "Choose a supported role.")
  }

  if (
    input.status !== undefined &&
    (!status || !ALLOWED_STATUSES.has(status))
  ) {
    return jsonError(400, "invalid_status", "Choose a supported status.")
  }

  if (!role && !status) {
    return jsonError(400, "invalid_request", "No user changes were provided.")
  }

  const [target] = await db
    .select({
      id: user.id,
      role: user.role,
      status: user.status,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!target) {
    return jsonError(404, "not_found", "User not found.")
  }

  const roleChanged = role && normalizeRoleCode(target.role) !== role
  const deactivated = status === "inactive" && target.status !== "inactive"

  await db.transaction(async (transaction) => {
    await transaction
      .update(user)
      .set({
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, userId), ne(user.id, actor.user.id)))

    if (roleChanged || deactivated) {
      await transaction.delete(session).where(eq(session.userId, userId))
    }
  })

  return NextResponse.json({
    user: {
      id: userId,
      role: role ?? normalizeRoleCode(target.role),
      status: status ?? target.status,
    },
  })
}

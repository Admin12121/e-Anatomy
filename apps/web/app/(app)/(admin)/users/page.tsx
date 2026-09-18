import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
} from "drizzle-orm"
import { CircleCheckIcon } from "lucide-react"
import Link from "next/link"

import { UsersFilters } from "./_components/users-filters"
import { UserActions } from "./_components/user-actions"
import { Badge } from "@/components/ui/badge"
import { Frame } from "@/components/ui/frame"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TablePagination } from "@/components/ui/table-pagination"
import { getRoleLabel, normalizeRoleCode } from "@/lib/auth/access"
import { requireAdminSession } from "@/lib/auth/session"
import { user as authUser } from "@/lib/db/auth-schema"
import { db } from "@/lib/db/client"

const PAGE_SIZE = 25

const ROLE_FILTERS = {
  admin: ["admin", "owner", "platform_admin"],
  editor: ["editor", "content_admin"],
  viewer: ["viewer", "reviewer"],
} as const

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Never"
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value)
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireAdminSession("/users")
  const params = await searchParams
  const search = readParam(params.search).trim()
  const requestedRole = readParam(params.role)
  const requestedStatus = readParam(params.status)
  const role =
    requestedRole in ROLE_FILTERS
      ? (requestedRole as keyof typeof ROLE_FILTERS)
      : "all"
  const status =
    requestedStatus === "active" || requestedStatus === "inactive"
      ? requestedStatus
      : "all"
  const requestedPage = Number.parseInt(readParam(params.page), 10)
  const conditions: SQL[] = []

  if (search) {
    const searchCondition = or(
      ilike(authUser.name, `%${search}%`),
      ilike(authUser.email, `%${search}%`),
    )

    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  if (role !== "all") {
    conditions.push(inArray(authUser.role, [...ROLE_FILTERS[role]]))
  }

  if (status !== "all") {
    conditions.push(
      status === "active"
        ? eq(authUser.status, "active")
        : ne(authUser.status, "active"),
    )
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const [totalResult] = await db
    .select({ value: count() })
    .from(authUser)
    .where(where)
  const total = Number(totalResult?.value ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages,
  )
  const users = await db
    .select({
      createdAt: authUser.createdAt,
      email: authUser.email,
      emailVerified: authUser.emailVerified,
      id: authUser.id,
      lastLoginAt: authUser.lastLoginAt,
      name: authUser.name,
      role: authUser.role,
      status: authUser.status,
    })
    .from(authUser)
    .where(where)
    .orderBy(desc(authUser.createdAt), authUser.name)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const baseParams = new URLSearchParams()

  if (search) baseParams.set("search", search)
  if (role !== "all") baseParams.set("role", role)
  if (status !== "all") baseParams.set("status", status)

  const baseUrl = baseParams.size
    ? `/users?${baseParams.toString()}`
    : "/users"

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <UsersFilters
        initialRole={role}
        initialSearch={search}
        initialStatus={status}
      />

      <Frame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Users — {total}</TableHead>
              <TableHead className="w-40">Role</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-44">Last login</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-28 text-center text-muted-foreground"
                >
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((item) => {
                const normalizedStatus =
                  item.status === "active" ? "active" : "inactive"

                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        href={`/users/${encodeURIComponent(item.id)}`}
                      >
                        {item.name}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Joined {formatDate(item.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getRoleLabel(normalizeRoleCode(item.role))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          normalizedStatus === "active"
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {normalizedStatus === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{item.email}</span>
                        {item.emailVerified ? (
                          <CircleCheckIcon
                            aria-label="Email verified"
                            className="size-4 shrink-0 text-emerald-500"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(item.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActions
                        currentUserId={user.id}
                        role={item.role}
                        status={item.status}
                        userId={item.id}
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Frame>

      <TablePagination
        baseUrl={baseUrl}
        currentPage={page}
        pageSize={PAGE_SIZE}
        totalItems={total}
        totalPages={totalPages}
      />
    </div>
  )
}

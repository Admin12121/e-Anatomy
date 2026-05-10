import { eq } from "drizzle-orm"

import { createBootstrapAuth } from "../lib/auth/base-auth"
import { user } from "../lib/db/auth-schema"
import { db, sql } from "../lib/db/client"
import { apiAccounts } from "../lib/db/legacy-schema"

async function main() {
  const auth = createBootstrapAuth()
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@gmail.com")
    .trim()
    .toLowerCase()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin@#12"
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Platform Admin"
  const accountSlug = process.env.BOOTSTRAP_ADMIN_ACCOUNT_SLUG ?? "platform-admin"

  const [account] = await db
    .select({
      accountType: apiAccounts.accountType,
      id: apiAccounts.id,
      name: apiAccounts.name,
      slug: apiAccounts.slug,
    })
    .from(apiAccounts)
    .where(eq(apiAccounts.slug, accountSlug))
    .limit(1)

  if (!account) {
    throw new Error(
      `Bootstrap account '${accountSlug}' was not found. Start the Rust API migrations first.`,
    )
  }

  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!existingUser) {
    await auth.api.signUpEmail({
      body: {
        email,
        name,
        password,
      },
    })
  }

  const [authUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!authUser) {
    throw new Error(`Bootstrap auth user '${email}' was not created.`)
  }

  await db
    .update(user)
    .set({
      apiAccountId: account.id,
      apiAccountName: account.name,
      apiAccountSlug: account.slug,
      apiAccountType: account.accountType,
      emailVerified: true,
      name,
      role: "owner",
      status: "active",
    })
    .where(eq(user.email, email))

  await sql`
    INSERT INTO account_memberships (account_id, user_id, role_code, status, joined_at)
    VALUES (${account.id}, ${authUser.id}, 'owner', 'active', NOW())
    ON CONFLICT (account_id, user_id)
    DO UPDATE SET
      role_code = EXCLUDED.role_code,
      status = EXCLUDED.status
  `

  await sql`
    UPDATE accounts
    SET owner_user_id = ${authUser.id},
        updated_at = NOW()
    WHERE id = ${account.id}
      AND owner_user_id IS DISTINCT FROM ${authUser.id}
  `

  console.log(`Bootstrap auth user '${email}' is ready for account '${account.slug}'.`)
}

main()
  .catch((error) => {
    console.error("Failed to bootstrap Better Auth admin.", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await sql.end({ timeout: 5 })
  })

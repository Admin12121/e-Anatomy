import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { createBootstrapAuth } from "../lib/auth/base-auth"
import { user } from "../lib/db/auth-schema"
import { db, sql } from "../lib/db/client"
import { apiAccounts } from "../lib/db/legacy-schema"

type BootstrapAccount = {
  accountType: string
  id: string
  name: string
  slug: string
}

async function findAccount(accountSlug: string): Promise<BootstrapAccount | undefined> {
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

  return account
}

async function ensureBootstrapAccount({
  accountName,
  accountSlug,
  accountType,
}: {
  accountName: string
  accountSlug: string
  accountType: string
}): Promise<BootstrapAccount> {
  const existingAccount = await findAccount(accountSlug)
  if (existingAccount) {
    return existingAccount
  }

  // A brand-new database has the API schema after the Rust migrations run,
  // but it may not have a platform account yet. Seed only the one account that
  // the auth bootstrap needs. This is intentionally idempotent: if another
  // bootstrap creates it first, ON CONFLICT leaves that row untouched.
  await db
    .insert(apiAccounts)
    .values({
      accountType,
      id: randomUUID(),
      name: accountName,
      slug: accountSlug,
      status: "active",
    })
    .onConflictDoNothing({ target: apiAccounts.slug })

  const createdAccount = await findAccount(accountSlug)
  if (!createdAccount) {
    throw new Error(`Bootstrap account '${accountSlug}' could not be created.`)
  }

  console.log(`Created bootstrap API account '${createdAccount.slug}'.`)
  return createdAccount
}

async function main() {
  const auth = createBootstrapAuth()
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@gmail.com")
    .trim()
    .toLowerCase()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin@#12"
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Platform Admin"
  const accountSlug = (process.env.BOOTSTRAP_ADMIN_ACCOUNT_SLUG ?? "platform-admin").trim()
  const accountName = (process.env.BOOTSTRAP_ADMIN_ACCOUNT_NAME ?? "Platform Admin").trim()
  const accountType = (process.env.BOOTSTRAP_ADMIN_ACCOUNT_TYPE ?? "system").trim()

  if (!accountSlug) {
    throw new Error("BOOTSTRAP_ADMIN_ACCOUNT_SLUG cannot be empty.")
  }

  let account: BootstrapAccount
  try {
    account = await ensureBootstrapAccount({
      accountName,
      accountSlug,
      accountType,
    })
  } catch (error) {
    // Keep a useful distinction between a missing seed row (which we now fix)
    // and the API schema itself not being available yet.
    if (
      error instanceof Error &&
      (error.message.includes('relation "accounts" does not exist') ||
        error.message.includes("relation 'accounts' does not exist"))
    ) {
      throw new Error(
        "The API database schema is not ready. Start the Rust API and let its migrations finish before bootstrapping the web app.",
        { cause: error },
      )
    }

    throw error
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

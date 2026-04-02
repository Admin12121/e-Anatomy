import { eq } from "drizzle-orm"

import { auth } from "../lib/auth"
import { user } from "../lib/db/auth-schema"
import { db, sql } from "../lib/db/client"
import { apiAccounts } from "../lib/db/legacy-schema"

async function main() {
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

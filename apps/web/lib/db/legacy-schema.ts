import { pgTable, text, uuid } from "drizzle-orm/pg-core"

export const apiAccounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull(),
  status: text("status").notNull(),
})

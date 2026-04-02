import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

const connectionString =
  process.env.DATABASE_URL ??
  process.env.AUTH_DATABASE_URL ??
  "postgres://anatomy:anatomy@localhost:5432/anatomy"

const globalForDb = globalThis as typeof globalThis & {
  __anatomy_postgres__?: ReturnType<typeof postgres>
}

export const sql =
  globalForDb.__anatomy_postgres__ ??
  postgres(connectionString, {
    max: 10,
    prepare: false,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.__anatomy_postgres__ = sql
}

export const db = drizzle(sql)

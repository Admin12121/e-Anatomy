import { defineConfig } from "drizzle-kit"

const url = process.env.DATABASE_URL ?? process.env.AUTH_DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL or AUTH_DATABASE_URL must be set for Drizzle.")
}

export default defineConfig({
  schema: ["./lib/db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  strict: true,
  verbose: true,
})

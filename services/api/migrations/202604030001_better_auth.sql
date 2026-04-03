CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
    "image" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "role" TEXT DEFAULT 'reviewer',
    "status" TEXT DEFAULT 'active',
    "api_account_id" TEXT,
    "api_account_slug" TEXT,
    "api_account_name" TEXT,
    "api_account_type" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT FALSE
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'user'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user'
          AND column_name = 'two_factor_enabled'
    ) THEN
        ALTER TABLE "user"
            ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT PRIMARY KEY,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ,
    "refresh_token_expires_at" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "twoFactor" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "passkey" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "public_key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "credential_id" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "transports" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "aaguid" TEXT
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("user_id");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("user_id");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX IF NOT EXISTS "two_factor_secret_idx" ON "twoFactor" ("secret");
CREATE INDEX IF NOT EXISTS "two_factor_userId_idx" ON "twoFactor" ("user_id");
CREATE INDEX IF NOT EXISTS "passkey_credentialID_idx" ON "passkey" ("credential_id");
CREATE INDEX IF NOT EXISTS "passkey_userId_idx" ON "passkey" ("user_id");

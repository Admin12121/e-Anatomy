CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified_at TIMESTAMPTZ,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'invited', 'disabled'))
);

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    auth_organization_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT accounts_type_check CHECK (account_type IN ('personal', 'institution', 'publisher', 'system')),
    CONSTRAINT accounts_status_check CHECK (status IN ('active', 'archived', 'disabled'))
);

CREATE TABLE IF NOT EXISTS account_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (account_id, user_id),
    CONSTRAINT account_memberships_status_check CHECK (status IN ('active', 'invited', 'disabled'))
);

CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    subtitle TEXT,
    status TEXT NOT NULL DEFAULT 'draftable',
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT modules_status_check CHECK (status IN ('draftable', 'publishable', 'archived'))
);

CREATE TABLE IF NOT EXISTS module_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    version_no INT NOT NULL,
    state TEXT NOT NULL DEFAULT 'draft',
    title_override TEXT,
    summary TEXT,
    learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
    viewer_layout_code TEXT NOT NULL DEFAULT 'single-stack',
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, version_no),
    CONSTRAINT module_versions_state_check CHECK (state IN ('draft', 'in_review', 'approved', 'published', 'retired'))
);

CREATE TABLE IF NOT EXISTS published_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    module_version_id UUID NOT NULL REFERENCES module_versions(id) ON DELETE CASCADE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    release_notes TEXT,
    is_current BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_account_memberships_user_account ON account_memberships (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_modules_account_created_at ON modules (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_module_versions_module_created_at ON module_versions (module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_releases_module_current ON published_releases (module_id, is_current);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions (session_token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expires ON auth_sessions (user_id, expires_at DESC);

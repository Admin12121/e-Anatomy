CREATE TABLE IF NOT EXISTS anatomy_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    body_view TEXT NOT NULL DEFAULT 'anterior',
    anchor_x DOUBLE PRECISION NOT NULL,
    anchor_y DOUBLE PRECISION NOT NULL,
    anchor_z DOUBLE PRECISION NOT NULL,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, slug),
    CONSTRAINT anatomy_zones_body_view_check CHECK (body_view IN ('anterior', 'posterior'))
);

CREATE INDEX IF NOT EXISTS idx_anatomy_zones_account_name
    ON anatomy_zones (account_id, name ASC);

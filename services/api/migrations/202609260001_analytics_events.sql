CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    event_name TEXT NOT NULL,
    visitor_id UUID NOT NULL,
    user_id TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    original_referrer TEXT,
    session_referrer TEXT,
    path TEXT,
    content_id UUID REFERENCES anatomy_zone_modality_families(id) ON DELETE SET NULL,
    modality_id UUID REFERENCES anatomy_zone_modalities(id) ON DELETE SET NULL,
    structure_id UUID REFERENCES anatomy_structures(id) ON DELETE SET NULL,
    zone_id UUID REFERENCES anatomy_zones(id) ON DELETE SET NULL,
    country_code VARCHAR(2),
    ip_hash TEXT,
    device_hash TEXT,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT analytics_events_name_check CHECK (
        event_name IN (
            'page_view',
            'account_created',
            'structure_selected',
            'content_engaged',
            'subscription_activated',
            'subscription_canceled'
        )
    ),
    CONSTRAINT analytics_events_country_code_check CHECK (
        country_code IS NULL OR country_code ~ '^[A-Z]{2}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_account_occurred
    ON analytics_events (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_content_occurred
    ON analytics_events (content_id, occurred_at DESC)
    WHERE content_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_occurred
    ON analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_occurred
    ON analytics_events (visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_rate_limit
    ON analytics_events (ip_hash, received_at DESC)
    WHERE ip_hash IS NOT NULL;

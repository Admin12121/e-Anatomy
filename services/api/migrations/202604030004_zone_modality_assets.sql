CREATE TABLE IF NOT EXISTS anatomy_zone_modality_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modality_id UUID NOT NULL REFERENCES anatomy_zone_modalities(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    asset_kind TEXT NOT NULL DEFAULT 'slice',
    weighting_code TEXT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT NULL,
    created_by_user_id TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT anatomy_zone_modality_assets_asset_kind_check CHECK (
        asset_kind IN ('slice', 'cover', 'overview', 'reference')
    ),
    CONSTRAINT anatomy_zone_modality_assets_weighting_code_check CHECK (
        weighting_code IS NULL
        OR weighting_code IN ('t1', 't1_gado', 't2', 't2_star', 'flair', 'adc', 'dwi', 'other')
    ),
    CONSTRAINT anatomy_zone_modality_assets_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS anatomy_zone_modality_assets_modality_sort_idx
    ON anatomy_zone_modality_assets (modality_id, sort_order, created_at);

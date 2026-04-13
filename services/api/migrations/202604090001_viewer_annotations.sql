CREATE TABLE IF NOT EXISTS anatomy_structure_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modality_id UUID NOT NULL REFERENCES anatomy_zone_modalities(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    color_hex TEXT NOT NULL DEFAULT '#38bdf8',
    icon_name TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (modality_id, slug),
    CONSTRAINT anatomy_structure_groups_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS anatomy_structure_groups_modality_sort_idx
    ON anatomy_structure_groups (modality_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS anatomy_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modality_id UUID NOT NULL REFERENCES anatomy_zone_modalities(id) ON DELETE CASCADE,
    group_id UUID REFERENCES anatomy_structure_groups(id) ON DELETE SET NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    latin_name TEXT,
    short_description TEXT,
    long_description TEXT,
    synonyms JSONB NOT NULL DEFAULT '[]'::jsonb,
    learning_points JSONB NOT NULL DEFAULT '[]'::jsonb,
    access_level TEXT NOT NULL DEFAULT 'free',
    is_pinned_default BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (modality_id, slug),
    CONSTRAINT anatomy_structures_access_level_check CHECK (
        access_level IN ('free', 'subscription')
    ),
    CONSTRAINT anatomy_structures_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS anatomy_structures_modality_sort_idx
    ON anatomy_structures (modality_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS anatomy_structures_group_sort_idx
    ON anatomy_structures (group_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS anatomy_structure_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES anatomy_zone_modality_assets(id) ON DELETE CASCADE,
    structure_id UUID NOT NULL REFERENCES anatomy_structures(id) ON DELETE CASCADE,
    title_override TEXT,
    color_hex TEXT,
    leader_color_hex TEXT,
    overlay_color_hex TEXT,
    overlay_opacity DOUBLE PRECISION NOT NULL DEFAULT 0.44,
    anchor_x DOUBLE PRECISION NOT NULL,
    anchor_y DOUBLE PRECISION NOT NULL,
    label_x DOUBLE PRECISION NOT NULL,
    label_y DOUBLE PRECISION NOT NULL,
    leader_bend_x DOUBLE PRECISION,
    leader_bend_y DOUBLE PRECISION,
    polygon_points JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    is_visible_default BOOLEAN NOT NULL DEFAULT TRUE,
    is_targeted_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_practice_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, structure_id),
    CONSTRAINT anatomy_structure_annotations_overlay_opacity_check CHECK (
        overlay_opacity >= 0.0 AND overlay_opacity <= 1.0
    ),
    CONSTRAINT anatomy_structure_annotations_anchor_x_check CHECK (
        anchor_x >= 0.0 AND anchor_x <= 1.0
    ),
    CONSTRAINT anatomy_structure_annotations_anchor_y_check CHECK (
        anchor_y >= 0.0 AND anchor_y <= 1.0
    ),
    CONSTRAINT anatomy_structure_annotations_label_x_check CHECK (
        label_x >= 0.0 AND label_x <= 1.0
    ),
    CONSTRAINT anatomy_structure_annotations_label_y_check CHECK (
        label_y >= 0.0 AND label_y <= 1.0
    ),
    CONSTRAINT anatomy_structure_annotations_sort_order_check CHECK (
        sort_order >= 0
    )
);

CREATE INDEX IF NOT EXISTS anatomy_structure_annotations_asset_sort_idx
    ON anatomy_structure_annotations (asset_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS anatomy_structure_annotations_structure_idx
    ON anatomy_structure_annotations (structure_id, created_at);

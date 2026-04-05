CREATE TABLE IF NOT EXISTS anatomy_zone_modalities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID NOT NULL REFERENCES anatomy_zones(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    modality_type TEXT NOT NULL,
    cover_image_url TEXT,
    source_kind TEXT NOT NULL DEFAULT 'manual',
    source_label TEXT,
    source_file_count INT NOT NULL DEFAULT 0,
    processing_status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT anatomy_zone_modalities_modality_type_check CHECK (
        modality_type IN (
            'mri',
            'ct',
            'mra',
            'mrv',
            'angiography',
            'cbct',
            'illustration',
            'photography',
            'endoscopy',
            'other'
        )
    ),
    CONSTRAINT anatomy_zone_modalities_source_kind_check CHECK (
        source_kind IN ('manual', 'zip', 'dicom_files')
    ),
    CONSTRAINT anatomy_zone_modalities_processing_status_check CHECK (
        processing_status IN ('draft', 'uploaded', 'processing', 'ready', 'failed')
    ),
    CONSTRAINT anatomy_zone_modalities_source_file_count_check CHECK (source_file_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_anatomy_zone_modalities_zone_created_at
    ON anatomy_zone_modalities (zone_id, created_at DESC);

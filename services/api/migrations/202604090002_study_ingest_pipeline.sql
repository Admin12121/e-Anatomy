CREATE TABLE IF NOT EXISTS anatomy_modality_ingest_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modality_id UUID NOT NULL REFERENCES anatomy_zone_modalities(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL,
    source_label TEXT,
    source_file_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploaded',
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT anatomy_modality_ingest_jobs_source_kind_check CHECK (
        source_kind IN ('zip', 'dicom_files')
    ),
    CONSTRAINT anatomy_modality_ingest_jobs_status_check CHECK (
        status IN (
            'uploaded',
            'queued',
            'validating',
            'needs_review',
            'deriving',
            'failed',
            'ready_for_edit',
            'cancelled'
        )
    ),
    CONSTRAINT anatomy_modality_ingest_jobs_source_file_count_check CHECK (
        source_file_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS anatomy_modality_ingest_jobs_modality_created_idx
    ON anatomy_modality_ingest_jobs (modality_id, created_at DESC);

ALTER TABLE anatomy_zone_modalities
    ADD COLUMN IF NOT EXISTS latest_ingest_job_id UUID REFERENCES anatomy_modality_ingest_jobs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS anatomy_modality_source_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modality_id UUID NOT NULL REFERENCES anatomy_zone_modalities(id) ON DELETE CASCADE,
    ingest_job_id UUID NOT NULL REFERENCES anatomy_modality_ingest_jobs(id) ON DELETE CASCADE,
    asset_role TEXT NOT NULL DEFAULT 'source_file',
    original_file_name TEXT NOT NULL,
    relative_path TEXT,
    storage_backend TEXT NOT NULL DEFAULT 'local_disk',
    storage_key TEXT NOT NULL,
    checksum TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT anatomy_modality_source_assets_asset_role_check CHECK (
        asset_role IN ('source_bundle', 'source_file')
    ),
    CONSTRAINT anatomy_modality_source_assets_storage_backend_check CHECK (
        storage_backend IN ('local_disk')
    ),
    CONSTRAINT anatomy_modality_source_assets_size_bytes_check CHECK (
        size_bytes >= 0
    )
);

CREATE INDEX IF NOT EXISTS anatomy_modality_source_assets_ingest_idx
    ON anatomy_modality_source_assets (ingest_job_id, created_at);

CREATE INDEX IF NOT EXISTS anatomy_modality_source_assets_modality_idx
    ON anatomy_modality_source_assets (modality_id, created_at);

CREATE TABLE IF NOT EXISTS anatomy_viewer_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modality_id UUID NOT NULL UNIQUE REFERENCES anatomy_zone_modalities(id) ON DELETE CASCADE,
    ingest_job_id UUID NOT NULL REFERENCES anatomy_modality_ingest_jobs(id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL DEFAULT 'draft-1',
    manifest_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE anatomy_zone_modality_assets
    ADD COLUMN IF NOT EXISTS ingest_job_id UUID REFERENCES anatomy_modality_ingest_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS storage_backend TEXT,
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS checksum TEXT,
    ADD COLUMN IF NOT EXISTS mime_type TEXT,
    ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS width INT,
    ADD COLUMN IF NOT EXISTS height INT,
    ADD COLUMN IF NOT EXISTS source_relative_path TEXT,
    ADD COLUMN IF NOT EXISTS series_uid TEXT,
    ADD COLUMN IF NOT EXISTS series_label TEXT,
    ADD COLUMN IF NOT EXISTS instance_uid TEXT,
    ADD COLUMN IF NOT EXISTS slice_index INT,
    ADD COLUMN IF NOT EXISTS orientation_code TEXT;

ALTER TABLE anatomy_zone_modality_assets
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_assets_asset_kind_check;

ALTER TABLE anatomy_zone_modality_assets
    ADD CONSTRAINT anatomy_zone_modality_assets_asset_kind_check CHECK (
        asset_kind IN ('slice', 'cover', 'overview', 'reference', 'derived_slice')
    );

ALTER TABLE anatomy_zone_modality_assets
    ADD CONSTRAINT anatomy_zone_modality_assets_storage_backend_check CHECK (
        storage_backend IS NULL OR storage_backend IN ('local_disk')
    );

ALTER TABLE anatomy_zone_modality_assets
    ADD CONSTRAINT anatomy_zone_modality_assets_size_bytes_check CHECK (
        size_bytes IS NULL OR size_bytes >= 0
    );

CREATE INDEX IF NOT EXISTS anatomy_zone_modality_assets_ingest_idx
    ON anatomy_zone_modality_assets (ingest_job_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS anatomy_zone_modality_assets_series_slice_idx
    ON anatomy_zone_modality_assets (modality_id, series_uid, slice_index);

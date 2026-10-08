CREATE TABLE anatomy_image_library (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    modality_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','processing','editable','encoding','ready','failed')),
    revision INTEGER NOT NULL DEFAULT 1,
    slice_count INTEGER NOT NULL DEFAULT 0,
    manifest JSONB NOT NULL DEFAULT '{}',
    progress INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX anatomy_image_library_account_created ON anatomy_image_library(account_id, created_at DESC);
ALTER TABLE anatomy_zone_modalities ADD COLUMN library_study_id UUID REFERENCES anatomy_image_library(id) ON DELETE SET NULL;
ALTER TABLE anatomy_zone_modalities DROP CONSTRAINT anatomy_zone_modalities_source_kind_check;
ALTER TABLE anatomy_zone_modalities ADD CONSTRAINT anatomy_zone_modalities_source_kind_check CHECK (source_kind IN ('manual','zip','dicom_files','library'));
ALTER TABLE anatomy_modality_ingest_jobs DROP CONSTRAINT anatomy_modality_ingest_jobs_source_kind_check;
ALTER TABLE anatomy_modality_ingest_jobs ADD CONSTRAINT anatomy_modality_ingest_jobs_source_kind_check CHECK (source_kind IN ('zip','dicom_files','library'));

CREATE TABLE IF NOT EXISTS anatomy_zone_modality_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID NOT NULL REFERENCES anatomy_zones(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    modality_type TEXT NOT NULL,
    notes TEXT,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT anatomy_zone_modality_families_modality_type_check CHECK (
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
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anatomy_zone_modality_families_zone_type_name
    ON anatomy_zone_modality_families (zone_id, modality_type, lower(trim(name)));

ALTER TABLE anatomy_zone_modalities
    ADD COLUMN IF NOT EXISTS family_id UUID;

WITH normalized_modalities AS (
    SELECT
        modality.id,
        modality.zone_id,
        modality.name,
        modality.modality_type,
        modality.notes,
        modality.created_by_user_id,
        modality.updated_by_user_id,
        modality.created_at,
        modality.updated_at,
        lower(trim(modality.name)) AS normalized_name
    FROM anatomy_zone_modalities AS modality
),
representative_modalities AS (
    SELECT DISTINCT ON (zone_id, modality_type, normalized_name)
        zone_id,
        modality_type,
        normalized_name,
        name,
        notes,
        created_by_user_id,
        updated_by_user_id
    FROM normalized_modalities
    ORDER BY zone_id, modality_type, normalized_name, updated_at DESC, created_at DESC, id DESC
),
family_seeds AS (
    SELECT
        gen_random_uuid() AS family_id,
        representative.zone_id,
        representative.modality_type,
        representative.normalized_name,
        representative.name,
        representative.notes,
        representative.created_by_user_id,
        representative.updated_by_user_id,
        MIN(modality.created_at) AS created_at,
        MAX(modality.updated_at) AS updated_at
    FROM representative_modalities AS representative
    INNER JOIN normalized_modalities AS modality
        ON modality.zone_id = representative.zone_id
        AND modality.modality_type = representative.modality_type
        AND modality.normalized_name = representative.normalized_name
    GROUP BY
        representative.zone_id,
        representative.modality_type,
        representative.normalized_name,
        representative.name,
        representative.notes,
        representative.created_by_user_id,
        representative.updated_by_user_id
)
INSERT INTO anatomy_zone_modality_families (
    id,
    zone_id,
    name,
    modality_type,
    notes,
    created_by_user_id,
    updated_by_user_id,
    created_at,
    updated_at
)
SELECT
    family_id,
    zone_id,
    name,
    modality_type,
    notes,
    created_by_user_id,
    updated_by_user_id,
    created_at,
    updated_at
FROM family_seeds AS seeds
WHERE NOT EXISTS (
    SELECT 1
    FROM anatomy_zone_modality_families AS existing
    WHERE existing.zone_id = seeds.zone_id
        AND existing.modality_type = seeds.modality_type
        AND lower(trim(existing.name)) = seeds.normalized_name
);

WITH normalized_modalities AS (
    SELECT
        modality.id,
        modality.zone_id,
        modality.modality_type,
        lower(trim(modality.name)) AS normalized_name
    FROM anatomy_zone_modalities AS modality
)
UPDATE anatomy_zone_modalities AS modality
SET family_id = family_lookup.id
FROM (
    SELECT
        family.id,
        modality.id AS modality_id
    FROM anatomy_zone_modality_families AS family
    INNER JOIN normalized_modalities AS modality
        ON modality.zone_id = family.zone_id
        AND modality.modality_type = family.modality_type
        AND modality.normalized_name = lower(trim(family.name))
) AS family_lookup
WHERE modality.id = family_lookup.modality_id
    AND modality.family_id IS NULL;

ALTER TABLE anatomy_zone_modalities
    ALTER COLUMN family_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'anatomy_zone_modalities_family_id_fkey'
    ) THEN
        ALTER TABLE anatomy_zone_modalities
            ADD CONSTRAINT anatomy_zone_modalities_family_id_fkey
                FOREIGN KEY (family_id) REFERENCES anatomy_zone_modality_families(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_anatomy_zone_modalities_family_id
    ON anatomy_zone_modalities (family_id, updated_at DESC);

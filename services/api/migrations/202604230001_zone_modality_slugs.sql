ALTER TABLE anatomy_zone_modalities
    ADD COLUMN IF NOT EXISTS slug TEXT;

WITH prepared AS (
    SELECT
        id,
        zone_id,
        created_at,
        COALESCE(
            NULLIF(
                trim(BOTH '-' FROM regexp_replace(lower(COALESCE(name, '')), '[^a-z0-9]+', '-', 'g')),
                ''
            ),
            'modality'
        ) AS base_slug
    FROM anatomy_zone_modalities
),
ranked AS (
    SELECT
        id,
        CASE
            WHEN ROW_NUMBER() OVER (PARTITION BY zone_id, base_slug ORDER BY created_at ASC, id ASC) = 1
                THEN base_slug
            ELSE format(
                '%s-%s',
                base_slug,
                ROW_NUMBER() OVER (PARTITION BY zone_id, base_slug ORDER BY created_at ASC, id ASC)
            )
        END AS next_slug
    FROM prepared
)
UPDATE anatomy_zone_modalities AS modality
SET slug = ranked.next_slug
FROM ranked
WHERE
    modality.id = ranked.id
    AND (modality.slug IS NULL OR modality.slug = '');

ALTER TABLE anatomy_zone_modalities
    ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'anatomy_zone_modalities_zone_slug_key'
    ) THEN
        ALTER TABLE anatomy_zone_modalities
            ADD CONSTRAINT anatomy_zone_modalities_zone_slug_key UNIQUE (zone_id, slug);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_anatomy_zone_modalities_zone_slug
    ON anatomy_zone_modalities (zone_id, slug);

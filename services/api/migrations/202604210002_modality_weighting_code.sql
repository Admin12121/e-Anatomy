ALTER TABLE anatomy_zone_modalities
    ADD COLUMN IF NOT EXISTS weighting_code TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'anatomy_zone_modalities_weighting_code_check'
    ) THEN
        ALTER TABLE anatomy_zone_modalities
            ADD CONSTRAINT anatomy_zone_modalities_weighting_code_check CHECK (
                weighting_code IS NULL
                OR weighting_code IN ('t1', 't1_gado', 't2', 't2_star', 'flair', 'adc', 'dwi', 'other')
            );
    END IF;
END
$$;

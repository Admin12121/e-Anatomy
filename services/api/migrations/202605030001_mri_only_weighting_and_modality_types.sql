ALTER TABLE anatomy_zone_modalities
    DROP CONSTRAINT IF EXISTS anatomy_zone_modalities_modality_type_check;

ALTER TABLE anatomy_zone_modalities
    ADD CONSTRAINT anatomy_zone_modalities_modality_type_check CHECK (
        modality_type IN (
            'mri',
            'ct',
            'pet',
            'ultrasound',
            'xray',
            'mra',
            'mrv',
            'angiography',
            'cbct',
            'illustration',
            'photography',
            'endoscopy',
            'other'
        )
    );

ALTER TABLE anatomy_zone_modality_families
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_families_modality_type_check;

ALTER TABLE anatomy_zone_modality_families
    ADD CONSTRAINT anatomy_zone_modality_families_modality_type_check CHECK (
        modality_type IN (
            'mri',
            'ct',
            'pet',
            'ultrasound',
            'xray',
            'mra',
            'mrv',
            'angiography',
            'cbct',
            'illustration',
            'photography',
            'endoscopy',
            'other'
        )
    );

UPDATE anatomy_zone_modalities
SET weighting_code = NULL
WHERE modality_type <> 'mri'
    AND weighting_code IS NOT NULL;

UPDATE anatomy_zone_modality_assets AS asset
SET weighting_code = NULL
FROM anatomy_zone_modalities AS modality
WHERE asset.modality_id = modality.id
    AND modality.modality_type <> 'mri'
    AND asset.weighting_code IS NOT NULL;

ALTER TABLE anatomy_zone_modalities
    DROP CONSTRAINT IF EXISTS anatomy_zone_modalities_weighting_code_check;

ALTER TABLE anatomy_zone_modalities
    ADD CONSTRAINT anatomy_zone_modalities_weighting_code_check CHECK (
        weighting_code IS NULL
        OR (
            modality_type = 'mri'
            AND weighting_code IN ('t1', 't1_gado', 't2', 't2_star', 'pd', 'flair', 'adc', 'dwi', 'other')
        )
    );

ALTER TABLE anatomy_zone_modality_assets
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_assets_weighting_code_check;

ALTER TABLE anatomy_zone_modality_assets
    ADD CONSTRAINT anatomy_zone_modality_assets_weighting_code_check CHECK (
        weighting_code IS NULL
        OR weighting_code IN ('t1', 't1_gado', 't2', 't2_star', 'pd', 'flair', 'adc', 'dwi', 'other')
    );

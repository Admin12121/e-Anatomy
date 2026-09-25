ALTER TABLE anatomy_zone_modalities
    DROP CONSTRAINT IF EXISTS anatomy_zone_modalities_modality_type_check;

ALTER TABLE anatomy_zone_modalities
    ADD CONSTRAINT anatomy_zone_modalities_modality_type_check CHECK (
        modality_type IN (
            'mri',
            'mpr',
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
            'mpr',
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

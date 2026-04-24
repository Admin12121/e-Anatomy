ALTER TABLE anatomy_zone_modality_families
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

ALTER TABLE anatomy_structure_groups
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

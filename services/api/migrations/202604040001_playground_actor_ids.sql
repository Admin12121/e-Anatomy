ALTER TABLE anatomy_zones
    DROP CONSTRAINT IF EXISTS anatomy_zones_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_zones_updated_by_user_id_fkey;

ALTER TABLE anatomy_zone_modalities
    DROP CONSTRAINT IF EXISTS anatomy_zone_modalities_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_zone_modalities_updated_by_user_id_fkey;

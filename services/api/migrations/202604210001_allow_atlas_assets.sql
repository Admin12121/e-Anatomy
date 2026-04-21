ALTER TABLE anatomy_zone_modality_assets
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_assets_asset_kind_check;

ALTER TABLE anatomy_zone_modality_assets
    ADD CONSTRAINT anatomy_zone_modality_assets_asset_kind_check CHECK (
        asset_kind IN ('slice', 'cover', 'overview', 'reference', 'derived_slice', 'atlas')
    );

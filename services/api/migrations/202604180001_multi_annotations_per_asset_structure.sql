ALTER TABLE anatomy_structure_annotations
    DROP CONSTRAINT IF EXISTS anatomy_structure_annotations_asset_id_structure_id_key;

CREATE INDEX IF NOT EXISTS anatomy_structure_annotations_asset_structure_sort_idx
    ON anatomy_structure_annotations (asset_id, structure_id, sort_order, created_at);

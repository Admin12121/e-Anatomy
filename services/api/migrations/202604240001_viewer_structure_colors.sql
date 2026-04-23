ALTER TABLE anatomy_structures
    ADD COLUMN IF NOT EXISTS color_hex TEXT;

UPDATE anatomy_structures AS structures
SET color_hex = COALESCE(
    (
        SELECT annotations.color_hex
        FROM anatomy_structure_annotations AS annotations
        WHERE
            annotations.structure_id = structures.id
            AND annotations.color_hex IS NOT NULL
            AND BTRIM(annotations.color_hex) <> ''
        ORDER BY annotations.updated_at DESC, annotations.created_at DESC
        LIMIT 1
    ),
    (
        SELECT groups.color_hex
        FROM anatomy_structure_groups AS groups
        WHERE groups.id = structures.group_id
    ),
    '#6468f0'
)
WHERE structures.color_hex IS NULL OR BTRIM(structures.color_hex) = '';

UPDATE anatomy_structures
SET color_hex = '#6468f0'
WHERE color_hex IS NULL OR BTRIM(color_hex) = '';

ALTER TABLE anatomy_structures
    ALTER COLUMN color_hex SET DEFAULT '#6468f0';

ALTER TABLE anatomy_structures
    ALTER COLUMN color_hex SET NOT NULL;

ALTER TABLE anatomy_structure_groups
    DROP COLUMN IF EXISTS color_hex;

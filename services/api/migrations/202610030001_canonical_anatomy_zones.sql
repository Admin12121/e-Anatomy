-- Fixed anatomical zones. Preserve original zone rows, family/variant UUIDs,
-- article and image IDs. Old URLs are resolved via anatomy_legacy_modality_routes.
-- IMPORTANT: take a DB backup and review anatomy_zone_legacy_mappings after migration.
ALTER TABLE anatomy_zones ADD COLUMN canonical_slug TEXT;
ALTER TABLE anatomy_zones ADD CONSTRAINT anatomy_canonical_slug_check CHECK (
    canonical_slug IS NULL OR canonical_slug IN
    ('head','neck','chest','abdomen-pelvis','upper-limbs','lower-limbs','backbone')
);
CREATE UNIQUE INDEX anatomy_canonical_zone_per_account
    ON anatomy_zones(account_id,canonical_slug) WHERE canonical_slug IS NOT NULL;

CREATE TABLE anatomy_zone_legacy_mappings (
    old_zone_id UUID PRIMARY KEY REFERENCES anatomy_zones(id) ON DELETE RESTRICT,
    target_zone_id UUID REFERENCES anatomy_zones(id) ON DELETE RESTRICT,
    original_slug TEXT NOT NULL,
    original_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('mapped','needs_review')),
    mapped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE anatomy_legacy_family_routes (
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    original_zone_slug TEXT NOT NULL,
    original_family_slug TEXT NOT NULL,
    family_id UUID NOT NULL REFERENCES anatomy_zone_modality_families(id) ON DELETE CASCADE,
    PRIMARY KEY (account_id,original_zone_slug,original_family_slug)
);
CREATE TABLE anatomy_legacy_modality_routes (
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    original_zone_slug TEXT NOT NULL,
    original_modality_slug TEXT NOT NULL,
    modality_id UUID NOT NULL REFERENCES anatomy_zone_modalities(id) ON DELETE CASCADE,
    PRIMARY KEY (account_id,original_zone_slug,original_modality_slug)
);

-- Called on startup/admin zone list and for all existing accounts in this migration.
-- Actor must be a valid authenticated user because zone audit columns have FKs.
CREATE FUNCTION anatomy_seed_fixed_zones(p_account UUID,p_actor TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO anatomy_zones
        (account_id,slug,canonical_slug,name,body_view,anchor_x,anchor_y,anchor_z,
         created_by_user_id,updated_by_user_id)
    SELECT p_account, seed.slug,seed.slug,seed.name,seed.body_view,
        seed.x,seed.y,seed.z,p_actor,p_actor
    FROM (VALUES
        ('head','Head','anterior',0.0,1.55,0.02),
        ('neck','Neck','anterior',0.0,1.45,0.0),
        ('chest','Chest','anterior',0.0,1.27,0.0),
        ('abdomen-pelvis','Abdomen & Pelvis','anterior',0.0,0.96,0.0),
        ('upper-limbs','Upper Limbs','anterior',0.3,1.23,0.0),
        ('lower-limbs','Lower Limbs','anterior',0.2,0.48,0.0),
        ('backbone','Backbone','posterior',0.0,1.2,-0.05)
    ) AS seed(slug,name,body_view,x,y,z)
    ON CONFLICT (account_id,slug) DO UPDATE
        SET canonical_slug=excluded.canonical_slug, name=excluded.name,
            body_view=excluded.body_view;
END $$;

-- Seed accounts with an existing legitimate actor. Other accounts are seeded
-- on the first authenticated administrator request.
DO $$ DECLARE a RECORD; BEGIN
    FOR a IN
        SELECT accounts.id AS account_id,
            COALESCE(
                (SELECT created_by_user_id FROM anatomy_zones z WHERE z.account_id=accounts.id LIMIT 1),
                (SELECT id FROM "user" u WHERE u.id=accounts.owner_user_id LIMIT 1),
                (SELECT u.id FROM account_memberships am JOIN "user" u ON u.id=am.user_id
                    WHERE am.account_id=accounts.id ORDER BY am.joined_at LIMIT 1)
            ) AS actor
        FROM accounts
    LOOP
        IF a.actor IS NOT NULL THEN
            PERFORM anatomy_seed_fixed_zones(a.account_id,a.actor);
        END IF;
    END LOOP;
END $$;

-- Seed future accounts even before the admin opens the Playground.
CREATE FUNCTION anatomy_seed_account_on_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.owner_user_id IS NOT NULL AND
       EXISTS (SELECT 1 FROM "user" WHERE id=NEW.owner_user_id) THEN
        PERFORM anatomy_seed_fixed_zones(NEW.id,NEW.owner_user_id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER anatomy_seed_account_owner AFTER INSERT OR UPDATE OF owner_user_id
    ON accounts FOR EACH ROW EXECUTE FUNCTION anatomy_seed_account_on_owner();

CREATE FUNCTION anatomy_seed_account_on_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "user" WHERE id=NEW.user_id) THEN
        PERFORM anatomy_seed_fixed_zones(NEW.account_id,NEW.user_id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER anatomy_seed_account_membership AFTER INSERT OR UPDATE OF user_id
    ON account_memberships FOR EACH ROW EXECUTE FUNCTION anatomy_seed_account_on_membership();

-- Regions with explicitly recognizable names are mapped automatically. Ambiguous
-- records are retained unchanged, marked for review, and never deleted or guessed.
INSERT INTO anatomy_zone_legacy_mappings
    (old_zone_id,target_zone_id,original_slug,original_name,status)
SELECT z.id, target.id,z.slug,z.name,
       CASE WHEN target.id IS NULL THEN 'needs_review' ELSE 'mapped' END
FROM anatomy_zones z
CROSS JOIN LATERAL (SELECT lower(z.slug||' '||z.name) AS text) terms
LEFT JOIN anatomy_zones target ON target.account_id=z.account_id AND target.canonical_slug=(
    CASE
      WHEN terms.text ~ '(backbone|spine|spinal|vertebr|lumbar|sacral|coccyx|back)' THEN 'backbone'
      WHEN terms.text ~ '(head|skull|brain|face|facial|cranial|eye|orbital|ear|nose|jaw)' THEN 'head'
      WHEN terms.text ~ '(neck|cervic|throat|larynx|thyroid)' THEN 'neck'
      WHEN terms.text ~ '(chest|thorax|thorac|sternum|rib|lung|cardiac|heart)' THEN 'chest'
      WHEN terms.text ~ '(abdomen|abdom|absomin|pelvi|stomach|liver|kidney|colon|bladder|groin)' THEN 'abdomen-pelvis'
      WHEN terms.text ~ '(upper.limb|shoulder|sholder|solder|scapul|arm|humer|elbow|forearm|wrist|hand|finger)' THEN 'upper-limbs'
      WHEN terms.text ~ '(lower.limb|hip|glute|thigh|femur|knee|patella|shin|calf|leg|ankle|foot|feet|toe)' THEN 'lower-limbs'
      ELSE NULL
    END
)
WHERE z.canonical_slug IS NULL;

-- Capture old article URLs, including families without variants.
INSERT INTO anatomy_legacy_family_routes
    (account_id,original_zone_slug,original_family_slug,family_id)
SELECT z.account_id,z.slug,f.slug,f.id
FROM anatomy_zone_modality_families f
JOIN anatomy_zones z ON z.id=f.zone_id
JOIN anatomy_zone_legacy_mappings map ON map.old_zone_id=z.id
WHERE map.status='mapped';

-- Capture every legacy public viewer URL before any slug change.
INSERT INTO anatomy_legacy_modality_routes
    (account_id,original_zone_slug,original_modality_slug,modality_id)
SELECT z.account_id,z.slug,m.slug,m.id
FROM anatomy_zone_modalities m
JOIN anatomy_zones z ON z.id=m.zone_id
JOIN anatomy_zone_legacy_mappings map ON map.old_zone_id=z.id
WHERE map.status='mapped';

-- Family identity remains unchanged: any existing content_documents, thumbnails,
-- structure groups, and published resources continue to reference the same IDs.
-- Qualify migrated family names with their source region; avoid case-insensitive
-- unique-index conflicts with existing families already under the target zone.
DO $$ DECLARE fam RECORD; label TEXT; BEGIN
    FOR fam IN
        SELECT f.id,f.name,f.modality_type,map.original_name,map.target_zone_id
        FROM anatomy_zone_modality_families f
        JOIN anatomy_zone_legacy_mappings map ON map.old_zone_id=f.zone_id
        WHERE map.status='mapped'
        ORDER BY f.created_at,f.id
    LOOP
        label:=fam.original_name || ' / ' || fam.name;
        IF EXISTS (SELECT 1 FROM anatomy_zone_modality_families f
                   WHERE f.zone_id=fam.target_zone_id
                     AND f.modality_type=fam.modality_type
                     AND lower(trim(f.name))=lower(trim(label))) THEN
            label:=label || ' (' || fam.id::text || ')';
        END IF;
        UPDATE anatomy_zone_modality_families
        SET name=label,zone_id=fam.target_zone_id WHERE id=fam.id;
    END LOOP;
END $$;

-- Keep existing human-readable slugs when no other modality in the new
-- region has that slug. Suffix only collisions, preserving stable UUIDs.
-- All original public paths remain in anatomy_legacy_modality_routes.
WITH moving AS (
    SELECT m.id,m.slug, map.target_zone_id,
        row_number() OVER (PARTITION BY map.target_zone_id, m.slug
                           ORDER BY m.created_at,m.id) AS sibling_order
    FROM anatomy_zone_modalities m
    JOIN anatomy_zone_legacy_mappings map ON m.zone_id=map.old_zone_id
    WHERE map.status='mapped'
), planned AS (
    SELECT m.id,m.target_zone_id,
        CASE WHEN m.sibling_order = 1 AND NOT EXISTS (
            SELECT 1 FROM anatomy_zone_modalities present
            WHERE present.zone_id=m.target_zone_id AND present.slug=m.slug
        ) THEN m.slug ELSE m.slug || '-' || replace(m.id::text,'-','') END AS new_slug
    FROM moving m
)
UPDATE anatomy_zone_modalities m SET slug=p.new_slug,zone_id=p.target_zone_id
FROM planned p WHERE m.id=p.id;

-- Check mapping coverage before deployment:
-- SELECT status, original_name, original_slug FROM anatomy_zone_legacy_mappings ORDER BY status, original_name;
-- SELECT count(*) FROM anatomy_zone_modalities m JOIN anatomy_zones z ON z.id=m.zone_id WHERE z.canonical_slug IS NULL;

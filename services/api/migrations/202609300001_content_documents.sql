-- Editorial identity is independent of technical variant ordering.
ALTER TABLE anatomy_zone_modality_families ADD COLUMN slug TEXT;
ALTER TABLE anatomy_zone_modality_families ADD COLUMN primary_modality_id UUID
    REFERENCES anatomy_zone_modalities(id) ON DELETE SET NULL;

-- Existing and future creation paths receive stable, collision-safe slugs.
CREATE FUNCTION anatomy_assign_family_slug() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base TEXT; candidate TEXT;
BEGIN
    IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
        base := trim(BOTH '-' FROM regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'));
        IF base = '' THEN base := 'content'; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(base, 0));
        candidate := base;
        IF EXISTS (SELECT 1 FROM anatomy_zone_modality_families WHERE slug = candidate AND id <> NEW.id) THEN
            candidate := base || '-' || NEW.id::text;
        END IF;
        NEW.slug := candidate;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER anatomy_family_slug BEFORE INSERT OR UPDATE OF slug
    ON anatomy_zone_modality_families FOR EACH ROW EXECUTE FUNCTION anatomy_assign_family_slug();
-- Serialize this one-time backfill; a same-name family never inherits another URL.
DO $$ DECLARE family RECORD; BEGIN
    FOR family IN SELECT id FROM anatomy_zone_modality_families ORDER BY created_at, id LOOP
        UPDATE anatomy_zone_modality_families SET slug = NULL WHERE id = family.id;
    END LOOP;
END $$;
ALTER TABLE anatomy_zone_modality_families ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX anatomy_family_slug_unique ON anatomy_zone_modality_families(slug);
ALTER TABLE anatomy_zone_modality_families ADD CONSTRAINT anatomy_family_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
UPDATE anatomy_zone_modality_families family SET primary_modality_id = (
    SELECT id FROM anatomy_zone_modalities WHERE family_id = family.id
    ORDER BY (processing_status = 'ready') DESC, created_at, id LIMIT 1
);
CREATE FUNCTION anatomy_assign_primary_variant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE anatomy_zone_modality_families SET primary_modality_id = NEW.id
    WHERE id = NEW.family_id AND primary_modality_id IS NULL;
    RETURN NEW;
END $$;
CREATE TRIGGER anatomy_primary_variant AFTER INSERT ON anatomy_zone_modalities
    FOR EACH ROW EXECUTE FUNCTION anatomy_assign_primary_variant();

CREATE TABLE anatomy_content_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES anatomy_zone_modality_families(id) ON DELETE CASCADE,
    structure_id UUID REFERENCES anatomy_structures(id) ON DELETE CASCADE,
    summary TEXT NOT NULL DEFAULT '',
    body_json JSONB NOT NULL DEFAULT '[]',
    legacy_markdown TEXT,
    access_level TEXT NOT NULL DEFAULT 'free' CHECK (access_level IN ('free', 'subscription')),
    revision INTEGER NOT NULL DEFAULT 0,
    published_revision INTEGER,
    published_summary TEXT,
    published_body_json JSONB,
    published_legacy_markdown TEXT,
    published_access_level TEXT,
    published_resources JSONB NOT NULL DEFAULT '[]',
    published_at TIMESTAMPTZ,
    created_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    updated_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (num_nonnulls(family_id, structure_id) = 1),
    CHECK (jsonb_typeof(body_json) = 'array')
);
CREATE UNIQUE INDEX anatomy_content_document_family ON anatomy_content_documents(family_id) WHERE family_id IS NOT NULL;
CREATE UNIQUE INDEX anatomy_content_document_structure ON anatomy_content_documents(structure_id) WHERE structure_id IS NOT NULL;
CREATE TABLE anatomy_content_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES anatomy_content_documents(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('reference', 'image', 'video', 'link', 'model')),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX anatomy_content_resources_document ON anatomy_content_resources(document_id, sort_order);
INSERT INTO anatomy_content_documents(family_id, created_by_user_id, updated_by_user_id)
    SELECT id, created_by_user_id, updated_by_user_id FROM anatomy_zone_modality_families;
-- Descriptions, not private notes; review and publish explicitly after migration.
INSERT INTO anatomy_content_documents(structure_id, summary, legacy_markdown, access_level, created_by_user_id, updated_by_user_id)
    SELECT id, COALESCE(short_description, ''), long_description, access_level,
        created_by_user_id, updated_by_user_id FROM anatomy_structures;

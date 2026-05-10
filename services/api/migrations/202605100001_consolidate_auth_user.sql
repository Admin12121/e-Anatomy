ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TEMP TABLE __auth_user_migration_map (
    legacy_user_id TEXT PRIMARY KEY,
    auth_user_id TEXT NOT NULL UNIQUE,
    mapped_by TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO __auth_user_migration_map (legacy_user_id, auth_user_id, mapped_by)
SELECT legacy.id, auth_user.id, 'id'
FROM users AS legacy
INNER JOIN "user" AS auth_user ON auth_user.id = legacy.id;

WITH legacy_email AS (
    SELECT lower(trim(email)) AS email_key, min(id) AS legacy_user_id
    FROM users
    WHERE id NOT IN (SELECT legacy_user_id FROM __auth_user_migration_map)
    GROUP BY lower(trim(email))
    HAVING count(*) = 1
),
auth_email AS (
    SELECT lower(trim(email)) AS email_key, min(id) AS auth_user_id
    FROM "user"
    WHERE id NOT IN (SELECT auth_user_id FROM __auth_user_migration_map)
    GROUP BY lower(trim(email))
    HAVING count(*) = 1
)
INSERT INTO __auth_user_migration_map (legacy_user_id, auth_user_id, mapped_by)
SELECT legacy_email.legacy_user_id, auth_email.auth_user_id, 'email'
FROM legacy_email
INNER JOIN auth_email ON auth_email.email_key = legacy_email.email_key
ON CONFLICT DO NOTHING;

WITH legacy_account AS (
    SELECT account_memberships.account_id, min(account_memberships.user_id) AS legacy_user_id
    FROM account_memberships
    WHERE account_memberships.status = 'active'
      AND account_memberships.user_id NOT IN (
          SELECT legacy_user_id FROM __auth_user_migration_map
      )
    GROUP BY account_memberships.account_id
    HAVING count(*) = 1
),
auth_account AS (
    SELECT auth_user.api_account_id::uuid AS account_id, min(auth_user.id) AS auth_user_id
    FROM "user" AS auth_user
    WHERE auth_user.api_account_id IS NOT NULL
      AND auth_user.api_account_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND auth_user.id NOT IN (
          SELECT auth_user_id FROM __auth_user_migration_map
      )
    GROUP BY auth_user.api_account_id::uuid
    HAVING count(*) = 1
)
INSERT INTO __auth_user_migration_map (legacy_user_id, auth_user_id, mapped_by)
SELECT legacy_account.legacy_user_id, auth_account.auth_user_id, 'account'
FROM legacy_account
INNER JOIN auth_account ON auth_account.account_id = legacy_account.account_id
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    unmapped_count INTEGER;
BEGIN
    SELECT count(*)
    INTO unmapped_count
    FROM users AS legacy
    LEFT JOIN __auth_user_migration_map AS user_map
        ON user_map.legacy_user_id = legacy.id
    WHERE user_map.legacy_user_id IS NULL;

    IF unmapped_count > 0 THEN
        RAISE EXCEPTION
            'Cannot consolidate auth users: % legacy users do not map to Better Auth "user" rows',
            unmapped_count;
    END IF;
END $$;

UPDATE "user" AS auth_user
SET
    name = CASE
        WHEN trim(auth_user.name) = '' THEN legacy.display_name
        ELSE auth_user.name
    END,
    image = COALESCE(auth_user.image, legacy.avatar_url),
    email_verified = auth_user.email_verified OR legacy.email_verified_at IS NOT NULL,
    status = COALESCE(auth_user.status, legacy.status),
    last_login_at = COALESCE(auth_user.last_login_at, legacy.last_login_at),
    updated_at = NOW()
FROM __auth_user_migration_map AS user_map
INNER JOIN users AS legacy ON legacy.id = user_map.legacy_user_id
WHERE auth_user.id = user_map.auth_user_id;

ALTER TABLE account_memberships
    DROP CONSTRAINT IF EXISTS account_memberships_invited_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS account_memberships_user_id_fkey;

ALTER TABLE accounts
    DROP CONSTRAINT IF EXISTS accounts_owner_user_id_fkey;

ALTER TABLE modules
    DROP CONSTRAINT IF EXISTS modules_created_by_user_id_fkey;

ALTER TABLE module_versions
    DROP CONSTRAINT IF EXISTS module_versions_created_by_user_id_fkey;

ALTER TABLE published_releases
    DROP CONSTRAINT IF EXISTS published_releases_published_by_user_id_fkey;

ALTER TABLE anatomy_zones
    DROP CONSTRAINT IF EXISTS anatomy_zones_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_zones_updated_by_user_id_fkey;

ALTER TABLE anatomy_zone_modalities
    DROP CONSTRAINT IF EXISTS anatomy_zone_modalities_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_zone_modalities_updated_by_user_id_fkey;

ALTER TABLE anatomy_zone_modality_assets
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_assets_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_assets_updated_by_user_id_fkey;

ALTER TABLE anatomy_modality_ingest_jobs
    DROP CONSTRAINT IF EXISTS anatomy_modality_ingest_jobs_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_modality_ingest_jobs_updated_by_user_id_fkey;

ALTER TABLE anatomy_structure_groups
    DROP CONSTRAINT IF EXISTS anatomy_structure_groups_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_structure_groups_updated_by_user_id_fkey;

ALTER TABLE anatomy_structures
    DROP CONSTRAINT IF EXISTS anatomy_structures_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_structures_updated_by_user_id_fkey;

ALTER TABLE anatomy_structure_annotations
    DROP CONSTRAINT IF EXISTS anatomy_structure_annotations_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_structure_annotations_updated_by_user_id_fkey;

ALTER TABLE anatomy_zone_modality_families
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_families_created_by_user_id_fkey,
    DROP CONSTRAINT IF EXISTS anatomy_zone_modality_families_updated_by_user_id_fkey;

DROP TABLE IF EXISTS auth_sessions;

UPDATE accounts AS target
SET owner_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.owner_user_id = user_map.legacy_user_id;

UPDATE account_memberships AS target
SET user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.user_id = user_map.legacy_user_id;

UPDATE account_memberships AS target
SET invited_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.invited_by_user_id = user_map.legacy_user_id;

UPDATE modules AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE module_versions AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE published_releases AS target
SET published_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.published_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zones AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zones AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zone_modalities AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zone_modalities AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zone_modality_assets AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zone_modality_assets AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_modality_ingest_jobs AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_modality_ingest_jobs AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_structure_groups AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_structure_groups AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_structures AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_structures AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_structure_annotations AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_structure_annotations AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zone_modality_families AS target
SET created_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.created_by_user_id = user_map.legacy_user_id;

UPDATE anatomy_zone_modality_families AS target
SET updated_by_user_id = user_map.auth_user_id
FROM __auth_user_migration_map AS user_map
WHERE target.updated_by_user_id = user_map.legacy_user_id;

WITH primary_membership AS (
    SELECT DISTINCT ON (account_memberships.user_id)
        account_memberships.user_id,
        accounts.id AS account_id,
        accounts.slug AS account_slug,
        accounts.name AS account_name,
        accounts.account_type,
        account_memberships.role_code
    FROM account_memberships
    INNER JOIN accounts ON accounts.id = account_memberships.account_id
    WHERE account_memberships.status = 'active'
      AND accounts.status = 'active'
    ORDER BY
        account_memberships.user_id,
        CASE WHEN account_memberships.role_code = 'owner' THEN 0 ELSE 1 END,
        account_memberships.joined_at ASC
)
UPDATE "user" AS auth_user
SET
    api_account_id = primary_membership.account_id::text,
    api_account_slug = primary_membership.account_slug,
    api_account_name = primary_membership.account_name,
    api_account_type = primary_membership.account_type,
    role = primary_membership.role_code,
    updated_at = NOW()
FROM primary_membership
WHERE auth_user.id = primary_membership.user_id;

ALTER TABLE account_memberships
    ADD CONSTRAINT account_memberships_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT account_memberships_invited_by_user_id_fkey
        FOREIGN KEY (invited_by_user_id) REFERENCES "user"(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE accounts
    ADD CONSTRAINT accounts_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES "user"(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE modules
    ADD CONSTRAINT modules_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE module_versions
    ADD CONSTRAINT module_versions_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE published_releases
    ADD CONSTRAINT published_releases_published_by_user_id_fkey
        FOREIGN KEY (published_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_zones
    ADD CONSTRAINT anatomy_zones_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_zones_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_zone_modalities
    ADD CONSTRAINT anatomy_zone_modalities_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_zone_modalities_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_zone_modality_assets
    ADD CONSTRAINT anatomy_zone_modality_assets_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_zone_modality_assets_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_modality_ingest_jobs
    ADD CONSTRAINT anatomy_modality_ingest_jobs_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_modality_ingest_jobs_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_structure_groups
    ADD CONSTRAINT anatomy_structure_groups_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_structure_groups_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_structures
    ADD CONSTRAINT anatomy_structures_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_structures_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_structure_annotations
    ADD CONSTRAINT anatomy_structure_annotations_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_structure_annotations_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE anatomy_zone_modality_families
    ADD CONSTRAINT anatomy_zone_modality_families_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT anatomy_zone_modality_families_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE account_memberships VALIDATE CONSTRAINT account_memberships_user_id_fkey;
ALTER TABLE account_memberships VALIDATE CONSTRAINT account_memberships_invited_by_user_id_fkey;
ALTER TABLE accounts VALIDATE CONSTRAINT accounts_owner_user_id_fkey;
ALTER TABLE modules VALIDATE CONSTRAINT modules_created_by_user_id_fkey;
ALTER TABLE module_versions VALIDATE CONSTRAINT module_versions_created_by_user_id_fkey;
ALTER TABLE published_releases VALIDATE CONSTRAINT published_releases_published_by_user_id_fkey;
ALTER TABLE anatomy_zones VALIDATE CONSTRAINT anatomy_zones_created_by_user_id_fkey;
ALTER TABLE anatomy_zones VALIDATE CONSTRAINT anatomy_zones_updated_by_user_id_fkey;
ALTER TABLE anatomy_zone_modalities VALIDATE CONSTRAINT anatomy_zone_modalities_created_by_user_id_fkey;
ALTER TABLE anatomy_zone_modalities VALIDATE CONSTRAINT anatomy_zone_modalities_updated_by_user_id_fkey;
ALTER TABLE anatomy_zone_modality_assets VALIDATE CONSTRAINT anatomy_zone_modality_assets_created_by_user_id_fkey;
ALTER TABLE anatomy_zone_modality_assets VALIDATE CONSTRAINT anatomy_zone_modality_assets_updated_by_user_id_fkey;
ALTER TABLE anatomy_modality_ingest_jobs VALIDATE CONSTRAINT anatomy_modality_ingest_jobs_created_by_user_id_fkey;
ALTER TABLE anatomy_modality_ingest_jobs VALIDATE CONSTRAINT anatomy_modality_ingest_jobs_updated_by_user_id_fkey;
ALTER TABLE anatomy_structure_groups VALIDATE CONSTRAINT anatomy_structure_groups_created_by_user_id_fkey;
ALTER TABLE anatomy_structure_groups VALIDATE CONSTRAINT anatomy_structure_groups_updated_by_user_id_fkey;
ALTER TABLE anatomy_structures VALIDATE CONSTRAINT anatomy_structures_created_by_user_id_fkey;
ALTER TABLE anatomy_structures VALIDATE CONSTRAINT anatomy_structures_updated_by_user_id_fkey;
ALTER TABLE anatomy_structure_annotations VALIDATE CONSTRAINT anatomy_structure_annotations_created_by_user_id_fkey;
ALTER TABLE anatomy_structure_annotations VALIDATE CONSTRAINT anatomy_structure_annotations_updated_by_user_id_fkey;
ALTER TABLE anatomy_zone_modality_families VALIDATE CONSTRAINT anatomy_zone_modality_families_created_by_user_id_fkey;
ALTER TABLE anatomy_zone_modality_families VALIDATE CONSTRAINT anatomy_zone_modality_families_updated_by_user_id_fkey;

DROP TABLE users;

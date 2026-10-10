use std::collections::HashMap;

use sqlx::{Executor, PgPool, Postgres, types::Json};
use uuid::Uuid;

use crate::features::playground::domain::models::{
    ModalityIngestJob, ModalitySourceAsset, PublicZoneModalityListItem, ViewerAnnotation,
    ViewerAnnotationPoint, ViewerStructure, ViewerStructureGroup, ZoneAnchor, ZoneDetail,
    ZoneListItem, ZoneModality, ZoneModalityAsset, ZoneModalityFamily,
};

#[derive(Debug, Clone, Default)]
pub struct PlaygroundRepository;

impl PlaygroundRepository {
    pub async fn list_public_zones(&self, pool: &PgPool) -> Result<Vec<ZoneListItem>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ZoneListRow>(
            r#"
            SELECT
                id::text AS id,
                slug,
                name,
                body_view,
                anchor_x,
                anchor_y,
                anchor_z
            FROM anatomy_zones
            WHERE canonical_slug IS NOT NULL
              AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = anatomy_zones.account_id AND accounts.status = 'active')
            ORDER BY array_position(ARRAY['head','neck','chest','abdomen-pelvis','upper-limbs','lower-limbs','backbone'], canonical_slug) ASC, created_at ASC
            "#,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn list_zones_for_account(
        &self,
        pool: &PgPool,
        account_id: Uuid,
    ) -> Result<Vec<ZoneListItem>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ZoneListRow>(
            r#"
            SELECT
                id::text AS id,
                slug,
                name,
                body_view,
                anchor_x,
                anchor_y,
                anchor_z
            FROM anatomy_zones
            WHERE account_id = $1
            ORDER BY array_position(ARRAY['head','neck','chest','abdomen-pelvis','upper-limbs','lower-limbs','backbone'],canonical_slug) ASC, created_at ASC
            "#,
        )
        .bind(account_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn get_zone_detail(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<Option<ZoneDetail>, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneDetailRow>(
            r#"
            SELECT
                id::text AS id,
                slug,
                name,
                description,
                body_view,
                anchor_x,
                anchor_y,
                anchor_z,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_zones
            WHERE account_id = $1 AND id = $2
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn update_zone(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        user_id: &str,
        name: &str,
        description: Option<&str>,
        body_view: &str,
        anchor_x: Option<f64>,
        anchor_y: Option<f64>,
        anchor_z: Option<f64>,
    ) -> Result<Option<ZoneDetail>, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneDetailRow>(
            r#"
            UPDATE anatomy_zones
            SET
                name = $3,
                description = $4,
                body_view = $5,
                anchor_x = COALESCE($6, anchor_x),
                anchor_y = COALESCE($7, anchor_y),
                anchor_z = COALESCE($8, anchor_z),
                updated_by_user_id = $9,
                updated_at = NOW()
            WHERE account_id = $1 AND id = $2 AND canonical_slug IS NOT NULL
            RETURNING
                id::text AS id,
                slug,
                name,
                description,
                body_view,
                anchor_x,
                anchor_y,
                anchor_z,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(name)
        .bind(description)
        .bind(body_view)
        .bind(anchor_x)
        .bind(anchor_y)
        .bind(anchor_z)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn zone_exists_for_account(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_zones
                WHERE account_id = $1 AND id = $2
            )
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn public_zone_exists(
        &self,
        pool: &PgPool,
        zone_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_zones
                WHERE id = $1
            )
            "#,
        )
        .bind(zone_id)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn modality_slug_exists(
        &self,
        pool: &PgPool,
        zone_id: Uuid,
        slug: &str,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_zone_modalities
                WHERE zone_id = $1 AND slug = $2
            )
            "#,
        )
        .bind(zone_id)
        .bind(slug)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn get_public_zone_modality_lookup_by_slugs(
        &self,
        pool: &PgPool,
        zone_slug: &str,
        modality_slug: &str,
    ) -> Result<Option<PublicZoneModalityLookupRow>, sqlx::Error> {
        sqlx::query_as::<_, PublicZoneModalityLookupRow>(
            r#"
            SELECT
                zone.account_id,
                zone.id AS zone_id,
                modality.id AS modality_id
            FROM anatomy_zones AS zone
            INNER JOIN anatomy_zone_modalities AS modality ON modality.zone_id = zone.id
            WHERE EXISTS (SELECT 1 FROM accounts WHERE accounts.id = zone.account_id AND accounts.status = 'active')
              AND ((zone.slug = $1 AND modality.slug = $2)
               OR EXISTS (
                 SELECT 1 FROM anatomy_legacy_modality_routes old
                 WHERE old.account_id=zone.account_id AND old.modality_id=modality.id
                   AND old.original_zone_slug=$1 AND old.original_modality_slug=$2
               ))
            ORDER BY zone.created_at ASC, modality.created_at ASC
            LIMIT 1
            "#,
        )
        .bind(zone_slug)
        .bind(modality_slug)
        .fetch_optional(pool)
        .await
    }

    pub async fn list_zone_modalities(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<Vec<ZoneModalityFamily>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ZoneModalityFamilyVariantRow>(
            r#"
            SELECT
                family.id::text AS family_id,
                family.slug AS family_slug,
                family.primary_modality_id::text AS family_primary_modality_id,
                family.name AS family_name,
                family.modality_type AS family_modality_type,
                family.thumbnail_url AS family_thumbnail_url,
                family.notes AS family_notes,
                modality.id::text AS modality_id,
                modality.family_id::text AS modality_family_id,
                modality.slug AS modality_slug,
                modality.name AS modality_name,
                modality.modality_type AS modality_modality_type,
                modality.weighting_code,
                modality.cover_image_url,
                modality.source_kind,
                modality.source_label,
                modality.source_file_count,
                modality.processing_status,
                ingest.status AS ingest_status,
                ingest.summary_json AS ingest_summary_json,
                modality.notes AS modality_notes,
                TO_CHAR(modality.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS modality_created_at,
                TO_CHAR(modality.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS modality_updated_at
            FROM anatomy_zone_modality_families AS family
            INNER JOIN anatomy_zone_modalities AS modality ON modality.family_id = family.id
            INNER JOIN anatomy_zones AS zone ON zone.id = family.zone_id
            LEFT JOIN anatomy_modality_ingest_jobs AS ingest ON ingest.id = modality.latest_ingest_job_id
            WHERE zone.account_id = $1 AND family.zone_id = $2
            ORDER BY
                GREATEST(family.updated_at, modality.updated_at) DESC,
                family.name ASC,
                CASE WHEN modality.processing_status = 'ready' THEN 0 ELSE 1 END,
                modality.updated_at DESC,
                modality.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .fetch_all(pool)
        .await?;

        Ok(group_zone_modality_family_rows(rows))
    }

    pub async fn list_public_zone_modalities(
        &self,
        pool: &PgPool,
        zone_id: Uuid,
    ) -> Result<Vec<PublicZoneModalityListItem>, sqlx::Error> {
        let rows = sqlx::query_as::<_, PublicZoneModalityFamilyVariantRow>(
            r#"
            SELECT
                family.id::text AS family_id,
                family.name AS family_name,
                modality.slug AS modality_slug,
                modality.processing_status
            FROM anatomy_zone_modality_families AS family
            INNER JOIN anatomy_zone_modalities AS modality ON modality.family_id = family.id
            WHERE family.zone_id = $1
              AND EXISTS (SELECT 1 FROM anatomy_zones z JOIN accounts a ON a.id=z.account_id WHERE z.id=family.zone_id AND a.status='active')
            ORDER BY
                GREATEST(family.updated_at, modality.updated_at) DESC,
                family.name ASC,
                CASE WHEN modality.processing_status = 'ready' THEN 0 ELSE 1 END,
                modality.updated_at DESC,
                modality.created_at ASC
            "#,
        )
        .bind(zone_id)
        .fetch_all(pool)
        .await?;

        Ok(group_public_zone_modality_rows(rows))
    }

    pub async fn create_zone_modality<'e, E>(
        &self,
        executor: E,
        zone_id: Uuid,
        family_id: Uuid,
        user_id: &str,
        slug: &str,
        name: &str,
        modality_type: &str,
        weighting_code: Option<&str>,
        cover_image_url: Option<&str>,
        source_kind: &str,
        source_label: Option<&str>,
        source_file_count: i32,
        processing_status: &str,
        notes: Option<&str>,
    ) -> Result<ZoneModality, sqlx::Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let row = sqlx::query_as::<_, ZoneModalityRow>(
            r#"
            INSERT INTO anatomy_zone_modalities (
                zone_id,
                family_id,
                slug,
                name,
                modality_type,
                weighting_code,
                cover_image_url,
                source_kind,
                source_label,
                source_file_count,
                processing_status,
                notes,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
            RETURNING
                id::text AS id,
                family_id::text AS family_id,
                slug,
                name,
                modality_type,
                weighting_code,
                cover_image_url,
                source_kind,
                source_label,
                source_file_count,
                processing_status,
                notes,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(zone_id)
        .bind(family_id)
        .bind(slug)
        .bind(name)
        .bind(modality_type)
        .bind(weighting_code)
        .bind(cover_image_url)
        .bind(source_kind)
        .bind(source_label)
        .bind(source_file_count)
        .bind(processing_status)
        .bind(notes)
        .bind(user_id)
        .fetch_one(executor)
        .await?;

        Ok(row.into())
    }

    #[allow(dead_code)]
    pub async fn update_zone_modality(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        name: &str,
        modality_type: &str,
        weighting_code: Option<&str>,
        cover_image_url: Option<&str>,
        source_kind: &str,
        source_label: Option<&str>,
        source_file_count: i32,
        processing_status: &str,
        notes: Option<&str>,
    ) -> Result<Option<ZoneModality>, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneModalityRow>(
            r#"
            UPDATE anatomy_zone_modalities AS modality
            SET
                name = $4,
                modality_type = $5,
                weighting_code = $6,
                cover_image_url = $7,
                source_kind = $8,
                source_label = $9,
                source_file_count = $10,
                processing_status = $11,
                notes = $12,
                updated_by_user_id = $13,
                updated_at = NOW()
            FROM anatomy_zones AS zone
            WHERE
                modality.id = $3
                AND modality.zone_id = $2
                AND zone.id = modality.zone_id
                AND zone.account_id = $1
            RETURNING
                modality.id::text AS id,
                modality.family_id::text AS family_id,
                modality.slug,
                modality.name,
                modality.modality_type,
                modality.weighting_code,
                modality.cover_image_url,
                modality.source_kind,
                modality.source_label,
                modality.source_file_count,
                modality.processing_status,
                modality.notes,
                TO_CHAR(modality.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(modality.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(name)
        .bind(modality_type)
        .bind(weighting_code)
        .bind(cover_image_url)
        .bind(source_kind)
        .bind(source_label)
        .bind(source_file_count)
        .bind(processing_status)
        .bind(notes)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn list_modality_ingest_job_ids(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        sqlx::query_scalar::<_, Uuid>(
            r#"
            SELECT job.id
            FROM anatomy_modality_ingest_jobs AS job
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = job.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
            ORDER BY job.created_at DESC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_all(pool)
        .await
    }

    pub async fn delete_zone_modality(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let deleted_rows = sqlx::query(
            r#"
            DELETE FROM anatomy_zone_modalities AS modality
            USING anatomy_zones AS zone
            WHERE
                modality.id = $3
                AND modality.zone_id = $2
                AND zone.id = modality.zone_id
                AND zone.account_id = $1
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .execute(pool)
        .await?
        .rows_affected();

        Ok(deleted_rows > 0)
    }

    pub async fn modality_exists_for_account(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_zone_modalities AS modality
                INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
                WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
            )
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn list_zone_modality_assets(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Vec<ZoneModalityAsset>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ZoneModalityAssetRow>(
            r#"
            SELECT
                asset.id::text AS id,
                asset.label,
                asset.asset_kind,
                asset.weighting_code,
                asset.image_url,
                asset.thumbnail_url,
                asset.sort_order,
                asset.notes,
                asset.ingest_job_id::text AS ingest_job_id,
                asset.storage_backend,
                asset.storage_key,
                asset.checksum,
                asset.mime_type,
                asset.size_bytes,
                asset.width,
                asset.height,
                asset.source_relative_path,
                asset.series_uid,
                asset.series_label,
                asset.instance_uid,
                asset.slice_index,
                asset.orientation_code,
                TO_CHAR(asset.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(asset.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_zone_modality_assets AS asset
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = asset.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
                        WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
                            AND asset.asset_kind <> 'atlas'
            ORDER BY asset.sort_order ASC, asset.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn list_zone_modality_atlas_assets(
        &self,
        pool: impl sqlx::PgExecutor<'_>,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Vec<ZoneModalityAsset>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ZoneModalityAssetRow>(
            r#"
            SELECT
                asset.id::text AS id,
                asset.label,
                asset.asset_kind,
                asset.weighting_code,
                asset.image_url,
                asset.thumbnail_url,
                asset.sort_order,
                asset.notes,
                asset.ingest_job_id::text AS ingest_job_id,
                asset.storage_backend,
                asset.storage_key,
                asset.checksum,
                asset.mime_type,
                asset.size_bytes,
                asset.width,
                asset.height,
                asset.source_relative_path,
                asset.series_uid,
                asset.series_label,
                asset.instance_uid,
                asset.slice_index,
                asset.orientation_code,
                TO_CHAR(asset.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(asset.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_zone_modality_assets AS asset
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = asset.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
              AND asset.asset_kind = 'atlas'
            ORDER BY asset.sort_order ASC, asset.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn create_zone_modality_asset(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
        user_id: &str,
        label: &str,
        asset_kind: &str,
        weighting_code: Option<&str>,
        image_url: &str,
        thumbnail_url: Option<&str>,
        sort_order: i32,
        notes: Option<&str>,
    ) -> Result<ZoneModalityAsset, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneModalityAssetRow>(
            r#"
            INSERT INTO anatomy_zone_modality_assets (
                modality_id,
                label,
                asset_kind,
                weighting_code,
                image_url,
                thumbnail_url,
                sort_order,
                notes,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
            RETURNING
                id::text AS id,
                label,
                asset_kind,
                weighting_code,
                image_url,
                thumbnail_url,
                sort_order,
                notes,
                ingest_job_id::text AS ingest_job_id,
                storage_backend,
                storage_key,
                checksum,
                mime_type,
                size_bytes,
                width,
                height,
                source_relative_path,
                series_uid,
                series_label,
                instance_uid,
                slice_index,
                orientation_code,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(modality_id)
        .bind(label)
        .bind(asset_kind)
        .bind(weighting_code)
        .bind(image_url)
        .bind(thumbnail_url)
        .bind(sort_order)
        .bind(notes)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    pub async fn update_zone_modality_asset(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_id: Uuid,
        user_id: &str,
        label: &str,
        asset_kind: &str,
        weighting_code: Option<&str>,
        image_url: &str,
        thumbnail_url: Option<&str>,
        sort_order: i32,
        notes: Option<&str>,
    ) -> Result<Option<ZoneModalityAsset>, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneModalityAssetRow>(
            r#"
            UPDATE anatomy_zone_modality_assets AS asset
            SET
                label = $5,
                asset_kind = $6,
                weighting_code = $7,
                image_url = $8,
                thumbnail_url = $9,
                sort_order = $10,
                notes = $11,
                updated_by_user_id = $12,
                updated_at = NOW()
            FROM anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND asset.id = $4
                AND asset.modality_id = modality.id
            RETURNING
                asset.id::text AS id,
                asset.label,
                asset.asset_kind,
                asset.weighting_code,
                asset.image_url,
                asset.thumbnail_url,
                asset.sort_order,
                asset.notes,
                asset.ingest_job_id::text AS ingest_job_id,
                asset.storage_backend,
                asset.storage_key,
                asset.checksum,
                asset.mime_type,
                asset.size_bytes,
                asset.width,
                asset.height,
                asset.source_relative_path,
                asset.series_uid,
                asset.series_label,
                asset.instance_uid,
                asset.slice_index,
                asset.orientation_code,
                TO_CHAR(asset.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(asset.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(asset_id)
        .bind(label)
        .bind(asset_kind)
        .bind(weighting_code)
        .bind(image_url)
        .bind(thumbnail_url)
        .bind(sort_order)
        .bind(notes)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn update_zone_modality_asset_binary_metadata(
        &self,
        pool: &PgPool,
        asset_id: Uuid,
        checksum: &str,
        size_bytes: i64,
        width: i32,
        height: i32,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE anatomy_zone_modality_assets
            SET
                checksum = $2,
                size_bytes = $3,
                width = $4,
                height = $5,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(asset_id)
        .bind(checksum)
        .bind(size_bytes)
        .bind(width)
        .bind(height)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn delete_zone_modality_asset(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let deleted_rows = sqlx::query(
            r#"
            DELETE FROM anatomy_zone_modality_assets AS asset
            USING anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND asset.id = $4
                AND asset.modality_id = modality.id
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(asset_id)
        .execute(pool)
        .await?;

        Ok(deleted_rows.rows_affected() > 0)
    }

    pub async fn delete_zone_modality_assets(
        &self,
        pool: impl sqlx::PgExecutor<'_>,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_ids: &[Uuid],
    ) -> Result<u64, sqlx::Error> {
        if asset_ids.is_empty() {
            return Ok(0);
        }

        let deleted_rows = sqlx::query(
            r#"
            DELETE FROM anatomy_zone_modality_assets AS asset
            USING anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND asset.id = ANY($4::uuid[])
                AND asset.modality_id = modality.id
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(asset_ids)
        .execute(pool)
        .await?;

        Ok(deleted_rows.rows_affected())
    }

    pub async fn get_zone_modality_detail(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Option<ZoneModality>, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneModalityRow>(
            r#"
            SELECT
                modality.id::text AS id,
                modality.family_id::text AS family_id,
                modality.slug,
                modality.name,
                modality.modality_type,
                modality.weighting_code,
                modality.cover_image_url,
                modality.source_kind,
                modality.source_label,
                modality.source_file_count,
                modality.processing_status,
                modality.notes,
                TO_CHAR(modality.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(modality.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn count_active_modality_ingest_jobs(
        &self,
        pool: &PgPool,
        account_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)::bigint
            FROM anatomy_modality_ingest_jobs AS jobs
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = jobs.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND jobs.completed_at IS NULL
                AND jobs.status IN ('queued', 'uploaded', 'validating', 'deriving')
            "#,
        )
        .bind(account_id)
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    pub async fn get_latest_modality_ingest_job(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Option<ModalityIngestJob>, sqlx::Error> {
        let row = sqlx::query_as::<_, ModalityIngestJobRow>(
            r#"
            SELECT
                jobs.id::text AS id,
                jobs.modality_id::text AS modality_id,
                jobs.source_kind,
                jobs.source_label,
                jobs.source_file_count,
                jobs.status,
                jobs.summary_json,
                jobs.error_message,
                TO_CHAR(jobs.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
                TO_CHAR(jobs.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
                TO_CHAR(jobs.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(jobs.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_modality_ingest_jobs AS jobs
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = jobs.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
            ORDER BY jobs.created_at DESC
            LIMIT 1
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn list_modality_source_assets(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Vec<ModalitySourceAsset>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ModalitySourceAssetRow>(
            r#"
            SELECT
                source.id::text AS id,
                source.modality_id::text AS modality_id,
                source.ingest_job_id::text AS ingest_job_id,
                source.asset_role,
                source.original_file_name,
                source.relative_path,
                source.storage_backend,
                source.storage_key,
                source.checksum,
                source.mime_type,
                source.size_bytes,
                TO_CHAR(source.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
            FROM anatomy_modality_source_assets AS source
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = source.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
            ORDER BY source.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn create_modality_ingest_job(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
        user_id: &str,
        source_kind: &str,
        source_label: Option<&str>,
        source_file_count: i32,
        status: &str,
        summary_json: &serde_json::Value,
    ) -> Result<ModalityIngestJob, sqlx::Error> {
        let row = sqlx::query_as::<_, ModalityIngestJobRow>(
            r#"
            INSERT INTO anatomy_modality_ingest_jobs (
                modality_id,
                source_kind,
                source_label,
                source_file_count,
                status,
                summary_json,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            RETURNING
                id::text AS id,
                modality_id::text AS modality_id,
                source_kind,
                source_label,
                source_file_count,
                status,
                summary_json,
                error_message,
                TO_CHAR(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
                TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(modality_id)
        .bind(source_kind)
        .bind(source_label)
        .bind(source_file_count)
        .bind(status)
        .bind(Json(summary_json.clone()))
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    pub async fn update_modality_ingest_job(
        &self,
        pool: &PgPool,
        ingest_job_id: Uuid,
        user_id: &str,
        status: &str,
        summary_json: &serde_json::Value,
        error_message: Option<&str>,
        completed: bool,
    ) -> Result<Option<ModalityIngestJob>, sqlx::Error> {
        let row = sqlx::query_as::<_, ModalityIngestJobRow>(
            r#"
            UPDATE anatomy_modality_ingest_jobs
            SET
                status = $3,
                summary_json = $4,
                error_message = $5,
                completed_at = CASE WHEN $6 THEN NOW() ELSE completed_at END,
                updated_by_user_id = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
                id::text AS id,
                modality_id::text AS modality_id,
                source_kind,
                source_label,
                source_file_count,
                status,
                summary_json,
                error_message,
                TO_CHAR(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
                TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(ingest_job_id)
        .bind(user_id)
        .bind(status)
        .bind(Json(summary_json.clone()))
        .bind(error_message)
        .bind(completed)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn attach_ingest_job_to_modality(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
        ingest_job_id: Uuid,
        user_id: &str,
        processing_status: &str,
        cover_image_url: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE anatomy_zone_modalities
            SET
                latest_ingest_job_id = $2,
                processing_status = $4,
                cover_image_url = COALESCE($5, cover_image_url),
                updated_by_user_id = $3,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(modality_id)
        .bind(ingest_job_id)
        .bind(user_id)
        .bind(processing_status)
        .bind(cover_image_url)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn create_modality_source_asset(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
        ingest_job_id: Uuid,
        asset_role: &str,
        original_file_name: &str,
        relative_path: Option<&str>,
        storage_backend: &str,
        storage_key: &str,
        checksum: &str,
        mime_type: &str,
        size_bytes: i64,
    ) -> Result<ModalitySourceAsset, sqlx::Error> {
        let row = sqlx::query_as::<_, ModalitySourceAssetRow>(
            r#"
            INSERT INTO anatomy_modality_source_assets (
                modality_id,
                ingest_job_id,
                asset_role,
                original_file_name,
                relative_path,
                storage_backend,
                storage_key,
                checksum,
                mime_type,
                size_bytes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
                id::text AS id,
                modality_id::text AS modality_id,
                ingest_job_id::text AS ingest_job_id,
                asset_role,
                original_file_name,
                relative_path,
                storage_backend,
                storage_key,
                checksum,
                mime_type,
                size_bytes,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
            "#,
        )
        .bind(modality_id)
        .bind(ingest_job_id)
        .bind(asset_role)
        .bind(original_file_name)
        .bind(relative_path)
        .bind(storage_backend)
        .bind(storage_key)
        .bind(checksum)
        .bind(mime_type)
        .bind(size_bytes)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_zone_modality_derived_asset(
        &self,
        pool: impl sqlx::PgExecutor<'_>,
        asset_id: Uuid,
        modality_id: Uuid,
        ingest_job_id: Uuid,
        user_id: &str,
        label: &str,
        asset_kind: &str,
        weighting_code: Option<&str>,
        image_url: &str,
        thumbnail_url: Option<&str>,
        sort_order: i32,
        notes: Option<&str>,
        storage_backend: &str,
        storage_key: &str,
        checksum: &str,
        mime_type: &str,
        size_bytes: i64,
        width: i32,
        height: i32,
        source_relative_path: Option<&str>,
        series_uid: Option<&str>,
        series_label: Option<&str>,
        instance_uid: Option<&str>,
        slice_index: i32,
        orientation_code: Option<&str>,
    ) -> Result<ZoneModalityAsset, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneModalityAssetRow>(
            r#"
            INSERT INTO anatomy_zone_modality_assets (
                id,
                modality_id,
                label,
                asset_kind,
                weighting_code,
                image_url,
                thumbnail_url,
                sort_order,
                notes,
                ingest_job_id,
                storage_backend,
                storage_key,
                checksum,
                mime_type,
                size_bytes,
                width,
                height,
                source_relative_path,
                series_uid,
                series_label,
                instance_uid,
                slice_index,
                orientation_code,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $24
            )
            RETURNING
                id::text AS id,
                label,
                asset_kind,
                weighting_code,
                image_url,
                thumbnail_url,
                sort_order,
                notes,
                ingest_job_id::text AS ingest_job_id,
                storage_backend,
                storage_key,
                checksum,
                mime_type,
                size_bytes,
                width,
                height,
                source_relative_path,
                series_uid,
                series_label,
                instance_uid,
                slice_index,
                orientation_code,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(asset_id)
        .bind(modality_id)
        .bind(label)
        .bind(asset_kind)
        .bind(weighting_code)
        .bind(image_url)
        .bind(thumbnail_url)
        .bind(sort_order)
        .bind(notes)
        .bind(ingest_job_id)
        .bind(storage_backend)
        .bind(storage_key)
        .bind(checksum)
        .bind(mime_type)
        .bind(size_bytes)
        .bind(width)
        .bind(height)
        .bind(source_relative_path)
        .bind(series_uid)
        .bind(series_label)
        .bind(instance_uid)
        .bind(slice_index)
        .bind(orientation_code)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    pub async fn upsert_modality_viewer_manifest(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
        ingest_job_id: Uuid,
        schema_version: &str,
        manifest_json: &serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO anatomy_viewer_manifests (
                modality_id,
                ingest_job_id,
                schema_version,
                manifest_json
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (modality_id) DO UPDATE
            SET
                ingest_job_id = EXCLUDED.ingest_job_id,
                schema_version = EXCLUDED.schema_version,
                manifest_json = EXCLUDED.manifest_json,
                updated_at = NOW()
            "#,
        )
        .bind(modality_id)
        .bind(ingest_job_id)
        .bind(schema_version)
        .bind(Json(manifest_json.clone()))
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn get_modality_viewer_manifest_payload(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
    ) -> Result<Option<(String, serde_json::Value)>, sqlx::Error> {
        let row = sqlx::query_as::<_, (String, Json<serde_json::Value>)>(
            r#"
            SELECT schema_version, manifest_json
            FROM anatomy_viewer_manifests
            WHERE modality_id = $1
            "#,
        )
        .bind(modality_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|(schema_version, manifest_json)| (schema_version, manifest_json.0)))
    }

    pub async fn get_zone_modality_asset_storage(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        asset_id: Uuid,
    ) -> Result<Option<ZoneModalityAssetStorageRow>, sqlx::Error> {
        sqlx::query_as::<_, ZoneModalityAssetStorageRow>(
            r#"
            SELECT
                asset.storage_key,
                asset.mime_type,
                asset.asset_kind
            FROM anatomy_zone_modality_assets AS asset
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = asset.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND asset.id = $2
            "#,
        )
        .bind(account_id)
        .bind(asset_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn get_public_zone_modality_asset_account_id(
        &self,
        pool: &PgPool,
        asset_id: Uuid,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar::<_, Uuid>(
            r#"
            SELECT zone.account_id
            FROM anatomy_zone_modality_assets AS asset
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = asset.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE asset.id = $1
              AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = zone.account_id AND accounts.status = 'active')
            LIMIT 1
            "#,
        )
        .bind(asset_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn list_viewer_structure_groups(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Vec<ViewerStructureGroup>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ViewerStructureGroupRow>(
            r#"
            SELECT
                groups.id::text AS id,
                groups.slug,
                groups.title,
                groups.description,
                groups.icon_name,
                groups.thumbnail_url,
                groups.sort_order,
                groups.is_default_visible,
                TO_CHAR(groups.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(groups.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_structure_groups AS groups
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = groups.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
            ORDER BY groups.sort_order ASC, groups.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn create_viewer_structure_group(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
        user_id: &str,
        slug: &str,
        title: &str,
        description: Option<&str>,
        icon_name: Option<&str>,
        thumbnail_url: Option<&str>,
        sort_order: i32,
        is_default_visible: bool,
    ) -> Result<ViewerStructureGroup, sqlx::Error> {
        let row = sqlx::query_as::<_, ViewerStructureGroupRow>(
            r#"
            INSERT INTO anatomy_structure_groups (
                modality_id,
                slug,
                title,
                description,
                icon_name,
                thumbnail_url,
                sort_order,
                is_default_visible,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
            RETURNING
                id::text AS id,
                slug,
                title,
                description,
                icon_name,
                thumbnail_url,
                sort_order,
                is_default_visible,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(modality_id)
        .bind(slug)
        .bind(title)
        .bind(description)
        .bind(icon_name)
        .bind(thumbnail_url)
        .bind(sort_order)
        .bind(is_default_visible)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    pub async fn update_viewer_structure_group(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        group_id: Uuid,
        user_id: &str,
        title: &str,
        description: Option<&str>,
        icon_name: Option<&str>,
        thumbnail_url: Option<&str>,
        sort_order: i32,
        is_default_visible: bool,
    ) -> Result<Option<ViewerStructureGroup>, sqlx::Error> {
        let row = sqlx::query_as::<_, ViewerStructureGroupRow>(
            r#"
            UPDATE anatomy_structure_groups AS groups
            SET
                title = $5,
                description = $6,
                icon_name = $7,
                thumbnail_url = $8,
                sort_order = $9,
                is_default_visible = $10,
                updated_by_user_id = $11,
                updated_at = NOW()
            FROM anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND groups.id = $4
                AND groups.modality_id = modality.id
            RETURNING
                groups.id::text AS id,
                groups.slug,
                groups.title,
                groups.description,
                groups.icon_name,
                groups.thumbnail_url,
                groups.sort_order,
                groups.is_default_visible,
                TO_CHAR(groups.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(groups.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(group_id)
        .bind(title)
        .bind(description)
        .bind(icon_name)
        .bind(thumbnail_url)
        .bind(sort_order)
        .bind(is_default_visible)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn delete_viewer_structure_group(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        group_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let deleted_rows = sqlx::query(
            r#"
            DELETE FROM anatomy_structure_groups AS groups
            USING anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND groups.id = $4
                AND groups.modality_id = modality.id
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(group_id)
        .execute(pool)
        .await?;

        Ok(deleted_rows.rows_affected() > 0)
    }

    pub async fn structure_group_exists_for_modality(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        group_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_structure_groups AS groups
                INNER JOIN anatomy_zone_modalities AS modality ON modality.id = groups.modality_id
                INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
                WHERE
                    zone.account_id = $1
                    AND modality.zone_id = $2
                    AND modality.id = $3
                    AND groups.id = $4
            )
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(group_id)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn structure_group_slug_exists(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        slug: &str,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_structure_groups AS groups
                INNER JOIN anatomy_zone_modalities AS modality ON modality.id = groups.modality_id
                INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
                WHERE
                    zone.account_id = $1
                    AND modality.zone_id = $2
                    AND modality.id = $3
                    AND groups.slug = $4
            )
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(slug)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn list_viewer_structures(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Vec<ViewerStructure>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ViewerStructureRow>(
            r#"
            SELECT
                structures.id::text AS id,
                structures.group_id::text AS group_id,
                structures.slug,
                structures.title,
                structures.color_hex,
                structures.latin_name,
                structures.short_description,
                structures.long_description,
                structures.synonyms,
                structures.learning_points,
                structures.access_level,
                structures.is_pinned_default,
                structures.sort_order,
                TO_CHAR(structures.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(structures.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_structures AS structures
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = structures.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
            ORDER BY structures.sort_order ASC, structures.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn create_viewer_structure(
        &self,
        pool: &PgPool,
        modality_id: Uuid,
        user_id: &str,
        group_id: Option<Uuid>,
        slug: &str,
        title: &str,
        color_hex: &str,
        latin_name: Option<&str>,
        short_description: Option<&str>,
        long_description: Option<&str>,
        synonyms: &[String],
        learning_points: &[String],
        access_level: &str,
        is_pinned_default: bool,
        sort_order: i32,
    ) -> Result<ViewerStructure, sqlx::Error> {
        let row = sqlx::query_as::<_, ViewerStructureRow>(
            r#"
            INSERT INTO anatomy_structures (
                modality_id,
                group_id,
                slug,
                title,
                color_hex,
                latin_name,
                short_description,
                long_description,
                synonyms,
                learning_points,
                access_level,
                is_pinned_default,
                sort_order,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
            RETURNING
                id::text AS id,
                group_id::text AS group_id,
                slug,
                title,
                color_hex,
                latin_name,
                short_description,
                long_description,
                synonyms,
                learning_points,
                access_level,
                is_pinned_default,
                sort_order,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(modality_id)
        .bind(group_id)
        .bind(slug)
        .bind(title)
        .bind(color_hex)
        .bind(latin_name)
        .bind(short_description)
        .bind(long_description)
        .bind(Json(synonyms.to_vec()))
        .bind(Json(learning_points.to_vec()))
        .bind(access_level)
        .bind(is_pinned_default)
        .bind(sort_order)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    pub async fn update_viewer_structure(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        structure_id: Uuid,
        user_id: &str,
        group_id: Option<Uuid>,
        title: &str,
        color_hex: &str,
        latin_name: Option<&str>,
        short_description: Option<&str>,
        long_description: Option<&str>,
        synonyms: &[String],
        learning_points: &[String],
        access_level: &str,
        is_pinned_default: bool,
        sort_order: i32,
    ) -> Result<Option<ViewerStructure>, sqlx::Error> {
        let row = sqlx::query_as::<_, ViewerStructureRow>(
            r#"
            UPDATE anatomy_structures AS structures
            SET
                group_id = $5,
                title = $6,
                color_hex = $7,
                latin_name = $8,
                -- Once an article exists, its revisioned editor owns these fields.
                -- Stale metadata forms must not overwrite the canonical document.
                short_description = CASE WHEN EXISTS (SELECT 1 FROM anatomy_content_documents d WHERE d.structure_id=structures.id) THEN structures.short_description ELSE $9 END,
                long_description = CASE WHEN EXISTS (SELECT 1 FROM anatomy_content_documents d WHERE d.structure_id=structures.id) THEN structures.long_description ELSE $10 END,
                synonyms = $11,
                learning_points = $12,
                access_level = CASE WHEN EXISTS (SELECT 1 FROM anatomy_content_documents d WHERE d.structure_id=structures.id) THEN structures.access_level ELSE $13 END,
                is_pinned_default = $14,
                sort_order = $15,
                updated_by_user_id = $16,
                updated_at = NOW()
            FROM anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND structures.id = $4
                AND structures.modality_id = modality.id
            RETURNING
                structures.id::text AS id,
                structures.group_id::text AS group_id,
                structures.slug,
                structures.title,
                structures.color_hex,
                structures.latin_name,
                structures.short_description,
                structures.long_description,
                structures.synonyms,
                structures.learning_points,
                structures.access_level,
                structures.is_pinned_default,
                structures.sort_order,
                TO_CHAR(structures.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(structures.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(structure_id)
        .bind(group_id)
        .bind(title)
        .bind(color_hex)
        .bind(latin_name)
        .bind(short_description)
        .bind(long_description)
        .bind(Json(synonyms.to_vec()))
        .bind(Json(learning_points.to_vec()))
        .bind(access_level)
        .bind(is_pinned_default)
        .bind(sort_order)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn delete_viewer_structure(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        structure_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let deleted_rows = sqlx::query(
            r#"
            DELETE FROM anatomy_structures AS structures
            USING anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND structures.id = $4
                AND structures.modality_id = modality.id
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(structure_id)
        .execute(pool)
        .await?;

        Ok(deleted_rows.rows_affected() > 0)
    }

    pub async fn structure_exists_for_modality(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        structure_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_structures AS structures
                INNER JOIN anatomy_zone_modalities AS modality ON modality.id = structures.modality_id
                INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
                WHERE
                    zone.account_id = $1
                    AND modality.zone_id = $2
                    AND modality.id = $3
                    AND structures.id = $4
            )
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(structure_id)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn structure_slug_exists(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        slug: &str,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_structures AS structures
                INNER JOIN anatomy_zone_modalities AS modality ON modality.id = structures.modality_id
                INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
                WHERE
                    zone.account_id = $1
                    AND modality.zone_id = $2
                    AND modality.id = $3
                    AND structures.slug = $4
            )
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(slug)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn list_viewer_annotations(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<Vec<ViewerAnnotation>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ViewerAnnotationRow>(
            r#"
            SELECT
                annotations.id::text AS id,
                annotations.asset_id::text AS asset_id,
                annotations.structure_id::text AS structure_id,
                annotations.title_override,
                annotations.color_hex,
                annotations.leader_color_hex,
                annotations.overlay_color_hex,
                annotations.overlay_opacity,
                annotations.anchor_x,
                annotations.anchor_y,
                annotations.label_x,
                annotations.label_y,
                annotations.leader_bend_x,
                annotations.leader_bend_y,
                annotations.polygon_points,
                annotations.note,
                annotations.is_visible_default,
                annotations.is_targeted_default,
                annotations.is_practice_hidden,
                annotations.sort_order,
                TO_CHAR(annotations.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(annotations.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_structure_annotations AS annotations
            INNER JOIN anatomy_zone_modality_assets AS assets ON assets.id = annotations.asset_id
            INNER JOIN anatomy_structures AS structures ON structures.id = annotations.structure_id
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = assets.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND structures.modality_id = modality.id
            ORDER BY annotations.sort_order ASC, annotations.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_viewer_annotation(
        &self,
        pool: &PgPool,
        asset_id: Uuid,
        structure_id: Uuid,
        user_id: &str,
        title_override: Option<&str>,
        color_hex: Option<&str>,
        leader_color_hex: Option<&str>,
        overlay_color_hex: Option<&str>,
        overlay_opacity: f64,
        anchor_x: f64,
        anchor_y: f64,
        label_x: f64,
        label_y: f64,
        leader_bend_x: Option<f64>,
        leader_bend_y: Option<f64>,
        polygon_points: &[ViewerAnnotationPoint],
        note: Option<&str>,
        is_visible_default: bool,
        is_targeted_default: bool,
        is_practice_hidden: bool,
        sort_order: i32,
    ) -> Result<ViewerAnnotation, sqlx::Error> {
        let row = sqlx::query_as::<_, ViewerAnnotationRow>(
            r#"
            INSERT INTO anatomy_structure_annotations (
                asset_id,
                structure_id,
                title_override,
                color_hex,
                leader_color_hex,
                overlay_color_hex,
                overlay_opacity,
                anchor_x,
                anchor_y,
                label_x,
                label_y,
                leader_bend_x,
                leader_bend_y,
                polygon_points,
                note,
                is_visible_default,
                is_targeted_default,
                is_practice_hidden,
                sort_order,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17, $18, $19, $20, $20
            )
            RETURNING
                id::text AS id,
                asset_id::text AS asset_id,
                structure_id::text AS structure_id,
                title_override,
                color_hex,
                leader_color_hex,
                overlay_color_hex,
                overlay_opacity,
                anchor_x,
                anchor_y,
                label_x,
                label_y,
                leader_bend_x,
                leader_bend_y,
                polygon_points,
                note,
                is_visible_default,
                is_targeted_default,
                is_practice_hidden,
                sort_order,
                TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(asset_id)
        .bind(structure_id)
        .bind(title_override)
        .bind(color_hex)
        .bind(leader_color_hex)
        .bind(overlay_color_hex)
        .bind(overlay_opacity)
        .bind(anchor_x)
        .bind(anchor_y)
        .bind(label_x)
        .bind(label_y)
        .bind(leader_bend_x)
        .bind(leader_bend_y)
        .bind(Json(polygon_points.to_vec()))
        .bind(note)
        .bind(is_visible_default)
        .bind(is_targeted_default)
        .bind(is_practice_hidden)
        .bind(sort_order)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_viewer_annotation(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        annotation_id: Uuid,
        asset_id: Uuid,
        structure_id: Uuid,
        user_id: &str,
        title_override: Option<&str>,
        color_hex: Option<&str>,
        leader_color_hex: Option<&str>,
        overlay_color_hex: Option<&str>,
        overlay_opacity: f64,
        anchor_x: f64,
        anchor_y: f64,
        label_x: f64,
        label_y: f64,
        leader_bend_x: Option<f64>,
        leader_bend_y: Option<f64>,
        polygon_points: &[ViewerAnnotationPoint],
        note: Option<&str>,
        is_visible_default: bool,
        is_targeted_default: bool,
        is_practice_hidden: bool,
        sort_order: i32,
    ) -> Result<Option<ViewerAnnotation>, sqlx::Error> {
        let row = sqlx::query_as::<_, ViewerAnnotationRow>(
            r#"
            UPDATE anatomy_structure_annotations AS annotations
            SET
                asset_id = $6,
                structure_id = $7,
                title_override = $9,
                color_hex = $10,
                leader_color_hex = $11,
                overlay_color_hex = $12,
                overlay_opacity = $13,
                anchor_x = $14,
                anchor_y = $15,
                label_x = $16,
                label_y = $17,
                leader_bend_x = $18,
                leader_bend_y = $19,
                polygon_points = $20,
                note = $21,
                is_visible_default = $22,
                is_targeted_default = $23,
                is_practice_hidden = $24,
                sort_order = $25,
                updated_by_user_id = $26,
                updated_at = NOW()
            FROM anatomy_zone_modality_assets AS assets
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = assets.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            INNER JOIN anatomy_structures AS structures ON structures.modality_id = modality.id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND annotations.id = $4
                AND annotations.asset_id = assets.id
                AND structures.id = $8
                AND assets.id = $5
            RETURNING
                annotations.id::text AS id,
                annotations.asset_id::text AS asset_id,
                annotations.structure_id::text AS structure_id,
                annotations.title_override,
                annotations.color_hex,
                annotations.leader_color_hex,
                annotations.overlay_color_hex,
                annotations.overlay_opacity,
                annotations.anchor_x,
                annotations.anchor_y,
                annotations.label_x,
                annotations.label_y,
                annotations.leader_bend_x,
                annotations.leader_bend_y,
                annotations.polygon_points,
                annotations.note,
                annotations.is_visible_default,
                annotations.is_targeted_default,
                annotations.is_practice_hidden,
                annotations.sort_order,
                TO_CHAR(annotations.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(annotations.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(annotation_id)
        .bind(asset_id)
        .bind(asset_id)
        .bind(structure_id)
        .bind(structure_id)
        .bind(title_override)
        .bind(color_hex)
        .bind(leader_color_hex)
        .bind(overlay_color_hex)
        .bind(overlay_opacity)
        .bind(anchor_x)
        .bind(anchor_y)
        .bind(label_x)
        .bind(label_y)
        .bind(leader_bend_x)
        .bind(leader_bend_y)
        .bind(Json(polygon_points.to_vec()))
        .bind(note)
        .bind(is_visible_default)
        .bind(is_targeted_default)
        .bind(is_practice_hidden)
        .bind(sort_order)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    pub async fn delete_viewer_annotation(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        annotation_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let deleted_rows = sqlx::query(
            r#"
            DELETE FROM anatomy_structure_annotations AS annotations
            USING anatomy_zone_modality_assets AS assets
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = assets.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND annotations.id = $4
                AND annotations.asset_id = assets.id
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(annotation_id)
        .execute(pool)
        .await?;

        Ok(deleted_rows.rows_affected() > 0)
    }

    pub async fn asset_exists_for_modality(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_zone_modality_assets AS assets
                INNER JOIN anatomy_zone_modalities AS modality ON modality.id = assets.modality_id
                INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
                WHERE
                    zone.account_id = $1
                    AND modality.zone_id = $2
                    AND modality.id = $3
                    AND assets.id = $4
            )
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(asset_id)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ZoneListRow {
    id: String,
    slug: String,
    name: String,
    body_view: String,
    anchor_x: f64,
    anchor_y: f64,
    anchor_z: f64,
}

impl From<ZoneListRow> for ZoneListItem {
    fn from(value: ZoneListRow) -> Self {
        Self {
            id: value.id,
            slug: value.slug,
            name: value.name,
            body_view: value.body_view,
            anchor: ZoneAnchor {
                x: value.anchor_x,
                y: value.anchor_y,
                z: value.anchor_z,
            },
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ZoneDetailRow {
    id: String,
    slug: String,
    name: String,
    description: Option<String>,
    body_view: String,
    anchor_x: f64,
    anchor_y: f64,
    anchor_z: f64,
    created_at: String,
    updated_at: String,
}

impl From<ZoneDetailRow> for ZoneDetail {
    fn from(value: ZoneDetailRow) -> Self {
        Self {
            id: value.id,
            slug: value.slug,
            name: value.name,
            description: value.description,
            body_view: value.body_view,
            anchor: ZoneAnchor {
                x: value.anchor_x,
                y: value.anchor_y,
                z: value.anchor_z,
            },
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ZoneModalityRow {
    id: String,
    family_id: String,
    slug: String,
    name: String,
    modality_type: String,
    weighting_code: Option<String>,
    cover_image_url: Option<String>,
    source_kind: String,
    source_label: Option<String>,
    source_file_count: i32,
    processing_status: String,
    notes: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<ZoneModalityRow> for ZoneModality {
    fn from(value: ZoneModalityRow) -> Self {
        Self {
            id: value.id,
            family_id: value.family_id,
            slug: value.slug,
            name: value.name,
            modality_type: value.modality_type,
            weighting_code: value.weighting_code,
            cover_image_url: value.cover_image_url,
            source_kind: value.source_kind,
            source_label: value.source_label,
            source_file_count: value.source_file_count,
            processing_status: value.processing_status,
            ingest_status: None,
            ingest_summary_json: None,
            notes: value.notes,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ZoneModalityFamilyVariantRow {
    family_slug: String,
    family_primary_modality_id: Option<String>,
    family_id: String,
    family_name: String,
    family_modality_type: String,
    family_thumbnail_url: Option<String>,
    family_notes: Option<String>,
    modality_id: String,
    modality_family_id: String,
    modality_slug: String,
    modality_name: String,
    modality_modality_type: String,
    weighting_code: Option<String>,
    cover_image_url: Option<String>,
    source_kind: String,
    source_label: Option<String>,
    source_file_count: i32,
    processing_status: String,
    ingest_status: Option<String>,
    ingest_summary_json: Option<Json<serde_json::Value>>,
    modality_notes: Option<String>,
    modality_created_at: String,
    modality_updated_at: String,
}

#[derive(Debug, sqlx::FromRow)]
struct PublicZoneModalityFamilyVariantRow {
    family_id: String,
    family_name: String,
    modality_slug: String,
    processing_status: String,
}

fn group_zone_modality_family_rows(
    rows: Vec<ZoneModalityFamilyVariantRow>,
) -> Vec<ZoneModalityFamily> {
    let mut families: Vec<ZoneModalityFamily> = Vec::new();
    let mut family_indices = HashMap::<String, usize>::new();

    for row in rows {
        let is_ready = row.processing_status == "ready";
        let family_id = row.family_id.clone();
        let variant = ZoneModality {
            id: row.modality_id,
            family_id: row.modality_family_id,
            slug: row.modality_slug,
            name: row.modality_name,
            modality_type: row.modality_modality_type,
            weighting_code: row.weighting_code,
            cover_image_url: row.cover_image_url,
            source_kind: row.source_kind,
            source_label: row.source_label,
            source_file_count: row.source_file_count,
            processing_status: row.processing_status,
            ingest_status: row.ingest_status,
            ingest_summary_json: row.ingest_summary_json.map(|value| value.0),
            notes: row.modality_notes,
            created_at: row.modality_created_at,
            updated_at: row.modality_updated_at,
        };

        if let Some(index) = family_indices.get(&family_id).copied() {
            let family = &mut families[index];
            family.total_variant_count += 1;
            if is_ready {
                family.ready_variant_count += 1;
            }
            family.variants.push(variant);
            continue;
        }

        family_indices.insert(family_id.clone(), families.len());
        families.push(ZoneModalityFamily {
            slug: row.family_slug,
            primary_modality_id: row.family_primary_modality_id,
            id: family_id,
            name: row.family_name,
            modality_type: row.family_modality_type,
            thumbnail_url: row.family_thumbnail_url,
            notes: row.family_notes,
            ready_variant_count: usize::from(is_ready),
            total_variant_count: 1,
            variants: vec![variant],
        });
    }

    families
}

fn group_public_zone_modality_rows(
    rows: Vec<PublicZoneModalityFamilyVariantRow>,
) -> Vec<PublicZoneModalityListItem> {
    let mut items: Vec<PublicZoneModalityListItem> = Vec::new();
    let mut item_indices = HashMap::<String, usize>::new();

    for row in rows {
        let is_ready = row.processing_status == "ready";

        if let Some(index) = item_indices.get(&row.family_id).copied() {
            let item = &mut items[index];
            item.total_variant_count += 1;
            if is_ready {
                item.ready_variant_count += 1;
            }
            continue;
        }

        item_indices.insert(row.family_id.clone(), items.len());
        items.push(PublicZoneModalityListItem {
            id: row.family_id,
            slug: row.modality_slug,
            name: row.family_name,
            ready_variant_count: usize::from(is_ready),
            total_variant_count: 1,
        });
    }

    items
}

#[derive(Debug, sqlx::FromRow)]
pub struct PublicZoneModalityLookupRow {
    pub account_id: Uuid,
    pub zone_id: Uuid,
    pub modality_id: Uuid,
}

#[derive(Debug, sqlx::FromRow)]
struct ModalityIngestJobRow {
    id: String,
    modality_id: String,
    source_kind: String,
    source_label: Option<String>,
    source_file_count: i32,
    status: String,
    summary_json: Json<serde_json::Value>,
    error_message: Option<String>,
    started_at: String,
    completed_at: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<ModalityIngestJobRow> for ModalityIngestJob {
    fn from(value: ModalityIngestJobRow) -> Self {
        Self {
            id: value.id,
            modality_id: value.modality_id,
            source_kind: value.source_kind,
            source_label: value.source_label,
            source_file_count: value.source_file_count,
            status: value.status,
            summary_json: value.summary_json.0,
            error_message: value.error_message,
            started_at: value.started_at,
            completed_at: value.completed_at,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ModalitySourceAssetRow {
    id: String,
    modality_id: String,
    ingest_job_id: String,
    asset_role: String,
    original_file_name: String,
    relative_path: Option<String>,
    storage_backend: String,
    storage_key: String,
    checksum: String,
    mime_type: String,
    size_bytes: i64,
    created_at: String,
}

impl From<ModalitySourceAssetRow> for ModalitySourceAsset {
    fn from(value: ModalitySourceAssetRow) -> Self {
        Self {
            id: value.id,
            modality_id: value.modality_id,
            ingest_job_id: value.ingest_job_id,
            asset_role: value.asset_role,
            original_file_name: value.original_file_name,
            relative_path: value.relative_path,
            storage_backend: value.storage_backend,
            storage_key: value.storage_key,
            checksum: value.checksum,
            mime_type: value.mime_type,
            size_bytes: value.size_bytes,
            created_at: value.created_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ZoneModalityAssetRow {
    id: String,
    label: String,
    asset_kind: String,
    weighting_code: Option<String>,
    image_url: String,
    thumbnail_url: Option<String>,
    sort_order: i32,
    notes: Option<String>,
    ingest_job_id: Option<String>,
    storage_backend: Option<String>,
    storage_key: Option<String>,
    checksum: Option<String>,
    mime_type: Option<String>,
    size_bytes: Option<i64>,
    width: Option<i32>,
    height: Option<i32>,
    source_relative_path: Option<String>,
    series_uid: Option<String>,
    series_label: Option<String>,
    instance_uid: Option<String>,
    slice_index: Option<i32>,
    orientation_code: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<ZoneModalityAssetRow> for ZoneModalityAsset {
    fn from(value: ZoneModalityAssetRow) -> Self {
        Self {
            id: value.id,
            label: value.label,
            asset_kind: value.asset_kind,
            weighting_code: value.weighting_code,
            image_url: value.image_url,
            thumbnail_url: value.thumbnail_url,
            sort_order: value.sort_order,
            notes: value.notes,
            ingest_job_id: value.ingest_job_id,
            storage_backend: value.storage_backend,
            storage_key: value.storage_key,
            checksum: value.checksum,
            mime_type: value.mime_type,
            size_bytes: value.size_bytes,
            width: value.width,
            height: value.height,
            source_relative_path: value.source_relative_path,
            series_uid: value.series_uid,
            series_label: value.series_label,
            instance_uid: value.instance_uid,
            slice_index: value.slice_index,
            orientation_code: value.orientation_code,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
pub struct ZoneModalityAssetStorageRow {
    pub storage_key: Option<String>,
    pub mime_type: Option<String>,
    pub asset_kind: String,
}

#[derive(Debug, sqlx::FromRow)]
struct ViewerStructureGroupRow {
    id: String,
    slug: String,
    title: String,
    description: Option<String>,
    icon_name: Option<String>,
    thumbnail_url: Option<String>,
    sort_order: i32,
    is_default_visible: bool,
    created_at: String,
    updated_at: String,
}

impl From<ViewerStructureGroupRow> for ViewerStructureGroup {
    fn from(value: ViewerStructureGroupRow) -> Self {
        Self {
            id: value.id,
            slug: value.slug,
            title: value.title,
            description: value.description,
            icon_name: value.icon_name,
            thumbnail_url: value.thumbnail_url,
            sort_order: value.sort_order,
            is_default_visible: value.is_default_visible,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ViewerStructureRow {
    id: String,
    group_id: Option<String>,
    slug: String,
    title: String,
    color_hex: String,
    latin_name: Option<String>,
    short_description: Option<String>,
    long_description: Option<String>,
    synonyms: Json<Vec<String>>,
    learning_points: Json<Vec<String>>,
    access_level: String,
    is_pinned_default: bool,
    sort_order: i32,
    created_at: String,
    updated_at: String,
}

impl From<ViewerStructureRow> for ViewerStructure {
    fn from(value: ViewerStructureRow) -> Self {
        Self {
            id: value.id,
            group_id: value.group_id,
            slug: value.slug,
            title: value.title,
            color_hex: value.color_hex,
            latin_name: value.latin_name,
            short_description: value.short_description,
            long_description: value.long_description,
            synonyms: value.synonyms.0,
            learning_points: value.learning_points.0,
            access_level: value.access_level,
            is_pinned_default: value.is_pinned_default,
            sort_order: value.sort_order,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct ViewerAnnotationRow {
    id: String,
    asset_id: String,
    structure_id: String,
    title_override: Option<String>,
    color_hex: Option<String>,
    leader_color_hex: Option<String>,
    overlay_color_hex: Option<String>,
    overlay_opacity: f64,
    anchor_x: f64,
    anchor_y: f64,
    label_x: f64,
    label_y: f64,
    leader_bend_x: Option<f64>,
    leader_bend_y: Option<f64>,
    polygon_points: Json<Vec<ViewerAnnotationPoint>>,
    note: Option<String>,
    is_visible_default: bool,
    is_targeted_default: bool,
    is_practice_hidden: bool,
    sort_order: i32,
    created_at: String,
    updated_at: String,
}

impl From<ViewerAnnotationRow> for ViewerAnnotation {
    fn from(value: ViewerAnnotationRow) -> Self {
        Self {
            id: value.id,
            asset_id: value.asset_id,
            structure_id: value.structure_id,
            title_override: value.title_override,
            color_hex: value.color_hex,
            leader_color_hex: value.leader_color_hex,
            overlay_color_hex: value.overlay_color_hex,
            overlay_opacity: value.overlay_opacity,
            anchor_x: value.anchor_x,
            anchor_y: value.anchor_y,
            label_x: value.label_x,
            label_y: value.label_y,
            leader_bend_x: value.leader_bend_x,
            leader_bend_y: value.leader_bend_y,
            polygon_points: value.polygon_points.0,
            note: value.note,
            is_visible_default: value.is_visible_default,
            is_targeted_default: value.is_targeted_default,
            is_practice_hidden: value.is_practice_hidden,
            sort_order: value.sort_order,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

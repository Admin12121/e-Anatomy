use sqlx::PgPool;
use uuid::Uuid;

use crate::features::playground::domain::models::{
    ZoneAnchor, ZoneDetail, ZoneListItem, ZoneModality, ZoneModalityAsset,
};

#[derive(Debug, Clone, Default)]
pub struct PlaygroundRepository;

impl PlaygroundRepository {
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
            ORDER BY name ASC, created_at ASC
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

    pub async fn create_zone(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        user_id: &str,
        slug: &str,
        name: &str,
        description: Option<&str>,
        body_view: &str,
        anchor_x: f64,
        anchor_y: f64,
        anchor_z: f64,
    ) -> Result<ZoneDetail, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneDetailRow>(
            r#"
            INSERT INTO anatomy_zones (
                account_id,
                slug,
                name,
                description,
                body_view,
                anchor_x,
                anchor_y,
                anchor_z,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
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
        .bind(slug)
        .bind(name)
        .bind(description)
        .bind(body_view)
        .bind(anchor_x)
        .bind(anchor_y)
        .bind(anchor_z)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
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
            WHERE account_id = $1 AND id = $2
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

    pub async fn slug_exists(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        slug: &str,
    ) -> Result<bool, sqlx::Error> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM anatomy_zones
                WHERE account_id = $1 AND slug = $2
            )
            "#,
        )
        .bind(account_id)
        .bind(slug)
        .fetch_one(pool)
        .await?;

        Ok(exists)
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

    pub async fn list_zone_modalities(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<Vec<ZoneModality>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ZoneModalityRow>(
            r#"
            SELECT
                modality.id::text AS id,
                modality.name,
                modality.modality_type,
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
            WHERE zone.account_id = $1 AND modality.zone_id = $2
            ORDER BY modality.updated_at DESC, modality.name ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn create_zone_modality(
        &self,
        pool: &PgPool,
        zone_id: Uuid,
        user_id: &str,
        name: &str,
        modality_type: &str,
        cover_image_url: Option<&str>,
        source_kind: &str,
        source_label: Option<&str>,
        source_file_count: i32,
        processing_status: &str,
        notes: Option<&str>,
    ) -> Result<ZoneModality, sqlx::Error> {
        let row = sqlx::query_as::<_, ZoneModalityRow>(
            r#"
            INSERT INTO anatomy_zone_modalities (
                zone_id,
                name,
                modality_type,
                cover_image_url,
                source_kind,
                source_label,
                source_file_count,
                processing_status,
                notes,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
            RETURNING
                id::text AS id,
                name,
                modality_type,
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
        .bind(name)
        .bind(modality_type)
        .bind(cover_image_url)
        .bind(source_kind)
        .bind(source_label)
        .bind(source_file_count)
        .bind(processing_status)
        .bind(notes)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    pub async fn update_zone_modality(
        &self,
        pool: &PgPool,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        name: &str,
        modality_type: &str,
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
                cover_image_url = $6,
                source_kind = $7,
                source_label = $8,
                source_file_count = $9,
                processing_status = $10,
                notes = $11,
                updated_by_user_id = $12,
                updated_at = NOW()
            FROM anatomy_zones AS zone
            WHERE
                modality.id = $3
                AND modality.zone_id = $2
                AND zone.id = modality.zone_id
                AND zone.account_id = $1
            RETURNING
                modality.id::text AS id,
                modality.name,
                modality.modality_type,
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
                TO_CHAR(asset.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                TO_CHAR(asset.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM anatomy_zone_modality_assets AS asset
            INNER JOIN anatomy_zone_modalities AS modality ON modality.id = asset.modality_id
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.account_id = $1 AND modality.zone_id = $2 AND modality.id = $3
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
    name: String,
    modality_type: String,
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
            name: value.name,
            modality_type: value.modality_type,
            cover_image_url: value.cover_image_url,
            source_kind: value.source_kind,
            source_label: value.source_label,
            source_file_count: value.source_file_count,
            processing_status: value.processing_status,
            notes: value.notes,
            created_at: value.created_at,
            updated_at: value.updated_at,
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
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

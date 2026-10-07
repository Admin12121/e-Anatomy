use super::models::{
    ContentDocument, ContentFamily, ContentLabel, PublicTopic, ResourceInput, SaveDocumentInput,
};
use crate::infrastructure::error::AppError;
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{PgPool, types::Json};
use uuid::Uuid;

pub async fn public_topics(pool: &PgPool) -> Result<Vec<PublicTopic>, AppError> {
    Ok(sqlx::query_as::<_, PublicTopic>(r#"
        SELECT f.id, f.slug, f.name, z.slug AS zone_slug, z.name AS zone_name,
            COALESCE(d.access_level = 'free', false) AS has_article,
            f.thumbnail_url, first_label.slug AS first_label_slug,
            COALESCE(topic_labels.items, '[]'::jsonb) AS labels
        FROM anatomy_zone_modality_families f JOIN anatomy_zones z ON z.id = f.zone_id
        JOIN accounts a ON a.id = z.account_id AND a.status = 'active'
        LEFT JOIN anatomy_content_documents d ON d.family_id = f.id
        LEFT JOIN LATERAL (
            SELECT id FROM anatomy_zone_modalities WHERE family_id = f.id
            ORDER BY (id = f.primary_modality_id) DESC NULLS LAST,
                (processing_status = 'ready') DESC, created_at, id LIMIT 1
        ) primary_variant ON true
        LEFT JOIN LATERAL (
            SELECT s.slug FROM anatomy_structures s
            LEFT JOIN anatomy_content_documents ld ON ld.structure_id = s.id
            WHERE s.modality_id = primary_variant.id AND COALESCE(ld.access_level, s.access_level) = 'free'
            ORDER BY s.sort_order, s.id LIMIT 1
        ) first_label ON true
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'title', s.title,
                'thumbnailUrl', g.thumbnail_url) ORDER BY g.sort_order NULLS LAST, s.sort_order, s.id) AS items
            FROM anatomy_structures s
            LEFT JOIN anatomy_structure_groups g ON g.id = s.group_id
            LEFT JOIN anatomy_content_documents ld ON ld.structure_id = s.id
            WHERE s.modality_id = primary_variant.id AND COALESCE(ld.access_level, s.access_level) = 'free'
        ) topic_labels ON true
        WHERE (d.access_level = 'free') OR first_label.slug IS NOT NULL
            OR EXISTS (SELECT 1 FROM anatomy_zone_modalities m WHERE m.family_id = f.id AND m.processing_status = 'ready')
        ORDER BY z.name, f.name, f.id
    "#).fetch_all(pool).await?)
}

pub async fn family(
    pool: &PgPool,
    account: Option<Uuid>,
    id: Option<Uuid>,
    zone: Option<&str>,
    slug: Option<&str>,
) -> Result<ContentFamily, AppError> {
    sqlx::query_as::<_, ContentFamily>(r#"
        SELECT f.id, f.slug, f.name, z.id AS zone_id, z.slug AS zone_slug, z.name AS zone_name,
            primary_variant.id AS primary_modality_id, primary_variant.slug AS viewer_slug, f.thumbnail_url, f.modality_type
        FROM anatomy_zone_modality_families f JOIN anatomy_zones z ON z.id = f.zone_id
        LEFT JOIN LATERAL (
            SELECT id, slug FROM anatomy_zone_modalities WHERE family_id = f.id
            ORDER BY (id = f.primary_modality_id) DESC NULLS LAST,
                (processing_status = 'ready') DESC, created_at, id LIMIT 1
        ) primary_variant ON true
        WHERE ($1::uuid IS NULL OR z.account_id = $1)
            AND ($1::uuid IS NOT NULL OR EXISTS(SELECT 1 FROM accounts WHERE id = z.account_id AND status = 'active'))
            AND ($2::uuid IS NULL OR f.id = $2)
            AND (
                (($3::text IS NULL OR z.slug = $3) AND
                 ($4::text IS NULL OR f.slug = $4 OR EXISTS (
                     SELECT 1 FROM anatomy_zone_modalities m
                     WHERE m.family_id=f.id AND m.slug=$4
                 )))
                OR ($3::text IS NOT NULL AND $4::text IS NOT NULL AND EXISTS (
                    SELECT 1 FROM anatomy_legacy_modality_routes old
                    JOIN anatomy_zone_modalities m ON m.id=old.modality_id
                    WHERE m.family_id=f.id AND old.account_id=z.account_id
                      AND old.original_zone_slug=$3
                      AND old.original_modality_slug=$4
                ))
                OR ($3::text IS NOT NULL AND $4::text IS NOT NULL AND EXISTS (
                    SELECT 1 FROM anatomy_legacy_family_routes old
                    WHERE old.family_id=f.id AND old.account_id=z.account_id
                      AND old.original_zone_slug=$3 AND old.original_family_slug=$4
                ))
            )
        ORDER BY (f.slug = $4) DESC NULLS LAST, f.id LIMIT 1
    "#).bind(account).bind(id).bind(zone).bind(slug).fetch_optional(pool).await?
        .ok_or_else(|| AppError::not_found("Content not found"))
}

pub async fn labels(
    pool: &PgPool,
    family: &ContentFamily,
    public: bool,
) -> Result<Vec<ContentLabel>, AppError> {
    Ok(sqlx::query_as::<_, ContentLabel>(
        r#"
        SELECT s.id, s.slug, s.title, g.title AS group_name, g.thumbnail_url,
            m.id AS modality_id, m.name AS modality_name, m.id = $2 AS is_primary,
            COALESCE(d.revision, 0) AS revision, d.published_revision
        FROM anatomy_structures s JOIN anatomy_zone_modalities m ON m.id = s.modality_id
        LEFT JOIN anatomy_structure_groups g ON g.id = s.group_id
        LEFT JOIN anatomy_content_documents d ON d.structure_id = s.id
        WHERE m.family_id = $1 AND (NOT $3 OR (m.id = $2 AND
            COALESCE(d.access_level, s.access_level) = 'free'))
        ORDER BY m.created_at, m.id, g.sort_order NULLS LAST, s.sort_order, s.id
    "#,
    )
    .bind(family.id)
    .bind(family.primary_modality_id)
    .bind(public)
    .fetch_all(pool)
    .await?)
}

pub async fn check_target(
    pool: &PgPool,
    family_id: Uuid,
    target: &str,
) -> Result<Option<Uuid>, AppError> {
    if target == "modality" {
        return Ok(None);
    }
    let id =
        Uuid::parse_str(target).map_err(|_| AppError::bad_request("Invalid label identifier"))?;
    let exists: bool = sqlx::query_scalar(r#"
        SELECT EXISTS(SELECT 1 FROM anatomy_structures s JOIN anatomy_zone_modalities m ON m.id = s.modality_id
            WHERE s.id = $1 AND m.family_id = $2)
    "#).bind(id).bind(family_id).fetch_one(pool).await?;
    if !exists {
        return Err(AppError::not_found(
            "Label not found in this content family",
        ));
    }
    Ok(Some(id))
}

#[derive(sqlx::FromRow)]
struct DocumentRow {
    id: Uuid,
    summary: String,
    body_json: Json<Value>,
    legacy_markdown: Option<String>,
    access_level: String,
    revision: i32,
    published_revision: Option<i32>,
    published_at: Option<DateTime<Utc>>,
    resources: Json<Vec<ResourceInput>>,
}

pub async fn document(
    pool: &PgPool,
    family_id: Uuid,
    structure_id: Option<Uuid>,
    public: bool,
) -> Result<ContentDocument, AppError> {
    let row = sqlx::query_as::<_, DocumentRow>(r#"
        SELECT d.id,
            d.summary, d.body_json, d.legacy_markdown, d.access_level, d.revision,
            d.published_revision, d.published_at,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object('kind', r.kind, 'title', r.title, 'url', r.url, 'caption', r.caption)
                    ORDER BY r.sort_order) FROM anatomy_content_resources r WHERE r.document_id = d.id
            ), '[]'::jsonb) AS resources
        FROM anatomy_content_documents d
        WHERE (($2::uuid IS NULL AND d.family_id = $1) OR d.structure_id = $2)
            AND (NOT $3 OR d.access_level = 'free')
    "#).bind(family_id).bind(structure_id).bind(public).fetch_optional(pool).await?;
    if let Some(row) = row {
        return Ok(ContentDocument {
            id: Some(row.id),
            summary: row.summary,
            body_json: row.body_json.0,
            legacy_markdown: row.legacy_markdown,
            access_level: row.access_level,
            revision: row.revision,
            published_revision: row.published_revision,
            published_at: row.published_at,
            resources: row.resources.0,
        });
    }
    if public && sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM anatomy_content_documents WHERE (($2::uuid IS NULL AND family_id = $1) OR structure_id = $2) AND access_level <> 'free')"
    ).bind(family_id).bind(structure_id).fetch_one(pool).await? {
        return Err(AppError::not_found("Article not found"));
    }
    let legacy = if let Some(id) = structure_id {
        sqlx::query_as::<_, (Option<String>, Option<String>, String)>(
            "SELECT short_description, long_description, access_level FROM anatomy_structures WHERE id = $1"
        ).bind(id).fetch_optional(pool).await?
    } else {
        None
    };
    let (summary, legacy_markdown, access_level) = legacy.unwrap_or((None, None, "free".into()));
    if public && access_level != "free" {
        return Err(AppError::not_found("Article not found"));
    }
    Ok(ContentDocument {
        id: None,
        summary: summary.unwrap_or_default(),
        body_json: json!([]),
        legacy_markdown,
        access_level,
        revision: 0,
        published_revision: None,
        published_at: None,
        resources: vec![],
    })
}

pub async fn save(
    pool: &PgPool,
    account: Uuid,
    user_id: &str,
    family_id: Uuid,
    structure_id: Option<Uuid>,
    input: SaveDocumentInput,
) -> Result<ContentDocument, AppError> {
    input.validate()?;
    let mut tx = pool.begin().await?;
    // This lock also serializes first-time document creation and checks tenant ownership.
    let found: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT f.id FROM anatomy_zone_modality_families f JOIN anatomy_zones z ON z.id = f.zone_id
        WHERE f.id = $1 AND z.account_id = $2 FOR UPDATE OF f
    "#,
    )
    .bind(family_id)
    .bind(account)
    .fetch_optional(&mut *tx)
    .await?;
    if found.is_none() {
        return Err(AppError::not_found("Content not found"));
    }
    // Recheck membership within the transaction; a label can move while a page is open.
    if let Some(id) = structure_id {
        let member: Option<Uuid> = sqlx::query_scalar(r#"
            SELECT s.id FROM anatomy_structures s JOIN anatomy_zone_modalities m ON m.id = s.modality_id
            WHERE s.id = $1 AND m.family_id = $2 FOR UPDATE OF s, m
        "#).bind(id).bind(family_id).fetch_optional(&mut *tx).await?;
        if member.is_none() {
            return Err(AppError::not_found(
                "Label no longer belongs to this family",
            ));
        }
    }
    sqlx::query(r#"
        INSERT INTO anatomy_content_documents(family_id, structure_id, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $3) ON CONFLICT DO NOTHING
    "#).bind(if structure_id.is_none() { Some(family_id) } else { None }).bind(structure_id).bind(user_id)
        .execute(&mut *tx).await?;
    let (id, revision): (Uuid, i32) = sqlx::query_as(
        r#"
        SELECT id, revision FROM anatomy_content_documents
        WHERE (($2::uuid IS NULL AND family_id = $1) OR structure_id = $2) FOR UPDATE
    "#,
    )
    .bind(family_id)
    .bind(structure_id)
    .fetch_one(&mut *tx)
    .await?;
    if revision != input.revision {
        return Err(AppError::Conflict(
            "This document changed in another session. Your draft has not been saved; reload the latest version and review your draft before saving.".into(),
        ));
    }
    sqlx::query(r#"
        UPDATE anatomy_content_documents SET summary = $2, body_json = $3, legacy_markdown = NULL,
            access_level = $4, revision = revision + 1, updated_by_user_id = $5, updated_at = NOW() WHERE id = $1
    "#).bind(id).bind(input.summary.trim()).bind(&input.body_json).bind(&input.access_level).bind(user_id)
        .execute(&mut *tx).await?;
    sqlx::query("DELETE FROM anatomy_content_resources WHERE document_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for (index, resource) in input.resources.iter().enumerate() {
        sqlx::query("INSERT INTO anatomy_content_resources(document_id, kind, title, url, caption, sort_order) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(id).bind(&resource.kind).bind(resource.title.trim()).bind(&resource.url).bind(&resource.caption).bind(index as i32)
            .execute(&mut *tx).await?;
    }
    sqlx::query(r#"
        UPDATE anatomy_content_documents SET published_revision = revision, published_summary = summary,
            published_body_json = body_json, published_legacy_markdown = legacy_markdown,
            published_access_level = access_level, published_resources = $2, published_at = NOW() WHERE id = $1
    "#).bind(id).bind(serde_json::to_value(&input.resources).map_err(|e| AppError::internal(e.to_string()))?)
        .execute(&mut *tx).await?;
    if let Some(structure) = structure_id {
        let (summary, body) = input.public_viewer_description();
        sqlx::query("UPDATE anatomy_structures SET short_description=$2, long_description=$3, access_level=$4, updated_by_user_id=$5, updated_at=NOW() WHERE id=$1")
            .bind(structure).bind(summary).bind(body).bind(&input.access_level).bind(user_id)
            .execute(&mut *tx).await?;
    }
    // Capture this transaction's revision before releasing locks. A later writer must
    // not change the response or give this editor a revision for somebody else's body.
    let (saved_revision, published_revision, published_at): (i32, Option<i32>, Option<DateTime<Utc>>) =
        sqlx::query_as("SELECT revision, published_revision, published_at FROM anatomy_content_documents WHERE id=$1")
            .bind(id).fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok(ContentDocument {
        id: Some(id),
        summary: input.summary.trim().to_owned(),
        body_json: input.body_json,
        legacy_markdown: None,
        access_level: input.access_level,
        revision: saved_revision,
        published_revision,
        published_at,
        resources: input
            .resources
            .into_iter()
            .map(|mut resource| {
                resource.title = resource.title.trim().to_owned();
                resource
            })
            .collect(),
    })
}

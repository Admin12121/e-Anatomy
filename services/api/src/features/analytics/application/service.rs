use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    features::analytics::domain::models::{
        AnalyticsDailyValue, AnalyticsDimensionValue, AnalyticsEventInput, AnalyticsEventRow,
        AnalyticsEventsReport, AnalyticsOverviewReport,
    },
    infrastructure::error::AppError,
};

const MAX_EVENTS_PER_MINUTE: i64 = 120;

#[derive(Clone)]
pub struct AnalyticsService {
    pool: PgPool,
    hash_salt: String,
}

#[derive(Debug, sqlx::FromRow)]
struct ContentContext {
    account_id: Uuid,
    content_id: Uuid,
    modality_id: Uuid,
    zone_id: Uuid,
    structure_id: Option<Uuid>,
}

impl AnalyticsService {
    pub fn new(pool: PgPool, hash_salt: String) -> Self {
        Self { pool, hash_salt }
    }

    pub async fn record_event(
        &self,
        input: AnalyticsEventInput,
        source_ip: Option<&str>,
        user_agent: Option<&str>,
        accept_language: Option<&str>,
        country_code: Option<&str>,
    ) -> Result<bool, AppError> {
        input.validate()?;

        let ip_hash = source_ip.map(|value| self.hash_value(value));
        let device_hash = user_agent.map(|value| {
            self.hash_value(&format!("{value}|{}", accept_language.unwrap_or_default()))
        });
        let (visitor_events, device_events) = sqlx::query_as::<_, (i64, i64)>(
            r#"
            SELECT
                COUNT(*) FILTER (WHERE visitor_id = $1)::bigint,
                COUNT(*) FILTER (
                    WHERE $2::text IS NOT NULL
                      AND $3::text IS NOT NULL
                      AND ip_hash = $2
                      AND device_hash = $3
                )::bigint
            FROM analytics_events
            WHERE received_at >= NOW() - INTERVAL '1 minute'
            "#,
        )
        .bind(input.visitor_id)
        .bind(ip_hash.as_deref())
        .bind(device_hash.as_deref())
        .fetch_one(&self.pool)
        .await?;

        if visitor_events >= MAX_EVENTS_PER_MINUTE || device_events >= MAX_EVENTS_PER_MINUTE {
            return Err(AppError::rate_limited(
                "Analytics event rate limit exceeded",
            ));
        }

        let supplied_modality_id = input.property_uuid("modalityId");
        let context = if let Some(modality_id) = supplied_modality_id {
            self.resolve_content_by_modality(modality_id).await?
        } else if let Some(path) = input.path() {
            self.resolve_content_by_path(path).await?
        } else {
            None
        };

        if supplied_modality_id.is_some() && context.is_none() {
            return Err(AppError::bad_request("Analytics modality not found"));
        }
        let structure_id = input
            .property_uuid("structureId")
            .or_else(|| context.as_ref().and_then(|value| value.structure_id));
        if let Some(id) = structure_id {
            let matches: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM anatomy_structures WHERE id=$1 AND modality_id=$2)",
            )
            .bind(id)
            .bind(context.as_ref().map(|value| value.modality_id))
            .fetch_one(&self.pool)
            .await?;
            if !matches {
                return Err(AppError::bad_request(
                    "Analytics label does not match the modality",
                ));
            }
        }

        if let (Some(expected), Some(supplied)) = (
            context.as_ref().map(|value| value.content_id),
            input.property_uuid("contentId"),
        ) && expected != supplied
        {
            return Err(AppError::bad_request(
                "Analytics content identifier does not match the modality",
            ));
        }
        if let (Some(expected), Some(supplied)) = (
            context.as_ref().map(|value| value.zone_id),
            input.property_uuid("zoneId"),
        ) && expected != supplied
        {
            return Err(AppError::bad_request(
                "Analytics zone identifier does not match the modality",
            ));
        }

        let country_code = country_code
            .map(str::trim)
            .filter(|value| {
                value.len() == 2 && value.chars().all(|char| char.is_ascii_alphabetic())
            })
            .map(|value| value.to_ascii_uppercase());
        let result = sqlx::query(
            r#"
            INSERT INTO analytics_events (
                id, account_id, event_name, visitor_id, occurred_at,
                original_referrer, session_referrer, path, content_id,
                modality_id, structure_id, zone_id, country_code, ip_hash,
                device_hash, properties
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12, $13, $14,
                $15, $16
            )
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(input.event_id)
        .bind(context.as_ref().map(|value| value.account_id))
        .bind(&input.event_name)
        .bind(input.visitor_id)
        .bind(input.occurred_at)
        .bind(input.original_referrer.as_deref())
        .bind(input.session_referrer.as_deref())
        .bind(input.path())
        .bind(
            context
                .as_ref()
                .map(|value| value.content_id)
                .or_else(|| input.property_uuid("contentId")),
        )
        .bind(
            context
                .as_ref()
                .map(|value| value.modality_id)
                .or(supplied_modality_id),
        )
        .bind(structure_id)
        .bind(
            context
                .as_ref()
                .map(|value| value.zone_id)
                .or_else(|| input.property_uuid("zoneId")),
        )
        .bind(country_code.as_deref())
        .bind(ip_hash.as_deref())
        .bind(device_hash.as_deref())
        .bind(&input.properties)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() == 1)
    }

    pub async fn overview(
        &self,
        account_id: Uuid,
        days: i32,
        content_id: Option<Uuid>,
    ) -> Result<AnalyticsOverviewReport, AppError> {
        let range_days = normalize_days(days);
        let start = Utc::now() - Duration::days(i64::from(range_days));

        let (page_views, unique_visitors, engaged_views) = sqlx::query_as::<_, (i64, i64, i64)>(
            r#"
            SELECT
                COUNT(*) FILTER (WHERE event_name = 'page_view')::bigint,
                COUNT(DISTINCT visitor_id)::bigint,
                COUNT(*) FILTER (WHERE event_name = 'content_engaged')::bigint
            FROM analytics_events
            WHERE account_id = $1
              AND occurred_at >= $2
              AND ($3::uuid IS NULL OR content_id = $3)
            "#,
        )
        .bind(account_id)
        .bind(start)
        .bind(content_id)
        .fetch_one(&self.pool)
        .await?;

        let (new_visitors, returning_visitors) = sqlx::query_as::<_, (i64, i64)>(
            r#"
            WITH visitor_activity AS (
                SELECT
                    visitor_id,
                    MIN(occurred_at) AS first_seen,
                    MAX(occurred_at) AS last_seen
                FROM analytics_events
                WHERE account_id = $1
                  AND ($3::uuid IS NULL OR content_id = $3)
                GROUP BY visitor_id
            )
            SELECT
                COUNT(*) FILTER (WHERE first_seen >= $2)::bigint,
                COUNT(*) FILTER (WHERE first_seen < $2 AND last_seen >= $2)::bigint
            FROM visitor_activity
            "#,
        )
        .bind(account_id)
        .bind(start)
        .bind(content_id)
        .fetch_one(&self.pool)
        .await?;

        let top_countries = sqlx::query_as::<_, AnalyticsDimensionValue>(
            r#"
            SELECT country_code AS label, COUNT(*)::bigint AS value
            FROM analytics_events
            WHERE account_id = $1 AND occurred_at >= $2
              AND country_code IS NOT NULL
              AND ($3::uuid IS NULL OR content_id = $3)
            GROUP BY country_code
            ORDER BY value DESC, label ASC
            LIMIT 10
            "#,
        )
        .bind(account_id)
        .bind(start)
        .bind(content_id)
        .fetch_all(&self.pool)
        .await?;

        let top_referrers = sqlx::query_as::<_, AnalyticsDimensionValue>(
            r#"
            SELECT original_referrer AS label, COUNT(*)::bigint AS value
            FROM analytics_events
            WHERE account_id = $1 AND occurred_at >= $2
              AND original_referrer IS NOT NULL
              AND ($3::uuid IS NULL OR content_id = $3)
            GROUP BY original_referrer
            ORDER BY value DESC, label ASC
            LIMIT 10
            "#,
        )
        .bind(account_id)
        .bind(start)
        .bind(content_id)
        .fetch_all(&self.pool)
        .await?;

        let daily = sqlx::query_as::<_, AnalyticsDailyValue>(
            r#"
            SELECT
                TO_CHAR(DATE_TRUNC('day', occurred_at), 'YYYY-MM-DD') AS date,
                COUNT(*) FILTER (WHERE event_name = 'page_view')::bigint AS views,
                COUNT(*) FILTER (WHERE event_name = 'content_engaged')::bigint AS engaged
            FROM analytics_events
            WHERE account_id = $1 AND occurred_at >= $2
              AND ($3::uuid IS NULL OR content_id = $3)
            GROUP BY DATE_TRUNC('day', occurred_at)
            ORDER BY DATE_TRUNC('day', occurred_at) ASC
            "#,
        )
        .bind(account_id)
        .bind(start)
        .bind(content_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(AnalyticsOverviewReport {
            range_days,
            page_views,
            unique_visitors,
            engaged_views,
            new_visitors,
            returning_visitors,
            top_countries,
            top_referrers,
            daily,
        })
    }

    pub async fn events(
        &self,
        account_id: Uuid,
        days: i32,
        event_name: Option<&str>,
        content_id: Option<Uuid>,
        page: i64,
    ) -> Result<AnalyticsEventsReport, AppError> {
        let range_days = normalize_days(days);
        let start = Utc::now() - Duration::days(i64::from(range_days));
        let normalized_page = page.max(1);
        let offset = (normalized_page - 1) * 25;
        let total = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)::bigint
            FROM analytics_events
            WHERE account_id = $1 AND occurred_at >= $2
              AND ($3::text IS NULL OR event_name = $3)
              AND ($4::uuid IS NULL OR content_id = $4)
            "#,
        )
        .bind(account_id)
        .bind(start)
        .bind(event_name)
        .bind(content_id)
        .fetch_one(&self.pool)
        .await?;
        let items = sqlx::query_as::<_, AnalyticsEventRow>(
            r#"
            SELECT id, event_name, visitor_id, occurred_at, path,
                   original_referrer, content_id, country_code
            FROM analytics_events
            WHERE account_id = $1 AND occurred_at >= $2
              AND ($3::text IS NULL OR event_name = $3)
              AND ($4::uuid IS NULL OR content_id = $4)
            ORDER BY occurred_at DESC
            LIMIT 25 OFFSET $5
            "#,
        )
        .bind(account_id)
        .bind(start)
        .bind(event_name)
        .bind(content_id)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        Ok(AnalyticsEventsReport { items, total })
    }

    fn hash_value(&self, value: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.hash_salt.as_bytes());
        hasher.update(b":");
        hasher.update(value.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    async fn resolve_content_by_modality(
        &self,
        modality_id: Uuid,
    ) -> Result<Option<ContentContext>, AppError> {
        Ok(sqlx::query_as::<_, ContentContext>(
            r#"
            SELECT zone.account_id, modality.family_id AS content_id,
                   modality.id AS modality_id, zone.id AS zone_id, NULL::uuid AS structure_id
            FROM anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE modality.id = $1
            LIMIT 1
            "#,
        )
        .bind(modality_id)
        .fetch_optional(&self.pool)
        .await?)
    }

    async fn resolve_content_by_path(
        &self,
        path: &str,
    ) -> Result<Option<ContentContext>, AppError> {
        let segments = path
            .split('?')
            .next()
            .unwrap_or(path)
            .trim_matches('/')
            .split('/')
            .collect::<Vec<_>>();
        if segments.first() == Some(&"structures") && matches!(segments.len(), 3 | 4) {
            return Ok(sqlx::query_as::<_, ContentContext>(r#"
                SELECT z.account_id, f.id AS content_id, m.id AS modality_id, z.id AS zone_id, s.id AS structure_id
                FROM anatomy_zone_modality_families f JOIN anatomy_zones z ON z.id=f.zone_id
                JOIN LATERAL (SELECT id FROM anatomy_zone_modalities WHERE family_id=f.id
                    ORDER BY (id=f.primary_modality_id) DESC NULLS LAST, (processing_status='ready') DESC, created_at, id LIMIT 1) m ON true
                LEFT JOIN anatomy_structures s ON s.modality_id=m.id AND s.slug=$3
                WHERE z.slug=$1 AND f.slug=$2 AND ($3::text IS NULL OR s.id IS NOT NULL)
                LIMIT 1
            "#).bind(segments[1]).bind(segments[2]).bind(segments.get(3).copied()).fetch_optional(&self.pool).await?);
        }
        if segments.len() != 2 {
            return Ok(None);
        }

        Ok(sqlx::query_as::<_, ContentContext>(
            r#"
            SELECT zone.account_id, modality.family_id AS content_id,
                   modality.id AS modality_id, zone.id AS zone_id, NULL::uuid AS structure_id
            FROM anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE zone.slug = $1 AND modality.slug = $2
            LIMIT 1
            "#,
        )
        .bind(segments[0])
        .bind(segments[1])
        .fetch_optional(&self.pool)
        .await?)
    }
}

fn normalize_days(days: i32) -> i32 {
    match days {
        7 | 30 | 90 => days,
        _ => 30,
    }
}

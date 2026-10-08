use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::infrastructure::error::AppError;

pub const EVENT_NAMES: [&str; 6] = [
    "page_view",
    "account_created",
    "structure_selected",
    "content_engaged",
    "subscription_activated",
    "subscription_canceled",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEventInput {
    pub event_id: Uuid,
    pub event_name: String,
    pub occurred_at: DateTime<Utc>,
    pub original_referrer: Option<String>,
    pub properties: Value,
    pub session_referrer: Option<String>,
    pub visitor_id: Uuid,
}

impl AnalyticsEventInput {
    pub fn validate(&self) -> Result<(), AppError> {
        if !EVENT_NAMES.contains(&self.event_name.as_str()) {
            return Err(AppError::bad_request("Unsupported analytics event name"));
        }
        if !self.properties.is_object() {
            return Err(AppError::bad_request(
                "Analytics properties must be an object",
            ));
        }
        if self.properties.to_string().len() > 16_384 {
            return Err(AppError::bad_request("Analytics properties are too large"));
        }
        for value in [
            self.original_referrer.as_ref(),
            self.session_referrer.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            if value.len() > 512 {
                return Err(AppError::bad_request("Analytics referrer is too long"));
            }
        }

        match self.event_name.as_str() {
            "page_view" => {
                let path = required_string(&self.properties, "path")?;
                if !path.starts_with('/') || path.starts_with("//") || path.len() > 512 {
                    return Err(AppError::bad_request("Analytics path is invalid"));
                }
            }
            "structure_selected" => {
                required_uuid(&self.properties, "modalityId")?;
                required_uuid(&self.properties, "structureId")?;
                required_uuid(&self.properties, "zoneId")?;
            }
            "content_engaged" => {
                required_uuid(&self.properties, "contentId")?;
                required_uuid(&self.properties, "modalityId")?;
                if self.properties.get("structureId").is_some() {
                    required_uuid(&self.properties, "structureId")?;
                }
                required_uuid(&self.properties, "zoneId")?;
                let duration = self
                    .properties
                    .get("durationSeconds")
                    .and_then(Value::as_f64)
                    .ok_or_else(|| AppError::bad_request("Engagement duration is invalid"))?;
                if !(0.0..=86_400.0).contains(&duration) {
                    return Err(AppError::bad_request("Engagement duration is invalid"));
                }
            }
            "account_created" => {
                required_string(&self.properties, "method")?;
            }
            "subscription_activated" | "subscription_canceled" => {
                required_string(&self.properties, "planId")?;
            }
            _ => {}
        }

        Ok(())
    }

    pub fn property_uuid(&self, key: &str) -> Option<Uuid> {
        self.properties
            .get(key)
            .and_then(Value::as_str)
            .and_then(|value| Uuid::parse_str(value).ok())
    }

    pub fn path(&self) -> Option<&str> {
        self.properties.get("path").and_then(Value::as_str)
    }
}

fn required_string<'a>(properties: &'a Value, key: &str) -> Result<&'a str, AppError> {
    properties
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::bad_request(format!("Analytics property {key} is required")))
}

fn required_uuid(properties: &Value, key: &str) -> Result<Uuid, AppError> {
    Uuid::parse_str(required_string(properties, key)?)
        .map_err(|_| AppError::bad_request(format!("Analytics property {key} is invalid")))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsOverviewReport {
    pub range_days: i32,
    pub page_views: i64,
    pub unique_visitors: i64,
    pub engaged_views: i64,
    pub new_visitors: i64,
    pub returning_visitors: i64,
    pub top_countries: Vec<AnalyticsDimensionValue>,
    pub top_referrers: Vec<AnalyticsDimensionValue>,
    pub daily: Vec<AnalyticsDailyValue>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsDimensionValue {
    pub label: String,
    pub value: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsDailyValue {
    pub date: String,
    pub views: i64,
    pub engaged: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEventRow {
    pub id: Uuid,
    pub event_name: String,
    pub visitor_id: Uuid,
    pub occurred_at: DateTime<Utc>,
    pub path: Option<String>,
    pub original_referrer: Option<String>,
    pub content_id: Option<Uuid>,
    pub country_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEventsReport {
    pub items: Vec<AnalyticsEventRow>,
    pub total: i64,
}

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    features::analytics::domain::models::{AnalyticsEventInput, EVENT_NAMES},
    infrastructure::{
        error::AppError,
        http::resolve_admin_account_id,
        state::AppState,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportQuery {
    #[serde(default = "default_days")]
    days: i32,
    content_id: Option<Uuid>,
    event: Option<String>,
    #[serde(default = "default_page")]
    page: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EventAcceptedResponse {
    accepted: bool,
}

fn default_days() -> i32 {
    30
}

fn default_page() -> i64 {
    1
}

pub fn public_routes() -> Router<AppState> {
    Router::new().route("/events", post(record_event))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/overview", get(get_overview))
        .route("/events", get(get_events))
}

async fn record_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<AnalyticsEventInput>,
) -> Result<impl IntoResponse, AppError> {
    let source_ip = forwarded_ip(&headers);
    let accepted = state
        .analytics_service
        .record_event(
            input,
            source_ip.as_deref(),
            header(&headers, "user-agent"),
            header(&headers, "accept-language"),
            header(&headers, "cf-ipcountry"),
        )
        .await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(EventAcceptedResponse { accepted }),
    ))
}

async fn get_overview(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Query(query): Query<ReportQuery>,
) -> Result<impl IntoResponse, AppError> {
    let account_id = resolve_admin_account_id(&state, &jar, &headers).await?;
    let report = state
        .analytics_service
        .overview(account_id, query.days, query.content_id)
        .await?;

    Ok((StatusCode::OK, Json(report)))
}

async fn get_events(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Query(query): Query<ReportQuery>,
) -> Result<impl IntoResponse, AppError> {
    let account_id = resolve_admin_account_id(&state, &jar, &headers).await?;
    let event_name = query
        .event
        .as_deref()
        .filter(|value| EVENT_NAMES.contains(value));
    let report = state
        .analytics_service
        .events(
            account_id,
            query.days,
            event_name,
            query.content_id,
            query.page,
        )
        .await?;

    Ok((StatusCode::OK, Json(report)))
}

fn header<'a>(headers: &'a HeaderMap, key: &str) -> Option<&'a str> {
    headers.get(key).and_then(|value| value.to_str().ok())
}

fn forwarded_ip(headers: &HeaderMap) -> Option<String> {
    header(headers, "x-forwarded-for")
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| header(headers, "x-real-ip").map(str::to_owned))
}

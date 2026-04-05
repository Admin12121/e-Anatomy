use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
};
use axum_extra::extract::cookie::CookieJar;
use uuid::Uuid;

use crate::features::playground::domain::models::{
    CreateZoneInput, CreateZoneModalityAssetInput, CreateZoneModalityInput, UpdateZoneInput,
    UpdateZoneModalityAssetInput, UpdateZoneModalityInput,
};
use crate::infrastructure::{
    error::AppError,
    http::{resolve_account_id, resolve_actor_context},
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/zones", get(list_zones).post(create_zone))
        .route("/zones/{zone_id}", get(get_zone).patch(update_zone))
        .route(
            "/zones/{zone_id}/modalities",
            get(list_zone_modalities).post(create_zone_modality),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}",
            axum::routing::patch(update_zone_modality),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/assets",
            get(list_zone_modality_assets).post(create_zone_modality_asset),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/assets/{asset_id}",
            axum::routing::patch(update_zone_modality_asset),
        )
}

async fn list_zones(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .playground_service
        .list_zones_for_account(resolve_account_id(&state, &jar, &headers).await?)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn get_zone(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let zone = state
        .playground_service
        .get_zone_detail(resolve_account_id(&state, &jar, &headers).await?, zone_id)
        .await?;

    Ok((StatusCode::OK, Json(zone)))
}

async fn create_zone(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateZoneInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_actor_context(&state, &jar, &headers).await?;
    let zone = state
        .playground_service
        .create_zone(actor.account_id, &actor.user_id, input)
        .await?;

    Ok((StatusCode::CREATED, Json(zone)))
}

async fn update_zone(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<UpdateZoneInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_actor_context(&state, &jar, &headers).await?;
    let zone = state
        .playground_service
        .update_zone(actor.account_id, &actor.user_id, zone_id, input)
        .await?;

    Ok((StatusCode::OK, Json(zone)))
}

async fn list_zone_modalities(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .playground_service
        .list_zone_modalities(resolve_account_id(&state, &jar, &headers).await?, zone_id)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn create_zone_modality(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateZoneModalityInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_actor_context(&state, &jar, &headers).await?;
    let modality = state
        .playground_service
        .create_zone_modality(actor.account_id, zone_id, &actor.user_id, input)
        .await?;

    Ok((StatusCode::CREATED, Json(modality)))
}

async fn update_zone_modality(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<UpdateZoneModalityInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_actor_context(&state, &jar, &headers).await?;
    let modality = state
        .playground_service
        .update_zone_modality(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::OK, Json(modality)))
}

async fn list_zone_modality_assets(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .playground_service
        .list_zone_modality_assets(
            resolve_account_id(&state, &jar, &headers).await?,
            zone_id,
            modality_id,
        )
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn create_zone_modality_asset(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateZoneModalityAssetInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_actor_context(&state, &jar, &headers).await?;
    let asset = state
        .playground_service
        .create_zone_modality_asset(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::CREATED, Json(asset)))
}

async fn update_zone_modality_asset(
    State(state): State<AppState>,
    Path((zone_id, modality_id, asset_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<UpdateZoneModalityAssetInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_actor_context(&state, &jar, &headers).await?;
    let asset = state
        .playground_service
        .update_zone_modality_asset(
            actor.account_id,
            zone_id,
            modality_id,
            asset_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::OK, Json(asset)))
}

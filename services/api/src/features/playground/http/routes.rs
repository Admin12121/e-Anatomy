use std::convert::Infallible;

use async_stream::stream;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{
        HeaderMap, StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE},
    },
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::get,
};
use axum_extra::extract::cookie::CookieJar;
use sha2::{Digest, Sha256};
use tokio::{fs, io::AsyncWriteExt};
use tracing::warn;
use uuid::Uuid;

use crate::features::playground::application::service::{
    CreateZoneModalityStudyUploadInput, DerivedAssetBinaryVariant, UploadedSourceFile,
};
use crate::features::playground::domain::models::{
    CreateViewerAnnotationInput, CreateViewerStructureGroupInput, CreateViewerStructureInput,
    CreateZoneInput, CreateZoneModalityAssetInput, CreateZoneModalityInput,
    DeleteZoneModalityAssetsInput, ReorderZoneModalityAssetsInput, UpdateViewerAnnotationInput,
    UpdateViewerStructureGroupInput, UpdateViewerStructureInput, UpdateZoneInput,
    UpdateZoneModalityAssetInput, UpdateZoneModalityFamilyInput, UpdateZoneModalityInput,
};
use crate::infrastructure::{
    error::AppError,
    http::{resolve_admin_account_id, resolve_admin_actor_context},
    state::AppState,
};

const MAX_STUDY_UPLOAD_BYTES: usize = 1024 * 1024 * 1024;
const MAX_STUDY_UPLOAD_FILE_COUNT: usize = 512;
const MAX_STUDY_UPLOAD_SINGLE_FILE_BYTES: i64 = MAX_STUDY_UPLOAD_BYTES as i64;
const MAX_UPLOAD_PATH_LENGTH: usize = 260;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/zones", get(list_zones).post(create_zone))
        .route("/zones/{zone_id}", get(get_zone).patch(update_zone))
        .route(
            "/zones/{zone_id}/modalities/stream",
            get(stream_zone_modalities),
        )
        .route(
            "/zones/{zone_id}/modalities",
            get(list_zone_modalities).post(create_zone_modality),
        )
        .route(
            "/zones/{zone_id}/modality-families/{family_id}",
            axum::routing::patch(update_zone_modality_family),
        )
        .route(
            "/zones/{zone_id}/modalities/intake",
            axum::routing::post(create_zone_modality_from_study_upload)
                .layer(DefaultBodyLimit::max(MAX_STUDY_UPLOAD_BYTES)),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}",
            axum::routing::patch(update_zone_modality).delete(delete_zone_modality),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/assets",
            get(list_zone_modality_assets).post(create_zone_modality_asset),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/assets/bulk-delete",
            axum::routing::post(delete_zone_modality_assets),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/assets/reorder",
            axum::routing::post(reorder_zone_modality_assets),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/assets/{asset_id}",
            axum::routing::patch(update_zone_modality_asset).delete(delete_zone_modality_asset),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer",
            get(get_zone_modality_viewer_manifest),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/mpr/slices/bulk-delete",
            axum::routing::post(delete_mpr_zone_modality_slices),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/atlases/rebuild",
            axum::routing::post(rebuild_zone_modality_atlases),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/structure-groups",
            axum::routing::post(create_viewer_structure_group),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/structure-groups/{group_id}",
            axum::routing::patch(update_viewer_structure_group)
                .delete(delete_viewer_structure_group),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/structures",
            axum::routing::post(create_viewer_structure),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/structures/{structure_id}",
            axum::routing::patch(update_viewer_structure).delete(delete_viewer_structure),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/annotations",
            axum::routing::post(create_viewer_annotation),
        )
        .route(
            "/zones/{zone_id}/modalities/{modality_id}/viewer/annotations/{annotation_id}",
            axum::routing::patch(update_viewer_annotation).delete(delete_viewer_annotation),
        )
        .route(
            "/derived-assets/{asset_id}/image",
            get(get_derived_asset_image),
        )
}

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/zones", get(list_public_zones))
        .route(
            "/zones/{zone_id}/modalities",
            get(list_public_zone_modalities),
        )
        .route(
            "/zones/{zone_slug}/modalities/{modality_slug}/viewer",
            get(get_public_zone_modality_viewer_manifest),
        )
        .route(
            "/derived-assets/{asset_id}/image",
            get(get_public_derived_asset_image),
        )
}

async fn list_zones(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let response = state
        .playground_service
        .list_zones_for_account(actor.account_id, &actor.user_id)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn list_public_zones(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let response = state.playground_service.list_public_zones().await?;

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
        .get_zone_detail(
            resolve_admin_account_id(&state, &jar, &headers).await?,
            zone_id,
        )
        .await?;

    Ok((StatusCode::OK, Json(zone)))
}

async fn create_zone(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateZoneInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
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
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
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
        .list_zone_modalities(
            resolve_admin_account_id(&state, &jar, &headers).await?,
            zone_id,
        )
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn list_public_zone_modalities(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .playground_service
        .list_public_zone_modalities(zone_id)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn get_public_zone_modality_viewer_manifest(
    State(state): State<AppState>,
    Path((zone_slug, modality_slug)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .playground_service
        .get_public_zone_modality_viewer_manifest(&zone_slug, &modality_slug)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn stream_zone_modalities(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>>, AppError> {
    let account_id = resolve_admin_account_id(&state, &jar, &headers).await?;
    let service = state.playground_service.clone();
    let initial_payload = service.list_zone_modalities(account_id, zone_id).await?;
    let mut receiver = service.subscribe_zone_modality_events();

    let event_stream = stream! {
        yield Ok(sse_json_event("modalities", &initial_payload));

        if !has_active_modality_ingest(&initial_payload) {
            yield Ok(sse_json_event("done", &serde_json::json!({ "active": false })));
            return;
        }

        loop {
            match receiver.recv().await {
                Ok(event) => {
                    if event.account_id != account_id || event.zone_id != zone_id {
                        continue;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    // Fall through and emit the current snapshot.
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    yield Ok(sse_json_event(
                        "error",
                        &serde_json::json!({
                            "message": "Modality update stream closed unexpectedly.",
                        }),
                    ));
                    break;
                }
            }

            match service.list_zone_modalities(account_id, zone_id).await {
                Ok(payload) => {
                    yield Ok(sse_json_event("modalities", &payload));

                    if !has_active_modality_ingest(&payload) {
                        yield Ok(sse_json_event("done", &serde_json::json!({ "active": false })));
                        break;
                    }
                }
                Err(error) => {
                    yield Ok(sse_json_event(
                        "error",
                        &serde_json::json!({
                            "message": error.to_string(),
                        }),
                    ));
                    break;
                }
            }
        }
    };

    Ok(Sse::new(event_stream).keep_alive(KeepAlive::default()))
}

async fn create_zone_modality(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateZoneModalityInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let modality = state
        .playground_service
        .create_zone_modality(actor.account_id, zone_id, &actor.user_id, input)
        .await?;

    Ok((StatusCode::CREATED, Json(modality)))
}

async fn create_zone_modality_from_study_upload(
    State(state): State<AppState>,
    Path(zone_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    state
        .playground_service
        .ensure_modality_ingest_capacity(actor.account_id)
        .await?;
    let input = parse_study_upload_multipart(&state, multipart).await?;
    let modality = state
        .playground_service
        .create_zone_modality_from_study_upload(actor.account_id, zone_id, &actor.user_id, input)
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
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
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

async fn update_zone_modality_family(
    State(state): State<AppState>,
    Path((zone_id, family_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<UpdateZoneModalityFamilyInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let family = state
        .playground_service
        .update_zone_modality_family(actor.account_id, zone_id, family_id, &actor.user_id, input)
        .await?;

    Ok((StatusCode::OK, Json(family)))
}

async fn delete_zone_modality(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    state
        .playground_service
        .delete_zone_modality(actor.account_id, zone_id, modality_id)
        .await?;

    Ok(StatusCode::NO_CONTENT)
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
            resolve_admin_account_id(&state, &jar, &headers).await?,
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
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
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
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
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

async fn delete_zone_modality_asset(
    State(state): State<AppState>,
    Path((zone_id, modality_id, asset_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    state
        .playground_service
        .delete_zone_modality_asset(actor.account_id, zone_id, modality_id, asset_id)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn delete_zone_modality_assets(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<DeleteZoneModalityAssetsInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let response = state
        .playground_service
        .delete_zone_modality_assets(actor.account_id, zone_id, modality_id, input)
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn reorder_zone_modality_assets(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<ReorderZoneModalityAssetsInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let response = state
        .playground_service
        .reorder_zone_modality_assets(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn delete_mpr_zone_modality_slices(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<DeleteZoneModalityAssetsInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let response = state
        .playground_service
        .delete_mpr_zone_modality_assets(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn get_zone_modality_viewer_manifest(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .playground_service
        .get_zone_modality_viewer_manifest(
            resolve_admin_account_id(&state, &jar, &headers).await?,
            zone_id,
            modality_id,
        )
        .await?;

    Ok((StatusCode::OK, Json(response)))
}

async fn rebuild_zone_modality_atlases(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let assets = state
        .playground_service
        .list_zone_modality_assets(actor.account_id, zone_id, modality_id)
        .await?;

    let _ = state
        .playground_service
        .rebuild_modality_atlases(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            &assets.items,
        )
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn create_viewer_structure_group(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateViewerStructureGroupInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let group = state
        .playground_service
        .create_viewer_structure_group(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::CREATED, Json(group)))
}

async fn update_viewer_structure_group(
    State(state): State<AppState>,
    Path((zone_id, modality_id, group_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<UpdateViewerStructureGroupInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let group = state
        .playground_service
        .update_viewer_structure_group(
            actor.account_id,
            zone_id,
            modality_id,
            group_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::OK, Json(group)))
}

async fn delete_viewer_structure_group(
    State(state): State<AppState>,
    Path((zone_id, modality_id, group_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    state
        .playground_service
        .delete_viewer_structure_group(actor.account_id, zone_id, modality_id, group_id)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn create_viewer_structure(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateViewerStructureInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let structure = state
        .playground_service
        .create_viewer_structure(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::CREATED, Json(structure)))
}

async fn update_viewer_structure(
    State(state): State<AppState>,
    Path((zone_id, modality_id, structure_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<UpdateViewerStructureInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let structure = state
        .playground_service
        .update_viewer_structure(
            actor.account_id,
            zone_id,
            modality_id,
            structure_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::OK, Json(structure)))
}

async fn delete_viewer_structure(
    State(state): State<AppState>,
    Path((zone_id, modality_id, structure_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    state
        .playground_service
        .delete_viewer_structure(actor.account_id, zone_id, modality_id, structure_id)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn create_viewer_annotation(
    State(state): State<AppState>,
    Path((zone_id, modality_id)): Path<(Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<CreateViewerAnnotationInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let annotation = state
        .playground_service
        .create_viewer_annotation(
            actor.account_id,
            zone_id,
            modality_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::CREATED, Json(annotation)))
}

async fn update_viewer_annotation(
    State(state): State<AppState>,
    Path((zone_id, modality_id, annotation_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<UpdateViewerAnnotationInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let annotation = state
        .playground_service
        .update_viewer_annotation(
            actor.account_id,
            zone_id,
            modality_id,
            annotation_id,
            &actor.user_id,
            input,
        )
        .await?;

    Ok((StatusCode::OK, Json(annotation)))
}

async fn delete_viewer_annotation(
    State(state): State<AppState>,
    Path((zone_id, modality_id, annotation_id)): Path<(Uuid, Uuid, Uuid)>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    state
        .playground_service
        .delete_viewer_annotation(actor.account_id, zone_id, modality_id, annotation_id)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn get_derived_asset_image(
    State(state): State<AppState>,
    Path(asset_id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    serve_derived_asset_binary(
        state,
        asset_id,
        jar,
        headers,
        DerivedAssetBinaryVariant::Image,
    )
    .await
}

async fn get_public_derived_asset_image(
    State(state): State<AppState>,
    Path(asset_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let (bytes, mime_type) = state
        .playground_service
        .get_public_derived_asset_binary(asset_id, DerivedAssetBinaryVariant::Image)
        .await?;

    Ok((
        [
            (CONTENT_TYPE, mime_type),
            (CACHE_CONTROL, "public, max-age=86400".to_string()),
        ],
        bytes,
    )
        .into_response())
}

async fn serve_derived_asset_binary(
    state: AppState,
    asset_id: Uuid,
    jar: CookieJar,
    headers: HeaderMap,
    variant: DerivedAssetBinaryVariant,
) -> Result<Response, AppError> {
    let account_id = resolve_admin_account_id(&state, &jar, &headers).await?;
    let (bytes, mime_type) = state
        .playground_service
        .get_derived_asset_binary(account_id, asset_id, variant)
        .await?;

    Ok((
        [
            (CONTENT_TYPE, mime_type),
            (CACHE_CONTROL, "private, max-age=86400".to_string()),
        ],
        bytes,
    )
        .into_response())
}

async fn parse_study_upload_multipart(
    state: &AppState,
    mut multipart: Multipart,
) -> Result<CreateZoneModalityStudyUploadInput, AppError> {
    let temp_root = std::path::PathBuf::from(&state.config.storage.root_dir)
        .join("playground")
        .join("tmp")
        .join(Uuid::new_v4().to_string());
    fs::create_dir_all(&temp_root).await.map_err(|error| {
        AppError::internal(format!("Unable to create temp upload directory: {error}"))
    })?;

    let mut name: Option<String> = None;
    let mut family_id: Option<String> = None;
    let mut modality_type: Option<String> = None;
    let mut weighting_code: Option<String> = None;
    let mut thumbnail_url: Option<String> = None;
    let mut notes: Option<String> = None;
    let mut source_kind: Option<String> = None;
    let mut source_label: Option<String> = None;
    let mut source_file_count: Option<i32> = None;
    let mut relative_paths: Vec<String> = Vec::new();
    let mut files: Vec<UploadedSourceFile> = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        let detail = format_error_chain(&error);
        warn!(detail = %detail, "playground modality intake multipart.next_field failed");
        AppError::bad_request(format!("Invalid upload body: {}", error.body_text()))
    })? {
        let field_name = field.name().unwrap_or_default().to_string();

        match field_name.as_str() {
            "familyId" => {
                family_id = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid modality family id: {error}"))
                })?);
            }
            "name" => {
                name = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid modality name: {error}"))
                })?);
            }
            "modalityType" => {
                modality_type = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid modality type: {error}"))
                })?);
            }
            "weightingCode" => {
                weighting_code = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid weighting code: {error}"))
                })?);
            }
            "thumbnailUrl" => {
                thumbnail_url = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid thumbnail field: {error}"))
                })?);
            }
            "notes" => {
                notes = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid notes field: {error}"))
                })?);
            }
            "sourceKind" => {
                source_kind = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid source kind: {error}"))
                })?);
            }
            "sourceLabel" => {
                source_label = Some(field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid source label: {error}"))
                })?);
            }
            "sourceFileCount" => {
                let value = field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid source file count: {error}"))
                })?;
                source_file_count = Some(value.trim().parse::<i32>().map_err(|error| {
                    AppError::bad_request(format!("Source file count is invalid: {error}"))
                })?);
            }
            "relativePathsJson" => {
                let payload = field.text().await.map_err(|error| {
                    AppError::bad_request(format!("Invalid relative-path manifest: {error}"))
                })?;
                relative_paths =
                    serde_json::from_str::<Vec<String>>(&payload).map_err(|error| {
                        AppError::bad_request(format!("Relative-path manifest is invalid: {error}"))
                    })?;
            }
            "file" => {
                let original_file_name = field
                    .file_name()
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("upload-{}", files.len()));

                if has_suspicious_upload_path(&original_file_name) {
                    return Err(AppError::bad_request(
                        "Suspicious upload file name detected.",
                    ));
                }

                let extension = std::path::Path::new(&original_file_name)
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| format!(".{value}"))
                    .unwrap_or_default();
                let temp_path = temp_root.join(format!("{}{}", Uuid::new_v4(), extension));
                let mut output = fs::File::create(&temp_path).await.map_err(|error| {
                    AppError::internal(format!("Unable to create temp upload file: {error}"))
                })?;
                let mut hasher = Sha256::new();
                let mut size_bytes = 0_i64;
                let content_type = field.content_type().map(str::to_string);
                let mut field = field;

                while let Some(chunk) = field.chunk().await.map_err(|error| {
                    let detail = format_error_chain(&error);
                    warn!(
                        detail = %detail,
                        field_name = %field_name,
                        original_file_name = %original_file_name,
                        bytes_written = size_bytes,
                        "playground modality intake file chunk read failed"
                    );
                    AppError::bad_request(format!(
                        "Unable to read uploaded file: {}",
                        error.body_text()
                    ))
                })? {
                    size_bytes += i64::try_from(chunk.len()).unwrap_or(i64::MAX);

                    if size_bytes > MAX_STUDY_UPLOAD_SINGLE_FILE_BYTES {
                        return Err(AppError::bad_request(
                            "One of the uploaded files exceeds the allowed size limit.",
                        ));
                    }

                    hasher.update(&chunk);
                    output.write_all(&chunk).await.map_err(|error| {
                        AppError::internal(format!("Unable to write uploaded file: {error}"))
                    })?;
                }

                output.flush().await.map_err(|error| {
                    AppError::internal(format!("Unable to flush uploaded file: {error}"))
                })?;

                files.push(UploadedSourceFile {
                    original_file_name,
                    relative_path: None,
                    content_type,
                    temp_path,
                    size_bytes,
                    checksum: format!("{:x}", hasher.finalize()),
                });
            }
            _ => {}
        }
    }

    if files.len() > MAX_STUDY_UPLOAD_FILE_COUNT {
        return Err(AppError::bad_request(
            "Too many files were uploaded for modality intake.",
        ));
    }

    if relative_paths.len() > files.len() {
        return Err(AppError::bad_request(
            "Relative-path manifest does not match uploaded files.",
        ));
    }

    for (index, relative_path) in relative_paths.into_iter().enumerate() {
        if let Some(file) = files.get_mut(index) {
            let normalized = relative_path.trim();

            if !normalized.is_empty() {
                if has_suspicious_upload_path(normalized) {
                    return Err(AppError::bad_request(
                        "Suspicious folder paths were detected in upload payload.",
                    ));
                }

                file.relative_path = Some(normalized.to_string());
            }
        }
    }

    Ok(CreateZoneModalityStudyUploadInput {
        family_id,
        name: name.unwrap_or_default(),
        modality_type: modality_type.unwrap_or_default(),
        weighting_code,
        thumbnail_url,
        notes,
        source_kind: source_kind.unwrap_or_default(),
        source_label,
        source_file_count,
        files,
    })
}

fn format_error_chain(error: &dyn std::error::Error) -> String {
    let mut chain = vec![error.to_string()];
    let mut source = error.source();

    while let Some(next) = source {
        chain.push(next.to_string());
        source = next.source();
    }

    chain.join(" | caused by: ")
}

fn has_suspicious_upload_path(value: &str) -> bool {
    let normalized = value.trim();

    if normalized.is_empty() || normalized.len() > MAX_UPLOAD_PATH_LENGTH {
        return true;
    }

    if normalized.starts_with('/')
        || normalized.starts_with('\\')
        || normalized.contains(':')
        || normalized.contains("../")
        || normalized.contains("..\\")
        || normalized
            .chars()
            .any(|character| character.is_control() && !character.is_whitespace())
    {
        return true;
    }

    normalized
        .split(['/', '\\'])
        .map(str::trim)
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
}

fn has_active_modality_ingest(
    response: &crate::features::playground::domain::models::ZoneModalityFamilyListResponse,
) -> bool {
    response.items.iter().any(|family| {
        family.variants.iter().any(|modality| {
            modality.processing_status == "processing" || modality.processing_status == "uploaded"
        })
    })
}

fn sse_json_event<T: serde::Serialize>(event_name: &str, payload: &T) -> Event {
    let data = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());

    Event::default().event(event_name).data(data)
}

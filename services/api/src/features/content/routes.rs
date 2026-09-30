use super::{
    models::{ContentDocument, ContentFamily, ContentLabel, PublicTopic, SaveDocumentInput},
    repository,
};
use crate::infrastructure::{error::AppError, http::resolve_admin_actor_context, state::AppState};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    family: ContentFamily,
    labels: Vec<ContentLabel>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Article {
    family: ContentFamily,
    labels: Vec<ContentLabel>,
    title: String,
    structure_id: Option<Uuid>,
    structure_slug: Option<String>,
    document: ContentDocument,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/families/{family_id}", get(workspace).patch(set_primary))
        .route(
            "/families/{family_id}/documents/{target}",
            get(document).put(save),
        )
}
pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/catalog", get(catalog))
        .route("/structures/{zone}/{slug}", get(article))
        .route("/structures/{zone}/{slug}/{label}", get(label_article))
}
async fn catalog(State(state): State<AppState>) -> Result<Json<Vec<PublicTopic>>, AppError> {
    Ok(Json(repository::public_topics(&state.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PrimaryInput {
    primary_modality_id: Uuid,
}

async fn set_primary(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<PrimaryInput>,
) -> Result<Json<ContentFamily>, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    require_editor(&state, actor.account_id, &actor.user_id).await?;
    let updated = sqlx::query(r#"
        UPDATE anatomy_zone_modality_families f SET primary_modality_id=$3, updated_by_user_id=$4, updated_at=NOW()
        FROM anatomy_zones z WHERE z.id=f.zone_id AND z.account_id=$1 AND f.id=$2
            AND EXISTS(SELECT 1 FROM anatomy_zone_modalities WHERE id=$3 AND family_id=f.id AND processing_status='ready')
    "#).bind(actor.account_id).bind(id).bind(input.primary_modality_id).bind(&actor.user_id).execute(&state.pool).await?;
    if updated.rows_affected() != 1 {
        return Err(AppError::bad_request(
            "Choose a ready variant belonging to this family",
        ));
    }
    Ok(Json(
        repository::family(&state.pool, Some(actor.account_id), Some(id), None, None).await?,
    ))
}

async fn require_editor(state: &AppState, account: Uuid, user: &str) -> Result<(), AppError> {
    let allowed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM account_memberships WHERE account_id=$1 AND user_id=$2 AND status='active' AND role_code IN ('owner','admin','platform_admin','content_admin','editor'))")
        .bind(account).bind(user).fetch_one(&state.pool).await?;
    if !allowed {
        return Err(AppError::unauthorized("Content editing is not permitted"));
    }
    Ok(())
}
async fn workspace(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Workspace>, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    let family =
        repository::family(&state.pool, Some(actor.account_id), Some(id), None, None).await?;
    let labels = repository::labels(&state.pool, &family, false).await?;
    Ok(Json(Workspace { family, labels }))
}
async fn document(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Path((id, target)): Path<(Uuid, String)>,
) -> Result<Json<ContentDocument>, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    repository::family(&state.pool, Some(actor.account_id), Some(id), None, None).await?;
    let structure = repository::check_target(&state.pool, id, &target).await?;
    Ok(Json(
        repository::document(&state.pool, id, structure, false).await?,
    ))
}
async fn save(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Path((id, target)): Path<(Uuid, String)>,
    Json(input): Json<SaveDocumentInput>,
) -> Result<Json<ContentDocument>, AppError> {
    let actor = resolve_admin_actor_context(&state, &jar, &headers).await?;
    require_editor(&state, actor.account_id, &actor.user_id).await?;
    repository::family(&state.pool, Some(actor.account_id), Some(id), None, None).await?;
    let structure = repository::check_target(&state.pool, id, &target).await?;
    Ok(Json(
        repository::save(
            &state.pool,
            actor.account_id,
            &actor.user_id,
            id,
            structure,
            input,
        )
        .await?,
    ))
}
async fn load_article(
    state: AppState,
    zone: String,
    slug: String,
    label: Option<String>,
) -> Result<Json<Article>, AppError> {
    let family = repository::family(&state.pool, None, None, Some(&zone), Some(&slug)).await?;
    let labels = repository::labels(&state.pool, &family, true).await?;
    let selected = match label.as_deref() {
        Some(slug) => Some(
            labels
                .iter()
                .find(|item| item.slug == slug)
                .ok_or_else(|| AppError::not_found("Published label not found"))?,
        ),
        None => None,
    };
    let title = selected
        .map(|label| label.title.clone())
        .unwrap_or_else(|| family.name.clone());
    let structure_id = selected.map(|label| label.id);
    let structure_slug = selected.map(|label| label.slug.clone());
    let document = repository::document(&state.pool, family.id, structure_id, true).await?;
    Ok(Json(Article {
        family,
        labels,
        title,
        structure_id,
        structure_slug,
        document,
    }))
}
async fn article(
    State(state): State<AppState>,
    Path((zone, slug)): Path<(String, String)>,
) -> Result<Json<Article>, AppError> {
    load_article(state, zone, slug, None).await
}
async fn label_article(
    State(state): State<AppState>,
    Path((zone, slug, label)): Path<(String, String, String)>,
) -> Result<Json<Article>, AppError> {
    load_article(state, zone, slug, Some(label)).await
}

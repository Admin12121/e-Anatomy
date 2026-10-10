use crate::{
    features::playground::application::service::library::{AttachLibraryInput, MAX_PACKAGE_BYTES},
    infrastructure::{
        error::AppError,
        http::{require_content_editor, resolve_admin_actor_context, temporary_zip_response},
        state::AppState,
    },
};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::extract::cookie::CookieJar;
use std::path::PathBuf;
use tokio::{fs, io::AsyncWriteExt};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(import))
        .route("/{id}", get(detail).delete(remove))
        .route("/{id}/png", get(download))
        .route("/{id}/edited", post(edited))
        .route(
            "/{id}/attach",
            post(attach).layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .layer(DefaultBodyLimit::max(MAX_PACKAGE_BYTES + 64 * 1024))
}

async fn actor(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<crate::infrastructure::http::RequestActorContext, AppError> {
    let actor = resolve_admin_actor_context(state, jar, headers).await?;
    require_content_editor(state, actor.account_id, &actor.user_id).await?;
    Ok(actor)
}

async fn list(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = actor(&state, &jar, &headers).await?;
    Ok(Json(
        state
            .playground_service
            .list_library(actor.account_id)
            .await?,
    ))
}
async fn detail(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let actor = actor(&state, &jar, &headers).await?;
    Ok(Json(
        state
            .playground_service
            .get_library(actor.account_id, id)
            .await?,
    ))
}

async fn remove(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<StatusCode, AppError> {
    let actor = actor(&state, &jar, &headers).await?;
    state
        .playground_service
        .delete_library(actor.account_id, id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn read_package(
    state: &AppState,
    mut multipart: Multipart,
) -> Result<(PathBuf, String, String), AppError> {
    let root = PathBuf::from(&state.config.storage.root_dir)
        .join("private-library")
        .join("intake");
    fs::create_dir_all(&root)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    let path = root.join(format!("{}.zip", Uuid::new_v4()));
    let result = async {
        let mut name = None;
        let mut kind = None;
        let mut has_file = false;
        let mut total = 0usize;
        let mut fields = 0;
        while let Some(mut field) = multipart
            .next_field()
            .await
            .map_err(|_| AppError::bad_request("Invalid upload"))?
        {
            fields += 1;
            if fields > 3 {
                return Err(AppError::bad_request("Upload contains too many fields"));
            }
            let field_name = field.name().unwrap_or_default().to_string();
            match field_name.as_str() {
                "file" if !has_file => {
                    if !field
                        .file_name()
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .ends_with(".zip")
                    {
                        return Err(AppError::bad_request("Upload one ZIP package"));
                    }
                    has_file = true;
                    let mut output = fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&path)
                        .await
                        .map_err(|e| AppError::internal(e.to_string()))?;
                    while let Some(chunk) = field
                        .chunk()
                        .await
                        .map_err(|_| AppError::bad_request("Upload interrupted"))?
                    {
                        total = total.saturating_add(chunk.len());
                        if total > MAX_PACKAGE_BYTES {
                            return Err(AppError::bad_request("ZIP exceeds 1024 MB"));
                        }
                        output
                            .write_all(&chunk)
                            .await
                            .map_err(|e| AppError::internal(e.to_string()))?;
                    }
                    output
                        .flush()
                        .await
                        .map_err(|e| AppError::internal(e.to_string()))?;
                    if total == 0 {
                        return Err(AppError::bad_request("ZIP is empty"));
                    }
                }
                "name" | "modalityType" => {
                    let mut bytes = Vec::new();
                    while let Some(chunk) = field
                        .chunk()
                        .await
                        .map_err(|_| AppError::bad_request("Invalid upload field"))?
                    {
                        if bytes.len() + chunk.len() > 1024 {
                            return Err(AppError::bad_request("Upload field is too long"));
                        }
                        bytes.extend_from_slice(&chunk);
                    }
                    let value = String::from_utf8(bytes)
                        .map_err(|_| AppError::bad_request("Invalid upload field"))?;
                    let target = if field_name == "name" {
                        &mut name
                    } else {
                        &mut kind
                    };
                    if target.replace(value).is_some() {
                        return Err(AppError::bad_request("Duplicate upload field"));
                    }
                }
                _ => return Err(AppError::bad_request("Unexpected upload field")),
            }
        }
        if !has_file {
            return Err(AppError::bad_request("Upload one ZIP package"));
        }
        Ok((
            path.clone(),
            name.unwrap_or_default(),
            kind.unwrap_or_default(),
        ))
    }
    .await;
    if result.is_err() {
        let _ = fs::remove_file(&path).await;
    }
    result
}

async fn import(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    let actor = actor(&state, &jar, &headers).await?;
    let (source, name, kind) = read_package(&state, multipart).await?;
    match state
        .playground_service
        .import_library(
            actor.account_id,
            &actor.user_id,
            &name,
            &kind,
            source.clone(),
        )
        .await
    {
        Ok(study) => Ok((StatusCode::ACCEPTED, Json(study))),
        Err(error) => {
            let _ = fs::remove_file(source).await;
            Err(error)
        }
    }
}
async fn edited(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    let actor = actor(&state, &jar, &headers).await?;
    state
        .playground_service
        .get_library(actor.account_id, id)
        .await?;
    let (source, _, _) = read_package(&state, multipart).await?;
    match state
        .playground_service
        .reupload_library(actor.account_id, id, source.clone())
        .await
    {
        Ok(study) => Ok((StatusCode::ACCEPTED, Json(study))),
        Err(error) => {
            let _ = fs::remove_file(source).await;
            Err(error)
        }
    }
}
async fn attach(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(input): Json<AttachLibraryInput>,
) -> Result<impl IntoResponse, AppError> {
    let actor = actor(&state, &jar, &headers).await?;
    Ok((
        StatusCode::CREATED,
        Json(
            state
                .playground_service
                .attach_library(actor.account_id, &actor.user_id, id, input)
                .await?,
        ),
    ))
}

async fn download(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let actor = actor(&state, &jar, &headers).await?;
    let path = state
        .playground_service
        .export_library(actor.account_id, id)
        .await?;
    temporary_zip_response(path, &format!("{id}-png.zip")).await
}

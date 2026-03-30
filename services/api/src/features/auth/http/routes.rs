use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use time::Duration as CookieDuration;

use crate::features::auth::{
    domain::models::LoginCommand,
    http::dto::{LoginRequest, SessionResponse},
};
use crate::infrastructure::{error::AppError, state::AppState};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/session", get(session))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let outcome = state
        .auth_service
        .login(LoginCommand {
            email: payload.email,
            password: payload.password,
        })
        .await?;

    let cookie = Cookie::build((outcome.cookie.name, outcome.cookie.value))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(outcome.cookie.secure)
        .max_age(CookieDuration::hours(outcome.cookie.ttl_hours))
        .build();

    Ok((
        StatusCode::OK,
        jar.add(cookie),
        Json(SessionResponse::from(outcome.session)),
    ))
}

async fn session(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<impl IntoResponse, AppError> {
    let session = state
        .auth_service
        .get_session_from_token(
            jar.get(&state.config.auth.cookie_name)
                .map(|cookie| cookie.value()),
        )
        .await?;

    Ok((StatusCode::OK, Json(SessionResponse::from(session))))
}

async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<impl IntoResponse, AppError> {
    let raw_token = jar
        .get(&state.config.auth.cookie_name)
        .map(|cookie| cookie.value().to_string());

    state.auth_service.logout(raw_token.as_deref()).await?;

    let removal_cookie = Cookie::build((state.config.auth.cookie_name.clone(), String::new()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.auth.cookie_secure)
        .max_age(CookieDuration::seconds(0))
        .build();

    Ok((StatusCode::OK, jar.remove(removal_cookie)))
}

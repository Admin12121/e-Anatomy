use anyhow::Result;

use crate::infrastructure::state::AppState;

pub async fn seed_default_admin(state: &AppState) -> Result<()> {
    state.auth_service.ensure_bootstrap_admin().await
}

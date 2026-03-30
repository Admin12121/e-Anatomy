use serde::Serialize;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ModuleListItem {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub status: String,
    pub latest_version_no: Option<i32>,
    pub latest_version_state: Option<String>,
    pub current_release_published_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleListResponse {
    pub total: usize,
    pub items: Vec<ModuleListItem>,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneAnchor {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneListItem {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub body_view: String,
    pub anchor: ZoneAnchor,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneListResponse {
    pub total: usize,
    pub items: Vec<ZoneListItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneDetail {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub body_view: String,
    pub anchor: ZoneAnchor,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateZoneInput {
    pub name: String,
    pub description: Option<String>,
    pub body_view: Option<String>,
    pub anchor: ZoneAnchor,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateZoneInput {
    pub name: String,
    pub description: Option<String>,
    pub body_view: Option<String>,
    pub anchor: Option<ZoneAnchor>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneModality {
    pub id: String,
    pub name: String,
    pub modality_type: String,
    pub cover_image_url: Option<String>,
    pub source_kind: String,
    pub source_label: Option<String>,
    pub source_file_count: i32,
    pub processing_status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneModalityListResponse {
    pub total: usize,
    pub items: Vec<ZoneModality>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateZoneModalityInput {
    pub name: String,
    pub modality_type: String,
    pub cover_image_url: Option<String>,
    pub source_kind: Option<String>,
    pub source_label: Option<String>,
    pub source_file_count: Option<i32>,
    pub processing_status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateZoneModalityInput {
    pub name: String,
    pub modality_type: String,
    pub cover_image_url: Option<String>,
    pub source_kind: Option<String>,
    pub source_label: Option<String>,
    pub source_file_count: Option<i32>,
    pub processing_status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneModalityAsset {
    pub id: String,
    pub label: String,
    pub asset_kind: String,
    pub weighting_code: Option<String>,
    pub image_url: String,
    pub thumbnail_url: Option<String>,
    pub sort_order: i32,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneModalityAssetListResponse {
    pub total: usize,
    pub items: Vec<ZoneModalityAsset>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateZoneModalityAssetInput {
    pub label: String,
    pub asset_kind: Option<String>,
    pub weighting_code: Option<String>,
    pub image_url: String,
    pub thumbnail_url: Option<String>,
    pub sort_order: Option<i32>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateZoneModalityAssetInput {
    pub label: String,
    pub asset_kind: Option<String>,
    pub weighting_code: Option<String>,
    pub image_url: String,
    pub thumbnail_url: Option<String>,
    pub sort_order: Option<i32>,
    pub notes: Option<String>,
}

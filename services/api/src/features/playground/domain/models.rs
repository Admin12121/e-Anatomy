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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalityIngestJob {
    pub id: String,
    pub modality_id: String,
    pub source_kind: String,
    pub source_label: Option<String>,
    pub source_file_count: i32,
    pub status: String,
    pub summary_json: serde_json::Value,
    pub error_message: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalitySourceAsset {
    pub id: String,
    pub modality_id: String,
    pub ingest_job_id: String,
    pub asset_role: String,
    pub original_file_name: String,
    pub relative_path: Option<String>,
    pub storage_backend: String,
    pub storage_key: String,
    pub checksum: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub created_at: String,
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
    pub ingest_job_id: Option<String>,
    pub storage_backend: Option<String>,
    pub storage_key: Option<String>,
    pub checksum: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub source_relative_path: Option<String>,
    pub series_uid: Option<String>,
    pub series_label: Option<String>,
    pub instance_uid: Option<String>,
    pub slice_index: Option<i32>,
    pub orientation_code: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerStructureGroup {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub color_hex: String,
    pub icon_name: Option<String>,
    pub sort_order: i32,
    pub is_default_visible: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateViewerStructureGroupInput {
    pub title: String,
    pub description: Option<String>,
    pub color_hex: Option<String>,
    pub icon_name: Option<String>,
    pub sort_order: Option<i32>,
    pub is_default_visible: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateViewerStructureGroupInput {
    pub title: String,
    pub description: Option<String>,
    pub color_hex: Option<String>,
    pub icon_name: Option<String>,
    pub sort_order: Option<i32>,
    pub is_default_visible: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerStructure {
    pub id: String,
    pub group_id: Option<String>,
    pub slug: String,
    pub title: String,
    pub latin_name: Option<String>,
    pub short_description: Option<String>,
    pub long_description: Option<String>,
    pub synonyms: Vec<String>,
    pub learning_points: Vec<String>,
    pub access_level: String,
    pub is_pinned_default: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateViewerStructureInput {
    pub group_id: Option<String>,
    pub title: String,
    pub latin_name: Option<String>,
    pub short_description: Option<String>,
    pub long_description: Option<String>,
    pub synonyms: Option<Vec<String>>,
    pub learning_points: Option<Vec<String>>,
    pub access_level: Option<String>,
    pub is_pinned_default: Option<bool>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateViewerStructureInput {
    pub group_id: Option<String>,
    pub title: String,
    pub latin_name: Option<String>,
    pub short_description: Option<String>,
    pub long_description: Option<String>,
    pub synonyms: Option<Vec<String>>,
    pub learning_points: Option<Vec<String>>,
    pub access_level: Option<String>,
    pub is_pinned_default: Option<bool>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerAnnotationPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerAnnotation {
    pub id: String,
    pub asset_id: String,
    pub structure_id: String,
    pub title_override: Option<String>,
    pub color_hex: Option<String>,
    pub leader_color_hex: Option<String>,
    pub overlay_color_hex: Option<String>,
    pub overlay_opacity: f64,
    pub anchor_x: f64,
    pub anchor_y: f64,
    pub label_x: f64,
    pub label_y: f64,
    pub leader_bend_x: Option<f64>,
    pub leader_bend_y: Option<f64>,
    pub polygon_points: Vec<ViewerAnnotationPoint>,
    pub note: Option<String>,
    pub is_visible_default: bool,
    pub is_targeted_default: bool,
    pub is_practice_hidden: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateViewerAnnotationInput {
    pub asset_id: String,
    pub structure_id: String,
    pub title_override: Option<String>,
    pub color_hex: Option<String>,
    pub leader_color_hex: Option<String>,
    pub overlay_color_hex: Option<String>,
    pub overlay_opacity: Option<f64>,
    pub anchor_x: f64,
    pub anchor_y: f64,
    pub label_x: f64,
    pub label_y: f64,
    pub leader_bend_x: Option<f64>,
    pub leader_bend_y: Option<f64>,
    pub polygon_points: Option<Vec<ViewerAnnotationPoint>>,
    pub note: Option<String>,
    pub is_visible_default: Option<bool>,
    pub is_targeted_default: Option<bool>,
    pub is_practice_hidden: Option<bool>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateViewerAnnotationInput {
    pub asset_id: String,
    pub structure_id: String,
    pub title_override: Option<String>,
    pub color_hex: Option<String>,
    pub leader_color_hex: Option<String>,
    pub overlay_color_hex: Option<String>,
    pub overlay_opacity: Option<f64>,
    pub anchor_x: f64,
    pub anchor_y: f64,
    pub label_x: f64,
    pub label_y: f64,
    pub leader_bend_x: Option<f64>,
    pub leader_bend_y: Option<f64>,
    pub polygon_points: Option<Vec<ViewerAnnotationPoint>>,
    pub note: Option<String>,
    pub is_visible_default: Option<bool>,
    pub is_targeted_default: Option<bool>,
    pub is_practice_hidden: Option<bool>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneModalityViewerManifest {
    pub zone: ZoneDetail,
    pub modality: ZoneModality,
    pub ingest_job: Option<ModalityIngestJob>,
    pub source_assets: Vec<ModalitySourceAsset>,
    pub assets: Vec<ZoneModalityAsset>,
    pub structure_groups: Vec<ViewerStructureGroup>,
    pub structures: Vec<ViewerStructure>,
    pub annotations: Vec<ViewerAnnotation>,
}

use std::{
    collections::BTreeMap,
    ffi::OsStr,
    io::Cursor,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::Context;
use dicom::{
    object::open_file,
    pixeldata::PixelDecoder,
};
use image::{DynamicImage, imageops::FilterType};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tokio::{
    fs,
    sync::broadcast,
};
use tracing::error;
use uuid::Uuid;

use crate::features::playground::{
    domain::models::{
        CreateViewerAnnotationInput, CreateViewerStructureGroupInput, CreateViewerStructureInput,
        CreateZoneInput, CreateZoneModalityAssetInput, CreateZoneModalityInput,
        ModalitySourceAsset,
        UpdateViewerAnnotationInput, UpdateViewerStructureGroupInput, UpdateViewerStructureInput,
        UpdateZoneInput, UpdateZoneModalityAssetInput, UpdateZoneModalityInput,
        ViewerAnnotationPoint, ViewerStructure, ViewerStructureGroup, ZoneDetail,
        ZoneListResponse, ZoneModality, ZoneModalityAsset, ZoneModalityAssetListResponse,
        ZoneModalityListResponse, ZoneModalityViewerManifest,
    },
    infrastructure::repository::PlaygroundRepository,
};
use crate::infrastructure::error::AppError;

#[derive(Clone)]
pub struct PlaygroundService {
    pool: PgPool,
    repo: PlaygroundRepository,
    storage_root: PathBuf,
    events: Arc<PlaygroundEventHub>,
}

#[derive(Debug)]
struct PlaygroundEventHub {
    zone_modality_events: broadcast::Sender<ZoneModalityListChangedEvent>,
}

impl PlaygroundEventHub {
    fn new() -> Self {
        let (zone_modality_events, _) = broadcast::channel(128);

        Self {
            zone_modality_events,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ZoneModalityListChangedEvent {
    pub account_id: Uuid,
    pub zone_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct UploadedSourceFile {
    pub original_file_name: String,
    pub relative_path: Option<String>,
    pub content_type: Option<String>,
    pub temp_path: PathBuf,
    pub size_bytes: i64,
    pub checksum: String,
}

#[derive(Debug, Clone)]
pub struct CreateZoneModalityStudyUploadInput {
    pub name: String,
    pub modality_type: String,
    pub notes: Option<String>,
    pub source_kind: String,
    pub source_label: Option<String>,
    pub source_file_count: Option<i32>,
    pub files: Vec<UploadedSourceFile>,
}

#[derive(Debug, Clone)]
struct PreparedStudyFile {
    source_relative_path: Option<String>,
    file_path: PathBuf,
    original_file_name: String,
}

#[derive(Debug, Clone)]
struct DerivedSliceCandidate {
    source_relative_path: Option<String>,
    storage_key: String,
    checksum: String,
    size_bytes: i64,
    width: i32,
    height: i32,
    series_uid: Option<String>,
    series_label: Option<String>,
    instance_uid: Option<String>,
    slice_index: i32,
    weighting_code: Option<String>,
    orientation_code: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum DerivedAssetBinaryVariant {
    Image,
    Thumbnail,
}

const MAX_ACTIVE_MODALITY_INGESTS: i64 = 2;

impl PlaygroundService {
    pub fn new(pool: PgPool, storage_root: impl Into<String>) -> Self {
        Self {
            pool,
            repo: PlaygroundRepository::default(),
            storage_root: PathBuf::from(storage_root.into()),
            events: Arc::new(PlaygroundEventHub::new()),
        }
    }

    pub fn subscribe_zone_modality_events(&self) -> broadcast::Receiver<ZoneModalityListChangedEvent> {
        self.events.zone_modality_events.subscribe()
    }

    pub async fn list_zones_for_account(
        &self,
        account_id: Uuid,
    ) -> Result<ZoneListResponse, AppError> {
        let items = self
            .repo
            .list_zones_for_account(&self.pool, account_id)
            .await?;

        Ok(ZoneListResponse {
            total: items.len(),
            items,
        })
    }

    pub async fn get_zone_detail(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<ZoneDetail, AppError> {
        self.repo
            .get_zone_detail(&self.pool, account_id, zone_id)
            .await?
            .ok_or_else(|| AppError::not_found("Zone was not found"))
    }

    pub async fn create_zone(
        &self,
        account_id: Uuid,
        user_id: &str,
        input: CreateZoneInput,
    ) -> Result<ZoneDetail, AppError> {
        let name = normalize_required_name(&input.name, "Zone name is required")?;
        let description = normalize_optional_text(input.description);
        let body_view = normalize_body_view(input.body_view)?;
        let anchor = validate_anchor(input.anchor)?;
        let slug = self.allocate_zone_slug(account_id, &name).await?;

        let zone = self
            .repo
            .create_zone(
                &self.pool,
                account_id,
                user_id,
                &slug,
                &name,
                description.as_deref(),
                &body_view,
                anchor.x,
                anchor.y,
                anchor.z,
            )
            .await?;

        Ok(zone)
    }

    pub async fn update_zone(
        &self,
        account_id: Uuid,
        user_id: &str,
        zone_id: Uuid,
        input: UpdateZoneInput,
    ) -> Result<ZoneDetail, AppError> {
        let name = normalize_required_name(&input.name, "Zone name is required")?;
        let description = normalize_optional_text(input.description);
        let body_view = normalize_body_view(input.body_view)?;
        let anchor = match input.anchor {
            Some(anchor) => Some(validate_anchor(anchor)?),
            None => None,
        };

        self.repo
            .update_zone(
                &self.pool,
                account_id,
                zone_id,
                user_id,
                &name,
                description.as_deref(),
                &body_view,
                anchor.as_ref().map(|value| value.x),
                anchor.as_ref().map(|value| value.y),
                anchor.as_ref().map(|value| value.z),
            )
            .await?
            .ok_or_else(|| AppError::not_found("Zone was not found"))
    }

    pub async fn list_zone_modalities(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<ZoneModalityListResponse, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let items = self
            .repo
            .list_zone_modalities(&self.pool, account_id, zone_id)
            .await?;

        Ok(ZoneModalityListResponse {
            total: items.len(),
            items,
        })
    }

    pub fn notify_zone_modality_list_changed(&self, account_id: Uuid, zone_id: Uuid) {
        let _ = self
            .events
            .zone_modality_events
            .send(ZoneModalityListChangedEvent {
                account_id,
                zone_id,
            });
    }

    pub async fn create_zone_modality(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        user_id: &str,
        input: CreateZoneModalityInput,
    ) -> Result<ZoneModality, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let name = normalize_required_name(&input.name, "Modality name is required")?;
        let modality_type = normalize_modality_type(&input.modality_type)?;
        let cover_image_url = normalize_optional_text(input.cover_image_url);
        let source_kind = normalize_source_kind(input.source_kind)?;
        let source_label = normalize_optional_text(input.source_label);
        let source_file_count = normalize_source_file_count(input.source_file_count)?;
        let processing_status = normalize_processing_status(input.processing_status)?;
        let notes = normalize_optional_text(input.notes);

        let modality = self
            .repo
            .create_zone_modality(
                &self.pool,
                zone_id,
                user_id,
                &name,
                &modality_type,
                cover_image_url.as_deref(),
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                &processing_status,
                notes.as_deref(),
            )
            .await?;

        self.notify_zone_modality_list_changed(account_id, zone_id);

        Ok(modality)
    }

    pub async fn create_zone_modality_from_study_upload(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        user_id: &str,
        input: CreateZoneModalityStudyUploadInput,
    ) -> Result<ZoneModality, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;
        self.ensure_modality_ingest_capacity(account_id).await?;

        if input.files.is_empty() {
            return Err(AppError::bad_request(
                "Upload one ZIP package or one or more DICOM files.",
            ));
        }

        let name = normalize_required_name(&input.name, "Modality name is required")?;
        let modality_type = normalize_modality_type(&input.modality_type)?;
        let source_kind = normalize_source_kind(Some(input.source_kind.clone()))?;

        if source_kind == "manual" {
            return Err(AppError::bad_request(
                "Use a ZIP package or DICOM files for study intake.",
            ));
        }

        let source_label = normalize_optional_text(input.source_label);
        let notes = normalize_optional_text(input.notes);
        let source_file_count = normalize_source_file_count(
            input.source_file_count.or(Some(input.files.len() as i32)),
        )?;

        let modality = self
            .repo
            .create_zone_modality(
                &self.pool,
                zone_id,
                user_id,
                &name,
                &modality_type,
                None,
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                "processing",
                notes.as_deref(),
            )
            .await?;

        let modality_id = Uuid::parse_str(&modality.id)
            .map_err(|_| AppError::internal("Created modality id is invalid"))?;
        let ingest_job = self
            .repo
            .create_modality_ingest_job(
                &self.pool,
                modality_id,
                user_id,
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                "queued",
                &json!({
                    "phase": "queued",
                    "sourceFileCount": source_file_count,
                }),
            )
            .await?;
        let ingest_job_id = Uuid::parse_str(&ingest_job.id)
            .map_err(|_| AppError::internal("Created ingest job id is invalid"))?;

        self.repo
            .attach_ingest_job_to_modality(
                &self.pool,
                modality_id,
                ingest_job_id,
                user_id,
                "processing",
                None,
            )
            .await?;

        self.notify_zone_modality_list_changed(account_id, zone_id);

        let background_service = self.clone();
        let background_account_id = account_id;
        let background_zone_id = zone_id;
        let background_user_id = user_id.to_string();
        let background_source_kind = source_kind.clone();
        let background_files = input.files;
        tokio::spawn(async move {
            if let Err(pipeline_error) = background_service
                .run_study_ingest_pipeline(
                    background_account_id,
                    background_zone_id,
                    modality_id,
                    ingest_job_id,
                    background_user_id,
                    background_source_kind,
                    background_files,
                )
                .await
            {
                error!(
                    %modality_id,
                    %ingest_job_id,
                    ?pipeline_error,
                    "modality ingest pipeline failed"
                );
            }
        });

        Ok(modality)
    }

    pub async fn ensure_modality_ingest_capacity(
        &self,
        account_id: Uuid,
    ) -> Result<(), AppError> {
        let active_ingests = self
            .repo
            .count_active_modality_ingest_jobs(&self.pool, account_id)
            .await?;

        if active_ingests >= MAX_ACTIVE_MODALITY_INGESTS {
            return Err(AppError::bad_request(
                "Only two source studies can be processed at a time. Wait for one active intake to finish.",
            ));
        }

        Ok(())
    }

    async fn run_study_ingest_pipeline(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        ingest_job_id: Uuid,
        user_id: String,
        source_kind: String,
        files: Vec<UploadedSourceFile>,
    ) -> Result<(), AppError> {
        let uploaded_file_count = i32::try_from(files.len()).unwrap_or(i32::MAX);

        let pipeline_result = async {
            self.repo
                .update_modality_ingest_job(
                    &self.pool,
                    ingest_job_id,
                    &user_id,
                    "uploaded",
                    &json!({
                        "phase": "uploaded",
                        "uploadedFileCount": uploaded_file_count,
                    }),
                    None,
                    false,
                )
                .await?;

            let (_source_assets, study_files) = self
                .stage_study_files(modality_id, ingest_job_id, &user_id, &source_kind, files)
                .await?;

            self.repo
                .update_modality_ingest_job(
                    &self.pool,
                    ingest_job_id,
                    &user_id,
                    "validating",
                    &json!({
                        "phase": "validating",
                        "stagedFileCount": study_files.len(),
                    }),
                    None,
                    false,
                )
                .await?;

            let derived_slices = self
                .derive_study_slices(ingest_job_id, &study_files)
                .await?;

            if derived_slices.is_empty() {
                return Err(AppError::bad_request(
                    "The uploaded study did not produce any viewable DICOM slices.",
                ));
            }

            self.repo
                .update_modality_ingest_job(
                    &self.pool,
                    ingest_job_id,
                    &user_id,
                    "deriving",
                    &json!({
                        "phase": "deriving",
                        "derivedSliceCount": derived_slices.len(),
                    }),
                    None,
                    false,
                )
                .await?;

            let mut persisted_assets = Vec::with_capacity(derived_slices.len());

            for (sort_order, derived_slice) in derived_slices.iter().enumerate() {
                let asset_id = Uuid::new_v4();
                let image_url = format!("/api/v1/playground/derived-assets/{asset_id}/image");
                let thumbnail_url =
                    format!("/api/v1/playground/derived-assets/{asset_id}/thumbnail");
                let label = derived_slice.series_label.clone().unwrap_or_else(|| {
                    format!("Slice {}", derived_slice.slice_index + 1)
                });

                let asset = self
                    .repo
                    .create_zone_modality_derived_asset(
                        &self.pool,
                        asset_id,
                        modality_id,
                        ingest_job_id,
                        &user_id,
                        &label,
                        "slice",
                        derived_slice.weighting_code.as_deref(),
                        &image_url,
                        Some(&thumbnail_url),
                        sort_order as i32,
                        None,
                        "local_disk",
                        &derived_slice.storage_key,
                        &derived_slice.checksum,
                        "image/png",
                        derived_slice.size_bytes,
                        derived_slice.width,
                        derived_slice.height,
                        derived_slice.source_relative_path.as_deref(),
                        derived_slice.series_uid.as_deref(),
                        derived_slice.series_label.as_deref(),
                        derived_slice.instance_uid.as_deref(),
                        derived_slice.slice_index,
                        derived_slice.orientation_code.as_deref(),
                    )
                    .await?;

                persisted_assets.push(asset);
            }

            let manifest_json = build_viewer_manifest_json(&persisted_assets);

            self.repo
                .upsert_modality_viewer_manifest(
                    &self.pool,
                    modality_id,
                    ingest_job_id,
                    "draft-1",
                    &manifest_json,
                )
                .await?;

            let cover_image_url = persisted_assets
                .first()
                .and_then(|asset| asset.thumbnail_url.clone().or_else(|| Some(asset.image_url.clone())));

            self.repo
                .attach_ingest_job_to_modality(
                    &self.pool,
                    modality_id,
                    ingest_job_id,
                    &user_id,
                    "ready",
                    cover_image_url.as_deref(),
                )
                .await?;

            self.notify_zone_modality_list_changed(account_id, zone_id);

            self.repo
                .update_modality_ingest_job(
                    &self.pool,
                    ingest_job_id,
                    &user_id,
                    "ready_for_edit",
                    &json!({
                        "phase": "ready_for_edit",
                        "seriesCount": count_distinct_series(&persisted_assets),
                        "derivedSliceCount": persisted_assets.len(),
                    }),
                    None,
                    true,
                )
                .await?;

            Ok(())
        }
        .await;

        match pipeline_result {
            Ok(()) => Ok(()),
            Err(error) => {
                let _ = self
                    .repo
                    .attach_ingest_job_to_modality(
                        &self.pool,
                        modality_id,
                        ingest_job_id,
                        &user_id,
                        "failed",
                        None,
                    )
                    .await;
                self.notify_zone_modality_list_changed(account_id, zone_id);
                let _ = self
                    .repo
                    .update_modality_ingest_job(
                        &self.pool,
                        ingest_job_id,
                        &user_id,
                        "failed",
                        &json!({
                            "phase": "failed",
                        }),
                        Some(&error.to_string()),
                        true,
                    )
                    .await;

                Err(error)
            }
        }
    }

    pub async fn update_zone_modality(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: UpdateZoneModalityInput,
    ) -> Result<ZoneModality, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let name = normalize_required_name(&input.name, "Modality name is required")?;
        let modality_type = normalize_modality_type(&input.modality_type)?;
        let cover_image_url = normalize_optional_text(input.cover_image_url);
        let source_kind = normalize_source_kind(input.source_kind)?;
        let source_label = normalize_optional_text(input.source_label);
        let source_file_count = normalize_source_file_count(input.source_file_count)?;
        let processing_status = normalize_processing_status(input.processing_status)?;
        let notes = normalize_optional_text(input.notes);

        let modality = self
            .repo
            .update_zone_modality(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                user_id,
                &name,
                &modality_type,
                cover_image_url.as_deref(),
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                &processing_status,
                notes.as_deref(),
            )
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;

        self.notify_zone_modality_list_changed(account_id, zone_id);

        Ok(modality)
    }

    pub async fn delete_zone_modality(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<(), AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let ingest_job_ids = self
            .repo
            .list_modality_ingest_job_ids(&self.pool, account_id, zone_id, modality_id)
            .await?;

        let deleted = self
            .repo
            .delete_zone_modality(&self.pool, account_id, zone_id, modality_id)
            .await?;

        if !deleted {
            return Err(AppError::not_found("Modality was not found"));
        }

        for ingest_job_id in ingest_job_ids {
            self.cleanup_ingest_storage(ingest_job_id).await;
        }

        self.notify_zone_modality_list_changed(account_id, zone_id);

        Ok(())
    }

    pub async fn list_zone_modality_assets(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<ZoneModalityAssetListResponse, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let items = self
            .repo
            .list_zone_modality_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;

        Ok(ZoneModalityAssetListResponse {
            total: items.len(),
            items,
        })
    }

    pub async fn create_zone_modality_asset(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: CreateZoneModalityAssetInput,
    ) -> Result<ZoneModalityAsset, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let label = normalize_required_name(&input.label, "Asset label is required")?;
        let asset_kind = normalize_asset_kind(input.asset_kind)?;
        let weighting_code = normalize_weighting_code(input.weighting_code)?;
        let image_url = normalize_required_image_url(&input.image_url)?;
        let thumbnail_url = normalize_optional_text(input.thumbnail_url);
        let sort_order = normalize_sort_order(input.sort_order)?;
        let notes = normalize_optional_text(input.notes);

        self.repo
            .create_zone_modality_asset(
                &self.pool,
                modality_id,
                user_id,
                &label,
                &asset_kind,
                weighting_code.as_deref(),
                &image_url,
                thumbnail_url.as_deref(),
                sort_order,
                notes.as_deref(),
            )
            .await
            .map_err(Into::into)
    }

    pub async fn update_zone_modality_asset(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_id: Uuid,
        user_id: &str,
        input: UpdateZoneModalityAssetInput,
    ) -> Result<ZoneModalityAsset, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let label = normalize_required_name(&input.label, "Asset label is required")?;
        let asset_kind = normalize_asset_kind(input.asset_kind)?;
        let weighting_code = normalize_weighting_code(input.weighting_code)?;
        let image_url = normalize_required_image_url(&input.image_url)?;
        let thumbnail_url = normalize_optional_text(input.thumbnail_url);
        let sort_order = normalize_sort_order(input.sort_order)?;
        let notes = normalize_optional_text(input.notes);

        self.repo
            .update_zone_modality_asset(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                asset_id,
                user_id,
                &label,
                &asset_kind,
                weighting_code.as_deref(),
                &image_url,
                thumbnail_url.as_deref(),
                sort_order,
                notes.as_deref(),
            )
            .await?
            .ok_or_else(|| AppError::not_found("Modality asset was not found"))
    }

    pub async fn get_zone_modality_viewer_manifest(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<ZoneModalityViewerManifest, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let zone = self.get_zone_detail(account_id, zone_id).await?;
        let modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;
        let ingest_job = self
            .repo
            .get_latest_modality_ingest_job(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let source_assets = self
            .repo
            .list_modality_source_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let assets = self
            .repo
            .list_zone_modality_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let structure_groups = self
            .repo
            .list_viewer_structure_groups(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let structures = self
            .repo
            .list_viewer_structures(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let annotations = self
            .repo
            .list_viewer_annotations(&self.pool, account_id, zone_id, modality_id)
            .await?;

        Ok(ZoneModalityViewerManifest {
            zone,
            modality,
            ingest_job,
            source_assets,
            assets,
            structure_groups,
            structures,
            annotations,
        })
    }

    pub async fn create_viewer_structure_group(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: CreateViewerStructureGroupInput,
    ) -> Result<ViewerStructureGroup, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let title =
            normalize_required_name(&input.title, "Structure group title is required")?;
        let description = normalize_optional_text(input.description);
        let color_hex = normalize_color_hex(input.color_hex, "#38bdf8");
        let icon_name = normalize_optional_text(input.icon_name);
        let sort_order = normalize_sort_order(input.sort_order)?;
        let is_default_visible = input.is_default_visible.unwrap_or(true);
        let slug = self
            .allocate_structure_group_slug(account_id, zone_id, modality_id, &title)
            .await?;

        self.repo
            .create_viewer_structure_group(
                &self.pool,
                modality_id,
                user_id,
                &slug,
                &title,
                description.as_deref(),
                &color_hex,
                icon_name.as_deref(),
                sort_order,
                is_default_visible,
            )
            .await
            .map_err(Into::into)
    }

    pub async fn update_viewer_structure_group(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        group_id: Uuid,
        user_id: &str,
        input: UpdateViewerStructureGroupInput,
    ) -> Result<ViewerStructureGroup, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let title =
            normalize_required_name(&input.title, "Structure group title is required")?;
        let description = normalize_optional_text(input.description);
        let color_hex = normalize_color_hex(input.color_hex, "#38bdf8");
        let icon_name = normalize_optional_text(input.icon_name);
        let sort_order = normalize_sort_order(input.sort_order)?;
        let is_default_visible = input.is_default_visible.unwrap_or(true);

        self.repo
            .update_viewer_structure_group(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                group_id,
                user_id,
                &title,
                description.as_deref(),
                &color_hex,
                icon_name.as_deref(),
                sort_order,
                is_default_visible,
            )
            .await?
            .ok_or_else(|| AppError::not_found("Structure group was not found"))
    }

    pub async fn create_viewer_structure(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: CreateViewerStructureInput,
    ) -> Result<ViewerStructure, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let group_id = self
            .normalize_optional_group_id(account_id, zone_id, modality_id, input.group_id)
            .await?;
        let title = normalize_required_name(&input.title, "Structure title is required")?;
        let latin_name = normalize_optional_text(input.latin_name);
        let short_description = normalize_optional_text(input.short_description);
        let long_description = normalize_optional_text(input.long_description);
        let synonyms = normalize_string_list(input.synonyms);
        let learning_points = normalize_string_list(input.learning_points);
        let access_level = normalize_access_level(input.access_level)?;
        let is_pinned_default = input.is_pinned_default.unwrap_or(true);
        let sort_order = normalize_sort_order(input.sort_order)?;
        let slug = self
            .allocate_structure_slug(account_id, zone_id, modality_id, &title)
            .await?;

        self.repo
            .create_viewer_structure(
                &self.pool,
                modality_id,
                user_id,
                group_id,
                &slug,
                &title,
                latin_name.as_deref(),
                short_description.as_deref(),
                long_description.as_deref(),
                &synonyms,
                &learning_points,
                &access_level,
                is_pinned_default,
                sort_order,
            )
            .await
            .map_err(Into::into)
    }

    pub async fn update_viewer_structure(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        structure_id: Uuid,
        user_id: &str,
        input: UpdateViewerStructureInput,
    ) -> Result<ViewerStructure, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let group_id = self
            .normalize_optional_group_id(account_id, zone_id, modality_id, input.group_id)
            .await?;
        let title = normalize_required_name(&input.title, "Structure title is required")?;
        let latin_name = normalize_optional_text(input.latin_name);
        let short_description = normalize_optional_text(input.short_description);
        let long_description = normalize_optional_text(input.long_description);
        let synonyms = normalize_string_list(input.synonyms);
        let learning_points = normalize_string_list(input.learning_points);
        let access_level = normalize_access_level(input.access_level)?;
        let is_pinned_default = input.is_pinned_default.unwrap_or(true);
        let sort_order = normalize_sort_order(input.sort_order)?;

        self.repo
            .update_viewer_structure(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                structure_id,
                user_id,
                group_id,
                &title,
                latin_name.as_deref(),
                short_description.as_deref(),
                long_description.as_deref(),
                &synonyms,
                &learning_points,
                &access_level,
                is_pinned_default,
                sort_order,
            )
            .await?
            .ok_or_else(|| AppError::not_found("Structure was not found"))
    }

    pub async fn create_viewer_annotation(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: CreateViewerAnnotationInput,
    ) -> Result<crate::features::playground::domain::models::ViewerAnnotation, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let asset_id =
            self.normalize_asset_id(account_id, zone_id, modality_id, &input.asset_id).await?;
        let structure_id = self
            .normalize_structure_id(account_id, zone_id, modality_id, &input.structure_id)
            .await?;
        let title_override = normalize_optional_text(input.title_override);
        let color_hex = normalize_optional_text(input.color_hex);
        let leader_color_hex = normalize_optional_text(input.leader_color_hex);
        let overlay_color_hex = normalize_optional_text(input.overlay_color_hex);
        let overlay_opacity = normalize_overlay_opacity(input.overlay_opacity)?;
        let anchor_x = validate_normalized_coordinate(input.anchor_x, "Anchor X is invalid")?;
        let anchor_y = validate_normalized_coordinate(input.anchor_y, "Anchor Y is invalid")?;
        let label_x = validate_normalized_coordinate(input.label_x, "Label X is invalid")?;
        let label_y = validate_normalized_coordinate(input.label_y, "Label Y is invalid")?;
        let leader_bend_x =
            normalize_optional_coordinate(input.leader_bend_x, "Leader bend X is invalid")?;
        let leader_bend_y =
            normalize_optional_coordinate(input.leader_bend_y, "Leader bend Y is invalid")?;
        let polygon_points = normalize_polygon_points(input.polygon_points)?;
        let note = normalize_optional_text(input.note);
        let is_visible_default = input.is_visible_default.unwrap_or(true);
        let is_targeted_default = input.is_targeted_default.unwrap_or(false);
        let is_practice_hidden = input.is_practice_hidden.unwrap_or(false);
        let sort_order = normalize_sort_order(input.sort_order)?;

        self.repo
            .create_viewer_annotation(
                &self.pool,
                asset_id,
                structure_id,
                user_id,
                title_override.as_deref(),
                color_hex.as_deref(),
                leader_color_hex.as_deref(),
                overlay_color_hex.as_deref(),
                overlay_opacity,
                anchor_x,
                anchor_y,
                label_x,
                label_y,
                leader_bend_x,
                leader_bend_y,
                &polygon_points,
                note.as_deref(),
                is_visible_default,
                is_targeted_default,
                is_practice_hidden,
                sort_order,
            )
            .await
            .map_err(Into::into)
    }

    pub async fn update_viewer_annotation(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        annotation_id: Uuid,
        user_id: &str,
        input: UpdateViewerAnnotationInput,
    ) -> Result<crate::features::playground::domain::models::ViewerAnnotation, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let asset_id =
            self.normalize_asset_id(account_id, zone_id, modality_id, &input.asset_id).await?;
        let structure_id = self
            .normalize_structure_id(account_id, zone_id, modality_id, &input.structure_id)
            .await?;
        let title_override = normalize_optional_text(input.title_override);
        let color_hex = normalize_optional_text(input.color_hex);
        let leader_color_hex = normalize_optional_text(input.leader_color_hex);
        let overlay_color_hex = normalize_optional_text(input.overlay_color_hex);
        let overlay_opacity = normalize_overlay_opacity(input.overlay_opacity)?;
        let anchor_x = validate_normalized_coordinate(input.anchor_x, "Anchor X is invalid")?;
        let anchor_y = validate_normalized_coordinate(input.anchor_y, "Anchor Y is invalid")?;
        let label_x = validate_normalized_coordinate(input.label_x, "Label X is invalid")?;
        let label_y = validate_normalized_coordinate(input.label_y, "Label Y is invalid")?;
        let leader_bend_x =
            normalize_optional_coordinate(input.leader_bend_x, "Leader bend X is invalid")?;
        let leader_bend_y =
            normalize_optional_coordinate(input.leader_bend_y, "Leader bend Y is invalid")?;
        let polygon_points = normalize_polygon_points(input.polygon_points)?;
        let note = normalize_optional_text(input.note);
        let is_visible_default = input.is_visible_default.unwrap_or(true);
        let is_targeted_default = input.is_targeted_default.unwrap_or(false);
        let is_practice_hidden = input.is_practice_hidden.unwrap_or(false);
        let sort_order = normalize_sort_order(input.sort_order)?;

        self.repo
            .update_viewer_annotation(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                annotation_id,
                asset_id,
                structure_id,
                user_id,
                title_override.as_deref(),
                color_hex.as_deref(),
                leader_color_hex.as_deref(),
                overlay_color_hex.as_deref(),
                overlay_opacity,
                anchor_x,
                anchor_y,
                label_x,
                label_y,
                leader_bend_x,
                leader_bend_y,
                &polygon_points,
                note.as_deref(),
                is_visible_default,
                is_targeted_default,
                is_practice_hidden,
                sort_order,
            )
            .await?
            .ok_or_else(|| AppError::not_found("Annotation was not found"))
    }

    async fn normalize_optional_group_id(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        group_id: Option<String>,
    ) -> Result<Option<Uuid>, AppError> {
        let Some(group_id) = normalize_optional_text(group_id) else {
            return Ok(None);
        };

        let parsed_group_id = Uuid::parse_str(&group_id)
            .map_err(|_| AppError::bad_request("Structure group id is invalid"))?;
        let exists = self
            .repo
            .structure_group_exists_for_modality(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                parsed_group_id,
            )
            .await?;

        if exists {
            Ok(Some(parsed_group_id))
        } else {
            Err(AppError::not_found("Structure group was not found"))
        }
    }

    async fn normalize_asset_id(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_id: &str,
    ) -> Result<Uuid, AppError> {
        let parsed_asset_id =
            Uuid::parse_str(asset_id).map_err(|_| AppError::bad_request("Asset id is invalid"))?;
        let exists = self
            .repo
            .asset_exists_for_modality(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                parsed_asset_id,
            )
            .await?;

        if exists {
            Ok(parsed_asset_id)
        } else {
            Err(AppError::not_found("Modality asset was not found"))
        }
    }

    async fn normalize_structure_id(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        structure_id: &str,
    ) -> Result<Uuid, AppError> {
        let parsed_structure_id = Uuid::parse_str(structure_id)
            .map_err(|_| AppError::bad_request("Structure id is invalid"))?;
        let exists = self
            .repo
            .structure_exists_for_modality(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                parsed_structure_id,
            )
            .await?;

        if exists {
            Ok(parsed_structure_id)
        } else {
            Err(AppError::not_found("Structure was not found"))
        }
    }

    pub async fn get_derived_asset_binary(
        &self,
        account_id: Uuid,
        asset_id: Uuid,
        variant: DerivedAssetBinaryVariant,
    ) -> Result<(Vec<u8>, String), AppError> {
        let asset = self
            .repo
            .get_zone_modality_asset_storage(&self.pool, account_id, asset_id)
            .await?
            .ok_or_else(|| AppError::not_found("Derived asset was not found"))?;

        let storage_key = asset
            .storage_key
            .as_deref()
            .ok_or_else(|| AppError::not_found("Derived asset file is unavailable"))?;
        let mime_type = asset
            .mime_type
            .clone()
            .unwrap_or_else(|| "image/png".to_string());

        let requested_key = match variant {
            DerivedAssetBinaryVariant::Image => storage_key.to_string(),
            DerivedAssetBinaryVariant::Thumbnail => thumbnail_storage_key(storage_key),
        };
        let requested_path = self.storage_root.join(&requested_key);
        let fallback_path = self.storage_root.join(storage_key);
        let binary_path = if matches!(variant, DerivedAssetBinaryVariant::Thumbnail)
            && !requested_path.exists()
        {
            fallback_path
        } else {
            requested_path
        };
        let bytes = fs::read(binary_path)
            .await
            .map_err(|_| AppError::not_found("Derived asset file is unavailable"))?;

        Ok((bytes, mime_type))
    }

    async fn stage_study_files(
        &self,
        modality_id: Uuid,
        ingest_job_id: Uuid,
        _user_id: &str,
        source_kind: &str,
        files: Vec<UploadedSourceFile>,
    ) -> Result<(Vec<ModalitySourceAsset>, Vec<PreparedStudyFile>), AppError> {
        let source_root = self
            .storage_root
            .join("playground")
            .join("source")
            .join(ingest_job_id.to_string());
        fs::create_dir_all(&source_root)
            .await
            .map_err(|error| AppError::internal(format!("Unable to create source directory: {error}")))?;

        if source_kind == "zip" {
            if files.len() != 1 {
                return Err(AppError::bad_request(
                    "ZIP packages must be uploaded by themselves.",
                ));
            }

            let upload = files
                .into_iter()
                .next()
                .ok_or_else(|| AppError::bad_request("Upload a ZIP package."))?;

            if !is_zip_filename(&upload.original_file_name) {
                return Err(AppError::bad_request("Upload a valid ZIP package."));
            }

            let stored_name = sanitize_file_name(&upload.original_file_name);
            let final_path = source_root.join(&stored_name);
            self.persist_temp_file(&upload.temp_path, &final_path).await?;

            let storage_key = storage_key_from_absolute(&self.storage_root, &final_path)?;
            let source_asset = self
                .repo
                .create_modality_source_asset(
                    &self.pool,
                    modality_id,
                    ingest_job_id,
                    "source_bundle",
                    &upload.original_file_name,
                    None,
                    "local_disk",
                    &storage_key,
                    &upload.checksum,
                    upload
                        .content_type
                        .as_deref()
                        .unwrap_or("application/zip"),
                    upload.size_bytes,
                )
                .await?;

            let extracted_root = self
                .storage_root
                .join("playground")
                .join("expanded")
                .join(ingest_job_id.to_string());
            fs::create_dir_all(&extracted_root)
                .await
                .map_err(|error| AppError::internal(format!("Unable to create extraction directory: {error}")))?;
            let study_files = extract_zip_study(&final_path, &extracted_root)
                .await
                .map_err(AppError::from)?;

            return Ok((vec![source_asset], study_files));
        }

        let mut source_assets = Vec::with_capacity(files.len());
        let mut prepared_files = Vec::with_capacity(files.len());

        for upload in files {
            let relative_path = upload
                .relative_path
                .clone()
                .unwrap_or_else(|| upload.original_file_name.clone());
            let safe_relative_path = sanitize_relative_path(&relative_path);
            let final_path = source_root.join(&safe_relative_path);
            if let Some(parent) = final_path.parent() {
                fs::create_dir_all(parent).await.map_err(|error| {
                    AppError::internal(format!("Unable to create source directory: {error}"))
                })?;
            }

            self.persist_temp_file(&upload.temp_path, &final_path).await?;

            let storage_key = storage_key_from_absolute(&self.storage_root, &final_path)?;
            let source_asset = self
                .repo
                .create_modality_source_asset(
                    &self.pool,
                    modality_id,
                    ingest_job_id,
                    "source_file",
                    &upload.original_file_name,
                    Some(&safe_relative_path),
                    "local_disk",
                    &storage_key,
                    &upload.checksum,
                    upload
                        .content_type
                        .as_deref()
                        .unwrap_or("application/dicom"),
                    upload.size_bytes,
                )
                .await?;

            source_assets.push(source_asset);
            prepared_files.push(PreparedStudyFile {
                source_relative_path: Some(safe_relative_path),
                file_path: final_path,
                original_file_name: upload.original_file_name,
            });
        }

        Ok((source_assets, prepared_files))
    }

    async fn persist_temp_file(&self, from: &Path, to: &Path) -> Result<(), AppError> {
        match fs::rename(from, to).await {
            Ok(()) => Ok(()),
            Err(_) => {
                let bytes = fs::read(from).await.map_err(|error| {
                    AppError::internal(format!("Unable to read uploaded temp file: {error}"))
                })?;
                fs::write(to, bytes).await.map_err(|error| {
                    AppError::internal(format!("Unable to persist uploaded temp file: {error}"))
                })?;
                let _ = fs::remove_file(from).await;
                Ok(())
            }
        }
    }

    async fn cleanup_ingest_storage(&self, ingest_job_id: Uuid) {
        for directory in ["source", "expanded", "derived"] {
            let path = self
                .storage_root
                .join("playground")
                .join(directory)
                .join(ingest_job_id.to_string());

            match fs::remove_dir_all(&path).await {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    error!(
                        %ingest_job_id,
                        directory,
                        %error,
                        "unable to remove modality ingest storage"
                    );
                }
            }
        }
    }

    async fn derive_study_slices(
        &self,
        ingest_job_id: Uuid,
        study_files: &[PreparedStudyFile],
    ) -> Result<Vec<DerivedSliceCandidate>, AppError> {
        let derived_root = self
            .storage_root
            .join("playground")
            .join("derived")
            .join(ingest_job_id.to_string());
        fs::create_dir_all(&derived_root)
            .await
            .map_err(|error| AppError::internal(format!("Unable to create derived directory: {error}")))?;

        let mut candidates = Vec::new();

        for (fallback_index, study_file) in study_files.iter().enumerate() {
            match derive_slice_candidate(&self.storage_root, &derived_root, study_file, fallback_index)
                .await
            {
                Ok(Some(candidate)) => candidates.push(candidate),
                Ok(None) => {}
                Err(_error) => {}
            }
        }

        candidates.sort_by(|left, right| {
            let left_series = left.series_uid.as_deref().unwrap_or("");
            let right_series = right.series_uid.as_deref().unwrap_or("");

            left_series
                .cmp(right_series)
                .then_with(|| left.slice_index.cmp(&right.slice_index))
                .then_with(|| left.storage_key.cmp(&right.storage_key))
        });

        Ok(candidates)
    }

    async fn allocate_zone_slug(&self, account_id: Uuid, name: &str) -> Result<String, AppError> {
        let base = slugify(name, "zone");
        let mut candidate = base.clone();
        let mut suffix = 1;

        while self
            .repo
            .slug_exists(&self.pool, account_id, &candidate)
            .await?
        {
            candidate = format!("{base}-{suffix}");
            suffix += 1;
        }

        Ok(candidate)
    }

    async fn allocate_structure_group_slug(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        title: &str,
    ) -> Result<String, AppError> {
        let base = slugify(title, "group");
        let mut candidate = base.clone();
        let mut suffix = 1;

        while self
            .repo
            .structure_group_slug_exists(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                &candidate,
            )
            .await?
        {
            candidate = format!("{base}-{suffix}");
            suffix += 1;
        }

        Ok(candidate)
    }

    async fn allocate_structure_slug(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        title: &str,
    ) -> Result<String, AppError> {
        let base = slugify(title, "structure");
        let mut candidate = base.clone();
        let mut suffix = 1;

        while self
            .repo
            .structure_slug_exists(&self.pool, account_id, zone_id, modality_id, &candidate)
            .await?
        {
            candidate = format!("{base}-{suffix}");
            suffix += 1;
        }

        Ok(candidate)
    }

    async fn ensure_zone_exists(&self, account_id: Uuid, zone_id: Uuid) -> Result<(), AppError> {
        let exists = self
            .repo
            .zone_exists_for_account(&self.pool, account_id, zone_id)
            .await?;

        if exists {
            Ok(())
        } else {
            Err(AppError::not_found("Zone was not found"))
        }
    }

    async fn ensure_modality_exists(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<(), AppError> {
        let exists = self
            .repo
            .modality_exists_for_account(&self.pool, account_id, zone_id, modality_id)
            .await?;

        if exists {
            Ok(())
        } else {
            Err(AppError::not_found("Modality was not found"))
        }
    }
}

fn normalize_required_name(value: &str, message: &str) -> Result<String, AppError> {
    let normalized = value.trim();

    if normalized.is_empty() {
        return Err(AppError::bad_request(message));
    }

    Ok(normalized.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|current| {
        let normalized = current.trim();

        if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        }
    })
}

fn normalize_color_hex(value: Option<String>, fallback: &str) -> String {
    normalize_optional_text(value).unwrap_or_else(|| fallback.to_string())
}

fn normalize_string_list(value: Option<Vec<String>>) -> Vec<String> {
    let mut items = Vec::new();

    for item in value.unwrap_or_default() {
        let normalized = item.trim();

        if normalized.is_empty() {
            continue;
        }

        if items.iter().any(|existing| existing == normalized) {
            continue;
        }

        items.push(normalized.to_string());
    }

    items
}

fn normalize_required_image_url(value: &str) -> Result<String, AppError> {
    let normalized = value.trim();

    if normalized.is_empty() {
        return Err(AppError::bad_request("Image URL is required"));
    }

    Ok(normalized.to_string())
}

fn normalize_body_view(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "anterior".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "anterior" | "posterior" => Ok(normalized),
        _ => Err(AppError::bad_request(
            "Body view must be anterior or posterior",
        )),
    }
}

fn validate_anchor(
    anchor: crate::features::playground::domain::models::ZoneAnchor,
) -> Result<crate::features::playground::domain::models::ZoneAnchor, AppError> {
    if !anchor.x.is_finite() || !anchor.y.is_finite() || !anchor.z.is_finite() {
        return Err(AppError::bad_request("Zone anchor is invalid"));
    }

    Ok(anchor)
}

fn normalize_modality_type(value: &str) -> Result<String, AppError> {
    let normalized = value.trim().to_ascii_lowercase();

    match normalized.as_str() {
        "mri" | "ct" | "mra" | "mrv" | "angiography" | "cbct" | "illustration" | "photography"
        | "endoscopy" | "other" => Ok(normalized),
        _ => Err(AppError::bad_request("Modality type is invalid")),
    }
}

fn normalize_source_kind(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "manual".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "manual" | "zip" | "dicom_files" => Ok(normalized),
        _ => Err(AppError::bad_request("Source kind is invalid")),
    }
}

fn normalize_processing_status(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "draft".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "draft" | "uploaded" | "processing" | "ready" | "failed" => Ok(normalized),
        _ => Err(AppError::bad_request("Processing status is invalid")),
    }
}

fn normalize_source_file_count(value: Option<i32>) -> Result<i32, AppError> {
    let normalized = value.unwrap_or(0);

    if normalized < 0 {
        return Err(AppError::bad_request("Source file count is invalid"));
    }

    Ok(normalized)
}

fn normalize_asset_kind(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "slice".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "slice" | "cover" | "overview" | "reference" | "derived_slice" => Ok(normalized),
        _ => Err(AppError::bad_request("Asset kind is invalid")),
    }
}

fn normalize_weighting_code(value: Option<String>) -> Result<Option<String>, AppError> {
    let normalized = normalize_optional_text(value).map(|current| current.to_ascii_lowercase());

    match normalized.as_deref() {
        None => Ok(None),
        Some("t1" | "t1_gado" | "t2" | "t2_star" | "flair" | "adc" | "dwi" | "other") => {
            Ok(normalized)
        }
        Some(_) => Err(AppError::bad_request("Weighting code is invalid")),
    }
}

fn normalize_access_level(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "free".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "free" | "subscription" => Ok(normalized),
        _ => Err(AppError::bad_request("Access level is invalid")),
    }
}

fn normalize_sort_order(value: Option<i32>) -> Result<i32, AppError> {
    let normalized = value.unwrap_or(0);

    if normalized < 0 {
        return Err(AppError::bad_request("Sort order is invalid"));
    }

    Ok(normalized)
}

fn normalize_overlay_opacity(value: Option<f64>) -> Result<f64, AppError> {
    let normalized = value.unwrap_or(0.44);

    if !normalized.is_finite() || !(0.0..=1.0).contains(&normalized) {
        return Err(AppError::bad_request("Overlay opacity is invalid"));
    }

    Ok(normalized)
}

fn validate_normalized_coordinate(value: f64, message: &str) -> Result<f64, AppError> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Err(AppError::bad_request(message));
    }

    Ok(value)
}

fn normalize_optional_coordinate(
    value: Option<f64>,
    message: &str,
) -> Result<Option<f64>, AppError> {
    value.map(|current| validate_normalized_coordinate(current, message))
        .transpose()
}

fn normalize_polygon_points(
    value: Option<Vec<ViewerAnnotationPoint>>,
) -> Result<Vec<ViewerAnnotationPoint>, AppError> {
    let mut points = Vec::new();

    for point in value.unwrap_or_default() {
        points.push(ViewerAnnotationPoint {
            x: validate_normalized_coordinate(point.x, "Polygon point X is invalid")?,
            y: validate_normalized_coordinate(point.y, "Polygon point Y is invalid")?,
        });
    }

    Ok(points)
}

fn slugify(value: &str, fallback: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut previous_dash = false;

    for character in value.chars() {
        let current = character.to_ascii_lowercase();

        if current.is_ascii_alphanumeric() {
            slug.push(current);
            previous_dash = false;
            continue;
        }

        if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-');

    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn sanitize_file_name(value: &str) -> String {
    let path = Path::new(value);
    let stem = path.file_stem().and_then(OsStr::to_str).unwrap_or("file");
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .map(|current| format!(".{}", slugify(current, "bin")))
        .unwrap_or_default();

    format!("{}{}", slugify(stem, "file"), extension)
}

fn sanitize_relative_path(value: &str) -> String {
    let mut segments = value
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty() && *segment != "." && *segment != "..")
        .map(sanitize_file_name)
        .collect::<Vec<_>>();

    if segments.is_empty() {
        return "file".to_string();
    }

    let file_name = segments.pop().unwrap_or_else(|| "file".to_string());

    if segments.is_empty() {
        file_name
    } else {
        format!("{}/{}", segments.join("/"), file_name)
    }
}

fn is_zip_filename(value: &str) -> bool {
    value.trim().to_ascii_lowercase().ends_with(".zip")
}

fn storage_key_from_absolute(storage_root: &Path, path: &Path) -> Result<String, AppError> {
    let relative = path
        .strip_prefix(storage_root)
        .map_err(|_| AppError::internal("Storage path is outside the configured root"))?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn thumbnail_storage_key(image_storage_key: &str) -> String {
    if let Some(stripped) = image_storage_key.strip_suffix(".png") {
        format!("{stripped}-thumb.png")
    } else {
        format!("{image_storage_key}-thumb")
    }
}

async fn extract_zip_study(
    zip_path: &Path,
    extracted_root: &Path,
) -> anyhow::Result<Vec<PreparedStudyFile>> {
    let zip_path = zip_path.to_path_buf();
    let extracted_root = extracted_root.to_path_buf();

    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<PreparedStudyFile>> {
        let file = std::fs::File::open(&zip_path)
            .with_context(|| format!("Unable to open ZIP package at {}", zip_path.display()))?;
        let mut archive = zip::ZipArchive::new(file).context("Unable to read ZIP package")?;
        let mut prepared = Vec::new();

        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .with_context(|| format!("Unable to read ZIP entry #{index}"))?;

            if entry.is_dir() {
                continue;
            }

            let original_name = entry.name().to_string();
            let safe_relative_path = sanitize_relative_path(&original_name);
            let output_path = extracted_root.join(&safe_relative_path);

            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent)?;
            }

            let mut output = std::fs::File::create(&output_path)?;
            std::io::copy(&mut entry, &mut output)?;

            prepared.push(PreparedStudyFile {
                source_relative_path: Some(safe_relative_path),
                original_file_name: Path::new(&original_name)
                    .file_name()
                    .and_then(OsStr::to_str)
                    .unwrap_or("file")
                    .to_string(),
                file_path: output_path,
            });
        }

        Ok(prepared)
    })
    .await
    .map_err(|error| anyhow::anyhow!("ZIP extraction task failed: {error}"))?
}

async fn derive_slice_candidate(
    storage_root: &Path,
    derived_root: &Path,
    study_file: &PreparedStudyFile,
    fallback_index: usize,
) -> anyhow::Result<Option<DerivedSliceCandidate>> {
    let storage_root = storage_root.to_path_buf();
    let derived_root = derived_root.to_path_buf();
    let study_file = study_file.clone();

    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<DerivedSliceCandidate>> {
        let object = match open_file(&study_file.file_path) {
            Ok(value) => value,
            Err(_) => return Ok(None),
        };

        let decoded = match object.decode_pixel_data() {
            Ok(value) => value,
            Err(_) => return Ok(None),
        };
        let dynamic_image = match decoded.to_dynamic_image(0) {
            Ok(value) => value,
            Err(_) => return Ok(None),
        };

        let series_uid = dicom_text(&object, "SeriesInstanceUID");
        let instance_uid = dicom_text(&object, "SOPInstanceUID");
        let series_description = dicom_text(&object, "SeriesDescription");
        let sequence_name = dicom_text(&object, "SequenceName");
        let instance_number = dicom_text(&object, "InstanceNumber")
            .and_then(|value| value.parse::<i32>().ok())
            .unwrap_or(fallback_index as i32);
        let slice_index = instance_number.max(0);
        let weighting_code = infer_weighting_code(
            series_description.as_deref(),
            sequence_name.as_deref(),
            study_file.source_relative_path.as_deref(),
        );
        let orientation_code = infer_orientation_code(
            series_description.as_deref(),
            sequence_name.as_deref(),
            study_file.source_relative_path.as_deref(),
        );
        let series_label = series_description
            .clone()
            .or(sequence_name.clone())
            .or_else(|| weighting_code.clone().map(|value| value.to_uppercase()))
            .or_else(|| orientation_code.clone().map(|value| value.to_uppercase()))
            .or_else(|| Some("Series".to_string()));

        let identifier = format!(
            "{}-{}-{}",
            series_uid.as_deref().unwrap_or("series"),
            slice_index,
            study_file.original_file_name
        );
        let output_name = format!("{:04}-{}.png", slice_index, slugify(&identifier, "slice"));
        let image_path = derived_root.join(&output_name);
        let thumbnail_path = derived_root.join(format!(
            "{:04}-{}-thumb.png",
            slice_index,
            slugify(&identifier, "slice")
        ));

        let png_bytes = encode_png(&dynamic_image)?;
        let thumbnail = dynamic_image.resize(320, 320, FilterType::Triangle);
        let thumbnail_bytes = encode_png(&thumbnail)?;

        std::fs::write(&image_path, &png_bytes)?;
        std::fs::write(&thumbnail_path, &thumbnail_bytes)?;

        Ok(Some(DerivedSliceCandidate {
            source_relative_path: study_file.source_relative_path.clone(),
            storage_key: storage_key_from_absolute(&storage_root, &image_path)
                .map_err(anyhow::Error::from)?,
            checksum: sha256_hex(&png_bytes),
            size_bytes: png_bytes.len() as i64,
            width: i32::try_from(dynamic_image.width()).unwrap_or(i32::MAX),
            height: i32::try_from(dynamic_image.height()).unwrap_or(i32::MAX),
            series_uid,
            series_label,
            instance_uid,
            slice_index,
            weighting_code,
            orientation_code,
        }))
    })
    .await
    .map_err(|error| anyhow::anyhow!("DICOM derivation task failed: {error}"))?
}

fn dicom_text(object: &dicom::object::DefaultDicomObject, name: &str) -> Option<String> {
    object
        .element_by_name(name)
        .ok()
        .and_then(|element| element.to_str().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn encode_png(image: &DynamicImage) -> anyhow::Result<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    image.write_to(&mut cursor, image::ImageFormat::Png)?;
    Ok(cursor.into_inner())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn infer_weighting_code(
    series_description: Option<&str>,
    sequence_name: Option<&str>,
    source_relative_path: Option<&str>,
) -> Option<String> {
    let haystack = [series_description, sequence_name, source_relative_path]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase();

    if haystack.is_empty() {
        return None;
    }

    if haystack.contains("t1 gado") || haystack.contains("t1+c") || haystack.contains("post") {
        return Some("t1_gado".to_string());
    }
    if haystack.contains("t2*") || haystack.contains("t2 star") || haystack.contains("gre") {
        return Some("t2_star".to_string());
    }
    if haystack.contains("flair") {
        return Some("flair".to_string());
    }
    if haystack.contains("adc") {
        return Some("adc".to_string());
    }
    if haystack.contains("dwi") {
        return Some("dwi".to_string());
    }
    if haystack.contains("t2") {
        return Some("t2".to_string());
    }
    if haystack.contains("t1") {
        return Some("t1".to_string());
    }

    None
}

fn infer_orientation_code(
    series_description: Option<&str>,
    sequence_name: Option<&str>,
    source_relative_path: Option<&str>,
) -> Option<String> {
    let haystack = [series_description, sequence_name, source_relative_path]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase();

    if haystack.contains("sag") {
        return Some("sagittal".to_string());
    }
    if haystack.contains("cor") {
        return Some("coronal".to_string());
    }
    if haystack.contains("axi") || haystack.contains("ax ") || haystack.contains("axial") {
        return Some("axial".to_string());
    }

    None
}

fn build_viewer_manifest_json(assets: &[ZoneModalityAsset]) -> serde_json::Value {
    let mut series_map: BTreeMap<String, Vec<&ZoneModalityAsset>> = BTreeMap::new();

    for asset in assets {
        let key = asset
            .series_uid
            .clone()
            .or_else(|| asset.series_label.clone())
            .unwrap_or_else(|| asset.id.clone());
        series_map.entry(key).or_default().push(asset);
    }

    let series = series_map
        .values()
        .map(|items| {
            let first = items[0];
            json!({
                "seriesUid": first.series_uid,
                "seriesLabel": first.series_label,
                "weightingCode": first.weighting_code,
                "orientationCode": first.orientation_code,
                "sliceCount": items.len(),
                "assetIds": items.iter().map(|asset| asset.id.clone()).collect::<Vec<_>>(),
            })
        })
        .collect::<Vec<_>>();

    json!({
        "schemaVersion": "draft-1",
        "sliceCount": assets.len(),
        "series": series,
        "weightings": assets
            .iter()
            .filter_map(|asset| asset.weighting_code.clone())
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>(),
    })
}

fn count_distinct_series(assets: &[ZoneModalityAsset]) -> usize {
    assets
        .iter()
        .map(|asset| {
            asset
                .series_uid
                .clone()
                .or_else(|| asset.series_label.clone())
                .unwrap_or_else(|| asset.id.clone())
        })
        .collect::<std::collections::BTreeSet<_>>()
        .len()
}

use std::{
    collections::BTreeMap,
    ffi::OsStr,
    io::Cursor,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::Context;
use dicom::{object::open_file, pixeldata::PixelDecoder};
use image::{
    ExtendedColorType, ImageBuffer, ImageEncoder, Rgba, RgbaImage, codecs::avif::AvifEncoder,
    imageops::overlay,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tokio::{fs, sync::broadcast, task::JoinSet};
use tracing::error;
use uuid::Uuid;

use crate::features::playground::{
    domain::models::{
        CreateViewerAnnotationInput, CreateViewerStructureGroupInput, CreateViewerStructureInput,
        CreateZoneInput, CreateZoneModalityAssetInput, CreateZoneModalityInput,
        DeleteZoneModalityAssetsInput, DeleteZoneModalityAssetsResponse, ModalitySourceAsset,
        UpdateViewerAnnotationInput, UpdateViewerStructureGroupInput, UpdateViewerStructureInput,
        UpdateZoneInput, UpdateZoneModalityAssetInput, UpdateZoneModalityInput,
        ViewerAnnotationPoint, ViewerStructure, ViewerStructureGroup, ZoneDetail, ZoneListResponse,
        ZoneModality, ZoneModalityAsset, ZoneModalityAssetListResponse, ZoneModalityAtlasFrame,
        ZoneModalityAtlasPage, ZoneModalityListResponse, ZoneModalityViewerManifest,
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
    pub weighting_code: Option<String>,
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

#[derive(Debug, Clone)]
struct DerivedSliceBuild {
    candidate: DerivedSliceCandidate,
    atlas_source_image: RgbaImage,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AtlasFrameMetadata {
    asset_id: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AtlasPageMetadata {
    width: i32,
    height: i32,
    frames: Vec<AtlasFrameMetadata>,
}

#[derive(Debug, Clone, Copy)]
pub enum DerivedAssetBinaryVariant {
    Image,
}

const MAX_ACTIVE_MODALITY_INGESTS: i64 = 2;
const MAX_CONCURRENT_DICOM_DERIVATIONS: usize = 8;
const AVIF_ENCODER_SPEED: u8 = 8;
const AVIF_ENCODER_QUALITY: u8 = 80;
const AVIF_ENCODER_THREADS_PER_IMAGE: usize = 1;
const MAX_ATLAS_PAGE_EDGE: u32 = 4096;
const MAX_ATLAS_PAGE_COLUMNS: usize = 8;
const MAX_ATLAS_SLICES_PER_PAGE: usize = 40;

impl PlaygroundService {
    pub fn new(pool: PgPool, storage_root: impl Into<String>) -> Self {
        Self {
            pool,
            repo: PlaygroundRepository::default(),
            storage_root: PathBuf::from(storage_root.into()),
            events: Arc::new(PlaygroundEventHub::new()),
        }
    }

    pub fn subscribe_zone_modality_events(
        &self,
    ) -> broadcast::Receiver<ZoneModalityListChangedEvent> {
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
        let weighting_code = normalize_weighting_code(input.weighting_code)?;
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
                weighting_code.as_deref(),
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
        let weighting_code = normalize_weighting_code(input.weighting_code)?;
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
                weighting_code.as_deref(),
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

    pub async fn ensure_modality_ingest_capacity(&self, account_id: Uuid) -> Result<(), AppError> {
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

            let derived_slice_builds = self
                .derive_study_slices(ingest_job_id, &study_files)
                .await?;

            if derived_slice_builds.is_empty() {
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
                        "derivedSliceCount": derived_slice_builds.len(),
                    }),
                    None,
                    false,
                )
                .await?;

            let mut persisted_assets = Vec::with_capacity(derived_slice_builds.len());

            for (sort_order, derived_slice_build) in derived_slice_builds.iter().enumerate() {
                let derived_slice = &derived_slice_build.candidate;
                let asset_id = Uuid::new_v4();
                let image_url = format!("/api/v1/playground/derived-assets/{asset_id}/image");
                let label = derived_slice
                    .series_label
                    .clone()
                    .unwrap_or_else(|| format!("Slice {}", derived_slice.slice_index + 1));

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
                        None,
                        sort_order as i32,
                        None,
                        "local_disk",
                        &derived_slice.storage_key,
                        &derived_slice.checksum,
                        "image/avif",
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

            let packed_pages = self
                .build_atlas_pages_from_slice_builds(
                    ingest_job_id,
                    &persisted_assets,
                    &derived_slice_builds,
                )
                .await?;
            let (atlas_pages, atlas_frames) = self
                .persist_built_atlas_pages(modality_id, ingest_job_id, &user_id, packed_pages)
                .await?;

            let manifest_json =
                build_viewer_manifest_json(&persisted_assets, &atlas_pages, &atlas_frames);

            self.repo
                .upsert_modality_viewer_manifest(
                    &self.pool,
                    modality_id,
                    ingest_job_id,
                    "draft-1",
                    &manifest_json,
                )
                .await?;

            let cover_image_url = persisted_assets.first().and_then(|asset| {
                asset
                    .thumbnail_url
                    .clone()
                    .or_else(|| Some(asset.image_url.clone()))
            });

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
        let weighting_code = normalize_weighting_code(input.weighting_code)?;
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
                weighting_code.as_deref(),
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

    pub async fn delete_zone_modality_asset(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_id: Uuid,
    ) -> Result<(), AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let deleted = self
            .repo
            .delete_zone_modality_asset(&self.pool, account_id, zone_id, modality_id, asset_id)
            .await?;

        if !deleted {
            return Err(AppError::not_found("Modality asset was not found"));
        }

        Ok(())
    }

    pub async fn delete_zone_modality_assets(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        input: DeleteZoneModalityAssetsInput,
    ) -> Result<DeleteZoneModalityAssetsResponse, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        if input.asset_ids.is_empty() {
            return Err(AppError::bad_request("At least one asset id is required"));
        }

        let mut parsed_asset_ids = Vec::with_capacity(input.asset_ids.len());

        for asset_id in input.asset_ids {
            let parsed_asset_id = Uuid::parse_str(&asset_id)
                .map_err(|_| AppError::bad_request("Asset id is invalid"))?;
            parsed_asset_ids.push(parsed_asset_id);
        }

        parsed_asset_ids.sort_unstable();
        parsed_asset_ids.dedup();

        let requested_count = parsed_asset_ids.len();
        let deleted_count = self
            .repo
            .delete_zone_modality_assets(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                &parsed_asset_ids,
            )
            .await?;

        Ok(DeleteZoneModalityAssetsResponse {
            requested_count,
            deleted_count: deleted_count as usize,
        })
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
        let atlas_assets = self
            .repo
            .list_zone_modality_atlas_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let (atlases, atlas_frames) = self.load_atlas_manifest(&atlas_assets)?;
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
            atlases,
            atlas_frames,
            structure_groups,
            structures,
            annotations,
        })
    }

    pub async fn rebuild_modality_atlases(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        source_assets: &[ZoneModalityAsset],
    ) -> Result<(Vec<ZoneModalityAtlasPage>, Vec<ZoneModalityAtlasFrame>), AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let ingest_job_id = source_assets
            .iter()
            .find_map(|asset| {
                asset
                    .ingest_job_id
                    .as_deref()
                    .and_then(|value| Uuid::parse_str(value).ok())
            })
            .ok_or_else(|| AppError::not_found("Ingest job was not found"))?;

        self.delete_existing_atlas_assets(account_id, zone_id, modality_id)
            .await?;

        let packed_pages = self.build_atlas_pages(ingest_job_id, source_assets).await?;
        self.persist_built_atlas_pages(modality_id, ingest_job_id, user_id, packed_pages)
            .await
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

        let title = normalize_required_name(&input.title, "Structure group title is required")?;
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

        let title = normalize_required_name(&input.title, "Structure group title is required")?;
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

    pub async fn delete_viewer_structure_group(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        group_id: Uuid,
    ) -> Result<(), AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let deleted = self
            .repo
            .delete_viewer_structure_group(&self.pool, account_id, zone_id, modality_id, group_id)
            .await?;

        if !deleted {
            return Err(AppError::not_found("Structure group was not found"));
        }

        Ok(())
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

    pub async fn delete_viewer_structure(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        structure_id: Uuid,
    ) -> Result<(), AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let deleted = self
            .repo
            .delete_viewer_structure(&self.pool, account_id, zone_id, modality_id, structure_id)
            .await?;

        if !deleted {
            return Err(AppError::not_found("Structure was not found"));
        }

        Ok(())
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

        let asset_id = self
            .normalize_asset_id(account_id, zone_id, modality_id, &input.asset_id)
            .await?;
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

        let asset_id = self
            .normalize_asset_id(account_id, zone_id, modality_id, &input.asset_id)
            .await?;
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

    pub async fn delete_viewer_annotation(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        annotation_id: Uuid,
    ) -> Result<(), AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let deleted = self
            .repo
            .delete_viewer_annotation(&self.pool, account_id, zone_id, modality_id, annotation_id)
            .await?;

        if !deleted {
            return Err(AppError::not_found("Annotation was not found"));
        }

        Ok(())
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
            .unwrap_or_else(|| infer_derived_mime_type(storage_key).to_string());

        let _ = variant;
        let binary_path = self.storage_root.join(storage_key);
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
        fs::create_dir_all(&source_root).await.map_err(|error| {
            AppError::internal(format!("Unable to create source directory: {error}"))
        })?;

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
            self.persist_temp_file(&upload.temp_path, &final_path)
                .await?;

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
                    upload.content_type.as_deref().unwrap_or("application/zip"),
                    upload.size_bytes,
                )
                .await?;

            let extracted_root = self
                .storage_root
                .join("playground")
                .join("expanded")
                .join(ingest_job_id.to_string());
            fs::create_dir_all(&extracted_root).await.map_err(|error| {
                AppError::internal(format!("Unable to create extraction directory: {error}"))
            })?;
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

            self.persist_temp_file(&upload.temp_path, &final_path)
                .await?;

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
    ) -> Result<Vec<DerivedSliceBuild>, AppError> {
        let derived_root = self
            .storage_root
            .join("playground")
            .join("derived")
            .join(ingest_job_id.to_string());
        fs::create_dir_all(&derived_root).await.map_err(|error| {
            AppError::internal(format!("Unable to create derived directory: {error}"))
        })?;

        let mut candidates = Vec::new();
        let worker_limit = recommended_dicom_derivation_concurrency();
        let mut pending = JoinSet::new();
        let mut next_index = 0usize;

        while next_index < study_files.len() || !pending.is_empty() {
            while next_index < study_files.len() && pending.len() < worker_limit {
                let fallback_index = next_index;
                let study_file = study_files[next_index].clone();
                let storage_root = self.storage_root.clone();
                let derived_root = derived_root.clone();
                let source_label = study_file
                    .source_relative_path
                    .clone()
                    .unwrap_or_else(|| study_file.original_file_name.clone());

                pending.spawn(async move {
                    let result = derive_slice_candidate(
                        &storage_root,
                        &derived_root,
                        &study_file,
                        fallback_index,
                    )
                    .await;
                    (source_label, result)
                });
                next_index += 1;
            }

            let Some(join_result) = pending.join_next().await else {
                break;
            };

            match join_result {
                Ok((_source_label, Ok(Some(candidate)))) => candidates.push(candidate),
                Ok((_source_label, Ok(None))) => {}
                Ok((source_label, Err(derive_error))) => {
                    error!(
                        source_label,
                        ?derive_error,
                        "unable to derive DICOM slice candidate"
                    );
                }
                Err(join_error) => {
                    error!(?join_error, "DICOM slice derivation task failed");
                }
            }
        }

        candidates.sort_by(|left, right| {
            let left_series = left.candidate.series_uid.as_deref().unwrap_or("");
            let right_series = right.candidate.series_uid.as_deref().unwrap_or("");

            left_series
                .cmp(right_series)
                .then_with(|| left.candidate.slice_index.cmp(&right.candidate.slice_index))
                .then_with(|| left.candidate.storage_key.cmp(&right.candidate.storage_key))
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
            .structure_group_slug_exists(&self.pool, account_id, zone_id, modality_id, &candidate)
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
        "slice" | "cover" | "overview" | "reference" | "derived_slice" | "atlas" => Ok(normalized),
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
    value
        .map(|current| validate_normalized_coordinate(current, message))
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

fn infer_derived_mime_type(storage_key: &str) -> &'static str {
    if storage_key.ends_with(".png") {
        "image/png"
    } else if storage_key.ends_with(".webp") {
        "image/webp"
    } else {
        "image/avif"
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
) -> anyhow::Result<Option<DerivedSliceBuild>> {
    let storage_root = storage_root.to_path_buf();
    let derived_root = derived_root.to_path_buf();
    let study_file = study_file.clone();

    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<DerivedSliceBuild>> {
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
        let orientation_code = infer_orientation_code(
            series_description.as_deref(),
            sequence_name.as_deref(),
            study_file.source_relative_path.as_deref(),
        );
        let series_label = series_description
            .clone()
            .or(sequence_name.clone())
            .or_else(|| orientation_code.clone().map(|value| value.to_uppercase()))
            .or_else(|| Some("Series".to_string()));

        let identifier = format!(
            "{}-{}-{}",
            series_uid.as_deref().unwrap_or("series"),
            slice_index,
            study_file.original_file_name
        );
        let output_name = format!("{:04}-{}.avif", slice_index, slugify(&identifier, "slice"));
        let image_path = derived_root.join(&output_name);

        let rgba_image = dynamic_image.to_rgba8();
        let avif_bytes = encode_avif(&rgba_image)?;
        let atlas_source_image = build_atlas_source_image(&rgba_image);

        std::fs::write(&image_path, &avif_bytes)?;

        Ok(Some(DerivedSliceBuild {
            candidate: DerivedSliceCandidate {
                source_relative_path: study_file.source_relative_path.clone(),
                storage_key: storage_key_from_absolute(&storage_root, &image_path)
                    .map_err(anyhow::Error::from)?,
                checksum: sha256_hex(&avif_bytes),
                size_bytes: avif_bytes.len() as i64,
                width: i32::try_from(rgba_image.width()).unwrap_or(i32::MAX),
                height: i32::try_from(rgba_image.height()).unwrap_or(i32::MAX),
                series_uid,
                series_label,
                instance_uid,
                slice_index,
                weighting_code: None,
                orientation_code,
            },
            atlas_source_image,
        }))
    })
    .await
    .map_err(|error| anyhow::anyhow!("DICOM derivation task failed: {error}"))?
}

#[derive(Debug, Clone)]
struct BuiltAtlasPage {
    storage_key: String,
    checksum: String,
    size_bytes: i64,
    width: i32,
    height: i32,
    frames: Vec<AtlasFrameMetadata>,
}

#[derive(Debug, Clone)]
struct AtlasSourceSlice {
    asset_id: String,
    image: RgbaImage,
}

impl PlaygroundService {
    async fn prepare_atlas_root(&self, ingest_job_id: Uuid) -> Result<PathBuf, AppError> {
        let atlas_root = self
            .storage_root
            .join("playground")
            .join("derived")
            .join(ingest_job_id.to_string())
            .join("atlases");

        let _ = fs::remove_dir_all(&atlas_root).await;
        fs::create_dir_all(&atlas_root).await.map_err(|error| {
            AppError::internal(format!("Unable to create atlas directory: {error}"))
        })?;

        Ok(atlas_root)
    }

    async fn delete_existing_atlas_assets(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<(), AppError> {
        let atlas_assets = self
            .repo
            .list_zone_modality_atlas_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;

        if atlas_assets.is_empty() {
            return Ok(());
        }

        let atlas_ids = atlas_assets
            .iter()
            .filter_map(|asset| Uuid::parse_str(&asset.id).ok())
            .collect::<Vec<_>>();

        if atlas_ids.is_empty() {
            return Ok(());
        }

        let _ = self
            .repo
            .delete_zone_modality_assets(&self.pool, account_id, zone_id, modality_id, &atlas_ids)
            .await?;

        Ok(())
    }

    async fn persist_built_atlas_pages(
        &self,
        modality_id: Uuid,
        ingest_job_id: Uuid,
        user_id: &str,
        packed_pages: Vec<BuiltAtlasPage>,
    ) -> Result<(Vec<ZoneModalityAtlasPage>, Vec<ZoneModalityAtlasFrame>), AppError> {
        let mut atlas_pages = Vec::with_capacity(packed_pages.len());
        let mut atlas_frames = Vec::new();

        for (page_index, packed_page) in packed_pages.into_iter().enumerate() {
            let atlas_asset_id = Uuid::new_v4();
            let atlas_label = format!("Atlas {}", page_index + 1);
            let atlas_asset = self
                .repo
                .create_zone_modality_derived_asset(
                    &self.pool,
                    atlas_asset_id,
                    modality_id,
                    ingest_job_id,
                    user_id,
                    &atlas_label,
                    "atlas",
                    None,
                    &format!("/api/v1/playground/derived-assets/{atlas_asset_id}/image"),
                    None,
                    page_index as i32,
                    Some("atlas_cache"),
                    "local_disk",
                    &packed_page.storage_key,
                    &packed_page.checksum,
                    "image/avif",
                    packed_page.size_bytes,
                    packed_page.width,
                    packed_page.height,
                    None,
                    None,
                    None,
                    None,
                    0,
                    None,
                )
                .await?;

            atlas_pages.push(ZoneModalityAtlasPage {
                id: atlas_asset.id.clone(),
                image_url: atlas_asset.image_url.clone(),
                width: packed_page.width,
                height: packed_page.height,
                slice_count: packed_page.frames.len(),
            });

            atlas_frames.extend(packed_page.frames.into_iter().map(|frame| {
                ZoneModalityAtlasFrame {
                    asset_id: frame.asset_id,
                    atlas_id: atlas_asset.id.clone(),
                    x: frame.x,
                    y: frame.y,
                    width: frame.width,
                    height: frame.height,
                }
            }));
        }

        Ok((atlas_pages, atlas_frames))
    }

    async fn build_atlas_pages_from_slice_builds(
        &self,
        ingest_job_id: Uuid,
        slice_assets: &[ZoneModalityAsset],
        slice_builds: &[DerivedSliceBuild],
    ) -> Result<Vec<BuiltAtlasPage>, AppError> {
        if slice_assets.len() != slice_builds.len() {
            return Err(AppError::internal(
                "Slice assets and derived slice builds became misaligned",
            ));
        }

        let storage_root = self.storage_root.clone();
        let atlas_root = self.prepare_atlas_root(ingest_job_id).await?;
        let slice_images = slice_assets
            .iter()
            .zip(slice_builds.iter())
            .map(|(asset, build)| AtlasSourceSlice {
                asset_id: asset.id.clone(),
                image: build.atlas_source_image.clone(),
            })
            .collect::<Vec<_>>();

        tokio::task::spawn_blocking(move || {
            write_atlas_pages(&storage_root, &atlas_root, slice_images)
        })
        .await
        .map_err(|error| AppError::internal(format!("Atlas build task failed: {error}")))?
        .map_err(AppError::from)
    }

    async fn build_atlas_pages(
        &self,
        ingest_job_id: Uuid,
        source_assets: &[ZoneModalityAsset],
    ) -> Result<Vec<BuiltAtlasPage>, AppError> {
        let slice_assets = source_assets
            .iter()
            .filter(|asset| matches!(asset.asset_kind.as_str(), "slice" | "derived_slice"))
            .cloned()
            .collect::<Vec<_>>();

        if slice_assets.is_empty() {
            return Ok(Vec::new());
        }

        let storage_root = self.storage_root.clone();
        let atlas_root = self.prepare_atlas_root(ingest_job_id).await?;

        tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<BuiltAtlasPage>> {
            let mut slice_images = Vec::with_capacity(slice_assets.len());

            for asset in slice_assets {
                let image = load_atlas_source_image(&storage_root, &asset)?;
                slice_images.push(AtlasSourceSlice {
                    asset_id: asset.id,
                    image,
                });
            }

            write_atlas_pages(&storage_root, &atlas_root, slice_images)
        })
        .await
        .map_err(|error| AppError::internal(format!("Atlas build task failed: {error}")))?
        .map_err(AppError::from)
    }

    fn load_atlas_manifest(
        &self,
        atlas_assets: &[ZoneModalityAsset],
    ) -> Result<(Vec<ZoneModalityAtlasPage>, Vec<ZoneModalityAtlasFrame>), AppError> {
        let mut pages = Vec::with_capacity(atlas_assets.len());
        let mut frames = Vec::new();

        for atlas_asset in atlas_assets {
            let storage_key = atlas_asset
                .storage_key
                .as_deref()
                .ok_or_else(|| AppError::not_found("Atlas page file is unavailable"))?;
            let metadata_path = self.storage_root.join(storage_key).with_extension("json");
            let metadata_bytes = std::fs::read(&metadata_path)
                .map_err(|_| AppError::not_found("Atlas page metadata is unavailable"))?;
            let metadata: AtlasPageMetadata =
                serde_json::from_slice(&metadata_bytes).map_err(|error| {
                    AppError::internal(format!("Unable to parse atlas metadata: {error}"))
                })?;

            pages.push(ZoneModalityAtlasPage {
                id: atlas_asset.id.clone(),
                image_url: atlas_asset.image_url.clone(),
                width: metadata.width,
                height: metadata.height,
                slice_count: metadata.frames.len(),
            });

            frames.extend(
                metadata
                    .frames
                    .into_iter()
                    .map(|frame| ZoneModalityAtlasFrame {
                        asset_id: frame.asset_id,
                        atlas_id: atlas_asset.id.clone(),
                        x: frame.x,
                        y: frame.y,
                        width: frame.width,
                        height: frame.height,
                    }),
            );
        }

        Ok((pages, frames))
    }
}

fn dicom_text(object: &dicom::object::DefaultDicomObject, name: &str) -> Option<String> {
    object
        .element_by_name(name)
        .ok()
        .and_then(|element| element.to_str().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn recommended_dicom_derivation_concurrency() -> usize {
    std::thread::available_parallelism()
        .map(|parallelism| parallelism.get().min(MAX_CONCURRENT_DICOM_DERIVATIONS))
        .unwrap_or(4)
}

fn encode_avif(image: &RgbaImage) -> anyhow::Result<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    AvifEncoder::new_with_speed_quality(&mut cursor, AVIF_ENCODER_SPEED, AVIF_ENCODER_QUALITY)
        .with_num_threads(Some(AVIF_ENCODER_THREADS_PER_IMAGE))
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )?;
    Ok(cursor.into_inner())
}

fn build_atlas_source_image(image: &RgbaImage) -> RgbaImage {
    image.clone()
}

fn resolve_slice_source_file_path(
    storage_root: &Path,
    asset: &ZoneModalityAsset,
) -> anyhow::Result<PathBuf> {
    let ingest_job_id = asset
        .ingest_job_id
        .as_deref()
        .context("Slice asset is missing an ingest job id")?;
    let source_relative_path = asset
        .source_relative_path
        .as_deref()
        .context("Slice asset is missing a source-relative path")?;

    for directory in ["expanded", "source"] {
        let candidate = storage_root
            .join("playground")
            .join(directory)
            .join(ingest_job_id)
            .join(source_relative_path);

        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(anyhow::anyhow!(
        "Unable to locate the staged source DICOM for atlas generation"
    ))
}

fn write_atlas_pages(
    storage_root: &Path,
    atlas_root: &Path,
    slice_images: Vec<AtlasSourceSlice>,
) -> anyhow::Result<Vec<BuiltAtlasPage>> {
    if slice_images.is_empty() {
        return Ok(Vec::new());
    }

    let mut global_cell_width = 0u32;
    let mut global_cell_height = 0u32;
    for slice in &slice_images {
        global_cell_width = global_cell_width.max(slice.image.width());
        global_cell_height = global_cell_height.max(slice.image.height());
    }

    let columns_by_width = if global_cell_width == 0 {
        1
    } else {
        (MAX_ATLAS_PAGE_EDGE / global_cell_width).max(1) as usize
    };
    let rows_by_height = if global_cell_height == 0 {
        1
    } else {
        (MAX_ATLAS_PAGE_EDGE / global_cell_height).max(1) as usize
    };
    let columns_per_page = columns_by_width.min(MAX_ATLAS_PAGE_COLUMNS).max(1);
    let rows_per_page = rows_by_height.max(1);
    let slices_per_page = (columns_per_page * rows_per_page)
        .min(MAX_ATLAS_SLICES_PER_PAGE)
        .max(1);

    let mut atlas_pages = Vec::new();

    for (page_index, page_slices) in slice_images.chunks(slices_per_page).enumerate() {
        let mut cell_width = 0i32;
        let mut cell_height = 0i32;

        for slice in page_slices {
            cell_width = cell_width.max(i32::try_from(slice.image.width()).unwrap_or(i32::MAX));
            cell_height = cell_height.max(i32::try_from(slice.image.height()).unwrap_or(i32::MAX));
        }

        let columns = columns_per_page.min(page_slices.len()).max(1);
        let rows = page_slices.len().div_ceil(columns);
        let page_width = (cell_width as u32) * (columns as u32);
        let page_height = (cell_height as u32) * (rows as u32);
        let mut atlas_canvas: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(page_width, page_height, Rgba([0, 0, 0, 0]));
        let mut frames = Vec::with_capacity(page_slices.len());

        for (index, slice) in page_slices.iter().enumerate() {
            let column = index % columns;
            let row = index / columns;
            let x = i64::try_from(column).unwrap_or(0) * i64::from(cell_width);
            let y = i64::try_from(row).unwrap_or(0) * i64::from(cell_height);

            overlay(&mut atlas_canvas, &slice.image, x, y);

            frames.push(AtlasFrameMetadata {
                asset_id: slice.asset_id.clone(),
                x: i32::try_from(x).unwrap_or(i32::MAX),
                y: i32::try_from(y).unwrap_or(i32::MAX),
                width: i32::try_from(slice.image.width()).unwrap_or(i32::MAX),
                height: i32::try_from(slice.image.height()).unwrap_or(i32::MAX),
            });
        }

        let atlas_file_name = format!("atlas-{:03}.avif", page_index + 1);
        let atlas_path = atlas_root.join(&atlas_file_name);
        let atlas_bytes = encode_avif(&atlas_canvas)?;
        std::fs::write(&atlas_path, &atlas_bytes)
            .with_context(|| format!("Unable to write atlas image at {}", atlas_path.display()))?;

        let metadata_path = atlas_path.with_extension("json");
        let metadata_json = serde_json::to_vec_pretty(&AtlasPageMetadata {
            width: i32::try_from(page_width).unwrap_or(i32::MAX),
            height: i32::try_from(page_height).unwrap_or(i32::MAX),
            frames: frames.clone(),
        })?;
        std::fs::write(&metadata_path, metadata_json).with_context(|| {
            format!(
                "Unable to write atlas metadata at {}",
                metadata_path.display()
            )
        })?;

        atlas_pages.push(BuiltAtlasPage {
            storage_key: storage_key_from_absolute(storage_root, &atlas_path)
                .map_err(anyhow::Error::from)?,
            checksum: sha256_hex(&atlas_bytes),
            size_bytes: atlas_bytes.len() as i64,
            width: i32::try_from(page_width).unwrap_or(i32::MAX),
            height: i32::try_from(page_height).unwrap_or(i32::MAX),
            frames,
        });
    }

    Ok(atlas_pages)
}

fn load_atlas_source_image(
    storage_root: &Path,
    asset: &ZoneModalityAsset,
) -> anyhow::Result<RgbaImage> {
    let storage_key = asset
        .storage_key
        .as_deref()
        .context("Atlas source asset is missing a storage key")?;
    let image_path = storage_root.join(storage_key);

    let can_decode_directly = image_path
        .extension()
        .and_then(OsStr::to_str)
        .map(|extension| !extension.eq_ignore_ascii_case("avif"))
        .unwrap_or(true);

    if can_decode_directly {
        let image = image::open(&image_path).with_context(|| {
            format!(
                "Unable to open source slice image at {}",
                image_path.display()
            )
        })?;
        return Ok(build_atlas_source_image(&image.to_rgba8()));
    }

    let source_path = resolve_slice_source_file_path(storage_root, asset)?;
    let object = open_file(&source_path)
        .with_context(|| format!("Unable to open source DICOM at {}", source_path.display()))?;
    let decoded = object.decode_pixel_data().with_context(|| {
        format!(
            "Unable to decode source DICOM pixel data at {}",
            source_path.display()
        )
    })?;
    let dynamic_image = decoded.to_dynamic_image(0).with_context(|| {
        format!(
            "Unable to render source DICOM pixel data at {}",
            source_path.display()
        )
    })?;
    Ok(build_atlas_source_image(&dynamic_image.to_rgba8()))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
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

fn build_viewer_manifest_json(
    assets: &[ZoneModalityAsset],
    atlases: &[ZoneModalityAtlasPage],
    atlas_frames: &[ZoneModalityAtlasFrame],
) -> serde_json::Value {
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
        "atlases": atlases,
        "atlasFrames": atlas_frames,
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

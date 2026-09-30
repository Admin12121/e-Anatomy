use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::OsStr,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::Context;
use dicom::{object::open_file, pixeldata::PixelDecoder};
use image::{
    ExtendedColorType, ImageBuffer, ImageEncoder, Rgba, RgbaImage,
    codecs::{
        avif::AvifEncoder,
        png::{CompressionType, FilterType, PngEncoder},
    },
    imageops::overlay,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use tokio::{
    fs,
    sync::{Semaphore, broadcast, mpsc},
    task::JoinSet,
};
use tracing::error;
use uuid::Uuid;

use crate::features::playground::{
    domain::models::{
        CreateViewerAnnotationInput, CreateViewerStructureGroupInput, CreateViewerStructureInput,
        CreateZoneInput, CreateZoneModalityAssetInput, CreateZoneModalityInput,
        DeleteZoneModalityAssetsInput, DeleteZoneModalityAssetsResponse, ModalitySourceAsset,
        PublicZoneModalityListResponse, ReorderZoneModalityAssetsInput,
        ReorderZoneModalityAssetsResponse, UpdateViewerAnnotationInput,
        UpdateViewerStructureGroupInput, UpdateViewerStructureInput, UpdateZoneInput,
        UpdateZoneModalityAssetInput, UpdateZoneModalityFamilyInput, UpdateZoneModalityInput,
        ViewerAnnotationPoint, ViewerStructure, ViewerStructureGroup, ZoneDetail, ZoneListResponse,
        ZoneModality, ZoneModalityAsset, ZoneModalityAssetListResponse, ZoneModalityAtlasFrame,
        ZoneModalityAtlasPage, ZoneModalityFamily, ZoneModalityFamilyListResponse,
        ZoneModalityViewerManifest,
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
    ingest_gate: Arc<Semaphore>,
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
    pub family_id: Option<String>,
    pub name: String,
    pub modality_type: String,
    pub weighting_code: Option<String>,
    pub thumbnail_url: Option<String>,
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
    atlas_source_image: Option<RgbaImage>,
}

#[derive(Debug, Clone)]
struct MprSourceSlice {
    file_path: PathBuf,
    series_uid: String,
    frame_of_reference_uid: Option<String>,
    rows: usize,
    columns: usize,
    image_position: [f64; 3],
    row_direction: [f64; 3],
    column_direction: [f64; 3],
    row_spacing: f64,
    column_spacing: f64,
    slice_projection: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MprVolumeGeometry {
    dimensions: [usize; 3],
    spacing: [f64; 3],
    origin: [f64; 3],
    frame_of_reference_uid: Option<String>,
    source_series_uid: String,
    source_slice_count: usize,
}

#[derive(Debug, Clone, Default)]
struct MprExcludedSlices {
    sagittal: BTreeSet<usize>,
    coronal: BTreeSet<usize>,
    axial: BTreeSet<usize>,
}

impl MprExcludedSlices {
    fn for_plane(&self, plane: &str) -> &BTreeSet<usize> {
        match plane {
            "sagittal" => &self.sagittal,
            "coronal" => &self.coronal,
            _ => &self.axial,
        }
    }

    fn insert(&mut self, plane: &str, slice_index: usize) {
        match plane {
            "sagittal" => {
                self.sagittal.insert(slice_index);
            }
            "coronal" => {
                self.coronal.insert(slice_index);
            }
            _ => {
                self.axial.insert(slice_index);
            }
        }
    }

    fn is_empty(&self) -> bool {
        self.sagittal.is_empty() && self.coronal.is_empty() && self.axial.is_empty()
    }
}

#[derive(Debug, Clone)]
struct MprDerivationResult {
    slice_builds: Vec<DerivedSliceBuild>,
    geometry: MprVolumeGeometry,
    plane_asset_counts: BTreeMap<String, usize>,
}

#[derive(Debug, Clone)]
struct MprProgressUpdate {
    phase: String,
    message: String,
    progress_percent: u8,
    completed: usize,
    total: usize,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct ZoneModalityFamilyRecord {
    id: Uuid,
    name: String,
    modality_type: String,
    thumbnail_url: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct ZoneModalityVariantRecord {
    id: Uuid,
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
const MAX_CONCURRENT_MODALITY_INGEST_PIPELINES: usize = 1;
const MAX_CONCURRENT_DICOM_DERIVATIONS: usize = 8;
const AVIF_ENCODER_SPEED: u8 = 8;
const AVIF_ENCODER_QUALITY: u8 = 80;
const AVIF_ENCODER_THREADS_PER_IMAGE: usize = 1;
const MAX_ATLAS_PAGE_EDGE: u32 = 4096;
const MAX_ATLAS_PAGE_COLUMNS: usize = 8;
const MAX_ATLAS_SLICES_PER_PAGE: usize = 40;
const MAX_MPR_VOXELS: usize = 48_000_000;

impl PlaygroundService {
    pub fn new(pool: PgPool, storage_root: impl Into<String>) -> Self {
        Self {
            pool,
            repo: PlaygroundRepository,
            storage_root: PathBuf::from(storage_root.into()),
            events: Arc::new(PlaygroundEventHub::new()),
            ingest_gate: Arc::new(Semaphore::new(MAX_CONCURRENT_MODALITY_INGEST_PIPELINES)),
        }
    }

    pub fn subscribe_zone_modality_events(
        &self,
    ) -> broadcast::Receiver<ZoneModalityListChangedEvent> {
        self.events.zone_modality_events.subscribe()
    }

    /// Background ingest work is process-local. If the API is restarted, any
    /// job left in an active database state no longer has a task that can
    /// complete it. Mark those jobs interrupted at startup so they never sit
    /// at a stale percentage forever or consume ingest capacity indefinitely.
    pub async fn fail_interrupted_ingests_from_previous_runtime(&self) -> Result<u64, AppError> {
        let result = sqlx::query(
            r#"
            WITH interrupted AS (
                UPDATE anatomy_modality_ingest_jobs
                SET
                    status = 'failed',
                    summary_json = jsonb_build_object(
                        'phase', 'interrupted',
                        'message', 'Processing interrupted by API restart. Re-upload the source study.'
                    ),
                    error_message = 'Processing interrupted by API restart.',
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE
                    completed_at IS NULL
                    AND status IN ('queued', 'uploaded', 'validating', 'deriving')
                RETURNING id, modality_id
            )
            UPDATE anatomy_zone_modalities AS modality
            SET
                processing_status = 'failed',
                updated_at = NOW()
            FROM interrupted
            WHERE
                modality.id = interrupted.modality_id
                AND modality.latest_ingest_job_id = interrupted.id
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
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

    pub async fn list_public_zones(&self) -> Result<ZoneListResponse, AppError> {
        let items = self.repo.list_public_zones(&self.pool).await?;

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
    ) -> Result<ZoneModalityFamilyListResponse, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let items = self
            .repo
            .list_zone_modalities(&self.pool, account_id, zone_id)
            .await?;

        Ok(ZoneModalityFamilyListResponse {
            total: items.len(),
            items,
        })
    }

    pub async fn list_public_zone_modalities(
        &self,
        zone_id: Uuid,
    ) -> Result<PublicZoneModalityListResponse, AppError> {
        if !self.repo.public_zone_exists(&self.pool, zone_id).await? {
            return Err(AppError::not_found("Zone was not found"));
        }

        let items = self
            .repo
            .list_public_zone_modalities(&self.pool, zone_id)
            .await?;

        Ok(PublicZoneModalityListResponse {
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

    async fn publish_ingest_progress(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        ingest_job_id: Uuid,
        user_id: &str,
        status: &str,
        summary: serde_json::Value,
    ) -> Result<(), AppError> {
        self.repo
            .update_modality_ingest_job(
                &self.pool,
                ingest_job_id,
                user_id,
                status,
                &summary,
                None,
                false,
            )
            .await?;
        self.notify_zone_modality_list_changed(account_id, zone_id);
        Ok(())
    }

    pub async fn create_zone_modality(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        user_id: &str,
        input: CreateZoneModalityInput,
    ) -> Result<ZoneModality, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let family_id = normalize_optional_uuid(input.family_id, "Modality family id is invalid")?;
        let requested_name = normalize_required_name(&input.name, "Modality name is required")?;
        let requested_modality_type = normalize_modality_type(&input.modality_type)?;
        let cover_image_url = normalize_optional_text(input.cover_image_url);
        let source_kind = normalize_source_kind(input.source_kind)?;
        let source_label = normalize_optional_text(input.source_label);
        let source_file_count = normalize_source_file_count(input.source_file_count)?;
        let processing_status = normalize_processing_status(input.processing_status)?;
        let requested_notes = normalize_optional_text(input.notes);
        let mut tx = self.pool.begin().await?;
        let family = self
            .resolve_modality_family_for_create(
                &mut tx,
                account_id,
                zone_id,
                user_id,
                family_id,
                &requested_name,
                &requested_modality_type,
                cover_image_url.as_deref(),
                requested_notes.as_deref(),
            )
            .await?;
        let slug = self.allocate_modality_slug(zone_id, &family.name).await?;
        let weighting_code = normalize_weighting_code_for_modality_type(
            &family.modality_type,
            input.weighting_code,
        )?;

        let modality = self
            .repo
            .create_zone_modality(
                &mut *tx,
                zone_id,
                family.id,
                user_id,
                &slug,
                &family.name,
                &family.modality_type,
                weighting_code.as_deref(),
                cover_image_url.as_deref(),
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                &processing_status,
                family.notes.as_deref(),
            )
            .await?;

        tx.commit().await?;

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

        let family_id = normalize_optional_uuid(input.family_id, "Modality family id is invalid")?;
        let requested_name = normalize_required_name(&input.name, "Modality name is required")?;
        let requested_modality_type = normalize_modality_type(&input.modality_type)?;
        let source_kind = normalize_source_kind(Some(input.source_kind.clone()))?;

        if source_kind == "manual" {
            return Err(AppError::bad_request(
                "Use a ZIP package or DICOM files for study intake.",
            ));
        }

        let source_label = normalize_optional_text(input.source_label);
        let requested_notes = normalize_optional_text(input.notes);
        let requested_thumbnail_url = normalize_optional_text(input.thumbnail_url);
        let source_file_count = normalize_source_file_count(
            input.source_file_count.or(Some(input.files.len() as i32)),
        )?;
        let mut tx = self.pool.begin().await?;
        let family = self
            .resolve_modality_family_for_create(
                &mut tx,
                account_id,
                zone_id,
                user_id,
                family_id,
                &requested_name,
                &requested_modality_type,
                requested_thumbnail_url.as_deref(),
                requested_notes.as_deref(),
            )
            .await?;
        let slug = self.allocate_modality_slug(zone_id, &family.name).await?;
        let weighting_code = normalize_weighting_code_for_modality_type(
            &family.modality_type,
            input.weighting_code,
        )?;

        let modality = self
            .repo
            .create_zone_modality(
                &mut *tx,
                zone_id,
                family.id,
                user_id,
                &slug,
                &family.name,
                &family.modality_type,
                weighting_code.as_deref(),
                family.thumbnail_url.as_deref(),
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                "processing",
                family.notes.as_deref(),
            )
            .await?;

        tx.commit().await?;

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
                    "message": "Waiting for processing slot.",
                    "progressPercent": 0,
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
        let background_modality_type = family.modality_type.clone();
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
                    background_modality_type,
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
        modality_type: String,
        files: Vec<UploadedSourceFile>,
    ) -> Result<(), AppError> {
        // DICOM derivation, MPR resampling, PNG/AVIF encoding and atlas packing
        // are CPU/disk intensive. Running two study pipelines at the same time
        // made one study appear frozen while the other saturated local
        // resources. Keep intake asynchronous, but execute heavy pipelines in
        // a deterministic single-file queue.
        let _ingest_permit = self
            .ingest_gate
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| AppError::internal("Modality ingest scheduler is unavailable"))?;

        let uploaded_file_count = i32::try_from(files.len()).unwrap_or(i32::MAX);

        let pipeline_result = async {
            self.publish_ingest_progress(
                account_id,
                zone_id,
                ingest_job_id,
                &user_id,
                "uploaded",
                json!({
                    "phase": "uploaded",
                    "message": "Upload complete. Preparing source files.",
                    "progressPercent": 3,
                    "uploadedFileCount": uploaded_file_count,
                }),
            )
            .await?;

            let (_source_assets, study_files) = self
                .stage_study_files(modality_id, ingest_job_id, &user_id, &source_kind, files)
                .await?;

            self.publish_ingest_progress(
                account_id,
                zone_id,
                ingest_job_id,
                &user_id,
                "validating",
                json!({
                    "phase": "validating",
                    "message": "Validating DICOM study geometry.",
                    "progressPercent": 8,
                    "stagedFileCount": study_files.len(),
                }),
            )
            .await?;

            let (derived_slice_builds, mpr_geometry, mpr_plane_counts) =
                if modality_type == "mpr" {
                    let mpr = self
                        .derive_mpr_slices(
                            account_id,
                            zone_id,
                            ingest_job_id,
                            &user_id,
                            &study_files,
                        )
                        .await?;
                    (mpr.slice_builds, Some(mpr.geometry), Some(mpr.plane_asset_counts))
                } else {
                    (
                        self.derive_study_slices(ingest_job_id, &study_files).await?,
                        None,
                        None,
                    )
                };

            if derived_slice_builds.is_empty() {
                return Err(AppError::bad_request(
                    "The uploaded study did not produce any viewable DICOM slices.",
                ));
            }

            self.publish_ingest_progress(
                account_id,
                zone_id,
                ingest_job_id,
                &user_id,
                "deriving",
                json!({
                    "phase": "persisting_slices",
                    "message": "Saving reconstructed slices.",
                    "progressPercent": if modality_type == "mpr" { 82 } else { 70 },
                    "derivedSliceCount": derived_slice_builds.len(),
                }),
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
                        if modality_type == "mpr" { "derived_slice" } else { "slice" },
                        derived_slice.weighting_code.as_deref(),
                        &image_url,
                        None,
                        sort_order as i32,
                        None,
                        "local_disk",
                        &derived_slice.storage_key,
                        &derived_slice.checksum,
                        infer_derived_mime_type(&derived_slice.storage_key),
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

                if sort_order + 1 == derived_slice_builds.len()
                    || (sort_order + 1) % 50 == 0
                {
                    let completed = sort_order + 1;
                    let total = derived_slice_builds.len();
                    let base = if modality_type == "mpr" { 82.0 } else { 70.0 };
                    let span = if modality_type == "mpr" { 8.0 } else { 15.0 };
                    let percent = base + span * (completed as f64 / total.max(1) as f64);
                    self.publish_ingest_progress(
                        account_id,
                        zone_id,
                        ingest_job_id,
                        &user_id,
                        "deriving",
                        json!({
                            "phase": "persisting_slices",
                            "message": format!("Saving slices {completed}/{total}."),
                            "progressPercent": percent.round() as u8,
                            "completed": completed,
                            "total": total,
                            "derivedSliceCount": total,
                        }),
                    )
                    .await?;
                }
            }

            self.publish_ingest_progress(
                account_id,
                zone_id,
                ingest_job_id,
                &user_id,
                "deriving",
                json!({
                    "phase": "building_atlas",
                    "message": "Building viewer atlas pages.",
                    "progressPercent": if modality_type == "mpr" { 91 } else { 87 },
                    "derivedSliceCount": derived_slice_builds.len(),
                }),
            )
            .await?;

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

            self.publish_ingest_progress(
                account_id,
                zone_id,
                ingest_job_id,
                &user_id,
                "deriving",
                json!({
                    "phase": "finalizing",
                    "message": "Finalizing viewer manifest.",
                    "progressPercent": 98,
                    "derivedSliceCount": persisted_assets.len(),
                    "atlasPageCount": atlas_pages.len(),
                }),
            )
            .await?;

            let (manifest_schema_version, manifest_json) = if let Some(geometry) = mpr_geometry.as_ref() {
                (
                    "mpr-1",
                    build_mpr_viewer_manifest_json(
                        &persisted_assets,
                        &atlas_pages,
                        &atlas_frames,
                        geometry,
                        mpr_plane_counts.as_ref(),
                    ),
                )
            } else {
                (
                    "draft-1",
                    build_viewer_manifest_json(&persisted_assets, &atlas_pages, &atlas_frames),
                )
            };

            self.repo
                .upsert_modality_viewer_manifest(
                    &self.pool,
                    modality_id,
                    ingest_job_id,
                    manifest_schema_version,
                    &manifest_json,
                )
                .await?;

            let cover_asset = if modality_type == "mpr" {
                mpr_geometry.as_ref().and_then(|geometry| {
                    let middle = i32::try_from(geometry.dimensions[2] / 2).unwrap_or(i32::MAX);
                    persisted_assets.iter().find(|asset| {
                        asset.orientation_code.as_deref() == Some("axial")
                            && asset.slice_index == Some(middle)
                    })
                })
            } else {
                persisted_assets.first()
            };
            let cover_image_url = cover_asset.and_then(|asset| {
                asset
                    .thumbnail_url
                    .clone()
                    .or_else(|| Some(asset.image_url.clone()))
            });

            self.repo
                .update_modality_ingest_job(
                    &self.pool,
                    ingest_job_id,
                    &user_id,
                    "ready_for_edit",
                    &json!({
                        "phase": "ready_for_edit",
                        "message": "Viewer ready.",
                        "progressPercent": 100,
                        "seriesCount": count_distinct_series(&persisted_assets),
                        "derivedSliceCount": persisted_assets.len(),
                    }),
                    None,
                    true,
                )
                .await?;

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

            Ok(())
        }
        .await;

        match pipeline_result {
            Ok(()) => Ok(()),
            Err(error) => {
                let _ = self
                    .repo
                    .update_modality_ingest_job(
                        &self.pool,
                        ingest_job_id,
                        &user_id,
                        "failed",
                        &json!({
                            "phase": "failed",
                            "message": error.to_string(),
                        }),
                        Some(&error.to_string()),
                        true,
                    )
                    .await;
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
        let weighting_code =
            normalize_weighting_code_for_modality_type(&modality_type, input.weighting_code)?;
        let cover_image_url = normalize_optional_text(input.cover_image_url);
        let source_kind = normalize_source_kind(input.source_kind)?;
        let source_label = normalize_optional_text(input.source_label);
        let source_file_count = normalize_source_file_count(input.source_file_count)?;
        let processing_status = normalize_processing_status(input.processing_status)?;
        let notes = normalize_optional_text(input.notes);
        let current_modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;
        let family_id = Uuid::parse_str(&current_modality.family_id)
            .map_err(|_| AppError::internal("Modality family id is invalid"))?;
        let mut tx = self.pool.begin().await?;

        self.update_modality_family_shared_fields(
            &mut tx,
            family_id,
            user_id,
            &name,
            &modality_type,
            current_modality.cover_image_url.as_deref(),
            notes.as_deref(),
        )
        .await?;

        sqlx::query(
            r#"
            UPDATE anatomy_zone_modalities AS modality
            SET
                weighting_code = $4,
                cover_image_url = $5,
                source_kind = $6,
                source_label = $7,
                source_file_count = $8,
                processing_status = $9,
                updated_by_user_id = $10,
                updated_at = NOW()
            FROM anatomy_zone_modality_families AS family
            INNER JOIN anatomy_zones AS zone ON zone.id = family.zone_id
            WHERE
                zone.account_id = $1
                AND family.zone_id = $2
                AND family.id = $3
                AND modality.id = $11
                AND modality.family_id = family.id
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(family_id)
        .bind(weighting_code.as_deref())
        .bind(cover_image_url.as_deref())
        .bind(&source_kind)
        .bind(source_label.as_deref())
        .bind(source_file_count)
        .bind(&processing_status)
        .bind(user_id)
        .bind(modality_id)
        .execute(tx.as_mut())
        .await?;

        tx.commit().await?;
        let modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
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
        let current_modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;

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

        let family_id = Uuid::parse_str(&current_modality.family_id)
            .map_err(|_| AppError::internal("Modality family id is invalid"))?;
        self.delete_orphan_modality_family(family_id).await?;

        for ingest_job_id in ingest_job_ids {
            self.cleanup_ingest_storage(ingest_job_id).await;
        }

        self.notify_zone_modality_list_changed(account_id, zone_id);

        Ok(())
    }

    pub async fn update_zone_modality_family(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        family_id: Uuid,
        user_id: &str,
        input: UpdateZoneModalityFamilyInput,
    ) -> Result<ZoneModalityFamily, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let name = normalize_required_name(&input.name, "Modality name is required")?;
        let modality_type = normalize_modality_type(&input.modality_type)?;
        let thumbnail_url = normalize_optional_text(input.thumbnail_url);
        let notes = normalize_optional_text(input.notes);
        let mut variant_weightings = BTreeMap::new();

        for variant in input.variants {
            let modality_id = Uuid::parse_str(&variant.modality_id)
                .map_err(|_| AppError::bad_request("Variant modality id is invalid"))?;
            let weighting_code =
                normalize_weighting_code_for_modality_type(&modality_type, variant.weighting_code)?;
            variant_weightings.insert(modality_id, weighting_code);
        }

        let mut tx = self.pool.begin().await?;
        let family = self
            .load_modality_family_for_update(&mut tx, account_id, zone_id, family_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality family was not found"))?;
        let variant_ids = self
            .list_modality_family_variant_ids(&mut tx, account_id, zone_id, family_id)
            .await?;

        for modality_id in variant_weightings.keys() {
            if !variant_ids.iter().any(|current| current == modality_id) {
                return Err(AppError::bad_request(
                    "One or more variant ids do not belong to this modality family.",
                ));
            }
        }

        if family.name != name
            || family.modality_type != modality_type
            || family.thumbnail_url != thumbnail_url
            || family.notes != notes
        {
            self.update_modality_family_shared_fields(
                &mut tx,
                family_id,
                user_id,
                &name,
                &modality_type,
                thumbnail_url.as_deref(),
                notes.as_deref(),
            )
            .await?;
        }

        for (modality_id, weighting_code) in variant_weightings {
            sqlx::query(
                r#"
                UPDATE anatomy_zone_modalities AS modality
                SET
                    weighting_code = $4,
                    updated_by_user_id = $5,
                    updated_at = NOW()
                FROM anatomy_zone_modality_families AS family
                INNER JOIN anatomy_zones AS zone ON zone.id = family.zone_id
                WHERE
                    zone.account_id = $1
                    AND family.zone_id = $2
                    AND family.id = $3
                    AND modality.family_id = family.id
                    AND modality.id = $6
                "#,
            )
            .bind(account_id)
            .bind(zone_id)
            .bind(family_id)
            .bind(weighting_code.as_deref())
            .bind(user_id)
            .bind(modality_id)
            .execute(tx.as_mut())
            .await?;
        }

        tx.commit().await?;
        self.notify_zone_modality_list_changed(account_id, zone_id);

        let updated_family = self
            .repo
            .list_zone_modalities(&self.pool, account_id, zone_id)
            .await?
            .into_iter()
            .find(|current| current.id == family_id.to_string())
            .ok_or_else(|| AppError::not_found("Modality family was not found"))?;

        Ok(updated_family)
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
        let modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;

        let label = normalize_required_name(&input.label, "Asset label is required")?;
        let asset_kind = normalize_asset_kind(input.asset_kind)?;
        let weighting_code = normalize_weighting_code_for_modality_type(
            &modality.modality_type,
            input.weighting_code,
        )?;
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
        let modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;

        let label = normalize_required_name(&input.label, "Asset label is required")?;
        let asset_kind = normalize_asset_kind(input.asset_kind)?;
        let weighting_code = normalize_weighting_code_for_modality_type(
            &modality.modality_type,
            input.weighting_code,
        )?;
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

    pub async fn delete_mpr_zone_modality_assets(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: DeleteZoneModalityAssetsInput,
    ) -> Result<DeleteZoneModalityAssetsResponse, AppError> {
        let modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;

        if modality.modality_type != "mpr" {
            return Err(AppError::bad_request(
                "Synchronized MPR volume editing is only available for MPR modalities",
            ));
        }

        if input.asset_ids.is_empty() {
            return Err(AppError::bad_request("At least one MPR slice is required"));
        }

        let mut requested_ids = BTreeSet::new();
        for asset_id in input.asset_ids {
            let parsed = Uuid::parse_str(&asset_id)
                .map_err(|_| AppError::bad_request("Asset id is invalid"))?;
            requested_ids.insert(parsed);
        }

        let assets_before = self
            .repo
            .list_zone_modality_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let asset_by_id = assets_before
            .iter()
            .filter_map(|asset| Uuid::parse_str(&asset.id).ok().map(|id| (id, asset)))
            .collect::<BTreeMap<_, _>>();

        let (schema_version, mut manifest_json) = self
            .repo
            .get_modality_viewer_manifest_payload(&self.pool, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("MPR viewer manifest was not found"))?;
        if schema_version != "mpr-1" {
            return Err(AppError::bad_request("MPR viewer manifest is invalid"));
        }

        let dimensions = manifest_json
            .get("volume")
            .and_then(|volume| volume.get("dimensions"))
            .and_then(|value| value.as_array())
            .filter(|values| values.len() == 3)
            .and_then(|values| {
                Some([
                    usize::try_from(values[0].as_u64()?).ok()?,
                    usize::try_from(values[1].as_u64()?).ok()?,
                    usize::try_from(values[2].as_u64()?).ok()?,
                ])
            })
            .ok_or_else(|| AppError::bad_request("MPR volume geometry is invalid"))?;

        let mut excluded_slices = parse_mpr_excluded_slices(&manifest_json);
        let mut requested_slice_ids = Vec::new();
        for requested_id in &requested_ids {
            let asset = asset_by_id.get(requested_id).ok_or_else(|| {
                AppError::bad_request(
                    "One or more requested MPR slices do not belong to this modality",
                )
            })?;
            let plane = asset.orientation_code.as_deref().ok_or_else(|| {
                AppError::bad_request("Requested asset is not an MPR plane slice")
            })?;
            if !matches!(plane, "axial" | "coronal" | "sagittal") {
                return Err(AppError::bad_request(
                    "Requested asset is not an axial, coronal, or sagittal MPR slice",
                ));
            }
            let slice_index = asset
                .slice_index
                .and_then(|value| usize::try_from(value).ok())
                .ok_or_else(|| AppError::bad_request("MPR slice index is invalid"))?;
            let axis_limit = match plane {
                "sagittal" => dimensions[0],
                "coronal" => dimensions[1],
                _ => dimensions[2],
            };
            if slice_index >= axis_limit {
                return Err(AppError::bad_request("MPR slice is outside the volume geometry"));
            }
            excluded_slices.insert(plane, slice_index);
            requested_slice_ids.push(*requested_id);
        }

        for (plane, dimension) in [
            ("sagittal", dimensions[0]),
            ("coronal", dimensions[1]),
            ("axial", dimensions[2]),
        ] {
            if excluded_slices.for_plane(plane).len() >= dimension {
                return Err(AppError::bad_request(format!(
                    "At least one {plane} MPR slice must remain"
                )));
            }
        }

        // Never silently destroy annotations while changing the volume. MPR
        // editing should normally happen before labeling; if an explicitly
        // removed plane already owns annotations, require the editor to move
        // or remove those annotations first.
        let annotations = self
            .repo
            .list_viewer_annotations(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let requested_string_ids = requested_ids
            .iter()
            .map(|value| value.to_string())
            .collect::<BTreeSet<_>>();
        if annotations
            .iter()
            .any(|annotation| requested_string_ids.contains(&annotation.asset_id))
        {
            return Err(AppError::bad_request(
                "This MPR slice contains annotations. Move or remove those annotations before excluding the slice from the volume.",
            ));
        }

        let ingest_job_id = assets_before
            .iter()
            .find_map(|asset| {
                asset
                    .ingest_job_id
                    .as_deref()
                    .and_then(|value| Uuid::parse_str(value).ok())
            })
            .ok_or_else(|| AppError::not_found("Ingest job was not found"))?;

        let study_files = self.load_existing_mpr_study_files(ingest_job_id).await?;
        let edit_root = self
            .storage_root
            .join("playground")
            .join("derived")
            .join(ingest_job_id.to_string())
            .join(format!("mpr-edit-{}", Uuid::new_v4()));
        fs::create_dir_all(&edit_root).await.map_err(|error| {
            AppError::internal(format!("Unable to create MPR edit workspace: {error}"))
        })?;

        let storage_root = self.storage_root.clone();
        let edit_root_for_task = edit_root.clone();
        let study_files_for_task = study_files.clone();
        let excluded_for_task = excluded_slices.clone();
        let (progress_tx, _progress_rx) = mpsc::unbounded_channel::<MprProgressUpdate>();
        let derivation = tokio::task::spawn_blocking(move || {
            derive_mpr_volume_and_slices(
                &storage_root,
                &edit_root_for_task,
                &study_files_for_task,
                Some(&excluded_for_task),
                &progress_tx,
            )
        })
        .await
        .map_err(|error| AppError::internal(format!("MPR edit task failed: {error}")))?
        .map_err(|error| AppError::bad_request(format!("Unable to rebuild edited MPR volume: {error}")))?;

        // The exclusion model preserves the original patient-space dimensions.
        // A deleted plane becomes absent from that plane's filmstrip while the
        // same physical slab is zeroed inside both orthogonal reconstructions.
        // This avoids the geometrically incorrect behavior of deleting an
        // unrelated ordinal slice from each of the other planes.
        if derivation.geometry.dimensions != dimensions {
            let _ = fs::remove_dir_all(&edit_root).await;
            return Err(AppError::internal(
                "Edited MPR reconstruction changed the volume dimensions unexpectedly",
            ));
        }

        let mut builds_by_plane_index = BTreeMap::<(String, i32), DerivedSliceBuild>::new();
        for build in derivation.slice_builds {
            let plane = build
                .candidate
                .orientation_code
                .clone()
                .unwrap_or_default();
            builds_by_plane_index.insert((plane, build.candidate.slice_index), build);
        }

        let remaining_assets = assets_before
            .iter()
            .filter(|asset| {
                Uuid::parse_str(&asset.id)
                    .map(|asset_id| !requested_ids.contains(&asset_id))
                    .unwrap_or(true)
            })
            .cloned()
            .collect::<Vec<_>>();

        // Regenerate every surviving MPR plane image into a temporary
        // workspace, then atomically replace the existing file contents while
        // retaining the same asset IDs. Keeping IDs stable preserves pointers,
        // regions, links, and any other metadata attached to surviving slices.
        for asset in remaining_assets.iter().filter(|asset| {
            asset.asset_kind == "derived_slice"
                && matches!(
                    asset.orientation_code.as_deref(),
                    Some("axial") | Some("coronal") | Some("sagittal")
                )
        }) {
            let plane = asset.orientation_code.clone().unwrap_or_default();
            let slice_index = asset.slice_index.ok_or_else(|| {
                AppError::internal("Stored MPR slice is missing its physical slice index")
            })?;
            let build = builds_by_plane_index
                .get(&(plane.clone(), slice_index))
                .ok_or_else(|| {
                    AppError::internal(format!(
                        "Rebuilt MPR volume is missing {plane} slice {slice_index}"
                    ))
                })?;
            let generated_path = self.storage_root.join(&build.candidate.storage_key);
            let storage_key = asset.storage_key.as_deref().ok_or_else(|| {
                AppError::internal("Stored MPR slice file is unavailable")
            })?;
            let existing_path = self.storage_root.join(storage_key);
            let bytes = fs::read(&generated_path).await.map_err(|error| {
                AppError::internal(format!("Unable to read rebuilt MPR slice: {error}"))
            })?;
            if let Some(parent) = existing_path.parent() {
                fs::create_dir_all(parent).await.map_err(|error| {
                    AppError::internal(format!("Unable to prepare MPR slice directory: {error}"))
                })?;
            }
            fs::write(&existing_path, &bytes).await.map_err(|error| {
                AppError::internal(format!("Unable to replace edited MPR slice: {error}"))
            })?;

            if let Ok(asset_id) = Uuid::parse_str(&asset.id) {
                self.repo
                    .update_zone_modality_asset_binary_metadata(
                        &self.pool,
                        asset_id,
                        &build.candidate.checksum,
                        build.candidate.size_bytes,
                        build.candidate.width,
                        build.candidate.height,
                    )
                    .await?;
            }
        }

        let packed_pages = self
            .build_atlas_pages(ingest_job_id, &remaining_assets)
            .await?;
        let old_atlas_assets = self
            .repo
            .list_zone_modality_atlas_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let old_atlas_ids = old_atlas_assets
            .iter()
            .filter_map(|asset| Uuid::parse_str(&asset.id).ok())
            .collect::<Vec<_>>();

        let requested_count = requested_slice_ids.len();
        let deleted_count = self
            .repo
            .delete_zone_modality_assets(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                &requested_slice_ids,
            )
            .await? as usize;

        if !old_atlas_ids.is_empty() {
            self.repo
                .delete_zone_modality_assets(
                    &self.pool,
                    account_id,
                    zone_id,
                    modality_id,
                    &old_atlas_ids,
                )
                .await?;
        }

        let (atlas_pages, atlas_frames) = self
            .persist_built_atlas_pages(modality_id, ingest_job_id, user_id, packed_pages)
            .await?;

        for plane in ["axial", "coronal", "sagittal"] {
            let mut plane_assets = remaining_assets
                .iter()
                .filter(|asset| asset.orientation_code.as_deref() == Some(plane))
                .collect::<Vec<_>>();
            plane_assets.sort_by_key(|asset| asset.slice_index.unwrap_or(i32::MAX));

            if let Some(plane_json) = manifest_json
                .get_mut("planes")
                .and_then(|planes| planes.get_mut(plane))
            {
                plane_json["sliceCount"] = json!(plane_assets.len());
                plane_json["assetIds"] = json!(
                    plane_assets
                        .iter()
                        .map(|asset| asset.id.clone())
                        .collect::<Vec<_>>()
                );
            }
        }

        manifest_json["excludedSlices"] = mpr_excluded_slices_json(&excluded_slices);
        manifest_json["atlases"] = json!(atlas_pages);
        manifest_json["atlasFrames"] = json!(atlas_frames);

        self.repo
            .upsert_modality_viewer_manifest(
                &self.pool,
                modality_id,
                ingest_job_id,
                "mpr-1",
                &manifest_json,
            )
            .await?;

        let mut axial_assets = remaining_assets
            .iter()
            .filter(|asset| asset.orientation_code.as_deref() == Some("axial"))
            .collect::<Vec<_>>();
        axial_assets.sort_by_key(|asset| asset.slice_index.unwrap_or(i32::MAX));
        let cover_image_url = axial_assets
            .get(axial_assets.len() / 2)
            .and_then(|asset| asset.thumbnail_url.as_deref().or(Some(asset.image_url.as_str())));
        self.repo
            .attach_ingest_job_to_modality(
                &self.pool,
                modality_id,
                ingest_job_id,
                user_id,
                "ready",
                cover_image_url,
            )
            .await?;

        let _ = fs::remove_dir_all(&edit_root).await;

        Ok(DeleteZoneModalityAssetsResponse {
            requested_count,
            deleted_count,
        })
    }

    pub async fn reorder_zone_modality_assets(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: ReorderZoneModalityAssetsInput,
    ) -> Result<ReorderZoneModalityAssetsResponse, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let mut updates = BTreeMap::new();

        for update in input.updates {
            let asset_id = Uuid::parse_str(&update.asset_id)
                .map_err(|_| AppError::bad_request("Asset id is invalid"))?;
            let sort_order = normalize_sort_order(Some(update.sort_order))?;

            updates.insert(asset_id, sort_order);
        }

        let requested_count = updates.len();

        if requested_count == 0 {
            return Ok(ReorderZoneModalityAssetsResponse {
                requested_count: 0,
                updated_count: 0,
            });
        }

        let (asset_ids, sort_orders): (Vec<_>, Vec<_>) = updates.into_iter().unzip();
        let result = sqlx::query(
            r#"
            WITH requested_updates(asset_id, sort_order) AS (
                SELECT * FROM UNNEST($4::uuid[], $5::integer[])
            )
            UPDATE anatomy_zone_modality_assets AS asset
            SET
                sort_order = requested_updates.sort_order,
                updated_by_user_id = $6,
                updated_at = NOW()
            FROM requested_updates,
                anatomy_zone_modalities AS modality
                INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
            WHERE
                zone.account_id = $1
                AND modality.zone_id = $2
                AND modality.id = $3
                AND asset.id = requested_updates.asset_id
                AND asset.modality_id = modality.id
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(modality_id)
        .bind(asset_ids)
        .bind(sort_orders)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        let updated_count = result.rows_affected() as usize;

        Ok(ReorderZoneModalityAssetsResponse {
            requested_count,
            updated_count,
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
        let modality_variants = self
            .repo
            .list_zone_modalities(&self.pool, account_id, zone_id)
            .await?
            .into_iter()
            .find(|family| family.id == modality.family_id)
            .map(|family| family.variants)
            .unwrap_or_else(|| vec![modality.clone()]);
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
        let viewer_manifest_payload = self
            .repo
            .get_modality_viewer_manifest_payload(&self.pool, modality_id)
            .await?;
        let (viewer_schema_version, viewer_spec) = viewer_manifest_payload
            .map(|(schema_version, spec)| (Some(schema_version), Some(spec)))
            .unwrap_or((None, None));
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
            modality_variants,
            ingest_job,
            source_assets,
            assets,
            atlases,
            atlas_frames,
            viewer_schema_version,
            viewer_spec,
            structure_groups,
            structures,
            annotations,
        })
    }

    pub async fn get_public_zone_modality_viewer_manifest(
        &self,
        zone_slug: &str,
        modality_slug: &str,
    ) -> Result<ZoneModalityViewerManifest, AppError> {
        let lookup = self
            .repo
            .get_public_zone_modality_lookup_by_slugs(&self.pool, zone_slug, modality_slug)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;

        let zone = self
            .get_zone_detail(lookup.account_id, lookup.zone_id)
            .await?;
        let modality = self
            .repo
            .get_zone_modality_detail(
                &self.pool,
                lookup.account_id,
                lookup.zone_id,
                lookup.modality_id,
            )
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;
        let mut modality_variants = self
            .repo
            .list_zone_modalities(&self.pool, lookup.account_id, lookup.zone_id)
            .await?
            .into_iter()
            .find(|family| family.id == modality.family_id)
            .map(|family| family.variants)
            .unwrap_or_else(|| vec![modality.clone()]);
        modality_variants
            .retain(|variant| variant.processing_status == "ready" || variant.id == modality.id);
        if modality_variants.is_empty() {
            modality_variants.push(modality.clone());
        }
        let assets = self
            .repo
            .list_zone_modality_assets(
                &self.pool,
                lookup.account_id,
                lookup.zone_id,
                lookup.modality_id,
            )
            .await?
            .into_iter()
            .map(rewrite_public_viewer_asset_urls)
            .collect::<Vec<_>>();
        let atlas_assets = self
            .repo
            .list_zone_modality_atlas_assets(
                &self.pool,
                lookup.account_id,
                lookup.zone_id,
                lookup.modality_id,
            )
            .await?;
        let (atlases, atlas_frames) = self.load_atlas_manifest(&atlas_assets)?;
        let viewer_manifest_payload = self
            .repo
            .get_modality_viewer_manifest_payload(&self.pool, lookup.modality_id)
            .await?;
        let (viewer_schema_version, viewer_spec) = viewer_manifest_payload
            .map(|(schema_version, spec)| (Some(schema_version), Some(spec)))
            .unwrap_or((None, None));
        let structure_groups = self
            .repo
            .list_viewer_structure_groups(
                &self.pool,
                lookup.account_id,
                lookup.zone_id,
                lookup.modality_id,
            )
            .await?;
        let mut structures = self
            .repo
            .list_viewer_structures(
                &self.pool,
                lookup.account_id,
                lookup.zone_id,
                lookup.modality_id,
            )
            .await?;
        // Subscription descriptions are never an anonymous API payload, even if
        // an older editing path still stores them on the structure itself.
        for structure in &mut structures {
            if structure.access_level != "free" {
                structure.short_description = None;
                structure.long_description = None;
                structure.learning_points.clear();
            }
        }
        let annotations = self
            .repo
            .list_viewer_annotations(
                &self.pool,
                lookup.account_id,
                lookup.zone_id,
                lookup.modality_id,
            )
            .await?;

        Ok(ZoneModalityViewerManifest {
            zone,
            modality,
            modality_variants,
            ingest_job: None,
            source_assets: Vec::new(),
            assets,
            atlases: atlases
                .into_iter()
                .map(|atlas| ZoneModalityAtlasPage {
                    image_url: public_derived_asset_url(&atlas.id),
                    ..atlas
                })
                .collect(),
            atlas_frames,
            viewer_schema_version,
            viewer_spec,
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
        let icon_name = normalize_optional_text(input.icon_name);
        let thumbnail_url = normalize_optional_text(input.thumbnail_url);
        if thumbnail_url.is_none() {
            return Err(AppError::bad_request(
                "Anatomical area thumbnail is required",
            ));
        }
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
                icon_name.as_deref(),
                thumbnail_url.as_deref(),
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
        let icon_name = normalize_optional_text(input.icon_name);
        let thumbnail_url = normalize_optional_text(input.thumbnail_url);
        if thumbnail_url.is_none() {
            return Err(AppError::bad_request(
                "Anatomical area thumbnail is required",
            ));
        }
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
                icon_name.as_deref(),
                thumbnail_url.as_deref(),
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
        let color_hex = normalize_color_hex(input.color_hex, "#6468f0");
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
                &color_hex,
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
        let color_hex = normalize_color_hex(input.color_hex, "#6468f0");
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
                &color_hex,
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

    pub async fn get_public_derived_asset_binary(
        &self,
        asset_id: Uuid,
        variant: DerivedAssetBinaryVariant,
    ) -> Result<(Vec<u8>, String), AppError> {
        let account_id = self
            .repo
            .get_public_zone_modality_asset_account_id(&self.pool, asset_id)
            .await?
            .ok_or_else(|| AppError::not_found("Derived asset was not found"))?;

        self.get_derived_asset_binary(account_id, asset_id, variant)
            .await
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
            let study_files = extract_zip_study(&final_path, &extracted_root).await?;

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

    async fn load_existing_mpr_study_files(
        &self,
        ingest_job_id: Uuid,
    ) -> Result<Vec<PreparedStudyFile>, AppError> {
        let storage_root = self.storage_root.clone();
        tokio::task::spawn_blocking(move || -> Result<Vec<PreparedStudyFile>, AppError> {
            let expanded_root = storage_root
                .join("playground")
                .join("expanded")
                .join(ingest_job_id.to_string());
            let source_root = storage_root
                .join("playground")
                .join("source")
                .join(ingest_job_id.to_string());

            let mut files = Vec::new();
            if expanded_root.exists() {
                collect_study_files_recursive(&expanded_root, &expanded_root, &mut files)?;
            }
            if files.is_empty() && source_root.exists() {
                collect_study_files_recursive(&source_root, &source_root, &mut files)?;
            }

            if files.is_empty() {
                return Err(AppError::not_found(
                    "Original DICOM source files are unavailable for MPR volume editing",
                ));
            }

            Ok(files)
        })
        .await
        .map_err(|error| AppError::internal(format!("MPR source scan task failed: {error}")))?
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

    async fn derive_mpr_slices(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        ingest_job_id: Uuid,
        user_id: &str,
        study_files: &[PreparedStudyFile],
    ) -> Result<MprDerivationResult, AppError> {
        let derived_root = self
            .storage_root
            .join("playground")
            .join("derived")
            .join(ingest_job_id.to_string())
            .join("mpr");
        fs::create_dir_all(&derived_root).await.map_err(|error| {
            AppError::internal(format!("Unable to create MPR derived directory: {error}"))
        })?;

        let storage_root = self.storage_root.clone();
        let study_files = study_files.to_vec();
        let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<MprProgressUpdate>();
        let progress_service = self.clone();
        let progress_user_id = user_id.to_string();

        let progress_task = tokio::spawn(async move {
            let mut last_percent = 0u8;
            while let Some(progress) = progress_rx.recv().await {
                // Multiple CPU workers can finish at nearly the same time. Never
                // let a delayed worker make the visible percentage move backwards.
                if progress.progress_percent < last_percent {
                    continue;
                }
                last_percent = progress.progress_percent;

                let summary = json!({
                    "phase": progress.phase,
                    "message": progress.message,
                    "progressPercent": progress.progress_percent,
                    "completed": progress.completed,
                    "total": progress.total,
                });

                if let Err(error) = progress_service
                    .publish_ingest_progress(
                        account_id,
                        zone_id,
                        ingest_job_id,
                        &progress_user_id,
                        "deriving",
                        summary,
                    )
                    .await
                {
                    error!(%ingest_job_id, ?error, "unable to publish MPR progress");
                }
            }
        });

        let derivation = tokio::task::spawn_blocking(move || {
            derive_mpr_volume_and_slices(
                &storage_root,
                &derived_root,
                &study_files,
                None,
                &progress_tx,
            )
        })
        .await
        .map_err(|error| AppError::internal(format!("MPR derivation task failed: {error}")))?
        .map_err(|error| AppError::bad_request(format!("Unable to reconstruct MPR volume: {error}")));

        let _ = progress_task.await;
        derivation
    }

    async fn load_modality_family_for_update(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        account_id: Uuid,
        zone_id: Uuid,
        family_id: Uuid,
    ) -> Result<Option<ZoneModalityFamilyRecord>, AppError> {
        let family = sqlx::query_as::<_, ZoneModalityFamilyRecord>(
            r#"
            SELECT
                family.id,
                family.name,
                family.modality_type,
                family.thumbnail_url,
                family.notes
            FROM anatomy_zone_modality_families AS family
            INNER JOIN anatomy_zones AS zone ON zone.id = family.zone_id
            WHERE
                zone.account_id = $1
                AND family.zone_id = $2
                AND family.id = $3
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(family_id)
        .fetch_optional(tx.as_mut())
        .await?;

        Ok(family)
    }

    async fn list_modality_family_variant_ids(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        account_id: Uuid,
        zone_id: Uuid,
        family_id: Uuid,
    ) -> Result<Vec<Uuid>, AppError> {
        let variant_ids = sqlx::query_as::<_, ZoneModalityVariantRecord>(
            r#"
            SELECT modality.id
            FROM anatomy_zone_modalities AS modality
            INNER JOIN anatomy_zone_modality_families AS family ON family.id = modality.family_id
            INNER JOIN anatomy_zones AS zone ON zone.id = family.zone_id
            WHERE
                zone.account_id = $1
                AND family.zone_id = $2
                AND family.id = $3
            ORDER BY modality.updated_at DESC, modality.created_at ASC
            "#,
        )
        .bind(account_id)
        .bind(zone_id)
        .bind(family_id)
        .fetch_all(tx.as_mut())
        .await?;

        Ok(variant_ids.into_iter().map(|variant| variant.id).collect())
    }

    async fn find_modality_family_by_identity(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        zone_id: Uuid,
        name: &str,
        modality_type: &str,
    ) -> Result<Option<ZoneModalityFamilyRecord>, AppError> {
        let family = sqlx::query_as::<_, ZoneModalityFamilyRecord>(
            r#"
            SELECT
                id,
                name,
                modality_type,
                thumbnail_url,
                notes
            FROM anatomy_zone_modality_families
            WHERE
                zone_id = $1
                AND modality_type = $2
                AND lower(trim(name)) = lower(trim($3))
            LIMIT 1
            "#,
        )
        .bind(zone_id)
        .bind(modality_type)
        .bind(name)
        .fetch_optional(tx.as_mut())
        .await?;

        Ok(family)
    }

    async fn create_modality_family(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        zone_id: Uuid,
        user_id: &str,
        name: &str,
        modality_type: &str,
        thumbnail_url: Option<&str>,
        notes: Option<&str>,
    ) -> Result<ZoneModalityFamilyRecord, AppError> {
        let family = sqlx::query_as::<_, ZoneModalityFamilyRecord>(
            r#"
            INSERT INTO anatomy_zone_modality_families (
                zone_id,
                name,
                modality_type,
                thumbnail_url,
                notes,
                created_by_user_id,
                updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $6)
            RETURNING
                id,
                name,
                modality_type,
                thumbnail_url,
                notes
            "#,
        )
        .bind(zone_id)
        .bind(name)
        .bind(modality_type)
        .bind(thumbnail_url)
        .bind(notes)
        .bind(user_id)
        .fetch_one(tx.as_mut())
        .await?;

        Ok(family)
    }

    async fn resolve_modality_family_for_create(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        account_id: Uuid,
        zone_id: Uuid,
        user_id: &str,
        family_id: Option<Uuid>,
        name: &str,
        modality_type: &str,
        thumbnail_url: Option<&str>,
        notes: Option<&str>,
    ) -> Result<ZoneModalityFamilyRecord, AppError> {
        if let Some(family_id) = family_id {
            return self
                .load_modality_family_for_update(tx, account_id, zone_id, family_id)
                .await?
                .ok_or_else(|| AppError::not_found("Modality family was not found"));
        }

        if let Some(existing_family) = self
            .find_modality_family_by_identity(tx, zone_id, name, modality_type)
            .await?
        {
            return Ok(existing_family);
        }

        self.create_modality_family(
            tx,
            zone_id,
            user_id,
            name,
            modality_type,
            thumbnail_url,
            notes,
        )
        .await
    }

    async fn update_modality_family_shared_fields(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        family_id: Uuid,
        user_id: &str,
        name: &str,
        modality_type: &str,
        thumbnail_url: Option<&str>,
        notes: Option<&str>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE anatomy_zone_modality_families
            SET
                name = $2,
                modality_type = $3,
                thumbnail_url = $4,
                notes = $5,
                updated_by_user_id = $6,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(family_id)
        .bind(name)
        .bind(modality_type)
        .bind(thumbnail_url)
        .bind(notes)
        .bind(user_id)
        .execute(tx.as_mut())
        .await?;

        sqlx::query(
            r#"
            UPDATE anatomy_zone_modalities
            SET
                name = $2,
                modality_type = $3,
                weighting_code = CASE WHEN $3 = 'mri' THEN weighting_code ELSE NULL END,
                cover_image_url = $4,
                notes = $5,
                updated_by_user_id = $6,
                updated_at = NOW()
            WHERE family_id = $1
            "#,
        )
        .bind(family_id)
        .bind(name)
        .bind(modality_type)
        .bind(thumbnail_url)
        .bind(notes)
        .bind(user_id)
        .execute(tx.as_mut())
        .await?;

        Ok(())
    }

    async fn delete_orphan_modality_family(&self, family_id: Uuid) -> Result<(), AppError> {
        let remaining_variant_count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)::bigint
            FROM anatomy_zone_modalities
            WHERE family_id = $1
            "#,
        )
        .bind(family_id)
        .fetch_one(&self.pool)
        .await?;

        if remaining_variant_count > 0 {
            return Ok(());
        }

        sqlx::query(
            r#"
            DELETE FROM anatomy_zone_modality_families
            WHERE id = $1
            "#,
        )
        .bind(family_id)
        .execute(&self.pool)
        .await?;

        Ok(())
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

    async fn allocate_modality_slug(&self, zone_id: Uuid, name: &str) -> Result<String, AppError> {
        let base = slugify(name, "modality");
        let mut candidate = base.clone();
        let mut suffix = 1;

        while self
            .repo
            .modality_slug_exists(&self.pool, zone_id, &candidate)
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

fn normalize_optional_uuid(value: Option<String>, message: &str) -> Result<Option<Uuid>, AppError> {
    let Some(raw_value) = value else {
        return Ok(None);
    };

    let normalized = raw_value.trim();

    if normalized.is_empty() {
        return Ok(None);
    }

    Uuid::parse_str(normalized)
        .map(Some)
        .map_err(|_| AppError::bad_request(message))
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
        "mri" | "mpr" | "ct" | "pet" | "ultrasound" | "xray" | "mra" | "mrv" | "angiography" | "cbct"
        | "illustration" | "photography" | "endoscopy" | "other" => Ok(normalized),
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
        Some("t1" | "t1_gado" | "t2" | "t2_star" | "pd" | "flair" | "adc" | "dwi" | "other") => {
            Ok(normalized)
        }
        Some(_) => Err(AppError::bad_request("Weighting code is invalid")),
    }
}

fn normalize_weighting_code_for_modality_type(
    modality_type: &str,
    value: Option<String>,
) -> Result<Option<String>, AppError> {
    let weighting_code = normalize_weighting_code(value)?;

    if modality_type == "mri" {
        Ok(weighting_code)
    } else {
        Ok(None)
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

fn public_derived_asset_url(asset_id: &str) -> String {
    format!("/api/v1/public/playground/derived-assets/{asset_id}/image")
}

fn rewrite_public_viewer_asset_urls(mut asset: ZoneModalityAsset) -> ZoneModalityAsset {
    if asset.image_url.contains("/playground/derived-assets/") {
        let public_url = public_derived_asset_url(&asset.id);
        asset.image_url = public_url.clone();
        asset.thumbnail_url = Some(public_url);
    }

    asset
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

fn is_allowed_dicom_archive_entry(value: &str) -> bool {
    let normalized = value.trim().replace('\\', "/").to_ascii_lowercase();
    let segments: Vec<&str> = normalized
        .split('/')
        .filter(|segment| !segment.trim().is_empty())
        .collect();
    let Some(file_name) = segments.last().copied() else {
        return false;
    };

    if segments.iter().any(|segment| {
        matches!(
            *segment,
            "css"
                | "css_en"
                | "evlite"
                | "help_di"
                | "image"
                | "image_en"
                | "javascript"
                | "mpeg"
                | "other"
                | "pdf"
                | "viewer"
        )
    }) {
        return false;
    }

    let extension = file_name
        .rsplit_once('.')
        .map(|(_, extension)| format!(".{extension}"));

    match extension.as_deref() {
        None | Some(".dcm" | ".dicom" | ".ima") => true,
        Some(
            ".css" | ".evx" | ".gif" | ".htm" | ".html" | ".js" | ".lnk" | ".mp4" | ".mpeg"
            | ".pdf" | ".png" | ".txt" | ".xml",
        ) => false,
        Some(_) => false,
    }
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
) -> Result<Vec<PreparedStudyFile>, AppError> {
    let zip_path = zip_path.to_path_buf();
    let extracted_root = extracted_root.to_path_buf();

    tokio::task::spawn_blocking(move || -> Result<Vec<PreparedStudyFile>, AppError> {
        let file = std::fs::File::open(&zip_path).map_err(|error| {
            AppError::internal(format!(
                "Unable to open ZIP package at {}: {error}",
                zip_path.display()
            ))
        })?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|_| AppError::bad_request("Unable to read ZIP package."))?;
        let mut prepared = Vec::new();

        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|_| AppError::bad_request("Unable to read ZIP package entry."))?;

            if entry.is_dir() {
                continue;
            }

            let original_name = entry.name().to_string();

            if !is_allowed_dicom_archive_entry(&original_name) {
                return Err(AppError::bad_request(format!(
                    "ZIP package contains non-DICOM viewer or document files ({original_name}). Upload a clean DICOM-only package."
                )));
            }

            let safe_relative_path = sanitize_relative_path(&original_name);
            let output_path = extracted_root.join(&safe_relative_path);

            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| {
                    AppError::internal(format!("Unable to create extraction directory: {error}"))
                })?;
            }

            let mut output = std::fs::File::create(&output_path).map_err(|error| {
                AppError::internal(format!("Unable to create extracted study file: {error}"))
            })?;
            std::io::copy(&mut entry, &mut output).map_err(|error| {
                AppError::internal(format!("Unable to extract ZIP package entry: {error}"))
            })?;

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
    .map_err(|error| AppError::internal(format!("ZIP extraction task failed: {error}")))?
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
            atlas_source_image: Some(atlas_source_image),
        }))
    })
    .await
    .map_err(|error| anyhow::anyhow!("DICOM derivation task failed: {error}"))?
}

fn derive_mpr_volume_and_slices(
    storage_root: &Path,
    derived_root: &Path,
    study_files: &[PreparedStudyFile],
    excluded_slices: Option<&MprExcludedSlices>,
    progress: &mpsc::UnboundedSender<MprProgressUpdate>,
) -> anyhow::Result<MprDerivationResult> {
    report_mpr_progress(
        progress,
        "reading_metadata",
        "Reading DICOM spatial metadata.",
        8,
        0,
        study_files.len(),
    );

    let mut grouped: BTreeMap<String, Vec<MprSourceSlice>> = BTreeMap::new();
    let metadata_report_every = (study_files.len() / 10).max(1);

    for (file_index, study_file) in study_files.iter().enumerate() {
        let object = match open_file(&study_file.file_path) {
            Ok(object) => object,
            Err(_) => continue,
        };
        let Some(source_slice) = read_mpr_source_slice(&object, study_file) else {
            continue;
        };
        grouped
            .entry(source_slice.series_uid.clone())
            .or_default()
            .push(source_slice);

        let completed = file_index + 1;
        if completed == study_files.len() || completed % metadata_report_every == 0 {
            let percent = interpolate_progress(8, 12, completed, study_files.len());
            report_mpr_progress(
                progress,
                "reading_metadata",
                &format!("Reading DICOM metadata {completed}/{}.", study_files.len()),
                percent,
                completed,
                study_files.len(),
            );
        }
    }

    if grouped.is_empty() {
        anyhow::bail!(
            "the upload does not contain a spatial DICOM series with ImagePositionPatient, ImageOrientationPatient, and PixelSpacing"
        );
    }

    let mut candidate_groups = grouped.into_values().collect::<Vec<_>>();
    candidate_groups.sort_by_key(|group| std::cmp::Reverse(group.len()));

    let mut selected_series = None;
    let mut last_validation_error = None;
    for group in candidate_groups {
        match validate_and_sort_mpr_series(group) {
            Ok(series) => {
                selected_series = Some(series);
                break;
            }
            Err(error) => last_validation_error = Some(error),
        }
    }

    let slices = selected_series.ok_or_else(|| {
        last_validation_error.unwrap_or_else(|| anyhow::anyhow!("no reconstructable DICOM series was found"))
    })?;

    let first = &slices[0];
    let slice_spacing = median_slice_spacing(&slices)?;
    let slice_direction = normalize3(cross3(first.row_direction, first.column_direction))
        .context("invalid DICOM orientation vectors")?;
    let source_origin = first.image_position;
    let column_axis = scale3(first.row_direction, first.column_spacing);
    let row_axis = scale3(first.column_direction, first.row_spacing);
    let slice_axis = scale3(slice_direction, slice_spacing);
    let source_basis = matrix_from_columns(column_axis, row_axis, slice_axis);
    let inverse_basis = invert3(source_basis).context("DICOM volume orientation matrix is singular")?;

    let source_voxel_count = first
        .columns
        .checked_mul(first.rows)
        .and_then(|value| value.checked_mul(slices.len()))
        .context("source DICOM volume is too large")?;
    let mut source_volume = Vec::<u16>::with_capacity(source_voxel_count);
    let mut histogram = vec![0u64; 65_536];
    let decode_report_every = (slices.len() / 12).max(1);

    report_mpr_progress(
        progress,
        "decoding_volume",
        "Decoding source DICOM slices.",
        12,
        0,
        slices.len(),
    );

    for (slice_index, slice) in slices.iter().enumerate() {
        let object = open_file(&slice.file_path).with_context(|| {
            format!("unable to reopen source DICOM {}", slice.file_path.display())
        })?;
        let decoded = object.decode_pixel_data().with_context(|| {
            format!("unable to decode source DICOM {}", slice.file_path.display())
        })?;
        let image = decoded.to_dynamic_image(0).with_context(|| {
            format!("unable to render source DICOM {}", slice.file_path.display())
        })?;
        let image = image.to_luma16();
        if image.width() as usize != first.columns || image.height() as usize != first.rows {
            anyhow::bail!("DICOM series dimensions changed while decoding");
        }
        for value in image.into_raw() {
            histogram[value as usize] += 1;
            source_volume.push(value);
        }

        let completed = slice_index + 1;
        if completed == slices.len() || completed % decode_report_every == 0 {
            let percent = interpolate_progress(12, 25, completed, slices.len());
            report_mpr_progress(
                progress,
                "decoding_volume",
                &format!("Decoded source slices {completed}/{}.", slices.len()),
                percent,
                completed,
                slices.len(),
            );
        }
    }

    let input_dimensions = [first.columns, first.rows, slices.len()];
    let corners = volume_world_corners(source_origin, source_basis, input_dimensions);
    let mut world_min = [f64::INFINITY; 3];
    let mut world_max = [f64::NEG_INFINITY; 3];
    for corner in corners {
        for axis in 0..3 {
            world_min[axis] = world_min[axis].min(corner[axis]);
            world_max[axis] = world_max[axis].max(corner[axis]);
        }
    }

    let source_spacings = [first.column_spacing, first.row_spacing, slice_spacing];
    let source_directions = [first.row_direction, first.column_direction, slice_direction];

    let (mut target_volume, target_dimensions, target_spacing, target_origin) =
        if let Some(axis_mapping) = canonical_source_axis_mapping(source_directions) {
            report_mpr_progress(
                progress,
                "reconstructing_volume",
                "Reorienting axis-aligned volume without interpolation.",
                26,
                0,
                input_dimensions[2],
            );

            let (volume, dimensions, spacing) = reorient_axis_aligned_volume(
                source_volume,
                input_dimensions,
                source_spacings,
                axis_mapping,
                progress,
            )?;
            (volume, dimensions, spacing, world_min)
        } else {
            let mut target_spacing = [
                effective_patient_axis_spacing(0, source_directions, source_spacings),
                effective_patient_axis_spacing(1, source_directions, source_spacings),
                effective_patient_axis_spacing(2, source_directions, source_spacings),
            ];
            let mut target_dimensions =
                target_dimensions_from_bounds(world_min, world_max, target_spacing);

            let mut target_voxel_count = checked_volume_len(target_dimensions)?;
            if target_voxel_count > MAX_MPR_VOXELS {
                let scale = (target_voxel_count as f64 / MAX_MPR_VOXELS as f64).cbrt();
                for spacing in &mut target_spacing {
                    *spacing *= scale;
                }
                target_dimensions =
                    target_dimensions_from_bounds(world_min, world_max, target_spacing);
                target_voxel_count = checked_volume_len(target_dimensions)?;
            }

            if target_voxel_count > MAX_MPR_VOXELS {
                anyhow::bail!("reconstructed volume exceeds the configured MPR voxel limit");
            }

            let target_origin = world_min;
            let mut target_volume = vec![0u16; target_voxel_count];
            let base_source = matrix_mul_vec(inverse_basis, sub3(target_origin, source_origin));
            let step_x = matrix_mul_vec(inverse_basis, [target_spacing[0], 0.0, 0.0]);
            let step_y = matrix_mul_vec(inverse_basis, [0.0, target_spacing[1], 0.0]);
            let step_z = matrix_mul_vec(inverse_basis, [0.0, 0.0, target_spacing[2]]);

            let [nx, ny, nz] = target_dimensions;
            let plane_len = nx
                .checked_mul(ny)
                .context("reconstructed MPR plane dimensions overflow")?;
            let worker_count = recommended_mpr_worker_count(nz);
            let planes_per_worker = nz.div_ceil(worker_count.max(1)).max(1);
            let completed_planes = Arc::new(AtomicUsize::new(0));
            let resample_report_every = (nz / 20).max(1);
            report_mpr_progress(
                progress,
                "reconstructing_volume",
                &format!(
                    "Resampling oblique DICOM volume into patient space on {worker_count} workers."
                ),
                25,
                0,
                nz,
            );

            std::thread::scope(|scope| {
                for (worker_index, volume_chunk) in target_volume
                    .chunks_mut(plane_len * planes_per_worker)
                    .enumerate()
                {
                    let z_start = worker_index * planes_per_worker;
                    let source_volume = &source_volume;
                    let completed_planes = Arc::clone(&completed_planes);
                    let progress = progress.clone();

                    scope.spawn(move || {
                        let local_plane_count = volume_chunk.len() / plane_len;
                        for local_z in 0..local_plane_count {
                            let z = z_start + local_z;
                            let z_base = add3(base_source, scale3(step_z, z as f64));
                            let plane = &mut volume_chunk
                                [local_z * plane_len..(local_z + 1) * plane_len];

                            for y in 0..ny {
                                let mut source_index =
                                    add3(z_base, scale3(step_y, y as f64));
                                let row_offset = y * nx;
                                for x in 0..nx {
                                    plane[row_offset + x] = trilinear_sample_u16(
                                        source_volume,
                                        input_dimensions,
                                        source_index,
                                    );
                                    source_index = add3(source_index, step_x);
                                }
                            }

                            let completed =
                                completed_planes.fetch_add(1, Ordering::Relaxed) + 1;
                            if completed == nz || completed % resample_report_every == 0 {
                                let percent = interpolate_progress(25, 55, completed, nz);
                                report_mpr_progress(
                                    &progress,
                                    "reconstructing_volume",
                                    &format!(
                                        "Reconstructed volume section {completed}/{nz}."
                                    ),
                                    percent,
                                    completed,
                                    nz,
                                );
                            }
                        }
                    });
                }
            });

            (target_volume, target_dimensions, target_spacing, target_origin)
        };

    if let Some(excluded_slices) = excluded_slices.filter(|excluded| !excluded.is_empty()) {
        apply_mpr_exclusions(&mut target_volume, target_dimensions, excluded_slices);
    }

    let (window_low, window_high) = histogram_window(&histogram);
    let [nx, ny, nz] = target_dimensions;
    let sagittal_excluded = excluded_slices
        .map(|excluded| excluded.sagittal.len())
        .unwrap_or(0);
    let coronal_excluded = excluded_slices
        .map(|excluded| excluded.coronal.len())
        .unwrap_or(0);
    let axial_excluded = excluded_slices
        .map(|excluded| excluded.axial.len())
        .unwrap_or(0);
    let total_plane_slices = nx
        .saturating_sub(sagittal_excluded)
        .saturating_add(ny.saturating_sub(coronal_excluded))
        .saturating_add(nz.saturating_sub(axial_excluded));
    let render_report_every = (total_plane_slices / 24).max(1);
    let mut plane_asset_counts = BTreeMap::new();
    let planes = [("axial", nz), ("coronal", ny), ("sagittal", nx)];
    let mut render_tasks = Vec::with_capacity(total_plane_slices);

    for (plane, count) in planes {
        std::fs::create_dir_all(derived_root.join(plane))?;
        let excluded_for_plane = excluded_slices
            .map(|excluded| excluded.for_plane(plane))
            .cloned()
            .unwrap_or_default();
        plane_asset_counts.insert(
            plane.to_string(),
            count.saturating_sub(excluded_for_plane.len()),
        );
        for slice_index in 0..count {
            if excluded_for_plane.contains(&slice_index) {
                continue;
            }
            render_tasks.push((plane, slice_index));
        }
    }

    let render_worker_count = recommended_mpr_worker_count(render_tasks.len());
    report_mpr_progress(
        progress,
        "rendering_planes",
        &format!(
            "Rendering axial, coronal, and sagittal MPR stacks on {render_worker_count} workers."
        ),
        55,
        0,
        total_plane_slices,
    );

    let completed_renders = Arc::new(AtomicUsize::new(0));
    let tasks_per_worker = render_tasks
        .len()
        .div_ceil(render_worker_count.max(1))
        .max(1);
    let source_series_uid = first.series_uid.clone();

    let rendered_chunks = std::thread::scope(|scope| -> anyhow::Result<Vec<Vec<(usize, DerivedSliceBuild)>>> {
        let mut handles = Vec::new();

        for (worker_index, task_chunk) in render_tasks.chunks(tasks_per_worker).enumerate() {
            let task_chunk = task_chunk.to_vec();
            let target_volume = &target_volume;
            let completed_renders = Arc::clone(&completed_renders);
            let progress = progress.clone();
            let source_series_uid = source_series_uid.clone();

            handles.push(scope.spawn(move || -> anyhow::Result<Vec<(usize, DerivedSliceBuild)>> {
                let mut builds = Vec::with_capacity(task_chunk.len());
                for (local_index, (plane, slice_index)) in task_chunk.into_iter().enumerate() {
                    let image = render_mpr_plane(
                        target_volume,
                        target_dimensions,
                        plane,
                        slice_index,
                        window_low,
                        window_high,
                    )?;
                    let file_name = format!("{plane}-{:04}.png", slice_index + 1);
                    let image_path = derived_root.join(plane).join(file_name);
                    let png_bytes = encode_png(&image)?;
                    std::fs::write(&image_path, &png_bytes)?;
                    let label = format!("MPR {}", capitalize_ascii(plane));
                    let task_index = worker_index * tasks_per_worker + local_index;

                    builds.push((
                        task_index,
                        DerivedSliceBuild {
                            candidate: DerivedSliceCandidate {
                                source_relative_path: None,
                                storage_key: storage_key_from_absolute(storage_root, &image_path)
                                    .map_err(anyhow::Error::from)?,
                                checksum: sha256_hex(&png_bytes),
                                size_bytes: png_bytes.len() as i64,
                                width: i32::try_from(image.width()).unwrap_or(i32::MAX),
                                height: i32::try_from(image.height()).unwrap_or(i32::MAX),
                                series_uid: Some(format!("{source_series_uid}:mpr:{plane}")),
                                series_label: Some(label),
                                instance_uid: None,
                                slice_index: i32::try_from(slice_index).unwrap_or(i32::MAX),
                                weighting_code: None,
                                orientation_code: Some(plane.to_string()),
                            },
                            atlas_source_image: None,
                        },
                    ));

                    let completed = completed_renders.fetch_add(1, Ordering::Relaxed) + 1;
                    if completed == total_plane_slices
                        || completed % render_report_every == 0
                    {
                        let percent =
                            interpolate_progress(55, 82, completed, total_plane_slices);
                        report_mpr_progress(
                            &progress,
                            "rendering_planes",
                            &format!(
                                "Rendered MPR slices {completed}/{total_plane_slices}."
                            ),
                            percent,
                            completed,
                            total_plane_slices,
                        );
                    }
                }
                Ok(builds)
            }));
        }

        let mut chunks = Vec::with_capacity(handles.len());
        for handle in handles {
            let builds = handle
                .join()
                .map_err(|_| anyhow::anyhow!("MPR render worker panicked"))??;
            chunks.push(builds);
        }
        Ok(chunks)
    })?;

    let mut indexed_builds = rendered_chunks
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    indexed_builds.sort_by_key(|(task_index, _)| *task_index);
    let mut slice_builds = indexed_builds
        .into_iter()
        .map(|(_, build)| build)
        .collect::<Vec<_>>();

    let axial_middle = i32::try_from(nz / 2).unwrap_or(i32::MAX);
    if let Some(index) = slice_builds.iter().position(|build| {
        build.candidate.orientation_code.as_deref() == Some("axial")
            && build.candidate.slice_index == axial_middle
    }) {
        let middle_build = slice_builds.remove(index);
        slice_builds.insert(0, middle_build);
    }

    Ok(MprDerivationResult {
        slice_builds,
        geometry: MprVolumeGeometry {
            dimensions: target_dimensions,
            spacing: target_spacing,
            origin: target_origin,
            frame_of_reference_uid: first.frame_of_reference_uid.clone(),
            source_series_uid: first.series_uid.clone(),
            source_slice_count: slices.len(),
        },
        plane_asset_counts,
    })
}

fn read_mpr_source_slice(
    object: &dicom::object::DefaultDicomObject,
    study_file: &PreparedStudyFile,
) -> Option<MprSourceSlice> {
    let series_uid = dicom_text(object, "SeriesInstanceUID")?;
    let rows = dicom_usize(object, "Rows")?;
    let columns = dicom_usize(object, "Columns")?;
    let image_position = dicom_f64_array::<3>(object, "ImagePositionPatient")?;
    let orientation = dicom_f64_array::<6>(object, "ImageOrientationPatient")?;
    let pixel_spacing = dicom_f64_array::<2>(object, "PixelSpacing")?;
    let row_direction = normalize3([orientation[0], orientation[1], orientation[2]])?;
    let column_direction = normalize3([orientation[3], orientation[4], orientation[5]])?;
    let normal = normalize3(cross3(row_direction, column_direction))?;
    let row_spacing = pixel_spacing[0].abs();
    let column_spacing = pixel_spacing[1].abs();
    if rows == 0
        || columns == 0
        || !row_spacing.is_finite()
        || !column_spacing.is_finite()
        || row_spacing <= 0.0
        || column_spacing <= 0.0
        || image_position.iter().any(|value| !value.is_finite())
    {
        return None;
    }

    Some(MprSourceSlice {
        file_path: study_file.file_path.clone(),
        series_uid,
        frame_of_reference_uid: dicom_text(object, "FrameOfReferenceUID"),
        rows,
        columns,
        image_position,
        row_direction,
        column_direction,
        row_spacing,
        column_spacing,
        slice_projection: dot3(image_position, normal),
    })
}

fn validate_and_sort_mpr_series(mut slices: Vec<MprSourceSlice>) -> anyhow::Result<Vec<MprSourceSlice>> {
    if slices.len() < 3 {
        anyhow::bail!("MPR requires at least three spatial slices from the same DICOM series");
    }

    let first = slices[0].clone();
    slices.retain(|slice| {
        slice.rows == first.rows
            && slice.columns == first.columns
            && approx_equal(slice.row_spacing, first.row_spacing, 0.001)
            && approx_equal(slice.column_spacing, first.column_spacing, 0.001)
            && dot3(slice.row_direction, first.row_direction) >= 0.999
            && dot3(slice.column_direction, first.column_direction) >= 0.999
            && match (&first.frame_of_reference_uid, &slice.frame_of_reference_uid) {
                (Some(left), Some(right)) => left == right,
                _ => true,
            }
    });

    if slices.len() < 3 {
        anyhow::bail!("the DICOM series does not have consistent dimensions, orientation, and spacing");
    }

    let reference_normal = normalize3(cross3(first.row_direction, first.column_direction))
        .context("invalid DICOM orientation vectors")?;
    for slice in &mut slices {
        slice.slice_projection = dot3(slice.image_position, reference_normal);
    }
    slices.sort_by(|left, right| {
        left.slice_projection
            .partial_cmp(&right.slice_projection)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    slices.dedup_by(|left, right| (left.slice_projection - right.slice_projection).abs() < 0.0001);

    if slices.len() < 3 {
        anyhow::bail!("the DICOM series does not contain enough unique slice positions");
    }

    let spacing = median_slice_spacing(&slices)?;
    let tolerance = (spacing * 0.2).max(0.1);
    for pair in slices.windows(2) {
        let delta = (pair[1].slice_projection - pair[0].slice_projection).abs();
        if (delta - spacing).abs() > tolerance {
            anyhow::bail!(
                "the DICOM series has irregular slice spacing ({delta:.3} mm versus median {spacing:.3} mm)"
            );
        }
    }

    Ok(slices)
}

fn median_slice_spacing(slices: &[MprSourceSlice]) -> anyhow::Result<f64> {
    let mut diffs = slices
        .windows(2)
        .map(|pair| (pair[1].slice_projection - pair[0].slice_projection).abs())
        .filter(|value| *value > 0.0001 && value.is_finite())
        .collect::<Vec<_>>();
    if diffs.is_empty() {
        anyhow::bail!("unable to determine slice spacing from ImagePositionPatient");
    }
    diffs.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    Ok(diffs[diffs.len() / 2])
}

fn interpolate_progress(start: u8, end: u8, completed: usize, total: usize) -> u8 {
    if total == 0 || end <= start {
        return end;
    }

    let fraction = (completed.min(total) as f64 / total as f64).clamp(0.0, 1.0);
    (start as f64 + (end - start) as f64 * fraction)
        .round()
        .clamp(start as f64, end as f64) as u8
}

fn report_mpr_progress(
    sender: &mpsc::UnboundedSender<MprProgressUpdate>,
    phase: &str,
    message: &str,
    progress_percent: u8,
    completed: usize,
    total: usize,
) {
    let _ = sender.send(MprProgressUpdate {
        phase: phase.to_string(),
        message: message.to_string(),
        progress_percent,
        completed,
        total,
    });
}

fn apply_mpr_exclusions(
    volume: &mut [u16],
    dimensions: [usize; 3],
    excluded: &MprExcludedSlices,
) {
    let [nx, ny, nz] = dimensions;
    if nx == 0 || ny == 0 || nz == 0 {
        return;
    }

    for z in 0..nz {
        let z_excluded = excluded.axial.contains(&z);
        for y in 0..ny {
            let y_excluded = excluded.coronal.contains(&y);
            let row_offset = (z * ny + y) * nx;
            for x in 0..nx {
                if z_excluded || y_excluded || excluded.sagittal.contains(&x) {
                    volume[row_offset + x] = 0;
                }
            }
        }
    }
}

fn canonical_source_axis_mapping(
    directions: [[f64; 3]; 3],
) -> Option<[(usize, bool); 3]> {
    let mut mapping = [(0usize, false); 3];
    let mut used_patient_axes = [false; 3];

    for (source_axis, direction) in directions.into_iter().enumerate() {
        let mut patient_axis = 0usize;
        let mut dominant_component = direction[0];
        for axis in 1..3 {
            if direction[axis].abs() > dominant_component.abs() {
                patient_axis = axis;
                dominant_component = direction[axis];
            }
        }

        if dominant_component.abs() < 0.999 || used_patient_axes[patient_axis] {
            return None;
        }

        let off_axis_energy = direction
            .iter()
            .enumerate()
            .filter(|(axis, _)| *axis != patient_axis)
            .map(|(_, value)| value * value)
            .sum::<f64>();
        if off_axis_energy > 1e-4 {
            return None;
        }

        used_patient_axes[patient_axis] = true;
        mapping[source_axis] = (patient_axis, dominant_component < 0.0);
    }

    Some(mapping)
}

fn reorient_axis_aligned_volume(
    source_volume: Vec<u16>,
    source_dimensions: [usize; 3],
    source_spacings: [f64; 3],
    axis_mapping: [(usize, bool); 3],
    progress: &mpsc::UnboundedSender<MprProgressUpdate>,
) -> anyhow::Result<(Vec<u16>, [usize; 3], [f64; 3])> {
    let mut target_dimensions = [0usize; 3];
    let mut target_spacing = [0.0f64; 3];
    for source_axis in 0..3 {
        let (patient_axis, _) = axis_mapping[source_axis];
        target_dimensions[patient_axis] = source_dimensions[source_axis];
        target_spacing[patient_axis] = source_spacings[source_axis];
    }

    let identity_mapping = axis_mapping == [(0, false), (1, false), (2, false)];
    if identity_mapping {
        report_mpr_progress(
            progress,
            "reconstructing_volume",
            "Volume is already aligned to patient axes.",
            55,
            source_dimensions[2],
            source_dimensions[2],
        );
        return Ok((source_volume, target_dimensions, target_spacing));
    }

    let target_len = checked_volume_len(target_dimensions)?;
    if target_len != source_volume.len() {
        anyhow::bail!("axis-aligned MPR reorientation changed voxel count unexpectedly");
    }

    let mut target_volume = vec![0u16; target_len];
    let [source_nx, source_ny, source_nz] = source_dimensions;
    let [target_nx, target_ny, _target_nz] = target_dimensions;
    let report_every = (source_nz / 12).max(1);

    for source_z in 0..source_nz {
        for source_y in 0..source_ny {
            for source_x in 0..source_nx {
                let source_indices = [source_x, source_y, source_z];
                let mut target_indices = [0usize; 3];

                for source_axis in 0..3 {
                    let (patient_axis, reversed) = axis_mapping[source_axis];
                    let source_index = source_indices[source_axis];
                    let source_count = source_dimensions[source_axis];
                    target_indices[patient_axis] = if reversed {
                        source_count - 1 - source_index
                    } else {
                        source_index
                    };
                }

                let source_index = (source_z * source_ny + source_y) * source_nx + source_x;
                let target_index =
                    (target_indices[2] * target_ny + target_indices[1]) * target_nx
                        + target_indices[0];
                target_volume[target_index] = source_volume[source_index];
            }
        }

        let completed = source_z + 1;
        if completed == source_nz || completed % report_every == 0 {
            let percent = interpolate_progress(26, 55, completed, source_nz);
            report_mpr_progress(
                progress,
                "reconstructing_volume",
                &format!("Reoriented volume section {completed}/{source_nz}."),
                percent,
                completed,
                source_nz,
            );
        }
    }

    Ok((target_volume, target_dimensions, target_spacing))
}

fn dicom_usize(object: &dicom::object::DefaultDicomObject, name: &str) -> Option<usize> {
    object
        .element_by_name(name)
        .ok()?
        .to_int::<u32>()
        .ok()
        .and_then(|value| usize::try_from(value).ok())
}

fn dicom_f64_array<const N: usize>(
    object: &dicom::object::DefaultDicomObject,
    name: &str,
) -> Option<[f64; N]> {
    object
        .element_by_name(name)
        .ok()?
        .to_multi_float64()
        .ok()?
        .try_into()
        .ok()
}

fn matrix_from_columns(a: [f64; 3], b: [f64; 3], c: [f64; 3]) -> [[f64; 3]; 3] {
    [
        [a[0], b[0], c[0]],
        [a[1], b[1], c[1]],
        [a[2], b[2], c[2]],
    ]
}

fn invert3(matrix: [[f64; 3]; 3]) -> Option<[[f64; 3]; 3]> {
    let [[a, b, c], [d, e, f], [g, h, i]] = matrix;
    let determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if determinant.abs() < 1e-12 {
        return None;
    }
    let inv = 1.0 / determinant;
    Some([
        [(e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
        [(f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
        [(d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv],
    ])
}

fn matrix_mul_vec(matrix: [[f64; 3]; 3], value: [f64; 3]) -> [f64; 3] {
    [
        dot3(matrix[0], value),
        dot3(matrix[1], value),
        dot3(matrix[2], value),
    ]
}

fn volume_world_corners(
    origin: [f64; 3],
    basis: [[f64; 3]; 3],
    dimensions: [usize; 3],
) -> [[f64; 3]; 8] {
    let max_index = [
        dimensions[0].saturating_sub(1) as f64,
        dimensions[1].saturating_sub(1) as f64,
        dimensions[2].saturating_sub(1) as f64,
    ];
    let mut corners = [[0.0; 3]; 8];
    let mut cursor = 0;
    for z in [0.0, max_index[2]] {
        for y in [0.0, max_index[1]] {
            for x in [0.0, max_index[0]] {
                corners[cursor] = add3(origin, matrix_mul_vec(basis, [x, y, z]));
                cursor += 1;
            }
        }
    }
    corners
}

fn effective_patient_axis_spacing(
    patient_axis: usize,
    directions: [[f64; 3]; 3],
    spacings: [f64; 3],
) -> f64 {
    let reciprocal_squared = directions
        .iter()
        .zip(spacings)
        .map(|(direction, spacing)| {
            let component = direction[patient_axis] / spacing.max(1e-6);
            component * component
        })
        .sum::<f64>();
    if reciprocal_squared <= 1e-12 {
        spacings.into_iter().fold(f64::INFINITY, f64::min)
    } else {
        1.0 / reciprocal_squared.sqrt()
    }
}

fn target_dimensions_from_bounds(
    min: [f64; 3],
    max: [f64; 3],
    spacing: [f64; 3],
) -> [usize; 3] {
    [0, 1, 2].map(|axis| {
        (((max[axis] - min[axis]).max(0.0) / spacing[axis].max(1e-6)).ceil() as usize + 1)
            .max(1)
    })
}

fn checked_volume_len(dimensions: [usize; 3]) -> anyhow::Result<usize> {
    dimensions[0]
        .checked_mul(dimensions[1])
        .and_then(|value| value.checked_mul(dimensions[2]))
        .context("reconstructed volume dimensions overflow")
}

fn trilinear_sample_u16(
    volume: &[u16],
    dimensions: [usize; 3],
    point: [f64; 3],
) -> u16 {
    let [nx, ny, nz] = dimensions;
    let [x, y, z] = point;
    if x < 0.0
        || y < 0.0
        || z < 0.0
        || x > (nx.saturating_sub(1)) as f64
        || y > (ny.saturating_sub(1)) as f64
        || z > (nz.saturating_sub(1)) as f64
    {
        return 0;
    }

    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;
    let z0 = z.floor() as usize;
    let x1 = (x0 + 1).min(nx - 1);
    let y1 = (y0 + 1).min(ny - 1);
    let z1 = (z0 + 1).min(nz - 1);
    let tx = x - x0 as f64;
    let ty = y - y0 as f64;
    let tz = z - z0 as f64;
    let index = |xi: usize, yi: usize, zi: usize| -> usize { (zi * ny + yi) * nx + xi };
    let sample = |xi: usize, yi: usize, zi: usize| -> f64 { volume[index(xi, yi, zi)] as f64 };

    let c00 = sample(x0, y0, z0) * (1.0 - tx) + sample(x1, y0, z0) * tx;
    let c10 = sample(x0, y1, z0) * (1.0 - tx) + sample(x1, y1, z0) * tx;
    let c01 = sample(x0, y0, z1) * (1.0 - tx) + sample(x1, y0, z1) * tx;
    let c11 = sample(x0, y1, z1) * (1.0 - tx) + sample(x1, y1, z1) * tx;
    let c0 = c00 * (1.0 - ty) + c10 * ty;
    let c1 = c01 * (1.0 - ty) + c11 * ty;
    (c0 * (1.0 - tz) + c1 * tz).round().clamp(0.0, u16::MAX as f64) as u16
}

fn histogram_window(histogram: &[u64]) -> (u16, u16) {
    let total = histogram.iter().sum::<u64>();
    if total == 0 {
        return (0, u16::MAX);
    }
    let low_target = ((total as f64) * 0.005) as u64;
    let high_target = ((total as f64) * 0.995) as u64;
    let mut cumulative = 0u64;
    let mut low = 0u16;
    let mut high = u16::MAX;
    let mut low_found = false;
    for (value, count) in histogram.iter().enumerate() {
        cumulative += count;
        if !low_found && cumulative >= low_target {
            low = value as u16;
            low_found = true;
        }
        if cumulative >= high_target {
            high = value as u16;
            break;
        }
    }
    if high <= low {
        (0, u16::MAX)
    } else {
        (low, high)
    }
}

fn render_mpr_plane(
    volume: &[u16],
    dimensions: [usize; 3],
    plane: &str,
    slice_index: usize,
    window_low: u16,
    window_high: u16,
) -> anyhow::Result<RgbaImage> {
    let [nx, ny, nz] = dimensions;
    let (width, height) = match plane {
        "axial" => (nx, ny),
        "coronal" => (nx, nz),
        "sagittal" => (ny, nz),
        _ => anyhow::bail!("unsupported MPR plane {plane}"),
    };
    let mut image = RgbaImage::new(width as u32, height as u32);
    let index = |x: usize, y: usize, z: usize| -> usize { (z * ny + y) * nx + x };
    let map_value = |value: u16| -> u8 {
        let low = window_low as f64;
        let high = window_high as f64;
        (((value as f64 - low) / (high - low).max(1.0)) * 255.0)
            .round()
            .clamp(0.0, 255.0) as u8
    };

    for screen_y in 0..height {
        for screen_x in 0..width {
            let value = match plane {
                "axial" => volume[index(screen_x, screen_y, slice_index)],
                "coronal" => {
                    let z = nz - 1 - screen_y;
                    volume[index(screen_x, slice_index, z)]
                }
                "sagittal" => {
                    let z = nz - 1 - screen_y;
                    volume[index(slice_index, screen_x, z)]
                }
                _ => unreachable!(),
            };
            let grayscale = map_value(value);
            image.put_pixel(
                screen_x as u32,
                screen_y as u32,
                Rgba([grayscale, grayscale, grayscale, 255]),
            );
        }
    }

    Ok(image)
}

fn encode_png(image: &RgbaImage) -> anyhow::Result<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    PngEncoder::new_with_quality(&mut cursor, CompressionType::Fast, FilterType::NoFilter)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )?;
    Ok(cursor.into_inner())
}

fn dot3(left: [f64; 3], right: [f64; 3]) -> f64 {
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

fn cross3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]
}

fn normalize3(value: [f64; 3]) -> Option<[f64; 3]> {
    let magnitude = dot3(value, value).sqrt();
    if !magnitude.is_finite() || magnitude <= 1e-12 {
        return None;
    }
    Some([value[0] / magnitude, value[1] / magnitude, value[2] / magnitude])
}

fn add3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

fn sub3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
}

fn scale3(value: [f64; 3], scale: f64) -> [f64; 3] {
    [value[0] * scale, value[1] * scale, value[2] * scale]
}

fn approx_equal(left: f64, right: f64, tolerance: f64) -> bool {
    (left - right).abs() <= tolerance
}

fn capitalize_ascii(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
    }
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
                    infer_derived_mime_type(&packed_page.storage_key),
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
        let slice_assets = slice_assets.to_vec();
        let slice_builds = slice_builds.to_vec();

        tokio::task::spawn_blocking(move || {
            write_atlas_pages_from_slice_builds(
                &storage_root,
                &atlas_root,
                &slice_assets,
                &slice_builds,
            )
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
        let lossless_atlas = slice_assets.iter().all(|asset| {
            asset.asset_kind == "derived_slice"
                && asset
                    .storage_key
                    .as_deref()
                    .is_some_and(|storage_key| storage_key.ends_with(".png"))
        });

        tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<BuiltAtlasPage>> {
            let mut slice_images = Vec::with_capacity(slice_assets.len());

            for asset in slice_assets {
                let image = load_atlas_source_image(&storage_root, &asset)?;
                slice_images.push(AtlasSourceSlice {
                    asset_id: asset.id,
                    image,
                });
            }

            write_atlas_pages(&storage_root, &atlas_root, slice_images, lossless_atlas)
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

fn collect_study_files_recursive(
    root: &Path,
    current: &Path,
    output: &mut Vec<PreparedStudyFile>,
) -> Result<(), AppError> {
    let entries = std::fs::read_dir(current).map_err(|error| {
        AppError::internal(format!(
            "Unable to read stored MPR source directory {}: {error}",
            current.display()
        ))
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            AppError::internal(format!("Unable to inspect stored MPR source: {error}"))
        })?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            AppError::internal(format!("Unable to inspect stored MPR source type: {error}"))
        })?;

        if file_type.is_dir() {
            collect_study_files_recursive(root, &path, output)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .ok()
            .and_then(|value| value.to_str())
            .map(|value| value.replace('\\', "/"));
        let original_file_name = path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("file")
            .to_string();

        output.push(PreparedStudyFile {
            source_relative_path: relative,
            original_file_name,
            file_path: path,
        });
    }

    Ok(())
}

fn recommended_dicom_derivation_concurrency() -> usize {
    std::thread::available_parallelism()
        .map(|parallelism| parallelism.get().min(MAX_CONCURRENT_DICOM_DERIVATIONS))
        .unwrap_or(4)
}

fn recommended_mpr_worker_count(work_items: usize) -> usize {
    if work_items == 0 {
        return 1;
    }

    std::thread::available_parallelism()
        .map(|parallelism| {
            parallelism
                .get()
                .min(MAX_CONCURRENT_DICOM_DERIVATIONS)
                .min(work_items)
                .max(1)
        })
        .unwrap_or(1)
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

fn write_atlas_pages_from_slice_builds(
    storage_root: &Path,
    atlas_root: &Path,
    slice_assets: &[ZoneModalityAsset],
    slice_builds: &[DerivedSliceBuild],
) -> anyhow::Result<Vec<BuiltAtlasPage>> {
    if slice_assets.is_empty() {
        return Ok(Vec::new());
    }
    if slice_assets.len() != slice_builds.len() {
        anyhow::bail!("slice assets and builds are misaligned");
    }

    let global_cell_width = slice_builds
        .iter()
        .map(|build| build.candidate.width.max(1) as u32)
        .max()
        .unwrap_or(1);
    let global_cell_height = slice_builds
        .iter()
        .map(|build| build.candidate.height.max(1) as u32)
        .max()
        .unwrap_or(1);
    let columns_by_width = (MAX_ATLAS_PAGE_EDGE / global_cell_width).max(1) as usize;
    let rows_by_height = (MAX_ATLAS_PAGE_EDGE / global_cell_height).max(1) as usize;
    let columns_per_page = columns_by_width.clamp(1, MAX_ATLAS_PAGE_COLUMNS);
    let rows_per_page = rows_by_height.max(1);
    let slices_per_page = (columns_per_page * rows_per_page).clamp(1, MAX_ATLAS_SLICES_PER_PAGE);
    let mut pages = Vec::new();

    for (page_index, start) in (0..slice_assets.len()).step_by(slices_per_page).enumerate() {
        let end = (start + slices_per_page).min(slice_assets.len());
        let page_builds = &slice_builds[start..end];
        let cell_width = page_builds
            .iter()
            .map(|build| build.candidate.width.max(1))
            .max()
            .unwrap_or(1);
        let cell_height = page_builds
            .iter()
            .map(|build| build.candidate.height.max(1))
            .max()
            .unwrap_or(1);
        let columns = columns_per_page.min(end - start).max(1);
        let rows = (end - start).div_ceil(columns);
        let page_width = (cell_width as u32) * (columns as u32);
        let page_height = (cell_height as u32) * (rows as u32);
        let mut canvas: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(page_width, page_height, Rgba([0, 0, 0, 0]));
        let mut frames = Vec::with_capacity(end - start);

        for local_index in 0..(end - start) {
            let asset = &slice_assets[start + local_index];
            let build = &slice_builds[start + local_index];
            let image = if let Some(image) = build.atlas_source_image.as_ref() {
                image.clone()
            } else {
                let image_path = storage_root.join(&build.candidate.storage_key);
                image::open(&image_path)
                    .with_context(|| {
                        format!("Unable to open derived MPR slice at {}", image_path.display())
                    })?
                    .to_rgba8()
            };
            let column = local_index % columns;
            let row = local_index / columns;
            let x = i64::try_from(column).unwrap_or(0) * i64::from(cell_width);
            let y = i64::try_from(row).unwrap_or(0) * i64::from(cell_height);
            overlay(&mut canvas, &image, x, y);
            frames.push(AtlasFrameMetadata {
                asset_id: asset.id.clone(),
                x: i32::try_from(x).unwrap_or(i32::MAX),
                y: i32::try_from(y).unwrap_or(i32::MAX),
                width: i32::try_from(image.width()).unwrap_or(i32::MAX),
                height: i32::try_from(image.height()).unwrap_or(i32::MAX),
            });
        }

        let lossless_page = page_builds
            .iter()
            .all(|build| build.atlas_source_image.is_none());
        let atlas_extension = if lossless_page { "png" } else { "avif" };
        let atlas_file_name = format!("atlas-{:03}.{atlas_extension}", page_index + 1);
        let atlas_path = atlas_root.join(&atlas_file_name);
        let atlas_bytes = if lossless_page {
            encode_png(&canvas)?
        } else {
            encode_avif(&canvas)?
        };
        std::fs::write(&atlas_path, &atlas_bytes)
            .with_context(|| format!("Unable to write atlas image at {}", atlas_path.display()))?;
        let metadata_path = atlas_path.with_extension("json");
        std::fs::write(
            &metadata_path,
            serde_json::to_vec_pretty(&AtlasPageMetadata {
                width: i32::try_from(page_width).unwrap_or(i32::MAX),
                height: i32::try_from(page_height).unwrap_or(i32::MAX),
                frames: frames.clone(),
            })?,
        )?;

        pages.push(BuiltAtlasPage {
            storage_key: storage_key_from_absolute(storage_root, &atlas_path)
                .map_err(anyhow::Error::from)?,
            checksum: sha256_hex(&atlas_bytes),
            size_bytes: atlas_bytes.len() as i64,
            width: i32::try_from(page_width).unwrap_or(i32::MAX),
            height: i32::try_from(page_height).unwrap_or(i32::MAX),
            frames,
        });
    }

    Ok(pages)
}


fn write_atlas_pages(
    storage_root: &Path,
    atlas_root: &Path,
    slice_images: Vec<AtlasSourceSlice>,
    lossless_atlas: bool,
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
    let columns_per_page = columns_by_width.clamp(1, MAX_ATLAS_PAGE_COLUMNS);
    let rows_per_page = rows_by_height.max(1);
    let slices_per_page = (columns_per_page * rows_per_page).clamp(1, MAX_ATLAS_SLICES_PER_PAGE);

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

        let atlas_extension = if lossless_atlas { "png" } else { "avif" };
        let atlas_file_name = format!("atlas-{:03}.{atlas_extension}", page_index + 1);
        let atlas_path = atlas_root.join(&atlas_file_name);
        let atlas_bytes = if lossless_atlas {
            encode_png(&atlas_canvas)?
        } else {
            encode_avif(&atlas_canvas)?
        };
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

fn build_mpr_viewer_manifest_json(
    assets: &[ZoneModalityAsset],
    atlases: &[ZoneModalityAtlasPage],
    atlas_frames: &[ZoneModalityAtlasFrame],
    geometry: &MprVolumeGeometry,
    plane_asset_counts: Option<&BTreeMap<String, usize>>,
) -> serde_json::Value {
    let mut planes = serde_json::Map::new();

    for plane in ["axial", "coronal", "sagittal"] {
        let mut plane_assets = assets
            .iter()
            .filter(|asset| asset.orientation_code.as_deref() == Some(plane))
            .collect::<Vec<_>>();
        plane_assets.sort_by_key(|asset| asset.slice_index.unwrap_or(i32::MAX));
        planes.insert(
            plane.to_string(),
            json!({
                "sliceCount": plane_asset_counts
                    .and_then(|counts| counts.get(plane).copied())
                    .unwrap_or(plane_assets.len()),
                "assetIds": plane_assets
                    .iter()
                    .map(|asset| asset.id.clone())
                    .collect::<Vec<_>>(),
            }),
        );
    }

    json!({
        "schemaVersion": "mpr-1",
        "coordinateSystem": "DICOM_LPS",
        "volume": geometry,
        "excludedSlices": {
            "axial": [],
            "coronal": [],
            "sagittal": [],
        },
        "planes": planes,
        "atlases": atlases,
        "atlasFrames": atlas_frames,
    })
}

fn parse_mpr_excluded_slices(manifest: &serde_json::Value) -> MprExcludedSlices {
    fn read_plane(manifest: &serde_json::Value, plane: &str) -> BTreeSet<usize> {
        manifest
            .get("excludedSlices")
            .and_then(|value| value.get(plane))
            .and_then(|value| value.as_array())
            .map(|values| {
                values
                    .iter()
                    .filter_map(|value| value.as_u64())
                    .filter_map(|value| usize::try_from(value).ok())
                    .collect::<BTreeSet<_>>()
            })
            .unwrap_or_default()
    }

    MprExcludedSlices {
        axial: read_plane(manifest, "axial"),
        coronal: read_plane(manifest, "coronal"),
        sagittal: read_plane(manifest, "sagittal"),
    }
}

fn mpr_excluded_slices_json(excluded: &MprExcludedSlices) -> serde_json::Value {
    json!({
        "axial": excluded.axial.iter().copied().collect::<Vec<_>>(),
        "coronal": excluded.coronal.iter().copied().collect::<Vec<_>>(),
        "sagittal": excluded.sagittal.iter().copied().collect::<Vec<_>>(),
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

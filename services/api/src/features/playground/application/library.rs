//! Account-private, revisioned display-image library. PNG editing never changes
//! identity or patient-space geometry. Modality attachments are isolated snapshots.
use super::*;
use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use std::io::{Read, Write};

pub const MAX_PACKAGE_BYTES: usize = 1024 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_SLICES: usize = 10_000;
const MAX_IMAGE_PIXELS: u64 = 48_000_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibrarySlice {
    id: Uuid,
    filename: String,
    width: u32,
    height: u32,
    series_uid: String,
    instance_uid: Option<String>,
    instance_number: Option<i32>,
    frame_index: u32,
    slice_index: i32,
    orientation_code: Option<String>,
    image_position: Option<[f64; 3]>,
    image_orientation: Option<[f64; 6]>,
    pixel_spacing: Option<[f64; 2]>,
    series_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryManifest {
    schema_version: String,
    study_id: Uuid,
    revision: i32,
    modality_type: String,
    coordinate_system: String,
    volume: Option<MprVolumeGeometry>,
    slices: Vec<LibrarySlice>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStudy {
    pub id: Uuid,
    pub name: String,
    pub modality_type: String,
    pub status: String,
    pub revision: i32,
    pub slice_count: i32,
    pub progress: i32,
    pub error_message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttachLibraryInput {
    pub zone_id: Uuid,
    pub family_id: Option<Uuid>,
    pub name: String,
    pub modality_type: String,
    pub weighting_code: Option<String>,
    pub thumbnail_url: Option<String>,
    pub revision: i32,
}

// Enhanced multi-frame DICOM stores geometry in per-frame/shared functional
// groups. Only fall back to top-level geometry for single-frame objects.
pub(super) fn frame_geometry<const N: usize>(
    object: &dicom::object::DefaultDicomObject,
    frame: u32,
    sequence: &str,
    attribute: &str,
) -> Option<[f64; N]> {
    for (group_name, index) in [
        ("PerFrameFunctionalGroupsSequence", frame as usize),
        ("SharedFunctionalGroupsSequence", 0),
    ] {
        if let Some(group) = object
            .element_by_name(group_name)
            .ok()
            .and_then(|e| e.items())
            .and_then(|items| items.get(index))
            && let Some(item) = group
                .element_by_name(sequence)
                .ok()
                .and_then(|e| e.items())
                .and_then(|items| items.first())
            && let Ok(element) = item.element_by_name(attribute)
        {
            let values = element.to_multi_float64().ok()?;
            if values.len() == N && values.iter().all(|v| v.is_finite()) {
                return values.as_slice().try_into().ok();
            }
            return None;
        }
    }
    if dicom_usize(object, "NumberOfFrames").unwrap_or(1) > 1 {
        return None;
    }
    dicom_f64_array(object, attribute).filter(|values| values.iter().all(|v| v.is_finite()))
}

impl PlaygroundService {
    fn library_root(&self, account: Uuid, id: Uuid) -> PathBuf {
        self.storage_root
            .join("private-library")
            .join(account.to_string())
            .join(id.to_string())
    }

    pub async fn delete_library(&self, account: Uuid, id: Uuid) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await?;
        let status: String = sqlx::query_scalar(
            "SELECT status FROM anatomy_image_library WHERE account_id=$1 AND id=$2 FOR UPDATE",
        )
        .bind(account)
        .bind(id)
        .fetch_optional(tx.as_mut())
        .await?
        .ok_or_else(|| AppError::not_found("Library study not found"))?;
        if matches!(status.as_str(), "queued" | "processing" | "encoding") {
            return Err(AppError::Conflict(
                "Wait for conversion to finish before deleting this study".into(),
            ));
        }
        // Existing modalities own independent image snapshots. The optional
        // library reference is cleared by its FK without removing their images.
        let root = self.library_root(account, id);
        if fs::try_exists(&root).await.map_err(io_error)? {
            fs::remove_dir_all(&root).await.map_err(io_error)?;
        }
        // Keep the row until cleanup succeeds so a filesystem error is retryable.
        sqlx::query("DELETE FROM anatomy_image_library WHERE account_id=$1 AND id=$2")
            .bind(account)
            .bind(id)
            .execute(tx.as_mut())
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_library(&self, account: Uuid) -> Result<Vec<LibraryStudy>, AppError> {
        Ok(sqlx::query_as("SELECT id,name,modality_type,status,revision,slice_count,progress,error_message FROM anatomy_image_library WHERE account_id=$1 ORDER BY created_at DESC LIMIT 1000")
            .bind(account).fetch_all(&self.pool).await?)
    }

    pub async fn get_library(&self, account: Uuid, id: Uuid) -> Result<LibraryStudy, AppError> {
        sqlx::query_as("SELECT id,name,modality_type,status,revision,slice_count,progress,error_message FROM anatomy_image_library WHERE account_id=$1 AND id=$2")
            .bind(account).bind(id).fetch_optional(&self.pool).await?
            .ok_or_else(|| AppError::not_found("Library study not found"))
    }

    async fn library_manifest(&self, account: Uuid, id: Uuid) -> Result<LibraryManifest, AppError> {
        let value: Json<LibraryManifest> = sqlx::query_scalar("SELECT manifest FROM anatomy_image_library WHERE account_id=$1 AND id=$2 AND status IN ('editable','ready','encoding')")
            .bind(account).bind(id).fetch_optional(&self.pool).await?
            .ok_or_else(|| AppError::bad_request("Study images are not ready"))?;
        Ok(value.0)
    }

    pub async fn import_library(
        &self,
        account: Uuid,
        user: &str,
        name: &str,
        kind: &str,
        source: PathBuf,
    ) -> Result<LibraryStudy, AppError> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 200 {
            return Err(AppError::bad_request("Name must contain 1–200 characters"));
        }
        let kind = normalize_modality_type(kind)?;
        let id = Uuid::new_v4();
        // Account-level admission is serialized, including conversion and reupload.
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("library:{account}"))
            .execute(tx.as_mut())
            .await?;
        let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM anatomy_image_library WHERE account_id=$1 AND status IN ('queued','processing','encoding')")
            .bind(account).fetch_one(tx.as_mut()).await?;
        if active >= 2 {
            return Err(AppError::rate_limited(
                "Wait for an active library conversion to finish",
            ));
        }
        sqlx::query("INSERT INTO anatomy_image_library(id,account_id,name,modality_type,status,created_by_user_id) VALUES($1,$2,$3,$4,'queued',$5)")
            .bind(id).bind(account).bind(name).bind(&kind).bind(user).execute(tx.as_mut()).await?;
        tx.commit().await?;
        let service = self.clone();
        tokio::spawn(async move {
            let result = service.convert_library(account, id, &kind, &source).await;
            let _ = fs::remove_file(&source).await;
            if let Err(error) = result {
                tracing::warn!(%id, %error, "library conversion failed");
                let message = match error {
                    AppError::BadRequest(message) => message,
                    _ => "Conversion failed. Please retry the source upload.".into(),
                };
                let _ = sqlx::query("UPDATE anatomy_image_library SET status='failed',error_message=$2,updated_at=NOW() WHERE id=$1").bind(id).bind(message).execute(&service.pool).await;
            }
        });
        self.get_library(account, id).await
    }

    async fn convert_library(
        &self,
        account: Uuid,
        id: Uuid,
        kind: &str,
        source: &Path,
    ) -> Result<(), AppError> {
        let _permit = self
            .ingest_gate
            .acquire()
            .await
            .map_err(|_| AppError::internal("Import queue unavailable"))?;
        sqlx::query("UPDATE anatomy_image_library SET status='processing',progress=5 WHERE id=$1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        let root = self.library_root(account, id);
        let expanded = root.join("source");
        fs::create_dir_all(&expanded)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        let files = extract_zip_study(source, &expanded).await?;
        if files.is_empty() {
            return Err(AppError::bad_request("No DICOM images found"));
        }
        let output = root.join("1").join("png");
        fs::create_dir_all(&output)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        let kind_owned = kind.to_string();
        let output_clone = output.clone();
        let manifest = tokio::task::spawn_blocking(move || {
            convert_package(id, kind_owned, files, output_clone)
        })
        .await
        .map_err(|e| AppError::internal(e.to_string()))??;
        sqlx::query("UPDATE anatomy_image_library SET status='editable',manifest=$2,slice_count=$3,progress=100,error_message=NULL,updated_at=NOW() WHERE id=$1")
            .bind(id).bind(Json(&manifest)).bind(manifest.slices.len() as i32).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn export_library(&self, account: Uuid, id: Uuid) -> Result<PathBuf, AppError> {
        let study = self.get_library(account, id).await?;
        if !matches!(study.status.as_str(), "editable" | "ready") {
            return Err(AppError::bad_request("Wait for conversion to finish"));
        }
        let manifest = self.library_manifest(account, id).await?;
        let root = self.library_root(account, id);
        let path = root.join(format!(
            "export-{}-{}.zip",
            manifest.revision,
            Uuid::new_v4()
        ));
        let result = path.clone();
        let exported = tokio::task::spawn_blocking(move || -> Result<(), AppError> {
            let file =
                std::fs::File::create(&path).map_err(|e| AppError::internal(e.to_string()))?;
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("manifest.json", options)
                .map_err(zip_error)?;
            zip.write_all(
                &serde_json::to_vec_pretty(&manifest)
                    .map_err(|e| AppError::internal(e.to_string()))?,
            )
            .map_err(io_error)?;
            for slice in &manifest.slices {
                zip.start_file(&slice.filename, options)
                    .map_err(zip_error)?;
                let mut png = std::fs::File::open(
                    root.join(manifest.revision.to_string())
                        .join("png")
                        .join(&slice.filename),
                )
                .map_err(io_error)?;
                std::io::copy(&mut png, &mut zip).map_err(io_error)?;
            }
            zip.finish().map_err(zip_error)?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(e.to_string()))
        .and_then(|result| result);
        if let Err(error) = exported {
            let _ = fs::remove_file(&result).await;
            return Err(error);
        }
        Ok(result)
    }

    pub async fn reupload_library(
        &self,
        account: Uuid,
        id: Uuid,
        source: PathBuf,
    ) -> Result<LibraryStudy, AppError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("library:{account}"))
            .execute(tx.as_mut())
            .await?;
        let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM anatomy_image_library WHERE account_id=$1 AND status IN ('queued','processing','encoding')").bind(account).fetch_one(tx.as_mut()).await?;
        if active >= 2 {
            return Err(AppError::rate_limited(
                "Wait for an active library conversion to finish",
            ));
        }
        let previous: LibraryStudy = sqlx::query_as("SELECT id,name,modality_type,status,revision,slice_count,progress,error_message FROM anatomy_image_library WHERE account_id=$1 AND id=$2 FOR UPDATE").bind(account).bind(id).fetch_optional(tx.as_mut()).await?.ok_or_else(|| AppError::not_found("Library study not found"))?;
        if !matches!(previous.status.as_str(), "editable" | "ready") {
            return Err(AppError::Conflict(
                "Wait for the current conversion to finish".into(),
            ));
        }
        let manifest: Json<LibraryManifest> =
            sqlx::query_scalar("SELECT manifest FROM anatomy_image_library WHERE id=$1")
                .bind(id)
                .fetch_one(tx.as_mut())
                .await?;
        let manifest = manifest.0;
        let reserved = sqlx::query("UPDATE anatomy_image_library SET status='encoding',progress=0,error_message=NULL WHERE account_id=$1 AND id=$2 AND revision=$3 AND status IN ('editable','ready')")
            .bind(account).bind(id).bind(manifest.revision).execute(tx.as_mut()).await?;
        if reserved.rows_affected() != 1 {
            return Err(AppError::Conflict("Study is already being updated".into()));
        }
        tx.commit().await?;
        let service = self.clone();
        tokio::spawn(async move {
            let result = service.encode_library(account, id, manifest, &source).await;
            let _ = fs::remove_file(&source).await;
            if let Err(error) = result {
                tracing::warn!(%id, %error, "edited package rejected");
                let message = match error {
                    AppError::BadRequest(message) | AppError::Conflict(message) => message,
                    _ => "Image conversion failed; the previous revision is unchanged.".into(),
                };
                let _ = sqlx::query("UPDATE anatomy_image_library SET status=$2,error_message=$3,progress=100,updated_at=NOW() WHERE id=$1 AND status='encoding'")
                    .bind(id).bind(previous.status).bind(message).execute(&service.pool).await;
            }
        });
        self.get_library(account, id).await
    }

    async fn encode_library(
        &self,
        account: Uuid,
        id: Uuid,
        mut manifest: LibraryManifest,
        source: &Path,
    ) -> Result<(), AppError> {
        let _permit = self
            .ingest_gate
            .acquire()
            .await
            .map_err(|_| AppError::internal("Import queue unavailable"))?;
        let root = self.library_root(account, id);
        // Work in a fresh staging directory; a failed package never replaces a revision.
        let staging = root.join(format!("staging-{}", Uuid::new_v4()));
        let staging_clone = staging.clone();
        let source = source.to_path_buf();
        let expected = manifest.clone();
        let result = tokio::task::spawn_blocking(move || {
            validate_and_encode(&source, &staging_clone, &expected)
        })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
        if let Err(error) = result {
            let _ = fs::remove_dir_all(&staging).await;
            return Err(error);
        }
        let previous_revision = manifest.revision;
        manifest.revision += 1;
        let final_path = root.join(manifest.revision.to_string());
        // Only this reserved writer can own the unreferenced next revision.
        // Clean up a pre-commit revision left by an interrupted encoding.
        if fs::try_exists(&final_path).await.map_err(io_error)? {
            fs::remove_dir_all(&final_path).await.map_err(io_error)?;
        }
        if let Err(error) = fs::rename(&staging, &final_path).await {
            let _ = fs::remove_dir_all(&staging).await;
            return Err(io_error(error));
        }
        let saved = sqlx::query("UPDATE anatomy_image_library SET manifest=$2,revision=$3,status='ready',progress=100,error_message=NULL,updated_at=NOW() WHERE id=$1 AND status='encoding' AND revision=$4")
            .bind(id).bind(Json(&manifest)).bind(manifest.revision).bind(previous_revision).execute(&self.pool).await;
        match saved {
            Ok(result) if result.rows_affected() == 1 => (),
            Ok(_) => {
                let _ = fs::remove_dir_all(&final_path).await;
                return Err(AppError::Conflict(
                    "Study revision changed during conversion".into(),
                ));
            }
            // A lost database acknowledgement does not prove the update failed.
            // Keep the complete revision; the next reserved writer can remove it
            // if it is unreferenced, but a committed revision must never lose files.
            Err(error) => return Err(error.into()),
        }
        Ok(())
    }

    pub async fn attach_library(
        &self,
        account: Uuid,
        user: &str,
        id: Uuid,
        input: AttachLibraryInput,
    ) -> Result<ZoneModality, AppError> {
        self.ensure_zone_exists(account, input.zone_id).await?;
        let study = self.get_library(account, id).await?;
        if study.status != "ready" || study.revision != input.revision {
            return Err(AppError::Conflict(
                "Select the latest ready library revision".into(),
            ));
        }
        let manifest = self.library_manifest(account, id).await?;
        let requested_kind = normalize_modality_type(&input.modality_type)?;
        if manifest.revision != input.revision {
            return Err(AppError::Conflict(
                "Select the latest ready library revision".into(),
            ));
        }
        if requested_kind != manifest.modality_type {
            return Err(AppError::bad_request(
                "Library study must match the selected modality type",
            ));
        }
        let name = normalize_required_name(&input.name, "Modality name is required")?;
        let mut tx = self.pool.begin().await?;
        let family = self
            .resolve_modality_family_for_create(
                &mut tx,
                account,
                input.zone_id,
                user,
                input.family_id,
                &name,
                &requested_kind,
                input.thumbnail_url.as_deref(),
                None,
            )
            .await?;
        if family.modality_type != manifest.modality_type {
            return Err(AppError::bad_request(
                "Library study does not match this modality family",
            ));
        }
        let weighting = normalize_weighting_code_for_modality_type(
            &family.modality_type,
            input.weighting_code,
        )?;
        let slug = self
            .allocate_modality_slug(input.zone_id, &family.name)
            .await?;
        let modality = self
            .repo
            .create_zone_modality(
                tx.as_mut(),
                input.zone_id,
                family.id,
                user,
                &slug,
                &family.name,
                &family.modality_type,
                weighting.as_deref(),
                input.thumbnail_url.as_deref(),
                "library",
                Some(&study.name),
                manifest.slices.len() as i32,
                "ready",
                None,
            )
            .await?;
        let modality_id =
            Uuid::parse_str(&modality.id).map_err(|e| AppError::internal(e.to_string()))?;
        let job = Uuid::new_v4();
        sqlx::query("INSERT INTO anatomy_modality_ingest_jobs(id,modality_id,source_kind,source_label,source_file_count,status,summary_json,completed_at,created_by_user_id,updated_by_user_id) VALUES($1,$2,'library',$3,$4,'ready_for_edit',$5,NOW(),$6,$6)")
            .bind(job).bind(modality_id).bind(&study.name).bind(manifest.slices.len() as i32).bind(json!({"progressPercent":100,"libraryStudyId":id,"libraryRevision":manifest.revision})).bind(user).execute(tx.as_mut()).await?;
        let derived = self
            .storage_root
            .join("playground")
            .join("derived")
            .join(job.to_string());
        let library_images = self
            .library_root(account, id)
            .join(manifest.revision.to_string())
            .join("avif");
        let copy_result = async {
            fs::create_dir_all(&derived).await.map_err(io_error)?;
            let mut assets = Vec::new();
            let mut asset_ids = BTreeMap::new();
            for (index, slice) in manifest.slices.iter().enumerate() {
                let asset_id = Uuid::new_v4();
                let filename = format!("{}.avif", slice.id);
                let path = derived.join(&filename);
                fs::copy(library_images.join(&filename), &path).await.map_err(io_error)?;
                fs::copy(library_images.parent().unwrap().join("png").join(&slice.filename), path.with_extension("png")).await.map_err(io_error)?;
                let bytes = fs::read(&path).await.map_err(io_error)?;
                let storage_key = storage_key_from_absolute(&self.storage_root, &path)?;
                let image_url = format!("/api/v1/playground/derived-assets/{asset_id}/image");
                sqlx::query("INSERT INTO anatomy_zone_modality_assets(id,modality_id,label,asset_kind,weighting_code,image_url,sort_order,ingest_job_id,storage_backend,storage_key,checksum,mime_type,size_bytes,width,height,series_uid,series_label,instance_uid,slice_index,orientation_code,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'local_disk',$9,$10,'image/avif',$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)")
                    .bind(asset_id).bind(modality_id).bind(&slice.series_label).bind(if manifest.volume.is_some() {"derived_slice"} else {"slice"}).bind(&weighting).bind(&image_url).bind(index as i32).bind(job).bind(storage_key).bind(sha256_hex(&bytes)).bind(bytes.len() as i64).bind(slice.width as i32).bind(slice.height as i32).bind(&slice.series_uid).bind(&slice.series_label).bind(&slice.instance_uid).bind(slice.slice_index).bind(&slice.orientation_code).bind(user).execute(tx.as_mut()).await?;
                asset_ids.insert(slice.id.to_string(), asset_id.to_string());
                assets.push(json!({"id":asset_id,"seriesUid":slice.series_uid,"seriesLabel":slice.series_label,"orientationCode":slice.orientation_code,"sliceIndex":slice.slice_index,"weightingCode":weighting}));
            }
            let cached: Vec<BuiltAtlasPage> = serde_json::from_slice(&fs::read(library_images.parent().unwrap().join("library-atlases.json")).await.map_err(io_error)?).map_err(|e| AppError::internal(e.to_string()))?;
            let mut atlas_pages = Vec::new();
            let mut atlas_frames = Vec::new();
            for (index, page) in cached.iter().enumerate() {
                let asset_id = Uuid::new_v4();
                let destination = derived.join(format!("atlas-{}.avif", index + 1));
                fs::copy(library_images.parent().unwrap().join(&page.storage_key), &destination).await.map_err(io_error)?;
                let frames = page.frames.iter().map(|frame| {
                    let id = asset_ids.get(&frame.asset_id).ok_or_else(|| AppError::internal("Library atlas slice mapping is incomplete"))?;
                    Ok(AtlasFrameMetadata { asset_id:id.clone(), ..frame.clone() })
                }).collect::<Result<Vec<_>,AppError>>()?;
                fs::write(destination.with_extension("json"), serde_json::to_vec(&AtlasPageMetadata { width:page.width,height:page.height,frames:frames.clone() }).map_err(|e| AppError::internal(e.to_string()))?).await.map_err(io_error)?;
                let image_url = format!("/api/v1/playground/derived-assets/{asset_id}/image");
                sqlx::query("INSERT INTO anatomy_zone_modality_assets(id,modality_id,label,asset_kind,image_url,sort_order,ingest_job_id,storage_backend,storage_key,checksum,mime_type,size_bytes,width,height,created_by_user_id,updated_by_user_id) VALUES($1,$2,'Atlas','atlas',$3,$4,$5,'local_disk',$6,$7,'image/avif',$8,$9,$10,$11,$11)")
                    .bind(asset_id).bind(modality_id).bind(&image_url).bind(index as i32).bind(job).bind(storage_key_from_absolute(&self.storage_root,&destination)?).bind(&page.checksum).bind(page.size_bytes).bind(page.width).bind(page.height).bind(user).execute(tx.as_mut()).await?;
                atlas_pages.push(ZoneModalityAtlasPage { id:asset_id.to_string(),image_url,width:page.width,height:page.height,slice_count:frames.len() });
                atlas_frames.extend(frames.into_iter().map(|frame| ZoneModalityAtlasFrame { asset_id:frame.asset_id,atlas_id:asset_id.to_string(),x:frame.x,y:frame.y,width:frame.width,height:frame.height }));
            }
            let mut payload = library_viewer_manifest(&manifest, &assets);
            payload["atlases"] = json!(atlas_pages);
            payload["atlasFrames"] = json!(atlas_frames);
            sqlx::query("INSERT INTO anatomy_viewer_manifests(modality_id,ingest_job_id,schema_version,manifest_json) VALUES($1,$2,$3,$4)")
                .bind(modality_id).bind(job).bind(if manifest.volume.is_some() {"mpr-1"} else {"draft-1"}).bind(payload).execute(tx.as_mut()).await?;
            sqlx::query("UPDATE anatomy_zone_modalities SET latest_ingest_job_id=$2,library_study_id=$3,cover_image_url=COALESCE(cover_image_url,$4) WHERE id=$1")
                .bind(modality_id).bind(job).bind(id).bind(assets.first().map(|a| format!("/api/v1/playground/derived-assets/{}/image",a["id"].as_str().unwrap_or_default()))).execute(tx.as_mut()).await?;
            Ok::<(), AppError>(())
        }.await;
        if let Err(error) = copy_result {
            let _ = fs::remove_dir_all(&derived).await;
            return Err(error);
        }
        // Do not remove snapshot files after an ambiguous commit acknowledgement.
        tx.commit().await?;
        self.notify_zone_modality_list_changed(account, input.zone_id);
        self.repo
            .get_zone_modality_detail(&self.pool, account, input.zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality not found"))
    }
}

fn convert_package(
    id: Uuid,
    kind: String,
    files: Vec<PreparedStudyFile>,
    output: PathBuf,
) -> Result<LibraryManifest, AppError> {
    let mut slices = Vec::new();
    let mut identities = BTreeSet::new();
    let mut mpr_sources = Vec::new();
    let mut mpr_series = BTreeSet::new();
    let mut input_frames = 0usize;
    for file in &files {
        if file.original_file_name.eq_ignore_ascii_case("DICOMDIR") {
            continue;
        }
        let object = open_file(&file.file_path)
            .map_err(|_| AppError::bad_request("ZIP contains an unreadable DICOM object"))?;
        let series = dicom_text(&object, "SeriesInstanceUID")
            .ok_or_else(|| AppError::bad_request("DICOM is missing SeriesInstanceUID"))?;
        let instance = dicom_text(&object, "SOPInstanceUID")
            .ok_or_else(|| AppError::bad_request("DICOM is missing SOPInstanceUID"))?;
        let frame_count = dicom_usize(&object, "NumberOfFrames").unwrap_or(1);
        input_frames = input_frames.saturating_add(frame_count);
        if frame_count == 0 || input_frames > MAX_SLICES {
            return Err(AppError::bad_request(
                "Study exceeds the 10,000-frame limit",
            ));
        }
        let rows = dicom_usize(&object, "Rows")
            .ok_or_else(|| AppError::bad_request("DICOM is missing image dimensions"))?;
        let columns = dicom_usize(&object, "Columns")
            .ok_or_else(|| AppError::bad_request("DICOM is missing image dimensions"))?;
        check_dimensions(columns as u32, rows as u32)?;
        if rows.saturating_mul(columns).saturating_mul(frame_count) > MAX_MPR_SOURCE_VOXELS {
            return Err(AppError::bad_request(
                "Multi-frame DICOM exceeds the decoded pixel limit",
            ));
        }
        for frame in 0..frame_count {
            if !identities.insert((instance.clone(), frame)) {
                return Err(AppError::bad_request(
                    "Duplicate DICOM instance/frame found",
                ));
            }
        }
        if kind == "mpr" {
            mpr_series.insert(series.clone());
            for frame in 0..frame_count {
                let spatial =
                    read_mpr_source_slice(&object, file, frame as u32).ok_or_else(|| {
                        AppError::bad_request(
                            "Every MPR frame needs valid position, orientation and spacing",
                        )
                    })?;
                mpr_sources.push(spatial);
            }
            continue;
        }
        let decoded = object.decode_pixel_data().map_err(|_| {
            AppError::bad_request(
                "Unsupported or invalid DICOM pixel encoding; no frames were imported",
            )
        })?;
        if decoded.number_of_frames() as usize != frame_count {
            return Err(AppError::bad_request(
                "DICOM frame count does not match decoded data",
            ));
        }
        for frame in 0..frame_count {
            let image = decoded
                .to_dynamic_image(frame as u32)
                .map_err(|_| {
                    AppError::bad_request(
                        "A DICOM frame could not be decoded; no frames were imported",
                    )
                })?
                .to_rgba8();
            check_dimensions(image.width(), image.height())?;
            let slice_id = Uuid::new_v4();
            let filename = format!("{slice_id}.png");
            std::fs::write(
                output.join(&filename),
                encode_png(&image).map_err(|e| AppError::internal(e.to_string()))?,
            )
            .map_err(io_error)?;
            let position = frame_geometry::<3>(
                &object,
                frame as u32,
                "PlanePositionSequence",
                "ImagePositionPatient",
            );
            let orientation = frame_geometry::<6>(
                &object,
                frame as u32,
                "PlaneOrientationSequence",
                "ImageOrientationPatient",
            );
            let orientation_code = orientation
                .and_then(|values| {
                    normalize3(cross3(
                        [values[0], values[1], values[2]],
                        [values[3], values[4], values[5]],
                    ))
                })
                .map(|normal| {
                    let axis = (0..3)
                        .max_by(|&a, &b| normal[a].abs().total_cmp(&normal[b].abs()))
                        .unwrap_or(2);
                    ["sagittal", "coronal", "axial"][axis].to_string()
                });
            slices.push(LibrarySlice {
                id: slice_id,
                filename,
                width: image.width(),
                height: image.height(),
                series_uid: series.clone(),
                instance_uid: Some(instance.clone()),
                instance_number: dicom_text(&object, "InstanceNumber").and_then(|v| v.parse().ok()),
                frame_index: frame as u32,
                slice_index: 0,
                orientation_code,
                image_position: position,
                image_orientation: orientation,
                pixel_spacing: frame_geometry(
                    &object,
                    frame as u32,
                    "PixelMeasuresSequence",
                    "PixelSpacing",
                ),
                series_label: dicom_text(&object, "SeriesDescription")
                    .unwrap_or_else(|| "Series".into()),
            });
        }
    }
    let volume = if kind == "mpr" {
        if mpr_series.len() != 1 {
            return Err(AppError::bad_request(
                "MPR requires one spatial series. Split a multi-series ZIP into separate library studies.",
            ));
        }
        let expected_count = mpr_sources.len();
        let validated = validate_and_sort_mpr_series(mpr_sources)
            .map_err(|e| AppError::bad_request(e.to_string()))?;
        if validated.len() != expected_count {
            return Err(AppError::bad_request(
                "MPR series contains duplicate positions or inconsistent geometry; no slices were dropped",
            ));
        }
        let (sender, mut receiver) = mpsc::unbounded_channel();
        // Drain progress while the CPU-bound existing reconstruction runs.
        let progress_task = std::thread::spawn(move || while receiver.blocking_recv().is_some() {});
        let result = derive_mpr_volume_and_slices(&output, &output, &files, None, &sender);
        drop(sender);
        let _ = progress_task.join();
        let result = result.map_err(|e| AppError::bad_request(e.to_string()))?;
        for build in result.slice_builds {
            let candidate = build.candidate;
            let slice_id = Uuid::new_v4();
            let filename = format!("{slice_id}.png");
            std::fs::rename(output.join(&candidate.storage_key), output.join(&filename))
                .map_err(io_error)?;
            slices.push(LibrarySlice {
                id: slice_id,
                filename,
                width: candidate.width as u32,
                height: candidate.height as u32,
                series_uid: candidate.series_uid.unwrap_or_default(),
                series_label: candidate.series_label.unwrap_or_default(),
                instance_uid: None,
                instance_number: None,
                frame_index: 0,
                slice_index: candidate.slice_index,
                orientation_code: candidate.orientation_code,
                image_position: None,
                image_orientation: None,
                pixel_spacing: None,
            });
        }
        Some(result.geometry)
    } else {
        // Sort each series by patient-space projection only if every frame has
        // consistent orientation. Otherwise retain instance/frame identity.
        sort_slices(&mut slices);
        None
    };
    if slices.is_empty() || slices.len() > MAX_SLICES {
        return Err(AppError::bad_request(
            "No supported frames or too many slices",
        ));
    }
    name_slice_files(&output, &mut slices)?;
    Ok(LibraryManifest {
        schema_version: "image-library-1".into(),
        study_id: id,
        revision: 1,
        modality_type: kind,
        coordinate_system: "DICOM_LPS".into(),
        volume,
        slices,
    })
}

fn sort_slices(slices: &mut [LibrarySlice]) {
    let mut normals: BTreeMap<String, Option<[f64; 3]>> = BTreeMap::new();
    for slice in slices.iter() {
        let normal = slice
            .image_orientation
            .and_then(|v| normalize3(cross3([v[0], v[1], v[2]], [v[3], v[4], v[5]])));
        let entry = normals.entry(slice.series_uid.clone()).or_insert(normal);
        if slice.image_position.is_none()
            || normal.is_none()
            || entry.is_none()
            || dot3(entry.unwrap_or([0.; 3]), normal.unwrap_or([0.; 3])) < 0.999
        {
            *entry = None;
        }
    }
    slices.sort_by(|a, b| {
        a.series_uid
            .cmp(&b.series_uid)
            .then_with(|| {
                if let Some(normal) = normals.get(&a.series_uid).copied().flatten() {
                    dot3(a.image_position.unwrap_or([0.; 3]), normal)
                        .total_cmp(&dot3(b.image_position.unwrap_or([0.; 3]), normal))
                } else {
                    a.instance_number.cmp(&b.instance_number)
                }
            })
            .then_with(|| a.instance_uid.cmp(&b.instance_uid))
            .then_with(|| a.frame_index.cmp(&b.frame_index))
    });
    let mut indices: BTreeMap<String, i32> = BTreeMap::new();
    for slice in slices {
        let index = indices.entry(slice.series_uid.clone()).or_default();
        slice.slice_index = *index;
        *index += 1;
    }
}

/// Names each PNG `<plane>_<NNNN>_<id>.png` (1-based, as the viewer counts) so
/// an editor lists slices in order. Series sharing a plane add an `sN_` prefix.
fn name_slice_files(output: &Path, slices: &mut [LibrarySlice]) -> Result<(), AppError> {
    fn plane(slice: &LibrarySlice) -> String {
        slice
            .orientation_code
            .as_deref()
            .filter(|code| !code.is_empty() && code.bytes().all(|b| b.is_ascii_lowercase()))
            .unwrap_or("slice")
            .to_string()
    }
    let mut series_by_plane: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for slice in slices.iter() {
        series_by_plane
            .entry(plane(slice))
            .or_default()
            .insert(slice.series_uid.clone());
    }
    let width = slices.len().to_string().len().max(4);
    for slice in slices.iter_mut() {
        let plane = plane(slice);
        let series = &series_by_plane[&plane];
        let prefix = match series.iter().position(|uid| *uid == slice.series_uid) {
            Some(ordinal) if series.len() > 1 => format!("s{}_", ordinal + 1),
            _ => String::new(),
        };
        let filename = format!(
            "{prefix}{plane}_{:0width$}_{}.png",
            slice.slice_index + 1,
            slice.id
        );
        std::fs::rename(output.join(&slice.filename), output.join(&filename)).map_err(io_error)?;
        slice.filename = filename;
    }
    Ok(())
}

fn check_dimensions(width: u32, height: u32) -> Result<(), AppError> {
    if width == 0
        || height == 0
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err(AppError::bad_request(
            "Image dimensions exceed the supported limits",
        ));
    }
    Ok(())
}

fn validate_and_encode(
    source: &Path,
    output: &Path,
    expected: &LibraryManifest,
) -> Result<(), AppError> {
    let file = std::fs::File::open(source).map_err(io_error)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|_| AppError::bad_request("Invalid ZIP package"))?;
    if archive.len() > MAX_SLICES + 20 {
        return Err(AppError::bad_request("Too many package entries"));
    }
    let mut names = BTreeSet::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(zip_error)?;
        if entry.is_dir() {
            continue;
        }
        if entry.is_symlink()
            || entry.enclosed_name().is_none()
            || !names.insert(entry.name().to_string())
        {
            return Err(AppError::bad_request(
                "Duplicate or invalid package filenames",
            ));
        }
        total = total.saturating_add(entry.size());
        if total > MAX_EXPANDED_BYTES {
            return Err(AppError::bad_request("Expanded package exceeds 2 GB"));
        }
    }
    let mut required: BTreeSet<String> =
        expected.slices.iter().map(|s| s.filename.clone()).collect();
    required.insert("manifest.json".into());
    if names != required {
        return Err(AppError::bad_request(
            "Keep manifest.json and every PNG filename unchanged. Missing or extra images were found.",
        ));
    }
    let mut manifest_file = archive.by_name("manifest.json").map_err(zip_error)?;
    if manifest_file.size() > 16 * 1024 * 1024 {
        return Err(AppError::bad_request("Manifest is too large"));
    }
    let mut metadata = Vec::new();
    (&mut manifest_file)
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut metadata)
        .map_err(io_error)?;
    drop(manifest_file);
    let supplied: LibraryManifest = serde_json::from_slice(&metadata)
        .map_err(|_| AppError::bad_request("Invalid edit manifest"))?;
    if serde_json::to_value(&supplied).ok() != serde_json::to_value(expected).ok() {
        return Err(AppError::Conflict("The manifest changed or is from an older study revision. Download a fresh editing package.".into()));
    }
    std::fs::create_dir_all(output.join("png")).map_err(io_error)?;
    std::fs::create_dir_all(output.join("avif")).map_err(io_error)?;
    for slice in &expected.slices {
        let mut entry = archive.by_name(&slice.filename).map_err(zip_error)?;
        if entry.size() > 256 * 1024 * 1024 {
            return Err(AppError::bad_request("PNG exceeds the image size limit"));
        }
        let mut bytes = Vec::new();
        (&mut entry)
            .take(256 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(io_error)?;
        let mut reader =
            image::ImageReader::with_format(Cursor::new(&bytes), image::ImageFormat::Png);
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        limits.max_alloc = Some(256 * 1024 * 1024);
        reader.limits(limits);
        let image = reader
            .decode()
            .map_err(|_| AppError::bad_request("A slice is not a valid PNG image"))?;
        if image.width() != slice.width || image.height() != slice.height {
            return Err(AppError::bad_request(format!(
                "{} changed dimensions. Do not crop, resize or rotate slices.",
                slice.filename
            )));
        }
        let rgba = image.to_rgba8();
        if rgba.pixels().any(|pixel| pixel[3] != 255) {
            return Err(AppError::bad_request(
                "Slices must remain opaque; flatten transparency before reupload",
            ));
        }
        std::fs::write(output.join("png").join(&slice.filename), &bytes).map_err(io_error)?;
        std::fs::write(
            output.join("avif").join(format!("{}.avif", slice.id)),
            encode_avif(&rgba).map_err(|e| AppError::internal(e.to_string()))?,
        )
        .map_err(io_error)?;
    }
    write_library_atlases(output, expected)?;
    Ok(())
}

fn write_library_atlases(output: &Path, manifest: &LibraryManifest) -> Result<(), AppError> {
    let width = manifest.slices.iter().map(|s| s.width).max().unwrap_or(1);
    let height = manifest.slices.iter().map(|s| s.height).max().unwrap_or(1);
    let columns = (MAX_ATLAS_PAGE_EDGE / width).clamp(1, MAX_ATLAS_PAGE_COLUMNS as u32);
    let rows = (MAX_ATLAS_PAGE_EDGE / height).max(1);
    let chunk_size = (columns as usize * rows as usize).clamp(1, MAX_ATLAS_SLICES_PER_PAGE);
    let mut pages = Vec::new();
    for (index, slices) in manifest.slices.chunks(chunk_size).enumerate() {
        let atlas_root = output.join("atlases").join(index.to_string());
        std::fs::create_dir_all(&atlas_root).map_err(io_error)?;
        let images = slices
            .iter()
            .map(|slice| {
                let image = image::open(output.join("png").join(&slice.filename))
                    .map_err(|e| AppError::internal(e.to_string()))?
                    .to_rgba8();
                Ok(AtlasSourceSlice {
                    asset_id: slice.id.to_string(),
                    image,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        pages
            .extend(write_atlas_pages(output, &atlas_root, images, false).map_err(AppError::from)?);
    }
    std::fs::write(
        output.join("library-atlases.json"),
        serde_json::to_vec(&pages).map_err(|e| AppError::internal(e.to_string()))?,
    )
    .map_err(io_error)?;
    Ok(())
}

// Apply physical slab exclusions to the edited plane images themselves, never
// re-rendering from the original DICOM and discarding the user's image edits.
pub(super) fn derive_library_mpr_exclusions(
    storage: &Path,
    output: &Path,
    assets: &[ZoneModalityAsset],
    excluded: &MprExcludedSlices,
    geometry: MprVolumeGeometry,
) -> anyhow::Result<MprDerivationResult> {
    let [nx, ny, nz] = geometry.dimensions;
    let mut builds = Vec::new();
    let mut counts = BTreeMap::new();
    for asset in assets.iter().filter(|a| a.asset_kind == "derived_slice") {
        let plane = asset
            .orientation_code
            .as_deref()
            .context("Missing library plane")?;
        let slice = usize::try_from(asset.slice_index.context("Missing library slice index")?)?;
        if excluded.for_plane(plane).contains(&slice) {
            continue;
        }
        let source = storage
            .join(
                asset
                    .storage_key
                    .as_deref()
                    .context("Missing library image")?,
            )
            .with_extension("png");
        let mut image = image::open(source)?.to_rgba8();
        let expected = match plane {
            "axial" => (nx, ny),
            "coronal" => (nx, nz),
            "sagittal" => (ny, nz),
            _ => anyhow::bail!("Invalid library plane"),
        };
        if (image.width() as usize, image.height() as usize) != expected {
            anyhow::bail!("Library image dimensions do not match volume geometry");
        }
        mask_library_plane(&mut image, plane, slice, geometry.dimensions, excluded);
        let destination = output.join(format!("{}.avif", asset.id));
        let bytes = encode_avif(&image)?;
        std::fs::write(&destination, &bytes)?;
        std::fs::write(destination.with_extension("png"), encode_png(&image)?)?;
        *counts.entry(plane.to_string()).or_insert(0usize) += 1;
        builds.push(DerivedSliceBuild {
            candidate: DerivedSliceCandidate {
                source_relative_path: None,
                storage_key: storage_key_from_absolute(storage, &destination)
                    .map_err(anyhow::Error::from)?,
                checksum: sha256_hex(&bytes),
                size_bytes: bytes.len() as i64,
                width: image.width() as i32,
                height: image.height() as i32,
                series_uid: asset.series_uid.clone(),
                series_label: asset.series_label.clone(),
                instance_uid: asset.instance_uid.clone(),
                slice_index: slice as i32,
                weighting_code: asset.weighting_code.clone(),
                orientation_code: Some(plane.into()),
            },
            atlas_source_image: None,
        });
    }
    Ok(MprDerivationResult {
        slice_builds: builds,
        geometry,
        plane_asset_counts: counts,
    })
}

fn mask_library_plane(
    image: &mut RgbaImage,
    plane: &str,
    slice: usize,
    dimensions: [usize; 3],
    excluded: &MprExcludedSlices,
) {
    let nz = dimensions[2];
    for (screen_x, screen_y, pixel) in image.enumerate_pixels_mut() {
        let (x, y, z) = match plane {
            "axial" => (screen_x as usize, screen_y as usize, slice),
            "coronal" => (screen_x as usize, slice, nz - 1 - screen_y as usize),
            "sagittal" => (slice, screen_x as usize, nz - 1 - screen_y as usize),
            _ => return,
        };
        if excluded.sagittal.contains(&x)
            || excluded.coronal.contains(&y)
            || excluded.axial.contains(&z)
        {
            *pixel = Rgba([0, 0, 0, 255]);
        }
    }
}

fn library_viewer_manifest(
    manifest: &LibraryManifest,
    assets: &[serde_json::Value],
) -> serde_json::Value {
    if let Some(volume) = &manifest.volume {
        let mut planes = serde_json::Map::new();
        for plane in ["axial", "coronal", "sagittal"] {
            let mut rows: Vec<_> = assets
                .iter()
                .filter(|a| a["orientationCode"] == plane)
                .collect();
            rows.sort_by_key(|a| a["sliceIndex"].as_i64());
            planes.insert(plane.into(), json!({"sliceCount":rows.len(),"assetIds":rows.iter().map(|a| &a["id"]).collect::<Vec<_>>()}));
        }
        json!({"schemaVersion":"mpr-1","coordinateSystem":"DICOM_LPS","volume":volume,"planes":planes,"excludedSlices":{"axial":[],"coronal":[],"sagittal":[]},"atlases":[],"atlasFrames":[]})
    } else {
        let mut series: BTreeMap<String, Vec<&serde_json::Value>> = BTreeMap::new();
        for asset in assets {
            series
                .entry(asset["seriesUid"].as_str().unwrap_or_default().into())
                .or_default()
                .push(asset);
        }
        let weightings: BTreeSet<_> = assets
            .iter()
            .filter_map(|a| a["weightingCode"].as_str())
            .collect();
        json!({"schemaVersion":"draft-1","sliceCount":assets.len(),"series":series.values().map(|rows| json!({"seriesUid":rows[0]["seriesUid"],"seriesLabel":rows[0]["seriesLabel"],"orientationCode":rows[0]["orientationCode"],"weightingCode":rows[0]["weightingCode"],"sliceCount":rows.len(),"assetIds":rows.iter().map(|a| &a["id"]).collect::<Vec<_>>()})).collect::<Vec<_>>(),"atlases":[],"atlasFrames":[],"weightings":weightings})
    }
}

fn io_error(error: std::io::Error) -> AppError {
    AppError::internal(error.to_string())
}
fn zip_error(error: zip::result::ZipError) -> AppError {
    AppError::bad_request(format!("Cannot read image package: {error}"))
}

#[cfg(test)]
#[path = "library_tests.rs"]
mod tests;
